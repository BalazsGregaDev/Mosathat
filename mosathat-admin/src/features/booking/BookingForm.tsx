import { useEffect, useMemo, useState } from 'react'

import { useApp, useCatalog } from '../../state/AppContext'
import { useBookingForm } from '../../state/useBookingForm'
import { useMentetlen } from '../../state/useMentetlen'
import { ft, idotartam, napRovidCim } from '../../lib/format'
import {
  CATEGORY_LABEL, SCOPE_LABEL, type BookingScope, type BookingType,
  type Extra, type LatestStart, type VehicleCategory,
} from '../../lib/types'

const MERETEK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
const TERJEDELEM: BookingScope[] = ['TELJES', 'KULSO', 'BELSO']

// "Itt hagyja" elöl, mert ez a gyakoribb eset.
const TIPUSOK: { id: BookingType; cimke: string }[] = [
  { id: 'LEADOS', cimke: 'Itt hagyja' },
  { id: 'VAROS', cimke: 'Megvárja' },
  { id: 'TOBBNAPOS', cimke: 'Több napos' },
  { id: 'HOZOMVISZEM', cimke: 'Hozom-viszem' },
]

// ---------------------------------------------------------------------------
//  Időpont felvétele és módosítása — ugyanaz az űrlap.
//
//  A mezők sorrendje a telefonbeszélgetés sorrendje, nem esztétikai döntés.
//  Legfelül a kereső: a hívás első másodperceiben dől el, hogy ismerjük-e az
//  autót. Ha igen, a többi mező magától kitöltődik.
//
//  Ami szándékosan NINCS itt: az „erősen szennyezett" felár és a fix felár.
//  Telefonon nem látjuk az autót — ezek a munkalapra kerültek, ahol a kocsi
//  már ott áll.
// ---------------------------------------------------------------------------

export default function BookingForm({
  nap,
  bookingId,
  onBezar,
  onKesz,
}: {
  nap: string
  /** Ha meg van adva, szerkesztés. Ha nincs, új foglalás. */
  bookingId?: string | null
  onBezar: () => void
  onKesz: () => void
}) {
  const { data } = useApp()
  const katalogus = useCatalog()
  const {
    f, set, calc, menthetE, ment, mentes, hiba, tolt, szerkesztes,
    talalatok, keres, valasztott, talalatValaszt, ezcKeri,
  } = useBookingForm(true, nap, bookingId)

  // Ha bármit beírtak, egy véletlen oldalfrissítés (mobilon a lehúzás)
  // ne vigye el szó nélkül.
  useMentetlen(Boolean(f.name || f.plate || f.phone || f.companyName || f.packageId))

  const [sav, setSav] = useState<LatestStart[]>([])
  const [extrakNyitva, setExtrakNyitva] = useState(false)
  // Telefonon a korábbi vásárlás alapból ne foglalja a helyet.
  const [elozmenyNyitva, setElozmenyNyitva] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 701px)').matches,
  )

  useEffect(() => {
    const kezel = (e: KeyboardEvent) => e.key === 'Escape' && onBezar()
    window.addEventListener('keydown', kezel)
    return () => window.removeEventListener('keydown', kezel)
  }, [onBezar])

  // Szerkesztéskor nyitva legyenek az extrák, ha van választva.
  useEffect(() => {
    if (szerkesztes && Object.keys(f.extras).length > 0) setExtrakNyitva(true)
  }, [szerkesztes, f.extras])

  const kodSzerint = useMemo(
    () => Object.fromEntries(katalogus.packages.map((p) => [p.code, p.id])),
    [katalogus.packages],
  )

  function csomagAr(packageId: string) {
    return katalogus.packagePricing.find(
      (p) => p.package_id === packageId && p.category === f.category && p.scope === f.scope,
    )
  }
  function fullServiceAr(packageId: string) {
    return katalogus.fullServicePricing.find(
      (p) => p.package_id === packageId && p.category === f.category,
    )
  }

  // Belefér-e a munkaidőbe? Az ebédszünet-szabály az adatbázisból jön.
  useEffect(() => {
    if (f.bookingType !== 'VAROS' || !calc?.work_minutes) {
      setSav([])
      return
    }
    let el = true
    data.getLatestStart(f.date, calc.work_minutes).then((r) => el && setSav(r)).catch(() => el && setSav([]))
    return () => {
      el = false
    }
  }, [data, f.date, f.bookingType, calc?.work_minutes])

  const belefer = useMemo(() => {
    if (sav.length === 0 || !f.startTime) return null
    const w = sav.find((s) => f.startTime >= s.starts.slice(0, 5) && f.startTime < s.ends.slice(0, 5))
    if (!w) return { ok: false, uzenet: 'Ez az időpont munkaidőn kívülre esik.' }
    if (!w.fits) return { ok: false, uzenet: 'Ebben a sávban ennyi idő már nem fér el.' }
    const ok = f.startTime <= w.latest_start.slice(0, 5)
    return {
      ok,
      uzenet: ok
        ? `Belefér — ebben a sávban legkésőbb ${w.latest_start.slice(0, 5)}-kor kezdhető.`
        : `Ennyi munka legkésőbb ${w.latest_start.slice(0, 5)}-kor kezdhető ebben a sávban.`,
    }
  }, [sav, f.startTime])

  function extraAllit(e: Extra, be: boolean) {
    const uj = { ...f.extras }
    if (be) uj[e.id] = e.price_unit === 'ULES' ? 5 : e.price_unit === 'AJTO' ? 4 : 1
    else delete uj[e.id]
    set('extras', uj)
  }
  function darabAllit(id: string, n: number) {
    set('extras', { ...f.extras, [id]: Math.max(1, n) })
  }

  const valasztottExtrak = Object.keys(f.extras).length

  async function mentesGomb() {
    const id = await ment()
    if (id) onKesz()
  }

  return (
    <div className="fedo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onBezar()}>
      <div className="lap lap-szeles" role="dialog" aria-modal="true"
           aria-label={szerkesztes ? 'Időpont módosítása' : 'Új időpont'}>
        <div className="lap-fej">
          <h2>{szerkesztes ? 'Időpont módosítása' : 'Új időpont'}</h2>
          <span className="halk" style={{ fontSize: 'var(--m-sm)' }}>{napRovidCim(f.date)}</span>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          {tolt && <div className="betolt">Betöltés…</div>}

          {/* ---------- KERESŐ (csak új foglalásnál) ---------- */}
          {!szerkesztes && (
            <div className="szakasz">
              <div className="fej">
                Ismerjük már?
                {keres && <span className="jobbra halvany">keresés…</span>}
              </div>
              <div className="kereso">
                <input
                  className="beviteli"
                  value={f.keres}
                  onChange={(e) => set('keres', e.target.value)}
                  placeholder="Rendszám, név vagy cég"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                />
                {talalatok.length > 0 && (
                  <div className="talalatlista">
                    {talalatok.map((h) => (
                      <button
                        key={h.vehicle_id}
                        type="button"
                        className="talalatsor"
                        onClick={() => talalatValaszt(h)}
                      >
                        <span className="rendszam">{h.plate_raw}</span>
                        <span className="nev">
                          {h.company_name || h.customer_name}
                          {h.company_name && h.customer_name !== h.company_name && (
                            <span className="halk"> · {h.customer_name}</span>
                          )}
                        </span>
                        <span className="auto halk">
                          {[h.brand, h.model].filter(Boolean).join(' ')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------- KORÁBBI VÁSÁRLÁS ---------- */}
          {valasztott?.utolso_csomag && (
            <div className="talalat">
              <button
                type="button"
                className="elozmeny-nyito"
                onClick={() => setElozmenyNyitva((v) => !v)}
              >
                Korábbi vásárlás
                <span className="nyil">{elozmenyNyitva ? '−' : '+'}</span>
              </button>
              {elozmenyNyitva && (
                <button type="button" className="elozmeny" onClick={() => ezcKeri(kodSzerint)}>
                  <span className="datum">{valasztott.utolso_datum?.slice(0, 10)}</span>
                  <span className="mit">{valasztott.utolso_csomag}</span>
                  <span className="arat">{ft(valasztott.utolso_ar)}</span>
                  <span className="kerem">Ezt kéri →</span>
                </button>
              )}
            </div>
          )}

          {/* ---------- ÜGYFÉL ---------- */}
          <div className="szakasz">
            <div className="fej">Ügyfél</div>
            <div className="sor-2">
              <div className="mezo">
                <label htmlFor="nev">Név</label>
                <input id="nev" className="beviteli" value={f.name}
                       onChange={(e) => set('name', e.target.value)} autoComplete="off" />
              </div>
              <div className="mezo">
                <label htmlFor="tel">Telefonszám</label>
                <input id="tel" className="beviteli" type="tel" inputMode="tel" value={f.phone}
                       onChange={(e) => set('phone', e.target.value)} autoComplete="off" />
              </div>
            </div>
            <div className="sor-2">
              <div className="mezo">
                <label htmlFor="rendszam">Rendszám</label>
                <input id="rendszam" className="beviteli beviteli-rendszam" value={f.plate}
                       onChange={(e) => set('plate', e.target.value)}
                       autoComplete="off" spellCheck={false} />
              </div>
              <div className="mezo">
                <label htmlFor="ceg">Cég</label>
                <input id="ceg" className="beviteli" value={f.companyName}
                       onChange={(e) => set('companyName', e.target.value)} autoComplete="off" />
              </div>
            </div>
          </div>

          {/* ---------- JÁRMŰ ---------- */}
          <div className="szakasz">
            <div className="fej">Jármű</div>
            <div className="valaszto">
              {MERETEK.map((m) => (
                <button key={m} type="button" aria-pressed={f.category === m}
                        onClick={() => set('category', m)}>
                  {CATEGORY_LABEL[m]}
                </button>
              ))}
            </div>
            <div className="sor-3">
              <div className="mezo">
                <label htmlFor="marka">Márka</label>
                <input id="marka" className="beviteli" value={f.brand}
                       onChange={(e) => set('brand', e.target.value)} />
              </div>
              <div className="mezo">
                <label htmlFor="tipus">Típus</label>
                <input id="tipus" className="beviteli" value={f.model}
                       onChange={(e) => set('model', e.target.value)} />
              </div>
              <div className="mezo">
                <label htmlFor="ules">Ülések</label>
                <input id="ules" className="beviteli" type="number" inputMode="numeric"
                       min={2} max={9} value={f.seats}
                       onChange={(e) => set('seats', e.target.value)} />
              </div>
            </div>
          </div>

          {/* ---------- CSOMAG ---------- */}
          <div className="szakasz">
            <div className="fej">Csomag</div>
            <div className="csomagok">
              {katalogus.packages.map((p) => {
                const ar = csomagAr(p.id)
                const kivalasztott = f.packageId === p.id
                return (
                  <button key={p.id} type="button" className="csomag" aria-label={p.name}
                          aria-pressed={kivalasztott}
                          onClick={() => set('packageId', kivalasztott ? null : p.id)}>
                    <span className="jel" />
                    <span style={{ minWidth: 0 }}>
                      <span className="nev">{p.name}</span>
                      <span className="leiras">{p.description}</span>
                    </span>
                    <span className="arblokk">
                      <div className="ar">
                        {ar?.requires_quote || ar?.price_huf == null ? 'Érdeklődjön' : ft(ar.price_huf)}
                      </div>
                      <div className="ido">{idotartam(ar?.duration_minutes ?? null)}</div>
                    </span>
                  </button>
                )
              })}
            </div>

            {f.packageId && (
              <label className="jelolo" data-aktiv={f.fullService}>
                <input type="checkbox" checked={f.fullService}
                       onChange={(e) => set('fullService', e.target.checked)} />
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>Full Service</div>
                  <div className="halk" style={{ fontSize: 'var(--m-xs)' }}>
                    Mélytisztítás. Saját ára van, nem a csomag + extra összege.
                  </div>
                </span>
                <span className="szam" style={{ fontWeight: 600 }}>
                  {(() => {
                    const fs = fullServiceAr(f.packageId!)
                    return fs?.requires_quote || fs?.price_huf == null ? 'Érdeklődjön' : ft(fs.price_huf)
                  })()}
                </span>
              </label>
            )}

            <div className="valaszto">
              {TERJEDELEM.map((s) => (
                <button key={s} type="button" aria-pressed={f.scope === s} onClick={() => set('scope', s)}>
                  {SCOPE_LABEL[s]}
                </button>
              ))}
            </div>

            {f.scope !== 'TELJES' && calc && !calc.duration_known && (
              <div className="figyelmeztet">
                <span>
                  <strong>Nincs rá időadat.</strong> A csak kívül / csak belül munkák
                  időtartama még nincs feltöltve, ezért ez a foglalás nem terheli a napi
                  kapacitást.
                </span>
              </div>
            )}
          </div>

          {/* ---------- MIKOR ---------- */}
          <div className="szakasz">
            <div className="fej">Mikor</div>

            <div className="valaszto">
              {TIPUSOK.map((t) => (
                <button key={t.id} type="button" aria-pressed={f.bookingType === t.id}
                        onClick={() => set('bookingType', t.id)}>
                  {t.cimke}
                </button>
              ))}
            </div>

            <div className="sor-3">
              <div className="mezo">
                <label htmlFor="datum">Nap</label>
                <input id="datum" className="beviteli" type="date" value={f.date}
                       onChange={(e) => set('date', e.target.value)} />
              </div>

              {f.bookingType === 'VAROS' ? (
                <div className="mezo">
                  <label htmlFor="kezdes">Kezdés</label>
                  <input id="kezdes" className="beviteli szam" type="time" step={300}
                         value={f.startTime} onChange={(e) => set('startTime', e.target.value)} />
                </div>
              ) : (
                <>
                  <div className="mezo">
                    <label htmlFor="leadas">Leadás</label>
                    <input id="leadas" className="beviteli szam" type="time" step={300}
                           value={f.dropOffTime} onChange={(e) => set('dropOffTime', e.target.value)} />
                  </div>
                  {f.bookingType !== 'TOBBNAPOS' && (
                    <div className="mezo">
                      <label htmlFor="atvetel">Átvétel</label>
                      <input id="atvetel" className="beviteli szam" type="time" step={300}
                             value={f.pickUpTime} onChange={(e) => set('pickUpTime', e.target.value)} />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Többnaposnál a határidő nem csak nap: az autót órára kérik vissza. */}
            {f.bookingType === 'TOBBNAPOS' && (
              <div className="sor-2">
                <div className="mezo">
                  <label htmlFor="hatarnap">Határidő napja</label>
                  <input id="hatarnap" className="beviteli" type="date" value={f.deadlineDate}
                         onChange={(e) => set('deadlineDate', e.target.value)} />
                </div>
                <div className="mezo">
                  <label htmlFor="hataror">Határidő órája</label>
                  <input id="hataror" className="beviteli szam" type="time" step={300}
                         value={f.deadlineTime} onChange={(e) => set('deadlineTime', e.target.value)} />
                </div>
              </div>
            )}

            {belefer && (
              <div className={belefer.ok ? '' : 'figyelmeztet'}
                   style={belefer.ok
                     ? { fontSize: 'var(--m-sm)', color: 'var(--zold)', fontWeight: 500 }
                     : undefined}>
                {belefer.uzenet}
              </div>
            )}
          </div>

          {/* ---------- MEGJEGYZÉS ---------- */}
          <div className="szakasz">
            <div className="fej">Megjegyzés</div>
            <textarea className="beviteli" value={f.notes}
                      onChange={(e) => set('notes', e.target.value)} />
          </div>

          {/* ---------- EGYÉB SZOLGÁLTATÁSOK — legalul, összecsukva ---------- */}
          <div className="szakasz">
            <button type="button" className="osszecsuk" onClick={() => setExtrakNyitva((v) => !v)}>
              <span className="cim">Egyéb szolgáltatások</span>
              {valasztottExtrak > 0 && <span className="db">{valasztottExtrak}</span>}
              <span className="nyil">{extrakNyitva ? '−' : '+'}</span>
            </button>

            {extrakNyitva && (
              <div className="extrak">
                {katalogus.extras.map((e) => {
                  const aktiv = f.extras[e.id] !== undefined
                  const darabos = e.price_unit === 'ULES' || e.price_unit === 'AJTO' || e.price_unit === 'LITER'
                  return (
                    <div key={e.id}>
                      <label className="extra" data-aktiv={aktiv}>
                        <input type="checkbox" checked={aktiv}
                               onChange={(ev) => extraAllit(e, ev.target.checked)} />
                        <span className="nev">{e.name}</span>
                        <span className={`ar ${e.price_huf == null ? 'kerdes' : ''}`}>
                          {e.requires_quote
                            ? 'árajánlat'
                            : e.price_huf == null
                              ? 'ár hiányzik'
                              : `${ft(e.price_huf)}${
                                  e.price_unit === 'ULES' ? ' / ülés'
                                  : e.price_unit === 'AJTO' ? ' / ajtó'
                                  : e.price_unit === 'LITER' ? ' / liter' : ''
                                }`}
                        </span>
                      </label>

                      {aktiv && darabos && (
                        <div className="mennyiseg">
                          {e.price_unit === 'ULES' && (
                            <>
                              <button type="button"
                                      className={`btn btn-kicsi ${f.extras[e.id] === 5 ? 'btn-fo' : ''}`}
                                      onClick={() => darabAllit(e.id, 5)}>
                                Teljes (5 ülés)
                              </button>
                              <span className="magyarazat">vagy</span>
                            </>
                          )}
                          <input className="darab" type="number" inputMode="numeric"
                                 min={1} max={9} value={f.extras[e.id]}
                                 onChange={(ev) => darabAllit(e.id, Number(ev.target.value))} />
                          <span className="magyarazat">
                            {e.price_unit === 'ULES' ? 'ülés' : e.price_unit === 'AJTO' ? 'ajtó' : 'liter'}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {calc?.requires_quote && (
            <div className="figyelmeztet">
              <span>
                <strong>Van benne árajánlatos tétel.</strong> A lent látszó összeg csak
                részösszeg — a végleges árat a munka után kell rögzíteni.
              </span>
            </div>
          )}

          {hiba && <div className="hibauzenet">{hiba}</div>}
        </div>

        <div className="lap-lab">
          <div className="osszeg">
            <span className="ertek">{calc ? ft(calc.price_huf) : '—'}</span>
            <span className="alatta">
              {calc
                ? [
                    calc.work_minutes ? idotartam(calc.work_minutes) + ' munka' : 'idő ismeretlen',
                    calc.rest_minutes ? idotartam(calc.rest_minutes) + ' száradás' : null,
                  ].filter(Boolean).join(' · ')
                : 'válassz csomagot vagy szolgáltatást'}
            </span>
          </div>

          <div className="gombok">
            <button className="btn" onClick={onBezar} disabled={mentes}>Mégse</button>
            <button className="btn btn-fo" onClick={mentesGomb} disabled={!menthetE || mentes}>
              {mentes ? 'Mentés…' : szerkesztes ? 'Módosítás mentése' : 'Foglalás rögzítése'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
