import { useState } from 'react'
import { useApp } from '../../state/AppContext'
import { DEMO_BELEPOK } from '../../data/demo'
import { ROLE_LABEL } from '../../lib/types'

// A demó mód jelszó nélkül lép be. A képernyő azért van meg most is, mert
// élesben ez lesz az első dolog, amit a dolgozó lát reggel.
//
// Demóban a három szerepkör közül lehet választani. Nem játék: a három
// belépő ugyanaz a három szerepkör, ami élesben lesz, és az adatbázis is
// annak látja, aki belép — vagyis tényleg az látszik, mit tud egy alkalmazott.

export default function LoginScreen() {
  const { data, signIn } = useApp()
  const [email, setEmail] = useState(data.isDemo ? 'demo@mosathat.hu' : '')
  const [jelszo, setJelszo] = useState('')
  const [hiba, setHiba] = useState<string | null>(null)
  const [fut, setFut] = useState(false)

  async function kuld(e: React.FormEvent) {
    e.preventDefault()
    setFut(true)
    setHiba(null)
    try {
      await signIn(email, jelszo)
    } catch (err) {
      setHiba(err instanceof Error ? err.message : String(err))
    } finally {
      setFut(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--sotet)',
        padding: 'var(--t5)',
      }}
    >
      <form
        onSubmit={kuld}
        style={{
          width: 'min(380px, 100%)',
          background: 'var(--lap)',
          borderRadius: 'var(--r-lg)',
          padding: 'var(--t6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--t4)',
          boxShadow: 'var(--arnyek-lg)',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 'var(--m-lg)',
              fontWeight: 'var(--vastag-fej)',
              letterSpacing: '.14em',
              textTransform: 'uppercase',
            }}
          >
            Mosathat
          </div>
          <div className="halk" style={{ fontSize: 'var(--m-sm)' }}>
            Autókozmetika — belső rendszer
          </div>
        </div>

        <div className="mezo">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            className="beviteli"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="mezo">
          <label htmlFor="jelszo">Jelszó</label>
          <input
            id="jelszo"
            className="beviteli"
            type="password"
            autoComplete="current-password"
            value={jelszo}
            onChange={(e) => setJelszo(e.target.value)}
            placeholder={data.isDemo ? 'demóban nem kell' : ''}
            required={!data.isDemo}
          />
        </div>

        {hiba && <div className="hibauzenet">{hiba}</div>}

        <button className="btn btn-fo" type="submit" disabled={fut} style={{ padding: '12px' }}>
          {fut ? 'Belépés…' : 'Belépés'}
        </button>

        {data.isDemo && (
          <>
            <div className="demo-belepok">
              <div className="cimke">Kiként lépsz be</div>
              {DEMO_BELEPOK.map((b) => (
                <button key={b.email} type="button"
                        className={email === b.email ? 'aktiv' : ''}
                        onClick={() => setEmail(b.email)}>
                  <strong>{ROLE_LABEL[b.role]}</strong>
                  <span>{b.name}</span>
                </button>
              ))}
            </div>
            <p className="halk" style={{ fontSize: 'var(--m-xs)', textAlign: 'center' }}>
              Demó mód: az adatbázis a böngészőben fut, próbaadatokkal.
              <br />
              Az itt felvitt foglalások a lap újratöltésekor eltűnnek.
            </p>
          </>
        )}
      </form>
    </div>
  )
}
