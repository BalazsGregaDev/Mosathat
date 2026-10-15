import { useEffect, useMemo, useState } from 'react'
import Kerdojel from './Kerdojel'
import { flottaCsoportosit } from '../../lib/flotta'

import { useApp, useRevizio } from '../../state/AppContext'
import {
  azonosHonap, hetHetfoje, hetSzam, hibaSzoveg, honapElseje, honapPlusz, maE, napKulonbseg, napPlusz, ora,
} from '../../lib/format'
import { STATUS_LABEL, type DayBooking, type VacationRow } from '../../lib/types'
import { hetiSavok, hetiSzabadsagok, tobbnaposE } from '../../lib/savok'
import { azonosito } from './MiniKartya'

const FEJ = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V']

export default function MonthView({ nap, onNapra, onHetre }: {
  nap: string
  onNapra: (nap: string) => void
  onHetre: (nap: string) => void
}) {
  const { data, refresh } = useApp()
  const revision = useRevizio()
  const elseje = honapElseje(nap)

  const { elso, hetek } = useMemo(() => {
    const kezd = hetHetfoje(elseje)
    const utolsoNap = napPlusz(honapPlusz(elseje, 1), -1)
    const veg = napPlusz(hetHetfoje(utolsoNap), 6)
    const napokSzama = napKulonbseg(kezd, veg) + 1
    return { elso: kezd, hetek: Math.round(napokSzama / 7) }
  }, [elseje])

  const utolso = napPlusz(elso, hetek * 7 - 1)

  const [sorok, setSorok] = useState<DayBooking[] | null>(null)
  const [szabadsagok, setSzabadsagok] = useState<VacationRow[]>([])
  const [hiba, setHiba] = useState<string | null>(null)

  useEffect(() => {
    let el = true
    ;(async () => {
      try {
        const [r, sz] = await Promise.all([
          data.getRange(elso, utolso),
          data.getVacations(elso, utolso),
        ])
        if (!el) return
        setSzabadsagok(sz)
        setSorok(flottaCsoportosit(r))
        setHiba(null)
      } catch (e) {
        if (!el) return
        setHiba(hibaSzoveg(e))
      }
    })()
    return () => { el = false }
  }, [data, elso, utolso, revision])

  useEffect(() => data.subscribe(() => refresh()), [data, refresh])

  const napok = useMemo(() => {
    const m = new Map<string, DayBooking[]>()
    for (let i = 0; i < hetek * 7; i++) m.set(napPlusz(elso, i), [])
    for (const b of sorok ?? []) {
      if (tobbnaposE(b)) continue
      m.get(b.service_date.slice(0, 10))?.push(b)
    }
    return m
  }, [sorok, elso, hetek])

  const hetiSav = useMemo(
    () => Array.from({ length: hetek }, (_, sor) => hetiSavok(sorok ?? [], napPlusz(elso, sor * 7), 7)),
    [sorok, elso, hetek],
  )

  const hetiSzab = useMemo(
    () => Array.from({ length: hetek }, (_, sor) => hetiSzabadsagok(szabadsagok, napPlusz(elso, sor * 7), 7)),
    [szabadsagok, elso, hetek],
  )

  if (hiba) return <div className="hibauzenet">{hiba}</div>
  if (!sorok) return <div className="betolt">Betöltés…</div>

  return (
    <div className="honapnezet">
      <div className="honapfej">
        <div className="hetoszlop-fej">hét</div>
        {FEJ.map((f) => <div key={f}>{f}</div>)}
      </div>

      <div className="honapracs">
        {Array.from({ length: hetek }, (_, sor) => {
          const hetfo = napPlusz(elso, sor * 7)
          const { savok, sorok: savSorok } = hetiSav[sor]
          const { savok: szSavok, sorok: szSorok } = hetiSzab[sor]

          return (
            <div className="honapsor" key={hetfo}
                 style={{ '--savsor': savSorok + szSorok } as React.CSSProperties}>
              <button className="hetszam" onClick={() => onHetre(hetfo)}
                      title={`A ${hetSzam(hetfo)}. hét megnyitása heti nézetben`}>
                <span className="szam">{hetSzam(hetfo)}</span>
                <span className="szo">hét</span>
              </button>

              {Array.from({ length: 7 }, (__, i) => {
                const d = napPlusz(hetfo, i)
                const lista = napok.get(d) ?? []
                const atfuto = savok.filter((s) => s.tol <= i && i <= s.ig).length
                const osszes = lista.length + atfuto

                return (
                  <button
                    className="honapnap"
                    key={d}
                    onClick={() => onNapra(d)}
                    data-kivul={!azonosHonap(d, elseje) || undefined}
                    data-ma={maE(d) || undefined}
                    aria-label={`${d} — ${osszes} foglalás`}
                  >
                    <span className="napszam">
                      <span>{Number(d.slice(8, 10))}</span>
                      {osszes > 0 && <span className="db">{osszes}</span>}
                    </span>

                    {lista.length > 0 && (
                      <span className="honap-autok">
                        {atfuto > 0 && <span className="plusz">+</span>}
                        <span className="sor">
                          <span className="szam">{lista.length}</span>
                          <span className="szo">autó</span>
                        </span>
                      </span>
                    )}
                  </button>
                )
              })}

              {savok.length + szSavok.length > 0 && (
                <div className="honap-savok" aria-hidden="true">
                  {savok.map((s) => {
                    const viszi = s.b.pick_up_at ?? s.b.deadline_at
                    return (
                      <span key={s.b.id} className="honap-sav" data-a={s.b.status}
                            data-korabbrol={s.korabbrol || undefined}
                            data-tovabb={s.tovabb || undefined}
                            title={`${azonosito(s.b)} · ${STATUS_LABEL[s.b.status]}`}
                            style={{ gridColumn: `${s.tol + 2} / ${s.ig + 3}`, gridRow: s.sor + 1 }}>
                        <span className="azon">{azonosito(s.b)}</span>
                        <Kerdojel b={s.b} />
                        <span className="ido">
                          {Number(s.b.last_day.slice(8, 10))}-ig{viszi ? `, ${ora(viszi)}` : ''}
                        </span>
                      </span>
                    )
                  })}
                  {szSavok.map((s) => (
                    <span key={`sz-${s.v.id}`} className="honap-sav szabadsag-sav"
                          data-korabbrol={s.korabbrol || undefined}
                          data-tovabb={s.tovabb || undefined}
                          title={`Szabadság: ${s.v.staff_name}${s.v.note ? ` · ${s.v.note}` : ''}`}
                          style={{ gridColumn: `${s.tol + 2} / ${s.ig + 3}`, gridRow: savSorok + s.sor + 1 }}>
                      <span className="azon">Szabadság: {s.v.staff_name}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
