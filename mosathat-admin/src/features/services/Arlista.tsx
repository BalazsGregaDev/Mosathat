import { ft, idotartam } from '../../lib/format'
import {
  CATEGORY_SHORT, SCOPE_LABEL,
  type BookingScope, type Package, type VehicleCategory,
} from '../../lib/types'
import type { Catalog } from '../../data'

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
          <h3>{p.name}</h3>
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
                    <th>Több üléssoros</th>
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

/** Extrák: ár, időigény, leírás. A leírás az, amit telefonban felolvasol. */
export function ExtraLista({ k, q, onQ }: {
  k: Catalog
  q: string
  onQ: (v: string) => void
}) {
  const keresett = k.extras.filter((e) =>
    e.active && (q === '' || e.name.toLowerCase().includes(q.toLowerCase())
                 || (e.description ?? '').toLowerCase().includes(q.toLowerCase())))

  return (
    <>
      <input
        className="beviteli"
        style={{ marginBottom: 'var(--t3)' }}
        value={q}
        onChange={(e) => onQ(e.target.value)}
        placeholder="Keresés név vagy leírás szerint"
        aria-label="Keresés a szolgáltatások között"
      />
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
