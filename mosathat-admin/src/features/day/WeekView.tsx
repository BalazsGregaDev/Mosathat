import { useEffect, useMemo, useState } from 'react'
import Kerdojel from './Kerdojel'

import { useApp } from '../../state/AppContext'
import { hetHetfoje, maE, napPlusz, napRovidCim, ora } from '../../lib/format'
import { STATUS_LABEL, type DayBooking } from '../../lib/types'
import MiniKartya, { azonosito } from './MiniKartya'
import { hetiSavok, tobbnaposE } from '../../lib/savok'

// ---------------------------------------------------------------------------
//  Heti nézet
//
//  Öt oszlop, hétfőtől péntekig. Nem naptár: nincs órarács, nincs arányos
//  magasság. Az a kérdés, hogy MELYIK NAPON MENNYI autó van, nem az, hogy
//  pontosan hogyan helyezkednek el egymáshoz képest — arra ott a napi nézet.
//
//  A TÖBBNAPOS munkák külön, az oszlopok fölött állnak: egy-egy hosszú
//  sávként, ami pontosan azokon a napokon fut végig, amikor az autó nálunk
//  van. Így egy pillantással látszik, hogy a KER-100 hétfőtől csütörtökig
//  itt áll — nem kell négy oszlopban négyszer megtalálni. A sávok egymás
//  alá sorolódnak; ha kettő nem fedi egymást, egy sorba kerülnek.
//
//  Naponta legfeljebb tíz kártya látszik. A tizenegyedik nem eltűnik, hanem
//  egy sorrá válik: „+3 további" — ami átvisz arra a napra.
//
//  A hétvége nem oszlop, de ha mégis van rajta munka (ledolgozós szombat),
//  akkor alul megjelenik egy sorban.
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

  // Egynaposak naponként; a többnaposak sávként.
  const { napok, savok, savSorok } = useMemo(() => {
    const m = new Map<string, DayBooking[]>()
    for (let i = 0; i < 7; i++) m.set(napPlusz(hetfo, i), [])
    const tobb: DayBooking[] = []
    for (const b of sorok ?? []) {
      if (tobbnaposE(b)) tobb.push(b)
      else m.get(b.service_date.slice(0, 10))?.push(b)
    }

    // A sávok elhelyezése a közös számítással (lib/savok.ts): öt oszlop.
    const { savok: ki, sorok: savSor } = hetiSavok(tobb, hetfo, 5)
    return { napok: m, savok: ki, savSorok: savSor }
  }, [sorok, hetfo])

  if (hiba) return <div className="hibauzenet">{hiba}</div>
  if (!sorok) return <div className="betolt">Betöltés…</div>

  // A hétvégén is lehet munka — egynapos, vagy egy többnapos, ami átnyúlik.
  const hetvegeDb = (d: string) =>
    (napok.get(d) ?? []).length
    + (sorok ?? []).filter((b) => tobbnaposE(b)
        && b.service_date.slice(0, 10) <= d && b.last_day.slice(0, 10) >= d).length
  const hetvege = [5, 6]
    .map((i) => napPlusz(hetfo, i))
    .filter((d) => hetvegeDb(d) > 0)

  /** Egy nap összes autója: az aznapiak és a rajta átfutó többnaposak. */
  const napiDb = (i: number) =>
    (napok.get(napPlusz(hetfo, i)) ?? []).length
    + savok.filter((s) => s.tol <= i && i <= s.ig).length

  return (
    <div className="hetnezet">
      {/* ---------- a napok fejléce ---------- */}
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

      {/* ---------- többnapos munkák: egy-egy sáv a napokon át ---------- */}
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

      {/* ---------- egynapos munkák, naponként ---------- */}
      <div className="hetracs">
        {[0, 1, 2, 3, 4].map((i) => {
          const d = napPlusz(hetfo, i)
          const lista = napok.get(d) ?? []
          const latszik = lista.slice(0, MAX)
          const tobb = lista.length - latszik.length

          return (
            <section className="naposzlop" key={d} data-ma={maE(d) || undefined}>
              {/* Keskeny képernyőn az oszlopok egymás alá kerülnek — ott a
                  fenti közös fejléc nem látszik, minden oszlop a sajátját
                  mutatja. */}
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
