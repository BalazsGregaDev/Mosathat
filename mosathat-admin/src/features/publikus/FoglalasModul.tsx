import { useEffect, useMemo, useRef, useState } from 'react'

import { useApp, useCatalog } from '../../state/AppContext'
import { napBeosztasBetolt, type NapBeosztas } from '../../state/napBeosztas'
import { napAllapot, ora, type Lehetoseg, type NapAllapot, type TiltottSav } from '../../lib/befer'
import { ft, hetHetfoje, idotartam, maStr, napCim, napokRovid, napPlusz } from '../../lib/format'
import {
  CATEGORY_LABEL, SCOPE_LABEL,
  type BookingScope, type Quote, type VehicleCategory,
} from '../../lib/types'

// ---------------------------------------------------------------------------
//  Időpontfoglalás — a publikus oldal foglalási modulja, próbaüzemben
//
//  Ez kerül majd a weboldalra („Foglalás" szekció). Amíg nem tudjuk, hogy
//  fog kinézni a publikus oldal, itt él, a fejlesztői fiók menüjében: minden
//  kipróbálható, és amit beküldünk, VALÓDI kérésként jelenik meg a napi
//  nézetben („Online kérés" — Visszaigazol / Elutasít).
//
//  A lépések, ahogy az ügyfél látja:
//
//    1. Milyen autó          Személyautó / SUV / Kisbusz
//    2. Csomag               Start / Premium / Elit — az árral
//    3. Mit                  Teljes / Csak kívül / Csak belül
//    4. Extrák               amik online is foglalhatók (fix áruak)
//    5. Megvárja / Itt hagyja
//    6. Nap                  naptár: szabad / kevés hely / tele / zárva
//    7. Időpont              megvárja: kezdés; itt hagyja: mikor hozza
//    8. Adatok, összegzés, küldés
//
//  A naptár színe és a választható időpontok a beosztásból jönnek
//  (lib/befer.ts): ugyanaz a számítás, mint a napi nézet idővonalán. Csak
//  olyat lehet kérni, ami befér.
//
//  Szabályok (egyelőre itt rögzítve, később a Beállításokba):
//    - legkorábban holnapra, legfeljebb 8 hétre előre
//    - csak egynapos „megvárja" és „itt hagyja" (a többnapos és a
//      hozom-viszem telefonon)
//    - csak fix áras extrák (az árajánlatosak telefonon)
//    - ebédszünet: 11:15 és 12:45 között nem kínálunk kezdést / hozást
// ---------------------------------------------------------------------------

const KATEGORIAK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
const TERJEDELMEK: BookingScope[] = ['TELJES', 'KULSO', 'BELSO']
const HETEK_OLDALANKENT = 2
const LEGTOBB_HET = 8
const HET_NAPJAI = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo']
/**
 * Ebédszünet: 11:15 és 12:45 között (a két végével együtt) nem kínálunk
 * kezdést és hozást. 11:00-ra még lehet, 13:00-tól újra.
 */
const EBED: TiltottSav[] = [{ tol: 11 * 60 + 15, ig: 12 * 60 + 45 }]
/**
 * A műhely telefonszáma (késés esetén ezt hívják). Ideiglenes: a valódi
 * számot ide kell beírni — később a Beállításokból jön.
 */
const UZLET_TELEFON = '+36 __ ___ ____'

type Tipus = 'VAROS' | 'LEADOS'

interface Adatok {
  nev: string
  telefon: string
  email: string
  rendszam: string
  marka: string
  modell: string
  megjegyzes: string
}

const URES_ADATOK: Adatok = { nev: '', telefon: '', email: '', rendszam: '', marka: '', modell: '', megjegyzes: '' }

const ALLAPOT_NEV: Record<NapAllapot, string> = {
  szabad: 'Szabad', keves: 'Kevés hely', tele: 'Tele', zarva: 'Zárva',
}

/** 495 → "08:15" (az adatbázisnak) */
function hhmm(perc: number): string {
  return `${String(Math.floor(perc / 60)).padStart(2, '0')}:${String(perc % 60).padStart(2, '0')}`
}

export default function FoglalasModul({ onNapiNezet }: {
  /** A sikeres kérés után: ugrás a napi nézetre (próbához). */
  onNapiNezet?: (nap: string) => void
}) {
  const { data, revision, refresh } = useApp()
  const katalogus = useCatalog()
  const holnap = napPlusz(maStr(), 1)
  const utolsoNap = napPlusz(holnap, LEGTOBB_HET * 7)

  // --- a választások ---------------------------------------------------------
  const [kat, setKat] = useState<VehicleCategory>('SZEMELYAUTO')
  const [csomagId, setCsomagId] = useState<string | null>(null)
  const [scope, setScope] = useState<BookingScope>('TELJES')
  const [extrak, setExtrak] = useState<Set<string>>(new Set())
  const [tipus, setTipus] = useState<Tipus | null>(null)
  const [nap, setNap] = useState<string | null>(null)
  const [ido, setIdo] = useState<Lehetoseg | null>(null)
  const [adatok, setAdatok] = useState<Adatok>(URES_ADATOK)
  const [elfogad, setElfogad] = useState(false)
  const [oldal, setOldal] = useState(0)
  const [kuld, setKuld] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [kesz, setKesz] = useState<{ id: string; nap: string } | null>(null)
  const [reszletek, setReszletek] = useState(false)

  const csomagok = useMemo(
    () => katalogus.packages.filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order),
    [katalogus.packages],
  )
  const ar = (pid: string, s: BookingScope) => katalogus.packagePricing.find(
    (x) => x.package_id === pid && x.category === kat && x.scope === s)
  const foglalhato = (pid: string, s: BookingScope) => {
    const a = ar(pid, s)
    return Boolean(a && a.price_huf != null && !a.requires_quote)
  }
  // Online csak a fix áras, darabra / alkalomra szóló extrák.
  const onlineExtrak = useMemo(
    () => katalogus.extras
      .filter((e) => e.active && e.price_huf != null && !e.requires_quote
        && (e.price_unit === 'ALKALOM' || e.price_unit === 'DB'))
      .sort((a, b) => a.sort_order - b.sort_order),
    [katalogus.extras],
  )

  // Ha a választott terjedelem ennél a csomagnál / méretnél nem foglalható,
  // a teljes számít (a választás megmarad, ha visszavált olyanra, ahol van).
  const sc: BookingScope = csomagId && !foglalhato(csomagId, scope) ? 'TELJES' : scope

  // --- az ár és a munkaidő (ugyanaz az árazás, mint a foglalásnál) ------------
  const [ajanlat, setAjanlat] = useState<Quote | null>(null)
  const extraLista = useMemo(() => [...extrak].map((id) => ({ extra_id: id, quantity: 1 })), [extrak])
  useEffect(() => {
    if (!csomagId) { setAjanlat(null); return }
    let el = true
    data.quoteBooking({
      package_id: csomagId, category: kat, scope: sc, full_service: false, extras: extraLista,
      surcharge_pct: 0, surcharge_fix: 0, booking_type: tipus ?? 'LEADOS',
      service_date: nap ?? holnap, company_id: null, company_name: null,
      customer_id: null, vehicle_id: null, contract_kind: null,
    }).then((q) => { if (el) setAjanlat(q) }).catch(() => { if (el) setAjanlat(null) })
    return () => { el = false }
  }, [data, csomagId, kat, sc, extraLista, tipus, nap, holnap])
  const perc = ajanlat?.work_minutes ?? null

  // --- a naptár: két hét oldalanként, a beosztásból számolt állapottal ---------
  const elsoHetfo = napPlusz(hetHetfoje(holnap), oldal * HETEK_OLDALANKENT * 7)
  const napok = useMemo(() => {
    const ki: string[] = []
    for (let h = 0; h < HETEK_OLDALANKENT; h++) {
      for (let i = 0; i < 6; i++) ki.push(napPlusz(elsoHetfo, h * 7 + i))
    }
    return ki
  }, [elsoHetfo])

  // A napok beosztása (gyorsítótárral: lapozáskor nem kérdezünk újra).
  const tar = useRef(new Map<string, NapBeosztas>())
  const tarRev = useRef(revision)
  const [napAdat, setNapAdat] = useState<Map<string, NapBeosztas>>(new Map())
  useEffect(() => {
    if (tarRev.current !== revision) { tar.current = new Map(); tarRev.current = revision }
    let el = true
    const kell = napok.filter((d) => d >= holnap && d <= utolsoNap && !tar.current.has(d))
    Promise.all(kell.map((d) => napBeosztasBetolt(data, d).then((a) => tar.current.set(d, a))))
      .then(() => { if (el) setNapAdat(new Map(tar.current)) })
      .catch(() => { if (el) setNapAdat(new Map(tar.current)) })
    return () => { el = false }
  }, [data, napok, holnap, utolsoNap, revision])

  const napErtek = useMemo(() => {
    const m = new Map<string, ReturnType<typeof napAllapot>>()
    if (!perc || !tipus) return m
    for (const d of napok) {
      const a = napAdat.get(d)
      if (a) m.set(d, napAllapot(a.negyedek, a.munkak, perc, tipus, a.most, EBED))
    }
    return m
  }, [napok, napAdat, perc, tipus])

  // Ha változik a kérés (csomag, extra, típus), a választott nap/időpont
  // lehet, hogy már nem jó: az időpontot újra kell választani.
  useEffect(() => { setIdo(null) }, [perc, tipus, nap])

  const lehetosegek = nap ? napErtek.get(nap)?.lehetosegek ?? [] : []

  // --- küldés ----------------------------------------------------------------
  const adatokRendben = Boolean(adatok.nev.trim() && adatok.telefon.trim() && adatok.rendszam.trim())
  const kuldheto = Boolean(csomagId && tipus && nap && ido && adatokRendben && elfogad && !kuld)

  async function kuldes() {
    if (!kuldheto || !csomagId || !tipus || !nap || !ido) return
    setKuld(true)
    setHiba(null)
    try {
      const id = await data.onlineBooking({
        category: kat, scope: sc, package_id: csomagId, full_service: false, extras: extraLista,
        booking_type: tipus, service_date: nap,
        start_time: tipus === 'VAROS' ? hhmm(ido.tol) : null,
        drop_off_time: tipus === 'LEADOS' ? hhmm(ido.tol) : null,
        customer_name: adatok.nev.trim(), customer_phone: adatok.telefon.trim(),
        customer_email: adatok.email.trim() || null, plate_raw: adatok.rendszam.trim(),
        brand: adatok.marka.trim() || null, model: adatok.modell.trim() || null,
        notes: adatok.megjegyzes.trim() || null,
      })
      setKesz({ id, nap })
      refresh()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setKuld(false)
    }
  }

  function ujra() {
    setKesz(null); setNap(null); setIdo(null); setAdatok(URES_ADATOK); setElfogad(false); setHiba(null)
  }

  const set = <K extends keyof Adatok>(k: K, v: string) => setAdatok((x) => ({ ...x, [k]: v }))
  const csomag = csomagok.find((p) => p.id === csomagId) ?? null

  // --- siker ----------------------------------------------------------------
  if (kesz) {
    return (
      <div className="fogl">
        <ProbaSav />
        <section className="fogl-kartya fogl-siker">
          <h2>Köszönjük, megkaptuk a foglalási kérésed!</h2>
          <p>
            {napCim(kesz.nap)}, {ido && (tipus === 'VAROS' ? `kezdés: ${ora(ido.tol)}` : `hozás: ${ora(ido.tol)}`)}.
            Hamarosan visszaigazoljuk telefonon vagy e-mailben.
          </p>
          <div className="fogl-gombok">
            <button type="button" className="btn" onClick={ujra}>Új foglalás</button>
            {onNapiNezet && (
              <button type="button" className="btn btn-fo" onClick={() => onNapiNezet(kesz.nap)}>
                Megnézem a napi nézetben
              </button>
            )}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="fogl">
      <ProbaSav />

      <header className="fogl-fej">
        <h1>Időpontfoglalás</h1>
        <p>Válaszd ki, mit szeretnél, és mutatjuk a szabad időpontokat.</p>
      </header>

      {/* 1. autó */}
      <section className="fogl-kartya">
        <h2><span className="lepes">1</span> Milyen autóval jössz?</h2>
        <div className="fogl-valaszto harom">
          {KATEGORIAK.map((k) => (
            <button key={k} type="button" aria-pressed={kat === k} onClick={() => setKat(k)}>
              {CATEGORY_LABEL[k]}
            </button>
          ))}
        </div>
      </section>

      {/* 2. csomag */}
      <section className="fogl-kartya">
        <h2><span className="lepes">2</span> Csomag</h2>
        <div className="fogl-csomagok">
          {csomagok.map((p) => {
            const a = ar(p.id, 'TELJES')
            const lehet = foglalhato(p.id, 'TELJES')
            const plusz = katalogus.packageExtras.filter((x) => x.package_id === p.id)
            return (
              <button key={p.id} type="button" className="fogl-csomag" aria-pressed={csomagId === p.id}
                      disabled={!lehet} onClick={() => setCsomagId(p.id)}>
                <span className="nev">{p.name}</span>
                <span className="ar">{lehet ? `${ft(a!.price_huf)}-tól` : 'árajánlat alapján'}</span>
                {a?.duration_minutes ? <span className="ido">kb. {idotartam(a.duration_minutes)}</span> : null}
                {plusz.length > 0 && (
                  <span className="leiras">{plusz[0].parent_name} mindene, plusz: {plusz.map((x) => x.name).join(', ')}</span>
                )}
                {!plusz.length && p.description && <span className="leiras">{p.description}</span>}
              </button>
            )
          })}
        </div>
      </section>

      {/* 3. terjedelem */}
      {csomagId && (
        <section className="fogl-kartya">
          <h2><span className="lepes">3</span> Mit csináljunk?</h2>
          <div className="fogl-valaszto harom">
            {TERJEDELMEK.map((s) => {
              const a = ar(csomagId, s)
              return (
                <button key={s} type="button" aria-pressed={sc === s}
                        disabled={!foglalhato(csomagId, s)} onClick={() => setScope(s)}>
                  {SCOPE_LABEL[s]}
                  <small>{foglalhato(csomagId, s) ? ft(a!.price_huf) : 'telefonon'}</small>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* 4. extrák */}
      {csomagId && onlineExtrak.length > 0 && (
        <section className="fogl-kartya">
          <h2><span className="lepes">4</span> Kérsz még valamit? <small>nem kötelező</small></h2>
          <div className="fogl-extrak">
            {onlineExtrak.map((e) => (
              <label key={e.id} className="fogl-extra" data-be={extrak.has(e.id) || undefined}>
                <input type="checkbox" checked={extrak.has(e.id)}
                       onChange={() => setExtrak((x) => {
                         const u = new Set(x)
                         if (u.has(e.id)) u.delete(e.id); else u.add(e.id)
                         return u
                       })} />
                <span className="nev">{e.name}</span>
                <span className="ar">+ {ft(e.price_huf)}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* 5. megvárja / itt hagyja */}
      {csomagId && (
        <section className="fogl-kartya">
          <h2><span className="lepes">5</span> Megvárod, vagy itt hagyod?</h2>
          <div className="fogl-valaszto ketto">
            <button type="button" aria-pressed={tipus === 'VAROS'} onClick={() => setTipus('VAROS')}>
              Megvárom
              <small>Pontos kezdési időpontot választasz, és amíg kész, nálunk vársz.</small>
            </button>
            <button type="button" aria-pressed={tipus === 'LEADOS'} onClick={() => setTipus('LEADOS')}>
              Itt hagyom
              <small>Reggel behozod, és szólunk, amikor elkészült.</small>
            </button>
          </div>
        </section>
      )}

      {/* 6–7. nap és időpont */}
      {csomagId && tipus && (
        <section className="fogl-kartya">
          <h2><span className="lepes">6</span> Melyik nap?</h2>
          {!perc ? (
            <p className="fogl-figyel">
              Ehhez a választáshoz nincs megadva munkaidő, ezért nem tudunk szabad
              időpontot számolni. Kérjük, hívj minket.
            </p>
          ) : (
            <>
              <div className="fogl-lapozo">
                <button type="button" className="btn" disabled={oldal === 0} onClick={() => setOldal((o) => o - 1)}>‹</button>
                <span>{napokRovid(napok[0], napok[napok.length - 1])}</span>
                <button type="button" className="btn" disabled={napPlusz(elsoHetfo, HETEK_OLDALANKENT * 7) > utolsoNap}
                        onClick={() => setOldal((o) => o + 1)}>›</button>
              </div>
              <div className="fogl-naptar">
                {HET_NAPJAI.map((n) => <div key={n} className="fogl-napfej">{n}</div>)}
                {napok.map((d) => {
                  const korai = d < holnap || d > utolsoNap
                  const e = napErtek.get(d)
                  const allapot: NapAllapot | 'tolt' | 'korai' = korai ? 'korai' : e?.allapot ?? 'tolt'
                  const valaszthato = allapot === 'szabad' || allapot === 'keves'
                  return (
                    <button key={d} type="button" className="fogl-nap" data-allapot={allapot}
                            aria-pressed={nap === d} disabled={!valaszthato}
                            title={e && reszletek ? `${e.lehetosegek.length} időpont · még ${e.meg} ilyen autó fér be` : undefined}
                            onClick={() => setNap(d)}>
                      <span className="szam">{Number(d.slice(8, 10))}</span>
                      <span className="allapot">
                        {allapot === 'korai' ? '' : allapot === 'tolt' ? '…' : ALLAPOT_NEV[allapot]}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="fogl-jelmagyarazat">
                <span data-allapot="szabad">Szabad</span>
                <span data-allapot="keves">Kevés hely</span>
                <span data-allapot="tele">Tele</span>
              </div>

              {nap && (
                <>
                  <h2 className="fogl-al"><span className="lepes">7</span>
                    {tipus === 'VAROS' ? ' Mikor kezdjük?' : ' Mikor hozod?'} <small>{napCim(nap)}</small>
                  </h2>
                  {lehetosegek.length === 0 ? (
                    <p className="fogl-figyel">Erre a napra már nincs szabad időpont.</p>
                  ) : (
                    <div className="fogl-idok">
                      {lehetosegek.map((l) => (
                        <button key={l.tol} type="button" aria-pressed={ido?.tol === l.tol} onClick={() => setIdo(l)}>
                          {/* csak az óra:perc (itt hagyásnál alatta kicsiben, mikorra kész) */}
                          {ora(l.tol)}
                          {tipus === 'LEADOS' && <small>kész kb. {l.kesz !== null ? ora(l.kesz) : '—'}</small>}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* érkezés: feltűnően, az időpontok alatt */}
                  <p className="fogl-erkezes">
                    Kérjük, ha lehet, a választott időpont előtt <strong>5–10 perccel</strong> érkezz.
                    Ha késel, kérjük, telefonálj: <a href={`tel:${UZLET_TELEFON.replace(/\s/g, '')}`}>{UZLET_TELEFON}</a>
                  </p>
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* 8. adatok */}
      {ido && (
        <section className="fogl-kartya">
          <h2><span className="lepes">8</span> Az adataid</h2>
          <div className="fogl-urlap">
            <div className="mezo"><label htmlFor="fo-nev">Név *</label>
              <input id="fo-nev" className="beviteli" value={adatok.nev} autoComplete="name"
                     onChange={(e) => set('nev', e.target.value)} /></div>
            <div className="mezo"><label htmlFor="fo-tel">Telefonszám *</label>
              <input id="fo-tel" className="beviteli" type="tel" value={adatok.telefon} autoComplete="tel"
                     placeholder="+36 30 123 4567" onChange={(e) => set('telefon', e.target.value)} /></div>
            <div className="mezo"><label htmlFor="fo-email">E-mail</label>
              <input id="fo-email" className="beviteli" type="email" value={adatok.email} autoComplete="email"
                     placeholder="a visszaigazoláshoz" onChange={(e) => set('email', e.target.value)} /></div>
            <div className="mezo"><label htmlFor="fo-rsz">Rendszám *</label>
              <input id="fo-rsz" className="beviteli" value={adatok.rendszam}
                     onChange={(e) => set('rendszam', e.target.value.toUpperCase())} /></div>
            <div className="mezo"><label htmlFor="fo-marka">Márka</label>
              <input id="fo-marka" className="beviteli" value={adatok.marka} onChange={(e) => set('marka', e.target.value)} /></div>
            <div className="mezo"><label htmlFor="fo-modell">Modell</label>
              <input id="fo-modell" className="beviteli" value={adatok.modell} onChange={(e) => set('modell', e.target.value)} /></div>
            <div className="mezo szeles"><label htmlFor="fo-megj">Megjegyzés</label>
              <textarea id="fo-megj" className="beviteli" value={adatok.megjegyzes}
                        placeholder="pl. kutyaszőr a hátsó ülésen" onChange={(e) => set('megjegyzes', e.target.value)} /></div>
          </div>
          <label className="fogl-feltetel">
            <input type="checkbox" checked={elfogad} onChange={(e) => setElfogad(e.target.checked)} />
            <span>Elfogadom a foglalási és lemondási feltételeket, és hozzájárulok, hogy az
              adataimat a foglalás kezeléséhez felhasználják.</span>
          </label>
        </section>
      )}

      {/* összegzés: mindig látszik, amint van csomag */}
      {csomag && (
        <section className="fogl-osszeg">
          <div className="sorok">
            <div><strong>{csomag.name}</strong> · {CATEGORY_LABEL[kat]} · {SCOPE_LABEL[sc]}</div>
            {extrak.size > 0 && (
              <div className="halk">+ {onlineExtrak.filter((e) => extrak.has(e.id)).map((e) => e.name).join(', ')}</div>
            )}
            {nap && ido && (
              <div>{napCim(nap)} · {tipus === 'VAROS' ? `kezdés: ${ora(ido.tol)}` : `hozás: ${ora(ido.tol)}`}</div>
            )}
          </div>
          <div className="osszeg">
            <span className="ar">{ajanlat ? ft(ajanlat.price_huf) : '—'}</span>
            <span className="halk">{perc ? `kb. ${idotartam(perc)}` : ''}</span>
          </div>
          <div className="kuld">
            {hiba && <div className="hibauzenet">{hiba}</div>}
            <button type="button" className="btn btn-fo" disabled={!kuldheto} onClick={() => void kuldes()}>
              {kuld ? 'Küldés…' : 'Foglalási kérés küldése'}
            </button>
            <small className="halk">
              A végleges ár az autó állapotától függően eltérhet, erősen szennyezett autón
              50% felárat számíthatunk fel.
            </small>
          </div>
        </section>
      )}

      {/* fejlesztői részletek — a publikus oldalon nem lesz ott */}
      <section className="fogl-fejleszto">
        <label>
          <input type="checkbox" checked={reszletek} onChange={(e) => setReszletek(e.target.checked)} />
          {' '}Fejlesztői részletek
        </label>
        {reszletek && (
          <ul>
            <li>Munkaidő: {perc ? `${perc} perc` : 'nincs'} · típus: {tipus ?? '—'}</li>
            <li>Napok: {napok.filter((d) => napErtek.has(d)).map((d) => {
              const e = napErtek.get(d)!
              return `${d.slice(5)}: ${ALLAPOT_NEV[e.allapot]} (${e.lehetosegek.length} időpont, még ${e.meg})`
            }).join(' · ') || '—'}</li>
            {nap && <li>{nap}: {napAdat.get(nap)?.munkak.length ?? 0} munka a beosztásban</li>}
          </ul>
        )}
      </section>
    </div>
  )
}

/** A próba jelzése a modul tetején. */
function ProbaSav() {
  return (
    <div className="fogl-proba">
      <strong>Előnézet:</strong> így működik majd a publikus oldalon. Amit itt beküldesz,
      valódi kérésként jelenik meg a napi nézetben („Online kérés").
    </div>
  )
}
