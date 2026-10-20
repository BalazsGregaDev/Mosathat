import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import type { PublikusAdat } from '../../data/source'

export function usePublikusAdat(): { adat: PublikusAdat | null; frissit: () => Promise<void> } {
  const { data } = useApp()
  const [adat, setAdat] = useState<PublikusAdat | null>(null)
  const frissit = useCallback(async () => { setAdat(await data.getPublikus()) }, [data])
  useEffect(() => {
    let el = true
    data.getPublikus().then((a) => { if (el) setAdat(a) }).catch(() => {})
    return () => { el = false }
  }, [data])
  return { adat, frissit }
}
