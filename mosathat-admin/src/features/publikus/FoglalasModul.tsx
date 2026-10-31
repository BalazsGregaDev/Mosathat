import { useEffect, useMemo, useRef, useState } from 'react'

import { napBeosztasBetolt, type NapBeosztas } from '../../state/napBeosztas'
import { hataridoLehetosegek, napAllapot, type Lehetoseg, type NapAllapot, type TiltottSav } from '../../lib/befer'
import { negyedekbol } from '../../lib/beosztas'
import { hetHetfoje, hibaSzoveg, maStr, napPlusz, oraMs, percIdo, percOra } from '../../lib/format'
import { csomagLeiras } from '../../lib/csomagLeiras'
import {
  ULESEK,
  type BookingScope, type Extra, type FoglalasEredmeny, type OnlineBookingInput, type MeasureUnit, type Quote, type SeatMaterial, type VehicleCategory,
} from '../../lib/types'
import { katKulcs, terjedelemKulcs, ulesKulcs, type SzovegKulcs } from '../../lib/publikusTartalom'
import { forditott, Gazdag, telefonLink, useFormatum, useNyelv, useSz, useUzlet } from './tartalom'
import { FELIRAT, hibaFordit, nyelviUt, type Formatum } from '../../lib/nyelv'
import { JOGI_CIM, JOGI_CIM_EN } from '../../lib/ceg'
import { csomagbanBenne } from '../../lib/csomag'
import { egerElhagy, egerKovet } from '../arculat/csillanas'
import type { Catalog, DataSource } from '../../data/source'

export type FoglalasForras = Pick<DataSource, 'quoteBooking' | 'getDay' | 'getDayLanes'> & {
  onlineBooking: (input: OnlineBookingInput) => Promise<string | FoglalasEredmeny>
  teliNapok?: (tol: string, ig: string) => Promise<string[]>
}

export interface FoglalasKornyezet {
  data: FoglalasForras
  katalogus: Catalog
  revision: number
  refresh: () => void
  lemondasOra?: number
  kat?: VehicleCategory
  onKat?: (k: VehicleCategory) => void
  csomagId?: string | null
  onCsomag?: (id: string | null) => void
  bemutato?: Bemutato
  cegUzenet?: string | null
  ceges?: boolean
  hozomviszem?: boolean
  berletCsomagok?: string[]
  elotoltNev?: string
}

const KATEGORIAK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
const TERJEDELMEK: BookingScope[] = ['TELJES', 'KULSO', 'BELSO']
const HETEK_OLDALANKENT = 2
const LEGTOBB_HET = 8
const EBED: TiltottSav[] = [
  { tol: 0, ig: 9 * 60 - 1 },
  { tol: 11 * 60 + 15, ig: 12 * 60 + 45 },
]
const CEGES_ELSO = 7 * 60 + 30
const CEGES_UTOLSO = 17 * 60
const CEGES_TILTOTT: TiltottSav[] = [
  { tol: 0, ig: CEGES_ELSO - 1 },
  { tol: 11 * 60 + 15, ig: 12 * 60 + 45 },
]
const LEPESEK = { auto: 1, csomag: 2, mit: 3, extrak: 4, tipus: 5, nap: 6, ido: 7, adatok: 8 }
const CEGES_LEPESEK = { auto: 0, csomag: 1, mit: 0, extrak: 0, tipus: 2, nap: 3, ido: 4, adatok: 5 }
const ALAP_DB: Record<MeasureUnit, number> = { ALKALOM: 1, DB: 1, ULES: 5, AJTO: 4, LITER: 1 }
const LEGTOBB_DB: Record<MeasureUnit, number> = { ALKALOM: 1, DB: 10, ULES: 9, AJTO: 6, LITER: 10 }
const ELVITEL_KEZDETE = 8 * 60
const LEGKESOBB_HATARIDO = 17 * 60

type Tipus = 'VAROS' | 'LEADOS' | 'HOZOMVISZEM'
type Elvitel = 'AZNAP' | 'MASNAP'

export interface Bemutato {
  csomagId?: string | null
  fs?: boolean
  ules?: SeatMaterial | null
  elvitel?: Elvitel | null
  tipus?: Tipus | null
  extrak?: Record<string, number>
  napot?: boolean
  idot?: boolean
  kesz?: boolean
}

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

const ALLAPOT_KULCS: Record<NapAllapot, SzovegKulcs> = {
  szabad: 'foglalas.allapot.szabad', keves: 'foglalas.allapot.keves', tele: 'foglalas.allapot.tele', zarva: 'foglalas.allapot.zarva',
}

export function FoglalasUrlap({
  data, katalogus, revision, refresh, lemondasOra,
  kat: katKulso, onKat, csomagId: csomagKulso, onCsomag, bemutato, cegUzenet, ceges = false, hozomviszem = false,
  berletCsomagok, elotoltNev,
}: FoglalasKornyezet) {
  const lepes = ceges ? CEGES_LEPESEK : LEPESEK
  const sz = useSz()
  const u = useUzlet()
  const nyelv = useNyelv()
  const f = useFormatum()
  const fe = FELIRAT[nyelv]
  const hibaLeiras = (e: unknown) => hibaFordit(hibaSzoveg(e), nyelv)
  const extraNev = (e: Extra) => forditott(e, nyelv)
  const extraLeiras = (e: Extra) => (nyelv === 'en' ? e.description_en?.trim() || e.description : e.description)
  const holnap = napPlusz(maStr(), 1)
  const utolsoNap = napPlusz(holnap, LEGTOBB_HET * 7)

  const [katBelso, setKatBelso] = useState<VehicleCategory>('SZEMELYAUTO')
  const [csomagBelso, setCsomagBelso] = useState<string | null>(bemutato?.csomagId ?? null)
  const kat = ceges ? 'SZEMELYAUTO' : katKulso ?? katBelso
  const setKat = onKat ?? setKatBelso
  const csomagId = csomagKulso !== undefined ? csomagKulso : csomagBelso
  const setCsomagId = onCsomag ?? setCsomagBelso
  const [fs, setFs] = useState(bemutato?.fs ?? false)
  const [ules, setUles] = useState<SeatMaterial | null>(bemutato?.ules ?? null)
  const [elvitel, setElvitel] = useState<Elvitel | null>(bemutato?.elvitel ?? null)
  const [scope, setScope] = useState<BookingScope>('TELJES')
  const [extrak, setExtrak] = useState<Record<string, number>>(bemutato?.extrak ?? {})
  const [tipus, setTipus] = useState<Tipus | null>(bemutato?.tipus ?? null)
  const [nap, setNap] = useState<string | null>(null)
  const [ido, setIdo] = useState<Lehetoseg | null>(null)
  const [hatarido, setHatarido] = useState<number | null>(null)
  const kezdoAdatok: Adatok = { ...URES_ADATOK, nev: elotoltNev ?? '' }
  const [adatok, setAdatok] = useState<Adatok>(kezdoAdatok)
  const [elfogad, setElfogad] = useState(false)
  const [weboldal, setWeboldal] = useState('')
  const megnyitva = useRef(0)
  useEffect(() => { megnyitva.current = oraMs() }, [])
  const [oldal, setOldal] = useState(0)
  const [kuld, setKuld] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [kesz, setKesz] = useState<{ id: string; nap: string; mikor: string; elvitel: ElvitelAblak | null; email: boolean; megerositve?: boolean } | null>(null)

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
  const fsLehet = !ceges && Boolean(fsSor && fsSor.price_huf != null && !fsSor.requires_quote)
  const fsBe = fs && fsLehet
  const szaradni = ules !== 'BOR'
  const sc: BookingScope = ceges || fsBe ? 'TELJES' : csomagId && !foglalhato(csomagId, scope) ? 'TELJES' : scope
  const tip: Tipus | null = fsBe ? (elvitel ? 'LEADOS' : null) : tipus
  const hv = tip === 'HOZOMVISZEM'
  const tipB: 'VAROS' | 'LEADOS' | null = hv ? 'LEADOS' : tip
  const masnap = fsBe && elvitel === 'MASNAP'

  const kinaltExtrak = useMemo(
    () => katalogus.extras
      .filter((e) => e.active && !csomagbanBenne(e, csomagId, sc, fsBe))
      .sort((a, b) => a.sort_order - b.sort_order),
    [katalogus.extras, csomagId, sc, fsBe],
  )
  const rejtett = katalogus.extras.filter((e) => e.active && csomagbanBenne(e, csomagId, sc, fsBe)).length
  const valasztottExtrak = useMemo(
    () => (ceges ? [] : kinaltExtrak.filter((e) => (extrak[e.id] ?? 0) > 0)),
    [ceges, kinaltExtrak, extrak],
  )
  const egyeztetendo = valasztottExtrak.filter(egyeztetesre)

  function extraValt(e: Extra) {
    setExtrak((x) => {
      const uj = { ...x }
      if (uj[e.id]) delete uj[e.id]
      else uj[e.id] = ALAP_DB[e.price_unit]
      return uj
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
      .catch((e) => { if (el) { setAjanlat(null); setAjanlatHiba(hibaFordit(hibaSzoveg(e), nyelv)) } })
    return () => { el = false }
  }, [data, csomagId, kat, sc, fsBe, extraLista, tip, nap, holnap, nyelv])
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
      .catch((e) => { if (el) { setNapAdat(new Map(t)); setNapHiba(hibaFordit(hibaSzoveg(e), nyelv)) } })
    return () => { el = false }
  }, [data, napok, holnap, utolsoNap, revision, nyelv])

  const [teliNapok, setTeliNapok] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!data.teliNapok) return
    let el = true
    data.teliNapok(napok[0], napok[napok.length - 1])
      .then((l) => { if (el) setTeliNapok(new Set(l)) })
      .catch(() => { if (el) setTeliNapok(new Set()) })
    return () => { el = false }
  }, [data, napok, revision])

  const napErtek = useMemo(() => {
    const m = new Map<string, ReturnType<typeof napAllapot>>()
    if (!perc || !tip) return m
    for (const d of napok) {
      const a = napAdat.get(d)
      if (!a) continue
      if (teliNapok.has(d)) {
        m.set(d, { allapot: 'tele', lehetosegek: [], meg: 0 })
        continue
      }
      const e = napAllapot(a.negyedek, a.munkak, perc, tipB!, a.most, ceges ? CEGES_TILTOTT : EBED)
      m.set(d, ceges ? cegesIdopontok(e, a.negyedek, a.most, tipB!) : e)
    }
    return m
  }, [napok, napAdat, perc, tip, tipB, ceges, teliNapok])

  useEffect(() => { setIdo(null) }, [perc, tip, nap])

  const elsoSzabad = napok.find((d) => d >= holnap && napErtek.get(d)?.allapot === 'szabad') ?? null
  useEffect(() => {
    if (bemutato?.napot && !nap && elsoSzabad) setNap(elsoSzabad)
  }, [bemutato?.napot, nap, elsoSzabad])

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
  const elsoIdo = lehetosegek[0] ?? null
  useEffect(() => {
    if (bemutato?.idot && !ido && elsoIdo) setIdo(elsoIdo)
  }, [bemutato?.idot, ido, elsoIdo])

  const hataridoKell = tipB === 'LEADOS' && !masnap
  const hataridok = useMemo(() => {
    if (!hataridoKell || !ido || !perc || !nap) return []
    const a = napAdat.get(nap)
    if (!a || a.negyedek.length === 0) return []
    const zar = a.negyedek[a.negyedek.length - 1].ig
    return hataridoLehetosegek(a.negyedek, a.munkak, ido.tol, perc, Math.min(LEGKESOBB_HATARIDO, zar), a.most)
  }, [hataridoKell, ido, perc, nap, napAdat])
  const hat = hatarido !== null && hataridok.includes(hatarido) ? hatarido : hataridok[hataridok.length - 1] ?? null

  const [emailLatta, setEmailLatta] = useState(false)
  const emailRendben = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adatok.email.trim())
  const adatokRendben = Boolean(adatok.nev.trim() && adatok.telefon.trim() && emailRendben && adatok.rendszam.trim())
  const fsRendben = !fsBe || (ules !== null && elvitel !== null)
  const hataridoRendben = !hataridoKell || hat !== null
  const kuldheto = Boolean(csomagId && tip && nap && ido && adatokRendben && fsRendben && hataridoRendben
    && elfogad && !kuld)

  async function kuldes() {
    if (!kuldheto || !csomagId || !tip || !nap || !ido) return
    setKuld(true)
    setHiba(null)
    try {
      const eredmeny = await data.onlineBooking({
        category: kat, scope: sc, package_id: csomagId, full_service: fsBe,
        seat_material: fsBe ? ules : null, next_day_pick_up: masnap, extras: extraLista,
        pick_up_time: hataridoKell && hat !== null ? percIdo(hat) : null,
        booking_type: tip, service_date: nap,
        start_time: tip === 'VAROS' ? percIdo(ido.tol) : null,
        drop_off_time: tipB === 'LEADOS' ? percIdo(ido.tol) : null,
        customer_name: adatok.nev.trim(), customer_phone: adatok.telefon.trim(),
        customer_email: adatok.email.trim() || null, plate_raw: adatok.rendszam.trim(),
        brand: adatok.marka.trim() || null, model: adatok.modell.trim() || null,
        notes: adatok.megjegyzes.trim() || null,
        weboldal, ido: Math.round(oraMs() - megnyitva.current), nyelv,
      })
      const id = typeof eredmeny === 'string' ? eredmeny : eredmeny.id
      setKesz({
        id, nap, megerositve: typeof eredmeny !== 'string' && eredmeny.megerositve,
        mikor: tip === 'VAROS' ? `${sz('foglalas.kezdes_cimke')}: ${percOra(ido.tol)}`
          : hv ? `${fe.hvErte}: ${percOra(ido.tol)}${hat !== null ? `, ${fe.hvVissza}: ${percOra(hat)}` : ''}`
          : `${sz('foglalas.hozas_cimke')}: ${percOra(ido.tol)}${hataridoKell && hat !== null ? `, ${sz('foglalas.hatarido_cimke')}: ${percOra(hat)}` : ''}`,
        elvitel: masnap ? elvitelInfo : null,
        email: adatok.email.trim() !== '',
      })
      refresh()
    } catch (e) {
      setHiba(hibaLeiras(e))
    } finally {
      setKuld(false)
    }
  }

  function ujra() {
    setKesz(null); setNap(null); setIdo(null); setAdatok(kezdoAdatok); setElfogad(false); setHiba(null)
  }

  const set = <K extends keyof Adatok>(k: K, v: string) => setAdatok((x) => ({ ...x, [k]: v }))
  const csomag = csomagok.find((p) => p.id === csomagId) ?? null
  const csomagNeve = csomag ? forditott(csomag, nyelv) : ''
  const csomagNev = csomag ? `${csomagNeve}${fsBe ? ` + ${sz('foglalas.fs')}` : ''}` : ''

  const bemutatoKesz = bemutato?.kesz ? {
    id: 'bemutato', nap: holnap, mikor: `${sz('foglalas.hozas_cimke')}: 9:00, ${sz('foglalas.hatarido_cimke')}: 16:00`,
    elvitel: { nap: napPlusz(holnap, 1), tol: ELVITEL_KEZDETE, ig: LEGKESOBB_HATARIDO }, email: true, megerositve: false,
  } : null
  const siker = kesz ?? bemutatoKesz

  if (siker) {
    return (
      <div className="fogl">
        <section className="fogl-kartya fogl-siker" data-lepes="siker">
          <h2>{siker.megerositve ? fe.megerositveCim : sz('foglalas.siker')}</h2>
          <p>
            {f.napCim(siker.nap)}, {siker.mikor}.
            {siker.elvitel && <> {sz('foglalas.siker_elvitel', { mikor: elvitelSzoveg(siker.elvitel, f) })}</>}
            {' '}{siker.megerositve
              ? (siker.email ? fe.megerositveEmail : fe.megerositveSzoveg)
              : siker.email ? sz('foglalas.siker_email') : sz('foglalas.siker_telefon')}
          </p>
          <p className="fogl-siker-tipp">
            {fe.kerSikerElotte}
            <a href={`${nyelviUt('/publikus', nyelv)}#foglalasom`}>{fe.kerNyito}</a>
            {fe.kerSikerUtana}
          </p>
          <div className="fogl-gombok">
            <button type="button" className="btn" onClick={ujra}>{sz('foglalas.uj')}</button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="fogl">
      {!ceges && (
        <section className="fogl-kartya" data-lepes="auto">
          <h2><span className="lepes">{lepes.auto}</span> {sz('foglalas.auto')}</h2>
          <div className="fogl-valaszto harom">
            {KATEGORIAK.map((k) => (
              <button key={k} type="button" aria-pressed={kat === k} onClick={() => setKat(k)}>
                {sz(katKulcs.foglalas(k))}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="fogl-kartya" data-lepes="csomag">
        <h2><span className="lepes">{lepes.csomag}</span> {sz('foglalas.csomag')}</h2>
        <div className="fogl-csomagok">
          {csomagok.map((p) => {
            const a = ar(p.id, 'TELJES')
            const lehet = ceges || foglalhato(p.id, 'TELJES')
            return (
              <button key={p.id} type="button" className="fogl-csomag" aria-pressed={csomagId === p.id}
                      disabled={!lehet} onClick={() => setCsomagId(p.id)}>
                <span className="nev">{forditott(p, nyelv)}</span>
                {!ceges && (
                  <span className="ar" data-berlet={berletCsomagok?.includes(p.id) || undefined}>
                    {berletCsomagok?.includes(p.id) ? fe.berletbol : lehet ? f.tol(a!.price_huf!) : sz('foglalas.arajanlat')}
                  </span>
                )}
                {a?.duration_minutes ? <span className="ido">{f.kb(f.idotartam(a.duration_minutes))}</span> : null}
                {csomagLeiras(katalogus, p, nyelv) && <span className="leiras">{csomagLeiras(katalogus, p, nyelv)}</span>}
              </button>
            )
          })}
        </div>

        {csomag && !ceges && (
          <label className="fogl-fs" data-be={fsBe || undefined} data-tiltva={!fsLehet || undefined}>
            <input type="checkbox" checked={fsBe} disabled={!fsLehet} onChange={(e) => setFs(e.target.checked)} />
            <span className="nev">
              {sz('foglalas.fs')}
              <small>{sz('foglalas.fs_leiras')}</small>
            </span>
            <span className="ar">
              {fsLehet
                ? <>{f.ft(fsSor!.price_huf)}<small>{sz('foglalas.fs_csomaggal', { csomag: csomagNeve })}</small></>
                : sz('foglalas.arajanlat')}
            </span>
          </label>
        )}

        {fsBe && (
          <div className="fogl-ules">
            <span className="cimke">{sz('foglalas.ules')}</span>
            <div className="fogl-valaszto harom">
              {ULESEK.map((anyag) => (
                <button key={anyag} type="button" aria-pressed={ules === anyag} onClick={() => setUles(anyag)}>
                  {sz(ulesKulcs(anyag))}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {csomagId && !ceges && (
        <section className="fogl-kartya" data-lepes="mit">
          <h2><span className="lepes">{lepes.mit}</span> {sz('foglalas.mit')}</h2>
          <div className="fogl-valaszto harom">
            {TERJEDELMEK.map((s) => {
              const a = ar(csomagId, s)
              const lehet = foglalhato(csomagId, s) && (!fsBe || s === 'TELJES')
              return (
                <button key={s} type="button" aria-pressed={sc === s}
                        disabled={!lehet} onClick={() => setScope(s)}>
                  {sz(terjedelemKulcs(s))}
                  <small>{foglalhato(csomagId, s) ? f.ft(a!.price_huf) : sz('foglalas.telefonon')}</small>
                </button>
              )
            })}
          </div>
          {fsBe && <p className="fogl-al-szoveg">{sz('foglalas.fs_teljes')}</p>}
        </section>
      )}

      {csomagId && !ceges && kinaltExtrak.length > 0 && (
        <section className="fogl-kartya" data-lepes="extrak">
          <h2><span className="lepes">{lepes.extrak}</span> {sz('foglalas.extrak')} <small>{sz('foglalas.nem_kotelezo')}</small></h2>
          {csomag && rejtett > 0 && (
            <p className="fogl-al-szoveg">{sz('foglalas.extrak_benne', { csomag: csomagNev })}</p>
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
                      {extraNev(e)}
                      {extraLeiras(e) && <small>{extraLeiras(e)}</small>}
                    </span>
                    <span className="ar" data-egyeztet={egyeztet || undefined}>
                      {egyeztet ? sz('foglalas.ar_egyeztetes')
                        : `+ ${f.ft(e.price_huf)}${egysegre ? ` / ${f.egyseg(e.price_unit)}` : ''}`}
                    </span>
                  </label>
                  {db > 0 && egysegre && (
                    <div className="fogl-darab">
                      <button type="button" className="btn btn-kicsi" disabled={db <= 1}
                              onClick={() => extraDarab(e, db - 1)} aria-label={`${extraNev(e)}: ${fe.kevesebb}`}>−</button>
                      <span className="db">{db} {f.egyseg(e.price_unit, db)}</span>
                      <button type="button" className="btn btn-kicsi" disabled={db >= LEGTOBB_DB[e.price_unit]}
                              onClick={() => extraDarab(e, db + 1)} aria-label={`${extraNev(e)}: ${fe.tobb}`}>+</button>
                      {!egyeztet && e.price_huf != null && <span className="osszeg">= {f.ft(e.price_huf * db)}</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {csomagId && !fsBe && (
        <section className="fogl-kartya" data-lepes="tipus">
          <h2><span className="lepes">{lepes.tipus}</span> {sz('foglalas.var_vagy_hagy')}</h2>
          <div className={`fogl-valaszto ${ceges && hozomviszem ? 'harom' : 'ketto'}`}>
            <button type="button" aria-pressed={tipus === 'VAROS'} onClick={() => setTipus('VAROS')}>
              {sz('foglalas.varom')}
              <small>{sz('foglalas.varom_leiras')}</small>
            </button>
            <button type="button" aria-pressed={tipus === 'LEADOS'} onClick={() => setTipus('LEADOS')}>
              {sz('foglalas.hagyom')}
              <small>{sz('foglalas.hagyom_leiras')}</small>
            </button>
            {ceges && hozomviszem && (
              <button type="button" aria-pressed={tipus === 'HOZOMVISZEM'} onClick={() => setTipus('HOZOMVISZEM')}>
                {fe.hozomviszem}
                <small>{fe.hozomviszemLeiras}</small>
              </button>
            )}
          </div>
        </section>
      )}

      {csomagId && fsBe && (
        <section className="fogl-kartya" data-lepes="elvitel">
          <h2><span className="lepes">{lepes.tipus}</span> {sz('foglalas.elvitel')}</h2>
          <p className="fogl-al-szoveg">{sz('foglalas.elvitel_fs')}</p>
          <div className="fogl-valaszto ketto">
            <button type="button" aria-pressed={elvitel === 'AZNAP'} onClick={() => setElvitel('AZNAP')}>
              {sz('foglalas.aznap')}
              <small>{szaradni ? sz('foglalas.aznap_vizes') : sz('foglalas.aznap_bor')}</small>
            </button>
            <button type="button" aria-pressed={elvitel === 'MASNAP'} onClick={() => setElvitel('MASNAP')}>
              {sz('foglalas.masnap')}
              <small>
                {szaradni ? `${sz('foglalas.masnap_szarad')} ` : ''}
                {sz('foglalas.masnap_leiras')}
              </small>
            </button>
          </div>
        </section>
      )}

      {csomagId && tip && (
        <section className="fogl-kartya" data-lepes="nap">
          <h2><span className="lepes">{lepes.nap}</span> {sz('foglalas.nap')}</h2>
          {ajanlatHiba ? (
            <p className="fogl-figyel">{fe.arHiba} {ajanlatHiba}</p>
          ) : !perc ? (
            <p className="fogl-figyel">{sz('foglalas.nincs_munkaido')}</p>
          ) : (
            <>
              <div className="fogl-lapozo">
                <button type="button" className="btn" disabled={oldal === 0} aria-label={fe.elozo}
                        onClick={() => setOldal((o) => o - 1)}>‹</button>
                <span>{f.napokRovid(napok[0], napok[napok.length - 1])}</span>
                <button type="button" className="btn" disabled={napPlusz(elsoHetfo, HETEK_OLDALANKENT * 7) > utolsoNap}
                        aria-label={fe.kovetkezo} onClick={() => setOldal((o) => o + 1)}>›</button>
              </div>
              <div className="fogl-naptar">
                {f.hetNapjai.map((n) => <div key={n} className="fogl-napfej">{n}</div>)}
                {napok.map((d) => {
                  const korai = d < holnap || d > utolsoNap
                  const e = napErtek.get(d)
                  const allapot: NapAllapot | 'tolt' | 'korai' = korai ? 'korai' : e?.allapot ?? 'tolt'
                  const valaszthato = allapot === 'szabad' || allapot === 'keves'
                  return (
                    <button key={d} type="button" className="fogl-nap" data-allapot={allapot}
                            aria-pressed={nap === d} disabled={!valaszthato}
                            onClick={() => setNap(d)}>
                      <span className="szam">{Number(d.slice(8, 10))}</span>
                      <span className="allapot">
                        {allapot === 'korai' ? '' : allapot === 'tolt' ? '…' : sz(ALLAPOT_KULCS[allapot])}
                      </span>
                    </button>
                  )
                })}
              </div>
              {napHiba && <p className="fogl-figyel">{fe.napHiba} {napHiba}</p>}
              <div className="fogl-jelmagyarazat">
                <span data-allapot="szabad">{sz('foglalas.allapot.szabad')}</span>
                <span data-allapot="keves">{sz('foglalas.allapot.keves')}</span>
                <span data-allapot="tele">{sz('foglalas.allapot.tele')}</span>
              </div>

              {nap && (
                <>
                  <h2 className="fogl-al"><span className="lepes">{lepes.ido}</span>
                    {' '}{tip === 'VAROS' ? sz('foglalas.kezdes') : hv ? fe.hvKerdes : sz('foglalas.hozas')} <small>{f.napCim(nap)}</small>
                  </h2>
                  {lehetosegek.length === 0 ? (
                    <p className="fogl-figyel">{sz('foglalas.nincs_ido')}</p>
                  ) : (
                    <div className="fogl-idok">
                      {lehetosegek.map((l) => (
                        <button key={l.tol} type="button" aria-pressed={ido?.tol === l.tol} onClick={() => setIdo(l)}>
                          {percOra(l.tol)}
                          {tipB === 'LEADOS' && !masnap && <small>{sz('foglalas.kesz_kb')} {l.kesz !== null ? percOra(l.kesz) : '—'}</small>}
                        </button>
                      ))}
                    </div>
                  )}
                  {ido && hataridoKell && (
                    <div className="fogl-hatarido">
                      <span className="cimke">{hv ? fe.hvVisszaKerdes : sz('foglalas.hatarido')}</span>
                      {hataridok.length === 0 ? (
                        <p className="fogl-figyel">{sz('foglalas.hatarido_nincs')}</p>
                      ) : (
                        <>
                          <p className="fogl-al-szoveg">
                            {sz('foglalas.hatarido_savos', { tol: percOra(hataridok[0]), ig: percOra(hataridok[hataridok.length - 1]) })}
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
                        ? <Gazdag s={sz('foglalas.elvitel_mikor', { mikor: elvitelSzoveg(elvitelInfo, f) })} kiemeles="strong" />
                        : sz('foglalas.elvitel_szamol')}
                    </p>
                  )}
                  {ceges ? (
                    <p className="fogl-erkezes">
                      {fe.cegesValtozas} <a href={telefonLink(u.telefon)}>{u.telefon}</a>
                    </p>
                  ) : (
                    <p className="fogl-erkezes">
                      <Gazdag s={sz('foglalas.erkezes')} kiemeles="strong" linkek={{ [u.telefon]: telefonLink(u.telefon) }} />
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}

      {ido && (
        <section className="fogl-kartya" data-lepes="adatok">
          <h2><span className="lepes">{lepes.adatok}</span> {sz('foglalas.adatok')}</h2>
          <div className="fogl-urlap">
            <div className="mezo"><label htmlFor="fo-nev">{sz('foglalas.mezo.nev')} *</label>
              <input id="fo-nev" className="beviteli" value={adatok.nev} autoComplete="name"
                     onChange={(e) => set('nev', e.target.value)} /></div>
            <div className="mezo"><label htmlFor="fo-tel">{sz('foglalas.mezo.telefon')} *</label>
              <input id="fo-tel" className="beviteli" type="tel" value={adatok.telefon} autoComplete="tel"
                     placeholder="+36 30 123 4567" onChange={(e) => set('telefon', e.target.value)} /></div>
            <div className="mezo"><label htmlFor="fo-email">{sz('foglalas.mezo.email')} *</label>
              <input id="fo-email" className="beviteli" type="email" value={adatok.email} autoComplete="email"
                     placeholder={sz('foglalas.minta.email')} onChange={(e) => set('email', e.target.value)}
                     onBlur={() => setEmailLatta(true)}
                     aria-invalid={emailLatta && adatok.email.trim() !== '' && !emailRendben} />
              {emailLatta && adatok.email.trim() !== '' && !emailRendben && <small className="fogl-mezo-hiba">{fe.emailHibas}</small>}</div>
            <div className="mezo"><label htmlFor="fo-rsz">{sz('foglalas.mezo.rendszam')} *</label>
              <input id="fo-rsz" className="beviteli" value={adatok.rendszam}
                     onChange={(e) => set('rendszam', e.target.value.toUpperCase())} /></div>
            <div className="mezo"><label htmlFor="fo-marka">{sz('foglalas.mezo.marka')}</label>
              <input id="fo-marka" className="beviteli" value={adatok.marka} onChange={(e) => set('marka', e.target.value)} /></div>
            <div className="mezo"><label htmlFor="fo-modell">{sz('foglalas.mezo.modell')}</label>
              <input id="fo-modell" className="beviteli" value={adatok.modell} onChange={(e) => set('modell', e.target.value)} /></div>
            {cegUzenet && <p className="mezo szeles fogl-ceg-uzenet">{cegUzenet}</p>}
            <div className="mezo szeles"><label htmlFor="fo-megj">{sz('foglalas.mezo.megjegyzes')}</label>
              <textarea id="fo-megj" className="beviteli" value={adatok.megjegyzes}
                        placeholder={sz('foglalas.minta.megjegyzes')} onChange={(e) => set('megjegyzes', e.target.value)} /></div>
          </div>
          <div className="fogl-csapda" aria-hidden="true">
            <label htmlFor="fo-weboldal">Weboldal</label>
            <input id="fo-weboldal" tabIndex={-1} autoComplete="off" value={weboldal}
                   onChange={(e) => setWeboldal(e.target.value)} />
          </div>
          <label className="fogl-feltetel">
            <input type="checkbox" checked={elfogad} onChange={(e) => setElfogad(e.target.checked)} />
            <span>{sz('foglalas.feltetel', { lemondas_ora: lemondasOra ?? 24 })}</span>
          </label>
          <p className="fogl-adatvedelem">
            {sz('foglalas.adatvedelem')}{' '}
            <a href={nyelviUt('/adatvedelem', nyelv)} target="_blank" rel="noopener">
              {(nyelv === 'en' ? JOGI_CIM_EN : JOGI_CIM).adatvedelem}
            </a>.
          </p>
        </section>
      )}

      {csomag && (
        <section className="fogl-osszeg" data-lepes="osszeg">
          <div className="sorok">
            <div>
              <strong>{csomagNeve}</strong>
              {fsBe && <> + {sz('foglalas.fs')}{ules ? ` (${sz(ulesKulcs(ules)).toLowerCase()})` : ''}</>}
              {!ceges && <>{' · '}{sz(katKulcs.foglalas(kat))} · {sz(terjedelemKulcs(sc))}</>}
            </div>
            {valasztottExtrak.length > 0 && (
              <div className="halk">
                + {valasztottExtrak
                  .map((e) => (e.price_unit === 'ALKALOM' ? extraNev(e) : `${extraNev(e)} (${extrak[e.id]} ${f.egyseg(e.price_unit, extrak[e.id])})`))
                  .join(', ')}
              </div>
            )}
            {egyeztetendo.length > 0 && (
              <div className="halk">{sz('foglalas.egyeztetendo')} {egyeztetendo.map(extraNev).join(', ')}</div>
            )}
            {nap && ido && (
              <div>
                {f.napCim(nap)} · {tip === 'VAROS' ? `${sz('foglalas.kezdes_cimke')}: ${percOra(ido.tol)}`
                  : hv ? `${fe.hvErte}: ${percOra(ido.tol)}` : `${sz('foglalas.hozas_cimke')}: ${percOra(ido.tol)}`}
                {hataridoKell && hat !== null && ` · ${hv ? fe.hvVissza : sz('foglalas.hatarido_cimke')}: ${percOra(hat)}`}
                {masnap && elvitelInfo
                  && ` · ${sz('foglalas.elvitel_cimke')}: ${f.napRovidCim(elvitelInfo.nap)} ${percOra(elvitelInfo.tol)}–${percOra(elvitelInfo.ig)}`}
              </div>
            )}
          </div>
          <div className="osszeg">
            {!ceges && <span className="ar">{ajanlat ? f.ft(ajanlat.price_huf) : '—'}</span>}
            {!ceges && ajanlat?.berlet && <span className="halk fogl-berlet">{fe.berletbolOsszeg}</span>}
            <span className="halk">{perc ? f.kb(f.idotartam(perc)) : ''}</span>
            {egyeztetendo.length > 0 && <span className="halk">{sz('foglalas.egyeztetendo_tetel')}</span>}
          </div>
          <div className="kuld">
            {hiba && <div className="hibauzenet">{hiba}</div>}
            {ceges ? (
              <button type="button" className="btn btn-fo kv-gomb-lakk fogl-lakk" disabled={!kuldheto}
                      data-csillan="" onPointerMove={egerKovet} onPointerLeave={egerElhagy}
                      onClick={() => void kuldes()}>
                {kuld ? sz('foglalas.kuldes_folyamatban') : sz('foglalas.kuldes')}
              </button>
            ) : (
              <button type="button" className="btn btn-fo" disabled={!kuldheto} onClick={() => void kuldes()}>
                {kuld ? sz('foglalas.kuldes_folyamatban') : sz('foglalas.kuldes')}
              </button>
            )}
          </div>
        </section>
      )}

    </div>
  )
}

function cegesIdopontok(e: ReturnType<typeof napAllapot>, negyedek: { tol: number }[], most: number | null,
                         tipus: 'VAROS' | 'LEADOS'): ReturnType<typeof napAllapot> {
  const korabbi: Lehetoseg[] = []
  const elso = e.lehetosegek[0]
  const nyit = negyedek[0]?.tol ?? null
  if (tipus === 'LEADOS' && elso && nyit !== null && elso.tol === nyit) {
    for (let t = CEGES_ELSO; t < nyit; t += 30) {
      if (most === null || t >= most) korabbi.push({ tol: t, kesz: elso.kesz })
    }
  }
  const lehetosegek = [...korabbi, ...e.lehetosegek].filter((l) => l.tol >= CEGES_ELSO && l.tol <= CEGES_UTOLSO)
  return { ...e, lehetosegek, allapot: lehetosegek.length === 0 ? 'tele' : e.allapot }
}

function egyeztetesre(e: Extra): boolean {
  return e.requires_quote || e.price_huf == null
}

function elvitelSzoveg(a: ElvitelAblak, f: Formatum): string {
  return `${f.napCim(a.nap)}, ${f.kozott(percOra(a.tol), percOra(a.ig))}`
}

async function elvitelAblak(data: Pick<DataSource, 'getDayLanes'>, nap: string): Promise<ElvitelAblak | null> {
  for (let i = 1; i <= 14; i++) {
    const d = napPlusz(nap, i)
    const negyedek = negyedekbol(await data.getDayLanes(d))
    if (negyedek.length > 0) {
      return { nap: d, tol: Math.max(ELVITEL_KEZDETE, negyedek[0].tol), ig: negyedek[negyedek.length - 1].ig }
    }
  }
  return null
}
