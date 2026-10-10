import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const SZELES = 280
const RES = 8

export default function Sugo({ cim, szoveg }: { cim: string; szoveg: string }) {
  const [nyitva, setNyitva] = useState(false)
  const [hely, setHely] = useState<{ top: number; left: number } | null>(null)
  const gomb = useRef<HTMLButtonElement>(null)
  const buborek = useRef<HTMLDivElement>(null)
  const kattintva = useRef(false)

  function helyre() {
    const g = gomb.current?.getBoundingClientRect()
    if (!g) return
    const left = Math.min(
      Math.max(RES, g.right - SZELES),
      window.innerWidth - SZELES - RES,
    )
    setHely({ top: g.bottom + 6, left })
  }

  useLayoutEffect(() => {
    if (!nyitva || !hely) return
    const b = buborek.current?.getBoundingClientRect()
    const g = gomb.current?.getBoundingClientRect()
    if (!b || !g) return
    if (b.bottom > window.innerHeight - RES) {
      const fent = g.top - b.height - 6
      if (fent >= RES) setHely((h) => (h && h.top !== fent ? { ...h, top: fent } : h))
    }
  }, [nyitva, hely])

  useEffect(() => {
    if (!nyitva) return
    const zar = () => { kattintva.current = false; setNyitva(false) }
    const kint = (e: PointerEvent) => {
      if (gomb.current?.contains(e.target as Node)) return
      if (buborek.current?.contains(e.target as Node)) return
      zar()
    }
    const bill = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      zar()
    }
    document.addEventListener('pointerdown', kint, true)
    document.addEventListener('keydown', bill, true)
    window.addEventListener('scroll', zar, true)
    window.addEventListener('resize', zar)
    return () => {
      document.removeEventListener('pointerdown', kint, true)
      document.removeEventListener('keydown', bill, true)
      window.removeEventListener('scroll', zar, true)
      window.removeEventListener('resize', zar)
    }
  }, [nyitva])

  function nyit() { helyre(); setNyitva(true) }

  return (
    <>
      <button
        ref={gomb}
        type="button"
        className="sugo-gomb"
        aria-label={`${cim} — leírás`}
        aria-expanded={nyitva}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (kattintva.current) { kattintva.current = false; setNyitva(false) }
          else { kattintva.current = true; nyit() }
        }}
        onMouseEnter={nyit}
        onMouseLeave={() => { if (!kattintva.current) setNyitva(false) }}
        onFocus={nyit}
        onBlur={() => { if (!kattintva.current) setNyitva(false) }}
      >
        i
      </button>

      {nyitva && hely && (
        <div
          ref={buborek}
          className="sugo-buborek"
          role="tooltip"
          style={{ top: hely.top, left: hely.left, width: SZELES }}
        >
          <div className="sugo-cim">{cim}</div>
          <div className="sugo-szoveg">{szoveg}</div>
        </div>
      )}
    </>
  )
}
