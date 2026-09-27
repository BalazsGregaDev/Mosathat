import { useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
//  Elég széles-e a képernyő?
//
//  Van, amit nem lehet csak CSS-sel megoldani. A Szolgáltatásoknál például
//  széles képernyőn a csomagok és az egyéb szolgáltatások EGYMÁS MELLETT
//  vannak, keskenyen viszont külön fülön. Ha csak elrejtenénk az egyiket,
//  akkor az ablak átméretezésekor ott maradna egy fül, ami már semmit nem
//  mutat — vagy egy tartalom, ami kétszer szerepel a lapon.
//
//  A töréspont ugyanaz, mint a CSS-ben. Ha az egyiket átírod, a másikat is
//  át kell — ezért van kiírva mindkét helyre, hogy melyik a párja.
// ---------------------------------------------------------------------------

export function useSzeles(px: number): boolean {
  const kerdes = `(min-width: ${px}px)`
  const [szeles, setSzeles] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(kerdes).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(kerdes)
    const valt = () => setSzeles(mq.matches)
    valt()
    mq.addEventListener('change', valt)
    return () => mq.removeEventListener('change', valt)
  }, [kerdes])

  return szeles
}
