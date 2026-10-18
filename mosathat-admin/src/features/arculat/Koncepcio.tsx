import {
  createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode,
} from 'react'

import type { Catalog } from '../../data/source'
import type { VehicleCategory } from '../../lib/types'
import {
  csomagTabla, kategoriaTol, KATEGORIAK, szam,
  type Cella, type CsomagTabla, type KoncepcioKod, type Mod,
} from '../../lib/arculat'
import { katKulcs, type SzovegKulcs, type Uzlet } from '../../lib/publikusTartalom'
import { JOGI_CIM, JOGI_CIM_EN } from '../../lib/ceg'
import { FELIRAT, nyelviUt, type Nyelv } from '../../lib/nyelv'
import { Gazdag, telefonLink, useFormatum, useNyelv, useSz, useUzlet } from '../publikus/tartalom'
import Galeria from './Galeria'
import { useCsillanas } from './csillanas'

interface KvAllapot {
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
  ['menu.rolunk', 'rolunk'], ['menu.galeria', 'galeria'], ['menu.csomagok', 'csomagok'],
  ['menu.foglalas', 'foglalas'], ['menu.kapcsolat', 'kapcsolat'],
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
    elem.scrollIntoView({ behavior: 'smooth', block: 'start' })
    felvillant(kv?.querySelector<HTMLElement>(CEL_CIM[cel]))
  } else if (nyilvanos) window.location.href = `${nyelviUt('/publikus', nyelv)}#${cel}`
}

function terkepCimek(u: Uzlet, nyelv: Nyelv) {
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

function Gomb({ children, cel = 'foglalas' }: { children?: ReactNode; cel?: Cel | null }) {
  const { nyilvanos } = useKv()
  const sz = useSz()
  const nyelv = useNyelv()
  return <a className="kv-gomb" href="#foglalas" onClick={(e) => ugras(e, cel, nyilvanos, nyelv)}>{children ?? sz('gomb.idopont')}</a>
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
      const top = Math.max(0, nev.getBoundingClientRect().top - t.top - 12)
      setKeret({ top, left: c.left - t.left, width: c.width, height: t.height - top })
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
            <tr className="kv-csoport">
              <th scope="colgroup" colSpan={t.csomagok.length + 1}>
                {sz(g.terulet === 'BELSO' ? 'csomagok.csoport.belso' : 'csomagok.csoport.kulso')}
              </th>
            </tr>
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
  const eger = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--eger-x', `${Math.round(e.clientX - r.left)}px`)
    el.style.setProperty('--eger-y', `${Math.round(e.clientY - r.top)}px`)
    if (!el.hasAttribute('data-eger')) el.setAttribute('data-eger', '')
  }
  return (
    <footer className="kv-lab" data-csillan onPointerMove={eger} onPointerLeave={(e) => e.currentTarget.removeAttribute('data-eger')}>
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
          {LAB_MENU.map((m) => (
            <a key={m} href={nyelviUt(`/${m}`, nyelv)} onClick={nyilvanos ? undefined : (e) => ugras(e, null)}>{jogiCim[m]}</a>
          ))}
        </nav>
      </div>
    </footer>
  )
}

function Vege({ foglalasNelkul = false }: { foglalasNelkul?: boolean }) {
  const { foglalas } = useKv()
  return (
    <>
      {!foglalasNelkul && (foglalas ?? <Foglalas />)}
      <Terkep />
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

function MagazinHero() {
  const sz = useSz()
  return (
    <>
      <section className="kv-hero">
        <span className="kv-kicker">{sz('hero.felcim')}</span>
        <h1><Gazdag s={sz('hero.cim')} /></h1>
        <div className="kv-hasabok">
          <p className="kv-lede"><Gazdag s={sz('hero.bevezeto')} /></p>
          <p className="kv-halk"><Gazdag s={sz('hero.mellek')} /></p>
        </div>
      </section>
      <Borito />
    </>
  )
}

function MagazinCsomagok() {
  const sz = useSz()
  return (
    <section className="kv-csomagok">
      <div className="kv-szakasz-fej">
        <h2>{sz('csomagok.cim')}</h2>
        <Alcim />
      </div>
      <p className="kv-ervenyes">{sz('csomagok.ervenyes')}</p>
      <Tabla />
    </section>
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
      <Galeria />
      {foglalas ? (
        <div className="kv-ketoszlop">
          <MagazinCsomagok />
          {foglalas}
        </div>
      ) : <MagazinCsomagok />}
      <Vege foglalasNelkul={Boolean(foglalas)} />
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
  return (
    <Kv.Provider value={{ t, kat, setKat, tol, nyilvanos, foglalas, kiemelt, onCsomag, nyelvValaszto }}>
      <div className="kv" ref={gyoker} lang={nyelv} data-k={kod} data-mod={mod === 'SOTET' ? 'sotet' : 'vilagos'}>
        {children}
      </div>
    </Kv.Provider>
  )
}

export function KoncepcioKeret({ children, ...p }: KoncepcioProps & { children: ReactNode }) {
  return (
    <KvKornyezet {...p}>
      <Nav />
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

export type KoncepcioReszNev = 'nav' | 'hero' | 'rolunk' | 'galeria' | 'csomagok' | 'hely' | 'lab'

export function KoncepcioResz({ resz, mod, k }: { resz: KoncepcioReszNev; mod: Mod; k: Catalog }) {
  return (
    <KvKornyezet kod="03" mod={mod} k={k}>
      {resz === 'nav' && <Nav />}
      {resz === 'hero' && <MagazinHero />}
      {resz === 'rolunk' && <Rolunk />}
      {resz === 'galeria' && <Galeria />}
      {resz === 'csomagok' && <MagazinCsomagok />}
      {resz === 'hely' && <Terkep />}
      {resz === 'lab' && <Lab />}
    </KvKornyezet>
  )
}
