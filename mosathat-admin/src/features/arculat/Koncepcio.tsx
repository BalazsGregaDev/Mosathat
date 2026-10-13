import type { ReactNode } from 'react'

import { szam, UZLET, type Cella, type CsomagTabla, type KoncepcioKod, type Mod } from '../../lib/arculat'

const MENU = ['Csomagok', 'Árak', 'Galéria', 'Foglalás']

function Nav({ jobbra }: { jobbra?: ReactNode }) {
  return (
    <header className="kv-nav">
      <span className="kv-logo">{UZLET.nev}</span>
      {jobbra ?? (
        <nav>
          {MENU.map((m) => <a key={m} href={`#${m}`} onClick={(e) => e.preventDefault()}>{m}</a>)}
        </nav>
      )}
    </header>
  )
}

function Gomb({ children = 'Időpontot kérek' }: { children?: ReactNode }) {
  return <a className="kv-gomb" href="#foglalas" onClick={(e) => e.preventDefault()}>{children}</a>
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

function Tabla({ t, sorszam = false, ft = true, oszlopCim }: {
  t: CsomagTabla
  sorszam?: boolean
  ft?: boolean
  oszlopCim?: string
}) {
  let n = 0
  return (
    <div className="kv-tabla-gorgo">
      <table className="kv-tabla">
        <thead>
          <tr>
            <th className="kv-csoport-cim" scope="col">{oszlopCim ?? t.csoportok[0]?.cim ?? 'Szolgáltatás'}</th>
            {t.csomagok.map((c) => (
              <th key={c.id} scope="col">
                <span className="kv-csomag-nev">{c.nev}</span>
                <span className="kv-ar">{szam(c.ar)}{ft && c.ar != null ? ' Ft' : ''}</span>
              </th>
            ))}
          </tr>
        </thead>
        {t.csoportok.map((g, gi) => (
          <tbody key={g.terulet}>
            {gi > 0 && (
              <tr className="kv-csoport">
                <th scope="colgroup" colSpan={t.csomagok.length + 1}>{g.cim}</th>
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

function Labjegyzet({ t }: { t: CsomagTabla }) {
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

const KATEGORIA = 'Sedan / Kombi / Ferdehátú'

function Adatlap({ t }: { t: CsomagTabla }) {
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
          <span className="kv-alcim">{KATEGORIA} — bruttó</span>
        </div>
        <Tabla t={t} sorszam />
        <Labjegyzet t={t} />
      </section>
    </>
  )
}

function Melygarazs({ t }: { t: CsomagTabla }) {
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
        <Tabla t={t} />
      </section>
    </>
  )
}

function Magazin({ t }: { t: CsomagTabla }) {
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
          <span className="kv-alcim">{KATEGORIA}</span>
        </div>
        <Tabla t={t} />
      </section>
    </>
  )
}

function Showroom({ t }: { t: CsomagTabla }) {
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
        <Tabla t={t} />
      </section>
    </>
  )
}

function Jelzotabla({ t }: { t: CsomagTabla }) {
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
        <Tabla t={t} ft={false} />
      </section>
    </>
  )
}

function Munkalap({ t }: { t: CsomagTabla }) {
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
            <span>Csomagtartalom / {t.csoportok[0]?.cim ?? 'Mosás'}</span>
            <span>Sedan — bruttó</span>
          </div>
          <Tabla t={t} ft={false} oszlopCim="Szolgáltatás" />
        </div>
      </section>
    </>
  )
}

function Racs({ t }: { t: CsomagTabla }) {
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
        <Tabla t={t} ft={false} />
      </section>
    </>
  )
}

function Lakk({ t }: { t: CsomagTabla }) {
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
        <Tabla t={t} ft={false} />
      </section>
    </>
  )
}

const OLDALAK: Record<KoncepcioKod, (p: { t: CsomagTabla }) => ReactNode> = {
  '01': Adatlap,
  '02': Melygarazs,
  '03': Magazin,
  '04': Showroom,
  '05': Jelzotabla,
  '06': Munkalap,
  '07': Racs,
  '08': Lakk,
}

export default function Koncepcio({ kod, mod, t }: { kod: KoncepcioKod; mod: Mod; t: CsomagTabla }) {
  const Oldal = OLDALAK[kod]
  return (
    <div className="kv" data-k={kod} data-mod={mod === 'SOTET' ? 'sotet' : 'vilagos'}>
      <Oldal t={t} />
    </div>
  )
}
