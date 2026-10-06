import { useEffect, useMemo, useState } from 'react'
import Kerdojel from './Kerdojel'
import { flottaCsoportosit } from '../../lib/flotta'

import { useApp } from '../../state/AppContext'
import { azonosHonap, hetHetfoje, hetSzam, honapElseje, maE, napPlusz, ora } from '../../lib/format'
import { STATUS_LABEL, type DayBooking, type VacationRow } from '../../lib/types'
import { hetiSavok, hetiSzabadsagok, tobbnaposE } from '../../lib/savok'
import { azonosito } from './MiniKartya'

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
//  Az EGYNAPOS foglalások nem egyenként látszanak, hanem egy nagy számmal:
//  „+ 8 autó". A havi nézet arra való, hogy egy pillantással látszódjon,
//  melyik nap mennyire teli — a rendszámok a heti és a napi nézetben vannak.
//
//      12                         11   ← a nap, és összesen hány autó
//      [KER-100 4-ig, 17:00   ]        ← többnapos sávok (mint eddig)
//      [AABB-123 15-ig        ]
//      +                               ← ha fölötte többnapos sáv van
//      8 autó                          ← aznapi (egynapos) foglalások
//
//  A hét sora olyan magas, amennyit a legzsúfoltabb napja kér (ahány
//  sávsor, plusz a szám) — nincs fix magasság, ami alá a szám becsúszna.
//
//  A TÖBBNAPOS munkák, mint a heti nézetben, sávként futnak végig a napokon:
//  a hét sorában, a napszám alatt, minden olyan napon, amikor az autó nálunk
//  van. Ha a munka átnyúlik a következő hétre, a következő sorban folytatódik
//  (a sáv vége nyitott, szaggatott). A sáv nem külön gomb: rákattintva —
//  mint a cella bármely részén — arra a napra visz.
//
//  A SZABADSÁGOK (Profilom → Szabadság) ugyanígy sávként futnak, az autók
//  sávjai alatt, rózsaszínnel: „Szabadság: Gábor".
//
//  Miért nem hat sor fix magassággal: mert a hónapok 4–6 hetet ölelnek fel,
//  és az üres sor csak helyet foglal. A rács annyi sorból áll, amennyi kell.
// ---------------------------------------------------------------------------

const FEJ = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V']

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
        // Flottás csoport: egy kártya („Raiffeisen 3 db"), nem három.
        setSorok(flottaCsoportosit(r))
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

  // Hetenként a szabadságok sávjai (az autók sávjai alatt).
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
            // A sávsorok száma CSS-változóként megy le: a napszám alatt ennyi
            // sornyi helyet hagyunk, hogy a sávok ne takarják a tételeket.
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
                // A több napon át itt álló autók is számítanak a napba.
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

                    {/* Az aznapi (egynapos) autók száma, nagyban. Ha vannak
                        fölötte többnapos sávok, „+"-szal: azokon felül. */}
                    {lista.length > 0 && (
                      // A „+" külön sorban, a szám FÖLÖTT: így keskeny
                      // cellában (telefonon) is kifér a „12 autó".
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

              {/* A többnapos sávok a cellák FÖLÖTT, ugyanabban a rácsban: a
                  hét oszlopában pontosan azokon a napokon futnak végig, amikor
                  az autó nálunk van. Nem fogják el a kattintást — a cella
                  visz a napra, ahogy eddig. */}
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
                        {/* A rendszám után rögtön: meddig marad („4-ig,
                            17:00") — minden szakaszon, a következő hétre
                            átnyúlón is. */}
                        <span className="azon">{azonosito(s.b)}</span>
                        <Kerdojel b={s.b} />
                        <span className="ido">
                          {Number(s.b.last_day.slice(8, 10))}-ig{viszi ? `, ${ora(viszi)}` : ''}
                        </span>
                      </span>
                    )
                  })}
                  {/* Szabadság: az autók sávjai alatt, rózsaszínnel. */}
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

/** A következő hónap elseje. Decemberben évet is vált. */
function honapElsejeKov(elseje: string): string {
  const [ev, ho] = elseje.split('-').map(Number)
  return new Date(Date.UTC(ev, ho, 1, 12)).toISOString().slice(0, 10)
}
