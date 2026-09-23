import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from './AppContext'
import { maStr, rendszamNorm } from '../lib/format'
import type {
  BookingScope, BookingType, CalcResult, HistoryRow, PlateLookup, VehicleCategory,
} from '../lib/types'

// ---------------------------------------------------------------------------
//  Az "Új időpont" űrlap állapota.
//
//  Két dolgot csinál, amit érdemes külön kiemelni:
//
//  1. Rendszám-keresés gépelés közben. A telefonos foglalásnál ez az első
//     kérdés; ha ismerjük az autót, a nevet és a telefonszámot nem kell
//     újra elkérni.
//
//  2. Élő ár és idő. Minden kattintás után újraszámol — de nem itt, hanem
//     az adatbázisban, a calc_service()-szel. Ugyanazzal, ami majd a
//     publikus árkalkulátort is kiszolgálja.
// ---------------------------------------------------------------------------

export interface FormState {
  category: VehicleCategory
  plate: string
  name: string
  phone: string
  packageId: string | null
  scope: BookingScope
  fullService: boolean
  extras: Record<string, number> // extra_id → mennyiség
  surchargePct: number
  surchargeFix: number
  bookingType: BookingType
  date: string
  startTime: string
  dropOffTime: string
  pickUpTime: string
  deadlineDate: string
  brand: string
  model: string
  seats: string
  notes: string
}

export const URES_URLAP: FormState = {
  category: 'SZEMELYAUTO',
  plate: '',
  name: '',
  phone: '',
  packageId: null,
  scope: 'TELJES',
  fullService: false,
  extras: {},
  surchargePct: 0,
  surchargeFix: 0,
  bookingType: 'VAROS',
  date: maStr(),
  startTime: '09:00',
  dropOffTime: '08:00',
  pickUpTime: '',
  deadlineDate: '',
  brand: '',
  model: '',
  seats: '',
  notes: '',
}

export function useBookingForm(nyitottE: boolean, kezdoNap: string) {
  const { data } = useApp()
  const [f, setF] = useState<FormState>({ ...URES_URLAP, date: kezdoNap })
  const [talalat, setTalalat] = useState<PlateLookup | null>(null)
  const [keres, setKeres] = useState(false)
  const [calc, setCalc] = useState<CalcResult | null>(null)
  const [mentes, setMentes] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  // Nyitáskor tiszta lappal indulunk.
  useEffect(() => {
    if (nyitottE) {
      setF({ ...URES_URLAP, date: kezdoNap })
      setTalalat(null)
      setCalc(null)
      setHiba(null)
    }
  }, [nyitottE, kezdoNap])

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }))
  }, [])

  // --- 1. rendszám-keresés --------------------------------------------------
  // Csak akkor indul, ha legalább négy karakter van; 350 ms csend után.

  const idozito = useRef<number | undefined>(undefined)

  useEffect(() => {
    const norm = rendszamNorm(f.plate)
    window.clearTimeout(idozito.current)

    if (norm.length < 4) {
      setTalalat(null)
      return
    }

    idozito.current = window.setTimeout(async () => {
      setKeres(true)
      try {
        const r = await data.lookupPlate(f.plate)
        setTalalat(r)
        if (r) {
          // Amit tudunk róla, azt kitöltjük — de csak az üres mezőket,
          // hogy ne írjuk felül, amit a felvevő közben már begépelt.
          setF((p) => ({
            ...p,
            name: p.name || r.customer.name,
            phone: p.phone || r.customer.phone,
            category: r.vehicle.category,
            brand: p.brand || r.vehicle.brand || '',
            model: p.model || r.vehicle.model || '',
            seats: p.seats || (r.vehicle.seats ? String(r.vehicle.seats) : ''),
          }))
        }
      } catch {
        setTalalat(null)
      } finally {
        setKeres(false)
      }
    }, 350)

    return () => window.clearTimeout(idozito.current)
  }, [f.plate, data])

  /** "Ezt kéri →" gomb a korábbi munkák sorában. */
  const elozmenyAtvesz = useCallback((h: HistoryRow, packageIdByCode: Record<string, string>) => {
    setF((p) => ({
      ...p,
      packageId: h.package_code ? (packageIdByCode[h.package_code] ?? p.packageId) : p.packageId,
      scope: h.scope,
      fullService: h.full_service,
    }))
  }, [])

  // --- 2. élő ár és idő -----------------------------------------------------

  const calcInput = useMemo(
    () => ({
      package_id: f.packageId,
      category: f.category,
      scope: f.scope,
      full_service: f.fullService,
      extras: Object.entries(f.extras)
        .filter(([, q]) => q > 0)
        .map(([extra_id, quantity]) => ({ extra_id, quantity })),
      surcharge_pct: f.surchargePct,
      surcharge_fix: f.surchargeFix,
    }),
    [f.packageId, f.category, f.scope, f.fullService, f.extras, f.surchargePct, f.surchargeFix],
  )

  useEffect(() => {
    if (!calcInput.package_id && calcInput.extras.length === 0) {
      setCalc(null)
      return
    }
    let el = true
    data
      .calcService(calcInput)
      .then((r) => el && setCalc(r))
      .catch(() => el && setCalc(null))
    return () => {
      el = false
    }
  }, [calcInput, data])

  // --- 3. mentés ------------------------------------------------------------

  const menthetE = useMemo(() => {
    if (!f.plate.trim()) return false
    if (!f.name.trim()) return false
    if (!f.packageId && calcInput.extras.length === 0) return false
    if (f.bookingType === 'VAROS' && !f.startTime) return false
    if (f.bookingType === 'TOBBNAPOS' && !f.deadlineDate) return false
    return true
  }, [f, calcInput.extras.length])

  const ment = useCallback(async (): Promise<string | null> => {
    setMentes(true)
    setHiba(null)
    try {
      const id = await data.createBooking({
        ...calcInput,
        customer_id: talalat?.customer.id ?? null,
        customer_name: f.name.trim(),
        customer_phone: f.phone.trim(),
        vehicle_id: talalat?.vehicle.id ?? null,
        plate_raw: f.plate.trim(),
        brand: f.brand.trim() || null,
        model: f.model.trim() || null,
        seats: f.seats ? Number(f.seats) : null,
        booking_type: f.bookingType,
        service_date: f.date,
        start_time: f.bookingType === 'VAROS' ? f.startTime : null,
        drop_off_time: f.bookingType === 'VAROS' ? null : f.dropOffTime || null,
        pick_up_time: f.pickUpTime || null,
        deadline_date: f.bookingType === 'TOBBNAPOS' ? f.deadlineDate : null,
        source: 'TELEFON',
        notes: f.notes.trim() || null,
      })
      return id
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setMentes(false)
    }
  }, [data, f, calcInput, talalat])

  return { f, set, talalat, keres, calc, menthetE, ment, mentes, hiba, elozmenyAtvesz }
}
