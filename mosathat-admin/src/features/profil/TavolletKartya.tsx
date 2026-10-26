import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg, napCim, napokRovid, napRovidCim } from '../../lib/format'
import { valtozasSzoveg } from '../../lib/munkaido'
import type { AbsenceRow, VacationRow } from '../../lib/types'
import { useKerdes } from '../common/Kerdes'

export type Tavollet =
  | { tipus: 'szabadsag'; v: VacationRow }
  | { tipus: 'valtozas'; a: AbsenceRow }

const kezdet = (t: Tavollet) => (t.tipus === 'szabadsag' ? t.v.from_day : t.a.day).slice(0, 10)
const azon = (t: Tavollet) => (t.tipus === 'szabadsag' ? t.v.id : t.a.id)

export default function TavolletKartya({ cim, leiras, rev = 0, szerkesztett = null, onModosit, onTorolve, osztaly }: {
  cim: string
  leiras?: string
  rev?: number
  szerkesztett?: string | null
  onModosit?: (t: Tavollet) => void
  onTorolve?: (t: Tavollet) => void
  osztaly?: string
}) {
  const { data, refresh } = useApp()
  const [lista, setLista] = useState<Tavollet[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [kerdesAblak, kerdez] = useKerdes()

  const betolt = useCallback(async () => {
    try {
      const [valtozasok, szabadsagok] = await Promise.all([data.listAbsences(), data.listVacations()])
      const osszes: Tavollet[] = [
        ...szabadsagok.map((v) => ({ tipus: 'szabadsag' as const, v })),
        ...valtozasok.map((a) => ({ tipus: 'valtozas' as const, a })),
      ]
      osszes.sort((x, y) => kezdet(x).localeCompare(kezdet(y)) || (x.tipus === 'szabadsag' ? -1 : 1))
      setLista(osszes)
      setHiba(null)
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
  }, [data])

  useEffect(() => { void betolt() }, [betolt, rev])
  useEffect(() => data.subscribe(() => void betolt()), [data, betolt])

  async function torol(t: Tavollet) {
    const szoveg = t.tipus === 'szabadsag'
      ? `${t.v.sajat ? 'Szabadság' : `${t.v.staff_name} szabadsága`}: ${napokRovid(t.v.from_day, t.v.to_day)}`
      : `${napCim(t.a.day.slice(0, 10))}: ${t.a.sajat ? '' : `${t.a.staff_name}, `}${valtozasSzoveg(t.a)}`
    if (!(await kerdez({ cim: 'Biztosan törlöd?', szoveg, igen: 'Törlés', nem: 'Mégse', veszelyes: true }))) return
    try {
      if (t.tipus === 'szabadsag') await data.deleteVacation(t.v.id)
      else await data.deleteAbsence(t.a.id)
      onTorolve?.(t)
      await betolt()
      refresh()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
  }

  return (
    <section className={`panel tavollet-kartya${osztaly ? ` ${osztaly}` : ''}`}>
      <h3>{cim}</h3>
      <div className="panel-torzs">
        {leiras && <p className="halk tavollet-leiras">{leiras}</p>}
        {hiba && <div className="hibauzenet">{hiba}</div>}
        {lista === null && !hiba && <div className="betolt">Betöltés…</div>}
        {lista?.length === 0 && <div className="ures">Nincs beírt szabadság vagy munkaidő-változás a mai naptól.</div>}
        <ul className="valtozas-lista">
          {lista?.map((t) => {
            const sajat = t.tipus === 'szabadsag' ? t.v.sajat : t.a.sajat
            const nev = t.tipus === 'szabadsag' ? t.v.staff_name : t.a.staff_name
            const megj = t.tipus === 'szabadsag' ? t.v.note : t.a.note
            return (
              <li key={`${t.tipus}-${azon(t)}`} data-tipus={t.tipus} data-szerk={szerkesztett === azon(t) || undefined}>
                <div className="valtozas-szoveg">
                  <strong>
                    {t.tipus === 'valtozas' ? napRovidCim(t.a.day.slice(0, 10))
                      : t.v.from_day.slice(0, 10) === t.v.to_day.slice(0, 10) ? napRovidCim(t.v.from_day.slice(0, 10))
                        : napokRovid(t.v.from_day, t.v.to_day)}
                  </strong>
                  <span>
                    <span className="tavollet-jel" data-tipus={t.tipus}>
                      {t.tipus === 'szabadsag' ? 'Szabadság' : 'Munkaidő'}
                    </span>
                    {!sajat && <span className="tavollet-nev">{nev}</span>}
                    {t.tipus === 'valtozas' && <span>{valtozasSzoveg(t.a)}</span>}
                    {megj && <span className="halk"> · {megj}</span>}
                  </span>
                </div>
                {onModosit && (
                  <div className="valtozas-gombok">
                    <button className="btn btn-kicsi" onClick={() => onModosit(t)}>Módosítás</button>
                    <button className="btn btn-kicsi btn-veszelyes" onClick={() => void torol(t)}>Törlés</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
      {kerdesAblak}
    </section>
  )
}
