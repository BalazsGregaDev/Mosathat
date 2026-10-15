import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, hibaSzoveg } from '../../lib/format'
import {
  CATEGORY_SHORT,
  type ContractRow, type PassBalanceRow,
} from '../../lib/types'
import SzerzodesArak from './SzerzodesArak'
import IgazoloLap from '../igazolo/IgazoloLap'

export default function PartnersView({ fokuszCeg }: {
  fokuszCeg?: string | null
} = {}) {
  const { data } = useApp()
  const [berletek, setBerletek] = useState<PassBalanceRow[] | null>(null)
  const [cegek, setCegek] = useState<ContractRow[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [lap, setLap] = useState<{ id: string; nev: string } | null>(null)

  const [villan, setVillan] = useState(Boolean(fokuszCeg))
  useEffect(() => {
    if (!fokuszCeg || !cegek) return
    document.querySelector(`[data-ceg="${fokuszCeg}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = window.setTimeout(() => setVillan(false), 2500)
    return () => window.clearTimeout(t)
  }, [fokuszCeg, cegek])

  useEffect(() => {
    Promise.all([data.listPasses(), data.listContracts()])
      .then(([b, c]) => { setBerletek(b); setCegek(c) })
      .catch((e) => setHiba(hibaSzoveg(e)))
  }, [data])

  if (hiba) return <div className="oldal"><div className="hibauzenet">{hiba}</div></div>
  if (!berletek || !cegek) return <div className="oldal"><div className="betolt">Betöltés…</div></div>

  const szur = (s: string) => q === '' || s.toLowerCase().includes(q.toLowerCase())

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
        <h3>Szerződéses cégek</h3>
        <div className="panel-torzs">
          {szurtCegek.length === 0 ? (
            <div className="ures">Nincs szerződéses cég.</div>
          ) : (
            szurtCegek.map((c) => (
              <div key={c.id} className="ceg-kartya" data-ceg={c.company_id}
                   data-kiemelt={(villan && fokuszCeg === c.company_id) || undefined}>
                <div className="ceg-fej">
                  <strong>{c.company_name || c.customer_name}</strong>
                  {c.pickup_delivery && (
                    <span className="cimke-pill" data-r="hozomviszem">
                      Hozom-viszem
                      {c.pickup_delivery_fee_huf != null
                        && ` · ${ft(c.pickup_delivery_fee_huf)} / út`}
                    </span>
                  )}
                </div>
                <div className="ceg-lap-sor">
                  <button className="btn btn-kicsi"
                          onClick={() => setLap({ id: c.company_id, nev: c.company_name || c.customer_name })}>
                    Igazolólap
                  </button>
                </div>
                <SzerzodesArak prices={c.prices} />
                {c.notes && <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>{c.notes}</p>}
              </div>
            ))
          )}
        </div>
      </div>
      <div className="panel panelek-szeles" style={{ marginTop: 'var(--t4)' }}>
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

      {lap && <IgazoloLap cegId={lap.id} cegNev={lap.nev} onBezar={() => setLap(null)} />}
    </div>
  )
}
