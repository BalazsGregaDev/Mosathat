import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useApp, useCatalog } from '../../state/AppContext'
import { bruttobol, ft, hibaSzoveg, nettobol } from '../../lib/format'
import {
  CATEGORY_LABEL, CATEGORY_SHORT, KATEGORIAK, KIND_LABEL, SIZE_LABEL,
  type ContractKind, type ContractRow, type ContractSize,
  type PassBalanceRow, type SearchHit, type ValidityKind, type VehicleCategory,
} from '../../lib/types'
import KartyaFej from '../common/KartyaFej'
import { useKerdes } from '../common/Kerdes'
import { CegValaszto, URES_CEG, useCegEgyeztetes, type CegErtek } from '../common/Ceg'
import SzerzodesArak, { FAJTAK, MERETEK } from './SzerzodesArak'
import IgazoloLap from '../igazolo/IgazoloLap'
import KetallasuCsuszka from '../common/KetallasuCsuszka'
import Csuszka from '../common/Csuszka'

export default function PartnersPage({ fokuszCeg }: {
  fokuszCeg?: string | null
} = {}) {
  const { data, user } = useApp()
  const szerkesztheto = user?.canEditCustomers === true
  const [ful, setFul] = useState<'berletek' | 'cegek'>('cegek')
  const [passes, setPasses] = useState<PassBalanceRow[]>([])
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [tolt, setTolt] = useState(true)
  const [hiba, setHiba] = useState<string | null>(null)
  const [ujBerlet, setUjBerlet] = useState(false)
  const [szerkContract, setSzerkContract] = useState<ContractRow | 'uj' | null>(null)
  const [kerdesAblak, kerdez] = useKerdes()

  const ujra = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([data.listPasses(), data.listContracts()])
      setPasses(p)
      setContracts(c)
      setHiba(null)
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setTolt(false)
    }
  }, [data])

  useEffect(() => { void ujra() }, [ujra])

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
          <button className={ful === 'cegek' ? 'aktiv' : ''} onClick={() => setFul('cegek')}>
            Szerződéses cégek
            {contracts.length > 0 && <span className="jelzo">{contracts.length}</span>}
          </button>
          <button className={ful === 'berletek' ? 'aktiv' : ''} onClick={() => setFul('berletek')}>
            Bérletek
            {berletek.length > 0 && <span className="jelzo">{berletek.length}</span>}
          </button>
        </div>
      </div>

      {hiba && <div className="hibauzenet">{hiba}</div>}
      {tolt && <div className="betolt">Betöltés…</div>}

      {!tolt && ful === 'berletek' && (
        <>
          {szerkesztheto && (
            <button className="btn btn-fo" style={{ marginBottom: 'var(--t4)' }}
                    onClick={() => setUjBerlet(true)}>
              + Új bérlet
            </button>
          )}

          {berletek.length === 0 && (
            <div className="panel"><div className="ures">Még nincs bérlet.</div></div>
          )}

          <div className="panelek panelek-ugyfel">
            {berletek.map(({ fej, tetelek }) => {
              const osszes = tetelek.reduce((a, t) => a + t.qty_total, 0)
              const maradt = tetelek.reduce((a, t) => a + t.qty_left, 0)
              return (
                <BerletKartya key={fej.pass_id} lejart={fej.lejart}
                              cim={fej.customer_name} maradt={maradt} osszes={osszes}>
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

                    {fej.active && szerkesztheto && (
                      <button className="btn btn-kicsi" style={{ marginTop: 'var(--t3)' }}
                              onClick={async () => {
                                if (!(await kerdez({
                                  cim: 'Biztosan kivezeted ezt a bérletet?',
                                  szoveg: 'A megmaradt alkalmak ezután nem használhatók fel.',
                                  igen: 'Kivezetés', nem: 'Mégse', veszelyes: true,
                                }))) return
                                try {
                                  await data.deactivatePass(fej.pass_id)
                                  await ujra()
                                } catch (e) {
                                  setHiba(hibaSzoveg(e))
                                }
                              }}>
                        Kivezetés
                      </button>
                    )}
                </BerletKartya>
              )
            })}
          </div>
        </>
      )}

      {!tolt && ful === 'cegek' && (
        <>
          {szerkesztheto && (
            <button className="btn btn-fo" style={{ marginBottom: 'var(--t4)' }}
                    onClick={() => setSzerkContract('uj')}>
              + Új szerződés
            </button>
          )}

          {contracts.length === 0 && (
            <div className="panel"><div className="ures">Még nincs szerződéses cég.</div></div>
          )}

          <div className="panelek panelek-ugyfel">
            {contracts.map((c) => (
              <CegKartya key={c.id} cim={c.company_name ?? c.customer_name}
                         cegId={c.company_id}
                         kiemelt={fokuszCeg === c.company_id}
                         nev={c.customer_name} hozomViszem={c.pickup_delivery}
                         arDb={c.prices.length} autok={c.jarmuvek}>
                  {c.tax_number && (
                    <div className="adatsor">
                      <span>Adószám</span><span className="ertek">{c.tax_number}</span>
                    </div>
                  )}
                  {c.pickup_delivery && c.pickup_delivery_fee_huf != null && (
                    <div className="adatsor">
                      <span>Fuvar</span>
                      <span className="ertek">{ft(c.pickup_delivery_fee_huf)} / út</span>
                    </div>
                  )}

                  <div className="adatsor">
                    <span>Flottás autók</span>
                    <span className="ertek">{c.fleet_cars ? 'igen' : 'nem'}</span>
                  </div>

                  <div className="adatsor">
                    <span>Igazolólap időszaka</span>
                    <span className="ertek">
                      {c.cycle_day > 1
                        ? `${c.cycle_day}. naptól a következő hónap ${c.cycle_day - 1}. napjáig`
                        : 'naptári hónap'}
                    </span>
                  </div>

                  {c.valid_until && (
                    <div className="adatsor">
                      <span>Szerződés vége</span>
                      <span className="ertek">{c.valid_until.slice(0, 10)}</span>
                    </div>
                  )}

                  <div style={{ marginTop: 'var(--t3)' }}>
                    <SzerzodesArak prices={c.prices} netto />
                  </div>

                  {szerkesztheto && (
                    <div className="sor-gombok" style={{ marginTop: 'var(--t3)' }}>
                      <button className="btn btn-kicsi" onClick={() => setSzerkContract(c)}>
                        Szerkesztés
                      </button>
                      <button className="btn btn-kicsi btn-veszelyes"
                              onClick={async () => {
                                if (!(await kerdez({
                                  cim: `Biztosan törlöd a szerződést? ${c.company_name ?? c.customer_name}`,
                                  szoveg: 'A cég autói ezután listaáron mennek. A cég, az autói és a '
                                    + 'már felvett foglalások ára megmarad.',
                                  igen: 'Törlés', nem: 'Mégse', veszelyes: true,
                                }))) return
                                try {
                                  await data.deleteContract(c.id)
                                  await ujra()
                                } catch (e) {
                                  setHiba(hibaSzoveg(e))
                                }
                              }}>
                        Törlés
                      </button>
                    </div>
                  )}
              </CegKartya>
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
      {kerdesAblak}
    </div>
  )
}

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
  const mentRef = useRef(false)

  useEffect(() => {
    if (q.trim().length < 1) { setTalalatok([]); return }
    let el = true
    const t = window.setTimeout(async () => {
      try {
        const r = await data.searchCustomers(q, 5)
        if (el) setTalalatok(r)
      } catch {
        if (el) setTalalatok([])
      }
    }, 220)
    return () => { el = false; window.clearTimeout(t) }
  }, [q, data])

  function modValt(uj: ValidityKind) {
    setMod(uj)
    setErtek(uj === 'EV' ? '1' : uj === 'NAP' ? '30' : '')
  }

  const piszkos = Boolean(ugyfel || q.trim() || nev.trim() || ar.trim())
  const ervenyes = mod === 'DATUM' ? /^\d{4}-\d{2}-\d{2}$/.test(ertek) : Number(ertek) > 0

  async function mentes() {
    if (!ugyfel || mentRef.current) return
    mentRef.current = true
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
      setHiba(hibaSzoveg(e))
    } finally {
      mentRef.current = false
      setMent(false)
    }
  }

  const osszesAlkalom = tetelek.reduce((a, t) => a + (t.qty_total || 0), 0)

  return (
    <div className="fedo" role="presentation"
         onMouseDown={(e) => { if (e.target === e.currentTarget && !piszkos && !ment) onBezar() }}>
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
                  {KATEGORIAK.map((k) => <option key={k} value={k}>{CATEGORY_LABEL[k]}</option>)}
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
                        onChange={(e) => modValt(e.target.value as ValidityKind)}>
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
                    disabled={!ugyfel || osszesAlkalom === 0 || !ervenyes || ment}>
              {ment ? 'Mentés…' : 'Bérlet létrehozása'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const arKulcs = (pk: string, m: ContractSize, f: ContractKind) => `${pk}_${m}_${f}`

const AR_MOD_KULCS = 'mosathat.szerzodes.armod'

function nettoModOlvas(): boolean {
  try { return localStorage.getItem(AR_MOD_KULCS) === 'netto' } catch { return false }
}

function nettoModMent(netto: boolean) {
  try { localStorage.setItem(AR_MOD_KULCS, netto ? 'netto' : 'brutto') } catch { }
}

function fordulonapSzoveg(n: number): string {
  return n === 1
    ? 'Egy igazolólap a naptári hónapot fedi (1-jétől a hónap végéig).'
    : `Egy igazolólap minden hónap ${n}. napjától a következő hónap ${n - 1}. napjáig tart `
      + '(a lap annak a hónapnak a nevét viseli, amelyikben kezdődik). Ha a cégnek van '
      + 'nyitott, kitöltött lapja, a fordulónap csak annak lezárása után változtatható.'
}

function ContractForm({
  contract, onBezar, onKesz,
}: {
  contract: ContractRow | null
  onBezar: () => void
  onKesz: () => void
}) {
  const { data } = useApp()
  const katalogus = useCatalog()
  const [cegAblak, cegEgyeztet] = useCegEgyeztetes()
  const [ceg, setCeg] = useState<CegErtek>(
    contract ? { id: contract.company_id, nev: contract.company_name ?? contract.customer_name } : URES_CEG)
  const [adoszam, setAdoszam] = useState(contract?.tax_number ?? '')
  const [hozomViszem, setHozomViszem] = useState(contract?.pickup_delivery ?? false)
  const [fuvardij, setFuvardij] = useState(
    contract?.pickup_delivery_fee_huf != null ? String(contract.pickup_delivery_fee_huf) : '')
  const [lejarat, setLejarat] = useState(contract?.valid_until?.slice(0, 10) ?? '')
  const [fordulo, setFordulo] = useState(contract?.cycle_day ?? 1)
  const [flottas, setFlottas] = useState(contract?.fleet_cars ?? false)
  const [arak, setArak] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (contract?.prices ?? []).map((p) => [arKulcs(p.package_id, p.size, p.kind), String(p.price_huf)]),
    ),
  )
  const [csomagok, setCsomagok] = useState<string[]>(() =>
    [...new Set((contract?.prices ?? []).map((p) => p.package_id))])
  const [ment, setMent] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [nettoMod, setNettoMod] = useState(nettoModOlvas)
  const mentRef = useRef(false)

  function modValt(netto: boolean) {
    setNettoMod(netto)
    nettoModMent(netto)
  }

  const mezoErtek = (brutto: string | undefined) =>
    !brutto ? '' : nettoMod ? String(nettobol(Number(brutto))) : brutto
  const beirt = (szoveg: string) =>
    szoveg === '' ? '' : nettoMod ? String(bruttobol(Number(szoveg))) : szoveg
  const masikAr = (brutto: number) =>
    nettoMod ? `bruttó ${ft(brutto)}` : `nettó ${ft(nettobol(brutto))}`

  const aktivCsomagok = katalogus.packages.filter((p) => p.active)

  function csomagBillent(id: string) {
    setCsomagok((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  }

  const valasztott = aktivCsomagok.filter((p) => csomagok.includes(p.id))

  async function mentes() {
    if (!ceg.nev.trim() || mentRef.current) return
    mentRef.current = true
    setHiba(null)
    let c = ceg
    try {
      const e = await cegEgyeztet(ceg)
      if (e === null) { mentRef.current = false; return }
      c = e
      setCeg(e)
    } catch (e) {
      setHiba(hibaSzoveg(e))
      mentRef.current = false
      return
    }

    setMent(true)
    try {
      const id = await data.saveContract({
        id: contract?.id ?? null,
        company_id: c.id,
        company_name: c.id ? null : c.nev.trim(),
        tax_number: adoszam.trim() || null,
        pickup_delivery: hozomViszem,
        pickup_delivery_fee_huf: hozomViszem && fuvardij.trim() !== ''
          ? Number(fuvardij) : null,
        valid_until: lejarat || null,
        notes: contract?.notes ?? null,
        cycle_day: fordulo,
        prices: csomagok.flatMap((pid) => MERETEK.flatMap((m) => FAJTAK.map((f) => ({
          package_id: pid, size: m, kind: f,
          price_huf: Number(arak[arKulcs(pid, m, f)]) || 0,
        })))).filter((x) => x.price_huf > 0),
      })
      if (flottas !== (contract?.fleet_cars ?? false)) await data.setContractFleet(id, flottas)
      onKesz()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      mentRef.current = false
      setMent(false)
    }
  }

  return (
    <div className="fedo" role="presentation">
      <div className="lap" role="dialog" aria-modal="true" aria-label="Szerződés">
        <div className="lap-fej">
          <h2>{contract ? 'Szerződés módosítása' : 'Új szerződés'}</h2>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          <div className="armod-sor">
            <span className="halk">Árak megadása:</span>
            <KetallasuCsuszka bal="Bruttó" jobb="Nettó" jobbra={nettoMod}
                              cimke="Nettó árak megadása" onValt={modValt} />
            <small className="halk">
              {nettoMod
                ? 'Nettó árakat írsz be; alattuk a bruttó (+27% ÁFA).'
                : 'Bruttó árakat írsz be; alattuk a nettó.'}
            </small>
          </div>

          <div className="szakasz">
            <div className="fej">Cég</div>
            {contract ? (
              <div className="talalat"><strong>{ceg.nev}</strong></div>
            ) : (
              <CegValaszto inputId="szerz-ceg" ertek={ceg}
                           onValt={(uj) => setCeg(uj)} />
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
                <label htmlFor="lej">Szerződés vége</label>
                <input id="lej" className="beviteli" type="date" value={lejarat}
                       onChange={(e) => setLejarat(e.target.value)} />
                <small>Üresen hagyva határozatlan.</small>
              </div>
            </div>
            <div className="mezo">
              <label htmlFor="fordulo">Igazolólap fordulónapja</label>
              <select id="fordulo" className="beviteli" value={fordulo}
                      onChange={(e) => setFordulo(Number(e.target.value))}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '1. (naptári hónap)' : `${n}.`}
                  </option>
                ))}
              </select>
              <small>{fordulonapSzoveg(fordulo)}</small>
            </div>

            <div className="mezo">
              <span className="csuszka-sor">
                <span>Flottás autók</span>
                <Csuszka be={flottas} cimke="Flottás autók" onValt={setFlottas} />
              </span>
              <small>
                Bekapcsolva az új időpontnál a cég mellett megjelenik az „Autó
                hozzáadása" gomb: több autó vehető fel egyszerre, rendszám nélkül is
                (pl. „Raiffeisen 4 darab"), egy végső időponttal. A rendszámok utólag
                írhatók be.
              </small>
            </div>

            <label className="jelolo" data-aktiv={hozomViszem}>
              <input type="checkbox" checked={hozomViszem}
                     onChange={(e) => setHozomViszem(e.target.checked)} />
              <span>Hozom-viszem szolgáltatás jár</span>
            </label>

            {hozomViszem && (
              <div className="mezo">
                <span>Fuvar ára alkalmanként ({nettoMod ? 'nettó' : 'bruttó'})</span>
                <input className="beviteli" type="number" inputMode="numeric" min={0}
                       aria-label="Fuvar ára alkalmanként"
                       value={mezoErtek(fuvardij)} placeholder={nettoMod ? 'pl. 3150' : 'pl. 4000'}
                       onChange={(e) => setFuvardij(beirt(e.target.value))} />
                {Number(fuvardij) > 0 && <small className="halk">{masikAr(Number(fuvardij))}</small>}
                <small>
                  A munka árán FELÜL, egy útra. Üresen hagyva nincs külön
                  megállapodva.
                </small>
              </div>
            )}
          </div>

          <div className="szakasz">
            <div className="fej">Melyik csomagokra szól?</div>
            <div className="valaszto">
              {aktivCsomagok.map((p) => (
                <button key={p.id} type="button" aria-pressed={csomagok.includes(p.id)}
                        onClick={() => csomagBillent(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
            <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>
              {nettoMod ? 'Nettó árak.' : 'Bruttó árak.'} <strong>Céges</strong>: a cég autói. <strong>Magán</strong>: a cég
              dolgozóinak saját autója (a foglalásnál „Saját"). Amit üresen hagysz, arra
              nincs megállapodás — az listaáron megy.
            </p>

            {valasztott.map((p) => (
              <div className="szerz-csomag" key={p.id}>
                <div className="szerz-csomag-cim">{p.name}</div>
                <div className="szerz-racs">
                  <span />
                  {MERETEK.map((m) => <span key={m} className="oszlopcim">{SIZE_LABEL[m]}</span>)}
                  {FAJTAK.map((f) => [
                    <span key={f} className="sorcim">{KIND_LABEL[f]}</span>,
                    ...MERETEK.map((m) => {
                      const kulcs = arKulcs(p.id, m, f)
                      const brutto = Number(arak[kulcs]) || 0
                      return (
                        <span key={kulcs} className="szerz-mezo">
                          <input className="beviteli szam" type="number" inputMode="numeric"
                                 step={nettoMod ? 100 : 500} min={0}
                                 aria-label={`${p.name} · ${SIZE_LABEL[m]} · ${KIND_LABEL[f]} ár`}
                                 value={mezoErtek(arak[kulcs])}
                                 onChange={(e) => {
                                   const v = beirt(e.target.value)
                                   setArak((a) => ({ ...a, [kulcs]: v }))
                                 }} />
                          {brutto > 0 && <small className="halk">{masikAr(brutto)}</small>}
                        </span>
                      )
                    }),
                  ])}
                </div>
              </div>
            ))}
            {valasztott.length === 0 && (
              <div className="ures">Válaszd ki fent, melyik csomagokra szól a szerződés.</div>
            )}
          </div>

          {hiba && <div className="hibauzenet">{hiba}</div>}
        </div>

        <div className="lap-lab">
          <div className="gombok" style={{ marginLeft: 0, width: '100%' }}>
            <button className="btn" onClick={onBezar} disabled={ment}>Mégse</button>
            <button className="btn btn-fo" onClick={() => void mentes()}
                    disabled={!ceg.nev.trim() || ment} style={{ marginLeft: 'auto' }}>
              {ment ? 'Mentés…' : 'Mentés'}
            </button>
          </div>
        </div>
      </div>
      {cegAblak}
    </div>
  )
}

function BerletKartya({ cim, maradt, osszes, lejart, children }: {
  cim: string
  maradt: number
  osszes: number
  lejart: boolean
  children: React.ReactNode
}) {
  const [nyitva, setNyitva] = useState(false)
  return (
    <div className="panel" data-lejart={lejart} data-nyitva={nyitva}>
      <KartyaFej nyitva={nyitva} onValt={() => setNyitva(!nyitva)}>
        {cim}
      </KartyaFej>
      <div className="panel-torzs">
        <div className="adatsor">
          <span>Hátralévő</span>
          <span className="ertek szam">
            {maradt}/{osszes}
            {lejart && <span style={{ color: 'var(--v-baj)' }}> · lejárt</span>}
          </span>
        </div>
        {nyitva && children}
      </div>
    </div>
  )
}

function CegKartya({ cim, cegId, kiemelt, nev, hozomViszem, arDb, autok, children }: {
  cim: string
  kiemelt?: boolean
  cegId: string | null
  nev: string
  hozomViszem: boolean
  arDb: number
  autok: number
  children: React.ReactNode
}) {
  const [nyitva, setNyitva] = useState(kiemelt === true)
  const doboz = useRef<HTMLDivElement>(null)
  const [villan, setVillan] = useState(kiemelt === true)
  useEffect(() => {
    if (!kiemelt) return
    doboz.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = window.setTimeout(() => setVillan(false), 2500)
    return () => window.clearTimeout(t)
  }, [kiemelt])
  const [lapNyitva, setLapNyitva] = useState(false)
  return (
    <div className="panel" data-nyitva={nyitva} data-kiemelt={villan || undefined} ref={doboz}>
      <KartyaFej nyitva={nyitva} onValt={() => setNyitva(!nyitva)}>
        {cim}
      </KartyaFej>
      <div className="panel-torzs">
        {cegId && (
          <div className="ceg-lap-sor">
            <button className="btn" onClick={() => setLapNyitva(true)}>Igazolólap</button>
            <span className="halk">havi lap, beállítás, Word letöltés</span>
          </div>
        )}
        {lapNyitva && cegId && (
          <IgazoloLap cegId={cegId} cegNev={cim} onBezar={() => setLapNyitva(false)} />
        )}
        {cim !== nev && (
          <div className="adatsor">
            <span>Kapcsolattartó</span><span className="ertek">{nev}</span>
          </div>
        )}
        <div className="adatsor">
          <span>Hozom-viszem</span>
          <span className="ertek">{hozomViszem ? 'igen' : 'nem'}</span>
        </div>
        <div className="adatsor">
          <span>Autók</span>
          <span className="ertek szam">{autok}</span>
        </div>
        {!nyitva && (
          <div className="adatsor">
            <span>Egyedi ár</span>
            <span className="ertek szam">{arDb}</span>
          </div>
        )}
        {nyitva && children}
      </div>
    </div>
  )
}
