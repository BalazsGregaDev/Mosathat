import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import {
  hetCim, honapCim, honapElseje, honapPlusz, maE, maStr, napCim,
  napPlusz, napRovidCim,
} from '../../lib/format'
import { ROLE_LABEL, type MunkalapFokusz } from '../../lib/types'
import DayView from '../day/DayView'
import WeekView from '../day/WeekView'
import MonthView from '../day/MonthView'
import BookingForm from '../booking/BookingForm'
import BookingDetail from '../booking/BookingDetail'
import ServicesPage from '../services/ServicesPage'
import PartnersPage from '../partners/PartnersPage'
import CustomersPage from '../customers/CustomersPage'
import DashboardPage from '../dashboard/DashboardPage'
import SettingsPage from '../settings/SettingsPage'
import ServicesView from '../services/ServicesView'
import PartnersView from '../partners/PartnersView'
import IgazoloOldal from '../igazolo/IgazoloOldal'
import UsersPage from '../users/UsersPage'
import ProfilPage from '../profil/ProfilPage'
import ArlistaPanel, { PANEL_ALAP, type PanelAllapot } from '../services/ArlistaPanel'
import ArlistaGombok, { type ArlistaFul } from '../services/ArlistaGombok'
import JelszoModal from '../common/JelszoModal'
import FoglalasModul from '../publikus/FoglalasModul'

type Oldal =
  | 'attekintes' | 'nap' | 'szolgaltatasok' | 'partnerek' | 'ugyfelek'
  | 'beallitasok' | 'felhasznalok' | 'profilom' | 'igazolo' | 'foglalas'

const MENU: { id: Oldal; cimke: string; tulaj?: boolean; fejleszto?: boolean }[] = [
  { id: 'attekintes', cimke: 'Áttekintés', tulaj: true },
  { id: 'nap', cimke: 'Időpontok' },
  { id: 'igazolo', cimke: 'Igazolólap' },
  { id: 'szolgaltatasok', cimke: 'Szolgáltatások' },
  { id: 'partnerek', cimke: 'Cégek és bérletesek' },
  { id: 'ugyfelek', cimke: 'Ügyfelek' },
  { id: 'felhasznalok', cimke: 'Felhasználók', tulaj: true },
  { id: 'beallitasok', cimke: 'Beállítások', tulaj: true },
  { id: 'profilom', cimke: 'Profilom' },
  { id: 'foglalas', cimke: 'Időpontfoglalás', fejleszto: true },
]

const MENU_2 = [
  { id: 'keszlet', cimke: 'Készlet' },
  { id: 'galeria', cimke: 'Galéria' },
  { id: 'tartalom', cimke: 'Tartalom' },
]

export default function AppShell() {
  const { user, data, signOut, refresh } = useApp()

  const teljesJogu = user?.role === 'SUPERADMIN' || user?.role === 'TULAJDONOS'
  const fejleszto = user?.role === 'SUPERADMIN'
  const menu = MENU.filter((m) => (!m.tulaj || teljesJogu) && (!m.fejleszto || fejleszto))

  const [oldal, setOldal] = useState<Oldal>(teljesJogu ? 'attekintes' : 'nap')
  const [szerzodesCeg, setSzerzodesCeg] = useState<string | null>(null)
  const [nap, setNap] = useState(maStr())
  const [nezet, setNezet] = useState<'nap' | 'het' | 'honap'>('nap')

  const [arlista, setArlista] = useState<ArlistaFul | null>(null)
  const [arPanel, setArPanel] = useState<PanelAllapot>(PANEL_ALAP)
  const [ujNyitva, setUjNyitva] = useState(false)
  const [reszletId, setReszletId] = useState<string | null>(null)
  const [reszletFokusz, setReszletFokusz] = useState<MunkalapFokusz | undefined>(undefined)
  const [szerkesztId, setSzerkesztId] = useState<string | null>(null)
  const [fiok, setFiok] = useState(false)
  const [jelszoNyitva, setJelszoNyitva] = useState(false)

  useEffect(() => {
    if (!fiok) return
    const f = (e: KeyboardEvent) => e.key === 'Escape' && setFiok(false)
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [fiok])

  function ujFoglalasKesz() {
    setUjNyitva(false)
    refresh()
  }

  function megnyit(id: string, fokusz?: MunkalapFokusz) {
    setReszletFokusz(fokusz)
    setReszletId(id)
  }

  const menuTartalom = (
    <>
      <div className="oldalsav-fej">
        <div className="nev">Mosathat</div>
        <div className="alnev">Autókozmetika</div>
      </div>

      <nav className="menu">
        {menu.map((m) => (
          <button
            key={m.id}
            aria-current={m.id === oldal ? 'page' : undefined}
            onClick={() => { setOldal(m.id); setFiok(false); setSzerzodesCeg(null) }}
          >
            <span className="pont" />
            {m.cimke}
          </button>
        ))}

        {teljesJogu && (
          <>
            <div className="menu-cim">Később</div>
            {MENU_2.map((m) => (
              <button key={m.id} disabled>
                <span className="pont" />
                {m.cimke}
              </button>
            ))}
          </>
        )}
      </nav>

      <div className="oldalsav-lab">
        {data.isDemo && <span className="demo-jelzo">Demó adatbázis</span>}
        <div>{user?.name}</div>
        {user && ROLE_LABEL[user.role] !== user.name && (
          <div className="szerep">{ROLE_LABEL[user.role]}</div>
        )}
        <button className="ki" onClick={() => setJelszoNyitva(true)}>Jelszó módosítása</button>
        <button className="ki" onClick={() => void signOut()}>Kilépés</button>
      </div>
    </>
  )

  const napiFejlec = oldal === 'nap'

  function lep(irany: -1 | 1) {
    if (nezet === 'nap') setNap(napPlusz(nap, irany))
    else if (nezet === 'het') setNap(napPlusz(nap, irany * 7))
    else setNap(honapPlusz(honapElseje(nap), irany))
  }

  const fejlecCim = nezet === 'nap' ? napCim(nap)
    : nezet === 'het' ? hetCim(nap)
    : honapCim(nap)

  const rovidCim = nezet === 'nap' ? (maE(nap) ? 'Ma' : napRovidCim(nap))
    : nezet === 'het' ? hetCim(nap)
    : honapCim(nap)

  function napraUgrik(d: string) {
    setNap(d)
    setNezet('nap')
  }

  const nezetValto = (
    <div className="nezetvalto">
      {([['nap', 'Nap'], ['het', 'Hét'], ['honap', 'Hónap']] as const).map(([id, c]) => (
        <button key={id} className={nezet === id ? 'aktiv' : ''}
                aria-pressed={nezet === id}
                onClick={() => setNezet(id)}>{c}</button>
      ))}
    </div>
  )

  const foglalasNyitva = Boolean(ujNyitva || szerkesztId || reszletId)
  const osztott = foglalasNyitva && arlista !== null

  const arlistaGombok = <ArlistaGombok ertek={arlista} onValt={setArlista} />
  const arlistaGombokRovid = <ArlistaGombok ertek={arlista} onValt={setArlista} rovid />

  return (
    <div className="keret">
      <aside className="oldalsav">{menuTartalom}</aside>

      <div className="fo">
        <header className="fejlec">
          <button className="hamburger fejlec-hamburger" onClick={() => setFiok(true)}
                  aria-label="Menü">
            <span /><span /><span />
          </button>
          {napiFejlec ? (
            <>
              <div className="napvalto">
                <button className="btn btn-csendes nyil" onClick={() => lep(-1)}
                        aria-label="Vissza">‹</button>
                <div className="cim">
                  {fejlecCim}
                  {nezet === 'nap' && maE(nap) && <span className="ma">Ma</span>}
                </div>
                <button className="btn btn-csendes nyil" onClick={() => lep(1)}
                        aria-label="Előre">›</button>
                {!maE(nap) && (
                  <button className="btn btn-kicsi" onClick={() => setNap(maStr())}>Mára</button>
                )}
              </div>

              {nezetValto}
              {arlistaGombok}

              <div className="fejlec-tolto" />
              <button className="btn btn-fo" onClick={() => setUjNyitva(true)}>+ Új időpont</button>
            </>
          ) : (
            <>
              <div className="cim" style={{ fontWeight: 600 }}>
                {menu.find((m) => m.id === oldal)?.cimke}
              </div>
              <div className="fejlec-tolto" />
            </>
          )}
        </header>

        <header className="mobil-fejlec">
          <button className="hamburger" onClick={() => setFiok(true)} aria-label="Menü">
            <span /><span /><span />
          </button>
          {napiFejlec ? (
            <>
              <button className="lep" onClick={() => lep(-1)} aria-label="Vissza">‹</button>
              <div className="nap">
                {rovidCim}
                {nezet === 'nap' && (
                  <span style={{ opacity: 0.6, fontWeight: 400 }}> · {napRovidCim(nap)}</span>
                )}
              </div>
              <button className="lep" onClick={() => lep(1)} aria-label="Előre">›</button>
            </>
          ) : (
            <div className="nap">{menu.find((m) => m.id === oldal)?.cimke}</div>
          )}
        </header>

        {napiFejlec && (
          <div className="nezetvalto-sav">{nezetValto}{arlistaGombok}</div>
        )}

        <main className="tartalom">
          {oldal === 'attekintes' && (
            <DashboardPage
              onNapra={(d) => { setNap(d.slice(0, 10)); setNezet('nap'); setOldal('nap') }}
              onMegnyit={megnyit}
              onOldal={(o) => setOldal(o)}
            />
          )}
          {oldal === 'nap' && nezet === 'nap' && (
            <DayView nap={nap} onMegnyit={megnyit} />
          )}
          {oldal === 'nap' && nezet === 'het' && (
            <WeekView nap={nap} onMegnyit={(id) => megnyit(id)} onNapra={napraUgrik} />
          )}
          {oldal === 'nap' && nezet === 'honap' && (
            <MonthView nap={nap} onNapra={napraUgrik}
                       onHetre={(d) => { setNap(d); setNezet('het') }} />
          )}

          {oldal === 'szolgaltatasok' && (teljesJogu ? <ServicesPage /> : <ServicesView />)}
          {oldal === 'partnerek' && (teljesJogu || user?.canEditCustomers
            ? <PartnersPage fokuszCeg={szerzodesCeg} />
            : <PartnersView fokuszCeg={szerzodesCeg} />)}

          {oldal === 'igazolo' && (
            <IgazoloOldal onSzerzodes={(cegId) => { setSzerzodesCeg(cegId); setOldal('partnerek') }} />
          )}
          {oldal === 'ugyfelek' && <CustomersPage />}
          {oldal === 'felhasznalok' && <UsersPage />}
          {oldal === 'beallitasok' && <SettingsPage />}
          {oldal === 'profilom' && <ProfilPage onJelszo={() => setJelszoNyitva(true)} />}
          {oldal === 'foglalas' && fejleszto && (
            <FoglalasModul onNapiNezet={(d) => { setNap(d); setNezet('nap'); setOldal('nap') }} />
          )}
        </main>
      </div>

      {napiFejlec && (
        <button className="fab" onClick={() => setUjNyitva(true)} aria-label="Új időpont">+</button>
      )}

      {fiok && (
        <>
          <button className="fiok-hatter" onClick={() => setFiok(false)} aria-label="Menü bezárása" />
          <aside className="fiok">{menuTartalom}</aside>
        </>
      )}

      {jelszoNyitva && user && (
        <JelszoModal
          kinek={user.name}
          sajat
          onMent={(mostani, uj) => data.changeOwnPassword(mostani, uj)}
          onBezar={() => { setJelszoNyitva(false); setFiok(false) }}
        />
      )}

      {ujNyitva && (
        <BookingForm nap={nap} onBezar={() => setUjNyitva(false)} onKesz={ujFoglalasKesz}
                     arlistaGombok={arlistaGombokRovid} osztott={osztott} />
      )}

      {szerkesztId && (
        <BookingForm
          nap={nap}
          bookingId={szerkesztId}
          onBezar={() => setSzerkesztId(null)}
          onKesz={() => { setSzerkesztId(null); refresh() }}
          arlistaGombok={arlistaGombokRovid}
          osztott={osztott}
        />
      )}

      {arlista && (
        <ArlistaPanel
          ful={arlista}
          onFul={setArlista}
          onBezar={() => setArlista(null)}
          allapot={arPanel}
          onAllapot={setArPanel}
          osztott={osztott}
        />
      )}

      {reszletId && (
        <BookingDetail
          key={reszletId}
          bookingId={reszletId}
          fokusz={reszletFokusz}
          onBezar={() => { setReszletId(null); setReszletFokusz(undefined) }}
          onSzerkeszt={(id) => { setSzerkesztId(id); setReszletId(null) }}
          arlistaGombok={arlistaGombokRovid}
          osztott={osztott}
        />
      )}
    </div>
  )
}
