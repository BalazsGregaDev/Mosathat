import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import type { Catalog } from '../../data'
import { CsomagArak, ExtraLista } from './Arlista'
import type { ArlistaFul } from './ArlistaGombok'

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
//  Két elrendezése van:
//
//  SZABADON — ha nincs megnyitott foglalás. Jobb oldalt nyílik, mozgatható és
//  méretezhető. A mozgatás a KÉPERNYŐN BELÜL marad: a széleken megakad.
//  Enélkül elő tudott fordulni, hogy a fejlécével együtt kicsúszott a
//  látható területről, és nem volt mivel bezárni.
//
//  OSZTOTT — ha van megnyitott foglalás. Ilyenkor nincs helye a találgatásnak:
//  a foglalás a bal, az árlista a jobb oldalra kerül, fixen. Így egyik sem
//  takarja a másikat, és nem kell húzogatni ahhoz, hogy mindkettőt lásd.
// ---------------------------------------------------------------------------

export interface PanelAllapot {
  x: number
  y: number
  w: number
  h: number
}

/** A w és h a kiinduló méret; az x és y nullája azt jelenti: „még nem tette el". */
export const PANEL_ALAP: PanelAllapot = { x: 0, y: 0, w: 560, h: 560 }

const MIN_W = 320
const MIN_H = 220
const SZEL = 12          // ennyit hagyunk a képernyő széleinél
const FELUL = 72         // a fejléc alatt nyílik, nem rá

/**
 * Bevágás a látható területre. Egyetlen helyen dől el, mit jelent az, hogy
 * „bent van": a méret sem nőhet ki, és a pozíció sem csúszhat ki.
 *
 * Előbb a méretet szorítjuk le, aztán a pozíciót — fordítva egy nagy panelnél
 * a pozíció mindig nullára ugrana.
 */
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

/** Kiinduló hely: jobb oldalt, a fejléc alatt. */
function jobbOldalt(w: number, h: number): PanelAllapot {
  return bevag({ w, h, x: window.innerWidth - w - SZEL, y: FELUL })
}

export default function ArlistaPanel({ ful, onFul, onBezar, allapot, onAllapot, osztott }: {
  ful: ArlistaFul
  onFul: (f: ArlistaFul) => void
  onBezar: () => void
  allapot: PanelAllapot
  onAllapot: (a: PanelAllapot) => void
  /** Van megnyitott foglalás: ilyenkor fix helye van a jobb oldalon. */
  osztott?: boolean
}) {
  const { data, catalog } = useApp()
  const [k, setK] = useState<Catalog | null>(catalog)
  const [q, setQ] = useState('')

  useEffect(() => { data.getCatalog().then(setK) }, [data])

  // Ha még nincs eltett hely, vagy a mentett hely időközben kilógna (kisebb
  // lett az ablak), akkor visszatesszük a jobb oldalra.
  useEffect(() => {
    if (osztott) return
    const j = allapot.x === 0 && allapot.y === 0
      ? jobbOldalt(allapot.w, allapot.h)
      : bevag(allapot)
    if (j.x !== allapot.x || j.y !== allapot.y || j.w !== allapot.w || j.h !== allapot.h) {
      onAllapot(j)
    }
  }, [allapot, onAllapot, osztott])

  /**
   * Húzás és méretezés ugyanazzal a mintával: pointer capture. Enélkül a
   * mozgatás megakad, amint a kurzor kifut a fogantyúról — például ha
   * gyorsan rántod odébb.
   */
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
      // A bevágás mindkét módra ugyanaz: a panel egésze a képernyőn belül
      // marad. A széleken egyszerűen megáll.
      onAllapot(bevag(mod === 'mozgat'
        ? { ...kezd, x: kezd.x + dx, y: kezd.y + dy }
        : { ...kezd, w: kezd.w + dx, h: kezd.h + dy }))
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
  }, [allapot, onAllapot, osztott])

  // Ablakméret-változáskor visszahúzzuk a képbe. Enélkül egy kisebbre húzott
  // böngészőablakban a panel kint ragadna, bezárhatatlanul.
  useEffect(() => {
    if (osztott) return
    const f = () => onAllapot(bevag(allapot))
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [allapot, onAllapot, osztott])

  const stilus = osztott
    ? undefined
    : { left: allapot.x, top: allapot.y, width: allapot.w, height: allapot.h }

  return (
    <div
      className={`arpanel${osztott ? ' osztott' : ''}`}
      role="dialog"
      aria-label="Árlista"
      style={stilus}
    >
      {/* A fejléc a fogantyú. A gombok nem: azokon a pointerdown nem indít
          húzást, különben a fülváltás közben elmozdulna az ablak. */}
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
          <ExtraLista k={k} q={q} onQ={setQ} />
        )}
      </div>

      {!osztott && (
        <div className="arpanel-meret" onPointerDown={fogas('meretez')}
             aria-hidden="true" title="Húzd a méretezéshez" />
      )}
    </div>
  )
}
