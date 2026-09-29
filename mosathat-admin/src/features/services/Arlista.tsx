import { ft, idotartam } from '../../lib/format'
import {
  CATEGORY_SHORT, SCOPE_LABEL,
  type BookingScope, type Package, type ServiceArea, type VehicleCategory,
} from '../../lib/types'
import type { Catalog } from '../../data'
import Sugo from '../common/Sugo'

// ---------------------------------------------------------------------------
//  Az árlista tartalma — egy helyen leírva.
//
//  Két helyen jelenik meg: a Szolgáltatások képernyőn (alkalmazotti nézet) és
//  a foglalás közben felnyitható lebegő ablakban. Ha kétszer lenne megírva,
//  előbb-utóbb az egyik helyen maradna el egy oszlop vagy egy jelölés — és
//  pont telefonálás közben derülne ki, a rosszabbik pillanatban.
// ---------------------------------------------------------------------------

export const KATEGORIAK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
export const TERJEDELMEK: BookingScope[] = ['TELJES', 'KULSO', 'BELSO']

export const EGYSEG: Record<string, string> = {
  DB: 'db', AJTO: 'ajtó', ULES: 'ülés', LITER: 'liter', ALKALOM: 'alkalom',
}

/**
 * „| Start + Gyors viasz, Gumiápolás, …" — amivel ez a csomag több az
 * előzőnél. A felsorolás az adatbázisból jön (v_package_extra), nem innen:
 * ha holnap átrendezitek a csomagokat, ez a szöveg magától követi.
 */
export function Tobblet({ k, packageId }: { k: Catalog; packageId: string }) {
  const sorok = k.packageExtras.filter((x) => x.package_id === packageId)
  if (sorok.length === 0) return null
  return (
    <span className="csomag-tobblet">
      {' '}<span className="valaszto" aria-hidden="true">|</span>
      {'\u00a0'}{sorok[0].parent_name} + {sorok.map((x) => x.name).join(', ')}
    </span>
  )
}

/** Csomagárak méret és terjedelem szerint, ahogy a publikus oldalon is állnak. */
export function CsomagArak({ k, tomor }: { k: Catalog; tomor?: boolean }) {
  const ar = (p: Package, c: VehicleCategory, s: BookingScope) =>
    k.packagePricing.find((x) => x.package_id === p.id && x.category === c && x.scope === s)

  const fsAr = (p: Package, c: VehicleCategory) =>
    k.fullServicePricing.find((x) => x.package_id === p.id && x.category === c)

  return (
    <>
      {k.packages.filter((p) => p.active).map((p) => (
        <div className="panel panelek-szeles" key={p.id} style={{ marginBottom: 'var(--t4)' }}>
          {/* A cím mellett rögtön ott áll, amivel ez a csomag több az
              előzőnél. Telefon közben pont ez hangzik el: „a Start mindene,
              plusz gyors viasz és gumiápolás". A Startnál nincs mihez képest
              többet mondani, ott csak a neve áll. */}
          <h3 className="csomag-cim">
            {p.name}
            <Tobblet k={k} packageId={p.id} />
          </h3>
          <div className="panel-torzs">
            {p.description && (
              <p className="halk" style={{ fontSize: 'var(--m-sm)', marginBottom: 'var(--t3)' }}>
                {p.description}
              </p>
            )}
            <div className="tablagorgo">
              <table className={`arlista${tomor ? ' tomor' : ''}`}>
                <thead>
                  <tr>
                    <th>Méret</th>
                    {TERJEDELMEK.map((s) => <th key={s}>{SCOPE_LABEL[s]}</th>)}
                    <th>Full Service</th>
                  </tr>
                </thead>
                <tbody>
                  {KATEGORIAK.map((c) => {
                    const fs = fsAr(p, c)
                    return (
                      <tr key={c}>
                        <th scope="row">{CATEGORY_SHORT[c]}</th>
                        {TERJEDELMEK.map((s) => {
                          const a = ar(p, c, s)
                          return (
                            <td key={s}>
                              <div className="ar">
                                {a?.requires_quote ? 'egyedi' : ft(a?.price_huf ?? null)}
                              </div>
                              <div className="ido">{idotartam(a?.duration_minutes ?? null)}</div>
                            </td>
                          )
                        })}
                        <td>
                          <div className="ar">{ft(fs?.price_huf ?? null)}</div>
                          {/* Az üléshatár csak akkor mond valamit, ha ár is
                              tartozik hozzá. Ár nélkül csak zavarna. */}
                          {fs?.price_huf != null && fs.included_seats > 0 && (
                            <div className="ido">{fs.included_seats} ülésig</div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
      <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>
        Ahol „—" áll, ott még nincs rögzítve az adat. Ilyenkor a foglalás
        felvehető, de az idő és az ár csak részleges.
      </p>
    </>
  )
}

/** Extrák: ár, időigény, leírás. A leírás az, amit telefonban felolvasol.
 *
 *  Két alakja van. Teljes szélességben a leírás külön oszlopban áll — ott van
 *  hely rá. A csomagok MELLETT viszont (tomor) a leírás a karikás „i" alá
 *  kerül: a név és az ár így is elfér egy fél hasábban, a leírás meg ott
 *  van, amikor kérik. Ugyanaz az adat, két sűrűség — nem két lista. */
export function ExtraLista({ k, q, onQ, tomor }: {
  k: Catalog
  q: string
  onQ: (v: string) => void
  tomor?: boolean
}) {
  const keresett = k.extras.filter((e) =>
    e.active && (q === '' || e.name.toLowerCase().includes(q.toLowerCase())
                 || (e.description ?? '').toLowerCase().includes(q.toLowerCase())))

  const kereso = (
    <input
      className="beviteli"
      style={{ marginBottom: 'var(--t3)' }}
      value={q}
      onChange={(e) => onQ(e.target.value)}
      placeholder="Keresés név vagy leírás szerint"
      aria-label="Keresés a szolgáltatások között"
    />
  )

  if (tomor) {
    return (
      <>
        {kereso}
        <div className="panel">
          <div className="panel-torzs">
            <table className="lista extra-tomor">
              <thead>
                <tr><th>Szolgáltatás</th><th>Ár</th><th>Idő</th></tr>
              </thead>
              <tbody>
                {keresett.map((e) => (
                  <tr key={e.id}>
                    <th scope="row">
                      <span className="nev">{e.name}</span>
                      {e.description?.trim() && <Sugo cim={e.name} szoveg={e.description} />}
                      {e.recommends_overnight && (
                        <span className="cimke-pill" data-r="figyelem">éjszakára</span>
                      )}
                    </th>
                    <td className="szam">
                      {e.requires_quote ? 'egyedi' : ft(e.price_huf)}
                      {e.price_unit !== 'ALKALOM' && !e.requires_quote && (
                        <span className="halk"> / {EGYSEG[e.price_unit]}</span>
                      )}
                    </td>
                    <td className="szam">{idotartam(e.work_minutes)}</td>
                  </tr>
                ))}
                {keresett.length === 0 && (
                  <tr><td colSpan={3}><div className="ures">Nincs találat.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {kereso}
      <div className="panel panelek-szeles">
        <div className="panel-torzs">
          <div className="tablagorgo">
            <table className="lista">
              <thead>
                <tr>
                  <th>Szolgáltatás</th>
                  <th>Ár</th>
                  <th>Idő</th>
                  <th>Megjegyzés</th>
                </tr>
              </thead>
              <tbody>
                {keresett.map((e) => (
                  <tr key={e.id}>
                    <th scope="row">{e.name}</th>
                    <td className="szam">
                      {e.requires_quote ? 'egyedi ár' : ft(e.price_huf)}
                      {e.price_unit !== 'ALKALOM' && !e.requires_quote && (
                        <span className="halk"> / {EGYSEG[e.price_unit]}</span>
                      )}
                    </td>
                    <td className="szam">{idotartam(e.work_minutes)}</td>
                    <td className="halk">
                      {e.description}
                      {e.recommends_overnight && (
                        <span className="cimke-pill" data-r="figyelem">éjszakára ajánlott</span>
                      )}
                    </td>
                  </tr>
                ))}
                {keresett.length === 0 && (
                  <tr><td colSpan={4}><div className="ures">Nincs találat.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
//  Mi van a csomagokban — összehasonlító táblázat
//
//  Egy sor egy munkalépés, egy oszlop egy csomag. A leggyakoribb telefonos
//  kérdésre válaszol: „mi a különbség a Premium és az Elit között?"
//
//  Két dolgot csinál másképp, mint egy szokásos pipa-táblázat:
//
//  1. A felülírt tételek EGY sorba kerülnek. Az Elitben a „Falc áttörlés"
//     helyén „Falc mélytisztítás" áll — ha két sor lenne belőle, a táblázat
//     azt állítaná, hogy az Elitből hiányzik a falctisztítás, miközben pont
//     alaposabb. Ilyenkor a cellában a NEVE látszik, nem egy pipa.
//
//  2. A „benne van" nem csak pipa, hanem olvasható szöveg is (a képernyőolvasó
//     és a kinyomtatott lap kedvéért). Aki látja a pipát, annak a pipa elég;
//     aki nem, annak ott a szó.
//
//  Az oszlopok a csomagokból jönnek. Ha lesz egy negyedik csomag, a táblázat
//  magától bővül — nincs beleírva, hogy három van.
// ---------------------------------------------------------------------------

export function CsomagTartalom({ k }: { k: Catalog }) {
  const csomagok = k.packages.filter((p) => p.active)

  // Sorokká rendezés: slot_id szerint. A sorrendet az adatbázis adja
  // (terület, majd a gyökértétel helye), itt csak megtartjuk.
  const sorok: { slotId: string; nev: string; area: ServiceArea; cella: Record<string, string> }[] = []
  for (const r of k.packageItems) {
    let s = sorok.find((x) => x.slotId === r.slot_id)
    if (!s) { s = { slotId: r.slot_id, nev: r.slot_name, area: r.area, cella: {} }; sorok.push(s) }
    s.cella[r.package_id] = r.name
  }

  if (sorok.length === 0) {
    return <div className="ures">Ehhez még nincs rögzítve csomagtartalom.</div>
  }

  const teruletek: { kulcs: ServiceArea; cim: string }[] = [
    { kulcs: 'KULSO', cim: 'Kívül' },
    { kulcs: 'BELSO', cim: 'Belül' },
  ]

  return (
    <div className="panel panelek-szeles">
      <h3>Mi van a csomagokban?</h3>
      <div className="panel-torzs">
        <div className="tablagorgo">
          <table className="lista tartalom-tabla">
            <thead>
              <tr>
                <th>Munkalépés</th>
                {csomagok.map((p) => <th key={p.id}>{p.name}</th>)}
              </tr>
            </thead>
            {teruletek.map((t) => {
              const csoport = sorok.filter((s) => s.area === t.kulcs)
              if (csoport.length === 0) return null
              return (
                <tbody key={t.kulcs}>
                  <tr className="terulet-sor">
                    <th scope="colgroup" colSpan={csomagok.length + 1}>{t.cim}</th>
                  </tr>
                  {csoport.map((s) => (
                    <tr key={s.slotId}>
                      <th scope="row">{s.nev}</th>
                      {csomagok.map((p) => {
                        const v = s.cella[p.id]
                        if (!v) {
                          return (
                            <td key={p.id} className="nincs">
                              <span aria-hidden="true">—</span>
                              <span className="csakolvaso">nincs benne</span>
                            </td>
                          )
                        }
                        // Ugyanaz a tétel, csak ebben a csomagban más a neve:
                        // ez a különbség, ezt ki kell írni.
                        if (v !== s.nev) {
                          return <td key={p.id} className="masik">{v}</td>
                        }
                        return (
                          <td key={p.id} className="van">
                            <span aria-hidden="true">✓</span>
                            <span className="csakolvaso">benne van</span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              )
            })}
          </table>
        </div>
        <p className="halk" style={{ fontSize: 'var(--m-xs)', marginTop: 'var(--t3)' }}>
          Ahol név áll pipa helyett, ott a csomag ugyanazt a munkát alaposabban
          vagy más anyaggal végzi — nem hiányzik, hanem más.
        </p>
      </div>
    </div>
  )
}
