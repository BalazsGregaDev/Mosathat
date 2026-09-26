import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import type { Catalog } from '../../data'
import { CsomagArak, ExtraLista } from './Arlista'

// ---------------------------------------------------------------------------
//  Lebegő árlista
//
//  Telefonálás közben az ügyfél belekérdez: „és a kárpittisztítás mennyi?",
//  „a Premiumban benne van a viaszolás?". Ilyenkor nem lehet elnavigálni a
//  félig kitöltött foglalásról.
//
//  Ezért ez NEM modális ablak:
//
//    – nincs mögötte sötét háttér, ami letiltaná a többit
//    – a mellé kattintás NEM zárja be; csak az X
//    – Escape sem zárja, mert azt a foglalási ablak használja — ha mindkettő
//      figyelné, egy billentyű két dolgot csukna be
//    – a foglalási ablak FÖLÖTT lebeg, így írás közben is látszik
//
//  Mozgatható és méretezhető, mert nem tudhatjuk, a képernyő melyik részén
//  van útban. A helyét és a méretét a hívó tárolja, így ugyanoda és ugyanakkora
//  méretben nyílik vissza, ahogy legutóbb beállította.
//
//  Telefonon mindez értelmetlen: ott alulról feljövő lapként áll, fix helyen.
// ---------------------------------------------------------------------------

export interface PanelAllapot {
  x: number
  y: number
  w: number
  h: number
}

export const PANEL_ALAP: PanelAllapot = { x: 0, y: 0, w: 560, h: 520 }

const MIN_W = 320
const MIN_H = 220

export default function ArlistaPanel({ ful, onFul, onBezar, allapot, onAllapot }: {
  ful: 'csomagok' | 'extrak'
  onFul: (f: 'csomagok' | 'extrak') => void
  onBezar: () => void
  allapot: PanelAllapot
  onAllapot: (a: PanelAllapot) => void
}) {
  const { data, catalog } = useApp()
  const [k, setK] = useState<Catalog | null>(catalog)
  const [q, setQ] = useState('')
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => { data.getCatalog().then(setK) }, [data])

  // Első megnyitáskor a jobb felső sarok környékére tesszük — ott a legkisebb
  // az esély, hogy pont a foglalási űrlapot takarja el.
  useEffect(() => {
    if (allapot.x !== 0 || allapot.y !== 0) return
    onAllapot({
      ...allapot,
      x: Math.max(16, window.innerWidth - allapot.w - 32),
      y: 96,
    })
  }, [allapot, onAllapot])

  /**
   * Húzás és méretezés ugyanazzal a mintával: pointer capture. Enélkül a
   * mozgatás megakad, amint a kurzor kifut a fogantyúról — például ha
   * gyorsan rántod odébb.
   */
  const fogas = useCallback((mod: 'mozgat' | 'meretez') => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    const kezdX = e.clientX
    const kezdY = e.clientY
    const kezd = { ...allapot }

    const mozog = (ev: PointerEvent) => {
      const dx = ev.clientX - kezdX
      const dy = ev.clientY - kezdY

      if (mod === 'mozgat') {
        // Nem engedjük kicsúszni a képernyőről: a fejlécnek mindig maradnia
        // kell annyi, amibe bele lehet kapaszkodni.
        onAllapot({
          ...kezd,
          x: Math.min(Math.max(-kezd.w + 120, kezd.x + dx), window.innerWidth - 120),
          y: Math.min(Math.max(0, kezd.y + dy), window.innerHeight - 48),
        })
      } else {
        onAllapot({
          ...kezd,
          w: Math.max(MIN_W, Math.min(kezd.w + dx, window.innerWidth - 24)),
          h: Math.max(MIN_H, Math.min(kezd.h + dy, window.innerHeight - 24)),
        })
      }
    }

    const vege = () => {
      el.releasePointerCapture(e.pointerId)
      el.removeEventListener('pointermove', mozog)
      el.removeEventListener('pointerup', vege)
      el.removeEventListener('pointercancel', vege)
    }

    el.addEventListener('pointermove', mozog)
    el.addEventListener('pointerup', vege)
    el.addEventListener('pointercancel', vege)
  }, [allapot, onAllapot])

  // Ablakméret-változáskor visszahúzzuk a képbe, ha kilógna.
  useEffect(() => {
    const f = () => {
      const x = Math.min(allapot.x, window.innerWidth - 120)
      const y = Math.min(allapot.y, window.innerHeight - 48)
      if (x !== allapot.x || y !== allapot.y) onAllapot({ ...allapot, x, y })
    }
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [allapot, onAllapot])

  return (
    <div
      ref={panel}
      className="arpanel"
      role="dialog"
      aria-label="Árlista"
      style={{ left: allapot.x, top: allapot.y, width: allapot.w, height: allapot.h }}
    >
      {/* A fejléc a fogantyú. A gombok nem: azokon a pointerdown nem indít
          húzást, különben a fülváltás közben elmozdulna az ablak. */}
      <div className="arpanel-fej" onPointerDown={fogas('mozgat')}>
        <span className="fogo" aria-hidden="true" />
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
          <ExtraLista k={k} q={q} onQ={setQ} />
        )}
      </div>

      <div className="arpanel-meret" onPointerDown={fogas('meretez')}
           aria-hidden="true" title="Húzd a méretezéshez" />
    </div>
  )
}
