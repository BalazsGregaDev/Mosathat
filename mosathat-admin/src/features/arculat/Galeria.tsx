import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'

import { useSz } from '../publikus/tartalom'

const MAPPA = '/kepek/galeria'
const PAROK = [2, 3, 4, 5]
const BAL = 1
const KEPMERET: Record<number, [number, number]> = { 1: [1440, 628] }
const RESET_MS = 2000
const X_MS = 3000
const SZEGELY = 0.07
const MERET_MIN = 6
const MERET_MAX = 40
const MERET_ALAP = 16
const ERINTO = '(any-pointer: coarse)'

const koszos = (n: number) => `${MAPPA}/sub${n}a.jpg`
const tiszta = (n: number) => `${MAPPA}/sub${n}b.jpg`
const kepmeret = (n: number) => KEPMERET[n] ?? [1440, 900]

function lagy(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function mozgasCsokkentett() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function erintoKepernyo() {
  return typeof window !== 'undefined' && (window.matchMedia?.(ERINTO).matches ?? false)
}

function useErinto() {
  const [erinto, setErinto] = useState(erintoKepernyo)
  useEffect(() => {
    const m = window.matchMedia?.(ERINTO)
    if (!m) return
    const valt = () => setErinto(m.matches)
    m.addEventListener('change', valt)
    return () => m.removeEventListener('change', valt)
  }, [])
  return erinto
}

interface KepProps {
  n: number
  meret: number
  reset: number
  alt: string
  ujjal: boolean
  onMos: () => void
}

function MosoKep({ n, meret, reset, alt, ujjal, onMos }: KepProps) {
  const doboz = useRef<HTMLDivElement>(null)
  const vaszon = useRef<HTMLCanvasElement>(null)
  const kep = useRef<HTMLImageElement>(null)
  const gyuru = useRef<HTMLSpanElement>(null)
  const utolso = useRef<{ x: number; y: number } | null>(null)
  const nyomva = useRef(false)
  const resetFut = useRef(false)
  const elsoReset = useRef(reset)
  const [kesz, setKesz] = useState(false)
  const [betolt, setBetolt] = useState(() => typeof IntersectionObserver === 'undefined')
  const [w, h] = kepmeret(n)

  useEffect(() => {
    const d = doboz.current
    if (!d || typeof IntersectionObserver === 'undefined') return
    const f = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setBetolt(true); f.disconnect() } }, { rootMargin: '300px 0px' })
    f.observe(d)
    return () => f.disconnect()
  }, [])

  const rajzolTeljes = useCallback(() => {
    const c = vaszon.current
    const k = kep.current
    if (!c || !k || !k.naturalWidth) return
    if (c.width !== k.naturalWidth) { c.width = k.naturalWidth; c.height = k.naturalHeight }
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(k, 0, 0)
    setKesz(true)
  }, [])

  useEffect(() => {
    const k = kep.current
    if (betolt && k?.complete && k.naturalWidth) rajzolTeljes()
  }, [betolt, rajzolTeljes])

  useEffect(() => {
    if (reset === elsoReset.current) return
    elsoReset.current = reset
    const c = vaszon.current
    const k = kep.current
    const ctx = c?.getContext('2d')
    if (!c || !k || !ctx || !k.naturalWidth) return
    if (mozgasCsokkentett()) { rajzolTeljes(); return }
    resetFut.current = true
    const W = c.width
    const H = c.height
    const F = Math.round(H * SZEGELY)
    let indul: number | null = null
    let kocka = 0
    const lep = (t: number) => {
      indul ??= t
      const p = Math.min(1, (t - indul) / RESET_MS)
      const y = H - (H + F) * lagy(p)
      ctx.globalCompositeOperation = 'source-over'
      const tele = Math.max(0, Math.ceil(y + F))
      if (tele < H) { ctx.globalAlpha = 1; ctx.drawImage(k, 0, tele, W, H - tele, 0, tele, W, H - tele) }
      const sav = 6
      for (let i = 0; i < sav; i++) {
        const sy = Math.max(0, Math.floor(y + (F * i) / sav))
        const sh = Math.ceil(F / sav) + 1
        if (sy >= H || sy + sh <= 0) continue
        const hh = Math.min(sh, H - sy)
        ctx.globalAlpha = ((i + 1) / (sav + 1)) * 0.5
        ctx.drawImage(k, 0, sy, W, hh, 0, sy, W, hh)
      }
      ctx.globalAlpha = 1
      if (p < 1) kocka = requestAnimationFrame(lep)
      else { ctx.drawImage(k, 0, 0); resetFut.current = false }
    }
    kocka = requestAnimationFrame(lep)
    return () => { cancelAnimationFrame(kocka); resetFut.current = false }
  }, [reset, rajzolTeljes])

  useEffect(() => {
    if (!ujjal) nyomva.current = false
  }, [ujjal])

  const pont = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget
    const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, r }
  }

  const atmero = (r: DOMRect) => {
    const minta = doboz.current?.closest('.kv-galeria')?.querySelector('.kv-galeria-racs .kv-moso')?.getBoundingClientRect().width
    return (meret / 100) * (minta || r.width)
  }

  const gyuruMutat = (x: number, y: number, r: DOMRect | null) => {
    const g = gyuru.current
    if (!g) return
    if (!r) { g.style.opacity = '0'; return }
    const d = `${Math.round(atmero(r))}px`
    g.style.width = d
    g.style.height = d
    g.style.opacity = '1'
    g.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
  }

  const mos = (x: number, y: number, r: DOMRect) => {
    const c = vaszon.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !kesz || resetFut.current) return
    const nagyit = Math.max(r.width / c.width, r.height / c.height)
    const sugar = atmero(r) / nagyit / 2
    const cx = (x - (r.width - c.width * nagyit) / 2) / nagyit
    const cy = (y - (r.height - c.height * nagyit) / 2) / nagyit
    const elozo = utolso.current
    utolso.current = { x: cx, y: cy }
    const pontok: [number, number][] = []
    if (elozo) {
      const tav = Math.hypot(cx - elozo.x, cy - elozo.y)
      const lepes = Math.max(2, sugar * 0.22)
      const db = Math.min(200, Math.ceil(tav / lepes))
      for (let i = 1; i <= db; i++) pontok.push([elozo.x + ((cx - elozo.x) * i) / db, elozo.y + ((cy - elozo.y) * i) / db])
    } else pontok.push([cx, cy])
    ctx.globalCompositeOperation = 'destination-out'
    ctx.globalAlpha = 1
    for (const [px, py] of pontok) {
      const g = ctx.createRadialGradient(px, py, 0, px, py, sugar)
      g.addColorStop(0, 'rgba(0,0,0,1)')
      g.addColorStop(0.55, 'rgba(0,0,0,.9)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(px, py, sugar, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
    onMos()
  }

  const szabad = (e: ReactPointerEvent<HTMLCanvasElement>) => e.pointerType === 'mouse' || ujjal

  const mozog = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { x, y, r } = pont(e)
    if (e.pointerType === 'mouse') gyuruMutat(x, y, r)
    if (e.pointerType === 'mouse' || (nyomva.current && ujjal)) mos(x, y, r)
  }

  return (
    <div className="kv-moso" ref={doboz} style={{ aspectRatio: `${w} / ${h}` }} data-kesz={kesz || undefined}>
      {betolt && (
        <>
          <img className="kv-moso-tiszta" src={tiszta(n)} alt={alt} width={w} height={h} decoding="async" draggable={false} />
          <img className="kv-moso-koszos" ref={kep} src={koszos(n)} alt="" width={w} height={h} decoding="async" draggable={false}
               onLoad={rajzolTeljes} />
        </>
      )}
      <canvas ref={vaszon} className="kv-moso-vaszon" aria-hidden="true"
              onPointerMove={mozog}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') utolso.current = null }}
              onPointerLeave={() => { utolso.current = null; nyomva.current = false; gyuruMutat(0, 0, null) }}
              onPointerDown={(e) => {
                if (!szabad(e)) return
                nyomva.current = true
                utolso.current = null
                const { x, y, r } = pont(e)
                if (e.pointerType !== 'mouse') e.currentTarget.setPointerCapture?.(e.pointerId)
                mos(x, y, r)
              }}
              onPointerUp={() => { nyomva.current = false; utolso.current = null }}
              onPointerCancel={() => { nyomva.current = false; utolso.current = null }} />
      <span className="kv-moso-gyuru" ref={gyuru} aria-hidden="true" />
    </div>
  )
}

export default function Galeria({ gomb }: { gomb?: ReactNode }) {
  const sz = useSz()
  const erinto = useErinto()
  const [meret, setMeret] = useState(MERET_ALAP)
  const [reset, setReset] = useState(0)
  const [mosas, setMosas] = useState(false)
  const [resetAnim, setResetAnim] = useState(false)
  const [szivacs, setSzivacs] = useState(false)
  const [xAnim, setXAnim] = useState(false)
  const mosasIdo = useRef<number | undefined>(undefined)
  const resetIdo = useRef<number | undefined>(undefined)
  const xIdo = useRef<number | undefined>(undefined)
  const ujjal = erinto && szivacs

  useEffect(() => () => {
    window.clearTimeout(mosasIdo.current)
    window.clearTimeout(resetIdo.current)
    window.clearTimeout(xIdo.current)
  }, [])

  useEffect(() => {
    if (!ujjal) return
    const tilt = (e: TouchEvent) => {
      if (e.target instanceof Element && e.target.closest('input[type="range"]')) return
      if (e.cancelable) e.preventDefault()
    }
    const indulY = window.scrollY
    const elnavigal = () => { if (Math.abs(window.scrollY - indulY) > 40) setSzivacs(false) }
    document.addEventListener('touchmove', tilt, { passive: false })
    window.addEventListener('scroll', elnavigal, { passive: true })
    return () => {
      document.removeEventListener('touchmove', tilt)
      window.removeEventListener('scroll', elnavigal)
    }
  }, [ujjal])

  const onMos = useCallback(() => {
    setMosas(true)
    window.clearTimeout(mosasIdo.current)
    mosasIdo.current = window.setTimeout(() => setMosas(false), 700)
  }, [])

  const visszakoszol = () => {
    setReset((r) => r + 1)
    setResetAnim(true)
    window.clearTimeout(resetIdo.current)
    resetIdo.current = window.setTimeout(() => setResetAnim(false), RESET_MS + 200)
  }

  const gorgetesVissza = () => {
    setSzivacs(false)
    setXAnim(true)
    window.clearTimeout(xIdo.current)
    xIdo.current = window.setTimeout(() => setXAnim(false), X_MS)
  }

  const szivacsMeret = { '--szivacs': (meret - MERET_MIN) / (MERET_MAX - MERET_MIN) } as CSSProperties
  const szivacsKep = <img src={`${MAPPA}/${mosas ? 'szivacs.gif' : 'szivacs.png'}`} alt="" width={56} height={56} draggable={false} />
  const kepProps = { meret, reset, alt: sz('galeria.kep_alt'), ujjal, onMos }

  return (
    <section className="kv-galeria" data-ujjal={ujjal || undefined}>
      <div className="kv-galeria-fej">
        <h2>{sz('galeria.cim')}</h2>
        <div className="kv-galeria-szoveg">
          <p className="kv-bevezeto">{sz('galeria.bevezeto')}</p>
          {gomb}
        </div>
      </div>
      <div className="kv-galeria-eszkozok">
        <input type="range" className="kv-csuszka" min={MERET_MIN} max={MERET_MAX} step={1} value={meret}
               aria-label={sz('galeria.meret')} aria-valuetext={`${meret}%`}
               style={{ '--ertek': (meret - MERET_MIN) / (MERET_MAX - MERET_MIN) } as CSSProperties}
               onChange={(e) => setMeret(Number(e.target.value))} />
        {erinto ? (
          <button type="button" className="kv-ikon kv-szivacs kv-szivacs-gomb" style={szivacsMeret} aria-pressed={szivacs}
                  aria-label={sz('galeria.szivacs')} data-mozog={mosas || undefined} onClick={() => setSzivacs((v) => !v)}>
            {szivacsKep}
          </button>
        ) : (
          <span className="kv-ikon kv-szivacs" style={szivacsMeret} aria-hidden="true" data-mozog={mosas || undefined}>
            {szivacsKep}
          </span>
        )}
        <button type="button" className="kv-ikon kv-reset" onClick={visszakoszol} aria-label={sz('galeria.reset')} title={sz('galeria.reset')}
                data-mozog={resetAnim || undefined}>
          <img src={`${MAPPA}/${resetAnim ? 'reset.gif' : 'reset.png'}`} alt="" width={56} height={56} draggable={false} />
        </button>
        {erinto && (
          <button type="button" className="kv-ikon kv-x" onClick={gorgetesVissza} aria-label={sz('galeria.vege')}
                  data-mozog={xAnim || undefined}>
            <img src={`${MAPPA}/${xAnim ? 'x.gif' : 'x.png'}`} alt="" width={56} height={56} draggable={false} />
          </button>
        )}
      </div>
      <div className="kv-galeria-racs">
        {PAROK.map((n) => <MosoKep key={n} n={n} {...kepProps} />)}
      </div>
      <div className="kv-galeria-bal">
        <MosoKep n={BAL} {...kepProps} />
      </div>
    </section>
  )
}
