import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft } from '../../lib/format'
import {
  BILLING_LABEL, CATEGORY_LABEL, CATEGORY_SHORT,
  type CustomerSummary, type VehicleSummary,
} from '../../lib/types'
import Szerkesztheto, { type Valaszthato } from '../common/Szerkesztheto'

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
        <div className="panelek">
          {jarmuvek.map((v) => (
            <JarmuKartya key={v.id} v={v} onValtozas={ujra} />
          ))}
          {jarmuvek.length === 0 && (
            <div className="panel"><div className="ures">Nincs találat.</div></div>
          )}
        </div>
      )}

      {!tolt && nezet === 'ugyfel' && (
        <div className="panelek">
          {ugyfelek.map((c) => (
            <UgyfelKartya key={c.id} c={c} nyitott={nyitott === c.id}
                          onNyit={() => setNyitott(nyitott === c.id ? null : c.id)}
                          onValtozas={ujra} />
          ))}
          {ugyfelek.length === 0 && (
            <div className="panel"><div className="ures">Nincs találat.</div></div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function JarmuKartya({ v, onValtozas }: { v: VehicleSummary; onValtozas: () => void }) {
  const { data } = useApp()
  const ment = async (patch: Record<string, unknown>) => {
    await data.saveVehicle({ id: v.id, ...patch })
    onValtozas()
  }
  const ugyfel = async (patch: Record<string, unknown>) => {
    await data.saveCustomer({ id: v.customer_id, ...patch })
    onValtozas()
  }

  return (
    <div className="panel">
      <h3>
        <span className="rendszam">{v.plate_raw}</span>
        {v.billing_kind !== 'NORMAL' && (
          <span className="cimke-pill billing" data-b={v.billing_kind}>
            {BILLING_LABEL[v.billing_kind]}
          </span>
        )}
      </h3>
      <div className="panel-torzs">
        <Szerkesztheto cimke="Rendszám" ertek={v.plate_raw} tipus="rendszam"
                       onMent={(x) => ment({ plate_raw: x })} />
        <Szerkesztheto cimke="Márka" ertek={v.brand} ures="nincs megadva"
                       onMent={(x) => ment({ brand: x })} />
        <Szerkesztheto cimke="Modell" ertek={v.model} ures="nincs megadva"
                       onMent={(x) => ment({ model: x })} />
        <Szerkesztheto cimke="Méret" ertek={v.category} valaszthato={KATEGORIAK}
                       onMent={(x) => ment({ category: x })} />
        <Szerkesztheto cimke="Ülések" ertek={v.seats ? String(v.seats) : ''} tipus="szam"
                       ures="5 (alapértelmezett)"
                       onMent={(x) => ment({ seats: x })} />
        <Szerkesztheto cimke="Megjegyzés" ertek={v.notes} sor={2} ures="nincs"
                       onMent={(x) => ment({ notes: x })} />

        <div className="valaszto-vonal-vekony" />

        <Szerkesztheto cimke="Tulajdonos" ertek={v.customer_name}
                       onMent={(x) => ugyfel({ name: x })} />
        <Szerkesztheto cimke="Telefon" ertek={v.customer_phone} tipus="telefon"
                       onMent={(x) => ugyfel({ phone: x })} />
        {v.company_name && (
          <Szerkesztheto cimke="Cég" ertek={v.company_name}
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
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function UgyfelKartya({ c, nyitott, onNyit, onValtozas }: {
  c: CustomerSummary
  nyitott: boolean
  onNyit: () => void
  onValtozas: () => void
}) {
  const { data } = useApp()
  const ment = async (patch: Record<string, unknown>) => {
    await data.saveCustomer({ id: c.id, ...patch })
    onValtozas()
  }

  return (
    <div className="panel">
      <h3>
        {c.company_name || c.name}
        {c.billing_kind !== 'NORMAL' && (
          <span className="cimke-pill billing" data-b={c.billing_kind}>
            {BILLING_LABEL[c.billing_kind]}
          </span>
        )}
      </h3>
      <div className="panel-torzs">
        <Szerkesztheto cimke="Név" ertek={c.name} onMent={(x) => ment({ name: x })} />
        <Szerkesztheto cimke="Telefon" ertek={c.phone} tipus="telefon"
                       onMent={(x) => ment({ phone: x })} />
        <Szerkesztheto cimke="E-mail" ertek={c.email} tipus="email" ures="nincs"
                       onMent={(x) => ment({ email: x })} />
        <Szerkesztheto cimke="Típus" ertek={c.type} valaszthato={TIPUSOK}
                       onMent={(x) => ment({ type: x })} />
        <Szerkesztheto cimke="Cégnév" ertek={c.company_name} ures="nincs"
                       onMent={(x) => ment({ company_name: x })} />
        <Szerkesztheto cimke="Megjegyzés" ertek={c.notes} sor={2} ures="nincs"
                       onMent={(x) => ment({ notes: x })} />
        <Szerkesztheto cimke="Belső jegyzet" ertek={c.internal_notes} sor={2} ures="nincs"
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

        <button className="btn btn-kicsi" style={{ marginTop: 'var(--t3)' }} onClick={onNyit}>
          {nyitott ? 'Járművek elrejtése' : 'Járművei'}
        </button>

        {nyitott && <UgyfelJarmuvei customerId={c.id} onValtozas={onValtozas} />}
      </div>
    </div>
  )
}

/** Egy ügyfél autói — a teljes listából szűrve, hogy ne legyen külön lekérdezés. */
function UgyfelJarmuvei({ customerId, onValtozas }: {
  customerId: string
  onValtozas: () => void
}) {
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
    <div style={{ marginTop: 'var(--t3)' }}>
      {sorok.map((v) => (
        <div key={v.id} className="alkartya">
          <Szerkesztheto cimke="Rendszám" ertek={v.plate_raw} tipus="rendszam"
                         onMent={async (x) => {
                           await data.saveVehicle({ id: v.id, plate_raw: x }); onValtozas()
                         }} />
          <Szerkesztheto cimke="Autó" ertek={[v.brand, v.model].filter(Boolean).join(' ')}
                         ures="nincs megadva"
                         onMent={async (x) => {
                           const [marka, ...t] = x.split(' ')
                           await data.saveVehicle({ id: v.id, brand: marka ?? '', model: t.join(' ') })
                           onValtozas()
                         }} />
          <Szerkesztheto cimke="Méret" ertek={v.category} valaszthato={KATEGORIAK}
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
