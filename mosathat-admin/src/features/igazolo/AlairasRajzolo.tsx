import { useEffect, useRef, useState } from 'react'

const MAGASSAG = 150
const KEP_MAX_SZEL = 600

function levagott(c: HTMLCanvasElement): string | null {
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const { width: w, height: h } = c
  const px = ctx.getImageData(0, 0, w, h).data
  let bal = w, jobb = -1, fent = h, lent = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 0) {
        if (x < bal) bal = x
        if (x > jobb) jobb = x
        if (y < fent) fent = y
        if (y > lent) lent = y
      }
    }
  }
  if (jobb < 0) return null
  const sz = Math.round(6 * (window.devicePixelRatio || 1))
  bal = Math.max(0, bal - sz); fent = Math.max(0, fent - sz)
  jobb = Math.min(w - 1, jobb + sz); lent = Math.min(h - 1, lent + sz)
  const kw = jobb - bal + 1
  const kh = lent - fent + 1
  const arany = Math.min(1, KEP_MAX_SZEL / kw)
  const ki = document.createElement('canvas')
  ki.width = Math.max(1, Math.round(kw * arany))
  ki.height = Math.max(1, Math.round(kh * arany))
  ki.getContext('2d')?.drawImage(c, bal, fent, kw, kh, 0, 0, ki.width, ki.height)
  return ki.toDataURL('image/png')
}

export default function AlairasRajzolo({
  ertek,
  onValt,
  zarolt,
}: {
  ertek: string | null
  onValt: (kep: string | null) => void
  zarolt?: boolean
}) {
  const vaszon = useRef<HTMLCanvasElement>(null)
  const rajzol = useRef(false)
  const utolso = useRef<{ x: number; y: number } | null>(null)
  const [rajzMod, setRajzMod] = useState(!ertek)
  const [ures, setUres] = useState(true)

  useEffect(() => {
    if (!rajzMod) return
    const c = vaszon.current
    if (!c) return
    const beallit = (megtart: boolean) => {
      const dpr = window.devicePixelRatio || 1
      const ujSzel = Math.round(c.clientWidth * dpr)
      const ujMag = Math.round(MAGASSAG * dpr)
      if (megtart && c.width === ujSzel && c.height === ujMag) return
      let regi: HTMLCanvasElement | null = null
      if (megtart && c.width > 0 && c.height > 0) {
        regi = document.createElement('canvas')
        regi.width = c.width
        regi.height = c.height
        regi.getContext('2d')?.drawImage(c, 0, 0)
      }
      c.width = ujSzel
      c.height = ujMag
      const ctx = c.getContext('2d')
      if (!ctx) return
      if (regi) ctx.drawImage(regi, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#111'
    }
    beallit(false)
    setUres(true)
    if (typeof ResizeObserver === 'undefined') return
    const figyelo = new ResizeObserver(() => beallit(true))
    figyelo.observe(c)
    return () => figyelo.disconnect()
  }, [rajzMod])

  function pont(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function le(e: React.PointerEvent<HTMLCanvasElement>) {
    if (zarolt) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    rajzol.current = true
    utolso.current = pont(e)
    const ctx = e.currentTarget.getContext('2d')
    if (ctx && utolso.current) {
      ctx.beginPath()
      ctx.arc(utolso.current.x, utolso.current.y, 1.2, 0, Math.PI * 2)
      ctx.fillStyle = '#111'
      ctx.fill()
    }
  }

  function mozog(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!rajzol.current || !utolso.current) return
    const ctx = e.currentTarget.getContext('2d')
    if (!ctx) return
    const p = pont(e)
    ctx.beginPath()
    ctx.moveTo(utolso.current.x, utolso.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    utolso.current = p
  }

  function fel() {
    if (!rajzol.current) return
    rajzol.current = false
    utolso.current = null
    setUres(false)
    const c = vaszon.current
    if (c) onValt(levagott(c))
  }

  function torol() {
    const c = vaszon.current
    const ctx = c?.getContext('2d')
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height)
    setUres(true)
    onValt(null)
  }

  if (!rajzMod && ertek) {
    return (
      <div className="alairas">
        <div className="alairas-kep">
          <img src={ertek} alt="Aláírás" />
        </div>
        {!zarolt && (
          <div className="alairas-gombok">
            <button type="button" className="btn btn-kicsi" onClick={() => setRajzMod(true)}>
              Újra aláírás
            </button>
            <button type="button" className="btn btn-kicsi btn-veszelyes"
                    onClick={() => { onValt(null); setRajzMod(true) }}>
              Aláírás törlése
            </button>
          </div>
        )}
      </div>
    )
  }

  if (zarolt) {
    return <div className="alairas-ures halvany">nincs aláírva</div>
  }

  return (
    <div className="alairas">
      <canvas
        ref={vaszon}
        className="alairas-vaszon"
        style={{ height: MAGASSAG }}
        aria-label="Aláírás: írj alá ujjal ebben a mezőben"
        onPointerDown={le}
        onPointerMove={mozog}
        onPointerUp={fel}
        onPointerCancel={fel}
      />
      <div className="alairas-gombok">
        <span className="halk" style={{ fontSize: 'var(--m-xs)' }}>
          {ures ? 'Írj alá ujjal a fenti mezőben.' : 'Aláírva.'}
        </span>
        <button type="button" className="btn btn-kicsi" onClick={torol} disabled={ures}>
          Újra
        </button>
      </div>
    </div>
  )
}
