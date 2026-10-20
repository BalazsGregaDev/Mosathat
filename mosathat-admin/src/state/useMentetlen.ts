import { useEffect } from 'react'

export function useMentetlen(aktiv: boolean) {
  useEffect(() => {
    if (!aktiv) return
    const kezel = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'A még nem mentett adatok elveszhetnek.'
      return e.returnValue
    }
    window.addEventListener('beforeunload', kezel)
    return () => window.removeEventListener('beforeunload', kezel)
  }, [aktiv])
}
