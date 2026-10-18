import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

import { useSz } from '../publikus/tartalom'

const MAPPA = '/kepek/galeria'
const PAROK = [2, 3, 4, 5]
const RESET_MS = 2000
const SZEGELY = 0.07
const MERET_MIN = 6
const MERET_MAX = 40
const MERET_ALAP = 16

const koszos = (n: number) => `${MAPPA}/sub${n}a.jpg`
const tiszta = (n: number) => `${MAPPA}/sub${n}b.jpg`

function lagy(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function mozgasCsokkentett() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

interface KepProps {
  n: number
  meret: number
  reset: number
  alt: string
  onMos: () => void
}

function MosoKep({ n, meret, reset, alt, onMos }: KepProps) {
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
        const h = Math.min(sh, H - sy)
        ctx.globalAlpha = ((i + 1) / (sav + 1)) * 0.5
        ctx.drawImage(k, 0, sy, W, h, 0, sy, W, h)
      }
      ctx.globalAlpha = 1
      if (p < 1) kocka = requestAnimationFrame(lep)
      else { ctx.drawImage(k, 0, 0); resetFut.current = false }
    }
    kocka = requestAnimationFrame(lep)
    return () => { cancelAnimationFrame(kocka); resetFut.current = false }
  }, [reset, rajzolTeljes])

  const pont = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget
    const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, r }
  }

  const gyuruMutat = (x: number, y: number, r: DOMRect | null) => {
    const g = gyuru.current
    if (!g) return
    if (!r) { g.style.opacity = '0'; return }
    g.style.opacity = '1'
    g.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
  }

  const mos = (x: number, y: number, r: DOMRect) => {
    const c = vaszon.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !kesz || resetFut.current) return
    const arany = c.width / r.width
    const sugar = ((meret / 100) * r.width * arany) / 2
    const cx = x * arany
    const cy = y * arany
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

  const mozog = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { x, y, r } = pont(e)
    if (e.pointerType === 'mouse') gyuruMutat(x, y, r)
    if (e.pointerType === 'mouse' || nyomva.current) mos(x, y, r)
  }

  const stilus = { '--meret': `${meret}%` } as CSSProperties

  return (
    <div className="kv-moso" ref={doboz} style={stilus} data-kesz={kesz || undefined}>
      {betolt && (
        <>
          <img className="kv-moso-tiszta" src={tiszta(n)} alt={alt} width={1440} height={900} decoding="async" draggable={false} />
          <img className="kv-moso-koszos" ref={kep} src={koszos(n)} alt="" width={1440} height={900} decoding="async" draggable={false}
               onLoad={rajzolTeljes} />
        </>
      )}
      <canvas ref={vaszon} className="kv-moso-vaszon" aria-hidden="true"
              onPointerMove={mozog}
              onPointerEnter={(e) => { if (e.pointerType === 'mouse') utolso.current = null }}
              onPointerLeave={() => { utolso.current = null; nyomva.current = false; gyuruMutat(0, 0, null) }}
              onPointerDown={(e) => {
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

export default function Galeria() {
  const sz = useSz()
  const [meret, setMeret] = useState(MERET_ALAP)
  const [reset, setReset] = useState(0)
  const [mosas, setMosas] = useState(false)
  const [resetAnim, setResetAnim] = useState(false)
  const mosasIdo = useRef<number | undefined>(undefined)
  const resetIdo = useRef<number | undefined>(undefined)

  useEffect(() => () => { window.clearTimeout(mosasIdo.current); window.clearTimeout(resetIdo.current) }, [])

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

  const szivacsMeret = { '--szivacs': (meret - MERET_MIN) / (MERET_MAX - MERET_MIN) } as CSSProperties

  return (
    <section className="kv-galeria">
      <div className="kv-galeria-fej">
        <h2>{sz('galeria.cim')}</h2>
        <p className="kv-bevezeto">{sz('galeria.bevezeto')}</p>
      </div>
      <div className="kv-galeria-eszkozok">
        <input type="range" className="kv-csuszka" min={MERET_MIN} max={MERET_MAX} step={1} value={meret}
               aria-label={sz('galeria.meret')} aria-valuetext={`${meret}%`}
               style={{ '--ertek': (meret - MERET_MIN) / (MERET_MAX - MERET_MIN) } as CSSProperties}
               onChange={(e) => setMeret(Number(e.target.value))} />
        <span className="kv-ikon kv-szivacs" style={szivacsMeret} aria-hidden="true" data-mozog={mosas || undefined}>
          <img src={`${MAPPA}/${mosas ? 'szivacs.gif' : 'szivacs.png'}`} alt="" width={56} height={56} draggable={false} />
        </span>
        <button type="button" className="kv-ikon kv-reset" onClick={visszakoszol} aria-label={sz('galeria.reset')} title={sz('galeria.reset')}
                data-mozog={resetAnim || undefined}>
          <img src={`${MAPPA}/${resetAnim ? 'reset.gif' : 'reset.png'}`} alt="" width={56} height={56} draggable={false} />
        </button>
      </div>
      <div className="kv-galeria-racs">
        {PAROK.map((n) => <MosoKep key={n} n={n} meret={meret} reset={reset} alt={sz('galeria.kep_alt')} onMos={onMos} />)}
      </div>
    </section>
  )
}
