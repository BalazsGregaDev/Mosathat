import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft } from '../../lib/format'
import {
  BILLING_LABEL, CATEGORY_LABEL, CATEGORY_SHORT,
  type CustomerSummary, type VehicleSummary,
} from '../../lib/types'
import Szerkesztheto, { type Valaszthato } from '../common/Szerkesztheto'
import { urlapMegnyilt } from '../../lib/kepernyo'
import KartyaFej from '../common/KartyaFej'

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
//
//  Minden adat helyben szerkeszthető. Telefonszám, e-mail, cégnév és
//  rendszám folyamatosan változik; ha nincs hol átírni, az adat lassan
//  elavul, és pont attól lesz használhatatlan a rendszer.
// ---------------------------------------------------------------------------

type Nezet = 'jarmu' | 'ugyfel'

const KATEGORIAK: Valaszthato[] = (['SZEMELYAUTO', 'SUV', 'KISBUSZ'] as const)
  .map((v) => ({ ertek: v, cimke: CATEGORY_LABEL[v] }))

const TIPUSOK: Valaszthato[] = [
  { ertek: 'MAGAN', cimke: 'Magánszemély' },
  { ertek: 'CEG', cimke: 'Cég' },
]

export default function CustomersPage() {
  const { data, user } = useApp()
  // Ez a képernyő alapból OLVASHATÓ az alkalmazottnak, nem szerkeszthető: a
  // napi munkájához tartozó adatokat a foglalási ablakban írja át — ott az a
  // foglalásé, itt viszont a törzsadat, ami minden későbbi foglalásra hat.
  //
  // „Alapból", mert a Felhasználók képernyőn ez szerepkörre és fiókra
  // bekapcsolható — régi adatok feltöltésekor erre szükség van. A jogot nem
  // itt számoljuk ki: az adatbázis mondja meg, és ugyanaz a szabály őrzi a
  // mentést is (save_customer, save_vehicle, add_customer).
  const szerkesztheto = user?.canEditCustomers === true
  const [nezet, setNezet] = useState<Nezet>('jarmu')
  const [q, setQ] = useState('')
  const [ugyfelek, setUgyfelek] = useState<CustomerSummary[]>([])
  const [jarmuvek, setJarmuvek] = useState<VehicleSummary[]>([])
  const [tolt, setTolt] = useState(true)
  const [hiba, setHiba] = useState<string | null>(null)
  const [nyitott, setNyitott] = useState<string | null>(null)
  const [ujUgyfel, setUjUgyfel] = useState(false)

  // A „Betöltés…" csak az első alkalommal jelenik meg. Egy mentés utáni
  // újratöltésnél nem: olyankor a lista egy pillanatra eltűnne, a kártyák
  // újra létrejönnének — és a kinyitott kártya becsukódna az orrunk előtt,
  // pont amikor épp szerkesztjük. A lista helyben cserélődik.
  const betolt = useCallback(async (keres: string, elso = false) => {
    if (elso) setTolt(true)
    try {
      if (nezet === 'ugyfel') setUgyfelek(await data.listCustomers(keres))
      else setJarmuvek(await data.listVehicles(keres))
      setHiba(null)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      if (elso) setTolt(false)
    }
  }, [data, nezet])

  // Gépelés közben keres, 250 ms csend után. Az első betöltés (és a
  // nézetváltás) mutatja a „Betöltés…" feliratot, a többi nem.
  const voltMar = useRef(false)
  useEffect(() => {
    const t = window.setTimeout(() => {
      void betolt(q, !voltMar.current)
      voltMar.current = true
    }, 250)
    return () => window.clearTimeout(t)
  }, [q, betolt])

  // Nézetváltásnál más a lista, ott jogos a betöltésjelzés.
  useEffect(() => { voltMar.current = false }, [nezet])

  const ujra = () => void betolt(q)

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

      {/* Ez a figyelmeztetés egyszer áll itt, nem minden kártyán. Harminc
          kártyán harmincszor ugyanaz a mondat már nem figyelmeztetés, hanem zaj. */}
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
            <UgyfelKartya key={c.id} c={c} nyitott={nyitott === c.id}
                          onNyit={() => setNyitott(nyitott === c.id ? null : c.id)}
                          onValtozas={ujra} szerkesztheto={szerkesztheto} />
          ))}
          {ugyfelek.length === 0 && (
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

// ---------------------------------------------------------------------------
//  Új ügyfél — ez a régi, papíros adatok feltöltésének az útja.
//
//  Az autó MELLÉ került, nem külön lépésbe: egy papíron egy sor egy autó és
//  egy név. Ha két külön ablakban kellene felvenni, minden ügyfélnél kétszer
//  kellene megkeresni ugyanazt.
//
//  A telefonszám az, amin az ügyfelet később megtalálják, ezért kötelező. Ha
//  már van vele ügyfél, az adatbázis megmondja, kinél — ilyenkor nem
//  tiltunk, hanem megkérdezzük: egy családban közös szám is előfordul.
// ---------------------------------------------------------------------------

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
  // Ha a telefonszám már szerepel valakinél, a mentés nem megy át magától.
  // Ez a kapcsoló mondja meg, hogy már láttuk a figyelmeztetést.
  const [ismetles, setIsmetles] = useState(false)
  const nevMezo = useRef<HTMLInputElement>(null)
  useEffect(() => { urlapMegnyilt(nevMezo.current) }, [])

  async function ment(megis = false) {
    if (!name.trim() || !phone.trim() || megy) return
    setMegy(true)
    setHiba(null)
    try {
      const id = await data.addCustomer({
        name, phone, email, notes, megis,
        type: tipus,
        company_name: tipus === 'CEG' ? ceg : '',
        tax_number: tipus === 'CEG' ? adoszam : '',
      })
      // Az autó már nem bukhat el a telefonszámon: az ügyfél megvan. Ha a
      // rendszám ütközik, azt külön mondjuk meg — de az ügyfél marad.
      if (plate.trim()) {
        try {
          await data.addVehicle({ customer_id: id, plate_raw: plate, brand, model, category })
        } catch (e) {
          setHiba(`Az ügyfél felvéve, de az autó nem: ${e instanceof Error ? e.message : String(e)}`)
          setMegy(false)
          setPlate('')
          return
        }
      }
      onKesz()
    } catch (e) {
      const uzenet = e instanceof Error ? e.message : String(e)
      setHiba(uzenet)
      setIsmetles(uzenet.includes('telefonszámmal már van ügyfél'))
      setMegy(false)
    }
  }

  const keszEnged = name.trim().length > 0 && phone.trim().length > 0

  return (
    <div className="fedo" role="presentation"
         onMouseDown={(e) => e.target === e.currentTarget && onBezar()}>
      <div className="lap" role="dialog" aria-modal="true" aria-label="Ügyfél hozzáadása">
        <div className="lap-fej">
          <h2>Ügyfél hozzáadása</h2>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
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

          {/* Az első autó itt, nem külön ablakban: a papíron is egy sorban van. */}
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
                {KATEGORIAK.map((k) => (
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
              <button className="btn" onClick={onBezar} disabled={megy}>Mégse</button>
              <button className="btn btn-fo" disabled={!keszEnged || megy}
                      onClick={() => void ment()}>
                {megy ? 'Felvétel…' : 'Felvétel'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

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
        {/* A rendszám a kártya címe — itt a tulajdonos és a telefonszám az,
            ami csukott állapotban is kell. */}
        <Szerkesztheto zarolt={!szerkesztheto} cimke="Tulajdonos" ertek={v.customer_name}
                       onMent={(x) => ugyfel({ name: x })} />
        <Szerkesztheto zarolt={!szerkesztheto} cimke="Telefon" ertek={v.customer_phone} tipus="telefon"
                       onMent={(x) => ugyfel({ phone: x })} />

        {nyitva && (
          <>
            <div className="valaszto-vonal-vekony" />

            <Szerkesztheto zarolt={!szerkesztheto} cimke="Rendszám" ertek={v.plate_raw} tipus="rendszam"
                           onMent={(x) => ment({ plate_raw: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Márka" ertek={v.brand} ures="nincs megadva"
                           onMent={(x) => ment({ brand: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Modell" ertek={v.model} ures="nincs megadva"
                           onMent={(x) => ment({ model: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Méret" ertek={v.category} valaszthato={KATEGORIAK}
                           onMent={(x) => ment({ category: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Ülések" ertek={v.seats ? String(v.seats) : ''} tipus="szam"
                           ures="5 (alapértelmezett)"
                           onMent={(x) => ment({ seats: x })} />
            <Szerkesztheto zarolt={!szerkesztheto} cimke="Megjegyzés" ertek={v.notes} sor={2} ures="nincs"
                           onMent={(x) => ment({ notes: x })} />

            {v.company_name && (
              <Szerkesztheto zarolt={!szerkesztheto} cimke="Cég" ertek={v.company_name}
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

            {/* Ugyanannak a tulajdonosnak a következő autója. Itt is kell,
                nem csak az ügyfélnézetben: a listát alapból jármű szerint
                nézik, és ha csak amott volna, négy kattintásra lenne a
                felvétel — vagyis gyakorlatilag sehol. */}
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

// ---------------------------------------------------------------------------

function UgyfelKartya({ c, nyitott, onNyit, onValtozas, szerkesztheto }: {
  c: CustomerSummary
  nyitott: boolean
  onNyit: () => void
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
            <span className="ertek szam">{c.jarmuvek}</span>
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

        {/* A két gomb egy sorban. A felvétel eddig a járműlista ALJÁN volt,
            tehát csak azután látszott, hogy valaki megnyitotta a listát —
            négy kattintás után. Így egy kattintás. */}
        <div className="sor-gombok" style={{ marginTop: 'var(--t3)' }}>
          <button className="btn btn-kicsi" onClick={onNyit}>
            {nyitott ? 'Járművek elrejtése' : `Járművei (${c.jarmuvek})`}
          </button>
          {szerkesztheto && !ujAuto && (
            <button className="btn btn-kicsi" onClick={() => setUjAuto(true)}>
              + További jármű
            </button>
          )}
        </div>

        {ujAuto && (
          <UjJarmu
            customerId={c.id}
            onKesz={() => {
              setUjAuto(false)
              setRevizio((n) => n + 1)   // a járműlista olvassa újra magát
              onValtozas()
              if (!nyitott) onNyit()     // és rögtön látszódjon is
            }}
            onMegse={() => setUjAuto(false)}
          />
        )}

        {nyitott && (
          <UgyfelJarmuvei customerId={c.id} onValtozas={onValtozas}
                         revizio={revizio} szerkesztheto={szerkesztheto} />
        )}
          </>
        )}
      </div>
    </div>
  )
}

/** Egy ügyfél autói — a teljes listából szűrve, hogy ne legyen külön lekérdezés. */
function UgyfelJarmuvei({ customerId, onValtozas, revizio, szerkesztheto }: {
  customerId: string
  onValtozas: () => void
  /** Nő, valahányszor új autót vettek fel — ilyenkor újra kell olvasni. */
  revizio: number
  szerkesztheto: boolean
}) {
  const { data } = useApp()
  const [sorok, setSorok] = useState<VehicleSummary[] | null>(null)

  useEffect(() => {
    let el = true
    data.listVehicles('').then((v) => {
      if (el) setSorok(v.filter((x) => x.customer_id === customerId))
    })
    return () => { el = false }
  }, [data, customerId, revizio])

  if (!sorok) return <div className="betolt">Betöltés…</div>

  return (
    <div style={{ marginTop: 'var(--t3)' }}>
      {sorok.map((v) => (
        <div key={v.id} className="alkartya">
          <Szerkesztheto zarolt={!szerkesztheto} cimke="Rendszám" ertek={v.plate_raw} tipus="rendszam"
                         onMent={async (x) => {
                           await data.saveVehicle({ id: v.id, plate_raw: x }); onValtozas()
                         }} />
          <Szerkesztheto zarolt={!szerkesztheto} cimke="Autó" ertek={[v.brand, v.model].filter(Boolean).join(' ')}
                         ures="nincs megadva"
                         onMent={async (x) => {
                           const [marka, ...t] = x.split(' ')
                           await data.saveVehicle({ id: v.id, brand: marka ?? '', model: t.join(' ') })
                           onValtozas()
                         }} />
          <Szerkesztheto zarolt={!szerkesztheto} cimke="Méret" ertek={v.category} valaszthato={KATEGORIAK}
                         onMent={async (x) => {
                           await data.saveVehicle({ id: v.id, category: x }); onValtozas()
                         }} />
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

/** Új autó felvétele egy meglévő ügyfélhez. A rendszám elég hozzá — a többit
 *  úgyis a foglaláskor látják, amikor ott áll az autó. */
function UjJarmu({ customerId, kinek, onKesz, onMegse }: {
  customerId: string
  /** Kinek a nevére kerül. Ki van írva, mert a járműnézetben egy autó
   *  kártyájáról indul a felvétel — ott nem magától értetődő, kihez megy. */
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
  // A fókusz nem autoFocus attribútummal megy: az a képernyőolvasót
  // használóknak ugrálásnak tűnik. Megnyitás után tesszük a mezőbe, egyszer —
  // és telefonon nem is a mezőbe, csak az űrlapot görgetjük a képbe.
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
      setHiba(e instanceof Error ? e.message : String(e))
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
          {KATEGORIAK.map((k) => (
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
