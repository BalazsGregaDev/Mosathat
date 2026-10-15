import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import type { CompanyCandidate, CompanyHit } from '../../lib/types'
import Ablak from './Ablak'

export interface CegErtek {
  id: string | null
  nev: string
}

export const URES_CEG: CegErtek = { id: null, nev: '' }

export function CegValaszto({
  ertek,
  onValt,
  inputId,
  disabled,
  onKilep,
}: {
  ertek: CegErtek
  onValt: (uj: CegErtek) => void
  inputId?: string
  disabled?: boolean
  onKilep?: () => void
}) {
  const { data } = useApp()
  const [talalatok, setTalalatok] = useState<CompanyHit[]>([])
  const [nyitva, setNyitva] = useState(false)

  useEffect(() => {
    const q = ertek.nev.trim()
    if (!nyitva || ertek.id || q.length < 1) { setTalalatok([]); return }
    let el = true
    const idozito = window.setTimeout(async () => {
      try {
        const r = await data.searchCompanies(q, 6)
        if (el) setTalalatok(r)
      } catch {
        if (el) setTalalatok([])
      }
    }, 200)
    return () => { el = false; window.clearTimeout(idozito) }
  }, [ertek.nev, ertek.id, nyitva, data])

  const valaszt = (h: CompanyHit) => {
    onValt({ id: h.id, nev: h.name })
    setNyitva(false)
    setTalalatok([])
  }

  return (
    <div className="kereso ceg-kereso">
      <input
        id={inputId}
        className="beviteli"
        value={ertek.nev}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => { onValt({ id: null, nev: e.target.value }); setNyitva(true) }}
        onFocus={() => setNyitva(true)}
        onBlur={() => { setNyitva(false); onKilep?.() }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); setNyitva(false) }
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
        }}
      />

      {ertek.nev.trim() !== '' && (
        <small className={`ceg-allapot ${ertek.id ? 'meglevo' : 'uj'}`}>
          {ertek.id ? 'meglévő cég' : 'új cég lesz, ha nincs ilyen'}
        </small>
      )}

      {nyitva && talalatok.length > 0 && (
        <div className="talalatlista">
          {talalatok.map((h) => (
            <button key={h.id} type="button" className="talalatsor"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => valaszt(h)}>
              <span className="nev">{h.name}</span>
              {h.szerzodes && <span className="cimke-pill szerzodes-pill">szerződés</span>}
              <span className="auto halk">
                {h.jarmuvek > 0 ? `${h.jarmuvek} autó` : `${h.ugyfelek} ügyfél`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function useCegEgyeztetes(): [React.ReactNode, (e: CegErtek) => Promise<CegErtek | null>] {
  const { data } = useApp()
  const [kerdes, setKerdes] = useState<{ nev: string; jeloltek: CompanyCandidate[] } | null>(null)
  const valasz = useRef<((v: CegErtek | null) => void) | null>(null)

  const egyeztet = useCallback(async (e: CegErtek): Promise<CegErtek | null> => {
    const nev = e.nev.trim()
    if (e.id || nev === '') return { id: e.id, nev }

    const jeloltek = await data.companyCandidates(nev)
    const azonos = jeloltek.find((j) => j.egyezes === 'AZONOS')
    if (azonos) return { id: azonos.id, nev: azonos.name }
    if (jeloltek.length === 0) return { id: null, nev }

    valasz.current?.(null)
    setKerdes({ nev, jeloltek })
    return new Promise<CegErtek | null>((resolve) => { valasz.current = resolve })
  }, [data])

  const lezar = useCallback((v: CegErtek | null) => {
    valasz.current?.(v)
    valasz.current = null
    setKerdes(null)
  }, [])

  const ablak = kerdes ? createPortal(
    <Ablak osztaly="fedo kerdes-fedo" szerep="alertdialog" cimkeId="ceg-kerdes"
           onEsc={() => lezar(null)} onHatter={() => lezar(null)}>
      <div className="kerdes-ablak">
        <h2 id="ceg-kerdes">Erre a cégre gondoltál?</h2>
        <p>
          Hasonló nevű cég már van a rendszerben. Ha ugyanaz, válaszd ki — különben
          két külön cég lesz belőle, és az autók nem kerülnek egy helyre.
        </p>
        <div className="ceg-jeloltek">
          {kerdes.jeloltek.map((j) => (
            <button key={j.id} type="button" className="btn btn-fo"
                    onClick={() => lezar({ id: j.id, nev: j.name })}>
              Igen: {j.name}
            </button>
          ))}
          <button type="button" className="btn" onClick={() => lezar({ id: null, nev: kerdes.nev })}>
            Nem, ez új cég: {kerdes.nev}
          </button>
        </div>
      </div>
    </Ablak>,
    document.body,
  ) : null

  return [ablak, egyeztet]
}
