import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { maE, maStr, napCim, napLep, napRovidCim } from '../../lib/format'
import { ROLE_LABEL } from '../../lib/types'
import DayView from '../day/DayView'
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

// Az oldalak. Ami még nincs megépítve, az szürke és nem kattintható — nem
// azért, hogy szép legyen a lista, hanem hogy látszódjon a terv, és ne
// tűnjön elveszettnek egy funkció, ami csak később jön.
type Oldal =
  | 'attekintes' | 'nap' | 'szolgaltatasok' | 'partnerek' | 'ugyfelek'
  | 'beallitasok' | 'felhasznalok'

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
  const [ujNyitva, setUjNyitva] = useState(false)
  const [reszletId, setReszletId] = useState<string | null>(null)
  const [szerkesztId, setSzerkesztId] = useState<string | null>(null)
  const [fiok, setFiok] = useState(false)

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
        <button className="ki" onClick={() => void signOut()}>Kilépés</button>
      </div>
    </>
  )

  const napiFejlec = oldal === 'nap'

  return (
    <div className="keret">
      <aside className="oldalsav">{menuTartalom}</aside>

      <div className="fo">
        {/* --- asztali fejléc --- */}
        <header className="fejlec">
          {napiFejlec ? (
            <>
              <div className="napvalto">
                <button className="btn btn-csendes nyil" onClick={() => setNap(napLep(nap, -1))}
                        aria-label="Előző nap">‹</button>
                <div className="cim">
                  {napCim(nap)}
                  {maE(nap) && <span className="ma">Ma</span>}
                </div>
                <button className="btn btn-csendes nyil" onClick={() => setNap(napLep(nap, 1))}
                        aria-label="Következő nap">›</button>
                {!maE(nap) && (
                  <button className="btn btn-kicsi" onClick={() => setNap(maStr())}>Mára</button>
                )}
              </div>
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
              <button className="lep" onClick={() => setNap(napLep(nap, -1))} aria-label="Előző nap">‹</button>
              <div className="nap">
                {maE(nap) ? 'Ma' : napRovidCim(nap)}
                <span style={{ opacity: 0.6, fontWeight: 400 }}> · {napRovidCim(nap)}</span>
              </div>
              <button className="lep" onClick={() => setNap(napLep(nap, 1))} aria-label="Következő nap">›</button>
            </>
          ) : (
            <div className="nap">{menu.find((m) => m.id === oldal)?.cimke}</div>
          )}
        </header>

        <main className="tartalom">
          {oldal === 'attekintes' && (
            /* A kapacitássávra kattintva átvisz arra a napra — az áttekintés
               akkor hasznos, ha egy kattintással el lehet indulni belőle. */
            <DashboardPage
              nap={nap}
              onNapra={(d) => { setNap(d.slice(0, 10)); setOldal('nap') }}
            />
          )}
          {oldal === 'nap' && <DayView nap={nap} onMegnyit={setReszletId} />}

          {/* Az alkalmazott ugyanezt az adatot látja, de nem szerkesztőben:
              árlista és bérletlista. Nem ugyanaz a képernyő letiltva. */}
          {oldal === 'szolgaltatasok' && (teljesJogu ? <ServicesPage /> : <ServicesView />)}
          {oldal === 'partnerek' && (teljesJogu ? <PartnersPage /> : <PartnersView />)}

          {oldal === 'ugyfelek' && <CustomersPage />}
          {oldal === 'felhasznalok' && <UsersPage />}
          {oldal === 'beallitasok' && <SettingsPage />}
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

      {ujNyitva && (
        <BookingForm nap={nap} onBezar={() => setUjNyitva(false)} onKesz={ujFoglalasKesz} />
      )}

      {/* Szerkesztés: ugyanaz az űrlap, csak kap egy azonosítót. */}
      {szerkesztId && (
        <BookingForm
          nap={nap}
          bookingId={szerkesztId}
          onBezar={() => setSzerkesztId(null)}
          onKesz={() => { setSzerkesztId(null); refresh() }}
        />
      )}

      {reszletId && (
        <BookingDetail
          bookingId={reszletId}
          onBezar={() => setReszletId(null)}
          onSzerkeszt={() => { setSzerkesztId(reszletId); setReszletId(null) }}
        />
      )}
    </div>
  )
}
