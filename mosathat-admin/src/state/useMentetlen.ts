import { useEffect } from 'react'

// ---------------------------------------------------------------------------
//  Figyelmeztetés mentetlen adatra.
//
//  Mobilon a lap tetején egy lefelé húzás frissíti az oldalt. Ha közben egy
//  félig kitöltött foglalás van a képernyőn, az elveszne — és pont akkor
//  történik, amikor az ember a lista tetejére akar visszagörgetni.
//
//  A böngésző saját megerősítő ablakát használjuk. Saját ablakot nem lehet:
//  a frissítést a böngésző kezeli, nem a mi kódunk.
// ---------------------------------------------------------------------------

export function useMentetlen(aktiv: boolean) {
  useEffect(() => {
    if (!aktiv) return
    const kezel = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // A böngészők a saját szövegüket mutatják, de valamit vissza kell adni.
      e.returnValue = 'A még nem mentett adatok elveszhetnek.'
      return e.returnValue
    }
    window.addEventListener('beforeunload', kezel)
    return () => window.removeEventListener('beforeunload', kezel)
  }, [aktiv])
}
