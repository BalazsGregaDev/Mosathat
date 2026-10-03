import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from './AppContext'
import type { DayAbsence, DayBooking, DayCapacity, StandingCar, WorkWindow } from '../lib/types'

// ---------------------------------------------------------------------------
//  Egy nap minden adata egy hívásban.
//
//  Négy külön kérdés, de a felület szempontjából egy állapot: vagy megvan
//  az egész nap, vagy tölt. Külön-külön betöltve villogna a képernyő.
//
//  CSENDES FRISSÍTÉS
//
//  A „Betöltés…" felirat csak akkor jelenik meg, ha még nincs mit mutatni:
//  az első betöltéskor és napváltáskor. Minden más frissítés (egy gomb a
//  kártyán, egy módosítás a másik gépen) a háttérben fut, és a végén
//  egyszerre cseréli ki a listát. Korábban minden „Kész van" után eltűnt
//  az egész nap egy pillanatra, és a görgetés is az elejére ugrott —
//  ez úgy nézett ki, mintha az oldal újratöltődött volna.
//
//  HELYBEN MÓDOSÍTÁS
//
//  A `modosit` egyetlen foglalás mezőit írja át a meglévő listában, a
//  sorrend érintése nélkül. Az állapotgomb ezt hívja: a kártya azonnal
//  átvált, és nem kell megvárni a teljes nap újratöltését.
// ---------------------------------------------------------------------------

export interface DayData {
  bookings: DayBooking[]
  capacity: DayCapacity | null
  windows: WorkWindow[]
  standing: StandingCar[]
  /** Aznap kinek változik a munkaideje — a kapacitás-kártyára. */
  absences: DayAbsence[]
  loading: boolean
  error: string | null
}

const URES: DayData = {
  bookings: [], capacity: null, windows: [], standing: [], absences: [], loading: true, error: null,
}

export function useDay(datum: string): DayData & {
  modosit: (id: string, valtozas: Partial<DayBooking>) => void
  atrendez: (ids: string[]) => void
} {
  const { data, revision, user, refresh } = useApp()
  const [state, setState] = useState<DayData>(URES)
  // Melyik nap adatai vannak most a képernyőn. Ha ugyanazt a napot kérjük
  // újra, nincs „Betöltés…" — a régi lista marad, amíg az új megjön.
  const betoltottNap = useRef<string | null>(null)

  useEffect(() => {
    if (!user) return
    let el = true
    if (betoltottNap.current !== datum) {
      setState((s) => ({ ...s, loading: true, error: null }))
    }
    ;(async () => {
      try {
        const [bookings, capacity, windows, standing, absences] = await Promise.all([
          data.getDay(datum),
          data.getCapacity(datum),
          data.getWorkWindows(datum),
          data.getStandingCars(),
          data.getDayAbsences(datum),
        ])
        if (!el) return
        betoltottNap.current = datum
        setState({ bookings, capacity, windows, standing, absences, loading: false, error: null })
      } catch (e) {
        if (!el) return
        betoltottNap.current = null
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
  // számlálót növeljük, és a fenti effekt (csendben) tölt újra.
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

  // Áthúzás után: a lista azonnal az új sorrendben áll, a mentés utána megy.
  // Az azonosítók listája a teljes nap, az új sorrendben.
  const atrendez = useCallback((ids: string[]) => {
    setState((s) => {
      const hely = new Map(ids.map((id, i) => [id, i]))
      const uj = s.bookings.slice().sort((a, z) => (hely.get(a.id) ?? 0) - (hely.get(z.id) ?? 0))
      return { ...s, bookings: uj }
    })
  }, [])

  return { ...state, modosit, atrendez }
}
