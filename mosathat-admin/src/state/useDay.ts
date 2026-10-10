import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp, useRevizio } from './AppContext'
import type { DayAbsence, DayBooking, DayCapacity, DayLane, StandingCar, VacationRow, WorkWindow } from '../lib/types'
import { hibaSzoveg, napPlusz } from '../lib/format'

export interface DayData {
  bookings: DayBooking[]
  capacity: DayCapacity | null
  windows: WorkWindow[]
  standing: StandingCar[]
  absences: DayAbsence[]
  vacations: VacationRow[]
  lanes: DayLane[]
  startPerc: number | null
  loading: boolean
  error: string | null
}

const URES: DayData = {
  bookings: [], capacity: null, windows: [], standing: [], absences: [], vacations: [], lanes: [], startPerc: null, loading: true, error: null,
}

export function useDay(datum: string): DayData & {
  modosit: (id: string, valtozas: Partial<DayBooking>) => void
  atrendez: (ids: string[]) => void
} {
  const { data, user, refresh } = useApp()
  const revision = useRevizio()
  const [state, setState] = useState<DayData>(URES)
  const betoltottNap = useRef<string | null>(null)

  useEffect(() => {
    if (!user) return
    let el = true
    if (betoltottNap.current !== datum) {
      setState((s) => ({ ...s, loading: true, error: null }))
    }
    ;(async () => {
      try {
        const [bookings, capacity, windows, standing, absences, vacations, lanes, startPerc] = await Promise.all([
          data.getDay(datum),
          data.getCapacity(datum),
          data.getWorkWindows(datum),
          data.getStandingCars(),
          data.getDayAbsences(datum),
          data.getVacations(datum, napPlusz(datum, 30)),
          data.getDayLanes(datum),
          data.getStartMinutes(),
        ])
        if (!el) return
        betoltottNap.current = datum
        setState({ bookings, capacity, windows, standing, absences, vacations, lanes, startPerc, loading: false, error: null })
      } catch (e) {
        if (!el) return
        betoltottNap.current = null
        setState({
          ...URES,
          loading: false,
          error: hibaSzoveg(e),
        })
      }
    })()
    return () => {
      el = false
    }
  }, [data, datum, revision, user])

  useEffect(() => {
    if (!user) return
    return data.subscribe(() => refresh())
  }, [data, user, refresh])

  const modosit = useCallback((id: string, valtozas: Partial<DayBooking>) => {
    setState((s) => ({
      ...s,
      bookings: s.bookings.map((b) => (b.id === id ? { ...b, ...valtozas } : b)),
    }))
  }, [])

  const atrendez = useCallback((ids: string[]) => {
    setState((s) => {
      const hely = new Map(ids.map((id, i) => [id, i]))
      const uj = s.bookings.slice().sort((a, z) => (hely.get(a.id) ?? 0) - (hely.get(z.id) ?? 0))
      return { ...s, bookings: uj }
    })
  }, [])

  return { ...state, modosit, atrendez }
}
