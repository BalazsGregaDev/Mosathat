import { useEffect, useMemo, useRef, useState } from 'react'

import { useApp, useCatalog } from '../../state/AppContext'
import BeferSor from './BeferSor'
import { useBookingForm } from '../../state/useBookingForm'
import { useMentetlen } from '../../state/useMentetlen'
import { ft, hibaSzoveg, idotartam, napRovidCim } from '../../lib/format'
import {
  CATEGORY_LABEL, EGYSEG, KATEGORIAK, SCOPE_LABEL, TERJEDELMEK, type BookingType,
  type Extra, type LatestStart,
} from '../../lib/types'
import Sugo from '../common/Sugo'
import IdoMezo from '../common/IdoMezo'
import Ablak from '../common/Ablak'
import { CegValaszto, useCegEgyeztetes } from '../common/Ceg'

const TIPUSOK: { id: BookingType; cimke: string }[] = [
  { id: 'LEADOS', cimke: 'Itt hagyja' },
  { id: 'VAROS', cimke: 'Megvárja' },
  { id: 'HOZOMVISZEM', cimke: 'Hozom-viszem' },
]

export default function BookingForm({
  nap,
  bookingId,
  onBezar,
  onKesz,
  arlistaGombok,
  arlistaPanel,
  osztott,
}: {
  nap: string
  bookingId?: string | null
  onBezar: () => void
  onKesz: () => void
  arlistaGombok?: React.ReactNode
  arlistaPanel?: React.ReactNode
  osztott?: boolean
}) {
  const { data, user } = useApp()
  const katalogus = useCatalog()
  const fejleszto = user?.role === 'SUPERADMIN'
  const {
    f, set, calc, menthetE, ment, mentes, hiba, setHiba, tolt, szerkesztes, szerzodeses,
    flottas, flottaDarab,
    talalatok, keres, keresMezo, keresoIras, keresoZar,
    valasztott, talalatValaszt, ezcKeri,
  } = useBookingForm(nap, bookingId)
  const [cegAblak, cegEgyeztet] = useCegEgyeztetes()
  const [kuld, setKuld] = useState(false)
  const kuldRef = useRef(false)

  useMentetlen(Boolean(f.name || f.plate || f.phone || f.ceg.nev
    || Object.keys(f.extras).length))

  const talalatLista = talalatok.length === 0 ? null : (
    <div className="talalatlista">
      {talalatok.map((h) => (
        <button key={h.vehicle_id} type="button" className="talalatsor"
                onClick={() => talalatValaszt(h)}>
          <span className="rendszam">{h.plate_raw}</span>
          <span className="nev">
            {h.company_name || h.customer_name}
            {h.company_name && h.customer_name !== h.company_name && (
              <span className="halk"> · {h.customer_name}</span>
            )}
          </span>
          <span className="auto halk">{[h.brand, h.model].filter(Boolean).join(' ')}</span>
        </button>
      ))}
    </div>
  )

  const [sav, setSav] = useState<LatestStart[]>([])
  const [extrakNyitva, setExtrakNyitva] = useState(false)
  const [elozmenyNyitva, setElozmenyNyitva] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 701px)').matches,
  )

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
    if (kuldRef.current) return
    kuldRef.current = true
    setKuld(true)
    try {
      let ceg = f.ceg
      try {
        const e = await cegEgyeztet(f.ceg)
        if (e === null) return
        ceg = e
        set('ceg', e)
      } catch (e) {
        setHiba(hibaSzoveg(e))
        return
      }
      const id = await ment(ceg)
      if (id) onKesz()
    } finally {
      kuldRef.current = false
      setKuld(false)
    }
  }

  const viszi = f.pickUpDate && f.pickUpDate > f.date
  const megse = () => { if (!mentes && !kuld) onBezar() }

  return (
    <Ablak osztaly={`fedo${osztott ? ' osztott' : ''}`}
           cimke={szerkesztes ? 'Időpont módosítása' : 'Új időpont'}
           onEsc={megse} onHatter={megse}>
      <div className="lap lap-szeles">
        <div className="lap-fej">
          <h2>{szerkesztes ? 'Időpont módosítása' : 'Új időpont'}</h2>
          <span className="halk" style={{ fontSize: 'var(--m-sm)' }}>{napRovidCim(f.date)}</span>
          {arlistaGombok}
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          {tolt && <div className="betolt">Betöltés…</div>}

          <div className="szakasz">
            <div className="fej">
              {szerkesztes ? 'Ügyfél' : 'Ismerjük már?'}
              {keres && <span className="jobbra halvany">keresés…</span>}
            </div>

            <div className="sor-2">
              <div className="mezo kereso">
                <label htmlFor="rendszam">Rendszám</label>
                <input id="rendszam" className="beviteli beviteli-rendszam"
                       value={flottaDarab > 0 ? '' : f.plate}
                       disabled={flottaDarab > 0}
                       placeholder={flottaDarab > 0 ? 'utólag, autónként' : undefined}
                       onChange={(e) => keresoIras('RENDSZAM', e.target.value)}
                       onKeyDown={(e) => {
                         if (e.key === 'Escape' && keresMezo === 'RENDSZAM' && talalatok.length > 0) {
                           e.stopPropagation()
                           keresoZar()
                         }
                       }}
                       data-autofocus={!szerkesztes || undefined}
                       autoComplete="off" spellCheck={false} />
                {keresMezo === 'RENDSZAM' && talalatLista}
              </div>
              <div className="mezo kereso">
                <label htmlFor="nev">Név</label>
                <input id="nev" className="beviteli" value={f.name}
                       onChange={(e) => keresoIras('NEV', e.target.value)}
                       onKeyDown={(e) => {
                         if (e.key === 'Escape' && keresMezo === 'NEV' && talalatok.length > 0) {
                           e.stopPropagation()
                           keresoZar()
                         }
                       }}
                       autoComplete="off" />
                {keresMezo === 'NEV' && talalatLista}
              </div>
            </div>

            <div className="sor-2">
              <div className="mezo">
                <label htmlFor="tel">Telefonszám</label>
                <input id="tel" className="beviteli" type="tel" inputMode="tel" value={f.phone}
                       onChange={(e) => set('phone', e.target.value)} autoComplete="off" />
              </div>
              <div className="mezo">
                <label htmlFor="ceg">Cég</label>
                <CegValaszto inputId="ceg" ertek={f.ceg} onValt={(c) => set('ceg', c)} />
              </div>
            </div>

            {flottas && !szerkesztes && (
              <div className="flotta-hozzaad">
                <button type="button" className="btn" onClick={() => set('flottaDarab', flottaDarab + 1)}>
                  + Autó hozzáadása
                </button>
                {flottaDarab > 0 && (
                  <>
                    <span className="flotta-osszeg">
                      <strong>{f.ceg.nev}</strong>
                      <span className="cimke-pill flotta-db">{flottaDarab} darab</span>
                    </span>
                    <button type="button" className="btn btn-kicsi" aria-label="Eggyel kevesebb autó"
                            onClick={() => set('flottaDarab', flottaDarab - 1)}>−</button>
                    <span className="halk">
                      Rendszám most nem kell: a munkalapon autónként utólag beírható.
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

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

          {flottaDarab > 0 ? (
          <div className="szakasz">
            <div className="fej">Mikor</div>
            <div className="valaszto">
              {TIPUSOK.filter((t) => t.id !== 'VAROS').map((t) => (
                <button key={t.id} type="button"
                        aria-pressed={(f.bookingType === 'VAROS' ? 'LEADOS' : f.bookingType) === t.id}
                        onClick={() => set('bookingType', t.id)}>
                  {t.cimke}
                </button>
              ))}
            </div>
            <div className="sor-2">
              <div className="mezo">
                <label htmlFor="datum">Nap</label>
                <input id="datum" className="beviteli" type="date" value={f.date}
                       onChange={(e) => set('date', e.target.value)} />
              </div>
              <div className="mezo">
                <label htmlFor="vegso">
                  {f.bookingType === 'HOZOMVISZEM' ? 'Visszaérni' : 'Kész legyen'}
                </label>
                <IdoMezo id="vegso" value={f.pickUpTime} torolheto placeholder="nap végéig"
                         cim={f.bookingType === 'HOZOMVISZEM' ? 'Visszaérni' : 'Kész legyen'}
                         onChange={(v) => set('pickUpTime', v)} />
                <small>Amikorra az utolsó autónak is {f.bookingType === 'HOZOMVISZEM'
                  ? 'vissza kell érnie' : 'el kell készülnie'}.</small>
              </div>
            </div>
          </div>
          ) : (
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

            {f.bookingType === 'VAROS' ? (
              <div className="sor-2">
                <div className="mezo">
                  <label htmlFor="datum">Nap</label>
                  <input id="datum" className="beviteli" type="date" value={f.date}
                         onChange={(e) => set('date', e.target.value)} />
                </div>
                <div className="mezo">
                  <label htmlFor="kezdes">Kezdés</label>
                  <IdoMezo id="kezdes" value={f.startTime} cim="Kezdés"
                           onChange={(v) => set('startTime', v)} />
                </div>
              </div>
            ) : (
              <>
                <div className="napora-sor">
                  <span className="napora-cim">Hozza</span>
                  <div className="sor-2">
                    <div className="mezo">
                      <label htmlFor="datum">Nap</label>
                      <input id="datum" className="beviteli" type="date" value={f.date}
                             onChange={(e) => set('date', e.target.value)} />
                    </div>
                    <div className="mezo">
                      <label htmlFor="leadas">Óra</label>
                      <IdoMezo id="leadas" value={f.dropOffTime} cim="Hozza — óra"
                               onChange={(v) => set('dropOffTime', v)} />
                    </div>
                  </div>
                </div>
                <div className="napora-sor">
                  <span className="napora-cim">Viszi</span>
                  <div className="sor-2">
                    <div className="mezo">
                      <label htmlFor="viszinap">Nap</label>
                      <input id="viszinap" className="beviteli" type="date" min={f.date}
                             value={f.pickUpDate || f.date}
                             onChange={(e) => set('pickUpDate',
                               e.target.value && e.target.value !== f.date ? e.target.value : '')} />
                    </div>
                    <div className="mezo">
                      <label htmlFor="atvetel">Óra</label>
                      <IdoMezo id="atvetel" value={f.pickUpTime} cim="Viszi — óra" torolheto
                               placeholder="nincs megbeszélve"
                               onChange={(v) => set('pickUpTime', v)} />
                    </div>
                  </div>
                </div>
                {viszi && (
                  <div className="tobbnapos-jelzes">
                    Többnapos ({napRovidCim(f.date)} – {napRovidCim(f.pickUpDate)}): minden
                    napján megjelenik a napi nézetben.
                  </div>
                )}
              </>
            )}

            <div className="valaszto">
              <button type="button" className="kerdojel-gomb" aria-pressed={f.tentative}
                      onClick={() => set('tentative', !f.tentative)}>
                Kérdőjeles (???)
              </button>
            </div>
            {f.tentative && (
              <div className="figyelmeztet">
                <span>
                  <strong>Feltételesen vállalva:</strong> ha befér, megcsináljuk, ha nem,
                  nem. Ha nem fér be, a napi nézetben a „Nem fért be" gombbal 0 Ft-tal
                  lezárható.
                </span>
              </div>
            )}

            {fejleszto && (
              <BeferSor datum={f.date} tipus={f.bookingType} kezdes={f.startTime}
                        hozza={f.dropOffTime} visziNap={f.pickUpDate} viszi={f.pickUpTime}
                        perc={calc?.work_minutes} kihagy={bookingId ?? null}
                        onIdo={(mezo, v) => set(mezo, v)} />
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
          )}

          <div className="szakasz">
            <div className="fej">Jármű</div>

            {szerzodeses && (
              <div className="mezo">
                <span className="cimke">Jármű típus</span>
                <div className="valaszto">
                  <button type="button" aria-pressed={(f.contractKind ?? 'FLOTTA') === 'FLOTTA'}
                          onClick={() => set('contractKind', 'FLOTTA')}>
                    Flotta
                  </button>
                  <button type="button" aria-pressed={f.contractKind === 'SAJAT'}
                          onClick={() => set('contractKind', 'SAJAT')}>
                    Saját
                  </button>
                </div>
                <small className="halk">
                  {(f.contractKind ?? 'FLOTTA') === 'FLOTTA'
                    ? 'A cég autója — a szerződés céges ára.'
                    : 'A dolgozó saját autója — a szerződés magán ára.'}
                </small>
              </div>
            )}

            <div className="valaszto">
              {KATEGORIAK.map((m) => (
                <button key={m} type="button" aria-pressed={f.category === m}
                        onClick={() => set('category', m)}>
                  {CATEGORY_LABEL[m]}
                </button>
              ))}
            </div>
            <div className="sor-2">
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
            </div>
          </div>

          <div className="szakasz">
            <div className="fej">Csomag</div>
            <div className="csomagok">
              {katalogus.packages.map((p) => {
                const ar = csomagAr(p.id)
                const kivalasztott = f.packageId === p.id
                const szerzAr = calc?.contract_prices[p.id]
                return (
                  <button key={p.id} type="button" className="csomag" aria-label={p.name}
                          aria-pressed={kivalasztott}
                          onClick={() => set('packageId', p.id)}>
                    <span className="jel" />
                    <span style={{ minWidth: 0 }}>
                      <span className="nev">{p.name}</span>
                      <span className="leiras">{p.description}</span>
                    </span>
                    <span className="arblokk">
                      <div className="ar">
                        {szerzAr != null ? ft(szerzAr)
                          : ar?.requires_quote || ar?.price_huf == null ? 'Érdeklődjön'
                          : ft(ar.price_huf)}
                      </div>
                      <div className="ido">
                        {szerzAr != null ? 'szerződéses ár' : idotartam(ar?.duration_minutes ?? null)}
                      </div>
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
              {TERJEDELMEK.map((s) => (
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

          <div className="szakasz">
            <div className="fej">Megjegyzés</div>
            <textarea className="beviteli" value={f.notes}
                      onChange={(e) => set('notes', e.target.value)} />
          </div>

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
                      <div className="extra-sav">
                        <label className="extra" data-aktiv={aktiv}>
                          <input type="checkbox" checked={aktiv}
                                 onChange={(ev) => extraAllit(e, ev.target.checked)} />
                          <span className="nev">{e.name}</span>
                          <span className={`ar ${e.price_huf == null ? 'kerdes' : ''}`}>
                            {e.requires_quote
                              ? 'árajánlat'
                              : e.price_huf == null
                                ? 'ár hiányzik'
                                : `${ft(e.price_huf)}${darabos ? ` / ${EGYSEG[e.price_unit]}` : ''}`}
                          </span>
                        </label>
                        {e.description?.trim() && (
                          <Sugo cim={e.name} szoveg={e.description} />
                        )}
                      </div>

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
                          <DarabMezo ertek={f.extras[e.id]} onValt={(n) => darabAllit(e.id, n)} />
                          <span className="magyarazat">{EGYSEG[e.price_unit]}</span>
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
            <span className="ertek">
              {calc ? ft(calc.price_huf * Math.max(1, flottaDarab)) : '—'}
            </span>
            <span className="alatta">
              {calc
                ? [
                    flottaDarab > 0 ? `${flottaDarab} autó × ${ft(calc.price_huf)}` : null,
                    calc.work_minutes
                      ? idotartam(calc.work_minutes * Math.max(1, flottaDarab)) + ' munka'
                      : 'idő ismeretlen',
                    calc.rest_minutes ? idotartam(calc.rest_minutes) + ' száradás' : null,
                    calc.contract_price ? 'szerződéses ár' : null,
                    (() => {
                      const fuvar = calc.lines.find((l) => l.kind === 'FUVAR')
                      return fuvar ? `benne ${ft(fuvar.price_huf)} fuvar` : null
                    })(),
                  ].filter(Boolean).join(' · ')
                : 'válassz csomagot'}
            </span>
          </div>

          <div className="gombok">
            <button className="btn" onClick={onBezar} disabled={mentes || kuld}>Mégse</button>
            <button className="btn btn-fo" onClick={() => void mentesGomb()}
                    disabled={!menthetE || mentes || kuld}>
              {mentes || kuld ? 'Mentés…' : szerkesztes ? 'Módosítás mentése'
                : flottaDarab > 0 ? `${flottaDarab} autó rögzítése` : 'Foglalás rögzítése'}
            </button>
          </div>
        </div>
      </div>
      {arlistaPanel}
      {cegAblak}
    </Ablak>
  )
}

function DarabMezo({ ertek, onValt }: { ertek: number; onValt: (n: number) => void }) {
  const [szoveg, setSzoveg] = useState(String(ertek))
  const [alap, setAlap] = useState(ertek)
  if (ertek !== alap) { setAlap(ertek); setSzoveg(String(ertek)) }
  return (
    <input className="darab" type="number" inputMode="numeric" min={1} max={9} value={szoveg}
           onChange={(ev) => {
             const s = ev.target.value
             setSzoveg(s)
             const n = Number(s)
             if (s !== '' && Number.isInteger(n) && n >= 1 && n <= 9) onValt(n)
           }}
           onBlur={() => setSzoveg(String(ertek))} />
  )
}
