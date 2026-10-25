import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

interface Kereso {
  nyitva: boolean
  nyit: () => void
  zar: () => void
}

const KeresoKontextus = createContext<Kereso | null>(null)

export const KERESO_HASH = '#foglalasom'

export function KeresoAllapot({ children }: { children: ReactNode }) {
  const [nyitva, setNyitva] = useState(() => window.location.hash === KERESO_HASH)

  useEffect(() => {
    const figyel = () => { if (window.location.hash === KERESO_HASH) setNyitva(true) }
    window.addEventListener('hashchange', figyel)
    return () => window.removeEventListener('hashchange', figyel)
  }, [])

  const nyit = useCallback(() => setNyitva(true), [])
  const zar = useCallback(() => {
    setNyitva(false)
    if (window.location.hash === KERESO_HASH) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
    }
  }, [])
  const ertek = useMemo(() => ({ nyitva, nyit, zar }), [nyitva, nyit, zar])

  return <KeresoKontextus.Provider value={ertek}>{children}</KeresoKontextus.Provider>
}

export function useKereso(): Kereso | null {
  return useContext(KeresoKontextus)
}
