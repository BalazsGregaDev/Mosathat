import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { idoMezo, maStr, napRovidCim } from '../../lib/format'
import type { DayOverride, OpeningDay, ShopSettings, ValidityKind } from '../../lib/types'

// ---------------------------------------------------------------------------
//  Beállítások
//
//  Három dolog van itt, és a sorrend nem véletlen:
//
//    1. Nyitvatartás és munkaidő — ebből jön a kapacitás. Ez a legfontosabb.
//    2. Általános — leadás legkorábban, párhuzamos autók, bérlet alapérték.
//    3. Kivételnapok — ünnep, szabadság, ledolgozós szombat.
//
//  Egy fontos egyszerűsítés: az adatbázisban külön van "zárva a bolt" és
//  "nem dolgozunk" jelző. A felületen EGY pipa van, ami mindkettőt állítja.
//  Aki nyitva van, de nem dolgozik, annak a foglalórendszer nulla időpontot
//  tud ajánlani — ez nem beállítás, hanem hiba. Ne legyen kikattintható.
//
//  A munkaidő viszont marad külön: nyolckor már dolgozunk, kilencre nyitunk.
//  A kapacitás a munkaidőből számol, és ez nem elírás.
// ---------------------------------------------------------------------------

type Ful = 'ido' | 'altalanos' | 'kivetel'

export default function SettingsPage() {
  const [ful, setFul] = useState<Ful>('ido')

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Beállítások</h2>
        <div className="fulek">
          <button className={ful === 'ido' ? 'aktiv' : ''} onClick={() => setFul('ido')}>
            Nyitvatartás
          </button>
          <button className={ful === 'altalanos' ? 'aktiv' : ''} onClick={() => setFul('altalanos')}>
            Általános
          </button>
          <button className={ful === 'kivetel' ? 'aktiv' : ''} onClick={() => setFul('kivetel')}>
            Kivételnapok
          </button>
        </div>
      </div>

      {ful === 'ido' && <Nyitvatartas />}
      {ful === 'altalanos' && <Altalanos />}
      {ful === 'kivetel' && <Kivetelnapok />}
    </div>
  )
}

/** Közös mentés-visszajelzés: a gomb melletti szöveg, nem felugró ablak. */
function useMentes() {
  const [allapot, setAllapot] = useState<'' | 'megy' | 'kesz' | string>('')
  const fut = useCallback(async (f: () => Promise<void>) => {
    setAllapot('megy')
    try {
      await f()
      setAllapot('kesz')
      window.setTimeout(() => setAllapot(''), 2500)
    } catch (e) {
      setAllapot(e instanceof Error ? e.message : String(e))
    }
  }, [])
  return { allapot, fut }
}

function MentesJelzo({ allapot }: { allapot: string }) {
  if (!allapot) return null
  if (allapot === 'megy') return <span className="halk">Mentés…</span>
  if (allapot === 'kesz') return <span style={{ color: 'var(--zold)' }}>Mentve</span>
  return <span style={{ color: 'var(--v-baj)' }}>{allapot}</span>
}

// ===========================================================================
//  1. Nyitvatartás és munkaidő
// ===========================================================================

function Nyitvatartas() {
  const { data } = useApp()
  const [napok, setNapok] = useState<OpeningDay[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const { allapot, fut } = useMentes()

  useEffect(() => {
    data.getOpening().then(setNapok).catch((e) => setHiba(String(e.message ?? e)))
  }, [data])

  function modosit(weekday: number, patch: Partial<OpeningDay>) {
    setNapok((e) => e?.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)) ?? null)
  }

  /** A pipa mindkét zárva-jelzőt állítja. Lásd a fájl fejében. */
  function zarvaAllit(d: OpeningDay, zarva: boolean) {
    modosit(d.weekday, {
      business_closed: zarva,
      work_closed: zarva,
      // Nyitáskor adjunk használható kezdőértéket, hogy ne üres mezőket mentsen.
      ...(zarva ? {} : {
        opens: d.opens ?? '09:00:00',
        closes: d.closes ?? '17:00:00',
        starts: d.starts ?? '08:00:00',
        ends: d.ends ?? '17:00:00',
      }),
    })
  }

  function szunetModosit(weekday: number, i: number, patch: Partial<OpeningDay['breaks'][0]>) {
    setNapok((e) => e?.map((d) => d.weekday !== weekday ? d : {
      ...d, breaks: d.breaks.map((b, j) => (j === i ? { ...b, ...patch } : b)),
    }) ?? null)
  }

  function szunetUj(weekday: number) {
    setNapok((e) => e?.map((d) => d.weekday !== weekday ? d : {
      ...d, breaks: [...d.breaks, { starts: '12:00', ends: '12:30', label: 'Ebéd' }],
    }) ?? null)
  }

  function szunetTorol(weekday: number, i: number) {
    setNapok((e) => e?.map((d) => d.weekday !== weekday ? d : {
      ...d, breaks: d.breaks.filter((_, j) => j !== i),
    }) ?? null)
  }

  if (hiba) return <div className="hibauzenet">{hiba}</div>
  if (!napok) return <div className="betolt">Betöltés…</div>

  return (
    <div className="panel panelek-szeles">
      <h3>A hét beosztása</h3>
      <div className="panel-torzs">
        <p className="halk" style={{ fontSize: 'var(--m-xs)', marginBottom: 'var(--t3)' }}>
          A <strong>nyitvatartás</strong> az, amit az ügyfél lát, és amikor hozhatja az
          autót. A <strong>munkaidő</strong> az, amiből a kapacitás számol — ez általában
          korábban kezdődik. A szünetek kiesnek a munkaidőből.
        </p>

        <div className="tablagorgo">
          <table className="beall-tabla">
            <thead>
              <tr>
                <th>Nap</th>
                <th>Zárva</th>
                <th colSpan={2}>Nyitvatartás</th>
                <th colSpan={2}>Munkaidő</th>
                <th>Szünet</th>
              </tr>
            </thead>
            <tbody>
              {napok.map((d) => {
                const zarva = d.business_closed
                return (
                  <tr key={d.weekday} data-zarva={zarva || undefined}>
                    <th scope="row">{d.nev}</th>
                    <td>
                      <input type="checkbox" checked={zarva}
                             onChange={(e) => zarvaAllit(d, e.target.checked)}
                             aria-label={`${d.nev} zárva`} />
                    </td>
                    {/* Zárt napon nincs mit beállítani. Négy letiltott, üres
                        mező helyett egy szó — az legalább mond valamit. */}
                    {zarva ? (
                      <td colSpan={5} className="zarva-cella">Ezen a napon nem dolgozunk.</td>
                    ) : (
                      <>
                        <td>
                          <input type="time" className="beviteli ido"
                                 value={idoMezo(d.opens)}
                                 onChange={(e) => modosit(d.weekday, { opens: e.target.value })}
                                 aria-label={`${d.nev} nyitás`} />
                        </td>
                        <td>
                          <input type="time" className="beviteli ido"
                                 value={idoMezo(d.closes)}
                                 onChange={(e) => modosit(d.weekday, { closes: e.target.value })}
                                 aria-label={`${d.nev} zárás`} />
                        </td>
                        <td>
                          <input type="time" className="beviteli ido"
                                 value={idoMezo(d.starts)}
                                 onChange={(e) => modosit(d.weekday, { starts: e.target.value })}
                                 aria-label={`${d.nev} munka kezdés`} />
                        </td>
                        <td>
                          <input type="time" className="beviteli ido"
                                 value={idoMezo(d.ends)}
                                 onChange={(e) => modosit(d.weekday, { ends: e.target.value })}
                                 aria-label={`${d.nev} munka vége`} />
                        </td>
                        <td>
                          <div className="szunetek">
                            {d.breaks.map((b, i) => (
                              <div className="szunet" key={i}>
                                <input type="time" className="beviteli ido" value={idoMezo(b.starts)}
                                       onChange={(e) => szunetModosit(d.weekday, i, { starts: e.target.value })}
                                       aria-label="Szünet kezdete" />
                                <input type="time" className="beviteli ido" value={idoMezo(b.ends)}
                                       onChange={(e) => szunetModosit(d.weekday, i, { ends: e.target.value })}
                                       aria-label="Szünet vége" />
                                <input className="beviteli szunet-nev" value={b.label}
                                       onChange={(e) => szunetModosit(d.weekday, i, { label: e.target.value })}
                                       aria-label="Szünet neve" />
                                <button className="btn btn-csendes btn-kicsi"
                                        onClick={() => szunetTorol(d.weekday, i)}
                                        aria-label="Szünet törlése">✕</button>
                              </div>
                            ))}
                            <button className="btn btn-csendes btn-kicsi"
                                    onClick={() => szunetUj(d.weekday)}>+ Szünet</button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="urlap-lab">
          <MentesJelzo allapot={allapot} />
          <button className="btn btn-fo" disabled={allapot === 'megy'}
                  onClick={() => void fut(async () => {
                    for (const d of napok) await data.saveDayHours(d)
                    setNapok(await data.getOpening())
                  })}>
            Mentés
          </button>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
//  2. Általános
// ===========================================================================

const LEJARAT: { v: ValidityKind; cimke: string }[] = [
  { v: 'EV', cimke: 'év' },
  { v: 'NAP', cimke: 'nap' },
  { v: 'DATUM', cimke: 'fix dátumig' },
]

function Altalanos() {
  const { data } = useApp()
  const [s, setS] = useState<ShopSettings | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const { allapot, fut } = useMentes()

  useEffect(() => {
    data.getShopSettings().then(setS).catch((e) => setHiba(String(e.message ?? e)))
  }, [data])

  if (hiba) return <div className="hibauzenet">{hiba}</div>
  if (!s) return <div className="betolt">Betöltés…</div>

  const mod = (patch: Partial<ShopSettings>) => setS({ ...s, ...patch })

  return (
    <div className="panelek">
      <div className="panel">
        <h3>Munkarend</h3>
        <div className="panel-torzs">
          <label className="mezo">
            <span>Leadás legkorábban</span>
            <input type="time" className="beviteli" value={idoMezo(s.drop_off_from)}
                   onChange={(e) => mod({ drop_off_from: e.target.value })} />
            <small>
              Nem a nyitás — ennél korábbra a rendszer nem ígér leadást. 7:15 azért
              van, mert 7:00-ra nem mindig sikerült beérni.
            </small>
          </label>

          <label className="mezo">
            <span>Párhuzamosan mosott autók</span>
            <input type="number" min={1} max={6} className="beviteli"
                   value={s.default_parallel_slots}
                   onChange={(e) => mod({ default_parallel_slots: Number(e.target.value) })} />
            <small>
              Ebből jön a napi kapacitás. Ha egy adott napon hárman dolgoztok autón,
              azt a Kivételnapok fülön lehet felvenni — ne ezt írd át.
            </small>
          </label>

          <label className="mezo">
            <span>Hozom-viszem fordulóidő (perc)</span>
            <input type="number" min={0} max={120} className="beviteli"
                   value={s.default_travel_minutes}
                   onChange={(e) => mod({ default_travel_minutes: Number(e.target.value) })} />
            <small>Ha a cégnél nincs saját érték megadva, ezzel számol.</small>
          </label>
        </div>
      </div>

      <div className="panel">
        <h3>Bérlet</h3>
        <div className="panel-torzs">
          <label className="mezo">
            <span>Alapértelmezett érvényesség</span>
            <div className="sor">
              {s.pass_validity_kind === 'DATUM' ? (
                <input type="date" className="beviteli" value={s.pass_validity_value}
                       onChange={(e) => mod({ pass_validity_value: e.target.value })} />
              ) : (
                <input type="number" min={1} className="beviteli" style={{ width: 80 }}
                       value={s.pass_validity_value}
                       onChange={(e) => mod({ pass_validity_value: e.target.value })} />
              )}
              <select className="beviteli" value={s.pass_validity_kind}
                      onChange={(e) => mod({
                        pass_validity_kind: e.target.value as ValidityKind,
                        pass_validity_value: e.target.value === 'DATUM' ? maStr() : '1',
                      })}>
                {LEJARAT.map((l) => <option key={l.v} value={l.v}>{l.cimke}</option>)}
              </select>
            </div>
            <small>
              Új bérlet felvételénél ez lesz a felajánlott lejárat. Bérletenként
              felülírható — ez csak a kiindulás.
            </small>
          </label>
        </div>
      </div>

      <div className="panel">
        <h3>&nbsp;</h3>
        <div className="panel-torzs">
          <div className="urlap-lab">
            <MentesJelzo allapot={allapot} />
            <button className="btn btn-fo" disabled={allapot === 'megy'}
                    onClick={() => void fut(async () => {
                      await data.saveShopSettings(s)
                      setS(await data.getShopSettings())
                    })}>
              Mentés
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
//  3. Kivételnapok
// ===========================================================================

const URES: DayOverride = {
  day: maStr(), closed: true, opens: null, closes: null,
  work_starts: null, work_ends: null, parallel_slots: null, note: null,
}

function Kivetelnapok() {
  const { data } = useApp()
  const [sorok, setSorok] = useState<DayOverride[] | null>(null)
  const [uj, setUj] = useState<DayOverride>(URES)
  const [hiba, setHiba] = useState<string | null>(null)
  const { allapot, fut } = useMentes()

  const betolt = useCallback(() => {
    data.listDayOverrides(maStr()).then(setSorok).catch((e) => setHiba(String(e.message ?? e)))
  }, [data])

  useEffect(betolt, [betolt])

  if (hiba) return <div className="hibauzenet">{hiba}</div>
  if (!sorok) return <div className="betolt">Betöltés…</div>

  const mod = (patch: Partial<DayOverride>) => setUj({ ...uj, ...patch })

  return (
    <div className="panelek-szeles">
      <div className="panel">
        <h3>Új kivételnap</h3>
        <div className="panel-torzs">
          <p className="halk" style={{ fontSize: 'var(--m-xs)', marginBottom: 'var(--t3)' }}>
            Mindkét irányban működik: rendkívül zárva (ünnep, szabadság) vagy
            rendkívül nyitva (ledolgozós szombat). Ami itt van, az felülírja a heti
            beosztást arra az egy napra.
          </p>

          <div className="mezo-sor">
            <label className="mezo">
              <span>Nap</span>
              <input type="date" className="beviteli" value={uj.day}
                     onChange={(e) => mod({ day: e.target.value })} />
            </label>

            <label className="mezo">
              <span>Mi történik</span>
              <select className="beviteli" value={uj.closed ? 'zarva' : 'nyitva'}
                      onChange={(e) => {
                        const zarva = e.target.value === 'zarva'
                        mod(zarva
                          ? { closed: true, opens: null, closes: null, work_starts: null,
                              work_ends: null, parallel_slots: null }
                          : { closed: false, opens: '09:00', closes: '17:00',
                              work_starts: '08:00', work_ends: '17:00' })
                      }}>
                <option value="zarva">Zárva</option>
                <option value="nyitva">Nyitva, más időben</option>
              </select>
            </label>
          </div>

          {!uj.closed && (
            <div className="mezo-sor">
              <label className="mezo">
                <span>Nyitás</span>
                <input type="time" className="beviteli" value={idoMezo(uj.opens)}
                       onChange={(e) => mod({ opens: e.target.value })} />
              </label>
              <label className="mezo">
                <span>Zárás</span>
                <input type="time" className="beviteli" value={idoMezo(uj.closes)}
                       onChange={(e) => mod({ closes: e.target.value })} />
              </label>
              <label className="mezo">
                <span>Munka kezdés</span>
                <input type="time" className="beviteli" value={idoMezo(uj.work_starts)}
                       onChange={(e) => mod({ work_starts: e.target.value })} />
              </label>
              <label className="mezo">
                <span>Munka vége</span>
                <input type="time" className="beviteli" value={idoMezo(uj.work_ends)}
                       onChange={(e) => mod({ work_ends: e.target.value })} />
              </label>
              <label className="mezo">
                <span>Párhuzamos autók</span>
                <input type="number" min={1} max={6} className="beviteli"
                       value={uj.parallel_slots ?? ''}
                       placeholder="alapérték"
                       onChange={(e) => mod({
                         parallel_slots: e.target.value === '' ? null : Number(e.target.value),
                       })} />
              </label>
            </div>
          )}

          <label className="mezo">
            <span>Megjegyzés</span>
            <input className="beviteli" value={uj.note ?? ''}
                   onChange={(e) => mod({ note: e.target.value || null })} />
          </label>

          <div className="urlap-lab">
            <MentesJelzo allapot={allapot} />
            <button className="btn btn-fo" disabled={allapot === 'megy'}
                    onClick={() => void fut(async () => {
                      await data.saveDayOverride(uj)
                      setUj({ ...URES, day: uj.day })
                      betolt()
                    })}>
              Felvétel
            </button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 'var(--t4)' }}>
        <h3>Mostantól érvényes kivételnapok</h3>
        <div className="panel-torzs">
          <div className="tablagorgo">
            <table className="lista">
              <thead>
                <tr>
                  <th>Nap</th>
                  <th>Mi történik</th>
                  <th>Nyitvatartás</th>
                  <th>Munkaidő</th>
                  <th>Autó</th>
                  <th>Megjegyzés</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorok.map((o) => (
                  <tr key={o.day}>
                    <th scope="row" className="szam">{napRovidCim(o.day.slice(0, 10))}</th>
                    <td>
                      {o.closed
                        ? <span className="cimke-pill" data-b="baj">Zárva</span>
                        : <span className="cimke-pill">Nyitva</span>}
                    </td>
                    <td className="szam">
                      {o.closed ? '—' : `${idoMezo(o.opens) || '?'}–${idoMezo(o.closes) || '?'}`}
                    </td>
                    <td className="szam">
                      {o.closed ? '—' : `${idoMezo(o.work_starts) || '?'}–${idoMezo(o.work_ends) || '?'}`}
                    </td>
                    <td className="szam">{o.closed ? '—' : (o.parallel_slots ?? '—')}</td>
                    <td>{o.note || <span className="halvany">—</span>}</td>
                    <td>
                      <button className="btn btn-csendes btn-kicsi"
                              onClick={() => void fut(async () => {
                                await data.deleteDayOverride(o.day.slice(0, 10))
                                betolt()
                              })}>
                        Törlés
                      </button>
                    </td>
                  </tr>
                ))}
                {sorok.length === 0 && (
                  <tr><td colSpan={7}><div className="ures">Nincs felvett kivételnap.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
