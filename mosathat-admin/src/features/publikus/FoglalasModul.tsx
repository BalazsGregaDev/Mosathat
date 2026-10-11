import { useEffect, useMemo, useRef, useState } from 'react'

import { useApp, useRevizio, useCatalog } from '../../state/AppContext'
import { napBeosztasBetolt, type NapBeosztas } from '../../state/napBeosztas'
import { hataridoLehetosegek, napAllapot, type Lehetoseg, type NapAllapot, type TiltottSav } from '../../lib/befer'
import { negyedekbol } from '../../lib/beosztas'
import {
  ft, hetHetfoje, hibaSzoveg, idotartam, maStr, napCim, napokRovid, napPlusz, napRovidCim, percIdo, percOra,
} from '../../lib/format'
import {
  CATEGORY_LABEL, EGYSEG, SCOPE_LABEL, ULES_LABEL, ULESEK,
  type BookingScope, type Extra, type MeasureUnit, type Quote, type SeatMaterial, type VehicleCategory,
} from '../../lib/types'
import { csomagbanBenne } from '../../lib/csomag'
import type { DataSource } from '../../data/source'

const KATEGORIAK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
const TERJEDELMEK: BookingScope[] = ['TELJES', 'KULSO', 'BELSO']
const HETEK_OLDALANKENT = 2
const LEGTOBB_HET = 8
const HET_NAPJAI = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo']
const EBED: TiltottSav[] = [
  { tol: 0, ig: 9 * 60 - 1 },
  { tol: 11 * 60 + 15, ig: 12 * 60 + 45 },
]
const UZLET_TELEFON = '+36 1 506 0420'
const ALAP_DB: Record<MeasureUnit, number> = { ALKALOM: 1, DB: 1, ULES: 5, AJTO: 4, LITER: 1 }
const LEGTOBB_DB: Record<MeasureUnit, number> = { ALKALOM: 1, DB: 10, ULES: 9, AJTO: 6, LITER: 10 }
const ELVITEL_KEZDETE = 8 * 60
const LEGKESOBB_HATARIDO = 17 * 60

type Tipus = 'VAROS' | 'LEADOS'
type Elvitel = 'AZNAP' | 'MASNAP'

interface ElvitelAblak {
  nap: string
  tol: number
  ig: number
}

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
  const [fs, setFs] = useState(false)
  const [ules, setUles] = useState<SeatMaterial | null>(null)
  const [elvitel, setElvitel] = useState<Elvitel | null>(null)
  const [scope, setScope] = useState<BookingScope>('TELJES')
  const [extrak, setExtrak] = useState<Record<string, number>>({})
  const [tipus, setTipus] = useState<Tipus | null>(null)
  const [nap, setNap] = useState<string | null>(null)
  const [ido, setIdo] = useState<Lehetoseg | null>(null)
  const [hatarido, setHatarido] = useState<number | null>(null)
  const [adatok, setAdatok] = useState<Adatok>(URES_ADATOK)
  const [elfogad, setElfogad] = useState(false)
  const [oldal, setOldal] = useState(0)
  const [kuld, setKuld] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [kesz, setKesz] = useState<{ id: string; nap: string; mikor: string; elvitel: ElvitelAblak | null } | null>(null)
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
  const fsSor = csomagId
    ? katalogus.fullServicePricing.find((x) => x.package_id === csomagId && x.category === kat) ?? null
    : null
  const fsLehet = Boolean(fsSor && fsSor.price_huf != null && !fsSor.requires_quote)
  const fsBe = fs && fsLehet
  const szaradni = ules !== 'BOR'
  const sc: BookingScope = fsBe ? 'TELJES' : csomagId && !foglalhato(csomagId, scope) ? 'TELJES' : scope
  const tip: Tipus | null = fsBe ? (elvitel ? 'LEADOS' : null) : tipus
  const masnap = fsBe && elvitel === 'MASNAP'

  const kinaltExtrak = useMemo(
    () => katalogus.extras
      .filter((e) => e.active && !csomagbanBenne(e, csomagId, sc, fsBe))
      .sort((a, b) => a.sort_order - b.sort_order),
    [katalogus.extras, csomagId, sc, fsBe],
  )
  const rejtett = katalogus.extras.filter((e) => e.active && csomagbanBenne(e, csomagId, sc, fsBe)).length
  const valasztottExtrak = useMemo(
    () => kinaltExtrak.filter((e) => (extrak[e.id] ?? 0) > 0),
    [kinaltExtrak, extrak],
  )
  const egyeztetendo = valasztottExtrak.filter(egyeztetesre)

  function extraValt(e: Extra) {
    setExtrak((x) => {
      const u = { ...x }
      if (u[e.id]) delete u[e.id]
      else u[e.id] = ALAP_DB[e.price_unit]
      return u
    })
  }

  function extraDarab(e: Extra, n: number) {
    setExtrak((x) => ({ ...x, [e.id]: Math.min(LEGTOBB_DB[e.price_unit], Math.max(1, n)) }))
  }

  const [ajanlat, setAjanlat] = useState<Quote | null>(null)
  const [ajanlatHiba, setAjanlatHiba] = useState<string | null>(null)
  const extraLista = useMemo(
    () => valasztottExtrak.map((e) => ({ extra_id: e.id, quantity: extrak[e.id] })),
    [valasztottExtrak, extrak],
  )
  useEffect(() => {
    if (!csomagId) { setAjanlat(null); setAjanlatHiba(null); return }
    let el = true
    data.quoteBooking({
      package_id: csomagId, category: kat, scope: sc, full_service: fsBe, extras: extraLista,
      surcharge_pct: 0, surcharge_fix: 0, booking_type: tip ?? 'LEADOS',
      service_date: nap ?? holnap, company_id: null, company_name: null,
      customer_id: null, vehicle_id: null, contract_kind: null,
    }).then((q) => { if (el) { setAjanlat(q); setAjanlatHiba(null) } })
      .catch((e) => { if (el) { setAjanlat(null); setAjanlatHiba(hibaSzoveg(e)) } })
    return () => { el = false }
  }, [data, csomagId, kat, sc, fsBe, extraLista, tip, nap, holnap])
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
    if (!perc || !tip) return m
    for (const d of napok) {
      const a = napAdat.get(d)
      if (a) m.set(d, napAllapot(a.negyedek, a.munkak, perc, tip, a.most, EBED))
    }
    return m
  }, [napok, napAdat, perc, tip])

  useEffect(() => { setIdo(null) }, [perc, tip, nap])

  const elvitelKulcs = masnap && nap ? `${revision}|${nap}` : null
  const [elvitelek, setElvitelek] = useState<Map<string, ElvitelAblak | null>>(new Map())
  useEffect(() => {
    if (!elvitelKulcs || !nap || elvitelek.has(elvitelKulcs)) return
    let el = true
    elvitelAblak(data, nap)
      .then((x) => { if (el) setElvitelek((m) => new Map(m).set(elvitelKulcs, x)) })
      .catch(() => { if (el) setElvitelek((m) => new Map(m).set(elvitelKulcs, null)) })
    return () => { el = false }
  }, [data, elvitelKulcs, nap, elvitelek])
  const elvitelInfo = elvitelKulcs ? elvitelek.get(elvitelKulcs) ?? null : null

  const lehetosegek = nap ? napErtek.get(nap)?.lehetosegek ?? [] : []

  const hataridoKell = tip === 'LEADOS' && !masnap
  const hataridok = useMemo(() => {
    if (!hataridoKell || !ido || !perc || !nap) return []
    const a = napAdat.get(nap)
    if (!a || a.negyedek.length === 0) return []
    const zar = a.negyedek[a.negyedek.length - 1].ig
    return hataridoLehetosegek(a.negyedek, a.munkak, ido.tol, perc, Math.min(LEGKESOBB_HATARIDO, zar), a.most)
  }, [hataridoKell, ido, perc, nap, napAdat])
  const hat = hatarido !== null && hataridok.includes(hatarido) ? hatarido : hataridok[hataridok.length - 1] ?? null

  const adatokRendben = Boolean(adatok.nev.trim() && adatok.telefon.trim() && adatok.rendszam.trim())
  const fsRendben = !fsBe || (ules !== null && elvitel !== null)
  const hataridoRendben = !hataridoKell || hat !== null
  const kuldheto = Boolean(csomagId && tip && nap && ido && adatokRendben && fsRendben && hataridoRendben
    && elfogad && !kuld)

  async function kuldes() {
    if (!kuldheto || !csomagId || !tip || !nap || !ido) return
    setKuld(true)
    setHiba(null)
    try {
      const id = await data.onlineBooking({
        category: kat, scope: sc, package_id: csomagId, full_service: fsBe,
        seat_material: fsBe ? ules : null, next_day_pick_up: masnap, extras: extraLista,
        pick_up_time: hataridoKell && hat !== null ? percIdo(hat) : null,
        booking_type: tip, service_date: nap,
        start_time: tip === 'VAROS' ? percIdo(ido.tol) : null,
        drop_off_time: tip === 'LEADOS' ? percIdo(ido.tol) : null,
        customer_name: adatok.nev.trim(), customer_phone: adatok.telefon.trim(),
        customer_email: adatok.email.trim() || null, plate_raw: adatok.rendszam.trim(),
        brand: adatok.marka.trim() || null, model: adatok.modell.trim() || null,
        notes: adatok.megjegyzes.trim() || null,
      })
      setKesz({
        id, nap,
        mikor: tip === 'VAROS' ? `kezdés: ${percOra(ido.tol)}`
          : `hozás: ${percOra(ido.tol)}${hataridoKell && hat !== null ? `, határidő: ${percOra(hat)}` : ''}`,
        elvitel: masnap ? elvitelInfo : null,
      })
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
  const csomagNev = csomag ? `${csomag.name}${fsBe ? ' + Full Service' : ''}` : ''

  if (kesz) {
    return (
      <div className="fogl">
        <ProbaSav />
        <section className="fogl-kartya fogl-siker">
          <h2>Köszönjük, megkaptuk a foglalási kérésed!</h2>
          <p>
            {napCim(kesz.nap)}, {kesz.mikor}.
            {kesz.elvitel && <> Elviheted: {elvitelSzoveg(kesz.elvitel)}.</>}
            {' '}Hamarosan visszaigazoljuk telefonon vagy e-mailben.
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

        {csomag && (
          <label className="fogl-fs" data-be={fsBe || undefined} data-tiltva={!fsLehet || undefined}>
            <input type="checkbox" checked={fsBe} disabled={!fsLehet} onChange={(e) => setFs(e.target.checked)} />
            <span className="nev">
              Full Service
              <small>
                A csomag mellé az ülések mélytisztítása: kárpitnál vizes kárpittisztítás, bőrnél
                bőrtisztítás és ápolás. A vizes kárpit aznap is elvihető, de ajánlott egy éjszakára
                nálunk hagyni, hogy megszáradjon.
              </small>
            </span>
            <span className="ar">
              {fsLehet ? <>{ft(fsSor!.price_huf)}<small>{csomag.name} csomaggal együtt</small></> : 'árajánlat alapján'}
            </span>
          </label>
        )}

        {fsBe && (
          <div className="fogl-ules">
            <span className="cimke">Milyen az ülés?</span>
            <div className="fogl-valaszto harom">
              {ULESEK.map((u) => (
                <button key={u} type="button" aria-pressed={ules === u} onClick={() => setUles(u)}>
                  {ULES_LABEL[u]}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {csomagId && (
        <section className="fogl-kartya">
          <h2><span className="lepes">3</span> Mit csináljunk?</h2>
          <div className="fogl-valaszto harom">
            {TERJEDELMEK.map((s) => {
              const a = ar(csomagId, s)
              const lehet = foglalhato(csomagId, s) && (!fsBe || s === 'TELJES')
              return (
                <button key={s} type="button" aria-pressed={sc === s}
                        disabled={!lehet} onClick={() => setScope(s)}>
                  {SCOPE_LABEL[s]}
                  <small>{foglalhato(csomagId, s) ? ft(a!.price_huf) : 'telefonon'}</small>
                </button>
              )
            })}
          </div>
          {fsBe && <p className="fogl-al-szoveg">Full Service-nél a teljes csomag jár, kívül és belül.</p>}
        </section>
      )}

      {csomagId && kinaltExtrak.length > 0 && (
        <section className="fogl-kartya">
          <h2><span className="lepes">4</span> Kérsz még valamit? <small>nem kötelező</small></h2>
          {csomag && rejtett > 0 && (
            <p className="fogl-al-szoveg">Ami a {csomagNev} csomagban már benne van, azt itt nem kínáljuk külön.</p>
          )}
          <div className="fogl-extrak">
            {kinaltExtrak.map((e) => {
              const db = extrak[e.id] ?? 0
              const egyeztet = egyeztetesre(e)
              const egysegre = e.price_unit !== 'ALKALOM'
              return (
                <div key={e.id} className="fogl-extra" data-be={db > 0 || undefined}>
                  <label className="fogl-extra-fej">
                    <input type="checkbox" checked={db > 0} onChange={() => extraValt(e)} />
                    <span className="nev">
                      {e.name}
                      {e.description && <small>{e.description}</small>}
                    </span>
                    <span className="ar" data-egyeztet={egyeztet || undefined}>
                      {egyeztet ? 'ár egyeztetés után'
                        : `+ ${ft(e.price_huf)}${egysegre ? ` / ${EGYSEG[e.price_unit]}` : ''}`}
                    </span>
                  </label>
                  {db > 0 && egysegre && (
                    <div className="fogl-darab">
                      <button type="button" className="btn btn-kicsi" disabled={db <= 1}
                              onClick={() => extraDarab(e, db - 1)} aria-label={`${e.name}: kevesebb`}>−</button>
                      <span className="db">{db} {EGYSEG[e.price_unit]}</span>
                      <button type="button" className="btn btn-kicsi" disabled={db >= LEGTOBB_DB[e.price_unit]}
                              onClick={() => extraDarab(e, db + 1)} aria-label={`${e.name}: több`}>+</button>
                      {!egyeztet && e.price_huf != null && <span className="osszeg">= {ft(e.price_huf * db)}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {csomagId && !fsBe && (
        <section className="fogl-kartya">
          <h2><span className="lepes">5</span> Megvárod, vagy itt hagyod?</h2>
          <div className="fogl-valaszto ketto">
            <button type="button" aria-pressed={tipus === 'VAROS'} onClick={() => setTipus('VAROS')}>
              Megvárom
              <small>Pontos kezdési időpontot választasz, és amíg kész, nálunk várhatsz.</small>
            </button>
            <button type="button" aria-pressed={tipus === 'LEADOS'} onClick={() => setTipus('LEADOS')}>
              Itt hagyom
              <small>Behozod amikor tudod, kész vagyunk mire viszed.</small>
            </button>
          </div>
        </section>
      )}

      {csomagId && fsBe && (
        <section className="fogl-kartya">
          <h2><span className="lepes">5</span> Mikor viszed el?</h2>
          <p className="fogl-al-szoveg">Full Service-nél az autót nálunk hagyod.</p>
          <div className="fogl-valaszto ketto">
            <button type="button" aria-pressed={elvitel === 'AZNAP'} onClick={() => setElvitel('AZNAP')}>
              Aznap
              <small>{szaradni ? 'Amint elkészül, vizesen elviheted.' : 'Amint elkészül, elviheted.'}</small>
            </button>
            <button type="button" aria-pressed={elvitel === 'MASNAP'} onClick={() => setElvitel('MASNAP')}>
              Másnap
              <small>
                {szaradni ? 'Ajánlott: egy éjszakát nálunk szárad. ' : ''}
                Másnap reggel 8-tól zárásig bármikor elviheted.
              </small>
            </button>
          </div>
        </section>
      )}

      {csomagId && tip && (
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
                    {tip === 'VAROS' ? ' Mikor kezdjük?' : ' Mikor hozod?'} <small>{napCim(nap)}</small>
                  </h2>
                  {lehetosegek.length === 0 ? (
                    <p className="fogl-figyel">Erre a napra már nincs szabad időpont.</p>
                  ) : (
                    <div className="fogl-idok">
                      {lehetosegek.map((l) => (
                        <button key={l.tol} type="button" aria-pressed={ido?.tol === l.tol} onClick={() => setIdo(l)}>
                          {percOra(l.tol)}
                          {tip === 'LEADOS' && !masnap && <small>kész kb. {l.kesz !== null ? percOra(l.kesz) : '—'}</small>}
                        </button>
                      ))}
                    </div>
                  )}
                  {ido && hataridoKell && (
                    <div className="fogl-hatarido">
                      <span className="cimke">Mikorra legyen kész?</span>
                      {hataridok.length === 0 ? (
                        <p className="fogl-figyel">Erre a hozási időre nem tudunk határidőt vállalni, válassz korábbit.</p>
                      ) : (
                        <>
                          <p className="fogl-al-szoveg">
                            Legkorábban {percOra(hataridok[0])}, legkésőbb {percOra(hataridok[hataridok.length - 1])}.
                          </p>
                          <div className="fogl-hataridok">
                            {hataridok.map((t) => (
                              <button key={t} type="button" aria-pressed={hat === t} onClick={() => setHatarido(t)}>
                                {percOra(t)}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {masnap && lehetosegek.length > 0 && (
                    <p className="fogl-elvitel">
                      {elvitelInfo
                        ? <>Elviheted: <strong>{elvitelSzoveg(elvitelInfo)}</strong>, bármikor.</>
                        : 'Az elvitel napját számoljuk…'}
                    </p>
                  )}
                  <p className="fogl-erkezes">
                    Kérjük, ha lehet, a választott időpont előtt <strong>5–10 perccel</strong> érkezz.
                    Ha késel, kérjük, telefonálj: <a href={`tel:${UZLET_TELEFON.replace(/\s/g, '')}`}>{UZLET_TELEFON}</a>
                  <br />
                  A végleges ár az autó állapotától függően eltérhet, erősen szennyezett autón 50% felárat számíthatunk fel.
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
            <div>
              <strong>{csomag.name}</strong>
              {fsBe && <> + Full Service{ules ? ` (${ULES_LABEL[ules].toLowerCase()})` : ''}</>}
              {' · '}{CATEGORY_LABEL[kat]} · {SCOPE_LABEL[sc]}
            </div>
            {valasztottExtrak.length > 0 && (
              <div className="halk">
                + {valasztottExtrak
                  .map((e) => (e.price_unit === 'ALKALOM' ? e.name : `${e.name} (${extrak[e.id]} ${EGYSEG[e.price_unit]})`))
                  .join(', ')}
              </div>
            )}
            {egyeztetendo.length > 0 && (
              <div className="halk">Ára egyeztetés után: {egyeztetendo.map((e) => e.name).join(', ')}</div>
            )}
            {nap && ido && (
              <div>
                {napCim(nap)} · {tip === 'VAROS' ? `kezdés: ${percOra(ido.tol)}` : `hozás: ${percOra(ido.tol)}`}
                {hataridoKell && hat !== null && ` · határidő: ${percOra(hat)}`}
                {masnap && elvitelInfo
                  && ` · elvitel: ${napRovidCim(elvitelInfo.nap)} ${percOra(elvitelInfo.tol)}–${percOra(elvitelInfo.ig)}`}
              </div>
            )}
          </div>
          <div className="osszeg">
            <span className="ar">{ajanlat ? ft(ajanlat.price_huf) : '—'}</span>
            <span className="halk">{perc ? `kb. ${idotartam(perc)}` : ''}</span>
            {egyeztetendo.length > 0 && <span className="halk">+ egyeztetendő tétel</span>}
          </div>
          <div className="kuld">
            {hiba && <div className="hibauzenet">{hiba}</div>}
            <button type="button" className="btn btn-fo" disabled={!kuldheto} onClick={() => void kuldes()}>
              {kuld ? 'Küldés…' : 'Foglalási kérés küldése'}
            </button>
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
            <li>Munkaidő: {perc ? `${perc} perc` : 'nincs'} · típus: {tip ?? '—'}{fsBe ? ` · Full Service, elvitel: ${elvitel ?? '—'}` : ''}</li>
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
      valódi kérésként jelenik meg a napi nézetben („Online kérés"), és minden bejelentkezett
      eszközön felugrik elfogadásra.
    </div>
  )
}

function egyeztetesre(e: Extra): boolean {
  return e.requires_quote || e.price_huf == null
}

function elvitelSzoveg(a: ElvitelAblak): string {
  return `${napCim(a.nap)}, ${percOra(a.tol)} és ${percOra(a.ig)} között`
}

async function elvitelAblak(data: DataSource, nap: string): Promise<ElvitelAblak | null> {
  for (let i = 1; i <= 14; i++) {
    const d = napPlusz(nap, i)
    const negyedek = negyedekbol(await data.getDayLanes(d))
    if (negyedek.length > 0) {
      return { nap: d, tol: Math.max(ELVITEL_KEZDETE, negyedek[0].tol), ig: negyedek[negyedek.length - 1].ig }
    }
  }
  return null
}
