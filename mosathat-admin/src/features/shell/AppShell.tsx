import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import {
  hetCim, honapCim, honapElseje, honapPlusz, maE, maStr, napCim, napLep,
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
import UsersPage from '../users/UsersPage'
import ProfilPage from '../profil/ProfilPage'
import ArlistaPanel, { PANEL_ALAP, type PanelAllapot } from '../services/ArlistaPanel'
import ArlistaGombok, { type ArlistaFul } from '../services/ArlistaGombok'
import JelszoModal from '../common/JelszoModal'

// Az oldalak. Ami még nincs megépítve, az szürke és nem kattintható — nem
// azért, hogy szép legyen a lista, hanem hogy látszódjon a terv, és ne
// tűnjön elveszettnek egy funkció, ami csak később jön.
type Oldal =
  | 'attekintes' | 'nap' | 'szolgaltatasok' | 'partnerek' | 'ugyfelek'
  | 'beallitasok' | 'felhasznalok' | 'profilom'

// A `tulaj: true` menüpontok az alkalmazottnak MEG SEM JELENNEK. Nem
// szürkén, nem "nincs jogosultság" üzenettel — nincsenek ott. Egy szürke
// menüpont arra emlékezteti az embert minden nap, hogy van valami, amihez
// nem érhet hozzá; ennek semmi haszna.
//
// Fontos: ez csak a kényelem. A tényleges tiltás az adatbázisban van, mert
// ezt a listát bárki átírhatja a böngészőjében.
const MENU: { id: Oldal; cimke: string; tulaj?: boolean }[] = [
  { id: 'attekintes', cimke: 'Áttekintés', tulaj: true },
  { id: 'nap', cimke: 'Időpontok' },
  { id: 'szolgaltatasok', cimke: 'Szolgáltatások' },
  { id: 'partnerek', cimke: 'Cégek és bérletesek' },
  { id: 'ugyfelek', cimke: 'Ügyfelek' },
  { id: 'felhasznalok', cimke: 'Felhasználók', tulaj: true },
  { id: 'beallitasok', cimke: 'Beállítások', tulaj: true },
  // Mindenkinek: jelszó, kilépés, és a munkaidő-változás bejelentése.
  { id: 'profilom', cimke: 'Profilom' },
]

const MENU_2 = [
  { id: 'keszlet', cimke: 'Készlet' },
  { id: 'galeria', cimke: 'Galéria' },
  { id: 'tartalom', cimke: 'Tartalom' },
]

export default function AppShell() {
  const { user, data, signOut, refresh } = useApp()

  // Teljes jogú: fejlesztő vagy tulajdonos. Az alkalmazott a napi munkát
  // végzi, az üzleti számokhoz és a beállításokhoz nem fér hozzá.
  const teljesJogu = user?.role === 'SUPERADMIN' || user?.role === 'TULAJDONOS'
  const menu = MENU.filter((m) => !m.tulaj || teljesJogu)

  const [oldal, setOldal] = useState<Oldal>(teljesJogu ? 'attekintes' : 'nap')
  const [nap, setNap] = useState(maStr())
  // Nap, hét vagy hónap. A nyilak ehhez igazodnak: napi nézetben egy napot,
  // hetiben egy hetet, haviban egy hónapot lépnek. Ugyanaz a gomb, más lépés.
  const [nezet, setNezet] = useState<'nap' | 'het' | 'honap'>('nap')

  // A lebegő árlista. A hely és a méret itt él, nem a panelben: így ugyanoda
  // és ugyanakkorán nyílik vissza, ahogy legutóbb beállította.
  const [arlista, setArlista] = useState<ArlistaFul | null>(null)
  const [arPanel, setArPanel] = useState<PanelAllapot>(PANEL_ALAP)
  const [ujNyitva, setUjNyitva] = useState(false)
  const [reszletId, setReszletId] = useState<string | null>(null)
  // A „Figyelmet igényel" sorából nyitva: melyik mező legyen rögtön írható.
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

  /** Munkalap megnyitása — opcionálisan egy mezővel írásra nyitva. */
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
            onClick={() => { setOldal(m.id); setFiok(false) }}
          >
            <span className="pont" />
            {m.cimke}
          </button>
        ))}

        {/* A még meg nem épített menüpontok csak a teljes jogúaknak látszanak:
            nekik terv, az alkalmazottnak viszont csak három szürke sor lenne,
            amire soha nem kattinthat. Mind a három amúgy is tulajdonosi
            funkció lesz. */}
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
        {/* A szerepkör ott van a neve alatt: ha valaki azt mondja, "nálam
            ez a menüpont nincs is", ebből egy pillanat alatt kiderül, miért.
            A fejlesztői fiók neve maga is "Fejlesztő", azt nem írjuk ki
            kétszer egymás alá. */}
        {user && ROLE_LABEL[user.role] !== user.name && (
          <div className="szerep">{ROLE_LABEL[user.role]}</div>
        )}
        {/* A jelszó mindenkinek kell — az alkalmazott a Felhasználók
            menüpontot nem is látja. Ezért van itt, a neve alatt. */}
        <button className="ki" onClick={() => setJelszoNyitva(true)}>Jelszó módosítása</button>
        <button className="ki" onClick={() => void signOut()}>Kilépés</button>
      </div>
    </>
  )

  const napiFejlec = oldal === 'nap'

  function lep(irany: -1 | 1) {
    if (nezet === 'nap') setNap(napLep(nap, irany))
    else if (nezet === 'het') setNap(napPlusz(nap, irany * 7))
    else setNap(honapPlusz(honapElseje(nap), irany))
  }

  const fejlecCim = nezet === 'nap' ? napCim(nap)
    : nezet === 'het' ? hetCim(nap)
    : honapCim(nap)

  const rovidCim = nezet === 'nap' ? (maE(nap) ? 'Ma' : napRovidCim(nap))
    : nezet === 'het' ? hetCim(nap)
    : honapCim(nap)

  /** Egy napra ugorva mindig a napi nézet a hasznos: ott van a munkalap. */
  function napraUgrik(d: string) {
    setNap(d)
    setNezet('nap')
  }

  // Egy definíció, két helyen: az asztali fejlécben és a mobil fejléc alatt.
  // Ha kétszer lenne leírva, előbb-utóbb az egyik helyen maradna ki egy nézet.
  const nezetValto = (
    <div className="nezetvalto">
      {([['nap', 'Nap'], ['het', 'Hét'], ['honap', 'Hónap']] as const).map(([id, c]) => (
        <button key={id} className={nezet === id ? 'aktiv' : ''}
                aria-pressed={nezet === id}
                onClick={() => setNezet(id)}>{c}</button>
      ))}
    </div>
  )

  // Ha van megnyitott foglalás ÉS nyitva az árlista, osztott elrendezés jön:
  // a foglalás balra, az árlista jobbra. Így nem kell húzogatni ahhoz, hogy
  // mindkettő látszódjon.
  const foglalasNyitva = Boolean(ujNyitva || szerkesztId || reszletId)
  const osztott = foglalasNyitva && arlista !== null

  const arlistaGombok = <ArlistaGombok ertek={arlista} onValt={setArlista} />
  // A foglalási ablakok fejlécében szűkebb a hely, ott rövidebb felirattal.
  const arlistaGombokRovid = <ArlistaGombok ertek={arlista} onValt={setArlista} rovid />

  return (
    <div className="keret">
      <aside className="oldalsav">{menuTartalom}</aside>

      <div className="fo">
        {/* --- asztali fejléc --- */}
        <header className="fejlec">
          {/* Tableten nincs oldalsáv (elvenné a helyet a naptártól): ott a
              menü ezzel a gombbal nyílik, ugyanúgy, mint telefonon. Asztali
              gépen ez a gomb nem látszik. */}
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

        {/* --- mobil fejléc --- */}
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

        {/* A mobil fejlécbe már nem fér be a nézetváltó a hamburger, a
            nyilak és a dátum mellé. Külön sávot kap alatta — ez látszik is,
            nem kell megkeresni a menüben. */}
        {napiFejlec && (
          <div className="nezetvalto-sav">{nezetValto}{arlistaGombok}</div>
        )}

        <main className="tartalom">
          {oldal === 'attekintes' && (
            /* A kapacitássávra kattintva átvisz arra a napra — az áttekintés
               akkor hasznos, ha egy kattintással el lehet indulni belőle. */
            <DashboardPage
              onNapra={(d) => { setNap(d.slice(0, 10)); setOldal('nap') }}
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

          {/* Az alkalmazott ugyanezt az adatot látja, de nem szerkesztőben:
              árlista és bérletlista. Nem ugyanaz a képernyő letiltva. */}
          {oldal === 'szolgaltatasok' && (teljesJogu ? <ServicesPage /> : <ServicesView />)}
          {oldal === 'partnerek' && (teljesJogu ? <PartnersPage /> : <PartnersView />)}

          {oldal === 'ugyfelek' && <CustomersPage />}
          {oldal === 'felhasznalok' && <UsersPage />}
          {oldal === 'beallitasok' && <SettingsPage />}
          {oldal === 'profilom' && <ProfilPage onJelszo={() => setJelszoNyitva(true)} />}
        </main>
      </div>

      {/* Az új időpont gomb csak a napi nézeten van, mert csak ott van értelme. */}
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

      {/* Szerkesztés: ugyanaz az űrlap, csak kap egy azonosítót. */}
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

      {/* A foglalási ablak FÖLÖTT lebeg, és nem modális: a mellé kattintás
          nem zárja be, csak az X. Így írás közben végig látszik. */}
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
          onSzerkeszt={() => { setSzerkesztId(reszletId); setReszletId(null) }}
          arlistaGombok={arlistaGombokRovid}
          osztott={osztott}
        />
      )}
    </div>
  )
}
