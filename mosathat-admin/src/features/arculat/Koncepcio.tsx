import { createContext, useContext, useMemo, useState, type MouseEvent, type ReactNode } from 'react'

import type { Catalog } from '../../data/source'
import type { VehicleCategory } from '../../lib/types'
import {
  csomagTabla, kategoriaTol, KAT_ALCIM, KAT_NEV, KATEGORIAK, szam, UZLET,
  type Cella, type CsomagTabla, type KoncepcioKod, type Mod,
} from '../../lib/arculat'

interface KvAllapot {
  t: CsomagTabla
  kat: VehicleCategory
  setKat: (k: VehicleCategory) => void
  tol: Record<VehicleCategory, number | null>
  nyilvanos: boolean
  foglalas?: ReactNode
}

const Kv = createContext<KvAllapot | null>(null)
const useKv = () => useContext(Kv)!

type Cel = 'csomagok' | 'foglalas' | 'hely' | 'kapcsolat'

const CEL_ELEM: Record<Cel, string> = {
  csomagok: '.kv-csomagok',
  foglalas: '.kv-foglalas',
  hely: '.kv-hely',
  kapcsolat: '.kv-lab',
}

const MENU: [string, Cel][] = [['Csomagok', 'csomagok'], ['Foglalás', 'foglalas'], ['Hol vagyunk', 'hely'], ['Kapcsolat', 'kapcsolat']]

function ugras(e: MouseEvent<HTMLAnchorElement>, cel: Cel | null, nyilvanos = false) {
  e.preventDefault()
  if (!cel) return
  const elem = e.currentTarget.closest('.kv')?.querySelector(CEL_ELEM[cel])
  if (elem) elem.scrollIntoView({ behavior: 'smooth', block: 'start' })
  else if (nyilvanos) window.location.href = `/publikus#${cel}`
}

const ADDRESS = `${UZLET.cim.replace(/\.$/, '')}, ${UZLET.irsz}`
const TERKEP = `https://www.google.com/maps?q=${encodeURIComponent(`${UZLET.nev}, ${ADDRESS}`)}&z=16&output=embed`
const UTVONAL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ADDRESS)}`

function Nav({ jobbra }: { jobbra?: ReactNode }) {
  const { nyilvanos } = useKv()
  return (
    <header className="kv-nav">
      {nyilvanos
        ? <a className="kv-logo" href="/publikus">{UZLET.nev}</a>
        : <span className="kv-logo">{UZLET.nev}</span>}
      {jobbra ?? (
        <nav>
          {MENU.map(([m, cel]) => <a key={m} href={`#${cel}`} onClick={(e) => ugras(e, cel, nyilvanos)}>{m}</a>)}
        </nav>
      )}
    </header>
  )
}

function Gomb({ children = 'Időpontot kérek', cel = 'foglalas' }: { children?: ReactNode; cel?: Cel | null }) {
  const { nyilvanos } = useKv()
  return <a className="kv-gomb" href="#foglalas" onClick={(e) => ugras(e, cel, nyilvanos)}>{children}</a>
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
  if (c.tipus === 'van') return <><span className="kv-van" aria-hidden="true" /><span className="kv-rejtett">benne van</span></>
  if (c.tipus === 'nincs') return <><span className="kv-nincs" aria-hidden="true" /><span className="kv-rejtett">nincs benne</span></>
  return <span className="kv-mas" data-kiemelt={c.kiemelt || undefined}>{c.szoveg}</span>
}

function KatValaszto() {
  const { kat, setKat } = useKv()
  return (
    <div className="kv-kat" role="group" aria-label="Járműkategória">
      {KATEGORIAK.map((k) => (
        <button key={k} type="button" aria-pressed={kat === k} onClick={() => setKat(k)}>{KAT_NEV[k]}</button>
      ))}
    </div>
  )
}

function Tabla({ sorszam = false, ft = true }: { sorszam?: boolean; ft?: boolean }) {
  const { t } = useKv()
  let n = 0
  return (
    <div className="kv-tabla-gorgo">
      <table className="kv-tabla">
        <thead>
          <tr>
            <th className="kv-fej-bal" scope="col">
              <span className="kv-csoport-cim">Járműkategória</span>
              <KatValaszto />
            </th>
            {t.csomagok.map((c) => (
              <th key={c.id} scope="col">
                <span className="kv-csomag-nev">{c.nev}</span>
                <span className="kv-ar">{szam(c.ar)}{ft && c.ar != null ? ' Ft' : ''}</span>
              </th>
            ))}
          </tr>
        </thead>
        {t.csoportok.map((g) => (
          <tbody key={g.terulet}>
            <tr className="kv-csoport">
              <th scope="colgroup" colSpan={t.csomagok.length + 1}>{g.cim}</th>
            </tr>
            {g.sorok.map((s) => {
              n++
              return (
                <tr key={s.nev}>
                  <th scope="row">
                    {sorszam && <span className="kv-sorszam">{String(n).padStart(2, '0')}</span>}
                    {s.nev}
                  </th>
                  {s.cellak.map((c, i) => <td key={i}><Jel c={c} /></td>)}
                </tr>
              )
            })}
          </tbody>
        ))}
      </table>
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
  return <span className="kv-alcim">{KAT_ALCIM[kat]}{utana}</span>
}

const LEPESEK = ['Autó', 'Csomag', 'Időpont', 'Adatok']

function Foglalas() {
  const { kat, setKat, tol } = useKv()
  return (
    <section className="kv-foglalas">
      <h2>Időpontfoglalás</h2>
      <p className="kv-bevezeto">Válaszd ki, mit szeretnél, és mutatjuk a szabad időpontokat.</p>
      <ol className="kv-lepesek">
        {LEPESEK.map((l, i) => (
          <li key={l} aria-current={i === 0 ? 'step' : undefined}>
            <span className="kv-lepes-szam">{i + 1}</span>{l}
          </li>
        ))}
      </ol>
      <div className="kv-lepes">
        <h3>Milyen autóval jössz?</h3>
        <div className="kv-kat-kartyak">
          {KATEGORIAK.map((k) => (
            <button key={k} type="button" aria-pressed={kat === k} onClick={() => setKat(k)}>
              <span className="kv-kat-nev">{KAT_NEV[k]}</span>
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
  return (
    <section className="kv-hely">
      <div className="kv-hely-szoveg">
        <h2>Hol vagyunk</h2>
        <p className="kv-bevezeto">
          A {UZLET.haz} mélygarázsában, a −1. szinten. A bejárat a {UZLET.bejarat} nyílik.
        </p>
        <Info cimke="Cím">{UZLET.irsz}, {UZLET.cim}</Info>
        <Info cimke="Nyitvatartás">{UZLET.napok} {UZLET.nyitas}–{UZLET.zaras}</Info>
        <Info cimke="Leadás legkorábban">{UZLET.leadas}</Info>
        <Info cimke="Telefon">{UZLET.telefon}</Info>
        <a className="kv-link" href={UTVONAL} target="_blank" rel="noreferrer">Útvonaltervezés a Google Térképpel</a>
      </div>
      <div className="kv-terkep" data-betoltve={betolt || undefined}>
        {betolt ? (
          <iframe title={`${UZLET.nev} a térképen`} src={TERKEP} referrerPolicy="no-referrer-when-downgrade" />
        ) : (
          <div className="kv-terkep-kerdes">
            <p>
              A térképet a Google szolgáltatja. Betöltéskor a Google megkapja az IP-címedet,
              és sütiket helyezhet el a böngésződben.
            </p>
            <button type="button" className="kv-terkep-gomb" onClick={() => setBetolt(true)}>Térkép betöltése</button>
          </div>
        )}
      </div>
    </section>
  )
}

const LAB_MENU = [['Impresszum', '/impresszum'], ['Adatvédelmi tájékoztató', '/adatvedelem']]

function Lab() {
  const { nyilvanos } = useKv()
  return (
    <footer className="kv-lab">
      <div className="kv-lab-fo">
        <div className="kv-lab-elso">
          <span className="kv-logo">{UZLET.nev}</span>
          <p>Kézi autókozmetika a Váci úti {UZLET.haz} mélygarázsában.</p>
        </div>
        <Info cimke="Cím">{UZLET.irsz}, {UZLET.cim}<br />{UZLET.haz}, {UZLET.szint}</Info>
        <Info cimke="Nyitvatartás">{UZLET.napok} {UZLET.nyitas}–{UZLET.zaras}<br />Leadás legkorábban {UZLET.leadas}</Info>
        <div className="kv-info">
          <span className="kv-cimke">Kapcsolat</span>
          <span className="kv-ertek">{UZLET.telefon}</span>
          <a className="kv-link" href="#foglalas" onClick={(e) => ugras(e, 'foglalas', nyilvanos)}>Időpontot kérek</a>
        </div>
      </div>
      <div className="kv-lab-also">
        <span>© {new Date().getFullYear()} {UZLET.nev}</span>
        <nav>
          {LAB_MENU.map(([m, h]) => (
            <a key={h} href={h} onClick={nyilvanos ? undefined : (e) => ugras(e, null)}>{m}</a>
          ))}
        </nav>
      </div>
    </footer>
  )
}

function Vege() {
  const { foglalas } = useKv()
  return (
    <>
      {foglalas ?? <Foglalas />}
      <Terkep />
      <Lab />
    </>
  )
}

function Adatlap() {
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
          <Info cimke="Telephely">{UZLET.irsz}, {UZLET.cim}<br /><b>{UZLET.haz}</b>, {UZLET.szint}</Info>
          <Info cimke="Bejárat">A {UZLET.bejarat}</Info>
          <Info cimke="Nyitvatartás">{UZLET.napok} <b>{UZLET.nyitas}–{UZLET.zaras}</b></Info>
          <Info cimke="Leadás legkorábban"><b>{UZLET.leadas}</b> — munkába menet is</Info>
          <Info cimke="Telefon">{UZLET.telefon}</Info>
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
  return (
    <>
      <Nav />
      <section className="kv-hero">
        <span className="kv-kicker">{UZLET.haz} — mélygarázs, −1. szint</span>
        <h1>Amíg dolgozol,<br /><em>rendbe tesszük</em><br />az autód</h1>
        <p className="kv-lede">
          Add le reggel a garázsban, vedd át tisztán munka után. Kézi mosás, kézi takarítás,
          gépek nélkül a lakkon.
        </p>
        <Gomb />
      </section>
      <section className="kv-sav">
        <Info cimke="Nyitvatartás">{UZLET.napokRovid} {UZLET.nyitas}–{UZLET.zaras}</Info>
        <Info cimke="Leadás legkorábban">{UZLET.leadas}</Info>
        <Info cimke="Bejárat">{UZLET.bejarat}</Info>
        <Info cimke="Telefon">{UZLET.telefon}</Info>
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

function Magazin() {
  return (
    <>
      <Nav />
      <section className="kv-hero">
        <span className="kv-kicker">Kézi autókozmetika — {UZLET.kerulet}</span>
        <h1>Az autó nem tárgy.<br /><em>Évekig</em> veled van.</h1>
        <div className="kv-hasabok">
          <p className="kv-lede">
            Kézi mosás és kézi takarítás a Váci úti {UZLET.haz} mélygarázsában. Bogároldótól a
            hosszantartó vaxig, három csomagban — és pontosan leírva, melyik mit tud.
          </p>
          <p className="kv-halk">
            Hétfőtől péntekig {UZLET.nyitas}–{UZLET.zaras}, de autót már reggel {UZLET.leadas} után
            le lehet adni. A bejárat a Dagály utca felől nyílik, a mélygarázs −1. szintjén.
          </p>
        </div>
      </section>
      <div className="kv-foto"><span>Fotó helye — garázs, munka közben</span></div>
      <section className="kv-csomagok">
        <div className="kv-szakasz-fej">
          <h2>Csomagok</h2>
          <Alcim />
        </div>
        <Tabla />
      </section>
      <Vege />
    </>
  )
}

function Showroom() {
  return (
    <>
      <Nav />
      <section className="kv-hero">
        <h1>Kézi autókozmetika,<br />amíg fent <em>dolgozol</em>.</h1>
        <span className="kv-vonal" aria-hidden="true" />
        <p className="kv-lede">
          A {UZLET.haz} mélygarázsában. Leadás reggel negyed nyolctól, átvétel munka után — az autó
          közben végigmegy a teljes kézi folyamaton.
        </p>
        <Gomb />
        <div className="kv-sav">
          <Info cimke="Nyitvatartás">{UZLET.napok} {UZLET.nyitas}–{UZLET.zaras}</Info>
          <Info cimke="Leadás legkorábban">{UZLET.leadas}</Info>
          <Info cimke="Cím">{UZLET.cim.replace('.', '.,')} −1. szint</Info>
          <Info cimke="Telefon">{UZLET.telefon}</Info>
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
          <Info cimke="Nyitvatartás">{UZLET.napokRovid} {UZLET.nyitas}–{UZLET.zaras}</Info>
          <Info cimke="Leadás legkorábban">{UZLET.leadas}</Info>
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
  return (
    <>
      <Nav jobbra={<span className="kv-fejszoveg">Munkalap — 1138 Bp., {UZLET.cim}</span>} />
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
            <span>{KAT_NEV[kat]} — bruttó</span>
          </div>
          <Tabla ft={false} />
        </div>
      </section>
      <Vege />
    </>
  )
}

function Racs() {
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
          <strong>Leadás reggel {UZLET.leadas}, átvétel munka után</strong>
          <Gomb>Időpontot kérek →</Gomb>
        </div>
      </section>
      <section className="kv-sav">
        <Info cimke="Nyitvatartás">{UZLET.napokRovid} {UZLET.nyitas}–{UZLET.zaras}</Info>
        <Info cimke="Leadás legkorábban">{UZLET.leadas}</Info>
        <Info cimke="Bejárat">Dagály utca</Info>
        <Info cimke="Telefon">{UZLET.telefon}</Info>
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
  return (
    <>
      <Nav />
      <section className="kv-lakk">
        <h1>Ahogy <em>hazaindulsz</em><br />vele, az a lényeg.</h1>
      </section>
      <section className="kv-hero">
        <p className="kv-lede">
          Kézi mosás és kézi takarítás a {UZLET.haz} mélygarázsában. Nincs kefe, nincs sietség — csak
          az az érzés, amikor másnap reggel is jó beülni.
        </p>
        <div className="kv-hero-jobb">
          <Gomb />
          <ul className="kv-sorok">
            <li>{UZLET.napok} {UZLET.nyitas}–{UZLET.zaras}</li>
            <li>Leadás legkorábban {UZLET.leadas}</li>
            <li>Bejárat a {UZLET.bejarat}</li>
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
}

function KvKornyezet({ kod, mod, k, nyilvanos = false, foglalas, children }: KoncepcioProps & { children: ReactNode }) {
  const [kat, setKat] = useState<VehicleCategory>('SZEMELYAUTO')
  const t = useMemo(() => csomagTabla(k, kat), [k, kat])
  const tol = useMemo(() => kategoriaTol(k), [k])
  return (
    <Kv.Provider value={{ t, kat, setKat, tol, nyilvanos, foglalas }}>
      <div className="kv" lang="hu" data-k={kod} data-mod={mod === 'SOTET' ? 'sotet' : 'vilagos'}>
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
