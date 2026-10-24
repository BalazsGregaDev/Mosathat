import { useCallback, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import type { BerletFoglalashoz, SheetForBooking } from '../../lib/types'
import SorUrlap from './SorUrlap'
import BerletSorUrlap from './BerletSorUrlap'
import type { IgazoloFajta } from './IgazoloGomb'

type Nyitott =
  | { fajta: 'CEG'; adat: SheetForBooking; uzenet: string }
  | { fajta: 'BERLET'; adat: BerletFoglalashoz; uzenet: string }

export interface IgazoloKapu {
  alairat: (bookingId: string, uzenet: string, fajta?: IgazoloFajta) => Promise<boolean>
  atadhato: (bookingId: string, fajta?: IgazoloFajta) => Promise<boolean>
}

const BERLET_ATADAS = 'Átadás előtt töltsd ki a bérlet igazolólapjának sorát (név, aláírás). '
  + 'Mentés után lezárható az időpont.'

export function useIgazoloKapu(): [React.ReactNode, IgazoloKapu] {
  const { data } = useApp()
  const [nyitott, setNyitott] = useState<Nyitott | null>(null)
  const valasz = useRef<((mentve: boolean) => void) | null>(null)
  const mentve = useRef(false)

  const megnyit = useCallback((n: Nyitott) => {
    mentve.current = false
    setNyitott(n)
    return new Promise<boolean>((resolve) => { valasz.current = resolve })
  }, [])

  const alairat = useCallback(async (bookingId: string, uzenet: string, fajta: IgazoloFajta = 'CEG') => {
    if (fajta === 'BERLET') {
      const adat = await data.berletFoglalashoz(bookingId)
      if (!adat.pass_id || !adat.row) return true
      return megnyit({ fajta, adat, uzenet })
    }
    const adat = await data.sheetForBooking(bookingId)
    if (!adat.company_id || adat.closed) return true
    return megnyit({ fajta, adat, uzenet })
  }, [data, megnyit])

  const atadhato = useCallback(async (bookingId: string, fajta: IgazoloFajta = 'CEG') => {
    if (fajta === 'BERLET') {
      const adat = await data.berletFoglalashoz(bookingId)
      if (!adat.pass_id || !adat.row || adat.row.kitoltve_at) return true
      return megnyit({ fajta, adat, uzenet: BERLET_ATADAS })
    }
    const adat = await data.sheetForBooking(bookingId)
    if (!adat.company_id || adat.closed || adat.row.id) return true
    return megnyit({
      fajta,
      adat,
      uzenet: 'Átadás előtt töltsd ki az igazolólap sorát (km, név, aláírás). '
        + 'Mentés után lezárható az időpont.',
    })
  }, [data, megnyit])

  const bezar = () => {
    setNyitott(null)
    valasz.current?.(mentve.current)
    valasz.current = null
  }

  let ablak: React.ReactNode = null
  if (nyitott?.fajta === 'CEG' && nyitott.adat.company_id) {
    ablak = (
      <SorUrlap
        cegId={nyitott.adat.company_id}
        cegNev={nyitott.adat.company_name ?? ''}
        oszlopok={nyitott.adat.columns}
        sor={nyitott.adat.row}
        zarva={nyitott.adat.closed}
        uzenet={nyitott.uzenet}
        onMentve={() => { mentve.current = true }}
        onBezar={bezar}
      />
    )
  } else if (nyitott?.fajta === 'BERLET' && nyitott.adat.row) {
    ablak = (
      <BerletSorUrlap
        ugyfelNev={nyitott.adat.customer_name ?? ''}
        berletNev={nyitott.adat.pass_name ?? ''}
        sor={nyitott.adat.row}
        uzenet={nyitott.uzenet}
        onMentve={() => { mentve.current = true }}
        onBezar={bezar}
      />
    )
  }

  return [ablak, { alairat, atadhato }]
}
