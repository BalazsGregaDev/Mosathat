import { useEffect, useState } from 'react'
import { useApp } from './AppContext'
import type { DayBooking, DayCapacity, StandingCar, WorkWindow } from '../lib/types'

// ---------------------------------------------------------------------------
//  Egy nap minden adata egy hívásban.
//
//  Négy külön kérdés, de a felület szempontjából egy állapot: vagy megvan
//  az egész nap, vagy tölt. Külön-külön betöltve villogna a képernyő.
// ---------------------------------------------------------------------------

export interface DayData {
  bookings: DayBooking[]
  capacity: DayCapacity | null
  windows: WorkWindow[]
  standing: StandingCar[]
  loading: boolean
  error: string | null
}

const URES: DayData = {
  bookings: [], capacity: null, windows: [], standing: [], loading: true, error: null,
}

export function useDay(datum: string): DayData {
  const { data, revision, user, refresh } = useApp()
  const [state, setState] = useState<DayData>(URES)

  useEffect(() => {
    if (!user) return
    let el = true
    setState((s) => ({ ...s, loading: true, error: null }))
    ;(async () => {
      try {
        const [bookings, capacity, windows, standing] = await Promise.all([
          data.getDay(datum),
          data.getCapacity(datum),
          data.getWorkWindows(datum),
          data.getStandingCars(),
        ])
        if (!el) return
        setState({ bookings, capacity, windows, standing, loading: false, error: null })
      } catch (e) {
        if (!el) return
        setState({
          ...URES,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    })()
    return () => {
      el = false
    }
  }, [data, datum, revision, user])

  // Élő frissítés: ha a másik gépen módosítanak valamit, itt is látszik.
  // Nem a teljes napot kérdezzük vissza minden eseményre — a refresh()
  // számlálót növeljük, és a fenti effekt tölt újra.
  useEffect(() => {
    if (!user) return
    return data.subscribe(() => refresh())
  }, [data, user, refresh])

  return state
}
