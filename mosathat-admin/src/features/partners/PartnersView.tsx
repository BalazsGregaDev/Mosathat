import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft } from '../../lib/format'
import {
  CATEGORY_SHORT, SIZE_LABEL, TIER_LABEL,
  type ContractRow, type ContractSize, type ContractTier, type PassBalanceRow,
} from '../../lib/types'

// ---------------------------------------------------------------------------
//  Cégek és bérletesek — alkalmazotti nézet
//
//  Amit egy alkalmazottnak tudnia kell, amikor valaki azzal áll meg a
//  pultnál, hogy "nekem bérletem van":
//
//    van-e még alkalma, és meddig érvényes
//    a cégnél mennyibe kerül egy autó, és hozzuk-visszük-e
//
//  Amit nem kell: bérletet létrehozni, árat átírni, szerződést kötni.
//  Ezért itt ezek nem letiltott gombok, hanem egyszerűen nincsenek.
// ---------------------------------------------------------------------------

const TIERS: ContractTier[] = ['NORMAL', 'PREMIUM']
const SIZES: ContractSize[] = ['NORMAL', 'NAGY']

export default function PartnersView() {
  const { data } = useApp()
  const [berletek, setBerletek] = useState<PassBalanceRow[] | null>(null)
  const [cegek, setCegek] = useState<ContractRow[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    Promise.all([data.listPasses(), data.listContracts()])
      .then(([b, c]) => { setBerletek(b); setCegek(c) })
      .catch((e) => setHiba(e instanceof Error ? e.message : String(e)))
  }, [data])

  if (hiba) return <div className="oldal"><div className="hibauzenet">{hiba}</div></div>
  if (!berletek || !cegek) return <div className="oldal"><div className="betolt">Betöltés…</div></div>

  const szur = (s: string) => q === '' || s.toLowerCase().includes(q.toLowerCase())

  // Egy bérlethez több tétel tartozik (pl. 8 normál + 2 prémium alkalom).
  const bCsoport = new Map<string, PassBalanceRow[]>()
  for (const b of berletek) {
    if (!b.active || b.lejart) continue
    if (!szur(b.customer_name)) continue
    const t = bCsoport.get(b.pass_id) ?? []
    t.push(b)
    bCsoport.set(b.pass_id, t)
  }

  const szurtCegek = cegek.filter((c) =>
    c.active && szur(c.company_name || c.customer_name))

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Cégek és bérletesek</h2>
      </div>

      <input
        className="beviteli"
        style={{ marginBottom: 'var(--t4)' }}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Név vagy cég"
        aria-label="Keresés"
      />

      <div className="panel panelek-szeles">
        <h3>Érvényes bérletek</h3>
        <div className="panel-torzs">
          {bCsoport.size === 0 ? (
            <div className="ures">Nincs érvényes bérlet.</div>
          ) : (
            <div className="tablagorgo">
              <table className="lista">
                <thead>
                  <tr>
                    <th>Kinek</th>
                    <th>Mire szól</th>
                    <th>Maradt</th>
                    <th>Meddig</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bCsoport.values()].map((tetelek) => {
                    const f = tetelek[0]
                    const maradt = tetelek.reduce((s, t) => s + t.qty_left, 0)
                    return (
                      <tr key={f.pass_id}>
                        <th scope="row">{f.customer_name}</th>
                        <td>
                          {tetelek.map((t) => (
                            <div key={t.pass_item_id}>
                              {t.package_name ?? 'Bármelyik csomag'}
                              {t.category && <span className="halk"> · {CATEGORY_SHORT[t.category]}</span>}
                              <span className="halk szam"> — {t.qty_left}/{t.qty_total}</span>
                            </div>
                          ))}
                        </td>
                        <td className="szam">
                          <strong>{maradt}</strong> alkalom
                        </td>
                        <td className="szam">
                          {f.valid_until.slice(0, 10)}
                          {f.napok_hatra <= 30 && (
                            <div className="halk" style={{ fontSize: 'var(--m-xs)' }}>
                              {f.napok_hatra} nap
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="panel panelek-szeles" style={{ marginTop: 'var(--t4)' }}>
        <h3>Szerződéses cégek</h3>
        <div className="panel-torzs">
          {szurtCegek.length === 0 ? (
            <div className="ures">Nincs szerződéses cég.</div>
          ) : (
            szurtCegek.map((c) => (
              <div key={c.id} className="ceg-kartya">
                <div className="ceg-fej">
                  <strong>{c.company_name || c.customer_name}</strong>
                  {c.pickup_delivery && (
                    <span className="cimke-pill" data-r="hozomviszem">Hozom-viszem</span>
                  )}
                </div>
                <table className="artabla keskeny">
                  <tbody>
                    {TIERS.map((tier) => SIZES.map((size) => {
                      const p = c.prices.find((x) => x.tier === tier && x.size === size)
                      if (!p) return null
                      return (
                        <tr key={`${tier}-${size}`}>
                          <th scope="row">{TIER_LABEL[tier]} · {SIZE_LABEL[size]}</th>
                          <td className="szam">{ft(p.price_huf)} / autó</td>
                        </tr>
                      )
                    }))}
                  </tbody>
                </table>
                {c.notes && <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>{c.notes}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
