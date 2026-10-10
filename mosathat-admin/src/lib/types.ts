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

export const KATEGORIAK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
export const TERJEDELMEK: BookingScope[] = ['TELJES', 'KULSO', 'BELSO']

export const EGYSEG: Record<MeasureUnit, string> = {
  DB: 'db', AJTO: 'ajtó', ULES: 'ülés', LITER: 'liter', ALKALOM: 'alkalom',
}

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

export const NEXT_STATUS: Partial<Record<BookingStatus, { to: BookingStatus; label: string }>> = {
  REQUESTED: { to: 'CONFIRMED', label: 'Visszaigazol' },
  CONFIRMED: { to: 'ARRIVED', label: 'Megérkezett' },
  ARRIVED: { to: 'READY', label: 'Kész van' },
  IN_PROGRESS: { to: 'READY', label: 'Kész van' },
  READY: { to: 'COMPLETED', label: 'Átvette' },
}

const LEMONDOTT_ALLAPOTOK: BookingStatus[] = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'REJECTED']

export const lemondottE = (s: string) => (LEMONDOTT_ALLAPOTOK as string[]).includes(s)

export const eloE = (s: string) => s !== 'NO_SHOW' && !lemondottE(s)

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

export interface PackageMatrixRow {
  package_id: string
  package_code: string
  package_name: string
  package_sort: number
  slot_id: string
  slot_name: string
  name: string
  area: ServiceArea
  sort_order: number
}

export interface PackageExtraRow {
  package_id: string
  package_code: string
  parent_name: string
  name: string
  area: ServiceArea
  sort_order: number
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

  pickup_fee_huf: number | null

  tasks_total: number
  tasks_done: number
  first_done_at: string | null
  last_done_at: string | null

  last_day: string
  contract_kind: ContractKind | null
  company_id: string | null
  extras_summary: string | null
  extras_count: number
  tentative: boolean
  not_fitted: boolean
  fleet_group: string | null
  fleet_index: number | null
  skip_note?: string | null
  skip_huf?: number | null
  napi_perc?: number | null
  kezdve?: string | null
  befejezve?: string | null
  flotta?: DayBooking[]

  sorrend?: number
  nap_szama?: number
  napok_szama?: number
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
  base_capacity_minutes: number
  staff_pct: number | null
  staff_total: number
  cars: number
  revenue_huf: number
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
  source: TaskSource
}

export interface CalcResult {
  price_huf: number
  work_minutes: number | null
  rest_minutes: number
  requires_quote: boolean
  duration_known: boolean
}

export interface QuoteLine {
  kind: 'PACKAGE' | 'FULL_SERVICE' | 'EXTRA' | 'SURCHARGE' | 'FUVAR'
  ref_id: string | null
  name: string
  quantity: number
  unit_price_huf: number
  price_huf: number
  work_minutes: number
  sort_order: number
}

export type ContractKind = 'FLOTTA' | 'SAJAT'

export interface Quote extends CalcResult {
  lines: QuoteLine[]
  company_id: string | null
  contract_id: string | null
  contract_kind: ContractKind | null
  contract_price: boolean
  contract_prices: Record<string, number>
}

export interface CompanyHit {
  id: string
  name: string
  tax_number: string | null
  ugyfelek: number
  jarmuvek: number
  szerzodes: boolean
}

export interface CompanyCandidate {
  id: string
  name: string
  egyezes: 'AZONOS' | 'HASONLO'
}

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
  utolso_datum: string | null
  utolso_csomag: string | null
  utolso_ar: number | null
  company_id: string | null
  contract_kind: ContractKind | null
}

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
    contract_kind: ContractKind | null
  }
  customer: Customer & { company_id: string | null }
  vehicle: Vehicle & { contract_kind: ContractKind | null }
  company: { id: string; name: string } | null
  extras: { extra_id: string; quantity: number | string }[]
}

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
  company_id?: string | null
  company_name: string | null
  contract_kind?: ContractKind | null
  pick_up_date?: string | null
  deadline_time?: string | null
  customer_id: string | null
  customer_name: string
  customer_phone: string
  vehicle_id: string | null
  plate_raw: string
  brand: string | null
  model: string | null
  seats: number | null

  booking_type: BookingType
  service_date: string
  start_time: string | null
  drop_off_time: string | null
  pick_up_time: string | null
  deadline_date?: string | null
  source: BookingSource
  notes: string | null
}

export type BillingKind = 'NORMAL' | 'BERLETES' | 'SZERZODESES'
export type ValidityKind = 'DATUM' | 'EV' | 'NAP'
export type ContractTier = 'NORMAL' | 'PREMIUM'
export type ContractSize = 'NORMAL' | 'NAGY'

export const BILLING_LABEL: Record<BillingKind, string> = {
  NORMAL: 'Listaáras',
  BERLETES: 'Bérletes',
  SZERZODESES: 'Szerződéses',
}

export const SIZE_LABEL: Record<ContractSize, string> = {
  NORMAL: 'Normál méret',
  NAGY: 'Nagy méret',
}

export const KIND_LABEL: Record<ContractKind, string> = {
  FLOTTA: 'Céges',
  SAJAT: 'Magán',
}

export interface ContractPrice {
  package_id: string
  package_code: string
  package_name: string
  size: ContractSize
  kind: ContractKind
  price_huf: number
  tier?: ContractTier
}

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
  pickup_delivery_fee_huf: number | null
  valid_from: string
  valid_until: string | null
  active: boolean
  notes: string | null
  prices: ContractPrice[]
  company_id: string
  ugyfelek: number
  jarmuvek: number
  cycle_day: number
  fleet_cars: boolean
}

export interface ContractInput {
  id?: string | null
  company_id?: string | null
  company_name?: string | null
  customer_id?: string | null
  tax_number: string | null
  pickup_delivery: boolean
  pickup_delivery_fee_huf: number | null
  valid_until: string | null
  notes: string | null
  prices: { package_id: string; size: ContractSize; kind: ContractKind; price_huf: number }[]
  cycle_day?: number
}

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
  rendszamok: string[]
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
  company_id: string | null
  contract_kind: ContractKind | null
  szerzodes: boolean
}

export interface CompanyCar {
  id: string
  plate_raw: string
  brand: string | null
  model: string | null
  category: VehicleCategory
  customer_id: string
  customer_name: string
  customer_phone: string
  contract_kind: ContractKind | null
  latogatas: number
  utolso: string | null
}

export interface CompanySummary {
  id: string
  name: string
  tax_number: string | null
  szerzodes: boolean
  szerzodes_vege: string | null
  hozom_viszem: boolean
  ugyfelek: number
  jarmuvek: number
  latogatas: number
  utolso: string | null
  autok: CompanyCar[]
  berletes: boolean
  lapos: boolean
}

export interface SheetColumn {
  key: string
  label: string
  visible: boolean
}

export interface SheetRow {
  id: string | null
  booking_id: string | null
  day: string
  plate: string | null
  km: number | null
  net_huf: number | null
  name: string | null
  extra: Record<string, string>
  signature: string | null
  signed_at: string | null
}

export interface SheetDetail {
  company: { id: string; name: string; tax_number: string | null }
  month: string
  period_start: string
  period_end: string
  sheet: { id: string; closed_at: string | null; closed_by_name: string | null } | null
  columns: SheetColumn[]
  footer_text: string | null
  prices: ContractPrice[]
  rows: SheetRow[]
  months: { month: string; start: string; end: string; closed: boolean; rows: number }[]
}

export interface SheetCompany {
  id: string
  name: string
  kell: boolean
  szerzodes: boolean
  berletes: boolean
  rows: number
  unsigned: number
  closed: boolean
  open_before: number
  period_start: string
  period_end: string
}

export interface FinishPreview {
  base: number
  adjusted: number
  skip_huf: number
  skip_note: string | null
  skipped_areas: ServiceArea[]
  skipped_items: string[]
}

export interface SheetForBooking {
  company_id: string | null
  company_name: string | null
  kell: boolean
  columns: SheetColumn[]
  closed: boolean
  row: SheetRow
}

export interface SheetRowInput {
  id?: string | null
  booking_id?: string | null
  company_id?: string | null
  day: string
  plate: string | null
  km: number | null
  net_huf: number | null
  name: string | null
  extra: Record<string, string>
  signature?: string
}

export interface Gond {
  cimke: string
  szoveg: string
  suly: number
  cel: 'telefon' | 'munkalap' | 'szolgaltatasok' | 'partnerek' | null
  foglalasok: { id: string; plate_raw: string; service_date: string }[] | null
}

export interface DashboardSummary {
  nap: string
  ma: { db: number; kesz: number; percek: number; bevetel: number }
  het: { db: number; bevetel: number }
  nepszeru: { nev: string; db: number }[]
  gondok: Gond[]
}

export type MunkalapFokusz = 'telefon'

export type AbsenceKind = 'KESOBB_ERKEZIK' | 'KORABBAN_TAVOZIK' | 'TAVOL' | 'EGESZ_NAP'

export interface Absence {
  id: string
  staff_id: string
  day: string
  kind: AbsenceKind
  starts: string | null
  ends: string | null
  note: string | null
}

export interface AbsenceRow extends Absence {
  staff_name: string
  sajat: boolean
}

export interface DayAbsence extends Omit<Absence, 'day'> {
  staff_name: string
  szamit: boolean
}

export interface OnlineBookingInput {
  category: VehicleCategory
  scope: BookingScope
  package_id: string
  full_service: boolean
  extras: { extra_id: string; quantity: number }[]
  booking_type: 'VAROS' | 'LEADOS'
  service_date: string
  start_time: string | null
  drop_off_time: string | null
  customer_name: string
  customer_phone: string
  customer_email: string | null
  plate_raw: string
  brand: string | null
  model: string | null
  notes: string | null
}

export interface DayLane {
  starts: string
  ends: string
  lanes: number
}

export interface VacationRow {
  id: string
  staff_id: string
  staff_name: string
  from_day: string
  to_day: string
  note: string | null
  sajat: boolean
}

export interface VacationInput {
  id?: string | null
  staff_id?: string | null
  from_day: string
  to_day: string
  note?: string | null
}

export interface AbsenceInput {
  id?: string | null
  staff_id?: string | null
  day: string
  kind: AbsenceKind
  starts?: string | null
  ends?: string | null
  note?: string | null
}

export interface WeekDay {
  nap: string
  hetfotol: number
  parallel_slots: number
  capacity_minutes: number
  booked_minutes: number
  free_minutes: number
  load_pct: number | null
}

export interface BreakWindow {
  id?: string
  starts: string
  ends: string
  label: string
}

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

export const ROLE_LABEL: Record<StaffRole, string> = {
  SUPERADMIN: 'Fejlesztő',
  TULAJDONOS: 'Tulajdonos',
  STAFF: 'Alkalmazott',
}

export const ROLE_LEIRAS: Record<StaffRole, string> = {
  SUPERADMIN: 'Mindenhez hozzáfér. Ide kerülnek később a fejlesztést segítő funkciók.',
  TULAJDONOS: 'Az alkalmazáson belül mindenhez hozzáfér, és alkalmazottat vehet fel.',
  STAFF: 'A napi munkához mindent tud: időpontot vesz fel, módosít és zár le. '
    + 'Az Áttekintéshez és a Beállításokhoz nem fér hozzá. Az Ügyfelek, valamint '
    + 'a Cégek és bérletesek menüpont alapból csak olvasható nála — ezt a lap '
    + 'tetején lévő kapcsolóval lehet megnyitni, szerepkörre vagy egy fiókra.',
}

export interface StaffRow {
  id: string | null
  full_name: string
  role: StaffRole
  active: boolean
  email: string | null
  belepett_mar: boolean
  meghivo: boolean
  created_at: string
  can_edit_customers: boolean
  can_edit_customers_sajat: boolean
  kozos?: boolean
}

export interface RolePermission {
  role: StaffRole
  can_edit_customers: boolean
}

export interface NewStaffInput {
  full_name: string
  email: string
  password: string
  role: StaffRole
}
