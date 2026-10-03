import { useCallback, useEffect, useMemo, useState } from 'react'

import { useApp, useCatalog } from '../../state/AppContext'
import { ft } from '../../lib/format'
import {
  CATEGORY_SHORT, KIND_LABEL, SIZE_LABEL,
  type ContractKind, type ContractRow, type ContractSize,
  type PassBalanceRow, type SearchHit, type ValidityKind, type VehicleCategory,
} from '../../lib/types'
import KartyaFej from '../common/KartyaFej'
import { useKerdes } from '../common/Kerdes'
import { CegValaszto, URES_CEG, useCegEgyeztetes, type CegErtek } from '../common/Ceg'
import SzerzodesArak, { AFA, FAJTAK, MERETEK } from './SzerzodesArak'

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
  const { data, user } = useApp()
  // Ugyanaz a kapcsoló, mint az Ügyfelek képernyőn: itt is törzsadatról van
  // szó, csak a megállapodás oldaláról. Az alkalmazott a bérletet HASZNÁLJA
  // (az alkalom levonása a foglalás lezárásának a része) — kiadni és
  // kivezetni nem tudja. Az adatbázis is így tartja be: create_pass,
  // save_contract, deactivate_pass.
  const szerkesztheto = user?.canEditCustomers === true
  const [ful, setFul] = useState<'berletek' | 'cegek'>('berletek')
  const [passes, setPasses] = useState<PassBalanceRow[]>([])
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [tolt, setTolt] = useState(true)
  const [hiba, setHiba] = useState<string | null>(null)
  const [ujBerlet, setUjBerlet] = useState(false)
  const [szerkContract, setSzerkContract] = useState<ContractRow | 'uj' | null>(null)
  const [kerdesAblak, kerdez] = useKerdes()

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
                                await data.deactivatePass(fej.pass_id)
                                await ujra()
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

                  {c.valid_until && (
                    <div className="adatsor">
                      <span>Szerződés vége</span>
                      <span className="ertek">{c.valid_until.slice(0, 10)}</span>
                    </div>
                  )}

                  {/* Bruttó árak, alattuk halványan a nettó: a cégekkel
                      nettóban egyeznek meg, a pultnál bruttót mondunk. */}
                  <div style={{ marginTop: 'var(--t3)' }}>
                    <SzerzodesArak prices={c.prices} netto />
                  </div>

                  {szerkesztheto && (
                    <button className="btn btn-kicsi" style={{ marginTop: 'var(--t3)' }}
                            onClick={() => setSzerkContract(c)}>
                      Szerkesztés
                    </button>
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
//
//  A szerződés a CÉGÉ, nem egy ügyfélé: a cég bármelyik sofőrje hozza az
//  autót, ugyanaz az ár jár. A cég ugyanazzal a keresővel választható, mint
//  az új időpontnál — és ha új név, mentés előtt itt is összeveti a
//  meglévőkkel („Erre a cégre gondoltál?").
//
//  Az árak csomagonként:
//
//                 Normál méret   Nagy méret
//      Céges      [        ]     [        ]   ← a cég autói (Flotta)
//      Magán      [        ]     [        ]   ← a dolgozók saját autója
//
//  Előbb ki kell választani, melyik csomagokra szól (Start, Premium, Elit) —
//  csak azoknál jelennek meg a mezők. Amit üresen hagysz, arra nincs
//  megállapodás: az listaáron megy.

/** Egy ár kulcsa az űrlapban: csomag + méret + fajta. */
const arKulcs = (pk: string, m: ContractSize, f: ContractKind) => `${pk}_${m}_${f}`

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
  const [arak, setArak] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (contract?.prices ?? []).map((p) => [arKulcs(p.package_id, p.size, p.kind), String(p.price_huf)]),
    ),
  )
  // Melyik csomagokra szól. Szerkesztéskor azok, amelyekre már van ár.
  const [csomagok, setCsomagok] = useState<string[]>(() =>
    [...new Set((contract?.prices ?? []).map((p) => p.package_id))])
  const [ment, setMent] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  const aktivCsomagok = katalogus.packages.filter((p) => p.active)

  function csomagBillent(id: string) {
    setCsomagok((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  }

  // A kiválasztott csomagok a katalógus sorrendjében (Start, Premium, Elit).
  const valasztott = aktivCsomagok.filter((p) => csomagok.includes(p.id))

  async function mentes() {
    if (!ceg.nev.trim() || ment) return
    setHiba(null)
    // Új cégnév: előbb összevetjük a meglévőkkel (azonos → ahhoz kötjük,
    // hasonló → megkérdezzük). Szerkesztésnél a cég már adott.
    let c = ceg
    try {
      const e = await cegEgyeztet(ceg)
      if (e === null) return
      c = e
      setCeg(e)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      return
    }

    setMent(true)
    try {
      await data.saveContract({
        id: contract?.id ?? null,
        company_id: c.id,
        company_name: c.id ? null : c.nev.trim(),
        tax_number: adoszam.trim() || null,
        pickup_delivery: hozomViszem,
        pickup_delivery_fee_huf: hozomViszem && fuvardij.trim() !== ''
          ? Number(fuvardij) : null,
        valid_until: lejarat || null,
        notes: contract?.notes ?? null,
        // Csak a kiválasztott csomagok árai mennek: ha egy csomagot
        // kivettél, az árai is törlődnek.
        prices: valasztott.flatMap((p) => MERETEK.flatMap((m) => FAJTAK.map((f) => ({
          package_id: p.id, size: m, kind: f,
          price_huf: Number(arak[arKulcs(p.id, m, f)]) || 0,
        })))).filter((x) => x.price_huf > 0),
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
            {contract ? (
              <div className="talalat"><strong>{ceg.nev}</strong></div>
            ) : (
              <CegValaszto inputId="szerz-ceg" ertek={ceg}
                           onValt={(uj) => setCeg(uj)} />
            )}
          </div>

          <div className="szakasz">
            {/* Telefonon egymás alatt: a dátummező a böngészőben nem megy a
                saját legkisebb szélessége alá, és két oszlopban kilógott a
                képernyő jobb szélén. */}
            <div className="sor-2 szerz-adatok">
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
            <label className="jelolo" data-aktiv={hozomViszem}>
              <input type="checkbox" checked={hozomViszem}
                     onChange={(e) => setHozomViszem(e.target.checked)} />
              <span>Hozom-viszem szolgáltatás jár</span>
            </label>

            {/* A fuvar ára KÜLÖN mező, nem a csomagárba építve: nem minden
                autóért kell elmenni. Hogy melyik foglalásnál számít, azt a
                foglalás típusa mondja meg (Hozom-viszem), nem ez a mező. */}
            {hozomViszem && (
              <div className="mezo">
                <span>Fuvar ára alkalmanként</span>
                <input className="beviteli" type="number" inputMode="numeric" min={0}
                       value={fuvardij} placeholder="pl. 4000"
                       onChange={(e) => setFuvardij(e.target.value)} />
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
              Bruttó árak. <strong>Céges</strong>: a cég autói. <strong>Magán</strong>: a cég
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
                                 step={500} min={0}
                                 aria-label={`${p.name} · ${SIZE_LABEL[m]} · ${KIND_LABEL[f]} ár`}
                                 value={arak[kulcs] ?? ''}
                                 onChange={(e) => setArak((a) => ({ ...a, [kulcs]: e.target.value }))} />
                          {brutto > 0 && (
                            <small className="halk">nettó {ft(Math.round(brutto / (1 + AFA)))}</small>
                          )}
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

// ---------------------------------------------------------------------------
//  Kártyák — csukva a lényeg, nyitva a részletek
//
//  Ugyanaz az elrendezés, mint az Ügyfelek menüpontban: hat kártya fér egy
//  sorba, és csak az van kint, amivel keresni szoktak. Egy bérletnél ez az,
//  hogy kié és hány alkalom van még rajta; egy szerződésnél az, hogy melyik
//  cég és van-e hozom-viszem. A tételek és az árak egy kattintásra vannak.
// ---------------------------------------------------------------------------

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

function CegKartya({ cim, nev, hozomViszem, arDb, autok, children }: {
  cim: string
  nev: string
  hozomViszem: boolean
  arDb: number
  autok: number
  children: React.ReactNode
}) {
  const [nyitva, setNyitva] = useState(false)
  return (
    <div className="panel" data-nyitva={nyitva}>
      <KartyaFej nyitva={nyitva} onValt={() => setNyitva(!nyitva)}>
        {cim}
      </KartyaFej>
      <div className="panel-torzs">
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
