// ---------------------------------------------------------------------------
// Az adatbázis típusai TypeScriptben.
//
// Ezek az enumok egy az egyben a 0001_schema.sql-ből jönnek. Ha ott változik
// valami, itt is át kell írni — ezért van mindegyik mellett a forrás.
// ---------------------------------------------------------------------------

export type StaffRole = 'SUPERADMIN' | 'STAFF'
export type CustomerType = 'MAGAN' | 'CEG'
export type VehicleCategory = 'SZEMELYAUTO' | 'SUV' | 'KISBUSZ'
export type ServiceArea = 'KULSO' | 'BELSO'
export type BookingScope = 'KULSO' | 'BELSO' | 'TELJES'
export type BookingType = 'VAROS' | 'LEADOS' | 'TOBBNAPOS' | 'HOZOMVISZEM'
export type BookingSource = 'TELEFON' | 'ONLINE' | 'SZEMELYES' | 'MESSENGER'
export type MeasureUnit = 'ALKALOM' | 'DB' | 'AJTO' | 'ULES' | 'LITER'

export type BookingStatus =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED_BY_CUSTOMER'
  | 'CANCELLED_BY_SHOP'
  | 'NO_SHOW'

// --- magyar feliratok -------------------------------------------------------
// Egy helyen. Ha a szóhasználat változik, csak itt kell hozzányúlni.

export const CATEGORY_LABEL: Record<VehicleCategory, string> = {
  SZEMELYAUTO: 'Személyautó',
  SUV: 'SUV / Egyterű',
  KISBUSZ: 'Kisbusz / Furgon',
}

export const CATEGORY_SHORT: Record<VehicleCategory, string> = {
  SZEMELYAUTO: 'Sedan',
  SUV: 'SUV',
  KISBUSZ: 'Kisbusz',
}

export const SCOPE_LABEL: Record<BookingScope, string> = {
  TELJES: 'Teljes',
  KULSO: 'Csak kívül',
  BELSO: 'Csak belül',
}

export const TYPE_LABEL: Record<BookingType, string> = {
  VAROS: 'Megvárja',
  LEADOS: 'Itt hagyja',
  TOBBNAPOS: 'Több napos',
  HOZOMVISZEM: 'Hozom-viszem',
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  REQUESTED: 'Kérés',
  CONFIRMED: 'Várjuk',
  REJECTED: 'Elutasítva',
  ARRIVED: 'Megérkezett',
  IN_PROGRESS: 'Dolgozunk',
  READY: 'Kész',
  COMPLETED: 'Lezárva',
  CANCELLED_BY_CUSTOMER: 'Ügyfél lemondta',
  CANCELLED_BY_SHOP: 'Mi mondtuk le',
  NO_SHOW: 'Nem jött el',
}

// A napi nézetben csak ez a négy állapot "élő". A többi vagy még nem
// került be a napba (REQUESTED), vagy már kikerült belőle.
export const ACTIVE_STATUSES: BookingStatus[] = [
  'CONFIRMED',
  'ARRIVED',
  'IN_PROGRESS',
  'READY',
]

// Melyik gomb jelenik meg egy adott állapotban, és mire vált.
export const NEXT_STATUS: Partial<Record<BookingStatus, { to: BookingStatus; label: string }>> = {
  CONFIRMED: { to: 'ARRIVED', label: 'Megérkezett' },
  ARRIVED: { to: 'IN_PROGRESS', label: 'Kezdjük' },
  IN_PROGRESS: { to: 'READY', label: 'Kész van' },
  READY: { to: 'COMPLETED', label: 'Átvette, lezár' },
}

// --- sorok ------------------------------------------------------------------

export interface Staff {
  id: string
  full_name: string
  role: StaffRole
  active: boolean
}

export interface Customer {
  id: string
  type: CustomerType
  name: string
  phone: string
  email: string | null
  company_name: string | null
  notes: string | null
  internal_notes: string | null
}

export interface Vehicle {
  id: string
  customer_id: string
  plate_raw: string
  plate_normalized: string
  plate_country: string
  brand: string | null
  model: string | null
  category: VehicleCategory
  seats: number | null
  notes: string | null
}

export interface Package {
  id: string
  code: string
  name: string
  description: string | null
  includes_package_id: string | null
  sort_order: number
  active: boolean
}

export interface PackagePrice {
  package_id: string
  category: VehicleCategory
  scope: BookingScope
  price_huf: number | null
  duration_minutes: number | null
  requires_quote: boolean
}

export interface FullServicePrice {
  package_id: string
  category: VehicleCategory
  price_huf: number | null
  included_seats: number
  requires_quote: boolean
}

export interface Extra {
  id: string
  name: string
  description: string | null
  area: ServiceArea | null
  price_huf: number | null
  price_unit: MeasureUnit
  work_minutes: number | null
  duration_unit: MeasureUnit
  rest_minutes: number
  recommends_overnight: boolean
  requires_quote: boolean
  sort_order: number
  active: boolean
}

export interface Surcharge {
  id: string
  name: string
  kind: 'SZAZALEK' | 'FIX'
  default_value: number
  max_value: number | null
  sort_order: number
  active: boolean
}

// A v_day_bookings nézet egy sora. A napi nézet minden kártyája ebből él.
export interface DayBooking {
  id: string
  service_date: string
  booking_type: BookingType
  status: BookingStatus
  source: BookingSource
  start_at: string | null
  drop_off_at: string | null
  pick_up_at: string | null
  scope: BookingScope
  full_service: boolean
  planned_duration_minutes: number
  rest_minutes: number
  estimated_price_huf: number
  final_price_huf: number | null
  notes: string | null
  internal_notes: string | null

  customer_id: string
  customer_name: string
  customer_phone: string
  customer_type: CustomerType
  company_name: string | null

  vehicle_id: string
  plate_raw: string
  plate_country: string
  brand: string | null
  model: string | null
  category: VehicleCategory
  seats: number | null

  package_code: string | null
  package_name: string | null

  tasks_total: number
  tasks_done: number
  first_done_at: string | null
  last_done_at: string | null
}

export interface StandingCar {
  id: string
  arrived_at: string | null
  deadline_at: string | null
  days_in: number
  days_left: number
  urgent: boolean
  status: BookingStatus
  customer_name: string
  company_name: string | null
  plate_raw: string
  brand: string | null
  model: string | null
  package_name: string | null
  tasks_total: number
  tasks_done: number
}

export interface DayCapacity {
  parallel_slots: number
  open_minutes: number
  capacity_minutes: number
  booked_minutes: number
  free_minutes: number
  load_pct: number
}

export interface WorkWindow {
  window_no: number
  starts: string
  ends: string
}

export interface LatestStart extends WorkWindow {
  latest_start: string
  fits: boolean
}

export interface BookingTask {
  id: string
  booking_id: string
  name: string
  area: ServiceArea | null
  sort_order: number
  done: boolean
  done_at: string | null
}

// A calc_service() visszatérése.
export interface CalcResult {
  price_huf: number
  work_minutes: number | null // NULL, ha nem ismert (csak külső / csak belül)
  rest_minutes: number
  requires_quote: boolean
  duration_known: boolean
}

// Egy korábbi munka a rendszám alatt. Ebből lesz az "Ezt kéri →" gomb.
export interface HistoryRow {
  customer_id: string
  vehicle_id: string
  service_date: string
  package_code: string | null
  package_name: string | null
  scope: BookingScope
  full_service: boolean
  price_huf: number
}

// Amit a rendszám beírására visszakapunk.
export interface PlateLookup {
  vehicle: Vehicle
  customer: Customer
  history: HistoryRow[]
}

// --- amit a modal összerak és elküld -----------------------------------------

export interface ExtraSelection {
  extra_id: string
  quantity: number
}

export interface CalcInput {
  package_id: string | null
  category: VehicleCategory
  scope: BookingScope
  full_service: boolean
  extras: ExtraSelection[]
  surcharge_pct: number
  surcharge_fix: number
}

export interface NewBookingInput extends CalcInput {
  // ügyfél: vagy meglévő, vagy új
  customer_id: string | null
  customer_name: string
  customer_phone: string
  // jármű: vagy meglévő, vagy új
  vehicle_id: string | null
  plate_raw: string
  brand: string | null
  model: string | null
  seats: number | null

  booking_type: BookingType
  service_date: string // YYYY-MM-DD
  start_time: string | null // HH:MM — VAROS-nál kötelező
  drop_off_time: string | null // HH:MM — LEADOS-nál
  pick_up_time: string | null
  deadline_date: string | null // TOBBNAPOS-nál kötelező
  source: BookingSource
  notes: string | null
}
