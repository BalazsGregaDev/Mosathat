import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, idotartam } from '../../lib/format'
import {
  CATEGORY_SHORT, SCOPE_LABEL,
  type BookingScope, type Package, type VehicleCategory,
} from '../../lib/types'
import type { Catalog } from '../../data'

// ---------------------------------------------------------------------------
//  Szolgáltatások — alkalmazotti nézet
//
//  Ez nem a szerkesztő képernyő letiltott gombokkal. Az árakat az alkalmazott
//  nem állítja, tehát nincs miért ott lennie a harminc beviteli mezőnek, még
//  szürkén sem: a szürke gomb csak azt üzeni, hogy "ezt elronthattad volna".
//
//  Ami helyette van: árlista. Pontosan az, amit telefon közben meg kell
//  nézni — mennyibe kerül és mennyi ideig tart.
// ---------------------------------------------------------------------------

const KATEGORIAK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
const TERJEDELMEK: BookingScope[] = ['TELJES', 'KULSO', 'BELSO']

export default function ServicesView() {
  const { data, catalog } = useApp()
  const [k, setK] = useState<Catalog | null>(catalog)
  const [ful, setFul] = useState<'csomagok' | 'extrak'>('csomagok')
  const [q, setQ] = useState('')

  useEffect(() => { data.getCatalog().then(setK) }, [data])

  if (!k) return <div className="betolt">Betöltés…</div>

  const ar = (p: Package, c: VehicleCategory, s: BookingScope) =>
    k.packagePricing.find((x) => x.package_id === p.id && x.category === c && x.scope === s)

  const fsAr = (p: Package, c: VehicleCategory) =>
    k.fullServicePricing.find((x) => x.package_id === p.id && x.category === c)

  const keresett = k.extras.filter((e) =>
    e.active && (q === '' || e.name.toLowerCase().includes(q.toLowerCase())))

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Szolgáltatások</h2>
        <div className="fulek">
          <button className={ful === 'csomagok' ? 'aktiv' : ''} onClick={() => setFul('csomagok')}>
            Csomagok és árak
          </button>
          <button className={ful === 'extrak' ? 'aktiv' : ''} onClick={() => setFul('extrak')}>
            Egyéb szolgáltatások
          </button>
        </div>
      </div>

      {ful === 'csomagok' && (
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
                  <table className="arlista">
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
                                  <div className="ar">{a?.requires_quote ? 'egyedi' : ft(a?.price_huf ?? null)}</div>
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
            felvehető, de az idő és az ár csak részleges — szólj a tulajnak.
          </p>
        </>
      )}

      {ful === 'extrak' && (
        <>
          <input
            className="beviteli"
            style={{ marginBottom: 'var(--t4)' }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Keresés a szolgáltatások között"
            aria-label="Keresés"
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
      )}
    </div>
  )
}

const EGYSEG: Record<string, string> = {
  DB: 'db', AJTO: 'ajtó', ULES: 'ülés', LITER: 'liter', ALKALOM: 'alkalom',
}
