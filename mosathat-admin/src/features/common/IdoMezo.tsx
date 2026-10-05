import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// ---------------------------------------------------------------------------
//  Időpont mező — érintőképernyőn saját, gombos választóval
//
//  A böngésző beépített időválasztója a Samsung tableten használhatatlan
//  (kis óralap, nehezen eltalálható számok). Ezért ÉRINTŐKÉPERNYŐN (telefon,
//  tablet) a mező egy gomb, ami egy saját panelt nyit:
//
//      Óra    [06][07][08][09][10][11][12][13]
//             [14][15][16][17][18][19][20][21]
//      Perc   [:00][:05][:10][:15][:20][:25]
//             [:30][:35][:40][:45][:50][:55]
//                                   [Törlés] [Kész]
//
//  Két koppintás: előbb az óra, aztán a perc — a perc után a panel magától
//  bezárul. Ha csak az órát kell átírni, az óra után a „Kész" gomb.
//
//  EGÉRREL (asztali gépen) marad a sima időmező: ott a beírás a leggyorsabb.
//  Mindkét esetben ugyanazt adja vissza: "HH:MM" szöveget (vagy üreset).
// ---------------------------------------------------------------------------

/** Érintőképernyős-e az eszköz (durva mutató: ujj). */
function erintoE(): boolean {
  try { return window.matchMedia('(pointer: coarse)').matches } catch { return false }
}

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
  /** "HH:MM" vagy üres. */
  value: string
  onChange: (uj: string) => void
  /** A választás vége (panel bezárva / a mező elhagyva) — az utolsó értékkel. */
  onKesz?: (vegso: string) => void
  ariaLabel?: string
  className?: string
  placeholder?: string
  /** Lehet-e üresre törölni (pl. a Viszi órája: „nincs megbeszélve"). */
  torolheto?: boolean
  /** A panel címe (pl. „Hozza — óra"). Alapból az ariaLabel. */
  cim?: string
}) {
  const [erinto] = useState(erintoE)
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
  // A panelen belül is követjük az értéket: a perc gomb az épp választott
  // órához kell.
  const [most, setMost] = useState(ertek)
  const ora = most ? Number(most.slice(0, 2)) : null
  const perc = most ? Number(most.slice(3, 5)) : null

  // Az órák: 6-tól 21-ig; ha a mostani érték ezen kívül esik, az is.
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
    onBezar(uj)                       // a perc után kész: bezárjuk
  }

  // Escape: csak ezt a panelt zárja, az alatta lévő ablakot nem.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onBezar(most)
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onBezar, most])

  return createPortal(
    <div className="fedo ido-fedo" role="presentation"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onBezar(most) }}>
      <div className="ido-ablak" role="dialog" aria-modal="true" aria-label={cim}>
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
    </div>,
    document.body,
  )
}
