import { useEffect, useMemo, useState } from 'react'

import { useApp, useCatalog } from '../../state/AppContext'
import { useBookingForm } from '../../state/useBookingForm'
import { useMentetlen } from '../../state/useMentetlen'
import { ft, idotartam, napRovidCim } from '../../lib/format'
import {
  CATEGORY_LABEL, SCOPE_LABEL, type BookingScope, type BookingType,
  type Extra, type LatestStart, type VehicleCategory,
} from '../../lib/types'
import Sugo from '../common/Sugo'
import IdoMezo from '../common/IdoMezo'
import { CegValaszto, useCegEgyeztetes } from '../common/Ceg'

const MERETEK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
const TERJEDELEM: BookingScope[] = ['TELJES', 'KULSO', 'BELSO']

// "Itt hagyja" elöl, mert ez a gyakoribb eset. „Több napos" gomb nincs:
// azt a Viszi napja dönti el.
const TIPUSOK: { id: BookingType; cimke: string }[] = [
  { id: 'LEADOS', cimke: 'Itt hagyja' },
  { id: 'VAROS', cimke: 'Megvárja' },
  { id: 'HOZOMVISZEM', cimke: 'Hozom-viszem' },
]

// ---------------------------------------------------------------------------
//  Időpont felvétele és módosítása — ugyanaz az űrlap.
//
//  A mezők sorrendje a telefonbeszélgetés sorrendje, nem esztétikai döntés.
//  Legfelül a rendszám: a hívás első másodperceiben dől el, hogy ismerjük-e
//  az autót. Ez a mező EGYBEN kereső is — nincs külön kereső doboz, amibe
//  előbb be kellene írni ugyanazt. Ha van találat, egy koppintás kitölti a
//  többi mezőt; ha nincs, a beírt rendszám ott marad, ahova való.
//
//  Ugyanígy keres a Név mező is, csak az a nevek közt. Ugyanaz a két betű
//  mást jelent a kettőben: az „AB" a rendszámnál ABC-123, a névnél Abonyi.
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
  arlistaGombok,
  osztott,
}: {
  nap: string
  /** Ha meg van adva, szerkesztés. Ha nincs, új foglalás. */
  bookingId?: string | null
  onBezar: () => void
  onKesz: () => void
  /** Az árlistát nyitó gombok. A héj adja át, mert ő tartja az állapotot. */
  arlistaGombok?: React.ReactNode
  /** Nyitva az árlista: ilyenkor ez az ablak a bal oldalra húzódik. */
  osztott?: boolean
}) {
  const { data } = useApp()
  const katalogus = useCatalog()
  const {
    f, set, calc, menthetE, ment, mentes, hiba, setHiba, tolt, szerkesztes, szerzodeses,
    flottas, flottaDarab,
    talalatok, keres, keresMezo, keresoIras, keresoZar,
    valasztott, talalatValaszt, ezcKeri,
  } = useBookingForm(true, nap, bookingId)
  const [cegAblak, cegEgyeztet] = useCegEgyeztetes()

  // Ha bármit beírtak, egy véletlen oldalfrissítés (mobilon a lehúzás)
  // ne vigye el szó nélkül. (A csomag nem számít: a Start alapból ott van.)
  useMentetlen(Boolean(f.name || f.plate || f.phone || f.ceg.nev
    || Object.keys(f.extras).length))

  // A találatlista egy sora. Ugyanaz a rendszám és a név mező alatt, csak
  // más keresésből — ezért egy helyen van megírva.
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
    // A beírt (nem kiválasztott) cégnevet előbb összevetjük a meglévőkkel:
    // azonosnál csendben ahhoz kötjük, hasonlónál megkérdezzük.
    let ceg = f.ceg
    try {
      const e = await cegEgyeztet(f.ceg)
      if (e === null) return          // meggondolta magát: marad az űrlapon
      ceg = e
      set('ceg', e)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      return
    }
    const id = await ment(ceg)
    if (id) onKesz()
  }

  const viszi = f.pickUpDate && f.pickUpDate > f.date

  return (
    <div className={`fedo${osztott ? ' osztott' : ''}`} role="presentation"
         onMouseDown={(e) => e.target === e.currentTarget && onBezar()}>
      <div className="lap lap-szeles" role="dialog" aria-modal="true"
           aria-label={szerkesztes ? 'Időpont módosítása' : 'Új időpont'}>
        <div className="lap-fej">
          <h2>{szerkesztes ? 'Időpont módosítása' : 'Új időpont'}</h2>
          <span className="halk" style={{ fontSize: 'var(--m-sm)' }}>{napRovidCim(f.date)}</span>
          {/* Az árlista innen is nyitható: amíg ez az ablak nyitva van, a
              mögötte lévő fejléc nem kattintható. */}
          {arlistaGombok}
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          {tolt && <div className="betolt">Betöltés…</div>}

          {/* ---------- ISMERJÜK MÁR? — ügyfél és autó egy blokkban ----------
              A rendszám és a név mező EGYBEN kereső. Nincs külön kereső doboz:
              oda is ugyanezt kellett beírni, aztán még egyszer ide. */}
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
                       onKeyDown={(e) => e.key === 'Escape' && keresoZar()}
                       autoFocus={!szerkesztes}
                       autoComplete="off" spellCheck={false} />
                {keresMezo === 'RENDSZAM' && talalatLista}
              </div>
              <div className="mezo kereso">
                <label htmlFor="nev">Név</label>
                <input id="nev" className="beviteli" value={f.name}
                       onChange={(e) => keresoIras('NEV', e.target.value)}
                       onKeyDown={(e) => e.key === 'Escape' && keresoZar()}
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

            {/* Flottás cég (a szerződésben „Flottás autók"): több autó egyszerre,
                rendszám nélkül. Minden nyomással eggyel több autó aznapra. */}
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

          {/* ---------- MIKOR ----------
              Közvetlenül az ügyfél (telefonszám, cég) alatt: telefonon ez a
              második kérdés — „mikor hozná?" —, a jármű részletei ráérnek.
              Hozza és Viszi, mindkettő nappal. Ha a Viszi későbbi napra esik,
              a foglalás többnapos — és minden napján megjelenik a napi
              nézetben. Megvárja esetén nincs Viszi: akkor viszi, amikor kész. */}
          {flottaDarab > 0 ? (
          <div className="szakasz">
            <div className="fej">Mikor</div>
            {/* Flottás csoport: nap, típus, és EGY végső időpont — amikorra az
                utolsó autónak is el kell készülnie (hozom-viszemnél vissza kell
                érni vele). Hozza óra nincs: a csoport a nap elején áll. */}
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

            {/* Kérdőjeles: extra, külön választható. Az autót itt hagyják, de
                csak feltételesen vállaltuk el — ha befér, megcsináljuk, ha
                nem, nem. A nézetekben „???" jelzi a rendszám mellett. */}
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

          {/* ---------- JÁRMŰ ---------- */}
          <div className="szakasz">
            <div className="fej">Jármű</div>

            {/* Csak szerződéses cégnél: a cég autója (céges ár), vagy a dolgozó
                saját autója (magán ár). Az autó megjegyzi, legközelebb már
                ezzel nyílik. */}
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
              {MERETEK.map((m) => (
                <button key={m} type="button" aria-pressed={f.category === m}
                        onClick={() => set('category', m)}>
                  {CATEGORY_LABEL[m]}
                </button>
              ))}
            </div>
            {/* Az ülések száma kikerült: a Full Service öt ülésig szól, az
                ennél nagyobb autó kisbusz — a méret már megmondja. */}
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

          {/* ---------- CSOMAG ---------- */}
          <div className="szakasz">
            <div className="fej">Csomag</div>
            <div className="csomagok">
              {katalogus.packages.map((p) => {
                const ar = csomagAr(p.id)
                const kivalasztott = f.packageId === p.id
                // Szerződéses cégnél minden kártyán a cég ára áll (a választott
                // méretre és Flotta / Saját fajtára) — nem a listaár, ami
                // telefonban félrevezetne. Ahol nincs megállapodott ár, ott a
                // listaár marad, és a foglalás is azon megy.
                const szerzAr = calc?.contract_prices[p.id]
                return (
                  // Csomag nélkül nem lehet foglalni: a kiválasztottra kattintva
                  // nem vész el a választás, csak egy másikra váltani lehet.
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
                      {/* A súgó a címkén KÍVÜL van: ha belül lenne, a leírás
                          megnyitása egyben fel is venné a szolgáltatást. */}
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
                                : `${ft(e.price_huf)}${
                                    e.price_unit === 'ULES' ? ' / ülés'
                                    : e.price_unit === 'AJTO' ? ' / ajtó'
                                    : e.price_unit === 'LITER' ? ' / liter' : ''
                                  }`}
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
            <button className="btn" onClick={onBezar} disabled={mentes}>Mégse</button>
            <button className="btn btn-fo" onClick={() => void mentesGomb()}
                    disabled={!menthetE || mentes}>
              {mentes ? 'Mentés…' : szerkesztes ? 'Módosítás mentése'
                : flottaDarab > 0 ? `${flottaDarab} autó rögzítése` : 'Foglalás rögzítése'}
            </button>
          </div>
        </div>
      </div>
      {cegAblak}
    </div>
  )
}
