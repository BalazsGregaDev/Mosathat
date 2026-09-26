import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from './AppContext'
import { maStr, percIdo } from '../lib/format'
import type {
  BookingScope, BookingType, CalcResult, SearchHit, VehicleCategory,
} from '../lib/types'

// ---------------------------------------------------------------------------
//  A foglalási űrlap állapota — felvitelhez ÉS szerkesztéshez.
//
//  Ugyanaz az űrlap szolgálja mindkettőt. Nem kényelmi döntés: ha két külön
//  űrlap lenne, előbb-utóbb eltérnének, és a szerkesztésből kimaradna egy
//  mező, amit a felvitelbe közben hozzáadtunk.
//
//  Három dolgot csinál, ami magyarázatot érdemel:
//
//  1. AZONNALI KERESÉS. Már az első karaktertől keres — rendszámra, névre és
//     cégnévre egyszerre. A telefonos foglalásnál ez a legfontosabb funkció:
//     ha ismerjük az autót, a többi mező magától kitöltődik.
//
//  2. ÉLŐ ÁR ÉS IDŐ. Minden kattintás után újraszámol, de nem itt, hanem az
//     adatbázisban, a calc_service()-szel. Ugyanazzal, ami majd a publikus
//     árkalkulátort is kiszolgálja.
//
//  3. SEMMI NEM KÖTELEZŐ. Elég a rendszám VAGY a név VAGY a cég. A többi
//     pótolható később — a foglalást fel kell tudni venni akkor is, ha az
//     ügyfél épp az autópályán beszél és nem tudja a rendszámot.
// ---------------------------------------------------------------------------

export interface FormState {
  // ügyfél
  keres: string // a kereső mező tartalma
  name: string
  phone: string
  plate: string
  companyName: string
  // jármű
  category: VehicleCategory
  brand: string
  model: string
  seats: string
  // szolgáltatás
  packageId: string | null
  scope: BookingScope
  fullService: boolean
  extras: Record<string, number>
  // mikor
  bookingType: BookingType
  date: string
  startTime: string
  dropOffTime: string
  pickUpTime: string
  deadlineDate: string
  deadlineTime: string
  // egyéb
  notes: string
}

export const URES_URLAP: FormState = {
  keres: '',
  name: '',
  phone: '',
  plate: '',
  companyName: '',
  category: 'SZEMELYAUTO',
  brand: '',
  model: '',
  seats: '',
  packageId: null,
  scope: 'TELJES',
  fullService: false,
  extras: {},
  // "Itt hagyja" az alapértelmezett, mert ez a gyakoribb eset
  bookingType: 'LEADOS',
  date: maStr(),
  startTime: '09:00',
  dropOffTime: '08:00',
  pickUpTime: '',
  deadlineDate: '',
  deadlineTime: '17:00',
  notes: '',
}

/** "2026-09-26T06:00:00Z" → "08:00" budapesti időben, az űrlap mezőjéhez. */
function isoOra(iso: string | null): string {
  if (!iso) return ''
  const f = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Budapest',
  })
  return f.format(new Date(iso))
}

function isoNap(iso: string | null): string {
  if (!iso) return ''
  const f = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Budapest',
  })
  return f.format(new Date(iso))
}

export function useBookingForm(nyitottE: boolean, kezdoNap: string, bookingId?: string | null) {
  const { data } = useApp()
  const [f, setF] = useState<FormState>({ ...URES_URLAP, date: kezdoNap })
  const [talalatok, setTalalatok] = useState<SearchHit[]>([])
  const [valasztott, setValasztott] = useState<SearchHit | null>(null)
  const [keres, setKeres] = useState(false)
  const [calc, setCalc] = useState<CalcResult | null>(null)
  const [mentes, setMentes] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [tolt, setTolt] = useState(false)

  const szerkesztes = Boolean(bookingId)

  // --- nyitáskor: tiszta lap vagy a meglévő foglalás betöltése --------------

  useEffect(() => {
    if (!nyitottE) return
    setHiba(null)
    setTalalatok([])
    setValasztott(null)

    if (!bookingId) {
      setF({ ...URES_URLAP, date: kezdoNap })
      setCalc(null)
      return
    }

    setTolt(true)
    data
      .getBookingFormData(bookingId)
      .then((d) => {
        if (!d) return
        const b = d.booking
        setF({
          keres: '',
          name: d.customer.name === 'Névtelen' ? '' : d.customer.name,
          phone: d.customer.phone === '—' ? '' : d.customer.phone,
          plate: d.vehicle.plate_raw === '—' ? '' : d.vehicle.plate_raw,
          companyName: d.customer.company_name ?? '',
          category: d.vehicle.category,
          brand: d.vehicle.brand ?? '',
          model: d.vehicle.model ?? '',
          seats: d.vehicle.seats ? String(d.vehicle.seats) : '',
          packageId: b.package_id,
          scope: b.scope,
          fullService: b.full_service,
          extras: Object.fromEntries(
            d.extras.filter((e) => e.extra_id).map((e) => [e.extra_id, Number(e.quantity) || 1]),
          ),
          bookingType: b.booking_type,
          date: b.service_date.slice(0, 10),
          startTime: isoOra(b.start_at) || '09:00',
          dropOffTime: isoOra(b.drop_off_at) || '08:00',
          pickUpTime: isoOra(b.pick_up_at),
          deadlineDate: isoNap(b.deadline_at),
          deadlineTime: isoOra(b.deadline_at) || '17:00',
          notes: b.notes ?? '',
        })
      })
      .catch((e) => setHiba(e instanceof Error ? e.message : String(e)))
      .finally(() => setTolt(false))
  }, [nyitottE, kezdoNap, bookingId, data])

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }))
  }, [])

  // --- 1. azonnali keresés ---------------------------------------------------
  // Az első karaktertől indul, 220 ms csend után. Szerkesztéskor nincs rá
  // szükség: ott már tudjuk, kiről van szó.

  const idozito = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (szerkesztes) return
    window.clearTimeout(idozito.current)
    const q = f.keres.trim()
    if (q.length < 1) {
      setTalalatok([])
      return
    }
    idozito.current = window.setTimeout(async () => {
      setKeres(true)
      try {
        setTalalatok(await data.searchCustomers(q, 5))
      } catch {
        setTalalatok([])
      } finally {
        setKeres(false)
      }
    }, 220)
    return () => window.clearTimeout(idozito.current)
  }, [f.keres, data, szerkesztes])

  /** Találat kiválasztása: az ügyfél adatai betöltődnek, a szolgáltatás NEM. */
  const talalatValaszt = useCallback((h: SearchHit) => {
    setValasztott(h)
    setTalalatok([])
    setF((p) => ({
      ...p,
      keres: '',
      name: h.customer_name === 'Névtelen' ? '' : h.customer_name,
      phone: h.customer_phone === '—' ? '' : h.customer_phone,
      plate: h.plate_raw === '—' ? '' : h.plate_raw,
      companyName: h.company_name ?? '',
      category: h.category,
      brand: h.brand ?? '',
      model: h.model ?? '',
      seats: h.seats ? String(h.seats) : '',
      // A csomagot szándékosan nem írjuk felül: most mást is kérhet.
    }))
  }, [])

  /** "Ezt kéri" — a korábbi munka csomagja átkerül az űrlapra. */
  const ezcKeri = useCallback((packageIdByCode: Record<string, string>) => {
    const kod = valasztott?.utolso_csomag
    if (!kod) return
    // Az utolso_csomag a csomag NEVE (Start / Premium / Elit), a kód nagybetűs.
    const id = packageIdByCode[kod.toUpperCase()]
    if (id) setF((p) => ({ ...p, packageId: id }))
  }, [valasztott])

  // --- 2. élő ár és idő ------------------------------------------------------

  const calcInput = useMemo(
    () => ({
      package_id: f.packageId,
      category: f.category,
      scope: f.scope,
      full_service: f.fullService,
      extras: Object.entries(f.extras)
        .filter(([, q]) => q > 0)
        .map(([extra_id, quantity]) => ({ extra_id, quantity })),
      // A felárak NEM itt vannak: telefonos foglaláskor még nem látjuk az
      // autót. A munkalapon kerülnek be, amikor a kocsi már készen áll.
      surcharge_pct: 0,
      surcharge_fix: 0,
    }),
    [f.packageId, f.category, f.scope, f.fullService, f.extras],
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

  // --- 3. mentés -------------------------------------------------------------

  // Semmi nem kötelező — elég, ha valamiről tudjuk, kiről van szó.
  const menthetE = useMemo(
    () => Boolean(f.plate.trim() || f.name.trim() || f.companyName.trim()),
    [f.plate, f.name, f.companyName],
  )

  const ment = useCallback(async (): Promise<string | null> => {
    setMentes(true)
    setHiba(null)
    try {
      const input = {
        ...calcInput,
        customer_id: valasztott?.customer_id ?? null,
        customer_name: f.name.trim(),
        customer_phone: f.phone.trim(),
        company_name: f.companyName.trim() || null,
        vehicle_id: valasztott?.vehicle_id ?? null,
        plate_raw: f.plate.trim(),
        brand: f.brand.trim() || null,
        model: f.model.trim() || null,
        seats: f.seats ? Number(f.seats) : null,
        booking_type: f.bookingType,
        service_date: f.date,
        // Megvárja esetén kell kezdés; a mező sosem üres, mert van
        // alapértelmezése — így a "semmi nem kötelező" nem ütközik az
        // adatbázis szabályával.
        start_time: f.bookingType === 'VAROS' ? f.startTime || '09:00' : null,
        drop_off_time: f.bookingType === 'VAROS' ? null : f.dropOffTime || '08:00',
        pick_up_time: f.pickUpTime || null,
        deadline_date:
          f.bookingType === 'TOBBNAPOS' ? f.deadlineDate || f.date : null,
        deadline_time: f.bookingType === 'TOBBNAPOS' ? f.deadlineTime || '17:00' : null,
        source: 'TELEFON' as const,
        notes: f.notes.trim() || null,
      }

      if (bookingId) {
        await data.updateBooking(bookingId, input)
        return bookingId
      }
      return await data.createBooking(input)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setMentes(false)
    }
  }, [data, f, calcInput, valasztott, bookingId])

  return {
    f, set, calc, menthetE, ment, mentes, hiba, tolt, szerkesztes,
    talalatok, keres, valasztott, talalatValaszt, ezcKeri,
    percIdo, // a komponensnek is kell
  }
}
