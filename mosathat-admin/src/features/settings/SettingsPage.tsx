import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg, idoMezo, maStr, napRovidCim } from '../../lib/format'
import IdoMezo from '../common/IdoMezo'
import type { DayOverride, OpeningDay, ShopSettings, ValidityKind } from '../../lib/types'

type Ful = 'ido' | 'altalanos' | 'kivetel'

const FejHely = createContext<HTMLElement | null>(null)
const AktivFul = createContext(true)

function Fejbe({ children }: { children: React.ReactNode }) {
  const hely = useContext(FejHely)
  const aktiv = useContext(AktivFul)
  return hely && aktiv ? createPortal(children, hely) : null
}

function FulTartalom({ aktiv, children }: { aktiv: boolean; children: React.ReactNode }) {
  return (
    <AktivFul.Provider value={aktiv}>
      <div hidden={!aktiv}>{children}</div>
    </AktivFul.Provider>
  )
}

export default function SettingsPage() {
  const [ful, setFul] = useState<Ful>('ido')
  const [fejHely, setFejHely] = useState<HTMLElement | null>(null)

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Beállítások</h2>
        <div className="fej-mentes" ref={setFejHely} />
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

      <FejHely.Provider value={fejHely}>
        <FulTartalom aktiv={ful === 'ido'}><Nyitvatartas /></FulTartalom>
        <FulTartalom aktiv={ful === 'altalanos'}><Altalanos /></FulTartalom>
        <FulTartalom aktiv={ful === 'kivetel'}><Kivetelnapok /></FulTartalom>
      </FejHely.Provider>
    </div>
  )
}

function useMentes() {
  const [allapot, setAllapot] = useState<'' | 'megy' | 'kesz' | string>('')
  const idozito = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(idozito.current), [])
  const fut = useCallback(async (f: () => Promise<void>) => {
    window.clearTimeout(idozito.current)
    setAllapot('megy')
    try {
      await f()
      setAllapot('kesz')
      idozito.current = window.setTimeout(() => setAllapot(''), 2500)
    } catch (e) {
      setAllapot(hibaSzoveg(e))
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

function Nyitvatartas() {
  const { data } = useApp()
  const [napok, setNapok] = useState<OpeningDay[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const { allapot, fut } = useMentes()

  useEffect(() => {
    data.getOpening().then(setNapok).catch((e) => setHiba(hibaSzoveg(e)))
  }, [data])

  function modosit(weekday: number, patch: Partial<OpeningDay>) {
    setNapok((e) => e?.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)) ?? null)
  }

  function zarvaAllit(d: OpeningDay, zarva: boolean) {
    modosit(d.weekday, {
      business_closed: zarva,
      work_closed: zarva,
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
                <th>Nyitva</th>
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
                      <input type="checkbox" checked={!zarva}
                             onChange={(e) => zarvaAllit(d, !e.target.checked)}
                             aria-label={`${d.nev} nyitva`} />
                    </td>
                    {zarva ? (
                      <td colSpan={5} className="zarva-cella">Ezen a napon nem dolgozunk.</td>
                    ) : (
                      <>
                        <td>
                          <IdoMezo className="beviteli ido"
                                 value={idoMezo(d.opens)}
                                 onChange={(v) => modosit(d.weekday, { opens: v })}
                                 ariaLabel={`${d.nev} nyitás`} />
                        </td>
                        <td>
                          <IdoMezo className="beviteli ido"
                                 value={idoMezo(d.closes)}
                                 onChange={(v) => modosit(d.weekday, { closes: v })}
                                 ariaLabel={`${d.nev} zárás`} />
                        </td>
                        <td>
                          <IdoMezo className="beviteli ido"
                                 value={idoMezo(d.starts)}
                                 onChange={(v) => modosit(d.weekday, { starts: v })}
                                 ariaLabel={`${d.nev} munka kezdés`} />
                        </td>
                        <td>
                          <IdoMezo className="beviteli ido"
                                 value={idoMezo(d.ends)}
                                 onChange={(v) => modosit(d.weekday, { ends: v })}
                                 ariaLabel={`${d.nev} munka vége`} />
                        </td>
                        <td>
                          <div className="szunetek">
                            {d.breaks.map((b, i) => (
                              <div className="szunet" key={i}>
                                <IdoMezo className="beviteli ido" value={idoMezo(b.starts)}
                                       onChange={(v) => szunetModosit(d.weekday, i, { starts: v })}
                                       ariaLabel="Szünet kezdete" />
                                <IdoMezo className="beviteli ido" value={idoMezo(b.ends)}
                                       onChange={(v) => szunetModosit(d.weekday, i, { ends: v })}
                                       ariaLabel="Szünet vége" />
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

        <Fejbe>
          <MentesJelzo allapot={allapot} />
          <button className="btn btn-fo" disabled={allapot === 'megy'}
                  onClick={() => void fut(async () => {
                    for (const d of napok) await data.saveDayHours(d)
                    setNapok(await data.getOpening())
                  })}>
            Mentés
          </button>
        </Fejbe>
      </div>
    </div>
  )
}

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
    data.getShopSettings().then(setS).catch((e) => setHiba(hibaSzoveg(e)))
  }, [data])

  if (hiba) return <div className="hibauzenet">{hiba}</div>
  if (!s) return <div className="betolt">Betöltés…</div>

  const mod = (patch: Partial<ShopSettings>) => setS({ ...s, ...patch })

  return (
    <div className="panelek">
      <div className="panel">
        <h3>Munkarend</h3>
        <div className="panel-torzs">
          <div className="mezo">
            <span>Leadás legkorábban</span>
            <IdoMezo ariaLabel="Leadás legkorábban" className="beviteli" value={idoMezo(s.drop_off_from)}
                   onChange={(v) => mod({ drop_off_from: v })} />
            <small>
              Nem a nyitás — ennél korábbra a rendszer nem ígér leadást. 7:15 azért
              van, mert 7:00-ra nem mindig sikerült beérni.
            </small>
          </div>

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

      <Fejbe>
        <MentesJelzo allapot={allapot} />
        <button className="btn btn-fo" disabled={allapot === 'megy'}
                onClick={() => void fut(async () => {
                  await data.saveShopSettings(s)
                  setS(await data.getShopSettings())
                })}>
          Mentés
        </button>
      </Fejbe>
    </div>
  )
}

const ures = (): DayOverride => ({
  day: maStr(), closed: true, opens: null, closes: null,
  work_starts: null, work_ends: null, parallel_slots: null, note: null,
})

function Kivetelnapok() {
  const { data } = useApp()
  const [sorok, setSorok] = useState<DayOverride[] | null>(null)
  const [uj, setUj] = useState<DayOverride>(ures)
  const [hiba, setHiba] = useState<string | null>(null)
  const { allapot, fut } = useMentes()

  const betolt = useCallback(() => {
    data.listDayOverrides(maStr()).then(setSorok).catch((e) => setHiba(hibaSzoveg(e)))
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
              <div className="mezo">
                <span>Nyitás</span>
                <IdoMezo ariaLabel="Nyitás" className="beviteli" value={idoMezo(uj.opens)}
                       onChange={(v) => mod({ opens: v })} />
              </div>
              <div className="mezo">
                <span>Zárás</span>
                <IdoMezo ariaLabel="Zárás" className="beviteli" value={idoMezo(uj.closes)}
                       onChange={(v) => mod({ closes: v })} />
              </div>
              <div className="mezo">
                <span>Munka kezdés</span>
                <IdoMezo ariaLabel="Munka kezdés" className="beviteli" value={idoMezo(uj.work_starts)}
                       onChange={(v) => mod({ work_starts: v })} />
              </div>
              <div className="mezo">
                <span>Munka vége</span>
                <IdoMezo ariaLabel="Munka vége" className="beviteli" value={idoMezo(uj.work_ends)}
                       onChange={(v) => mod({ work_ends: v })} />
              </div>
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
                      setUj({ ...ures(), day: uj.day })
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
