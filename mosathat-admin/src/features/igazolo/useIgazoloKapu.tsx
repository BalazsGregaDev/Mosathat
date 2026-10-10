import { useCallback, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import type { SheetForBooking } from '../../lib/types'
import SorUrlap from './SorUrlap'

type Nyitott = { adat: SheetForBooking; uzenet: string }

export function useIgazoloKapu(): [
  React.ReactNode,
  {
    alairat: (bookingId: string, uzenet: string) => Promise<boolean>
    atadhato: (bookingId: string) => Promise<boolean>
  },
] {
  const { data } = useApp()
  const [nyitott, setNyitott] = useState<Nyitott | null>(null)
  const valasz = useRef<((mentve: boolean) => void) | null>(null)
  const mentve = useRef(false)

  const megnyit = useCallback((adat: SheetForBooking, uzenet: string) => {
    mentve.current = false
    setNyitott({ adat, uzenet })
    return new Promise<boolean>((resolve) => { valasz.current = resolve })
  }, [])

  const alairat = useCallback(async (bookingId: string, uzenet: string) => {
    const adat = await data.sheetForBooking(bookingId)
    if (!adat.company_id || adat.closed) return true
    return megnyit(adat, uzenet)
  }, [data, megnyit])

  const atadhato = useCallback(async (bookingId: string) => {
    const adat = await data.sheetForBooking(bookingId)
    if (!adat.company_id || adat.closed || adat.row.id) return true
    return megnyit(adat,
      'Átadás előtt töltsd ki az igazolólap sorát (km, név, aláírás). '
      + 'Mentés után lezárható az időpont.')
  }, [data, megnyit])

  const ablak = nyitott && nyitott.adat.company_id
    ? (
      <SorUrlap
        cegId={nyitott.adat.company_id}
        cegNev={nyitott.adat.company_name ?? ''}
        oszlopok={nyitott.adat.columns}
        sor={nyitott.adat.row}
        zarva={nyitott.adat.closed}
        uzenet={nyitott.uzenet}
        onMentve={() => { mentve.current = true }}
        onBezar={() => {
          setNyitott(null)
          valasz.current?.(mentve.current)
          valasz.current = null
        }}
      />
    )
    : null

  return [ablak, { alairat, atadhato }]
}
