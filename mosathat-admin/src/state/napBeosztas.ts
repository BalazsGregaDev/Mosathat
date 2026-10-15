import { useEffect, useState } from 'react'

import { useApp, useRevizio } from './AppContext'
import { munkakNapra, negyedekbol, type Munka, type Negyed } from '../lib/beosztas'
import { HELYORZO } from '../lib/flotta'
import { maStr, mostPerc } from '../lib/format'
import type { DataSource } from '../data/source'
import type { DayBooking } from '../lib/types'

export interface NapBeosztas {
  datum: string
  negyedek: Negyed[]
  munkak: Munka[]
  most: number | null
  nyit: number
  zar: number
}

export function munkaCimke(b: Pick<DayBooking, 'plate_raw' | 'fleet_index' | 'company_name' | 'customer_name'>): string {
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
  const most = datum === maStr() ? mostPerc() : null
  const { munkak } = munkakNapra(foglalasok.filter((b) => b.id !== kihagy), datum, nyit, zar,
    (b) => munkaCimke(b as DayBooking), most)
  return { datum, negyedek, munkak, most, nyit, zar }
}

export function useNapBeosztas(datum: string | null, kihagy: string | null = null): NapBeosztas | null {
  const { data } = useApp()
  const revision = useRevizio()
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
