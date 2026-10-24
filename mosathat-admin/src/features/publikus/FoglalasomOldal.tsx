import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import './publikus-oldal.css'
import './foglalasom.css'
import type { FoglalasKep, FoglalasomAdat, OldalAllapot } from '../../../../supabase/functions/_shared/tipusok.ts'
import type { DataSource } from '../../data/source'
import { UZLET } from '../../lib/arculat'
import { hibaSzoveg } from '../../lib/format'
import { hibaFordit, nyelviUt, type Formatum, type Nyelv } from '../../lib/nyelv'
import { GOOGLE_KERESES, katKulcs, terjedelemKulcs, type SzovegKulcs } from '../../lib/publikusTartalom'
import { KoncepcioKeret, terkepCimek } from '../arculat/Koncepcio'
import { egerElhagy, egerKovet } from '../arculat/csillanas'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import { betolt, PUBLIKUS_KONCEPCIO, type Betoltve } from './PublikusOldal'
import { Gazdag, TartalomProvider, telefonLink, useFormatum, useNyelv, useSz, useUzlet, type Sz } from './tartalom'

const FRISSITES_MS = 60_000
const ZONA = 'Europe/Budapest'
const NAP_KULCS = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' })
const ORA = new Intl.DateTimeFormat('hu-HU', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' })

const LEPESEK: { allapot: OldalAllapot; kulcs: SzovegKulcs }[] = [
  { allapot: 'KERES', kulcs: 'ugyfel.lepes.keres' },
  { allapot: 'VISSZAIGAZOLVA', kulcs: 'ugyfel.lepes.visszaigazolva' },
  { allapot: 'KESZ', kulcs: 'ugyfel.lepes.kesz' },
  { allapot: 'ATVEVE', kulcs: 'ugyfel.lepes.atveve' },
]

const CIM: Record<OldalAllapot, [SzovegKulcs, SzovegKulcs]> = {
  KERES: ['ugyfel.keres.cim', 'ugyfel.keres.szoveg'],
  VISSZAIGAZOLVA: ['ugyfel.visszaigazolva.cim', 'ugyfel.visszaigazolva.szoveg'],
  KESZ: ['ugyfel.kesz.cim', 'ugyfel.kesz.szoveg'],
  ATVEVE: ['ugyfel.atveve.cim', 'ugyfel.atveve.szoveg'],
  NEM_FERT_BE: ['ugyfel.nem_fert.cim', 'ugyfel.nem_fert.szoveg'],
  LEMONDVA: ['ugyfel.lemondva.cim', 'ugyfel.lemondva.szoveg'],
  ELUTASITVA: ['ugyfel.elutasitva.cim', 'ugyfel.elutasitva.szoveg'],
  NEM_JOTT: ['ugyfel.nem_jott.cim', 'ugyfel.nem_jott.szoveg'],
  LEJART: ['ugyfel.lejart.cim', 'ugyfel.lejart.szoveg'],
  ISMERETLEN: ['ugyfel.ismeretlen.cim', 'ugyfel.ismeretlen.szoveg'],
}

const ELO: OldalAllapot[] = ['KERES', 'VISSZAIGAZOLVA', 'KESZ']
const VEGE: OldalAllapot[] = ['ATVEVE', 'NEM_FERT_BE', 'LEMONDVA', 'ELUTASITVA', 'NEM_JOTT', 'LEJART', 'ISMERETLEN']

export interface FoglalasomMuveletek {
  modosit: (uzenet: string) => Promise<void>
  lemond: () => Promise<void>
}

const ido = (hhmm: string | null | undefined) => (hhmm ? hhmm.replace(/^0(\d)/, '$1') : null)

function idopont(iso: string, f: Formatum): string {
  const nap = NAP_KULCS.format(new Date(iso))
  const ora = ORA.format(new Date(iso))
  return nap === NAP_KULCS.format(new Date()) ? ora : `${f.napRovidCim(nap)} ${ora}`
}

interface Sor {
  kulcs: string
  cimke: string
  ertek: string
}

function kepSorok(k: FoglalasKep, sz: Sz, f: Formatum, nyelv: Nyelv): Sor[] {
  const s: Sor[] = [{ kulcs: 'nap', cimke: sz('ugyfel.sor.nap'), ertek: f.napCim(k.nap) }]
  if (k.tipus === 'VAROS') {
    s.push({ kulcs: 'mikor', cimke: sz('ugyfel.sor.kezdes'), ertek: ido(k.kezdes) ?? '—' })
    if (k.kesz) s.push({ kulcs: 'vege', cimke: sz('ugyfel.sor.kesz'), ertek: f.kb(ido(k.kesz) ?? '') })
  } else {
    const hv = k.tipus === 'HOZOMVISZEM'
    s.push({ kulcs: 'mikor', cimke: sz(hv ? 'ugyfel.sor.erte' : 'ugyfel.sor.hozas'), ertek: ido(k.hozas) ?? '—' })
    const masnap = Boolean(k.elvitel_nap && k.elvitel_nap !== k.nap)
    const vege = k.elvitel
      ? (masnap && k.elvitel_nap ? `${f.napRovidCim(k.elvitel_nap)} ${ido(k.elvitel)}` : ido(k.elvitel) ?? '')
      : sz('ugyfel.sor.zarasig')
    s.push({ kulcs: 'vege', cimke: sz(hv ? 'ugyfel.sor.vissza' : 'ugyfel.sor.elvitel'), ertek: vege })
  }
  s.push({ kulcs: 'auto', cimke: sz('ugyfel.sor.auto'), ertek: [k.rendszam, [k.marka, k.modell].filter(Boolean).join(' ')].filter(Boolean).join(' · ') })
  const csomag = (nyelv === 'en' ? k.csomag_en : k.csomag) ?? (nyelv === 'en' ? 'Custom job' : 'Egyedi munka')
  s.push({
    kulcs: 'szolgaltatas', cimke: sz('ugyfel.sor.szolgaltatas'),
    ertek: [`${csomag}${k.full_service ? ' + Full Service' : ''}`, sz(terjedelemKulcs(k.terjedelem)), sz(katKulcs.foglalas(k.kategoria))].join(' · '),
  })
  if (k.extrak.length > 0) {
    s.push({
      kulcs: 'extrak', cimke: sz('ugyfel.sor.extrak'),
      ertek: k.extrak.map((e) => `${nyelv === 'en' ? e.nev_en : e.nev}${Number(e.db) > 1 ? ` × ${Number(e.db)}` : ''}`).join(', '),
    })
  }
  if (k.ar != null) s.push({ kulcs: 'ar', cimke: sz('ugyfel.sor.ar'), ertek: f.ft(k.ar) })
  return s
}

const SORREND = ['nap', 'mikor', 'vege', 'auto', 'szolgaltatas', 'extrak', 'ar']

function Adatok({ most, eredeti }: { most: FoglalasKep; eredeti: FoglalasKep }) {
  const sz = useSz()
  const f = useFormatum()
  const nyelv = useNyelv()
  const uj = new Map(kepSorok(most, sz, f, nyelv).map((s) => [s.kulcs, s]))
  const regi = new Map(kepSorok(eredeti, sz, f, nyelv).map((s) => [s.kulcs, s]))
  const sorok = SORREND.filter((k) => uj.has(k) || regi.has(k))
  const valtozott = sorok.some((k) => uj.get(k)?.ertek !== regi.get(k)?.ertek)
  return (
    <section className="ugy-kartya ugy-adatok">
      <h2>{sz('ugyfel.adatok')}</h2>
      <dl>
        {sorok.map((k) => {
          const u = uj.get(k)
          const r = regi.get(k)
          const mas = u?.ertek !== r?.ertek
          return (
            <div key={k} className="ugy-sor" data-valtozott={mas || undefined}>
              <dt>{(u ?? r)?.cimke}</dt>
              <dd>
                {mas && r && <s className="ugy-regi">{r.ertek}</s>}
                <span className="ugy-uj">{u?.ertek ?? '—'}</span>
                {mas && <span className="ugy-jel">{sz('ugyfel.modositva')}</span>}
              </dd>
            </div>
          )
        })}
      </dl>
      {valtozott && <p className="ugy-megjegyzes">{sz('ugyfel.modositva_magyarazat')}</p>}
    </section>
  )
}

function Lepesek({ allapot }: { allapot: OldalAllapot }) {
  const sz = useSz()
  const hol = LEPESEK.findIndex((l) => l.allapot === allapot)
  if (hol < 0) return null
  return (
    <ol className="ugy-lepesek">
      {LEPESEK.map((l, i) => (
        <li key={l.allapot} data-kesz={i < hol || undefined} data-aktiv={i === hol || undefined}
            aria-current={i === hol ? 'step' : undefined}>
          <span className="ugy-lepes-pont" aria-hidden="true" />
          <span>{sz(l.kulcs)}</span>
        </li>
      ))}
    </ol>
  )
}

function Elerhetoseg() {
  const sz = useSz()
  const u = useUzlet()
  const nyelv = useNyelv()
  return (
    <section className="ugy-kartya ugy-kapcsolat">
      <h2>{sz('ugyfel.kapcsolat')}</h2>
      <dl>
        <div><dt>{sz('cimke.cim')}</dt><dd>{u.irsz}, {u.cim}{u.haz ? ` (${u.haz})` : ''}</dd></div>
        <div><dt>{sz('cimke.telefon')}</dt><dd><a href={telefonLink(u.telefon)}>{u.telefon}</a></dd></div>
        <div><dt>E-mail</dt><dd><a href={`mailto:${u.email}`}>{u.email}</a></dd></div>
        <div><dt>{sz('cimke.nyitvatartas')}</dt><dd>{u.nyitvatartas}</dd></div>
      </dl>
      <a className="kv-link" href={terkepCimek(u, nyelv).utvonal} target="_blank" rel="noreferrer">{sz('hely.utvonal')}</a>
    </section>
  )
}

function KeszDoboz({ adat }: { adat: FoglalasomAdat }) {
  const sz = useSz()
  const f = useFormatum()
  const u = useUzlet()
  const ar = adat.ar
  return (
    <section className="ugy-kesz">
      <div className="ugy-kesz-fej">
        <span className="kv-cimke">{sz('ugyfel.kesz.doboz')}</span>
        {adat.kesz_ig && (
          <p><span>{sz('ugyfel.kesz.legkesobb')}:</span> <strong>{idopont(adat.kesz_ig, f)}</strong></p>
        )}
      </div>
      {ar?.vegleges != null && (
        <div className="ugy-vegosszeg">
          <span className="kv-cimke">{sz('ugyfel.sor.vegosszeg')}</span>
          <strong>{f.ft(ar.vegleges)}</strong>
          {ar.becsult != null && ar.becsult !== ar.vegleges && <s>{f.ft(ar.becsult)}</s>}
        </div>
      )}
      {ar?.felar_indok && <p className="ugy-indok">{sz('ugyfel.felar', { mit: ar.felar_indok })}</p>}
      {ar?.kimaradt && <p className="ugy-indok">{sz('ugyfel.kimaradt', { mit: ar.kimaradt })}</p>}
      <p className="ugy-kesz-hol">
        {u.irsz}, {u.cim} · <a href={telefonLink(u.telefon)}>{u.telefon}</a>
      </p>
    </section>
  )
}

function Modositas({ adat, muvelet }: { adat: FoglalasomAdat; muvelet: FoglalasomMuveletek | null }) {
  const sz = useSz()
  const nyelv = useNyelv()
  const f = useFormatum()
  const [szoveg, setSzoveg] = useState('')
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const kerelmek = adat.kerelmek ?? []

  async function kuld() {
    if (!muvelet || megy) return
    setMegy(true)
    setHiba(null)
    try {
      await muvelet.modosit(szoveg)
      setSzoveg('')
    } catch (e) {
      setHiba(hibaFordit(tisztaHiba(e), nyelv))
    } finally {
      setMegy(false)
    }
  }

  return (
    <section className="ugy-kartya ugy-modositas">
      <h2>{sz('ugyfel.modositas.cim')}</h2>
      {adat.modosithato && (
        <>
          <p><Gazdag s={sz('ugyfel.modositas.szoveg')} /></p>
          <label className="kv-rejtett" htmlFor="ugy-modositas">{sz('ugyfel.modositas.cim')}</label>
          <textarea id="ugy-modositas" rows={3} maxLength={1000} value={szoveg} placeholder={sz('ugyfel.modositas.minta')}
                    onChange={(e) => setSzoveg(e.target.value)} />
          {hiba && <p className="ugy-hiba" role="alert">{hiba}</p>}
          <div className="ugy-gombsor">
            <button type="button" className="ugy-gomb" disabled={megy || szoveg.trim().length < 3}
                    onClick={() => void kuld()}>
              {megy ? sz('ugyfel.modositas.kuldes') : sz('ugyfel.modositas.gomb')}
            </button>
          </div>
        </>
      )}
      {kerelmek.length > 0 && (
        <div className="ugy-uzenetek">
          <h3>{sz('ugyfel.modositas.uzenetek')}</h3>
          <ul>
            {[...kerelmek].reverse().map((k) => (
              <li key={k.mikor} data-kesz={k.elintezve ? true : undefined}>
                <time dateTime={k.mikor}>{idopont(k.mikor, f)}</time>
                <p>{k.uzenet}</p>
                <span className="ugy-uzenet-allapot">
                  {k.elintezve ? sz('ugyfel.modositas.elintezve') : sz('ugyfel.modositas.elkuldve')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Lemondas({ adat, muvelet }: { adat: FoglalasomAdat; muvelet: FoglalasomMuveletek | null }) {
  const sz = useSz()
  const nyelv = useNyelv()
  const f = useFormatum()
  const [kerdes, setKerdes] = useState(false)
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const hatarido = adat.lemondas_hatarido ? idopont(adat.lemondas_hatarido, f) : ''

  async function lemond() {
    if (!muvelet || megy) return
    setMegy(true)
    setHiba(null)
    try {
      await muvelet.lemond()
    } catch (e) {
      setHiba(hibaFordit(tisztaHiba(e), nyelv))
      setMegy(false)
    }
  }

  return (
    <section className="ugy-kartya ugy-lemondas">
      <h2>{sz('ugyfel.lemondas.cim')}</h2>
      <p>{sz('ugyfel.lemondas.szoveg', { hatarido })}</p>
      {hiba && <p className="ugy-hiba" role="alert">{hiba}</p>}
      <div className="ugy-gombsor">
        {kerdes ? (
          <>
            <span className="ugy-kerdes">{sz('ugyfel.lemondas.kerdes')}</span>
            <button type="button" className="ugy-gomb ugy-gomb-masod" disabled={megy} onClick={() => setKerdes(false)}>
              {sz('ugyfel.lemondas.nem')}
            </button>
            <button type="button" className="ugy-gomb ugy-gomb-veszely" disabled={megy} onClick={() => void lemond()}>
              {sz('ugyfel.lemondas.igen')}
            </button>
          </>
        ) : (
          <button type="button" className="ugy-gomb ugy-gomb-masod" onClick={() => setKerdes(true)}>
            {sz('ugyfel.lemondas.gomb')}
          </button>
        )}
      </div>
    </section>
  )
}

function Ertekeles({ link }: { link: string }) {
  const sz = useSz()
  return (
    <section className="ugy-kartya ugy-ertekeles">
      <div className="ugy-csillagok" aria-hidden="true">★★★★★</div>
      <h2>{sz('ugyfel.ertekeles.cim')}</h2>
      <p>{sz('ugyfel.ertekeles.szoveg')}</p>
      <div className="ugy-gombsor">
        <a className="kv-gomb kv-gomb-lakk" href={link} target="_blank" rel="noreferrer"
           data-csillan onPointerMove={egerKovet} onPointerLeave={egerElhagy}>
          {sz('ugyfel.ertekeles.gomb')}
        </a>
      </div>
    </section>
  )
}

function Tovabb() {
  const sz = useSz()
  const nyelv = useNyelv()
  return (
    <div className="ugy-tovabb">
      <a className="ugy-gomb ugy-gomb-masod" href={nyelviUt('/publikus', nyelv)}>{sz('ugyfel.fooldal')}</a>
      <a className="kv-gomb kv-gomb-lakk" href={`${nyelviUt('/publikus', nyelv)}#foglalas`}
         data-csillan onPointerMove={egerKovet} onPointerLeave={egerElhagy}>
        {sz('ugyfel.uj')}
      </a>
    </div>
  )
}

export function FoglalasomTartalom({ adat, muvelet, google }: {
  adat: FoglalasomAdat
  muvelet: FoglalasomMuveletek | null
  google: string | null
}) {
  const sz = useSz()
  const f = useFormatum()
  const [cimKulcs, szovegKulcs] = CIM[adat.allapot] ?? CIM.ISMERETLEN
  const mikor = adat.kesz_ig ? idopont(adat.kesz_ig, f) : ''
  const elo = ELO.includes(adat.allapot)
  const vege = VEGE.includes(adat.allapot)
  return (
    <>
      <section className="kv-ceg-sav ugy-sav" data-csillan data-allapot={adat.allapot}>
        <div className="kv-ceg-sav-belso">
          <span className="ugy-felcim">
            {sz('ugyfel.cim')}{adat.most ? ` · ${adat.most.rendszam}` : ''}
          </span>
          <h1>{sz(cimKulcs)}</h1>
          <p><Gazdag s={sz(szovegKulcs, { mikor })} kiemeles="strong" /></p>
          <Lepesek allapot={adat.allapot} />
        </div>
      </section>
      <section className="kv-foglalas ugy-tartalom">
        <div className="ugy-hasab">
          {adat.allapot === 'KESZ' && <KeszDoboz adat={adat} />}
          {adat.allapot === 'ATVEVE' && google && <Ertekeles link={google} />}
          {vege && <Tovabb />}
          {elo && adat.most && adat.eredeti && <Adatok most={adat.most} eredeti={adat.eredeti} />}
          {elo && (adat.modosithato || (adat.kerelmek ?? []).length > 0) && <Modositas adat={adat} muvelet={muvelet} />}
          {elo && adat.lemondhato && <Lemondas adat={adat} muvelet={muvelet} />}
          <Elerhetoseg />
        </div>
      </section>
    </>
  )
}

function tisztaHiba(e: unknown): string {
  return hibaSzoveg(e).replace(/^(Módosítási kérés|Lemondás|Foglalás): /, '')
}

function Cim({ adat }: { adat: FoglalasomAdat | null }) {
  const sz = useSz()
  const u = useUzlet()
  const cim = `${sz('ugyfel.cim')}${adat?.most ? `: ${adat.most.rendszam}` : ''} — ${u.nev}`
  useEffect(() => { document.title = cim }, [cim])
  return null
}

function kezdoNyelv(): Nyelv | null {
  const p = new URLSearchParams(window.location.search).get('lang')
  return p === 'en' || p === 'hu' ? p : null
}

export default function FoglalasomOldal({ token }: { token: string | null }) {
  const [betoltott, setBetoltott] = useState<Betoltve | null>(null)
  const [adat, setAdat] = useState<FoglalasomAdat | null>(null)
  const [hiba, setHiba] = useState(false)
  const [valasztott, setValasztott] = useState<Nyelv | null>(kezdoNyelv)
  const forrasRef = useRef<DataSource | null>(null)

  const nyelv: Nyelv = valasztott ?? adat?.nyelv ?? 'hu'

  const frissit = useCallback(async () => {
    const forras = forrasRef.current
    if (!forras) return
    if (!token) { setAdat({ allapot: 'ISMERETLEN' }); return }
    setAdat(await forras.foglalasom(token))
  }, [token])

  useEffect(() => {
    document.documentElement.classList.add('publikus')
    const robot = document.createElement('meta')
    robot.name = 'robots'
    robot.content = 'noindex, nofollow'
    document.head.appendChild(robot)
    let el = true
    betolt()
      .then(async (b) => {
        forrasRef.current = b.forras
        const a = token ? await b.forras.foglalasom(token) : { allapot: 'ISMERETLEN' as const }
        if (!el) return
        setBetoltott(b)
        setAdat(a)
      })
      .catch(() => { if (el) setHiba(true) })
    return () => { el = false; robot.remove() }
  }, [token])

  useEffect(() => {
    if (!betoltott) return
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void frissit().catch(() => {}) }, FRISSITES_MS)
    const lathato = () => { if (document.visibilityState === 'visible') void frissit().catch(() => {}) }
    document.addEventListener('visibilitychange', lathato)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', lathato) }
  }, [betoltott, frissit])

  useEffect(() => {
    document.documentElement.lang = nyelv
    if (!valasztott) return
    const url = new URL(window.location.href)
    url.searchParams.set('lang', valasztott)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [nyelv, valasztott])

  const muvelet: FoglalasomMuveletek | null = betoltott && token ? {
    modosit: async (uzenet) => { setAdat(await betoltott.forras.foglalasomModositas(token, uzenet)) },
    lemond: async () => {
      setAdat(await betoltott.forras.foglalasomLemondas(token))
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
  } : null

  if (hiba) {
    return (
      <div className="pub-allapot">
        <strong>{UZLET.nev}</strong>
        <span>
          {nyelv === 'en'
            ? `The page cannot be loaded right now. Please try again in a few minutes, or call us: ${UZLET.telefon}`
            : `Az oldal most nem tölthető be. Kérjük, próbáld újra pár perc múlva, vagy hívj minket: ${UZLET.telefon}`}
        </span>
      </div>
    )
  }
  if (!betoltott || !adat) return <div className="pub-allapot" aria-busy="true"><strong>{UZLET.nev}</strong></div>

  const mod = betoltott.adat.arculat === PUBLIKUS_KONCEPCIO && betoltott.adat.mod ? betoltott.adat.mod : 'VILAGOS'
  const google = betoltott.adat.tartalom.adatok.google_ertekeles?.trim() || GOOGLE_KERESES

  return (
    <TartalomProvider t={betoltott.adat.tartalom} lemondasOra={betoltott.adat.lemondasOra} nyelv={nyelv}>
      <Cim adat={adat} />
      <div className="kv-keret pub-keret pub-ceg pub-ugyfel">
        <KoncepcioKeret kod={PUBLIKUS_KONCEPCIO} mod={mod} k={betoltott.adat.katalogus} nyilvanos
                        navJobbra={<NavJobb nyelv={nyelv} onValt={setValasztott} />}>
          <FoglalasomTartalom adat={adat} muvelet={muvelet} google={google} />
        </KoncepcioKeret>
      </div>
    </TartalomProvider>
  )
}

function NavJobb({ nyelv, onValt }: { nyelv: Nyelv; onValt: (n: Nyelv) => void }): ReactNode {
  const sz = useSz()
  return (
    <div className="kv-ceg-jobb">
      <span className="kv-ceg-cimke">{sz('ugyfel.cim')}</span>
      <NyelvKapcsolo nyelv={nyelv} onValt={onValt} />
    </div>
  )
}
