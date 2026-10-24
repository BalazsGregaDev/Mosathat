import { useCallback, useEffect, useRef, useState } from 'react'

import { hibaSzoveg } from '../lib/format'

export type MentesAllapot = '' | 'megy' | 'kesz' | string

export function useMentes() {
  const [allapot, setAllapot] = useState<MentesAllapot>('')
  const idozito = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(idozito.current), [])
  const fut = useCallback(async (f: () => Promise<void>) => {
    window.clearTimeout(idozito.current)
    setAllapot('megy')
    try {
      await f()
      setAllapot('kesz')
      idozito.current = window.setTimeout(() => setAllapot(''), 2500)
    } catch (e) {
      setAllapot(hibaSzoveg(e))
    }
  }, [])
  return { allapot, fut }
}
