import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft } from '../../lib/format'
import {
  BILLING_LABEL, CATEGORY_SHORT,
  type CustomerSummary, type VehicleSummary,
} from '../../lib/types'

// ---------------------------------------------------------------------------
//  Ügyfelek — egy oldal, két rendezés.
//
//  Nem két menüpont. Az adat egyetlen lánc: ügyfél → jármű → foglalások.
//  Két külön lista ugyanannak a láncnak a két végét mutatná, és minden
//  ügyfél kétszer szerepelne a rendszerben.
//
//  Amit a soron látni kell, az nem a nyers adat, hanem a történet: hányszor
//  járt itt, mennyit költött, milyen sűrűn jár. Ezt az adatbázis számolja —
//  így a szám mindenhol ugyanaz.
// ---------------------------------------------------------------------------

type Nezet = 'jarmu' | 'ugyfel'

export default function CustomersPage() {
  const { data } = useApp()
  const [nezet, setNezet] = useState<Nezet>('jarmu')
  const [q, setQ] = useState('')
  const [ugyfelek, setUgyfelek] = useState<CustomerSummary[]>([])
  const [jarmuvek, setJarmuvek] = useState<VehicleSummary[]>([])
  const [tolt, setTolt] = useState(true)
  const [hiba, setHiba] = useState<string | null>(null)
  const [nyitott, setNyitott] = useState<string | null>(null)

  const betolt = useCallback(async (keres: string) => {
    setTolt(true)
    try {
      if (nezet === 'ugyfel') setUgyfelek(await data.listCustomers(keres))
      else setJarmuvek(await data.listVehicles(keres))
      setHiba(null)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setTolt(false)
    }
  }, [data, nezet])

  // Gépelés közben keres, 250 ms csend után.
  useEffect(() => {
    const t = window.setTimeout(() => void betolt(q), 250)
    return () => window.clearTimeout(t)
  }, [q, betolt])

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Ügyfelek</h2>
        <div className="fulek">
          <button className={nezet === 'jarmu' ? 'aktiv' : ''} onClick={() => setNezet('jarmu')}>
            Jármű szerint
          </button>
          <button className={nezet === 'ugyfel' ? 'aktiv' : ''} onClick={() => setNezet('ugyfel')}>
            Ügyfél szerint
          </button>
        </div>
      </div>

      <input
        className="beviteli"
        style={{ marginBottom: 'var(--t4)' }}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rendszám, név, cég, telefonszám vagy márka"
        aria-label="Keresés"
      />

      {hiba && <div className="hibauzenet">{hiba}</div>}
      {tolt && <div className="betolt">Betöltés…</div>}

      {!tolt && nezet === 'jarmu' && (
        <div className="panel">
          <div className="tablagorgo">
            <table className="lista">
              <thead>
                <tr>
                  <th>Rendszám</th>
                  <th>Autó</th>
                  <th>Tulajdonos</th>
                  <th>Munkák</th>
                  <th>Utoljára</th>
                </tr>
              </thead>
              <tbody>
                {jarmuvek.map((v) => (
                  <tr key={v.id}>
                    <td><span className="rendszam">{v.plate_raw}</span></td>
                    <td>
                      {[v.brand, v.model].filter(Boolean).join(' ') || '—'}
                      <span className="halk"> · {CATEGORY_SHORT[v.category]}</span>
                    </td>
                    <td>
                      {v.company_name || v.customer_name}
                      {v.billing_kind !== 'NORMAL' && (
                        <span className="cimke-pill billing" data-b={v.billing_kind}>
                          {BILLING_LABEL[v.billing_kind]}
                        </span>
                      )}
                      <div className="halk szam" style={{ fontSize: 'var(--m-xs)' }}>
                        {v.customer_phone}
                      </div>
                    </td>
                    <td className="szam">{v.latogatas}</td>
                    <td>
                      {v.utolso ? (
                        <>
                          <span className="szam">{v.utolso.slice(0, 10)}</span>
                          {v.utolso_csomag && <span className="halk"> · {v.utolso_csomag}</span>}
                        </>
                      ) : (
                        <span className="halvany">még nem járt itt</span>
                      )}
                    </td>
                  </tr>
                ))}
                {jarmuvek.length === 0 && (
                  <tr><td colSpan={5}><div className="ures">Nincs találat.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!tolt && nezet === 'ugyfel' && (
        <div className="panelek">
          {ugyfelek.map((c) => (
            <div className="panel" key={c.id}>
              <h3>
                {c.company_name || c.name}
                {c.billing_kind !== 'NORMAL' && (
                  <span className="cimke-pill billing" data-b={c.billing_kind}>
                    {BILLING_LABEL[c.billing_kind]}
                  </span>
                )}
              </h3>
              <div className="panel-torzs">
                <div className="adatsor">
                  <span>Telefon</span>
                  <span className="ertek">
                    <a href={`tel:${c.phone}`} style={{ color: 'inherit' }}>{c.phone}</a>
                  </span>
                </div>
                <div className="adatsor">
                  <span>Járművei</span>
                  <span className="ertek">{c.jarmuvek}</span>
                </div>
                <div className="adatsor">
                  <span>Munkák</span>
                  <span className="ertek">{c.latogatas}</span>
                </div>
                {c.latogatas > 0 && (
                  <>
                    <div className="adatsor">
                      <span>Összesen költött</span>
                      <span className="ertek">{ft(c.osszesen)}</span>
                    </div>
                    <div className="adatsor">
                      <span>Átlagosan</span>
                      <span className="ertek">{ft(c.atlag)}</span>
                    </div>
                    <div className="adatsor">
                      <span>Utoljára</span>
                      <span className="ertek szam">{c.utolso?.slice(0, 10)}</span>
                    </div>
                    {c.kedvenc_csomag && (
                      <div className="adatsor">
                        <span>Leggyakrabban</span>
                        <span className="ertek" style={{ fontFamily: 'var(--betu)' }}>
                          {c.kedvenc_csomag}
                        </span>
                      </div>
                    )}
                    {c.atlag_napok !== null && (
                      <p className="halk" style={{ fontSize: 'var(--m-xs)', marginTop: 'var(--t2)' }}>
                        Átlagosan {c.atlag_napok} naponta jár be. Ez belső információ —
                        nem megy ki az ügyfélnek.
                      </p>
                    )}
                  </>
                )}
                {c.latogatas === 0 && (
                  <p className="halvany" style={{ fontSize: 'var(--m-xs)' }}>
                    Még nincs lezárt munkája.
                  </p>
                )}

                <button
                  className="btn btn-kicsi"
                  style={{ marginTop: 'var(--t3)' }}
                  onClick={() => setNyitott(nyitott === c.id ? null : c.id)}
                >
                  {nyitott === c.id ? 'Járművek elrejtése' : 'Járművei'}
                </button>

                {nyitott === c.id && <UgyfelJarmuvei customerId={c.id} />}
              </div>
            </div>
          ))}
          {ugyfelek.length === 0 && (
            <div className="panel"><div className="ures">Nincs találat.</div></div>
          )}
        </div>
      )}
    </div>
  )
}

/** Egy ügyfél autói — a teljes listából szűrve, hogy ne legyen külön lekérdezés. */
function UgyfelJarmuvei({ customerId }: { customerId: string }) {
  const { data } = useApp()
  const [sorok, setSorok] = useState<VehicleSummary[] | null>(null)

  useEffect(() => {
    let el = true
    data.listVehicles('').then((v) => {
      if (el) setSorok(v.filter((x) => x.customer_id === customerId))
    })
    return () => { el = false }
  }, [data, customerId])

  if (!sorok) return <div className="betolt">Betöltés…</div>

  return (
    <table className="artabla keskeny" style={{ marginTop: 'var(--t3)' }}>
      <tbody>
        {sorok.map((v) => (
          <tr key={v.id}>
            <th scope="row"><span className="rendszam">{v.plate_raw}</span></th>
            <td>{[v.brand, v.model].filter(Boolean).join(' ')}</td>
            <td className="halk">{CATEGORY_SHORT[v.category]}</td>
            <td className="szam">{v.latogatas} munka</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
