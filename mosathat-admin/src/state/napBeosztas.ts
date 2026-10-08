import { useEffect, useState } from 'react'

import { useApp } from './AppContext'
import { munkakNapra, negyedekbol, percEjfeltol, type Munka, type Negyed } from '../lib/beosztas'
import { HELYORZO } from '../lib/flotta'
import { maStr } from '../lib/format'
import type { DataSource } from '../data/source'
import type { DayBooking } from '../lib/types'

// ---------------------------------------------------------------------------
//  Egy nap beosztásának alapadatai — a „befér-e" számításhoz
//
//  A nap negyedórái (hány hely), és a foglalásaiból a munkák. Ebből a
//  lib/befer.ts kiszámolja, befér-e még egy autó, és milyen időpontokban.
//
//  `kihagy`: szerkesztésnél a szerkesztett foglalás ne számítson bele (ő maga
//  az „új" autó).
//
//  Megjegyzés a publikus oldalhoz: itt a bejelentkezett felhasználó jogával
//  kérdezzük le a nap foglalásait. A publikus oldal ezt nem teheti (más
//  ügyfelek adatai) — ott ugyanez a számítás egy szerverfüggvényben fut, és
//  csak az eredményt (szabad / tele, időpontok) adja ki.
// ---------------------------------------------------------------------------

export interface NapBeosztas {
  datum: string
  negyedek: Negyed[]
  munkak: Munka[]
  /** Ha ma van: perc éjféltől (a múltba nem kerülhet új munka). */
  most: number | null
  nyit: number
  zar: number
}

/** A sávon / az üzenetben látszó név: rendszám, vagy a cég és a sorszám. */
export function munkaCimke(b: DayBooking): string {
  const r = (b.plate_raw ?? '').trim().toUpperCase()
  if (r && r !== HELYORZO) return r
  if (b.fleet_index) return `${b.company_name ?? 'Flotta'} ${b.fleet_index}.`
  return b.company_name || b.customer_name || 'névtelen'
}

export async function napBeosztasBetolt(data: DataSource, datum: string,
                                        kihagy: string | null = null): Promise<NapBeosztas> {
  const [foglalasok, savok] = await Promise.all([data.getDay(datum), data.getDayLanes(datum)])
  const negyedek = negyedekbol(savok)
  const nyit = negyedek[0]?.tol ?? 0
  const zar = negyedek[negyedek.length - 1]?.ig ?? 0
  const most = datum === maStr() ? percEjfeltol(new Date().toISOString()) : null
  const { munkak } = munkakNapra(foglalasok.filter((b) => b.id !== kihagy), datum, nyit, zar,
    (b) => munkaCimke(b as DayBooking), most)
  return { datum, negyedek, munkak, most, nyit, zar }
}

/** Ugyanez hookként: a nap adatai, újratöltve, ha a nap vagy bármi változik. */
export function useNapBeosztas(datum: string | null, kihagy: string | null = null): NapBeosztas | null {
  const { data, revision } = useApp()
  const [adat, setAdat] = useState<NapBeosztas | null>(null)
  useEffect(() => {
    if (!datum) { setAdat(null); return }
    let el = true
    napBeosztasBetolt(data, datum, kihagy)
      .then((a) => { if (el) setAdat(a) })
      .catch(() => { if (el) setAdat(null) })
    return () => { el = false }
  }, [data, datum, kihagy, revision])
  return adat?.datum === datum ? adat : null
}
