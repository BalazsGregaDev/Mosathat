import type {
  BookingStatus, BookingTask, CalcInput, CalcResult, DayBooking, DayCapacity, ServiceArea,
  Extra, FullServicePrice, LatestStart, NewBookingInput, Package, PackagePrice,
  PlateLookup, StandingCar, Surcharge, WorkWindow,
} from '../lib/types'

// ---------------------------------------------------------------------------
// Ez az egyetlen felület, amit a React kód ismer.
//
// Két megvalósítása van:
//   demo.ts      – PGlite, azaz valódi PostgreSQL a böngészőben, ugyanazzal
//                  az öt migrációval. Fiók és internet nélkül.
//   supabase.ts  – az éles adatbázis.
//
// Egyik sem számol semmit. Az ár, az idő, a munkalista és a kapacitás
// mind az adatbázis függvényeiből jön, hogy ne lehessen két különböző
// eredmény ugyanarra a kérdésre.
// ---------------------------------------------------------------------------

export interface Catalog {
  packages: Package[]
  packagePricing: PackagePrice[]
  fullServicePricing: FullServicePrice[]
  extras: Extra[]
  surcharges: Surcharge[]
}

export interface SessionUser {
  id: string
  name: string
  role: 'SUPERADMIN' | 'STAFF'
  email: string | null
}

export interface DataSource {
  /** A neve a felületen: "Demó adatbázis" vagy "Supabase". */
  readonly label: string
  /** Igaz, ha a rendszer nem éles — a fejlécben ez látszik is. */
  readonly isDemo: boolean

  init(): Promise<void>

  signIn(email: string, password: string): Promise<SessionUser>
  signOut(): Promise<void>
  currentUser(): Promise<SessionUser | null>

  getCatalog(): Promise<Catalog>

  getDay(date: string): Promise<DayBooking[]>
  getBooking(id: string): Promise<DayBooking | null>
  getCapacity(date: string): Promise<DayCapacity>
  getWorkWindows(date: string): Promise<WorkWindow[]>
  getLatestStart(date: string, minutes: number): Promise<LatestStart[]>
  getStandingCars(): Promise<StandingCar[]>

  lookupPlate(plate: string): Promise<PlateLookup | null>
  calcService(input: CalcInput): Promise<CalcResult>

  createBooking(input: NewBookingInput): Promise<string>
  setStatus(bookingId: string, status: BookingStatus, note?: string): Promise<void>
  setFinalPrice(bookingId: string, price: number, reason?: string): Promise<void>

  getTasks(bookingId: string): Promise<BookingTask[]>
  toggleTask(taskId: string, done: boolean): Promise<void>
  /** A csomaghoz tartozó kívüli vagy belüli lépések egyben. Az extrákat nem érinti. */
  toggleTaskGroup(bookingId: string, area: ServiceArea, done: boolean): Promise<number>
  setNotes(bookingId: string, notes: string): Promise<void>
}

// --- közös segédek ----------------------------------------------------------
// A Postgres numeric típusa szövegként érkezik mindkét kliensnél.
// Egy helyen alakítjuk számmá, hogy a felület ne találkozzon "53.3"-mal.

export const num = (v: unknown): number =>
  v === null || v === undefined ? 0 : typeof v === 'number' ? v : Number(v)

export const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : typeof v === 'number' ? v : Number(v)

/** A calc_service hívás paraméterei — mindkét adapter ugyanígy adja át. */
export function calcArgs(i: CalcInput) {
  return {
    p_package_id: i.package_id,
    p_category: i.category,
    p_scope: i.scope,
    p_full_service: i.full_service,
    p_extras: i.extras.map((e) => ({ extra_id: e.extra_id, quantity: e.quantity })),
    p_surcharge_pct: i.surcharge_pct,
    p_surcharge_fix: i.surcharge_fix,
  }
}

export function toCalcResult(row: Record<string, unknown> | undefined): CalcResult {
  return {
    price_huf: num(row?.price_huf),
    work_minutes: numOrNull(row?.work_minutes),
    rest_minutes: num(row?.rest_minutes),
    requires_quote: Boolean(row?.requires_quote),
    duration_known: Boolean(row?.duration_known),
  }
}
