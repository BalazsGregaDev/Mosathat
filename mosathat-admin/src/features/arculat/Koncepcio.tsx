import {
  createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject,
} from 'react'

import type { Catalog } from '../../data/source'
import type { Extra, ServiceArea, VehicleCategory } from '../../lib/types'
import {
  csomagTabla, kategoriaTol, KATEGORIAK, szam,
  type Cella, type CsomagTabla, type KoncepcioKod, type Mod,
} from '../../lib/arculat'
import { katKulcs, type SzovegKulcs, type Uzlet } from '../../lib/publikusTartalom'
import { JOGI_CIM, JOGI_CIM_EN } from '../../lib/ceg'
import { FELIRAT, nyelviUt, type Nyelv } from '../../lib/nyelv'
import { forditott, Gazdag, telefonLink, useFormatum, useNyelv, useSz, useUzlet } from '../publikus/tartalom'
import { useKereso } from '../publikus/keresoKontextus'
import Galeria from './Galeria'
import Velemenyek from './Velemenyek'
import GyikSzakasz, { GyikOldal } from './Gyik'
import { egerElhagy, egerKovet, useCsillanas, useVaszonSzin } from './csillanas'
import { EgyediSzekcio, FelugroAblak } from './Bejelentes'
import { gorgetIde } from './gorgetes'

interface KvAllapot {
  k: Catalog
  t: CsomagTabla
  kat: VehicleCategory
  setKat: (k: VehicleCategory) => void
  tol: Record<VehicleCategory, number | null>
  nyilvanos: boolean
  foglalas?: ReactNode
  kiemelt: string | null
  onCsomag?: (id: string) => void
  nyelvValaszto?: ReactNode
}

const Kv = createContext<KvAllapot | null>(null)
const useKv = () => useContext(Kv)!

type Cel = 'rolunk' | 'galeria' | 'csomagok' | 'foglalas' | 'kapcsolat'

const CEL_ELEM: Record<Cel, string> = {
  rolunk: '.kv-rolunk h2',
  galeria: '.kv-galeria',
  csomagok: '.kv-csomagok',
  foglalas: '.kv-foglalas',
  kapcsolat: '.kv-lab',
}

const CEL_CIM: Record<Cel, string> = {
  rolunk: '.kv-rolunk h2',
  galeria: '.kv-galeria h2',
  csomagok: '.kv-csomagok h2',
  foglalas: '.kv-foglalas h2',
  kapcsolat: '.kv-lab [data-kapcsolat] > .kv-cimke',
}

const KEMLEL: Record<Cel, [string, string, number]> = {
  rolunk: ['.kv-rolunk h2', '.kv-rolunk', 64],
  galeria: ['.kv-galeria', '.kv-galeria', 0],
  csomagok: ['.kv-csomagok', '.kv-csomagok', 0],
  foglalas: ['.kv-foglalas', '.kv-foglalas', 0],
  kapcsolat: ['.kv-hely', '.kv-lab', 0],
}

const MENU: [SzovegKulcs, Cel][] = [
  ['menu.rolunk', 'rolunk'], ['menu.csomagok', 'csomagok'], ['menu.foglalas', 'foglalas'],
  ['menu.galeria', 'galeria'], ['menu.kapcsolat', 'kapcsolat'],
]

const FELVILLANAS = 3000
const felvillanIdo = new WeakMap<HTMLElement, number>()

function felvillant(cim: HTMLElement | null | undefined) {
  if (!cim) return
  window.clearTimeout(felvillanIdo.get(cim))
  cim.removeAttribute('data-felvillan')
  void cim.offsetWidth
  cim.setAttribute('data-felvillan', '')
  felvillanIdo.set(cim, window.setTimeout(() => cim.removeAttribute('data-felvillan'), FELVILLANAS))
}

function ugras(e: MouseEvent<HTMLAnchorElement>, cel: Cel | null, nyilvanos = false, nyelv: Nyelv = 'hu') {
  e.preventDefault()
  if (!cel) return
  const kv = e.currentTarget.closest('.kv')
  const elem = kv?.querySelector(CEL_ELEM[cel])
  if (elem) {
    gorgetIde(elem)
    felvillant(kv?.querySelector<HTMLElement>(CEL_CIM[cel]))
  } else if (nyilvanos) window.location.href = `${nyelviUt('/publikus', nyelv)}#${cel}`
}

export function terkepCimek(u: Uzlet, nyelv: Nyelv) {
  const cim = `${u.cim.replace(/\.$/, '')}, ${u.irsz}`
  return {
    terkep: `https://www.google.com/maps?q=${encodeURIComponent(`${u.nev}, ${cim}`)}&z=16&hl=${nyelv}&output=embed`,
    utvonal: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cim)}&hl=${nyelv}`,
  }
}

function Nav({ jobbra }: { jobbra?: ReactNode }) {
  const { nyilvanos, nyelvValaszto } = useKv()
  const u = useUzlet()
  const sz = useSz()
  const nyelv = useNyelv()
  const f = FELIRAT[nyelv]
  const [nyitva, setNyitva] = useState(false)
  const [gorgetve, setGorgetve] = useState(false)
  const [aktiv, setAktiv] = useState('')
  const fej = useRef<HTMLElement>(null)
  const panelId = useId()
  const hamburger = nyilvanos && !jobbra

  useEffect(() => {
    if (!hamburger) return
    const kv = fej.current?.closest('.kv')
    if (!kv) return
    let kocka = 0
    const szamol = () => {
      kocka = 0
      const vonal = (fej.current?.offsetHeight ?? 0) + window.innerHeight * 0.3
      const legalul = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4
      const ki: Cel[] = []
      for (const [, cel] of MENU) {
        const [felso, also, elotte] = KEMLEL[cel]
        const fent = kv.querySelector(felso)?.getBoundingClientRect()
        const lent = kv.querySelector(also)?.getBoundingClientRect()
        if (fent && lent && fent.top - elotte <= vonal && lent.bottom > vonal) ki.push(cel)
      }
      const uj = legalul && kv.querySelector(KEMLEL.kapcsolat[1]) ? 'kapcsolat' : ki.join(' ')
      setAktiv((r) => (r === uj ? r : uj))
    }
    const kerel = () => { if (!kocka) kocka = requestAnimationFrame(szamol) }
    kerel()
    window.addEventListener('scroll', kerel, { passive: true })
    window.addEventListener('resize', kerel)
    return () => { cancelAnimationFrame(kocka); window.removeEventListener('scroll', kerel); window.removeEventListener('resize', kerel) }
  }, [hamburger])

  useEffect(() => {
    if (!hamburger) return
    let kockas = 0
    const figyel = () => {
      cancelAnimationFrame(kockas)
      kockas = requestAnimationFrame(() => setGorgetve(window.scrollY > 24))
    }
    figyel()
    window.addEventListener('scroll', figyel, { passive: true })
    return () => { cancelAnimationFrame(kockas); window.removeEventListener('scroll', figyel) }
  }, [hamburger])

  useEffect(() => {
    if (!nyitva) return
    const billentyu = (e: KeyboardEvent) => { if (e.key === 'Escape') setNyitva(false) }
    window.addEventListener('keydown', billentyu)
    return () => window.removeEventListener('keydown', billentyu)
  }, [nyitva])

  const logo = (e: MouseEvent<HTMLAnchorElement>) => {
    setNyitva(false)
    if (e.currentTarget.closest('.kv')?.querySelector('.kv-hero')) {
      e.preventDefault()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const aktivok = aktiv.split(' ')
  const linkek = MENU.map(([m, cel]) => (
    <a key={m} href={`#${cel}`} aria-current={aktivok.includes(cel) ? 'location' : undefined}
       onClick={(e) => { setNyitva(false); ugras(e, cel, nyilvanos, nyelv) }}>{sz(m)}</a>
  ))

  return (
    <>
      <header className="kv-nav" ref={fej} data-nyitva={nyitva || undefined} data-gorgetve={gorgetve || undefined}>
        {nyilvanos
          ? <a className="kv-logo" href={nyelviUt('/publikus', nyelv)} onClick={logo}>{u.nev}</a>
          : <span className="kv-logo">{u.nev}</span>}
        {jobbra ?? <nav aria-label={f.fomenu}>{linkek}</nav>}
        {hamburger && (
          <button type="button" className="kv-menu-gomb" aria-expanded={nyitva} aria-controls={panelId}
                  aria-label={nyitva ? f.menuBezar : f.menu} onClick={() => setNyitva(!nyitva)}>
            <span /><span /><span />
          </button>
        )}
      </header>
      {nyelvValaszto && <div className="kv-nyelv-sor">{nyelvValaszto}</div>}
      {hamburger && (
        <div className="kv-menu-hely" data-nyitva={nyitva || undefined}>
          <button type="button" className="kv-menu-hatter" tabIndex={-1} aria-hidden="true" onClick={() => setNyitva(false)} />
          <div className="kv-menu-panel" id={panelId}>
            <nav aria-label={f.fomenu}>{linkek}</nav>
            {nyelvValaszto && <div className="kv-menu-nyelv" onClickCapture={() => setNyitva(false)}>{nyelvValaszto}</div>}
          </div>
        </div>
      )}
    </>
  )
}

function Gomb({ children, cel = 'foglalas', lakk = false }: { children?: ReactNode; cel?: Cel | null; lakk?: boolean }) {
  const { nyilvanos } = useKv()
  const sz = useSz()
  const nyelv = useNyelv()
  const fenyes = lakk ? { 'data-csillan': '', onPointerMove: egerKovet, onPointerLeave: egerElhagy } : {}
  return (
    <a className={lakk ? 'kv-gomb kv-gomb-lakk' : 'kv-gomb'} href="#foglalas" onClick={(e) => ugras(e, cel, nyilvanos, nyelv)} {...fenyes}>
      {children ?? sz('gomb.idopont')}
    </a>
  )
}

function GaleriaFoglalassal() {
  const sz = useSz()
  return <Galeria gomb={<Gomb lakk>{sz('galeria.foglalas')}</Gomb>} />
}

function Info({ cimke, children }: { cimke: string; children: ReactNode }) {
  return (
    <div className="kv-info">
      <span className="kv-cimke">{cimke}</span>
      <span className="kv-ertek">{children}</span>
    </div>
  )
}

function Jel({ c }: { c: Cella }) {
  const f = FELIRAT[useNyelv()]
  if (c.tipus === 'van') return <><span className="kv-van" aria-hidden="true" /><span className="kv-rejtett">{f.bennevan}</span></>
  if (c.tipus === 'nincs') return <><span className="kv-nincs" aria-hidden="true" /><span className="kv-rejtett">{f.nincsbenne}</span></>
  return <span className="kv-mas" data-kiemelt={c.kiemelt || undefined}>{c.szoveg}</span>
}

function KatValaszto() {
  const { kat, setKat } = useKv()
  const sz = useSz()
  return (
    <div className="kv-kat" role="group" aria-label={sz('csomagok.kategoria')}>
      {KATEGORIAK.map((k) => (
        <button key={k} type="button" aria-pressed={kat === k} onClick={() => setKat(k)}>{sz(katKulcs.tabla(k))}</button>
      ))}
    </div>
  )
}

interface KeretHely {
  top: number
  left: number
  width: number
  height: number
}

function useKiemelesKeret(index: number, frissit: unknown) {
  const gorgo = useRef<HTMLDivElement>(null)
  const [keret, setKeret] = useState<KeretHely | null>(null)

  useLayoutEffect(() => {
    const doboz = gorgo.current
    const tabla = doboz?.querySelector('table')
    if (!doboz || !tabla || index < 0) return
    const meres = () => {
      const th = tabla.querySelectorAll<HTMLElement>('thead th')[index + 1]
      const nev = th?.querySelector<HTMLElement>('.kv-csomag-nev')
      if (!th || !nev) return
      const t = tabla.getBoundingClientRect()
      const c = th.getBoundingClientRect()
      const arany = tabla.offsetWidth > 0 ? t.width / tabla.offsetWidth : 1
      const top = Math.max(0, Math.round((nev.getBoundingClientRect().top - t.top) / arany - 12))
      const uj = {
        top,
        left: Math.round((c.left - t.left) / arany),
        width: Math.round(c.width / arany),
        height: Math.max(0, Math.floor(tabla.offsetHeight - top)),
      }
      setKeret((r) => (r && r.top === uj.top && r.left === uj.left && r.width === uj.width && r.height === uj.height ? r : uj))
    }
    const figyelo = new ResizeObserver(meres)
    figyelo.observe(tabla)
    tabla.querySelectorAll('thead th').forEach((e) => figyelo.observe(e))
    return () => figyelo.disconnect()
  }, [index, frissit])

  return { gorgo, keret: index >= 0 ? keret : null }
}

function Tabla({ sorszam = false, ft = true }: { sorszam?: boolean; ft?: boolean }) {
  const { t, kiemelt, onCsomag } = useKv()
  const sz = useSz()
  const nyelv = useNyelv()
  const f = useFormatum()
  const arSzoveg = (ar: number | null) => (nyelv === 'en'
    ? ar == null ? FELIRAT.en.egyedi : ft ? f.ft(ar) : ar.toLocaleString('en-GB')
    : `${szam(ar)}${ft && ar != null ? ' Ft' : ''}`)
  const index = kiemelt ? t.csomagok.findIndex((c) => c.id === kiemelt) : -1
  const { gorgo, keret } = useKiemelesKeret(index, t)
  const halvany = (i: number) => (index >= 0 && i !== index) || undefined
  let n = 0
  return (
    <div className="kv-tabla-gorgo" ref={gorgo}>
      <table className="kv-tabla">
        <thead>
          <tr>
            <th className="kv-fej-bal" scope="col">
              <span className="kv-csoport-cim">{sz('csomagok.kategoria')}</span>
              <KatValaszto />
            </th>
            {t.csomagok.map((c, i) => {
              const tartalom = (
                <>
                  <span className="kv-csomag-nev">{c.nev}</span>
                  <span className="kv-ar">{arSzoveg(c.ar)}</span>
                </>
              )
              return (
                <th key={c.id} scope="col" data-halvany={halvany(i)}>
                  {onCsomag && c.ar != null ? (
                    <button type="button" className="kv-csomag-gomb" aria-pressed={i === index}
                            onClick={() => onCsomag(c.id)}>
                      {tartalom}
                    </button>
                  ) : tartalom}
                </th>
              )
            })}
          </tr>
        </thead>
        {t.csoportok.map((g) => (
          <tbody key={g.terulet}>
            {g.arak.some((a) => a != null) ? (
              <tr className="kv-csoport" data-arakkal>
                <th scope="rowgroup">
                  <span className="kv-csoport-nev">{sz(g.terulet === 'BELSO' ? 'csomagok.csoport.belso' : 'csomagok.csoport.kulso')}</span>
                  <span className="kv-csak">{sz(g.terulet === 'BELSO' ? 'csomagok.csak.belso' : 'csomagok.csak.kulso')}</span>
                </th>
                {g.arak.map((a, i) => (
                  <td key={i} className="kv-csak-ar" data-halvany={halvany(i)}>
                    {a == null ? '—' : a === 'egyedi' ? FELIRAT[nyelv].egyedi : arSzoveg(a)}
                  </td>
                ))}
              </tr>
            ) : (
              <tr className="kv-csoport">
                <th scope="colgroup" colSpan={t.csomagok.length + 1}>
                  {sz(g.terulet === 'BELSO' ? 'csomagok.csoport.belso' : 'csomagok.csoport.kulso')}
                </th>
              </tr>
            )}
            {g.sorok.map((s) => {
              n++
              return (
                <tr key={s.nev}>
                  <th scope="row">
                    {sorszam && <span className="kv-sorszam">{String(n).padStart(2, '0')}</span>}
                    {s.nev}
                  </th>
                  {s.cellak.map((c, i) => <td key={i} data-halvany={halvany(i)}><Jel c={c} /></td>)}
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
      {keret && <span className="kv-kiemeles" aria-hidden="true" style={keret} />}
    </div>
  )
}

function Labjegyzet() {
  const { t } = useKv()
  if (t.kulsoTol == null && t.belsoTol == null) return null
  return (
    <p className="kv-labjegyzet">
      {t.kulsoTol != null && <>Csak külső: {szam(t.kulsoTol)} Ft-tól</>}
      {t.kulsoTol != null && t.belsoTol != null && ' — '}
      {t.belsoTol != null && <>csak belső: {szam(t.belsoTol)} Ft-tól</>}
      .
    </p>
  )
}

function Alcim({ utana = '' }: { utana?: string }) {
  const { kat } = useKv()
  const sz = useSz()
  return <span className="kv-alcim">{sz(katKulcs.alcim(kat))}{utana}</span>
}

const LEPESEK = ['Autó', 'Csomag', 'Időpont', 'Adatok']

function Foglalas() {
  const { kat, setKat, tol } = useKv()
  const sz = useSz()
  return (
    <section className="kv-foglalas">
      <h2>{sz('foglalas.cim')}</h2>
      <p className="kv-bevezeto">{sz('foglalas.bevezeto')}</p>
      <ol className="kv-lepesek">
        {LEPESEK.map((l, i) => (
          <li key={l} aria-current={i === 0 ? 'step' : undefined}>
            <span className="kv-lepes-szam">{i + 1}</span>{l}
          </li>
        ))}
      </ol>
      <div className="kv-lepes">
        <h3>{sz('foglalas.auto')}</h3>
        <div className="kv-kat-kartyak">
          {KATEGORIAK.map((k) => (
            <button key={k} type="button" aria-pressed={kat === k} onClick={() => setKat(k)}>
              <span className="kv-kat-nev">{sz(katKulcs.tabla(k))}</span>
              <span className="kv-kat-ar">{tol[k] != null ? `${szam(tol[k])} Ft-tól` : 'árajánlat alapján'}</span>
            </button>
          ))}
        </div>
        <div className="kv-lepes-lab">
          <span className="kv-lepes-kov">Következő: csomag és extrák</span>
          <Gomb cel={null}>Tovább</Gomb>
        </div>
      </div>
    </section>
  )
}

function Terkep() {
  const [betolt, setBetolt] = useState(false)
  const u = useUzlet()
  const sz = useSz()
  const nyelv = useNyelv()
  const linkek = terkepCimek(u, nyelv)
  return (
    <section className="kv-hely">
      <div className="kv-hely-szoveg">
        <h2>{sz('hely.cim')}</h2>
        <p className="kv-bevezeto"><Gazdag s={sz('hely.bevezeto')} /></p>
        <Info cimke={sz('cimke.cim')}>{u.irsz}, {u.cim}</Info>
        <Info cimke={sz('cimke.nyitvatartas')}>{u.nyitvatartas}</Info>
        <Info cimke={sz('cimke.leadas')}>{u.leadas}</Info>
        <Info cimke={sz('cimke.telefon')}><a href={telefonLink(u.telefon)}>{u.telefon}</a></Info>
        <a className="kv-link" href={linkek.utvonal} target="_blank" rel="noreferrer">{sz('hely.utvonal')}</a>
      </div>
      <div className="kv-terkep" data-betoltve={betolt || undefined}>
        {betolt ? (
          <iframe title={FELIRAT[nyelv].terkepen(u.nev)} src={linkek.terkep} referrerPolicy="no-referrer-when-downgrade" />
        ) : (
          <div className="kv-terkep-kerdes">
            <p>{sz('hely.terkep_szoveg')}</p>
            <button type="button" className="kv-terkep-gomb" onClick={() => setBetolt(true)}>{sz('hely.terkep_gomb')}</button>
          </div>
        )}
      </div>
    </section>
  )
}

const LAB_MENU = ['impresszum', 'adatvedelem'] as const

function Lab() {
  const { nyilvanos } = useKv()
  const u = useUzlet()
  const sz = useSz()
  const nyelv = useNyelv()
  const jogiCim = nyelv === 'en' ? JOGI_CIM_EN : JOGI_CIM
  return (
    <footer className="kv-lab" data-csillan onPointerMove={egerKovet} onPointerLeave={egerElhagy}>
      <div className="kv-lab-fo">
        <div className="kv-lab-elso">
          <span className="kv-logo">{u.nev}</span>
          <p><Gazdag s={sz('lab.leiras')} /></p>
        </div>
        <Info cimke={sz('cimke.cim')}>{u.irsz}, {u.cim}<br />{u.haz}, {u.szint}</Info>
        <Info cimke={sz('cimke.nyitvatartas')}>{u.nyitvatartas}<br />{sz('lab.leadas')}</Info>
        <div className="kv-info" data-kapcsolat>
          <span className="kv-cimke">{sz('cimke.kapcsolat')}</span>
          <span className="kv-ertek"><a href={telefonLink(u.telefon)}>{u.telefon}</a></span>
          <span className="kv-ertek"><a href={`mailto:${u.email}`}>{u.email}</a></span>
          <a className="kv-link" href="#foglalas" onClick={(e) => ugras(e, 'foglalas', nyilvanos, nyelv)}>{sz('gomb.idopont')}</a>
        </div>
      </div>
      <div className="kv-lab-also">
        <span>© {new Date().getFullYear()} {u.nev}</span>
        <nav>
          <a href={nyelviUt('/gyik', nyelv)} onClick={nyilvanos ? undefined : (e) => ugras(e, null)}>{sz('gyik.cim')}</a>
          {LAB_MENU.map((m) => (
            <a key={m} href={nyelviUt(`/${m}`, nyelv)} onClick={nyilvanos ? undefined : (e) => ugras(e, null)}>{jogiCim[m]}</a>
          ))}
        </nav>
      </div>
    </footer>
  )
}

function Vege({ foglalasNelkul = false, velemenyekkel = false }: { foglalasNelkul?: boolean; velemenyekkel?: boolean }) {
  const { foglalas, nyilvanos } = useKv()
  return (
    <>
      {!foglalasNelkul && (foglalas ?? <Foglalas />)}
      {velemenyekkel && <Velemenyek />}
      <Terkep />
      {velemenyekkel && <GyikSzakasz nyilvanos={nyilvanos} />}
      <Lab />
    </>
  )
}

function Adatlap() {
  const u = useUzlet()
  return (
    <>
      <Nav />
      <section className="kv-hero">
        <div className="kv-hero-bal">
          <h1>Kézi autókozmetika a Váci úti mélygarázsban.</h1>
          <p className="kv-lede">
            Nem gyorsmosó. Bogároldótól a hosszantartó vaxig, csomagonként pontosan leírva,
            hogy mit kaptok — és mit nem.
          </p>
          <Gomb />
        </div>
        <div className="kv-hero-jobb">
          <Info cimke="Telephely">{u.irsz}, {u.cim}<br /><b>{u.haz}</b>, {u.szint}</Info>
          <Info cimke="Bejárat">A {u.bejarat}</Info>
          <Info cimke="Nyitvatartás">{u.napok} <b>{u.nyitas}–{u.zaras}</b></Info>
          <Info cimke="Leadás legkorábban"><b>{u.leadas}</b> — munkába menet is</Info>
          <Info cimke="Telefon">{u.telefon}</Info>
        </div>
      </section>
      <section className="kv-csomagok">
        <div className="kv-szakasz-fej">
          <h2>Mit tartalmaznak a csomagok</h2>
          <Alcim utana=" — bruttó" />
        </div>
        <Tabla sorszam />
        <Labjegyzet />
      </section>
      <Vege />
    </>
  )
}

function Melygarazs() {
  const u = useUzlet()
  return (
    <>
      <Nav />
      <section className="kv-hero">
        <span className="kv-kicker">{u.haz} — mélygarázs, −1. szint</span>
        <h1>Amíg dolgozol,<br /><em>rendbe tesszük</em><br />az autód</h1>
        <p className="kv-lede">
          Add le reggel a garázsban, vedd át tisztán munka után. Kézi mosás, kézi takarítás,
          gépek nélkül a lakkon.
        </p>
        <Gomb />
      </section>
      <section className="kv-sav">
        <Info cimke="Nyitvatartás">{u.napokRovid} {u.nyitas}–{u.zaras}</Info>
        <Info cimke="Leadás legkorábban">{u.leadas}</Info>
        <Info cimke="Bejárat">{u.bejarat}</Info>
        <Info cimke="Telefon">{u.telefon}</Info>
      </section>
      <div className="kv-csik" aria-hidden="true" />
      <section className="kv-csomagok">
        <h2>Csomagok</h2>
        <Tabla />
      </section>
      <div className="kv-csik" aria-hidden="true" />
      <Vege />
    </>
  )
}

const BORITO_KEP = '/kepek/borito.jpg'

function Borito() {
  const [allapot, setAllapot] = useState<'tolt' | 'van' | 'nincs'>('tolt')
  const { nyilvanos } = useKv()
  const sz = useSz()
  return (
    <div className="kv-foto" data-kep={allapot} data-ablak={nyilvanos || undefined}
         style={{ ['--borito-kep' as string]: `url("${BORITO_KEP}")` }}>
      <img src={BORITO_KEP} alt={sz('hero.borito_alt')} decoding="async"
           onLoad={() => setAllapot('van')} onError={() => setAllapot('nincs')} />
      <span>{sz('hero.borito_helye')}</span>
    </div>
  )
}

function KeresoGomb() {
  const { nyilvanos } = useKv()
  const fe = FELIRAT[useNyelv()]
  const kereso = useKereso()
  if (!nyilvanos || !kereso) return null
  return <button type="button" className="kv-gomb-masod" aria-haspopup="dialog" onClick={kereso.nyit}>{fe.kerNyito}</button>
}

function HeroGombok() {
  const { nyilvanos } = useKv()
  const sz = useSz()
  const kereso = useKereso()
  if (!nyilvanos || !kereso) return null
  return (
    <div className="kv-hero-gombok">
      <Gomb lakk>{sz('galeria.foglalas')}</Gomb>
      <KeresoGomb />
    </div>
  )
}

function MagazinHero() {
  const sz = useSz()
  return (
    <>
      <section className="kv-hero">
        <span className="kv-kicker">{sz('hero.felcim')}</span>
        <h1><Gazdag s={sz('hero.cim')} /></h1>
        <HeroGombok />
        <div className="kv-hasabok">
          <div className="kv-hero-foglalas"><Gomb lakk>{sz('galeria.foglalas')}</Gomb><KeresoGomb /></div>
          <p className="kv-lede"><Gazdag s={sz('hero.bevezeto')} /></p>
          <p className="kv-halk"><Gazdag s={sz('hero.mellek')} /></p>
        </div>
      </section>
      <EgyediSzekcio />
      <Borito />
    </>
  )
}

function useKepernyoreIllesztes(frissit: unknown) {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const s = ref.current
    if (!s) return
    const illeszt = () => {
      s.style.zoom = ''
      if (getComputedStyle(s).position !== 'sticky') return
      const nav = parseFloat(getComputedStyle(s).getPropertyValue('--nav-h')) || 0
      const hely = window.innerHeight - nav - 32
      const magas = s.getBoundingClientRect().height
      if (magas > hely && hely > 200) s.style.zoom = String(Math.max(0.6, hely / magas))
    }
    illeszt()
    const kesobb = window.setTimeout(illeszt, 500)
    document.fonts?.ready.then(illeszt).catch(() => {})
    window.addEventListener('resize', illeszt)
    return () => { window.clearTimeout(kesobb); window.removeEventListener('resize', illeszt) }
  }, [frissit])
  return ref
}

function EgyebKartya({ e }: { e: Extra }) {
  const { k } = useKv()
  const sz = useSz()
  const nyelv = useNyelv()
  const f = useFormatum()
  const leiras = (nyelv === 'en' ? e.description_en?.trim() || e.description : e.description)?.trim()
  const egyeztet = e.requires_quote || e.price_huf == null
  const ar = egyeztet ? sz('foglalas.ar_egyeztetes')
    : `${f.ft(e.price_huf ?? 0)}${e.price_unit !== 'ALKALOM' ? ` / ${f.egyseg(e.price_unit)}` : ''}`
  const benne = k.packages
    .filter((p) => p.active && e.included_in_packages.includes(p.id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => forditott(p, nyelv))
  return (
    <details className="kv-egyeb-kartya" onToggle={(ev) => {
      const sajat = ev.currentTarget
      if (!sajat.open) return
      sajat.closest('.kv-egyeb')?.querySelectorAll<HTMLDetailsElement>('details.kv-egyeb-kartya[open]')
        .forEach((d) => { if (d !== sajat) d.open = false })
    }}>
      <summary>
        <span>{forditott(e, nyelv)}</span>
        <span className="kv-egyeb-jel" aria-hidden="true" />
      </summary>
      <div className="kv-egyeb-tartalom">
        {leiras && <p>{leiras}</p>}
        <p className="kv-egyeb-ar" data-egyeztet={egyeztet || undefined}>{ar}</p>
        {benne.length > 0 && <p className="kv-egyeb-benne">{sz('csomagok.egyeb.benne', { csomagok: benne.join(', ') })}</p>}
      </div>
    </details>
  )
}

function useKeskeny(ref: RefObject<HTMLElement | null>, hatar: number): boolean {
  const [keskeny, setKeskeny] = useState(false)
  useLayoutEffect(() => {
    const keret = ref.current?.closest<HTMLElement>('.kv-keret')
    if (!keret) return
    const meres = () => {
      const cs = getComputedStyle(keret)
      const szeles = keret.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      setKeskeny(szeles <= hatar)
    }
    meres()
    const figyelo = new ResizeObserver(meres)
    figyelo.observe(keret)
    return () => figyelo.disconnect()
  }, [ref, hatar])
  return keskeny
}

function EgyebSzolgaltatasok() {
  const { k } = useKv()
  const sz = useSz()
  const hely = useRef<HTMLElement>(null)
  const keskeny = useKeskeny(hely, 700)
  const [nyitva, setNyitva] = useState(false)
  const tartalomId = useId()
  const aktiv = k.extras.filter((e) => e.active).sort((a, b) => a.sort_order - b.sort_order)
  if (aktiv.length === 0) return null
  const oszlopok: [ServiceArea, Extra[]][] = [
    ['KULSO', aktiv.filter((e) => e.area !== 'BELSO')],
    ['BELSO', aktiv.filter((e) => e.area === 'BELSO')],
  ]
  return (
    <section className="kv-egyeb" aria-labelledby="kv-egyeb-cim" ref={hely}
             data-csukhato={keskeny || undefined} data-nyitva={keskeny && nyitva ? '' : undefined}>
      {keskeny ? (
        <h3 id="kv-egyeb-cim">
          <button type="button" className="kv-egyeb-nyito" aria-expanded={nyitva} aria-controls={tartalomId}
                  onClick={() => setNyitva((n) => !n)}>
            <span>{sz('csomagok.egyeb.cim')}</span>
            <span className="kv-egyeb-jel" aria-hidden="true" />
          </button>
        </h3>
      ) : (
        <h3 id="kv-egyeb-cim">{sz('csomagok.egyeb.cim')}</h3>
      )}
      <div className="kv-egyeb-oszlopok" id={tartalomId} hidden={keskeny && !nyitva}>
        {oszlopok.filter(([, l]) => l.length > 0).map(([ter, l]) => (
          <div key={ter} className="kv-egyeb-oszlop" data-terulet={ter}>
            <h4>{sz(ter === 'BELSO' ? 'csomagok.egyeb.belso' : 'csomagok.egyeb.kulso')}</h4>
            {l.map((e) => <EgyebKartya key={e.id} e={e} />)}
          </div>
        ))}
      </div>
    </section>
  )
}

function MagazinCsomagok({ egyebNelkul = false }: { egyebNelkul?: boolean }) {
  const sz = useSz()
  const { t } = useKv()
  const ref = useKepernyoreIllesztes(t)
  return (
    <>
      <section className="kv-csomagok" ref={ref}>
        <div className="kv-szakasz-fej">
          <h2>{sz('csomagok.cim')}</h2>
          <Alcim />
        </div>
        <p className="kv-ervenyes">{sz('csomagok.ervenyes')}</p>
        <Tabla />
      </section>
      {!egyebNelkul && <EgyebSzolgaltatasok />}
    </>
  )
}

function Rolunk() {
  const sz = useSz()
  return (
    <section className="kv-rolunk" data-csillan>
      <h2>{sz('rolunk.cim')}</h2>
      <div className="kv-rolunk-szoveg">
        <p className="kv-rolunk-elso"><Gazdag s={sz('rolunk.bekezdes1')} /></p>
        <p><Gazdag s={sz('rolunk.bekezdes2')} /></p>
      </div>
    </section>
  )
}

function Magazin() {
  const { foglalas } = useKv()
  return (
    <>
      <Nav />
      <MagazinHero />
      <Rolunk />
      {foglalas ? (
        <div className="kv-ketoszlop">
          <div className="kv-csomag-hely"><MagazinCsomagok egyebNelkul /></div>
          <EgyebSzolgaltatasok />
          {foglalas}
        </div>
      ) : <MagazinCsomagok />}
      <GaleriaFoglalassal />
      <Vege foglalasNelkul={Boolean(foglalas)} velemenyekkel />
    </>
  )
}

function Showroom() {
  const u = useUzlet()
  return (
    <>
      <Nav />
      <section className="kv-hero">
        <h1>Kézi autókozmetika,<br />amíg fent <em>dolgozol</em>.</h1>
        <span className="kv-vonal" aria-hidden="true" />
        <p className="kv-lede">
          A {u.haz} mélygarázsában. Leadás reggel negyed nyolctól, átvétel munka után — az autó
          közben végigmegy a teljes kézi folyamaton.
        </p>
        <Gomb />
        <div className="kv-sav">
          <Info cimke="Nyitvatartás">{u.napok} {u.nyitas}–{u.zaras}</Info>
          <Info cimke="Leadás legkorábban">{u.leadas}</Info>
          <Info cimke="Cím">{u.cim.replace('.', '.,')} −1. szint</Info>
          <Info cimke="Telefon">{u.telefon}</Info>
        </div>
      </section>
      <section className="kv-csomagok">
        <h2>Csomagok</h2>
        <Tabla />
      </section>
      <Vege />
    </>
  )
}

function Jelzotabla() {
  const u = useUzlet()
  return (
    <>
      <Nav />
      <section className="kv-hero">
        <div className="kv-hero-bal">
          <span className="kv-kicker">→ Mélygarázs, −1. szint</span>
          <h1>Kézi mosás<br />a ház alatt</h1>
          <p className="kv-lede">
            Leadás negyed nyolctól, átvétel munka után. Nem gyorsmosó: minden kézzel megy,
            a bogároldótól a hosszantartó vaxig.
          </p>
          <Gomb />
        </div>
        <div className="kv-hero-jobb">
          <Info cimke="Nyitvatartás">{u.napokRovid} {u.nyitas}–{u.zaras}</Info>
          <Info cimke="Leadás legkorábban">{u.leadas}</Info>
          <Info cimke="Bejárat">Dagály utca</Info>
        </div>
      </section>
      <section className="kv-csomagok">
        <h2>Csomagok</h2>
        <Tabla ft={false} />
      </section>
      <Vege />
    </>
  )
}

function Munkalap() {
  const { kat } = useKv()
  const u = useUzlet()
  const sz = useSz()
  return (
    <>
      <Nav jobbra={<span className="kv-fejszoveg">Munkalap — 1138 Bp., {u.cim}</span>} />
      <section className="kv-hero">
        <span className="kv-pecset">Kézi mosás</span>
        <h1>Minden autóról<br />tudjuk, mi történt vele.</h1>
        <p className="kv-lede">
          Csomag, extrák, idő, felár — tételesen, előre. Nálunk nincs „majd meglátjuk a végén”.
        </p>
        <Gomb />
      </section>
      <div className="kv-perforacio" aria-hidden="true" />
      <section className="kv-csomagok">
        <div className="kv-lap">
          <div className="kv-lap-fej">
            <span>Csomagtartalom</span>
            <span>{sz(katKulcs.tabla(kat))} — bruttó</span>
          </div>
          <Tabla ft={false} />
        </div>
      </section>
      <Vege />
    </>
  )
}

function Racs() {
  const u = useUzlet()
  return (
    <>
      <Nav />
      <section className="kv-hero">
        <div className="kv-hero-bal">
          <h1><b>Kézi autókozmetika</b><br />a Váci úti mélygarázsban</h1>
          <p className="kv-lede">
            Három csomag, három járműkategória, külön kérhető külső és belső. Minden tétel pontosan
            leírva — nem kell találgatni, mit kaptok a pénzetekért.
          </p>
        </div>
        <div className="kv-doboz">
          <strong>Leadás reggel {u.leadas}, átvétel munka után</strong>
          <Gomb>Időpontot kérek →</Gomb>
        </div>
      </section>
      <section className="kv-sav">
        <Info cimke="Nyitvatartás">{u.napokRovid} {u.nyitas}–{u.zaras}</Info>
        <Info cimke="Leadás legkorábban">{u.leadas}</Info>
        <Info cimke="Bejárat">Dagály utca</Info>
        <Info cimke="Telefon">{u.telefon}</Info>
      </section>
      <section className="kv-csomagok">
        <h2>Csomagok</h2>
        <Tabla ft={false} />
      </section>
      <Vege />
    </>
  )
}

function Lakk() {
  const u = useUzlet()
  return (
    <>
      <Nav />
      <section className="kv-lakk">
        <h1>Ahogy <em>hazaindulsz</em><br />vele, az a lényeg.</h1>
      </section>
      <section className="kv-hero">
        <p className="kv-lede">
          Kézi mosás és kézi takarítás a {u.haz} mélygarázsában. Nincs kefe, nincs sietség — csak
          az az érzés, amikor másnap reggel is jó beülni.
        </p>
        <div className="kv-hero-jobb">
          <Gomb />
          <ul className="kv-sorok">
            <li>{u.napok} {u.nyitas}–{u.zaras}</li>
            <li>Leadás legkorábban {u.leadas}</li>
            <li>Bejárat a {u.bejarat}</li>
          </ul>
        </div>
      </section>
      <section className="kv-csomagok">
        <h2>Csomagok</h2>
        <Tabla ft={false} />
      </section>
      <Vege />
    </>
  )
}

const OLDALAK: Record<KoncepcioKod, () => ReactNode> = {
  '01': Adatlap,
  '02': Melygarazs,
  '03': Magazin,
  '04': Showroom,
  '05': Jelzotabla,
  '06': Munkalap,
  '07': Racs,
  '08': Lakk,
}

interface KoncepcioProps {
  kod: KoncepcioKod
  mod: Mod
  k: Catalog
  nyilvanos?: boolean
  foglalas?: ReactNode
  kat?: VehicleCategory
  onKat?: (k: VehicleCategory) => void
  kiemelt?: string | null
  onCsomag?: (id: string) => void
  nyelvValaszto?: ReactNode
}

function KvKornyezet({
  kod, mod, k, nyilvanos = false, foglalas, kat: katKulso, onKat, kiemelt = null, onCsomag, nyelvValaszto, children,
}: KoncepcioProps & { children: ReactNode }) {
  const [katBelso, setKatBelso] = useState<VehicleCategory>('SZEMELYAUTO')
  const kat = katKulso ?? katBelso
  const setKat = onKat ?? setKatBelso
  const nyelv = useNyelv()
  const t = useMemo(() => csomagTabla(k, kat, nyelv), [k, kat, nyelv])
  const tol = useMemo(() => kategoriaTol(k), [k])
  const gyoker = useRef<HTMLDivElement>(null)
  useCsillanas(gyoker)
  useVaszonSzin(gyoker, nyilvanos)
  return (
    <Kv.Provider value={{ k, t, kat, setKat, tol, nyilvanos, foglalas, kiemelt, onCsomag, nyelvValaszto }}>
      <div className="kv" ref={gyoker} lang={nyelv} data-k={kod} data-mod={mod === 'SOTET' ? 'sotet' : 'vilagos'}>
        {children}
        {nyilvanos && <FelugroAblak />}
      </div>
    </Kv.Provider>
  )
}

export function KoncepcioKeret({ children, navJobbra, ...p }: KoncepcioProps & { children: ReactNode; navJobbra?: ReactNode }) {
  return (
    <KvKornyezet {...p}>
      <Nav jobbra={navJobbra} />
      {children}
      <Lab />
    </KvKornyezet>
  )
}

export default function Koncepcio(p: KoncepcioProps) {
  const Oldal = OLDALAK[p.kod]
  return (
    <KvKornyezet {...p}>
      <Oldal />
    </KvKornyezet>
  )
}

export function KoncepcioLap({ mod, k, children }: { mod: Mod; k: Catalog; children: ReactNode }) {
  return <KvKornyezet kod="03" mod={mod} k={k}>{children}</KvKornyezet>
}

export type KoncepcioReszNev = 'nav' | 'hero' | 'rolunk' | 'galeria' | 'csomagok' | 'velemenyek' | 'hely' | 'gyik' | 'gyikoldal' | 'lab'

export function KoncepcioResz({ resz, mod, k }: { resz: KoncepcioReszNev; mod: Mod; k: Catalog }) {
  return (
    <KvKornyezet kod="03" mod={mod} k={k}>
      {resz === 'nav' && <Nav />}
      {resz === 'hero' && <MagazinHero />}
      {resz === 'rolunk' && <Rolunk />}
      {resz === 'galeria' && <GaleriaFoglalassal />}
      {resz === 'csomagok' && <MagazinCsomagok />}
      {resz === 'velemenyek' && <Velemenyek minta />}
      {resz === 'hely' && <Terkep />}
      {resz === 'gyik' && <GyikSzakasz nyilvanos={false} minta />}
      {resz === 'gyikoldal' && <GyikOldal nyilvanos={false} minta />}
      {resz === 'lab' && <Lab />}
    </KvKornyezet>
  )
}
