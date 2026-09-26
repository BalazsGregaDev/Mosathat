import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ROLE_LABEL, ROLE_LEIRAS, type NewStaffInput, type StaffRole, type StaffRow } from '../../lib/types'

// ---------------------------------------------------------------------------
//  Felhasználók
//
//  Három szerepkör van, és a sorrend nem véletlen:
//
//    Fejlesztő   – aki a rendszert építi és karbantartja. Mindenhez hozzáfér,
//                  és ide kerülnek később a fejlesztést segítő funkciók.
//                  Ezért van külön a tulajtól: két különböző munka.
//    Tulajdonos  – a műhely gazdája. Az alkalmazáson belül mindenhez hozzáfér,
//                  és alkalmazottat vehet fel.
//    Alkalmazott – a napi munkához mindent tud. Az üzleti számokhoz és a
//                  beállításokhoz nem fér hozzá.
//
//  Amit a képernyő NEM tesz: nem ő dönti el, ki mit tehet. A tiltás az
//  adatbázisban van. Ha valaki megkerüli ezt a képernyőt, ugyanúgy nemet kap.
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { data, user } = useApp()
  const [sorok, setSorok] = useState<StaffRow[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [ujNyitva, setUjNyitva] = useState(false)
  const [uzenet, setUzenet] = useState<string | null>(null)

  const betolt = useCallback(() => {
    data.listStaff()
      .then((s) => { setSorok(s); setHiba(null) })
      .catch((e) => setHiba(e instanceof Error ? e.message : String(e)))
  }, [data])

  useEffect(betolt, [betolt])

  // A fejlesztő mindenkit kezelhet. A tulaj csak alkalmazottat — a fejlesztői
  // és tulajdonosi hozzáférés a rendszer gazdáját érinti, nem a napi munkát.
  const fejleszto = user?.role === 'SUPERADMIN'
  function kezelheto(s: StaffRow) {
    if (s.id === user?.id) return false          // magadat nem lövöd ki
    if (fejleszto) return true
    return s.role === 'STAFF'
  }

  if (hiba) return <div className="oldal"><div className="hibauzenet">{hiba}</div></div>
  if (!sorok) return <div className="oldal"><div className="betolt">Betöltés…</div></div>

  const meglevo = sorok.filter((s) => !s.meghivo)
  const meghivok = sorok.filter((s) => s.meghivo)

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Felhasználók</h2>
        <button className="btn btn-fo" style={{ marginLeft: 'auto' }}
                onClick={() => setUjNyitva(true)}>
          + Új felhasználó
        </button>
      </div>

      {/* Nem hibaüzenet, hanem az, ami a szokásostól eltért — ezt el kell
          olvasni, mert a jelszó máshogy működik ilyenkor. */}
      {uzenet && (
        <div className="figyelmeztet" style={{ marginBottom: 'var(--t4)' }}>
          <span>{uzenet}</span>
          <button className="btn btn-csendes btn-kicsi" style={{ marginLeft: 'auto' }}
                  onClick={() => setUzenet(null)}>Rendben</button>
        </div>
      )}

      <div className="panel panelek-szeles">
        <h3>Hozzáférések</h3>
        <div className="panel-torzs">
          <div className="tablagorgo">
            <table className="lista">
              <thead>
                <tr>
                  <th>Név</th>
                  <th>Szerepkör</th>
                  <th>Belépés</th>
                  <th>Állapot</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {meglevo.map((s) => (
                  <Sor key={s.id ?? s.email} s={s} en={s.id === user?.id}
                       kezelheto={kezelheto(s)} fejleszto={fejleszto}
                       onValtozas={betolt} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {meghivok.length > 0 && (
        <div className="panel panelek-szeles" style={{ marginTop: 'var(--t4)' }}>
          <h3>Felvéve, de még nem lépett be</h3>
          <div className="panel-torzs">
            <p className="halk" style={{ fontSize: 'var(--m-xs)', marginBottom: 'var(--t3)' }}>
              A fiók megvan, de ezzel a címmel még senki nem jelentkezett be. Ha a
              Supabase-ben be van kapcsolva az e-mail megerősítés, előbb a levélben
              lévő linkre kell kattintania.
            </p>
            <div className="tablagorgo">
              <table className="lista">
                <tbody>
                  {meghivok.map((s) => (
                    <tr key={s.email}>
                      <th scope="row">{s.full_name}</th>
                      <td><span className="cimke-pill" data-r={s.role}>{ROLE_LABEL[s.role]}</span></td>
                      <td className="halk">{s.email}</td>
                      <td>
                        <button className="btn btn-csendes btn-kicsi"
                                onClick={() => void data.deleteInvite(s.email!).then(betolt)}>
                          Visszavonás
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="panel panelek-szeles" style={{ marginTop: 'var(--t4)' }}>
        <h3>Mit jelentenek a szerepkörök</h3>
        <div className="panel-torzs">
          <dl className="szerepek">
            {(['SUPERADMIN', 'TULAJDONOS', 'STAFF'] as StaffRole[]).map((r) => (
              <div key={r}>
                <dt><span className="cimke-pill" data-r={r}>{ROLE_LABEL[r]}</span></dt>
                <dd>{ROLE_LEIRAS[r]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {ujNyitva && (
        <UjFelhasznalo
          fejleszto={fejleszto}
          onBezar={() => setUjNyitva(false)}
          onKesz={(u) => { setUjNyitva(false); setUzenet(u); betolt() }}
        />
      )}
    </div>
  )
}

function Sor({ s, en, kezelheto, fejleszto, onValtozas }: {
  s: StaffRow
  en: boolean
  kezelheto: boolean
  fejleszto: boolean
  onValtozas: () => void
}) {
  const { data } = useApp()
  const [dolgozik, setDolgozik] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  async function modosit(patch: { role?: StaffRole; active?: boolean }) {
    setDolgozik(true)
    try {
      await data.updateStaff(s.id!, patch)
      setHiba(null)
      onValtozas()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setDolgozik(false)
    }
  }

  // A tulaj alkalmazotti szerepkört adhat, a fejlesztő bármit.
  const valaszthato: StaffRole[] = fejleszto
    ? ['SUPERADMIN', 'TULAJDONOS', 'STAFF']
    : ['STAFF']

  return (
    <tr data-inaktiv={!s.active || undefined}>
      <th scope="row">
        {s.full_name}
        {en && <span className="halk" style={{ fontWeight: 400 }}> · te</span>}
        <div className="halk" style={{ fontSize: 'var(--m-xs)', fontWeight: 400 }}>
          {s.email ?? '—'}
        </div>
        {hiba && <div className="sor-hiba">{hiba}</div>}
      </th>

      <td>
        {kezelheto && valaszthato.includes(s.role) ? (
          <select className="beviteli" value={s.role} disabled={dolgozik}
                  onChange={(e) => void modosit({ role: e.target.value as StaffRole })}
                  aria-label={`${s.full_name} szerepköre`}>
            {valaszthato.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        ) : (
          <span className="cimke-pill" data-r={s.role}>{ROLE_LABEL[s.role]}</span>
        )}
      </td>

      <td className="halk">
        {s.belepett_mar ? 'volt már' : 'még nem lépett be'}
      </td>

      <td>
        {s.active
          ? <span className="cimke-pill" data-r="aktiv">Aktív</span>
          : <span className="cimke-pill" data-r="tiltott">Kikapcsolva</span>}
      </td>

      <td>
        {kezelheto && (
          <button className="btn btn-kicsi" disabled={dolgozik}
                  onClick={() => void modosit({ active: !s.active })}>
            {s.active ? 'Kikapcsolás' : 'Visszakapcsolás'}
          </button>
        )}
      </td>
    </tr>
  )
}

const URES: NewStaffInput = { full_name: '', email: '', password: '', role: 'STAFF' }

function UjFelhasznalo({ fejleszto, onBezar, onKesz }: {
  fejleszto: boolean
  onBezar: () => void
  onKesz: (uzenet: string | null) => void
}) {
  const { data } = useApp()
  const [f, setF] = useState<NewStaffInput>(URES)
  const [hiba, setHiba] = useState<string | null>(null)
  const [megy, setMegy] = useState(false)

  const valaszthato: StaffRole[] = fejleszto
    ? ['STAFF', 'TULAJDONOS', 'SUPERADMIN']
    : ['STAFF']

  async function ment() {
    setMegy(true)
    try {
      onKesz(await data.createStaff(f))
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      setMegy(false)
    }
  }

  const keszEnged = f.email.includes('@') && f.password.length >= 6

  return (
    <div className="fedo" role="presentation"
         onMouseDown={(e) => e.target === e.currentTarget && onBezar()}>
      <div className="lap" role="dialog" aria-modal="true" aria-label="Új felhasználó">
        <div className="lap-fej">
          <h2>Új felhasználó</h2>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          <label className="mezo">
            <span>Név</span>
            <input className="beviteli" value={f.full_name} autoFocus
                   onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          </label>

          <label className="mezo">
            <span>E-mail cím</span>
            <input className="beviteli" type="email" inputMode="email" value={f.email}
                   onChange={(e) => setF({ ...f, email: e.target.value })} />
            <small>Ezzel fog belépni. Nem lehet ugyanaz, mint egy meglévő fióké.</small>
          </label>

          <label className="mezo">
            <span>Kezdő jelszó</span>
            <input className="beviteli" type="text" value={f.password}
                   onChange={(e) => setF({ ...f, password: e.target.value })} />
            <small>
              Legalább 6 karakter. Add oda neki, és kérd meg, hogy változtassa meg.
              Ez a mező szándékosan látszik: úgyis le kell írnod valahova.
            </small>
          </label>

          {/* Ez a legvalószínűbb elakadás, ezért itt áll, nem a hibaüzenetben.
              A Supabase beépített levélküldője óránként két levelet enged ki,
              és csak a projekt tagjainak kézbesít — dolgozók felvételére eleve
              alkalmatlan. */}
          <p className="halk" style={{ fontSize: 'var(--m-xs)', lineHeight: 1.5 }}>
            Ha „email rate limit exceeded" hibát kapsz: a Supabase beépített
            levélküldője óránként két levelet enged ki. Kapcsold ki az e-mailes
            megerősítést (Authentication → Sign In / Providers → Email →
            „Confirm email"), vagy állíts be saját levélküldőt. Fiókok törlése
            nem oldja fel, mert a korlát a kiküldött levelekre vonatkozik.
          </p>

          <div className="mezo">
            <span className="cimke">Szerepkör</span>
            <div className="szerep-valaszto">
              {valaszthato.map((r) => (
                <button key={r} type="button"
                        className={f.role === r ? 'aktiv' : ''}
                        onClick={() => setF({ ...f, role: r })}>
                  <strong>{ROLE_LABEL[r]}</strong>
                  <span>{ROLE_LEIRAS[r]}</span>
                </button>
              ))}
            </div>
            {!fejleszto && (
              <small className="halk">
                Tulajdonosként alkalmazottat tudsz felvenni. Másik tulajdonost vagy
                fejlesztői hozzáférést a fejlesztő ad.
              </small>
            )}
          </div>

          {hiba && <div className="hibauzenet">{hiba}</div>}

          <div className="lap-lab">
            <div className="gombok">
              <button className="btn" onClick={onBezar} disabled={megy}>Mégse</button>
              <button className="btn btn-fo" disabled={!keszEnged || megy}
                      onClick={() => void ment()}>
                {megy ? 'Létrehozás…' : 'Létrehozás'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
