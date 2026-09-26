import { useEffect, useMemo, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { hetHetfoje, maE, napPlusz, napRovidCim } from '../../lib/format'
import type { DayBooking } from '../../lib/types'
import MiniKartya from './MiniKartya'

// ---------------------------------------------------------------------------
//  Heti nézet
//
//  Öt oszlop, hétfőtől péntekig. Nem naptár: nincs órarács, nincs arányos
//  magasság. Az a kérdés, hogy MELYIK NAPON MENNYI autó van, nem az, hogy
//  pontosan hogyan helyezkednek el egymáshoz képest — arra ott a napi nézet.
//
//  Naponta legfeljebb tíz kártya látszik. A tizenegyedik nem eltűnik, hanem
//  egy sorrá válik: „+3 további" — ami átvisz arra a napra. Az a lista úgyis
//  jobb hely a részletekhez.
//
//  A hétvége nem oszlop, de ha mégis van rajta munka (ledolgozós szombat),
//  akkor alul megjelenik egy sorban. Öt oszlop kedvéért nem tüntetünk el
//  négy autót.
// ---------------------------------------------------------------------------

const NAPOK = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap']
const MAX = 10

export default function WeekView({ nap, onMegnyit, onNapra }: {
  /** Bármelyik nap a hétből — a hétfőt magunk számoljuk ki belőle. */
  nap: string
  onMegnyit: (id: string) => void
  onNapra: (nap: string) => void
}) {
  const { data, revision, refresh } = useApp()
  const hetfo = hetHetfoje(nap)
  const [sorok, setSorok] = useState<DayBooking[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)

  // A betöltés közvetlenül az effektben van, nem külön függvényben. Így van
  // takarítása: ha gyorsan lapozol kettőt, a régebbi válasz már nem írja
  // felül az újabbat.
  useEffect(() => {
    let el = true
    ;(async () => {
      try {
        const r = await data.getRange(hetfo, napPlusz(hetfo, 6))
        if (!el) return
        setSorok(r)
        setHiba(null)
      } catch (e) {
        if (!el) return
        setHiba(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { el = false }
  }, [data, hetfo, revision])

  // Élő frissítés: nem itt töltünk újra, hanem növeljük a számlálót, és a
  // fenti effekt végzi a munkát — így egy helyen van a betöltés.
  useEffect(() => data.subscribe(() => refresh()), [data, refresh])

  // Naponként csoportosítva. A sorrendet az adatbázis adta, azt megtartjuk.
  const napok = useMemo(() => {
    const m = new Map<string, DayBooking[]>()
    for (let i = 0; i < 7; i++) m.set(napPlusz(hetfo, i), [])
    for (const b of sorok ?? []) m.get(b.service_date.slice(0, 10))?.push(b)
    return m
  }, [sorok, hetfo])

  if (hiba) return <div className="hibauzenet">{hiba}</div>
  if (!sorok) return <div className="betolt">Betöltés…</div>

  const hetvege = [5, 6]
    .map((i) => napPlusz(hetfo, i))
    .filter((d) => (napok.get(d) ?? []).length > 0)

  return (
    <div className="hetnezet">
      <div className="hetracs">
        {[0, 1, 2, 3, 4].map((i) => {
          const d = napPlusz(hetfo, i)
          const lista = napok.get(d) ?? []
          const latszik = lista.slice(0, MAX)
          const tobb = lista.length - latszik.length

          return (
            <section className="naposzlop" key={d} data-ma={maE(d) || undefined}>
              <button className="oszlopfej" onClick={() => onNapra(d)}>
                <span className="nev">{NAPOK[i]}</span>
                <span className="datum">{napRovidCim(d)}</span>
                <span className="db">{lista.length || ''}</span>
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
              {NAPOK[d === napPlusz(hetfo, 5) ? 5 : 6]} · {napok.get(d)?.length} autó
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
