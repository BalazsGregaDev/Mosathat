import { useState } from 'react'
import { createPortal } from 'react-dom'

import { erintokepernyo } from '../../lib/kepernyo'
import Ablak from './Ablak'

const PERCEK = Array.from({ length: 12 }, (_, i) => i * 5)

export default function IdoMezo({
  id,
  value,
  onChange,
  onKesz,
  ariaLabel,
  className = 'beviteli szam',
  placeholder,
  torolheto,
  cim,
}: {
  id?: string
  value: string
  onChange: (uj: string) => void
  onKesz?: (vegso: string) => void
  ariaLabel?: string
  className?: string
  placeholder?: string
  torolheto?: boolean
  cim?: string
}) {
  const [erinto] = useState(erintokepernyo)
  const [nyitva, setNyitva] = useState(false)

  if (!erinto) {
    return (
      <input id={id} type="time" className={className} step={300} aria-label={ariaLabel}
             value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)}
             onBlur={(e) => onKesz?.(e.target.value)} />
    )
  }

  return (
    <>
      <button type="button" id={id} className={`${className} ido-gomb`}
              aria-label={ariaLabel} aria-haspopup="dialog"
              data-ures={!value || undefined}
              onClick={() => setNyitva(true)}>
        {value || placeholder || '—'}
      </button>
      {nyitva && (
        <IdoPanel
          cim={cim ?? ariaLabel ?? 'Időpont'}
          ertek={value}
          torolheto={torolheto}
          onValt={onChange}
          onBezar={(vegso) => { setNyitva(false); onKesz?.(vegso) }}
        />
      )}
    </>
  )
}

function IdoPanel({ cim, ertek, torolheto, onValt, onBezar }: {
  cim: string
  ertek: string
  torolheto?: boolean
  onValt: (uj: string) => void
  onBezar: (vegso: string) => void
}) {
  const [most, setMost] = useState(ertek)
  const ora = most ? Number(most.slice(0, 2)) : null
  const perc = most ? Number(most.slice(3, 5)) : null

  const orak = Array.from({ length: 16 }, (_, i) => i + 6)
  if (ora !== null && !orak.includes(ora)) orak.push(ora)
  orak.sort((a, b) => a - b)

  const ketjegy = (n: number) => String(n).padStart(2, '0')

  function oraValaszt(o: number) {
    const uj = `${ketjegy(o)}:${ketjegy(perc ?? 0)}`
    setMost(uj)
    onValt(uj)
  }

  function percValaszt(p: number) {
    const uj = `${ketjegy(ora ?? 8)}:${ketjegy(p)}`
    setMost(uj)
    onValt(uj)
    onBezar(uj)
  }

  return createPortal(
    <Ablak osztaly="fedo ido-fedo" cimke={cim} onEsc={() => onBezar(most)} onHatter={() => onBezar(most)}>
      <div className="ido-ablak">
        <div className="ido-fej">
          <span className="ido-cim">{cim}</span>
          <span className="ido-ertek">{most || '—:—'}</span>
        </div>

        <div className="ido-csoport">
          <span className="ido-csoport-cim">Óra</span>
          <div className="ido-racs ido-orak">
            {orak.map((o) => (
              <button key={o} type="button" aria-pressed={o === ora}
                      onClick={() => oraValaszt(o)}>{ketjegy(o)}</button>
            ))}
          </div>
        </div>

        <div className="ido-csoport">
          <span className="ido-csoport-cim">Perc</span>
          <div className="ido-racs ido-percek">
            {PERCEK.map((p) => (
              <button key={p} type="button" aria-pressed={p === perc}
                      data-negyed={p % 15 === 0 || undefined}
                      onClick={() => percValaszt(p)}>:{ketjegy(p)}</button>
            ))}
          </div>
        </div>

        <div className="ido-lab">
          {torolheto && (
            <button type="button" className="btn"
                    onClick={() => { setMost(''); onValt(''); onBezar('') }}>
              Törlés
            </button>
          )}
          <button type="button" className="btn btn-fo" onClick={() => onBezar(most)}>Kész</button>
        </div>
      </div>
    </Ablak>,
    document.body,
  )
}
