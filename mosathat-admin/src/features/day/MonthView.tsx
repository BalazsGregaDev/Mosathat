import { useEffect, useMemo, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { azonosHonap, hetHetfoje, hetSzam, honapElseje, maE, napPlusz, ora } from '../../lib/format'
import { STATUS_LABEL, type DayBooking } from '../../lib/types'
import { hetiSavok, tobbnaposE } from '../../lib/savok'
import MiniKartya, { azonosito } from './MiniKartya'

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
//  Naponta öt tétel fér el, a maradék „+3 további"-ként látszik. Minden
//  tételen elöl a rendszám, utána az idő — ugyanúgy, mint a napi nézetben.
//
//  A TÖBBNAPOS munkák, mint a heti nézetben, sávként futnak végig a napokon:
//  a hét sorában, a napszám alatt, minden olyan napon, amikor az autó nálunk
//  van. Ha a munka átnyúlik a következő hétre, a következő sorban folytatódik
//  (a sáv vége nyitott, szaggatott). A sáv nem külön gomb: rákattintva —
//  mint a cella bármely részén — arra a napra visz.
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
    // Az egynaposak a napjukon; a többnaposak sávként (lent, hetenként).
    for (const b of sorok ?? []) {
      if (tobbnaposE(b)) continue
      m.get(b.service_date.slice(0, 10))?.push(b)
    }
    return m
  }, [sorok, elso, hetek])

  // Hetenként a többnapos sávok (hét oszlop: hétfő–vasárnap).
  const hetiSav = useMemo(
    () => Array.from({ length: hetek }, (_, sor) => hetiSavok(sorok ?? [], napPlusz(elso, sor * 7), 7)),
    [sorok, elso, hetek],
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

          return (
            // A sávsorok száma CSS-változóként megy le: a napszám alatt ennyi
            // sornyi helyet hagyunk, hogy a sávok ne takarják a tételeket.
            <div className="honapsor" key={hetfo}
                 style={{ '--savsor': savSorok } as React.CSSProperties}>
              <button className="hetszam" onClick={() => onHetre(hetfo)}
                      title={`A ${hetSzam(hetfo)}. hét megnyitása heti nézetben`}>
                <span className="szam">{hetSzam(hetfo)}</span>
                <span className="szo">hét</span>
              </button>

              {Array.from({ length: 7 }, (__, i) => {
                const d = napPlusz(hetfo, i)
                const lista = napok.get(d) ?? []
                // A több napon át itt álló autók is számítanak a napba.
                const atfuto = savok.filter((s) => s.tol <= i && i <= s.ig).length
                const osszes = lista.length + atfuto
                // Ahány sávsor, annyival kevesebb kártya fér a cellába.
                const latszik = lista.slice(0, Math.max(1, MAX - savSorok))
                const tobb = lista.length - latszik.length

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

                    {latszik.map((b) => (
                      <MiniKartya key={b.id} b={b} egysoros />
                    ))}

                    {tobb > 0 && <span className="tovabb">+ {tobb} további</span>}
                  </button>
                )
              })}

              {/* A többnapos sávok a cellák FÖLÖTT, ugyanabban a rácsban: a
                  hét oszlopában pontosan azokon a napokon futnak végig, amikor
                  az autó nálunk van. Nem fogják el a kattintást — a cella
                  visz a napra, ahogy eddig. */}
              {savok.length > 0 && (
                <div className="honap-savok" aria-hidden="true">
                  {savok.map((s) => {
                    const viszi = s.b.pick_up_at ?? s.b.deadline_at
                    return (
                      <span key={s.b.id} className="honap-sav" data-a={s.b.status}
                            data-korabbrol={s.korabbrol || undefined}
                            data-tovabb={s.tovabb || undefined}
                            title={`${azonosito(s.b)} · ${STATUS_LABEL[s.b.status]}`}
                            style={{ gridColumn: `${s.tol + 2} / ${s.ig + 3}`, gridRow: s.sor + 1 }}>
                        {/* A rendszám után rögtön: meddig marad („4-ig,
                            17:00") — minden szakaszon, a következő hétre
                            átnyúlón is. */}
                        <span className="azon">{azonosito(s.b)}</span>
                        <span className="ido">
                          {Number(s.b.last_day.slice(8, 10))}-ig{viszi ? `, ${ora(viszi)}` : ''}
                        </span>
                      </span>
                    )
                  })}
                </div>
              )}
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
