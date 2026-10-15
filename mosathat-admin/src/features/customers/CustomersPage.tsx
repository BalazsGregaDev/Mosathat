import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, hibaSzoveg } from '../../lib/format'
import {
  BILLING_LABEL, CATEGORY_LABEL, CATEGORY_SHORT, KATEGORIAK, KIND_LABEL,
  type CompanySummary, type CustomerSummary, type VehicleSummary,
} from '../../lib/types'
import Szerkesztheto, { type Valaszthato } from '../common/Szerkesztheto'
import { urlapMegnyilt } from '../../lib/kepernyo'
import KartyaFej from '../common/KartyaFej'
import Ablak from '../common/Ablak'
import IgazoloLap from '../igazolo/IgazoloLap'

type Nezet = 'jarmu' | 'ugyfel' | 'ceg'

const MERET_VALASZTO: Valaszthato[] = KATEGORIAK.map((v) => ({ ertek: v, cimke: CATEGORY_LABEL[v] }))

const TIPUSOK: Valaszthato[] = [
  { ertek: 'MAGAN', cimke: 'Magánszemély' },
  { ertek: 'CEG', cimke: 'Cég' },
]

export default function CustomersPage() {
  const { data, user } = useApp()
  const szerkesztheto = user?.canEditCustomers === true
  const [nezet, setNezet] = useState<Nezet>('jarmu')
  const [q, setQ] = useState('')
  const [ugyfelek, setUgyfelek] = useState<CustomerSummary[]>([])
  const [jarmuvek, setJarmuvek] = useState<VehicleSummary[]>([])
  const [cegek, setCegek] = useState<CompanySummary[]>([])
  const [tolt, setTolt] = useState(true)
  const [hiba, setHiba] = useState<string | null>(null)
  const [ujUgyfel, setUjUgyfel] = useState(false)

  const kerSzam = useRef(0)
  const betolt = useCallback(async (keres: string) => {
    const n = ++kerSzam.current
    try {
      if (nezet === 'ugyfel') {
        const r = await data.listCustomers(keres)
        if (n === kerSzam.current) setUgyfelek(r)
      } else if (nezet === 'ceg') {
        const r = await data.listCompanies(keres)
        if (n === kerSzam.current) setCegek(r)
      } else {
        const r = await data.listVehicles(keres)
        if (n === kerSzam.current) setJarmuvek(r)
      }
      if (n === kerSzam.current) setHiba(null)
    } catch (e) {
      if (n === kerSzam.current) setHiba(hibaSzoveg(e))
    } finally {
      if (n === kerSzam.current) setTolt(false)
    }
  }, [data, nezet])

  const azonnal = useRef(true)
  useEffect(() => {
    const kesleltetes = azonnal.current ? 0 : 250
    azonnal.current = false
    const t = window.setTimeout(() => void betolt(q), kesleltetes)
    return () => window.clearTimeout(t)
  }, [q, betolt])

  function fulValt(uj: Nezet) {
    if (uj === nezet) return
    azonnal.current = true
    setTolt(true)
    setNezet(uj)
  }

  const ujra = () => void betolt(q)

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Ügyfelek</h2>
        <div className="fulek">
          <button className={nezet === 'jarmu' ? 'aktiv' : ''} onClick={() => fulValt('jarmu')}>
            Jármű szerint
          </button>
          <button className={nezet === 'ugyfel' ? 'aktiv' : ''} onClick={() => fulValt('ugyfel')}>
            Ügyfél szerint
          </button>
          <button className={nezet === 'ceg' ? 'aktiv' : ''} onClick={() => fulValt('ceg')}>
            Cég szerint
          </button>
        </div>
        {szerkesztheto && (
          <button className="btn btn-fo" style={{ marginLeft: 'auto' }}
                  onClick={() => setUjUgyfel(true)}>
            + Ügyfél hozzáadása
          </button>
        )}
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

      {!tolt && nezet === 'jarmu' && jarmuvek.length > 0 && (
        <p className="halk" style={{ fontSize: 'var(--m-xs)', marginBottom: 'var(--t3)' }}>
          Kattints bármelyik adatra az átíráshoz. Ha a méretet írod át, az adott
          autó még le nem zárt foglalásain az ár és az idő automatikusan
          újraszámolódik.
        </p>
      )}

      {!tolt && nezet === 'jarmu' && (
        <div className="panelek panelek-ugyfel">
          {jarmuvek.map((v) => (
            <JarmuKartya key={v.id} v={v} onValtozas={ujra} szerkesztheto={szerkesztheto} />
          ))}
          {jarmuvek.length === 0 && (
            <div className="panel"><div className="ures">Nincs találat.</div></div>
          )}
        </div>
      )}

      {!tolt && nezet === 'ugyfel' && (
        <div className="panelek panelek-ugyfel">
          {ugyfelek.map((c) => (
            <UgyfelKartya key={c.id} c={c} onValtozas={ujra} szerkesztheto={szerkesztheto} />
          ))}
          {ugyfelek.length === 0 && (
            <div className="panel"><div className="ures">Nincs találat.</div></div>
          )}
        </div>
      )}

      {!tolt && nezet === 'ceg' && (
        <div className="panelek panelek-ugyfel">
          {cegek.map((c) => <CegKartya key={c.id} c={c} />)}
          {cegek.length === 0 && (
            <div className="panel"><div className="ures">Nincs találat.</div></div>
          )}
        </div>
      )}

      {ujUgyfel && (
        <UjUgyfel
          onBezar={() => setUjUgyfel(false)}
          onKesz={() => { setUjUgyfel(false); void betolt(q) }}
        />
      )}
    </div>
  )
}

function UjUgyfel({ onBezar, onKesz }: { onBezar: () => void; onKesz: () => void }) {
  const { data } = useApp()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [tipus, setTipus] = useState('MAGAN')
  const [ceg, setCeg] = useState('')
  const [adoszam, setAdoszam] = useState('')
  const [notes, setNotes] = useState('')
  const [plate, setPlate] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [category, setCategory] = useState('SZEMELYAUTO')
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [ismetles, setIsmetles] = useState(false)
  const nevMezo = useRef<HTMLInputElement>(null)
  const felvett = useRef<string | null>(null)
  useEffect(() => { urlapMegnyilt(nevMezo.current) }, [])

  const bezar = () => (felvett.current ? onKesz() : onBezar())
  const piszkos = Boolean(name || phone || email || ceg || adoszam || notes || plate || brand || model)

  async function ment(megis = false) {
    if (!name.trim() || !phone.trim() || megy) return
    setMegy(true)
    setHiba(null)
    try {
      const id = felvett.current ?? await data.addCustomer({
        name, phone, email, notes, megis,
        type: tipus,
        company_name: tipus === 'CEG' ? ceg : '',
        tax_number: tipus === 'CEG' ? adoszam : '',
      })
      felvett.current = id
      if (plate.trim()) {
        try {
          await data.addVehicle({ customer_id: id, plate_raw: plate, brand, model, category })
        } catch (e) {
          setHiba(`Az ügyfél felvéve, de az autó nem: ${hibaSzoveg(e)}. Javítsd, vagy töröld a rendszámot, és nyomd meg újra a gombot.`)
          setMegy(false)
          return
        }
      }
      onKesz()
    } catch (e) {
      const uzenet = hibaSzoveg(e)
      setHiba(uzenet)
      setIsmetles(uzenet.includes('telefonszámmal már van ügyfél'))
      setMegy(false)
    }
  }

  const keszEnged = name.trim().length > 0 && phone.trim().length > 0

  return (
    <Ablak cimke="Ügyfél hozzáadása"
           onEsc={() => { if (!megy) bezar() }}
           onHatter={() => { if (!piszkos && !megy) bezar() }}>
      <div className="lap">
        <div className="lap-fej">
          <h2>Ügyfél hozzáadása</h2>
          <button className="bezar" onClick={bezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          {hiba && (
            <div className="hibauzenet">
              {hiba}
              {ismetles && (
                <div style={{ marginTop: 'var(--t3)' }}>
                  <button className="btn btn-kicsi" disabled={megy}
                          onClick={() => void ment(true)}>
                    Mégis felveszem
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="mezo-sor">
            <label className="mezo">
              <span>Név</span>
              <input ref={nevMezo} className="beviteli" value={name} disabled={megy}
                     onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="mezo">
              <span>Telefonszám</span>
              <input className="beviteli" type="tel" inputMode="tel" value={phone} disabled={megy}
                     onChange={(e) => { setPhone(e.target.value); setIsmetles(false) }} />
              <small>Ezen találod meg később. A +36-os és a 06-os alak ugyanaz.</small>
            </label>
          </div>

          <label className="mezo">
            <span>E-mail cím</span>
            <input className="beviteli" type="email" inputMode="email" value={email} disabled={megy}
                   onChange={(e) => setEmail(e.target.value)} />
            <small>Nem kötelező. Enélkül nem tudunk visszaigazolást küldeni.</small>
          </label>

          <div className="mezo">
            <span className="cimke">Típus</span>
            <div className="ertek-gombok" style={{ justifyContent: 'flex-start' }}>
              {TIPUSOK.map((t) => (
                <button key={t.ertek} type="button" disabled={megy}
                        className={t.ertek === tipus ? 'aktiv' : ''}
                        aria-pressed={t.ertek === tipus}
                        onClick={() => setTipus(t.ertek)}>
                  {t.cimke}
                </button>
              ))}
            </div>
          </div>

          {tipus === 'CEG' && (
            <div className="mezo-sor">
              <label className="mezo">
                <span>Cégnév</span>
                <input className="beviteli" value={ceg} disabled={megy}
                       onChange={(e) => setCeg(e.target.value)} />
              </label>
              <label className="mezo">
                <span>Adószám</span>
                <input className="beviteli" value={adoszam} disabled={megy}
                       onChange={(e) => setAdoszam(e.target.value)} />
              </label>
            </div>
          )}

          <label className="mezo">
            <span>Megjegyzés</span>
            <textarea className="beviteli" rows={2} value={notes} disabled={megy}
                      onChange={(e) => setNotes(e.target.value)} />
          </label>

          <div className="valaszto-vonal-vekony" />
          <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>
            Az autója mindjárt felvehető. Ha most nincs kéznél, hagyd üresen — a
            kártyáján később egy kattintás.
          </p>

          <div className="mezo-sor">
            <label className="mezo">
              <span>Rendszám</span>
              <input className="beviteli beviteli-rendszam" value={plate} disabled={megy}
                     onChange={(e) => setPlate(e.target.value)} />
            </label>
            <label className="mezo">
              <span>Márka</span>
              <input className="beviteli" value={brand} disabled={megy}
                     onChange={(e) => setBrand(e.target.value)} />
            </label>
            <label className="mezo">
              <span>Modell</span>
              <input className="beviteli" value={model} disabled={megy}
                     onChange={(e) => setModel(e.target.value)} />
            </label>
          </div>

          {plate.trim() !== '' && (
            <div className="mezo">
              <span className="cimke">Méret</span>
              <div className="ertek-gombok" style={{ justifyContent: 'flex-start' }}>
                {MERET_VALASZTO.map((k) => (
                  <button key={k.ertek} type="button" disabled={megy}
                          className={k.ertek === category ? 'aktiv' : ''}
                          aria-pressed={k.ertek === category}
                          onClick={() => setCategory(k.ertek)}>
                    {k.cimke}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="lap-lab">
            <div className="gombok">
              <button className="btn" onClick={bezar} disabled={megy}>Mégse</button>
              <button className="btn btn-fo" disabled={!keszEnged || megy}
                      onClick={() => void ment()}>
                {megy ? 'Felvétel…' : 'Felvétel'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Ablak>
  )
}

function JarmuKartya({ v, onValtozas, szerkesztheto }: {
  v: VehicleSummary; onValtozas: () => void; szerkesztheto: boolean
}) {
  const { data } = useApp()
  const [nyitva, setNyitva] = useState(false)
  const [ujAuto, setUjAuto] = useState(false)
  const ment = async (patch: Record<string, unknown>) => {
    await data.saveVehicle({ id: v.id, ...patch })
    onValtozas()
  }
  const ugyfel = async (patch: Record<string, unknown>) => {
    await data.saveCustomer({ id: v.customer_id, ...patch })
    onValtozas()
  }

  return (
    <div className="panel" data-nyitva={nyitva}>
      <KartyaFej nyitva={nyitva} onValt={() => setNyitva(!nyitva)}>
        <span className="rendszam">{v.plate_raw}</span>
        {v.billing_kind !== 'NORMAL' && (
          <span className="cimke-pill billing" data-b={v.billing_kind}>
            {BILLING_LABEL[v.billing_kind]}
          </span>
        )}
      </KartyaFej>
      <div className="panel-torzs">
        <Szerkesztheto zarolt={!szerkesztheto} cimke="Tulajdonos" ertek={v.customer_name}
                       onMent={(x) => ugyfel({ name: x })} />
        <Szerkesztheto zarolt={!szerkesztheto} cimke="Telefon" ertek={v.customer_phone} tipus="telefon"
                       onMent={(x) => ugyfel({ phone: x })} />
        {v.company_name && (
          <Szerkesztheto zarolt={!szerkesztheto} cimke="Cégnév" ertek={v.company_name}
                         onMent={(x) => ugyfel({ company_name: x })}
                         utotag={v.szerzodes && (
                           <span className="cimke-pill szerzodes-pill">
                             szerződés{v.contract_kind ? ` · ${KIND_LABEL[v.contract_kind]}` : ''}
                           </span>
                         )} />
        )}

        {nyitva && (
          <>
            <div className="valaszto-vonal-vekony" />

            <Szerkesztheto zarolt={!szerkesztheto} cimke="Rendszám" ertek={v.plate_raw} tipus="rendszam"
                           onMent={(x) => ment({ plate_raw: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Márka" ertek={v.brand} ures="nincs megadva"
                           onMent={(x) => ment({ brand: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Modell" ertek={v.model} ures="nincs megadva"
                           onMent={(x) => ment({ model: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Méret" ertek={v.category} valaszthato={MERET_VALASZTO}
                           onMent={(x) => ment({ category: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Megjegyzés" ertek={v.notes} sor={2} ures="nincs"
                           onMent={(x) => ment({ notes: x })} />

            {!v.company_name && (
              <Szerkesztheto zarolt={!szerkesztheto} cimke="Cégnév" ertek="" ures="nincs"
                             onMent={(x) => ugyfel({ company_name: x })} />
            )}

            <div className="adatsor">
              <span>Munkák</span>
              <span className="ertek szam">{v.latogatas}</span>
            </div>
            <div className="adatsor">
              <span>Utoljára</span>
              <span className="ertek">
                {v.utolso ? (
                  <>
                    <span className="szam">{v.utolso.slice(0, 10)}</span>
                    {v.utolso_csomag && <span className="halk"> · {v.utolso_csomag}</span>}
                  </>
                ) : (
                  <span className="halvany">még nem járt itt</span>
                )}
              </span>
            </div>

            {szerkesztheto && (
              ujAuto ? (
                <UjJarmu
                  customerId={v.customer_id}
                  kinek={v.customer_name}
                  onKesz={() => { setUjAuto(false); onValtozas() }}
                  onMegse={() => setUjAuto(false)}
                />
              ) : (
                <button className="btn btn-kicsi" style={{ marginTop: 'var(--t3)' }}
                        onClick={() => setUjAuto(true)}>
                  + További jármű {v.customer_name.split(' ')[0]} nevére
                </button>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}

function UgyfelKartya({ c, onValtozas, szerkesztheto }: {
  c: CustomerSummary
  onValtozas: () => void
  szerkesztheto: boolean
}) {
  const { data } = useApp()
  const [reszletek, setReszletek] = useState(false)
  const [ujAuto, setUjAuto] = useState(false)
  const [revizio, setRevizio] = useState(0)
  const ment = async (patch: Record<string, unknown>) => {
    await data.saveCustomer({ id: c.id, ...patch })
    onValtozas()
  }

  return (
    <div className="panel" data-nyitva={reszletek}>
      <KartyaFej nyitva={reszletek} onValt={() => setReszletek(!reszletek)}>
        {c.company_name || c.name}
        {c.billing_kind !== 'NORMAL' && (
          <span className="cimke-pill billing" data-b={c.billing_kind}>
            {BILLING_LABEL[c.billing_kind]}
          </span>
        )}
      </KartyaFej>
      <div className="panel-torzs">
        <Szerkesztheto zarolt={!szerkesztheto} cimke="Név" ertek={c.name} onMent={(x) => ment({ name: x })} />
        <Szerkesztheto zarolt={!szerkesztheto} cimke="Telefon" ertek={c.phone} tipus="telefon"
                       onMent={(x) => ment({ phone: x })} />

        {!reszletek && (
          <div className="adatsor">
            <span>Járművei</span>
            <span className="ertek rendszamok">
              {c.rendszamok.length > 0 ? c.rendszamok.join(', ') : <span className="halvany">nincs</span>}
            </span>
          </div>
        )}

        {reszletek && (
          <>
            <Szerkesztheto zarolt={!szerkesztheto} cimke="E-mail" ertek={c.email} tipus="email" ures="nincs"
                           onMent={(x) => ment({ email: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Típus" ertek={c.type} valaszthato={TIPUSOK}
                           onMent={(x) => ment({ type: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Cégnév" ertek={c.company_name} ures="nincs"
                           onMent={(x) => ment({ company_name: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Megjegyzés" ertek={c.notes} sor={2} ures="nincs"
                           onMent={(x) => ment({ notes: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Belső jegyzet" ertek={c.internal_notes} sor={2} ures="nincs"
                           onMent={(x) => ment({ internal_notes: x })} />

            <div className="valaszto-vonal-vekony" />

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

        <div className="szakasz-cim">Járművei ({c.jarmuvek})</div>
        <UgyfelJarmuvei customerId={c.id} onValtozas={onValtozas}
                       revizio={revizio} szerkesztheto={szerkesztheto} />

        {szerkesztheto && !ujAuto && (
          <div className="sor-gombok" style={{ marginTop: 'var(--t3)' }}>
            <button className="btn btn-kicsi" onClick={() => setUjAuto(true)}>
              + További jármű
            </button>
          </div>
        )}

        {ujAuto && (
          <UjJarmu
            customerId={c.id}
            onKesz={() => {
              setUjAuto(false)
              setRevizio((n) => n + 1)
              onValtozas()
            }}
            onMegse={() => setUjAuto(false)}
          />
        )}
          </>
        )}
      </div>
    </div>
  )
}

function CegKartya({ c }: { c: CompanySummary }) {
  const [nyitva, setNyitva] = useState(false)
  const [lapNyitva, setLapNyitva] = useState(false)
  return (
    <div className="panel" data-nyitva={nyitva}>
      <KartyaFej nyitva={nyitva} onValt={() => setNyitva(!nyitva)}>
        {c.name}
        {c.szerzodes && <span className="cimke-pill szerzodes-pill">szerződés</span>}
        {c.berletes && <span className="cimke-pill szerzodes-pill">bérlet</span>}
      </KartyaFej>
      <div className="panel-torzs">
        <div className="adatsor">
          <span>Autók ({c.jarmuvek})</span>
          <span className="ertek rendszamok">
            {c.autok.length > 0
              ? c.autok.map((a) => a.plate_raw).join(', ')
              : <span className="halvany">nincs</span>}
          </span>
        </div>

        {c.lapos && (
          <div className="ceg-lap-sor">
            <button className="btn" onClick={() => setLapNyitva(true)}>Igazolólap</button>
            <span className="halk">havi lap: km, név, aláírás — Word letöltés</span>
          </div>
        )}
        {lapNyitva && (
          <IgazoloLap cegId={c.id} cegNev={c.name} onBezar={() => setLapNyitva(false)} />
        )}

        {nyitva && (
          <>
            {c.tax_number && (
              <div className="adatsor">
                <span>Adószám</span><span className="ertek">{c.tax_number}</span>
              </div>
            )}
            {c.szerzodes && (
              <div className="adatsor">
                <span>Szerződés</span>
                <span className="ertek">
                  {c.szerzodes_vege ? `${c.szerzodes_vege.slice(0, 10)}-ig` : 'határozatlan'}
                  {c.hozom_viszem && <span className="halk"> · hozom-viszem</span>}
                </span>
              </div>
            )}
            <div className="adatsor">
              <span>Sofőrök / kapcsolattartók</span>
              <span className="ertek szam">{c.ugyfelek}</span>
            </div>
            <div className="adatsor">
              <span>Munkák</span>
              <span className="ertek szam">
                {c.latogatas}
                {c.utolso && <span className="halk"> · utoljára {c.utolso.slice(0, 10)}</span>}
              </span>
            </div>

            <div className="szakasz-cim">Autók</div>
            <div className="ceg-autok">
              {c.autok.map((a) => (
                <div className="ceg-auto" key={a.id}>
                  <div className="ceg-auto-fej">
                    <span className="rendszam">{a.plate_raw}</span>
                    <span className="halk">
                      {[a.brand, a.model].filter(Boolean).join(' ')}
                      {(a.brand || a.model) ? ' · ' : ''}{CATEGORY_SHORT[a.category]}
                    </span>
                    {c.szerzodes && a.contract_kind && (
                      <span className="cimke-pill szerzodes-pill">{KIND_LABEL[a.contract_kind]}</span>
                    )}
                  </div>
                  <div className="ceg-auto-sofor">
                    {a.customer_name}
                    {a.customer_phone && a.customer_phone !== '—' && (
                      <> · <a href={`tel:${a.customer_phone}`} className="hivas">{a.customer_phone}</a></>
                    )}
                  </div>
                </div>
              ))}
              {c.autok.length === 0 && <div className="ures">Ennek a cégnek még nincs autója.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function UgyfelJarmuvei({ customerId, onValtozas, revizio, szerkesztheto }: {
  customerId: string
  onValtozas: () => void
  revizio: number
  szerkesztheto: boolean
}) {
  const { data } = useApp()
  const [sorok, setSorok] = useState<VehicleSummary[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [sajatRev, setSajatRev] = useState(0)

  useEffect(() => {
    let el = true
    data.listVehicles('')
      .then((v) => { if (el) { setSorok(v.filter((x) => x.customer_id === customerId)); setHiba(null) } })
      .catch((e) => { if (el) setHiba(hibaSzoveg(e)) })
    return () => { el = false }
  }, [data, customerId, revizio, sajatRev])

  const ment = async (id: string, patch: Record<string, unknown>) => {
    await data.saveVehicle({ id, ...patch })
    setSajatRev((n) => n + 1)
    onValtozas()
  }

  if (hiba && !sorok) return <div className="hibauzenet">{hiba}</div>
  if (!sorok) return <div className="betolt">Betöltés…</div>

  return (
    <div style={{ marginTop: 'var(--t3)' }}>
      {sorok.map((v) => (
        <div key={v.id} className="alkartya">
          <Szerkesztheto zarolt={!szerkesztheto} cimke="Rendszám" ertek={v.plate_raw} tipus="rendszam"
                         onMent={(x) => ment(v.id, { plate_raw: x })} />
          <Szerkesztheto zarolt={!szerkesztheto} cimke="Márka" ertek={v.brand} ures="nincs megadva"
                         onMent={(x) => ment(v.id, { brand: x })} />
          <Szerkesztheto zarolt={!szerkesztheto} cimke="Modell" ertek={v.model} ures="nincs megadva"
                         onMent={(x) => ment(v.id, { model: x })} />
          <Szerkesztheto zarolt={!szerkesztheto} cimke="Méret" ertek={v.category} valaszthato={MERET_VALASZTO}
                         onMent={(x) => ment(v.id, { category: x })} />
          <div className="adatsor">
            <span>Munkák</span>
            <span className="ertek szam">{v.latogatas} · {CATEGORY_SHORT[v.category]}</span>
          </div>
        </div>
      ))}
      {sorok.length === 0 && <div className="ures">Nincs járműve.</div>}

    </div>
  )
}

function UjJarmu({ customerId, kinek, onKesz, onMegse }: {
  customerId: string
  kinek?: string
  onKesz: () => void
  onMegse: () => void
}) {
  const { data } = useApp()
  const [plate, setPlate] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [category, setCategory] = useState('SZEMELYAUTO')
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const rendszamMezo = useRef<HTMLInputElement>(null)
  useEffect(() => { urlapMegnyilt(rendszamMezo.current) }, [])

  async function ment() {
    if (!plate.trim() || megy) return
    setMegy(true)
    setHiba(null)
    try {
      await data.addVehicle({
        customer_id: customerId, plate_raw: plate, brand, model, category,
      })
      onKesz()
    } catch (e) {
      setHiba(hibaSzoveg(e))
      setMegy(false)
    }
  }

  return (
    <div className="alkartya uj-jarmu">
      {kinek && <div className="uj-jarmu-fej">Új autó — {kinek}</div>}
      {hiba && <div className="hibauzenet">{hiba}</div>}

      <label className="mezo">
        <span>Rendszám</span>
        <input ref={rendszamMezo} className="beviteli beviteli-rendszam"
               value={plate} disabled={megy}
               onChange={(e) => setPlate(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') void ment() }} />
      </label>

      <div className="mezo-sor">
        <label className="mezo">
          <span>Márka</span>
          <input className="beviteli" value={brand} disabled={megy}
                 onChange={(e) => setBrand(e.target.value)} />
        </label>
        <label className="mezo">
          <span>Modell</span>
          <input className="beviteli" value={model} disabled={megy}
                 onChange={(e) => setModel(e.target.value)} />
        </label>
      </div>

      <div className="mezo">
        <span>Méret</span>
        <div className="ertek-gombok" style={{ justifyContent: 'flex-start' }}>
          {MERET_VALASZTO.map((k) => (
            <button key={k.ertek} type="button" disabled={megy}
                    className={k.ertek === category ? 'aktiv' : ''}
                    aria-pressed={k.ertek === category}
                    onClick={() => setCategory(k.ertek)}>
              {k.cimke}
            </button>
          ))}
        </div>
      </div>

      <div className="urlap-lab">
        <button className="btn btn-csendes btn-kicsi" onClick={onMegse} disabled={megy}>
          Mégse
        </button>
        <button className="btn btn-fo btn-kicsi" onClick={() => void ment()}
                disabled={!plate.trim() || megy}>
          {megy ? 'Mentés…' : 'Felvétel'}
        </button>
      </div>
    </div>
  )
}
