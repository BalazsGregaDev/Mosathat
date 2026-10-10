import { useEffect, useMemo, useRef, useState } from 'react'

import { useApp, useRevizio, useCatalog } from '../../state/AppContext'
import { napBeosztasBetolt, type NapBeosztas } from '../../state/napBeosztas'
import { napAllapot, type Lehetoseg, type NapAllapot, type TiltottSav } from '../../lib/befer'
import {
  ft, hetHetfoje, hibaSzoveg, idotartam, maStr, napCim, napokRovid, napPlusz, percIdo, percOra,
} from '../../lib/format'
import {
  CATEGORY_LABEL, SCOPE_LABEL,
  type BookingScope, type Quote, type VehicleCategory,
} from '../../lib/types'

const KATEGORIAK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
const TERJEDELMEK: BookingScope[] = ['TELJES', 'KULSO', 'BELSO']
const HETEK_OLDALANKENT = 2
const LEGTOBB_HET = 8
const HET_NAPJAI = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo']
const EBED: TiltottSav[] = [
  { tol: 0, ig: 9 * 60 - 1 },
  { tol: 11 * 60 + 15, ig: 12 * 60 + 45 },
]
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

export default function FoglalasModul({ onNapiNezet }: {
  onNapiNezet?: (nap: string) => void
}) {
  const { data, refresh } = useApp()
  const revision = useRevizio()
  const katalogus = useCatalog()
  const holnap = napPlusz(maStr(), 1)
  const utolsoNap = napPlusz(holnap, LEGTOBB_HET * 7)

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
  const onlineExtrak = useMemo(
    () => katalogus.extras
      .filter((e) => e.active && e.price_huf != null && !e.requires_quote
        && (e.price_unit === 'ALKALOM' || e.price_unit === 'DB'))
      .sort((a, b) => a.sort_order - b.sort_order),
    [katalogus.extras],
  )

  const sc: BookingScope = csomagId && !foglalhato(csomagId, scope) ? 'TELJES' : scope

  const [ajanlat, setAjanlat] = useState<Quote | null>(null)
  const [ajanlatHiba, setAjanlatHiba] = useState<string | null>(null)
  const extraLista = useMemo(() => [...extrak].map((id) => ({ extra_id: id, quantity: 1 })), [extrak])
  useEffect(() => {
    if (!csomagId) { setAjanlat(null); setAjanlatHiba(null); return }
    let el = true
    data.quoteBooking({
      package_id: csomagId, category: kat, scope: sc, full_service: false, extras: extraLista,
      surcharge_pct: 0, surcharge_fix: 0, booking_type: tipus ?? 'LEADOS',
      service_date: nap ?? holnap, company_id: null, company_name: null,
      customer_id: null, vehicle_id: null, contract_kind: null,
    }).then((q) => { if (el) { setAjanlat(q); setAjanlatHiba(null) } })
      .catch((e) => { if (el) { setAjanlat(null); setAjanlatHiba(hibaSzoveg(e)) } })
    return () => { el = false }
  }, [data, csomagId, kat, sc, extraLista, tipus, nap, holnap])
  const perc = ajanlat?.work_minutes ?? null

  const elsoHetfo = napPlusz(hetHetfoje(holnap), oldal * HETEK_OLDALANKENT * 7)
  const napok = useMemo(() => {
    const ki: string[] = []
    for (let h = 0; h < HETEK_OLDALANKENT; h++) {
      for (let i = 0; i < 6; i++) ki.push(napPlusz(elsoHetfo, h * 7 + i))
    }
    return ki
  }, [elsoHetfo])

  const tar = useRef(new Map<string, NapBeosztas>())
  const tarRev = useRef(revision)
  const [napAdat, setNapAdat] = useState<Map<string, NapBeosztas>>(new Map())
  const [napHiba, setNapHiba] = useState<string | null>(null)
  useEffect(() => {
    if (tarRev.current !== revision) { tar.current = new Map(); tarRev.current = revision }
    const t = tar.current
    let el = true
    const kell = napok.filter((d) => d >= holnap && d <= utolsoNap && !t.has(d))
    Promise.all(kell.map((d) => napBeosztasBetolt(data, d).then((a) => { t.set(d, a) })))
      .then(() => { if (el) { setNapAdat(new Map(t)); setNapHiba(null) } })
      .catch((e) => { if (el) { setNapAdat(new Map(t)); setNapHiba(hibaSzoveg(e)) } })
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

  useEffect(() => { setIdo(null) }, [perc, tipus, nap])

  const lehetosegek = nap ? napErtek.get(nap)?.lehetosegek ?? [] : []

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
        start_time: tipus === 'VAROS' ? percIdo(ido.tol) : null,
        drop_off_time: tipus === 'LEADOS' ? percIdo(ido.tol) : null,
        customer_name: adatok.nev.trim(), customer_phone: adatok.telefon.trim(),
        customer_email: adatok.email.trim() || null, plate_raw: adatok.rendszam.trim(),
        brand: adatok.marka.trim() || null, model: adatok.modell.trim() || null,
        notes: adatok.megjegyzes.trim() || null,
      })
      setKesz({ id, nap })
      refresh()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setKuld(false)
    }
  }

  function ujra() {
    setKesz(null); setNap(null); setIdo(null); setAdatok(URES_ADATOK); setElfogad(false); setHiba(null)
  }

  const set = <K extends keyof Adatok>(k: K, v: string) => setAdatok((x) => ({ ...x, [k]: v }))
  const csomag = csomagok.find((p) => p.id === csomagId) ?? null

  if (kesz) {
    return (
      <div className="fogl">
        <ProbaSav />
        <section className="fogl-kartya fogl-siker">
          <h2>Köszönjük, megkaptuk a foglalási kérésed!</h2>
          <p>
            {napCim(kesz.nap)}, {ido && (tipus === 'VAROS' ? `kezdés: ${percOra(ido.tol)}` : `hozás: ${percOra(ido.tol)}`)}.
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

      {csomagId && tipus && (
        <section className="fogl-kartya">
          <h2><span className="lepes">6</span> Melyik nap?</h2>
          {ajanlatHiba ? (
            <p className="fogl-figyel">Nem sikerült kiszámolni az árat és az időt: {ajanlatHiba}</p>
          ) : !perc ? (
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
              {napHiba && <p className="fogl-figyel">Nem sikerült betölteni a szabad időpontokat: {napHiba}</p>}
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
                          {percOra(l.tol)}
                          {tipus === 'LEADOS' && <small>kész kb. {l.kesz !== null ? percOra(l.kesz) : '—'}</small>}
                        </button>
                      ))}
                    </div>
                  )}
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

      {csomag && (
        <section className="fogl-osszeg">
          <div className="sorok">
            <div><strong>{csomag.name}</strong> · {CATEGORY_LABEL[kat]} · {SCOPE_LABEL[sc]}</div>
            {extrak.size > 0 && (
              <div className="halk">+ {onlineExtrak.filter((e) => extrak.has(e.id)).map((e) => e.name).join(', ')}</div>
            )}
            {nap && ido && (
              <div>{napCim(nap)} · {tipus === 'VAROS' ? `kezdés: ${percOra(ido.tol)}` : `hozás: ${percOra(ido.tol)}`}</div>
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

function ProbaSav() {
  return (
    <div className="fogl-proba">
      <strong>Előnézet:</strong> így működik majd a publikus oldalon. Amit itt beküldesz,
      valódi kérésként jelenik meg a napi nézetben („Online kérés").
    </div>
  )
}
