import { useCallback, useEffect, useMemo, useState } from 'react'

import { useApp, useCatalog } from '../../state/AppContext'
import { ft } from '../../lib/format'
import {
  CATEGORY_SHORT, SIZE_LABEL, TIER_LABEL,
  type ContractRow, type ContractSize, type ContractTier,
  type PassBalanceRow, type SearchHit, type ValidityKind, type VehicleCategory,
} from '../../lib/types'

const TIERS: ContractTier[] = ['NORMAL', 'PREMIUM']
const SIZES: ContractSize[] = ['NORMAL', 'NAGY']
const AFA = 0.27

// ---------------------------------------------------------------------------
//  Cégek és bérletesek.
//
//  Ez nem egy második ügyféllista. Itt nem ügyfelet keresel, hanem a
//  MEGÁLLAPODÁST kezeled: mennyi alkalom van még a bérletben, meddig
//  érvényes, milyen Ft/autó árat kap a cég.
//
//  Egy ügyfélnek a kettő közül csak az egyike lehet — ezt az adatbázis
//  is kikényszeríti, nem csak ez a képernyő.
// ---------------------------------------------------------------------------

export default function PartnersPage() {
  const { data } = useApp()
  const [ful, setFul] = useState<'berletek' | 'cegek'>('berletek')
  const [passes, setPasses] = useState<PassBalanceRow[]>([])
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [tolt, setTolt] = useState(true)
  const [hiba, setHiba] = useState<string | null>(null)
  const [ujBerlet, setUjBerlet] = useState(false)
  const [szerkContract, setSzerkContract] = useState<ContractRow | 'uj' | null>(null)

  const ujra = useCallback(async () => {
    setTolt(true)
    try {
      const [p, c] = await Promise.all([data.listPasses(), data.listContracts()])
      setPasses(p)
      setContracts(c)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setTolt(false)
    }
  }, [data])

  useEffect(() => { void ujra() }, [ujra])

  // A nézet tételsoronként jön; itt bérletenként csoportosítjuk.
  const berletek = useMemo(() => {
    const m = new Map<string, { fej: PassBalanceRow; tetelek: PassBalanceRow[] }>()
    for (const r of passes) {
      const cs = m.get(r.pass_id) ?? { fej: r, tetelek: [] }
      cs.tetelek.push(r)
      m.set(r.pass_id, cs)
    }
    return [...m.values()]
  }, [passes])

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Cégek és bérletesek</h2>
        <div className="fulek">
          <button className={ful === 'berletek' ? 'aktiv' : ''} onClick={() => setFul('berletek')}>
            Bérletek
            {berletek.length > 0 && <span className="jelzo">{berletek.length}</span>}
          </button>
          <button className={ful === 'cegek' ? 'aktiv' : ''} onClick={() => setFul('cegek')}>
            Szerződéses cégek
            {contracts.length > 0 && <span className="jelzo">{contracts.length}</span>}
          </button>
        </div>
      </div>

      {hiba && <div className="hibauzenet">{hiba}</div>}
      {tolt && <div className="betolt">Betöltés…</div>}

      {!tolt && ful === 'berletek' && (
        <>
          <button className="btn btn-fo" style={{ marginBottom: 'var(--t4)' }}
                  onClick={() => setUjBerlet(true)}>
            + Új bérlet
          </button>

          {berletek.length === 0 && (
            <div className="panel"><div className="ures">Még nincs bérlet.</div></div>
          )}

          <div className="panelek">
            {berletek.map(({ fej, tetelek }) => {
              const osszes = tetelek.reduce((a, t) => a + t.qty_total, 0)
              const maradt = tetelek.reduce((a, t) => a + t.qty_left, 0)
              return (
                <div className="panel" key={fej.pass_id} data-lejart={fej.lejart}>
                  <h3>
                    {fej.customer_name}
                    <span className="szam" style={{ textTransform: 'none', letterSpacing: 0 }}>
                      {maradt}/{osszes} alkalom
                    </span>
                  </h3>
                  <div className="panel-torzs">
                    <div className="adatsor">
                      <span>{fej.pass_name}</span>
                      <span className="ertek">{ft(fej.price_huf)}</span>
                    </div>
                    <div className="adatsor">
                      <span>Érvényes</span>
                      <span className="ertek">
                        {fej.valid_until?.slice(0, 10)}
                        {fej.lejart ? (
                          <span style={{ color: 'var(--v-baj)' }}> · lejárt</span>
                        ) : (
                          <span className="halk"> · még {fej.napok_hatra} nap</span>
                        )}
                      </span>
                    </div>

                    <table className="artabla keskeny" style={{ marginTop: 'var(--t3)' }}>
                      <tbody>
                        {tetelek.map((t) => (
                          <tr key={t.pass_item_id}>
                            <th scope="row">
                              {t.package_name ?? 'Bármelyik csomag'}
                              {t.category && ` · ${CATEGORY_SHORT[t.category]}`}
                            </th>
                            <td className="szam">{t.qty_left} / {t.qty_total}</td>
                            <td>
                              <span className="savtart" style={{ width: 90 }}>
                                <span className="betelt"
                                      style={{ width: `${(t.qty_left / t.qty_total) * 100}%` }} />
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {fej.active && (
                      <button className="btn btn-kicsi" style={{ marginTop: 'var(--t3)' }}
                              onClick={async () => {
                                if (!window.confirm('Biztos kivezeted ezt a bérletet?')) return
                                await data.deactivatePass(fej.pass_id)
                                await ujra()
                              }}>
                        Kivezetés
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {!tolt && ful === 'cegek' && (
        <>
          <button className="btn btn-fo" style={{ marginBottom: 'var(--t4)' }}
                  onClick={() => setSzerkContract('uj')}>
            + Új szerződés
          </button>

          {contracts.length === 0 && (
            <div className="panel"><div className="ures">Még nincs szerződéses cég.</div></div>
          )}

          <div className="panelek">
            {contracts.map((c) => (
              <div className="panel" key={c.id}>
                <h3>{c.company_name ?? c.customer_name}</h3>
                <div className="panel-torzs">
                  {c.tax_number && (
                    <div className="adatsor">
                      <span>Adószám</span><span className="ertek">{c.tax_number}</span>
                    </div>
                  )}
                  <div className="adatsor">
                    <span>Hozom-viszem</span>
                    <span className="ertek">{c.pickup_delivery ? 'igen' : 'nem'}</span>
                  </div>

                  <table className="artabla keskeny" style={{ marginTop: 'var(--t3)' }}>
                    <thead>
                      <tr><th /><th>Bruttó</th><th>Nettó</th></tr>
                    </thead>
                    <tbody>
                      {TIERS.flatMap((tier) =>
                        SIZES.map((size) => {
                          const p = c.prices.find((x) => x.tier === tier && x.size === size)
                          return (
                            <tr key={tier + size} data-hianyzik={!p}>
                              <th scope="row">{TIER_LABEL[tier]} · {SIZE_LABEL[size]}</th>
                              <td className="szam">{p ? ft(p.price_huf) : '—'}</td>
                              <td className="szam halk">
                                {p ? ft(Math.round(p.price_huf / (1 + AFA))) : '—'}
                              </td>
                            </tr>
                          )
                        }),
                      )}
                    </tbody>
                  </table>

                  <button className="btn btn-kicsi" style={{ marginTop: 'var(--t3)' }}
                          onClick={() => setSzerkContract(c)}>
                    Szerkesztés
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {ujBerlet && (
        <PassForm onBezar={() => setUjBerlet(false)}
                  onKesz={() => { setUjBerlet(false); void ujra() }} />
      )}

      {szerkContract && (
        <ContractForm
          contract={szerkContract === 'uj' ? null : szerkContract}
          onBezar={() => setSzerkContract(null)}
          onKesz={() => { setSzerkContract(null); void ujra() }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Új bérlet
// ---------------------------------------------------------------------------
//  Nincs két egyforma bérlet, ezért nincs sablon sem: minden tétel külön sor,
//  tetszőleges csomaggal és darabszámmal, és az ár szabadon beírható.

function PassForm({ onBezar, onKesz }: { onBezar: () => void; onKesz: () => void }) {
  const { data } = useApp()
  const katalogus = useCatalog()
  const [q, setQ] = useState('')
  const [talalatok, setTalalatok] = useState<SearchHit[]>([])
  const [ugyfel, setUgyfel] = useState<SearchHit | null>(null)
  const [nev, setNev] = useState('')
  const [ar, setAr] = useState('')
  const [mod, setMod] = useState<ValidityKind>('EV')
  const [ertek, setErtek] = useState('1')
  const [tetelek, setTetelek] = useState<
    { package_id: string | null; category: VehicleCategory | null; qty_total: number }[]
  >([{ package_id: null, category: null, qty_total: 10 }])
  const [ment, setMent] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  useEffect(() => {
    if (q.trim().length < 1) { setTalalatok([]); return }
    const t = window.setTimeout(async () => {
      try { setTalalatok(await data.searchCustomers(q, 5)) } catch { setTalalatok([]) }
    }, 220)
    return () => window.clearTimeout(t)
  }, [q, data])

  async function mentes() {
    if (!ugyfel) return
    setMent(true); setHiba(null)
    try {
      await data.createPass({
        customer_id: ugyfel.customer_id,
        name: nev.trim() || 'Bérlet',
        price_huf: Number(ar) || 0,
        validity_kind: mod,
        validity_value: ertek,
        items: tetelek.filter((t) => t.qty_total > 0),
      })
      onKesz()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMent(false)
    }
  }

  const osszesAlkalom = tetelek.reduce((a, t) => a + (t.qty_total || 0), 0)

  return (
    <div className="fedo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onBezar()}>
      <div className="lap" role="dialog" aria-modal="true" aria-label="Új bérlet">
        <div className="lap-fej">
          <h2>Új bérlet</h2>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          <div className="szakasz">
            <div className="fej">Kinek</div>
            {ugyfel ? (
              <div className="talalat">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--t3)' }}>
                  <strong>{ugyfel.customer_name}</strong>
                  <span className="halk">{ugyfel.plate_raw}</span>
                  <button className="btn btn-kicsi" style={{ marginLeft: 'auto' }}
                          onClick={() => setUgyfel(null)}>Más ügyfél</button>
                </div>
              </div>
            ) : (
              <div className="kereso">
                <input className="beviteli" value={q} onChange={(e) => setQ(e.target.value)}
                       placeholder="Rendszám, név vagy cég" autoFocus />
                {talalatok.length > 0 && (
                  <div className="talalatlista">
                    {talalatok.map((h) => (
                      <button key={h.vehicle_id} type="button" className="talalatsor"
                              onClick={() => { setUgyfel(h); setTalalatok([]); setQ('') }}>
                        <span className="rendszam">{h.plate_raw}</span>
                        <span className="nev">{h.company_name || h.customer_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>
              A bérlet az ügyfél nevére szól, nem egy autóra — bármelyik járművére felhasználható.
            </p>
          </div>

          <div className="szakasz">
            <div className="fej">Tételek — {osszesAlkalom} alkalom</div>
            {tetelek.map((t, i) => (
              <div className="berlettetel" key={i}>
                <select className="beviteli" aria-label="Csomag" value={t.package_id ?? ''}
                        onChange={(e) => setTetelek((l) => l.map((x, j) =>
                          j === i ? { ...x, package_id: e.target.value || null } : x))}>
                  <option value="">Bármelyik csomag</option>
                  {katalogus.packages.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select className="beviteli" aria-label="Méret" value={t.category ?? ''}
                        onChange={(e) => setTetelek((l) => l.map((x, j) =>
                          j === i ? { ...x, category: (e.target.value || null) as VehicleCategory | null } : x))}>
                  <option value="">Bármelyik méret</option>
                  <option value="SZEMELYAUTO">Személyautó</option>
                  <option value="SUV">SUV</option>
                  <option value="KISBUSZ">Kisbusz</option>
                </select>
                <input className="beviteli szam darab" aria-label="Alkalmak száma"
                       type="number" inputMode="numeric" min={1}
                       value={t.qty_total}
                       onChange={(e) => setTetelek((l) => l.map((x, j) =>
                         j === i ? { ...x, qty_total: Number(e.target.value) || 0 } : x))} />
                {tetelek.length > 1 && (
                  <button className="btn btn-kicsi" aria-label="Tétel törlése"
                          onClick={() => setTetelek((l) => l.filter((_, j) => j !== i))}>×</button>
                )}
              </div>
            ))}
            <button className="btn btn-kicsi"
                    onClick={() => setTetelek((l) => [...l, { package_id: null, category: null, qty_total: 1 }])}>
              + Tétel
            </button>
          </div>

          <div className="szakasz">
            <div className="fej">Ár és érvényesség</div>
            <div className="sor-2">
              <div className="mezo">
                <label htmlFor="bnev">Bérlet neve</label>
                <input id="bnev" className="beviteli" value={nev}
                       onChange={(e) => setNev(e.target.value)}
                       placeholder="10 alkalmas vegyes" />
              </div>
              <div className="mezo">
                <label htmlFor="bar">Ár (Ft)</label>
                <input id="bar" className="beviteli szam" type="number" inputMode="numeric"
                       step={1000} value={ar} onChange={(e) => setAr(e.target.value)} />
              </div>
            </div>
            <div className="sor-2">
              <div className="mezo">
                <label htmlFor="bmod">Érvényesség</label>
                <select id="bmod" className="beviteli" value={mod}
                        onChange={(e) => setMod(e.target.value as ValidityKind)}>
                  <option value="EV">Ennyi évig</option>
                  <option value="NAP">Ennyi napig</option>
                  <option value="DATUM">Eddig a napig</option>
                </select>
              </div>
              <div className="mezo">
                <label htmlFor="bert">{mod === 'DATUM' ? 'Dátum' : 'Mennyi'}</label>
                <input id="bert" className="beviteli szam"
                       type={mod === 'DATUM' ? 'date' : 'number'}
                       value={ertek} onChange={(e) => setErtek(e.target.value)} />
              </div>
            </div>
          </div>

          {hiba && <div className="hibauzenet">{hiba}</div>}
        </div>

        <div className="lap-lab">
          <div className="osszeg">
            <span className="ertek">{ft(Number(ar) || 0)}</span>
            <span className="alatta">{osszesAlkalom} alkalom</span>
          </div>
          <div className="gombok">
            <button className="btn" onClick={onBezar} disabled={ment}>Mégse</button>
            <button className="btn btn-fo" onClick={() => void mentes()}
                    disabled={!ugyfel || osszesAlkalom === 0 || ment}>
              {ment ? 'Mentés…' : 'Bérlet létrehozása'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Szerződés
// ---------------------------------------------------------------------------

function ContractForm({
  contract, onBezar, onKesz,
}: {
  contract: ContractRow | null
  onBezar: () => void
  onKesz: () => void
}) {
  const { data } = useApp()
  const [q, setQ] = useState('')
  const [talalatok, setTalalatok] = useState<SearchHit[]>([])
  const [ugyfelId, setUgyfelId] = useState<string | null>(contract?.customer_id ?? null)
  const [ugyfelNev, setUgyfelNev] = useState(contract?.company_name ?? contract?.customer_name ?? '')
  const [adoszam, setAdoszam] = useState(contract?.tax_number ?? '')
  const [hozomViszem, setHozomViszem] = useState(contract?.pickup_delivery ?? false)
  const [lejarat, setLejarat] = useState(contract?.valid_until?.slice(0, 10) ?? '')
  const [arak, setArak] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (contract?.prices ?? []).map((p) => [`${p.tier}_${p.size}`, String(p.price_huf)]),
    ),
  )
  const [ment, setMent] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  useEffect(() => {
    if (q.trim().length < 1) { setTalalatok([]); return }
    const t = window.setTimeout(async () => {
      try { setTalalatok(await data.searchCustomers(q, 5)) } catch { setTalalatok([]) }
    }, 220)
    return () => window.clearTimeout(t)
  }, [q, data])

  async function mentes() {
    if (!ugyfelId) return
    setMent(true); setHiba(null)
    try {
      await data.saveContract({
        id: contract?.id ?? null,
        customer_id: ugyfelId,
        tax_number: adoszam.trim() || null,
        pickup_delivery: hozomViszem,
        valid_until: lejarat || null,
        notes: null,
        prices: TIERS.flatMap((tier) =>
          SIZES.map((size) => ({ tier, size, price_huf: Number(arak[`${tier}_${size}`]) || 0 })),
        ).filter((p) => p.price_huf > 0),
      })
      onKesz()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMent(false)
    }
  }

  return (
    <div className="fedo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onBezar()}>
      <div className="lap" role="dialog" aria-modal="true" aria-label="Szerződés">
        <div className="lap-fej">
          <h2>{contract ? 'Szerződés módosítása' : 'Új szerződés'}</h2>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          <div className="szakasz">
            <div className="fej">Cég</div>
            {ugyfelId ? (
              <div className="talalat">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--t3)' }}>
                  <strong>{ugyfelNev}</strong>
                  {!contract && (
                    <button className="btn btn-kicsi" style={{ marginLeft: 'auto' }}
                            onClick={() => setUgyfelId(null)}>Más cég</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="kereso">
                <input className="beviteli" value={q} onChange={(e) => setQ(e.target.value)}
                       placeholder="Cégnév vagy rendszám" autoFocus />
                {talalatok.length > 0 && (
                  <div className="talalatlista">
                    {talalatok.map((h) => (
                      <button key={h.vehicle_id} type="button" className="talalatsor"
                              onClick={() => {
                                setUgyfelId(h.customer_id)
                                setUgyfelNev(h.company_name || h.customer_name)
                                setTalalatok([]); setQ('')
                              }}>
                        <span className="rendszam">{h.plate_raw}</span>
                        <span className="nev">{h.company_name || h.customer_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="szakasz">
            <div className="sor-2">
              <div className="mezo">
                <label htmlFor="ado">Adószám</label>
                <input id="ado" className="beviteli" value={adoszam}
                       onChange={(e) => setAdoszam(e.target.value)} />
              </div>
              <div className="mezo">
                <label htmlFor="lej">Szerződés vége (üres = határozatlan)</label>
                <input id="lej" className="beviteli" type="date" value={lejarat}
                       onChange={(e) => setLejarat(e.target.value)} />
              </div>
            </div>
            <label className="jelolo" data-aktiv={hozomViszem}>
              <input type="checkbox" checked={hozomViszem}
                     onChange={(e) => setHozomViszem(e.target.checked)} />
              <span>Hozom-viszem szolgáltatás jár</span>
            </label>
          </div>

          <div className="szakasz">
            <div className="fej">Ft / autó</div>
            <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>
              Bruttó árak. Amit üresen hagysz, arra nincs megállapodás — az a
              kombináció listaáron megy.
            </p>
            {TIERS.map((tier) => (
              <div className="sor-2" key={tier}>
                {SIZES.map((size) => {
                  const kulcs = `${tier}_${size}`
                  const brutto = Number(arak[kulcs]) || 0
                  return (
                    <div className="mezo" key={kulcs}>
                      <label htmlFor={kulcs}>{TIER_LABEL[tier]} · {SIZE_LABEL[size]}</label>
                      <input id={kulcs} className="beviteli szam" type="number" inputMode="numeric"
                             step={500} value={arak[kulcs] ?? ''}
                             onChange={(e) => setArak((a) => ({ ...a, [kulcs]: e.target.value }))} />
                      {brutto > 0 && (
                        <span className="halk" style={{ fontSize: 'var(--m-xs)' }}>
                          nettó {ft(Math.round(brutto / (1 + AFA)))}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {hiba && <div className="hibauzenet">{hiba}</div>}
        </div>

        <div className="lap-lab">
          <div className="gombok" style={{ marginLeft: 0, width: '100%' }}>
            <button className="btn" onClick={onBezar} disabled={ment}>Mégse</button>
            <button className="btn btn-fo" onClick={() => void mentes()}
                    disabled={!ugyfelId || ment} style={{ marginLeft: 'auto' }}>
              {ment ? 'Mentés…' : 'Mentés'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
