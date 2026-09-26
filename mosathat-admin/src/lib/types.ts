// ---------------------------------------------------------------------------
// Az adatbázis típusai TypeScriptben.
//
// Ezek az enumok egy az egyben a 0001_schema.sql-ből jönnek. Ha ott változik
// valami, itt is át kell írni — ezért van mindegyik mellett a forrás.
// ---------------------------------------------------------------------------

export type StaffRole = 'SUPERADMIN' | 'TULAJDONOS' | 'STAFF'
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
/**
 * A folyamat három lépés: megérkezett → kész van → átvette.
 *
 * A „kezdjük" lépés kikerült. A gyakorlatban vagy elfelejtették megnyomni,
 * vagy utólag nyomták meg — vagyis nem mondott igazat arról, amit mért. A
 * munka kezdete így az érkezés ideje lesz; ezt az adatbázis állítja be.
 *
 * Az IN_PROGRESS státusz megmarad, mert régi foglalásokon rajta van, és
 * azoknak is kell egy következő lépés.
 */
export const NEXT_STATUS: Partial<Record<BookingStatus, { to: BookingStatus; label: string }>> = {
  CONFIRMED: { to: 'ARRIVED', label: 'Megérkezett' },
  ARRIVED: { to: 'READY', label: 'Kész van' },
  IN_PROGRESS: { to: 'READY', label: 'Kész van' },
  READY: { to: 'COMPLETED', label: 'Átvette' },
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
  deadline_at: string | null
  arrived_at: string | null
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
  billing_kind: BillingKind

  vehicle_id: string
  plate_raw: string
  plate_country: string
  brand: string | null
  model: string | null
  category: VehicleCategory
  seats: number | null

  package_id: string | null
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

export type TaskSource = 'PACKAGE' | 'EXTRA'

export interface BookingTask {
  id: string
  booking_id: string
  name: string
  area: ServiceArea | null
  sort_order: number
  done: boolean
  done_at: string | null
  /** PACKAGE: a csomag része, csoportosan pipálható. EXTRA: külön kérték. */
  source: TaskSource
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

// Egy sor az azonnali keresés lebegő listájából.
export interface SearchHit {
  vehicle_id: string
  plate_raw: string
  brand: string | null
  model: string | null
  category: VehicleCategory
  seats: number | null
  customer_id: string
  customer_name: string
  customer_phone: string
  customer_type: CustomerType
  company_name: string | null
  /** Az adott autó utolsó lezárt munkája — ebből lesz az "Ezt kéri" gomb. */
  utolso_datum: string | null
  utolso_csomag: string | null
  utolso_ar: number | null
}

// Amit a rendszám beírására visszakapunk.
export interface PlateLookup {
  vehicle: Vehicle
  customer: Customer
  history: HistoryRow[]
}

/** A booking_form_data() visszatérése — ezzel tölti fel magát a szerkesztő. */
export interface BookingFormData {
  booking: {
    id: string
    booking_type: BookingType
    status: BookingStatus
    service_date: string
    start_at: string | null
    drop_off_at: string | null
    pick_up_at: string | null
    deadline_at: string | null
    package_id: string | null
    scope: BookingScope
    full_service: boolean
    notes: string | null
  }
  customer: Customer
  vehicle: Vehicle
  extras: { extra_id: string; quantity: number | string }[]
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
  company_name: string | null
  deadline_time: string | null
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

// ---------------------------------------------------------------------------
//  Bérletek és szerződések
// ---------------------------------------------------------------------------

export type BillingKind = 'NORMAL' | 'BERLETES' | 'SZERZODESES'
export type ValidityKind = 'DATUM' | 'EV' | 'NAP'
export type ContractTier = 'NORMAL' | 'PREMIUM'
export type ContractSize = 'NORMAL' | 'NAGY'

export const BILLING_LABEL: Record<BillingKind, string> = {
  NORMAL: 'Listaáras',
  BERLETES: 'Bérletes',
  SZERZODESES: 'Szerződéses',
}

export const TIER_LABEL: Record<ContractTier, string> = {
  NORMAL: 'Normál csomag',
  PREMIUM: 'Prémium csomag',
}

export const SIZE_LABEL: Record<ContractSize, string> = {
  NORMAL: 'Normál méret',
  NAGY: 'Nagy méret',
}

/** Egy sor a v_pass_balance nézetből: bérlet + egy tétele. */
export interface PassBalanceRow {
  pass_id: string
  customer_id: string
  customer_name: string
  pass_name: string
  price_huf: number
  valid_from: string
  valid_until: string
  active: boolean
  lejart: boolean
  napok_hatra: number
  pass_item_id: string
  package_id: string | null
  package_code: string | null
  package_name: string | null
  category: VehicleCategory | null
  qty_total: number
  qty_used: number
  qty_left: number
}

export interface NewPassInput {
  customer_id: string
  name: string
  price_huf: number
  valid_from?: string
  validity_kind: ValidityKind
  validity_value: string
  notes?: string | null
  items: { package_id: string | null; category: VehicleCategory | null; qty_total: number }[]
}

export interface ContractRow {
  id: string
  customer_id: string
  customer_name: string
  company_name: string | null
  tax_number: string | null
  pickup_delivery: boolean
  valid_from: string
  valid_until: string | null
  active: boolean
  notes: string | null
  prices: { tier: ContractTier; size: ContractSize; price_huf: number }[]
}

export interface ContractInput {
  id?: string | null
  customer_id: string
  tax_number: string | null
  pickup_delivery: boolean
  valid_until: string | null
  notes: string | null
  prices: { tier: ContractTier; size: ContractSize; price_huf: number }[]
}

/** Egy mennyiséges tétel a foglaláson — a munkalistán szerkeszthető. */
export interface BookingExtraRow {
  booking_id: string
  item_id: string
  extra_id: string
  name: string
  quantity: number
  price_huf: number
  price_unit: MeasureUnit
  duration_unit: MeasureUnit
}

// --- Ügyfelek képernyő --------------------------------------------------------

export interface CustomerSummary {
  id: string
  name: string
  phone: string
  email: string | null
  company_name: string | null
  type: CustomerType
  billing_kind: BillingKind
  notes: string | null
  internal_notes: string | null
  jarmuvek: number
  latogatas: number
  osszesen: number
  utolso: string | null
  atlag: number | null
  atlag_napok: number | null
  kedvenc_csomag: string | null
}

export interface VehicleSummary {
  id: string
  plate_raw: string
  brand: string | null
  model: string | null
  category: VehicleCategory
  seats: number | null
  notes: string | null
  customer_id: string
  customer_name: string
  customer_phone: string
  company_name: string | null
  billing_kind: BillingKind
  latogatas: number
  utolso: string | null
  utolso_csomag: string | null
}

// --- Áttekintés ---------------------------------------------------------------

export interface DashboardSummary {
  nap: string
  ma: { db: number; kesz: number; percek: number; bevetel: number }
  het: { db: number; bevetel: number }
  nepszeru: { nev: string; db: number }[]
  gondok: { cimke: string; szoveg: string; suly: number }[]
}

export interface WeekDay {
  nap: string
  hetfotol: number
  parallel_slots: number
  capacity_minutes: number
  booked_minutes: number
  free_minutes: number
  /** Null, ha a nap zárva van — nullával nem lehet osztani. */
  load_pct: number | null
}

// --- Beállítások --------------------------------------------------------------

export interface BreakWindow {
  id?: string
  starts: string
  ends: string
  label: string
}

/** Egy hétköznap három időrétege: nyitvatartás, munkaidő, szünetek. */
export interface OpeningDay {
  weekday: number
  nev: string
  opens: string | null
  closes: string | null
  business_closed: boolean
  starts: string | null
  ends: string | null
  work_closed: boolean
  breaks: BreakWindow[]
}

export interface ShopSettings {
  drop_off_from: string
  default_parallel_slots: number
  default_travel_minutes: number
  pass_validity_kind: ValidityKind
  pass_validity_value: string
}

export interface DayOverride {
  day: string
  closed: boolean
  opens: string | null
  closes: string | null
  work_starts: string | null
  work_ends: string | null
  parallel_slots: number | null
  note: string | null
}

// --- Felhasználók -------------------------------------------------------------

export const ROLE_LABEL: Record<StaffRole, string> = {
  SUPERADMIN: 'Fejlesztő',
  TULAJDONOS: 'Tulajdonos',
  STAFF: 'Alkalmazott',
}

export const ROLE_LEIRAS: Record<StaffRole, string> = {
  SUPERADMIN: 'Mindenhez hozzáfér. Ide kerülnek később a fejlesztést segítő funkciók.',
  TULAJDONOS: 'Az alkalmazáson belül mindenhez hozzáfér, és alkalmazottat vehet fel.',
  STAFF: 'A napi munkához mindent tud. Az áttekintéshez és a beállításokhoz nem fér hozzá.',
}

export interface StaffRow {
  /** Null, amíg a meghívott dolgozó nem regisztrált. */
  id: string | null
  full_name: string
  role: StaffRole
  active: boolean
  email: string | null
  belepett_mar: boolean
  /** Igaz, ha még csak meghívó van, fiók nincs. */
  meghivo: boolean
  created_at: string
}

export interface NewStaffInput {
  full_name: string
  email: string
  password: string
  role: StaffRole
}
