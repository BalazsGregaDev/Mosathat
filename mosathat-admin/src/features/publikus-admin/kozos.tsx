import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import './publikus-admin.css'
import type { MentesAllapot } from '../../state/useMentes'

function Jelzo({ allapot, valtozott }: { allapot: MentesAllapot; valtozott: boolean }) {
  if (allapot === 'megy') return <span className="halk">Mentés…</span>
  if (allapot === 'kesz') return <span className="pub-mentve">Mentve, a publikus oldalon már látszik</span>
  if (allapot) return <span className="pub-hiba">{allapot}</span>
  if (valtozott) return <span className="pub-valtozott">Nem mentett változás</span>
  return null
}

export function PubFej({ cim, alcim, linkek, valtozott, allapot, onMent, onElvet }: {
  cim: string
  alcim: ReactNode
  linkek: [string, string][]
  valtozott?: boolean
  allapot?: MentesAllapot
  onMent?: () => void
  onElvet?: () => void
}) {
  return (
    <div className="pub-fej">
      <div className="pub-fej-cim">
        <h2>{cim}</h2>
        <p className="halk">{alcim}</p>
      </div>
      <div className="pub-fej-jobb">
        {linkek.map(([nev, href]) => (
          <a key={href} className="btn btn-kicsi btn-csendes" href={href} target="_blank" rel="noopener">{nev}</a>
        ))}
        {onMent && (
          <>
            <Jelzo allapot={allapot ?? ''} valtozott={Boolean(valtozott)} />
            {valtozott && allapot !== 'megy' && (
              <button type="button" className="btn" onClick={onElvet}>Elvetés</button>
            )}
            <button type="button" className="btn btn-fo" disabled={!valtozott || allapot === 'megy'} onClick={onMent}>
              Mentés
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export function Mezo({ cimke, sugo, children }: { cimke: string; sugo?: ReactNode; children: ReactNode }) {
  return (
    <label className="mezo pub-mezo">
      <span>{cimke}</span>
      {children}
      {sugo && <small>{sugo}</small>}
    </label>
  )
}

export function Elonezet({ szel, keret = false, children }: { szel: number; keret?: boolean; children: ReactNode }) {
  const hely = useRef<HTMLDivElement>(null)
  const [arany, setArany] = useState(1)
  useLayoutEffect(() => {
    const h = hely.current
    if (!h) return
    const szamol = () => setArany(Math.min(1, h.clientWidth / szel))
    szamol()
    const figyelo = new ResizeObserver(szamol)
    figyelo.observe(h)
    return () => figyelo.disconnect()
  }, [szel])
  return (
    <div className="pub-elonezet-hely" ref={hely}>
      <div className={keret ? 'pub-elonezet-lap kv-keret' : 'pub-elonezet-lap'} style={{ width: szel, zoom: arany }}>{children}</div>
    </div>
  )
}
