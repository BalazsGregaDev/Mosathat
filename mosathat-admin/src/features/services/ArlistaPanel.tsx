import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { CsomagArak, ExtraLista } from './Arlista'
import type { ArlistaFul } from './ArlistaGombok'

export interface PanelAllapot {
  x: number
  y: number
  w: number
  h: number
}

export const PANEL_ALAP: PanelAllapot = { x: 0, y: 0, w: 560, h: 560 }

const MIN_W = 320
const MIN_H = 220
const SZEL = 12
const FELUL = 72

function bevag(a: PanelAllapot): PanelAllapot {
  const maxW = Math.max(MIN_W, window.innerWidth - 2 * SZEL)
  const maxH = Math.max(MIN_H, window.innerHeight - 2 * SZEL)
  const w = Math.min(Math.max(a.w, MIN_W), maxW)
  const h = Math.min(Math.max(a.h, MIN_H), maxH)
  return {
    w,
    h,
    x: Math.min(Math.max(a.x, SZEL), window.innerWidth - w - SZEL),
    y: Math.min(Math.max(a.y, SZEL), window.innerHeight - h - SZEL),
  }
}

function jobbOldalt(w: number, h: number): PanelAllapot {
  return bevag({ w, h, x: window.innerWidth - w - SZEL, y: FELUL })
}

export default function ArlistaPanel({ ful, onFul, onBezar, allapot, onAllapot, osztott }: {
  ful: ArlistaFul
  onFul: (f: ArlistaFul) => void
  onBezar: () => void
  allapot: PanelAllapot
  onAllapot: (a: PanelAllapot) => void
  osztott?: boolean
}) {
  const { catalog: k, refreshCatalog } = useApp()
  const [q, setQ] = useState('')
  const [huzott, setHuzott] = useState<PanelAllapot | null>(null)
  const utolso = useRef<PanelAllapot | null>(null)

  useEffect(() => { refreshCatalog().catch(() => {}) }, [refreshCatalog])

  useEffect(() => {
    document.body.classList.add('arlista-nyitva')
    return () => document.body.classList.remove('arlista-nyitva')
  }, [])

  useEffect(() => {
    if (osztott) return
    const j = allapot.x === 0 && allapot.y === 0
      ? jobbOldalt(allapot.w, allapot.h)
      : bevag(allapot)
    if (j.x !== allapot.x || j.y !== allapot.y || j.w !== allapot.w || j.h !== allapot.h) {
      onAllapot(j)
    }
  }, [allapot, onAllapot, osztott])

  const fogas = useCallback((mod: 'mozgat' | 'meretez') => (e: React.PointerEvent) => {
    if (osztott || e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    const kezdX = e.clientX
    const kezdY = e.clientY
    const kezd = { ...allapot }

    const mozog = (ev: PointerEvent) => {
      const dx = ev.clientX - kezdX
      const dy = ev.clientY - kezdY
      const uj = bevag(mod === 'mozgat'
        ? { ...kezd, x: kezd.x + dx, y: kezd.y + dy }
        : { ...kezd, w: kezd.w + dx, h: kezd.h + dy })
      utolso.current = uj
      setHuzott(uj)
    }

    const vege = () => {
      el.releasePointerCapture(e.pointerId)
      el.removeEventListener('pointermove', mozog)
      el.removeEventListener('pointerup', vege)
      el.removeEventListener('pointercancel', vege)
      if (utolso.current) onAllapot(utolso.current)
      utolso.current = null
      setHuzott(null)
    }

    el.addEventListener('pointermove', mozog)
    el.addEventListener('pointerup', vege)
    el.addEventListener('pointercancel', vege)
  }, [allapot, onAllapot, osztott])

  useEffect(() => {
    if (osztott) return
    const f = () => onAllapot(bevag(allapot))
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [allapot, onAllapot, osztott])

  const latszo = huzott ?? allapot
  const stilus = osztott
    ? undefined
    : { left: latszo.x, top: latszo.y, width: latszo.w, height: latszo.h }

  return (
    <dialog
      open
      className={`arpanel${osztott ? ' osztott' : ''}`}
      aria-label="Árlista"
      style={stilus}
    >
      <div className="arpanel-fej" onPointerDown={fogas('mozgat')}>
        {!osztott && <span className="fogo" aria-hidden="true" />}
        <strong>Árlista</strong>

        <div className="fulek" onPointerDown={(e) => e.stopPropagation()}>
          <button className={ful === 'csomagok' ? 'aktiv' : ''}
                  onClick={() => onFul('csomagok')}>Csomagok</button>
          <button className={ful === 'extrak' ? 'aktiv' : ''}
                  onClick={() => onFul('extrak')}>Egyéb</button>
        </div>

        <button className="bezar" onClick={onBezar} aria-label="Árlista bezárása"
                onPointerDown={(e) => e.stopPropagation()}>×</button>
      </div>

      <div className="arpanel-torzs">
        {!k ? (
          <div className="betolt">Betöltés…</div>
        ) : ful === 'csomagok' ? (
          <CsomagArak k={k} tomor />
        ) : (
          <ExtraLista k={k} q={q} onQ={setQ} tomor />
        )}
      </div>

      {!osztott && (
        <div className="arpanel-meret" onPointerDown={fogas('meretez')}
             aria-hidden="true" title="Húzd a méretezéshez" />
      )}
    </dialog>
  )
}
