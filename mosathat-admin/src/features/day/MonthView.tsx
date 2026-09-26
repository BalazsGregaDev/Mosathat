import { useEffect, useMemo, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { azonosHonap, hetHetfoje, hetSzam, honapElseje, maE, napPlusz } from '../../lib/format'
import type { DayBooking } from '../../lib/types'
import MiniKartya from './MiniKartya'

// ---------------------------------------------------------------------------
//  Havi naptár
//
//  Teljes heteket mutat, hétfőtől vasárnapig. Ha a hónap péntekkel kezdődik,
//  a hétfő–csütörtök akkor is látszik, csak halványan — mert a hét attól még
//  egy hét, és azokra a napokra is lehet munka. Kattinthatók: ha szeptember
//  30-án keresek valamit, nem akarok előbb hónapot váltani.
//
//  EGY CELLA = EGY MŰVELET: betölti azt a napot. A benne lévő tételek nem
//  külön gombok, hanem a nap tartalmának az előnézete. Egy tíz pixel magas
//  sorból munkalapot nyitni félrekattintás lenne; a hét nézetben, ahol nagyobb
//  a kártya, ott viszont pont az a hasznos.
//
//  Bal szélen a hétszám. Onnan egy kattintással át lehet váltani annak a
//  hétnek a nézetére — a havi a tájékozódás, a heti a tervezés.
//
//  Naponta öt tétel fér el, a maradék „+3 további"-ként látszik.
//
//  Miért nem hat sor fix magassággal: mert a hónapok 4–6 hetet ölelnek fel,
//  és az üres sor csak helyet foglal. A rács annyi sorból áll, amennyi kell.
// ---------------------------------------------------------------------------

const FEJ = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V']
const MAX = 5

export default function MonthView({ nap, onNapra, onHetre }: {
  /** Bármelyik nap a hónapból. */
  nap: string
  onNapra: (nap: string) => void
  onHetre: (nap: string) => void
}) {
  const { data, revision, refresh } = useApp()
  const elseje = honapElseje(nap)

  // A rács első napja az elseje hetének hétfője, az utolsó a hónap utolsó
  // napját tartalmazó hét vasárnapja.
  const { elso, hetek } = useMemo(() => {
    const kezd = hetHetfoje(elseje)
    const utolsoNap = napPlusz(honapElsejeKov(elseje), -1)
    const veg = napPlusz(hetHetfoje(utolsoNap), 6)
    const napokSzama =
      (Date.parse(`${veg}T12:00:00Z`) - Date.parse(`${kezd}T12:00:00Z`)) / 86_400_000 + 1
    return { elso: kezd, hetek: Math.round(napokSzama / 7) }
  }, [elseje])

  const utolso = napPlusz(elso, hetek * 7 - 1)

  const [sorok, setSorok] = useState<DayBooking[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)

  useEffect(() => {
    let el = true
    ;(async () => {
      try {
        const r = await data.getRange(elso, utolso)
        if (!el) return
        setSorok(r)
        setHiba(null)
      } catch (e) {
        if (!el) return
        setHiba(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { el = false }
  }, [data, elso, utolso, revision])

  useEffect(() => data.subscribe(() => refresh()), [data, refresh])

  const napok = useMemo(() => {
    const m = new Map<string, DayBooking[]>()
    for (let i = 0; i < hetek * 7; i++) m.set(napPlusz(elso, i), [])
    for (const b of sorok ?? []) m.get(b.service_date.slice(0, 10))?.push(b)
    return m
  }, [sorok, elso, hetek])

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

          return (
            <div className="honapsor" key={hetfo}>
              <button className="hetszam" onClick={() => onHetre(hetfo)}
                      title={`A ${hetSzam(hetfo)}. hét megnyitása heti nézetben`}>
                <span className="szam">{hetSzam(hetfo)}</span>
                <span className="szo">hét</span>
              </button>

              {Array.from({ length: 7 }, (__, i) => {
                const d = napPlusz(hetfo, i)
                const lista = napok.get(d) ?? []
                const latszik = lista.slice(0, MAX)
                const tobb = lista.length - latszik.length

                return (
                  <button
                    className="honapnap"
                    key={d}
                    onClick={() => onNapra(d)}
                    data-kivul={!azonosHonap(d, elseje) || undefined}
                    data-ma={maE(d) || undefined}
                    aria-label={`${d} — ${lista.length} foglalás`}
                  >
                    <span className="napszam">
                      <span>{Number(d.slice(8, 10))}</span>
                      {lista.length > 0 && <span className="db">{lista.length}</span>}
                    </span>

                    {latszik.map((b) => (
                      <MiniKartya key={b.id} b={b} egysoros />
                    ))}

                    {tobb > 0 && <span className="tovabb">+ {tobb} további</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** A következő hónap elseje. Decemberben évet is vált. */
function honapElsejeKov(elseje: string): string {
  const [ev, ho] = elseje.split('-').map(Number)
  return new Date(Date.UTC(ev, ho, 1, 12)).toISOString().slice(0, 10)
}
