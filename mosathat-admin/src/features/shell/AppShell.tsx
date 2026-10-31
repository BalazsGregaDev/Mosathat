import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react'

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
import SettingsPage, { type BeallitasFul } from '../settings/SettingsPage'
import ServicesView from '../services/ServicesView'
import PartnersView from '../partners/PartnersView'
import IgazoloOldal from '../igazolo/IgazoloOldal'
import UsersPage from '../users/UsersPage'
import ProfilPage from '../profil/ProfilPage'
import ArlistaPanel, { PANEL_ALAP, type PanelAllapot } from '../services/ArlistaPanel'
import ArlistaGombok, { type ArlistaFul } from '../services/ArlistaGombok'
import JelszoModal from '../common/JelszoModal'
import KeresFigyelo from '../keresek/KeresFigyelo'
import ModositasFigyelo from '../modositas/ModositasFigyelo'
import { billentyuElore, celraUgrik, type Honnan, type Ugras } from './ugras'
import type { TartalomLap } from '../publikus-admin/TartalomOldal'
import type { Nyelv } from '../../lib/nyelv'

const ArculatPage = lazy(() => import('../arculat/ArculatPage'))
const ElerhetosegOldal = lazy(() => import('../publikus-admin/ElerhetosegOldal'))
const TartalomOldal = lazy(() => import('../publikus-admin/TartalomOldal'))
const TARTALOM_ALPONTOK: { id: TartalomLap; cimke: string }[] = [
  { id: 'fooldal', cimke: 'Főoldal' },
  { id: 'foglalas', cimke: 'Foglalás oldal' },
  { id: 'gyik', cimke: 'GYIK oldal' },
]
const CsomagokOldal = lazy(() => import('../publikus-admin/CsomagokOldal'))
const CegadatokOldal = lazy(() => import('../publikus-admin/CegadatokOldal'))
const JogiSzovegekOldal = lazy(() => import('../publikus-admin/JogiSzovegekOldal'))
const VelemenyekOldal = lazy(() => import('../publikus-admin/VelemenyekOldal'))
const GyikAdminOldal = lazy(() => import('../publikus-admin/GyikOldal'))
const FelugroOldal = lazy(() => import('../publikus-admin/FelugroOldal'))
const EgyediOldal = lazy(() => import('../publikus-admin/EgyediOldal'))

type Oldal =
  | 'attekintes' | 'nap' | 'szolgaltatasok' | 'partnerek' | 'ugyfelek'
  | 'beallitasok' | 'felhasznalok' | 'profilom' | 'igazolo' | 'arculat'
  | 'pub-elerhetoseg' | 'pub-tartalom' | 'pub-csomagok' | 'pub-cegadatok' | 'pub-jogi' | 'pub-velemenyek' | 'pub-gyik' | 'pub-felugro' | 'pub-egyedi'

type MenuPont = { id: Oldal; cimke: string; tulaj?: boolean }

const MENU: MenuPont[] = [
  { id: 'attekintes', cimke: 'Áttekintés', tulaj: true },
  { id: 'nap', cimke: 'Időpontok' },
  { id: 'igazolo', cimke: 'Igazolólap' },
  { id: 'szolgaltatasok', cimke: 'Szolgáltatások' },
  { id: 'partnerek', cimke: 'Cégek és bérletesek' },
  { id: 'ugyfelek', cimke: 'Ügyfelek' },
  { id: 'felhasznalok', cimke: 'Felhasználók', tulaj: true },
  { id: 'beallitasok', cimke: 'Beállítások', tulaj: true },
  { id: 'profilom', cimke: 'Profilom' },
]

const MENU_PUB: MenuPont[] = [
  { id: 'pub-elerhetoseg', cimke: 'Elérhetőség' },
  { id: 'pub-tartalom', cimke: 'Tartalom' },
  { id: 'pub-felugro', cimke: 'Felugró ablak' },
  { id: 'pub-egyedi', cimke: 'Egyedi szekció' },
  { id: 'pub-csomagok', cimke: 'Csomagok tartalma' },
  { id: 'pub-velemenyek', cimke: 'Vélemények' },
  { id: 'pub-gyik', cimke: 'GYIK' },
  { id: 'pub-cegadatok', cimke: 'Cégadatok' },
  { id: 'pub-jogi', cimke: 'Jogi szövegek' },
  { id: 'arculat', cimke: 'Arculat' },
]

const MENU_2 = [
  { id: 'keszlet', cimke: 'Készlet' },
  { id: 'galeria', cimke: 'Galéria' },
]

export default function AppShell() {
  const { user, data, signOut, refresh } = useApp()

  const teljesJogu = user?.role === 'SUPERADMIN' || user?.role === 'TULAJDONOS'
  const menu = MENU.filter((m) => !m.tulaj || teljesJogu)
  const pubMenu = teljesJogu ? MENU_PUB : []

  const [oldal, setOldal] = useState<Oldal>(teljesJogu ? 'attekintes' : 'nap')
  const [tartalomLap, setTartalomLap] = useState<TartalomLap>('fooldal')
  const oldalCim = oldal === 'pub-tartalom'
    ? `Tartalom: ${TARTALOM_ALPONTOK.find((a) => a.id === tartalomLap)?.cimke}`
    : [...menu, ...pubMenu].find((m) => m.id === oldal)?.cimke
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
  const [beallFul, setBeallFul] = useState<BeallitasFul | undefined>(undefined)
  const [ugrasNyelv, setUgrasNyelv] = useState<Nyelv>('hu')
  const [vissza, setVissza] = useState<Honnan | null>(null)
  const [visszaterve, setVisszaterve] = useState<Honnan | null>(null)
  const ugrasLeall = useRef<() => void>(() => {})

  useEffect(() => () => ugrasLeall.current(), [])

  function ugrik(cel: Ugras, honnan: Honnan) {
    ugrasLeall.current()
    const ideiglenes = billentyuElore(cel)
    setBeallFul(cel.ful)
    setUgrasNyelv(cel.nyelv ?? 'hu')
    setVissza(honnan)
    setVisszaterve(null)
    setOldal(cel.oldal)
    ugrasLeall.current = celraUgrik(cel, ideiglenes)
  }

  function visszaTartalomba() {
    ugrasLeall.current()
    setVisszaterve(vissza)
    setVissza(null)
    setBeallFul(undefined)
    setOldal('pub-tartalom')
  }

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

  const menuValt = (id: Oldal, lap?: TartalomLap) => {
    ugrasLeall.current()
    setOldal(id); setFiok(false); setSzerzodesCeg(null)
    setBeallFul(undefined); setVissza(null); setVisszaterve(null); setUgrasNyelv('hu')
    if (id === 'pub-tartalom') setTartalomLap(lap ?? 'fooldal')
  }

  const menuGomb = (m: MenuPont) => (
    <Fragment key={m.id}>
      <button aria-current={m.id === oldal ? 'page' : undefined} onClick={() => menuValt(m.id)}>
        <span className="pont" />
        {m.cimke}
      </button>
      {m.id === 'pub-tartalom' && oldal === 'pub-tartalom' && TARTALOM_ALPONTOK.map((a) => (
        <button key={a.id} className="almenu"
                aria-current={tartalomLap === a.id ? 'true' : undefined}
                onClick={() => menuValt('pub-tartalom', a.id)}>
          {a.cimke}
        </button>
      ))}
    </Fragment>
  )

  const menuTartalom = (
    <>
      <div className="oldalsav-fej">
        <div className="nev">Mosathat</div>
        <div className="alnev">Autókozmetika</div>
      </div>

      <nav className="menu">
        {menu.map(menuGomb)}

        {pubMenu.length > 0 && (
          <>
            <div className="menu-cim">Publikus</div>
            {pubMenu.map(menuGomb)}
          </>
        )}

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
  const visszaGomb = vissza && oldal !== 'pub-tartalom' && (
    <button type="button" className="ugras-vissza" onClick={visszaTartalomba}>Vissza a Tartalomhoz</button>
  )

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
  const [keresLathato, setKeresLathato] = useState(false)

  useEffect(() => {
    if (data.isDemo) return
    const kuld = () => { if (document.visibilityState === 'visible') void data.ertesitesekKuldese().catch(() => null) }
    const elso = window.setTimeout(kuld, 5_000)
    const t = window.setInterval(kuld, 120_000)
    return () => { window.clearTimeout(elso); window.clearInterval(t) }
  }, [data])
  const osztott = foglalasNyitva && arlista !== null

  const arlistaGombok = <ArlistaGombok ertek={arlista} onValt={setArlista} />
  const arlistaGombokRovid = <ArlistaGombok ertek={arlista} onValt={setArlista} rovid />
  const arlistaPanel = arlista && (
    <ArlistaPanel
      ful={arlista}
      onFul={setArlista}
      onBezar={() => setArlista(null)}
      allapot={arPanel}
      onAllapot={setArPanel}
      osztott={osztott}
    />
  )
  const panelHely = reszletId ? 'reszlet' : szerkesztId ? 'szerkeszt' : ujNyitva ? 'uj' : null

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
              <div className="cim" style={{ fontWeight: 600 }}>{oldalCim}</div>
              <div className="fejlec-tolto" />
              {visszaGomb}
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
            <>
              <div className="nap">{oldalCim}</div>
              {visszaGomb}
            </>
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

          {oldal === 'szolgaltatasok' && (teljesJogu
            ? <ServicesPage onCsomagSzerkeszto={() => setOldal('pub-csomagok')} />
            : <ServicesView />)}
          {oldal === 'partnerek' && (teljesJogu || user?.canEditCustomers
            ? <PartnersPage fokuszCeg={szerzodesCeg} />
            : <PartnersView fokuszCeg={szerzodesCeg} />)}


          {oldal === 'igazolo' && (
            <IgazoloOldal onSzerzodes={(cegId) => { setSzerzodesCeg(cegId); setOldal('partnerek') }} />
          )}
          {oldal === 'ugyfelek' && <CustomersPage />}
          {oldal === 'felhasznalok' && <UsersPage />}
          {oldal === 'beallitasok' && <SettingsPage kezdoFul={beallFul} />}
          {oldal === 'profilom' && <ProfilPage onJelszo={() => setJelszoNyitva(true)} />}
          {teljesJogu && (oldal === 'arculat' || oldal.startsWith('pub-')) && (
            <Suspense fallback={<div className="betolt">Betöltés…</div>}>
              {oldal === 'arculat' && <ArculatPage />}
              {oldal === 'pub-elerhetoseg' && (
                <ElerhetosegOldal kezdoNyelv={ugrasNyelv}
                                  onBeallitasok={() => { setBeallFul(undefined); setOldal('beallitasok') }} />
              )}
              {oldal === 'pub-tartalom' && (
                <TartalomOldal onUgras={ugrik} visszaterve={visszaterve} lap={tartalomLap} onLap={setTartalomLap} />
              )}
              {oldal === 'pub-csomagok' && <CsomagokOldal />}
              {oldal === 'pub-cegadatok' && <CegadatokOldal onJogi={() => setOldal('pub-jogi')} />}
              {oldal === 'pub-jogi' && <JogiSzovegekOldal />}
              {oldal === 'pub-velemenyek' && <VelemenyekOldal />}
              {oldal === 'pub-gyik' && <GyikAdminOldal />}
              {oldal === 'pub-felugro' && <FelugroOldal />}
              {oldal === 'pub-egyedi' && <EgyediOldal />}
            </Suspense>
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
                     arlistaGombok={arlistaGombokRovid} osztott={osztott}
                     arlistaPanel={panelHely === 'uj' && arlistaPanel} />
      )}

      {szerkesztId && (
        <BookingForm
          nap={nap}
          bookingId={szerkesztId}
          onBezar={() => setSzerkesztId(null)}
          onKesz={() => { setSzerkesztId(null); refresh() }}
          arlistaGombok={arlistaGombokRovid}
          arlistaPanel={panelHely === 'szerkeszt' && arlistaPanel}
          osztott={osztott}
        />
      )}

      {!panelHely && arlistaPanel}

      <KeresFigyelo onMegnyit={(id) => megnyit(id)} onLathato={setKeresLathato} />

      <ModositasFigyelo szabad={!foglalasNyitva && !keresLathato && !jelszoNyitva && arlista === null}
                        onSzerkeszt={(id) => setSzerkesztId(id)} />

      {reszletId && (
        <BookingDetail
          key={reszletId}
          bookingId={reszletId}
          fokusz={reszletFokusz}
          onBezar={() => { setReszletId(null); setReszletFokusz(undefined) }}
          onSzerkeszt={(id) => { setSzerkesztId(id); setReszletId(null) }}
          arlistaGombok={arlistaGombokRovid}
          arlistaPanel={panelHely === 'reszlet' && arlistaPanel}
          osztott={osztott}
        />
      )}
    </div>
  )
}
