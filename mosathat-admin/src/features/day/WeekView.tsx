import { useEffect, useMemo, useState } from 'react'
import Kerdojel from './Kerdojel'
import { flottaCsoportosit } from '../../lib/flotta'

import { useApp, useRevizio } from '../../state/AppContext'
import { hetHetfoje, hibaSzoveg, maE, napPlusz, napRovidCim, ora } from '../../lib/format'
import { STATUS_LABEL, type DayBooking } from '../../lib/types'
import MiniKartya, { azonosito } from './MiniKartya'
import { hetiSavok, tobbnaposE } from '../../lib/savok'

const NAPOK = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']
const MAX = 10

export default function WeekView({ nap, onMegnyit, onNapra }: {
  nap: string
  onMegnyit: (id: string) => void
  onNapra: (nap: string) => void
}) {
  const { data, refresh } = useApp()
  const revision = useRevizio()
  const hetfo = hetHetfoje(nap)
  const [sorok, setSorok] = useState<DayBooking[] | null>(null)
  const [rend, setRend] = useState<Map<string, number>>(new Map())
  const [hiba, setHiba] = useState<string | null>(null)

  useEffect(() => {
    let el = true
    ;(async () => {
      try {
        const [r, o] = await Promise.all([
          data.getRange(hetfo, napPlusz(hetfo, 6)),
          data.getRangeOrder(hetfo, napPlusz(hetfo, 6)),
        ])
        if (!el) return
        setSorok(flottaCsoportosit(r))
        setRend(o)
        setHiba(null)
      } catch (e) {
        if (!el) return
        setHiba(hibaSzoveg(e))
      }
    })()
    return () => { el = false }
  }, [data, hetfo, revision])

  useEffect(() => data.subscribe(() => refresh()), [data, refresh])

  const { napok, savok, savSorok } = useMemo(() => {
    const m = new Map<string, DayBooking[]>()
    for (let i = 0; i < 7; i++) m.set(napPlusz(hetfo, i), [])
    const tobb: DayBooking[] = []
    for (const b of sorok ?? []) {
      if (tobbnaposE(b)) tobb.push(b)
      else m.get(b.service_date.slice(0, 10))?.push(b)
    }

    for (const [d, lista] of m) {
      const hely = (b: DayBooking) => rend.get(`${d}|${b.id}`) ?? Number.MAX_SAFE_INTEGER
      lista.sort((a, z) => hely(a) - hely(z))
    }

    const { savok: ki, sorok: savSor } = hetiSavok(tobb, hetfo, 5)
    return { napok: m, savok: ki, savSorok: savSor }
  }, [sorok, hetfo, rend])

  if (hiba) return <div className="hibauzenet">{hiba}</div>
  if (!sorok) return <div className="betolt">Betöltés…</div>

  const hetvegeDb = (d: string) =>
    (napok.get(d) ?? []).length
    + (sorok ?? []).filter((b) => tobbnaposE(b)
        && b.service_date.slice(0, 10) <= d && b.last_day.slice(0, 10) >= d).length
  const hetvege = [5, 6]
    .map((i) => napPlusz(hetfo, i))
    .filter((d) => hetvegeDb(d) > 0)

  const napiDb = (i: number) =>
    (napok.get(napPlusz(hetfo, i)) ?? []).length
    + savok.filter((s) => s.tol <= i && i <= s.ig).length

  return (
    <div>
      {savok.length > 0 && (
        <div className="hetsavok" style={{ gridTemplateRows: `repeat(${savSorok}, auto)` }}>
          {savok.map((s) => {
            const viszi = s.b.pick_up_at ?? s.b.deadline_at
            return (
              <button
                key={s.b.id}
                type="button"
                className="hetsav"
                data-a={s.b.status}
                data-korabbrol={s.korabbrol || undefined}
                data-tovabb={s.tovabb || undefined}
                style={{ gridColumn: `${s.tol + 1} / ${s.ig + 2}`, gridRow: s.sor + 1 }}
                onClick={() => onMegnyit(s.b.id)}
                title={`${azonosito(s.b)} · ${STATUS_LABEL[s.b.status]}`}
              >
                <span className="rendszam">{azonosito(s.b)}</span>
                <Kerdojel b={s.b} />
                {s.b.booking_type === 'HOZOMVISZEM' && <span className="hv">H-V</span>}
                <span className="idotav">
                  {napRovidCim(s.b.service_date.slice(0, 10))}
                  {' – '}
                  {napRovidCim(s.b.last_day.slice(0, 10))}
                  {viszi ? ` ${ora(viszi)}-ig` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="hetracs hetfejsor">
        {[0, 1, 2, 3, 4].map((i) => {
          const d = napPlusz(hetfo, i)
          return (
            <button className="oszlopfej" key={d} onClick={() => onNapra(d)}
                    data-ma={maE(d) || undefined}>
              <span className="nev">{NAPOK[i]}</span>
              <span className="datum">{napRovidCim(d)}</span>
              <span className="db">{napiDb(i) || ''}</span>
            </button>
          )
        })}
      </div>

      <div className="hetracs">
        {[0, 1, 2, 3, 4].map((i) => {
          const d = napPlusz(hetfo, i)
          const lista = napok.get(d) ?? []
          const latszik = lista.slice(0, MAX)
          const tobb = lista.length - latszik.length

          return (
            <section className="naposzlop" key={d} data-ma={maE(d) || undefined}>
              <button className="oszlopfej oszlopfej-sajat" onClick={() => onNapra(d)}>
                <span className="nev">{NAPOK[i]}</span>
                <span className="datum">{napRovidCim(d)}</span>
                <span className="db">{napiDb(i) || ''}</span>
              </button>

              <div className="oszloptorzs">
                {latszik.map((b) => (
                  <MiniKartya key={b.id} b={b} onMegnyit={onMegnyit} />
                ))}

                {tobb > 0 && (
                  <button className="tovabb" onClick={() => onNapra(d)}>
                    + {tobb} további
                  </button>
                )}

                {lista.length === 0 && <div className="uresnap">—</div>}
              </div>
            </section>
          )
        })}
      </div>

      {hetvege.length > 0 && (
        <div className="hetvegesor">
          <span className="cimke">Hétvégén is van munka</span>
          {hetvege.map((d) => (
            <button key={d} className="btn btn-kicsi" onClick={() => onNapra(d)}>
              {NAPOK[d === napPlusz(hetfo, 5) ? 5 : 6]} · {hetvegeDb(d)} autó
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
