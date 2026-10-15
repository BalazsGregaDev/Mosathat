import { useEffect, useState } from 'react'

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
