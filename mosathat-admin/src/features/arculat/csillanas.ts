import { useEffect, type RefObject } from 'react'

export function useCsillanas(gyoker: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const g = gyoker.current
    if (!g) return
    const csokkentett = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let kocka = 0
    const frissit = () => {
      kocka = 0
      const vh = window.innerHeight || 1
      for (const e of Array.from(g.querySelectorAll<HTMLElement>('[data-csillan]'))) {
        const r = e.getBoundingClientRect()
        if (r.bottom < -80 || r.top > vh + 80) continue
        const p = csokkentett ? 0.5 : Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)))
        e.style.setProperty('--feny', p.toFixed(4))
        e.style.setProperty('--feny-kozep', (1 - Math.abs(2 * p - 1)).toFixed(4))
      }
    }
    const kerel = () => { if (!kocka) kocka = requestAnimationFrame(frissit) }
    frissit()
    const kesobb = window.setTimeout(frissit, 400)
    if (csokkentett) return () => window.clearTimeout(kesobb)
    document.addEventListener('scroll', kerel, { capture: true, passive: true })
    window.addEventListener('resize', kerel)
    return () => {
      window.clearTimeout(kesobb)
      cancelAnimationFrame(kocka)
      document.removeEventListener('scroll', kerel, { capture: true })
      window.removeEventListener('resize', kerel)
    }
  }, [gyoker])
}

export function useVaszonSzin(gyoker: RefObject<HTMLElement | null>, be: boolean) {
  useEffect(() => {
    const g = gyoker.current
    if (!be || !g) return
    const html = document.documentElement
    let kocka = 0
    const frissit = () => {
      kocka = 0
      const s = getComputedStyle(g)
      const lent = window.scrollY > (html.scrollHeight - window.innerHeight) / 2
      const szin = (lent ? s.getPropertyValue('--lakk-mely') : s.getPropertyValue('--bg')).trim()
      if (szin) html.style.backgroundColor = szin
    }
    const kerel = () => { if (!kocka) kocka = requestAnimationFrame(frissit) }
    frissit()
    window.addEventListener('scroll', kerel, { passive: true })
    window.addEventListener('resize', kerel)
    return () => {
      cancelAnimationFrame(kocka)
      window.removeEventListener('scroll', kerel)
      window.removeEventListener('resize', kerel)
      html.style.backgroundColor = ''
    }
  }, [gyoker, be])
}
