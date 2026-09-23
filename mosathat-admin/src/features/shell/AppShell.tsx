import { useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { maE, maStr, napCim, napLep, napRovidCim } from '../../lib/format'
import DayView from '../day/DayView'
import NewBookingModal from '../booking/NewBookingModal'
import BookingDetail from '../booking/BookingDetail'

// A menü. Ami még nincs megépítve, az szürke és nem kattintható — nem
// azért, hogy szép legyen a lista, hanem hogy látszódjon a terv, és
// ne tűnjön elveszettnek egy funkció, ami csak később jön.

const MENU = [
  { id: 'nap', cimke: 'Időpontok', kesz: true },
  { id: 'attekintes', cimke: 'Áttekintés', kesz: false },
  { id: 'ugyfelek', cimke: 'Ügyfelek', kesz: false },
  { id: 'jarmuvek', cimke: 'Járművek', kesz: false },
] as const

const MENU_2 = [
  { id: 'szolgaltatasok', cimke: 'Szolgáltatások' },
  { id: 'arak', cimke: 'Árak' },
  { id: 'keszlet', cimke: 'Készlet' },
  { id: 'galeria', cimke: 'Galéria' },
  { id: 'tartalom', cimke: 'Tartalom' },
  { id: 'felhasznalok', cimke: 'Felhasználók' },
] as const

export default function AppShell() {
  const { user, data, signOut, refresh } = useApp()
  const [nap, setNap] = useState(maStr())
  const [ujNyitva, setUjNyitva] = useState(false)
  const [reszletId, setReszletId] = useState<string | null>(null)
  const [fiok, setFiok] = useState(false)

  // Escape zárja a fiókot; a lapokat a saját komponensük kezeli.
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
        {MENU.map((m) => (
          <button
            key={m.id}
            aria-current={m.id === 'nap' ? 'page' : undefined}
            disabled={!m.kesz}
            onClick={() => setFiok(false)}
          >
            <span className="pont" />
            {m.cimke}
          </button>
        ))}

        <div className="menu-cim">Később</div>
        {MENU_2.map((m) => (
          <button key={m.id} disabled>
            <span className="pont" />
            {m.cimke}
          </button>
        ))}
      </nav>

      <div className="oldalsav-lab">
        {data.isDemo && <span className="demo-jelzo">Demó adatbázis</span>}
        <div>{user?.name}</div>
        <button className="ki" onClick={() => void signOut()}>
          Kilépés
        </button>
      </div>
    </>
  )

  return (
    <div className="keret">
      <aside className="oldalsav">{menuTartalom}</aside>

      <div className="fo">
        {/* --- asztali fejléc --- */}
        <header className="fejlec">
          <div className="napvalto">
            <button className="btn btn-csendes nyil" onClick={() => setNap(napLep(nap, -1))} aria-label="Előző nap">
              ‹
            </button>
            <div className="cim">
              {napCim(nap)}
              {maE(nap) && <span className="ma">Ma</span>}
            </div>
            <button className="btn btn-csendes nyil" onClick={() => setNap(napLep(nap, 1))} aria-label="Következő nap">
              ›
            </button>
            {!maE(nap) && (
              <button className="btn btn-kicsi" onClick={() => setNap(maStr())}>
                Mára
              </button>
            )}
          </div>

          <div className="fejlec-tolto" />

          <button className="btn btn-fo" onClick={() => setUjNyitva(true)}>
            + Új időpont
          </button>
        </header>

        {/* --- mobil fejléc --- */}
        <header className="mobil-fejlec">
          <button className="hamburger" onClick={() => setFiok(true)} aria-label="Menü">
            <span />
            <span />
            <span />
          </button>
          <button className="lep" onClick={() => setNap(napLep(nap, -1))} aria-label="Előző nap">
            ‹
          </button>
          <div className="nap">
            {maE(nap) ? 'Ma' : napRovidCim(nap)}
            <span style={{ opacity: 0.6, fontWeight: 400 }}> · {napRovidCim(nap)}</span>
          </div>
          <button className="lep" onClick={() => setNap(napLep(nap, 1))} aria-label="Következő nap">
            ›
          </button>
        </header>

        <main className="tartalom">
          <DayView nap={nap} onMegnyit={setReszletId} />
        </main>
      </div>

      {/* --- mobil: lebegő hozzáadás gomb --- */}
      <button className="fab" onClick={() => setUjNyitva(true)} aria-label="Új időpont">
        +
      </button>

      {/* --- mobil: fiókmenü --- */}
      {fiok && (
        <>
          {/* Gomb, nem div: így billentyűzetről is be lehet zárni a menüt. */}
          <button
            className="fiok-hatter"
            onClick={() => setFiok(false)}
            aria-label="Menü bezárása"
          />
          <aside className="fiok">{menuTartalom}</aside>
        </>
      )}

      {ujNyitva && (
        <NewBookingModal nap={nap} onBezar={() => setUjNyitva(false)} onKesz={ujFoglalasKesz} />
      )}

      {reszletId && <BookingDetail bookingId={reszletId} onBezar={() => setReszletId(null)} />}
    </div>
  )
}
