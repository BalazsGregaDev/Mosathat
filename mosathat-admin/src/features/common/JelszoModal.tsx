import { useEffect, useRef, useState } from 'react'
import { urlapMegnyilt } from '../../lib/kepernyo'
import { hibaSzoveg } from '../../lib/format'

const MIN = 8

export default function JelszoModal({ kinek, sajat, onMent, onBezar }: {
  kinek: string
  sajat: boolean
  onMent: (mostani: string, uj: string) => Promise<void>
  onBezar: () => void
}) {
  const [mostani, setMostani] = useState('')
  const [uj, setUj] = useState('')
  const [megint, setMegint] = useState('')
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const elso = useRef<HTMLInputElement>(null)

  useEffect(() => { urlapMegnyilt(elso.current) }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !megy) onBezar() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onBezar, megy])

  const rovid = uj.length > 0 && uj.length < MIN
  const elter = megint.length > 0 && uj !== megint
  const kesz = uj.length >= MIN && uj === megint && (!sajat || mostani.length > 0)

  async function ment() {
    if (!kesz || megy) return
    setMegy(true)
    setHiba(null)
    try {
      await onMent(mostani, uj)
      onBezar()
    } catch (e) {
      setHiba(hibaSzoveg(e))
      setMegy(false)
    }
  }

  return (
    <div className="fedo" role="presentation"
         onMouseDown={(e) => { if (e.target === e.currentTarget && !megy && !mostani && !uj && !megint) onBezar() }}>
      <div className="lap" role="dialog" aria-modal="true" aria-label="Jelszó megadása">
        <div className="lap-fej">
          <div>
            <h2>Jelszó</h2>
            <div className="halk" style={{ fontSize: 'var(--m-sm)' }}>{kinek}</div>
          </div>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás" disabled={megy}>×</button>
        </div>

        <div className="lap-torzs">
          {hiba && <div className="hibauzenet">{hiba}</div>}

          {!sajat && (
            <div className="figyelmeztet">
              <span>
                Az új jelszót <strong>neked kell átadnod</strong> neki — a rendszer
                nem küld róla levelet. Érdemes olyat adni, amit belépés után
                átír magának.
              </span>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); void ment() }}>
            {sajat && (
              <label className="mezo">
                <span>Mostani jelszó</span>
                <input ref={elso} className="beviteli" type="password"
                       autoComplete="current-password"
                       value={mostani} disabled={megy}
                       onChange={(e) => setMostani(e.target.value)} />
              </label>
            )}

            <label className="mezo">
              <span>Új jelszó</span>
              <input ref={sajat ? undefined : elso} className="beviteli" type="password"
                     autoComplete="new-password"
                     value={uj} disabled={megy}
                     onChange={(e) => setUj(e.target.value)} />
              <small className={rovid ? 'hibaszoveg' : undefined}>
                Legalább {MIN} karakter.
              </small>
            </label>

            <label className="mezo">
              <span>Új jelszó még egyszer</span>
              <input className="beviteli" type="password" autoComplete="new-password"
                     value={megint} disabled={megy}
                     onChange={(e) => setMegint(e.target.value)} />
              {elter && <small className="hibaszoveg">A két jelszó nem egyezik.</small>}
            </label>

            <div className="urlap-lab">
              <button type="button" className="btn btn-csendes" onClick={onBezar} disabled={megy}>
                Mégse
              </button>
              <button type="submit" className="btn btn-fo" disabled={!kesz || megy}>
                {megy ? 'Mentés…' : 'Jelszó mentése'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
