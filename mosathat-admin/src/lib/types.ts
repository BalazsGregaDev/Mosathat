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

/** Egy sor a csomag-összehasonlító táblázatból: egy csomag egy tétele.
 *  A slot_id köti egy sorba a felülírt és a felülíró tételt — a „Falc
 *  áttörlés" és a „Falc mélytisztítás" ugyanaz a sor, más csomagban. */
export interface PackageMatrixRow {
  package_id: string
  package_code: string
  package_name: string
  package_sort: number
  slot_id: string
  /** A sor felirata: a felülírási lánc gyökerének a neve. */
  slot_name: string
  /** Ebben a csomagban ez a tétel neve. Eltérhet a slot_name-től. */
  name: string
  area: ServiceArea
  sort_order: number
}

/** Amivel egy csomag több a közvetlen elődjénél. A Startra nincs sor. */
export interface PackageExtraRow {
  package_id: string
  package_code: string
  /** Az előd csomag neve — „a Start mindene, plusz…" */
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

  /**
   * A szerződésben megállapodott fuvardíj ennél a foglalásnál. Csak akkor van
   * értéke, ha a foglalás hozom-viszem, és az ügyfél cégének van érvényes
   * szerződése fuvardíjjal. A foglalás árában külön tételsorként benne van.
   */
  pickup_fee_huf: number | null

  tasks_total: number
  tasks_done: number
  first_done_at: string | null
  last_done_at: string | null

  /** A foglalás utolsó napja (a Viszi napja). */
  last_day: string
  /** Ha szerződéses áron ment: céges (flotta) vagy saját autó. */
  contract_kind: ContractKind | null
  company_id: string | null
  /** Az egyéb szolgáltatások nevei vesszővel: „Motorkozmetika, Ózonos kezelés". */
  extras_summary: string | null
  extras_count: number

  // A napi listában (day_bookings) ezek is jönnek:
  /** Hányadik a nap listájában. */
  sorrend?: number
  /** Hányadik napja ez a foglalásnak (1 = az érkezés napja). */
  nap_szama?: number
  /** Hány napos összesen. 1 = egynapos. */
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
  /** Ennyi férne, ha minden alkalmazott bent volna. */
  base_capacity_minutes: number
  /** A jelenlét átlagos szorzója aznap (100 = mindenki bent). */
  staff_pct: number | null
  /** Hány alkalmazott számít a kapacitásba. */
  staff_total: number
  /** Hány autó van aznap — a többnaposak is. */
  cars: number
  /** Az aznap kezdődő foglalások értéke. */
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

/** Egy tételsor az árkijelzésben (a quote_booking() lines tömbje). */
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

/**
 * A quote_booking() visszatérése: az ár, ahogy a foglalás menteni fogja —
 * szerződéses árral és fuvarral együtt.
 */
export interface Quote extends CalcResult {
  lines: QuoteLine[]
  company_id: string | null
  /** Van-e a cégnek élő szerződése. Csak ilyenkor kell Flotta / Saját választó. */
  contract_id: string | null
  contract_kind: ContractKind | null
  /** A csomag ára a szerződésből jött-e. */
  contract_price: boolean
  /** Csomagonként a szerződéses ár erre a méretre és fajtára (csomag id →
   *  forint). Ahol nincs megállapodott ár, ott nincs kulcs: listaáron megy. */
  contract_prices: Record<string, number>
}

/** Egy találat a Cég mező keresőjéből. */
export interface CompanyHit {
  id: string
  name: string
  tax_number: string | null
  ugyfelek: number
  jarmuvek: number
  szerzodes: boolean
}

/** Mentés előtti egyeztetés: van-e ilyen vagy hasonló nevű cég. */
export interface CompanyCandidate {
  id: string
  name: string
  egyezes: 'AZONOS' | 'HASONLO'
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
  company_id: string | null
  /** Amit az autó legutóbb kapott: céges (flotta) vagy saját autó. */
  contract_kind: ContractKind | null
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
    contract_kind: ContractKind | null
  }
  customer: Customer & { company_id: string | null }
  vehicle: Vehicle & { contract_kind: ContractKind | null }
  company: { id: string; name: string } | null
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
  /** A kiválasztott cég. Ha nincs, de van company_name, a név alapján dől el. */
  company_id?: string | null
  company_name: string | null
  /** Csak ha a cégnek élő szerződése van: céges autó vagy a dolgozó sajátja. */
  contract_kind?: ContractKind | null
  /** A Viszi napja. Ha későbbi, mint a service_date, a foglalás többnapos. */
  pick_up_date?: string | null
  deadline_time?: string | null
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
  /** Régi mező (a „Több napos" típusé). Helyette a pick_up_date. */
  deadline_date?: string | null
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

/** A szerződés két ára egy csomagra: a cég autóira és a dolgozók saját autóira. */
export const KIND_LABEL: Record<ContractKind, string> = {
  FLOTTA: 'Céges',
  SAJAT: 'Magán',
}

/** Egy szerződéses ár: csomag × méret × fajta. */
export interface ContractPrice {
  package_id: string
  package_code: string
  package_name: string
  size: ContractSize
  kind: ContractKind
  price_huf: number
  /** A régi (csomagszint) alak — csak a visszafelé kompatibilitásért. */
  tier?: ContractTier
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
  /** A fuvar ára alkalmanként, a munka árán felül. NULL: nincs külön megállapodva. */
  pickup_delivery_fee_huf: number | null
  valid_from: string
  valid_until: string | null
  active: boolean
  notes: string | null
  prices: ContractPrice[]
  /** A cég (a szerződés a cégé, nem egy ügyfélé). */
  company_id: string
  /** Hány ügyfél (sofőr) és hány autó tartozik a céghez. */
  ugyfelek: number
  jarmuvek: number
}

/**
 * Szerződés mentése. A cég háromféleképpen adható meg: a meglévő cég
 * azonosítója (company_id), egy név (company_name — ha nincs ilyen, létrejön,
 * ugyanazzal a névkulccsal, mint mindenhol), vagy régi módon egy ügyfél.
 */
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
  /** Az ügyfél autóinak rendszámai. */
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
  /** Az autó szerződéses fajtája (Céges / Magán), ha a cégnek van szerződése. */
  contract_kind: ContractKind | null
  /** Van-e a cégnek élő szerződése. */
  szerzodes: boolean
}

/** Egy autó a Cég szerinti nézetben. */
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

/** Egy cég az összes autójával (Ügyfelek → Cég szerint). */
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
  /** Van-e bérletes ügyfele. */
  berletes: boolean
  /** Kell-e neki igazolólap (szerződéses vagy bérletes). */
  lapos: boolean
}

// --- Igazolólap ---------------------------------------------------------------
//
//  A szerződéses és bérletes cégek havi lapja: dátum, rendszám, km óra állás,
//  nettó ár, név, aláírás — és a cég saját oszlopai. Az adatbázisban az adat
//  él; a Word fájlt a böngésző készíti el belőle letöltéskor.

/** Az alap oszlopok kulcsai. Átnevezhetők és elrejthetők, de nem törölhetők. */
export type SheetAlapKulcs = 'DATUM' | 'RENDSZAM' | 'KM' | 'NETTO' | 'NEV' | 'ALAIRAS'
export const SHEET_ALAP: SheetAlapKulcs[] = ['DATUM', 'RENDSZAM', 'KM', 'NETTO', 'NEV', 'ALAIRAS']

/** Egy oszlop: alap (a fenti kulcsok egyike) vagy saját (E_ kezdetű kulcs). */
export interface SheetColumn {
  key: string
  label: string
  visible: boolean
}

/** A lap egy sora: egy átadott autó. */
export interface SheetRow {
  id: string | null
  booking_id: string | null
  day: string
  plate: string | null
  km: number | null
  net_huf: number | null
  name: string | null
  /** A saját oszlopok értékei, kulcs szerint. */
  extra: Record<string, string>
  /** Az aláírás képe (PNG data URL), vagy null. */
  signature: string | null
  signed_at: string | null
}

/** Egy cég egy havi lapja, mindennel, ami a szerkesztőhöz és a Wordhöz kell. */
export interface SheetDetail {
  company: { id: string; name: string; tax_number: string | null }
  /** A hónap első napja: "2026-10-01". */
  month: string
  /** Null, ha erre a hónapra még nincs lap (nincs sora, és nem zárták le). */
  sheet: { id: string; closed_at: string | null; closed_by_name: string | null } | null
  columns: SheetColumn[]
  footer_text: string | null
  /** A szerződés árai a lábléchez (bruttó; a nettót a felület számolja). */
  prices: ContractPrice[]
  rows: SheetRow[]
  /** A cég eddigi lapjai, a legújabb elöl. */
  months: { month: string; closed: boolean; rows: number }[]
}

/** Az Igazolólap menüpont listájának egy sora: egy cég egy hónapja. */
export interface SheetCompany {
  id: string
  name: string
  /** Kell-e most lap (élő szerződés vagy bérletes ügyfél). */
  kell: boolean
  szerzodes: boolean
  berletes: boolean
  /** A választott hónap sorai, ebből az aláíratlanok. */
  rows: number
  unsigned: number
  closed: boolean
  /** Hány korábbi hónap maradt lezáratlanul. */
  open_before: number
}

/** A napi nézet gombjához: a foglalás sora, előre kitöltve (vagy a meglévő). */
export interface SheetForBooking {
  company_id: string | null
  company_name: string | null
  /** Kell-e a cégnek lap (szerződéses / bérletes). */
  kell: boolean
  columns: SheetColumn[]
  /** A sor hónapjának lapja le van-e zárva. */
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
  /**
   * Csak akkor kell megadni, ha az aláírás változott: új kép, vagy '' (törlés).
   * Ha a kulcs hiányzik, a mentett aláírás marad.
   */
  signature?: string
}

// --- Áttekintés ---------------------------------------------------------------

/** Egy figyelmeztetés: mit mond, és kattintásra mit kell megnyitni. */
export interface Gond {
  cimke: string
  szoveg: string
  suly: number
  /**
   *  telefon        → a munkalap, a telefonszám mezővel nyitva
   *  munkalap       → a munkalap
   *  szolgaltatasok → a Szolgáltatások oldal
   *  partnerek      → a Cégek és bérletesek oldal
   */
  cel: 'telefon' | 'munkalap' | 'szolgaltatasok' | 'partnerek' | null
  /** Az érintett foglalások — ezekre lehet egyenként kattintani. */
  foglalasok: { id: string; plate_raw: string; service_date: string }[] | null
}

export interface DashboardSummary {
  nap: string
  ma: { db: number; kesz: number; percek: number; bevetel: number }
  het: { db: number; bevetel: number }
  nepszeru: { nev: string; db: number }[]
  gondok: Gond[]
}

/** Mit nyisson meg a munkalap rögtön: a telefonszám mezőt. */
export type MunkalapFokusz = 'telefon'

// --- Munkaidő-változás --------------------------------------------------------

export type AbsenceKind = 'KESOBB_ERKEZIK' | 'KORABBAN_TAVOZIK' | 'TAVOL' | 'EGESZ_NAP'

/** Egy alkalmazott munkaidő-változása egy napon (később jön, korábban megy…). */
export interface Absence {
  id: string
  staff_id: string
  day: string
  kind: AbsenceKind
  /** "16:00" — KORABBAN_TAVOZIK: mikor megy; TAVOL: mettől. */
  starts: string | null
  /** "10:00" — KESOBB_ERKEZIK: mikor jön; TAVOL: meddig. */
  ends: string | null
  note: string | null
}

/** A Profilom listájában: egy munkaidő-változás, kiével együtt. */
export interface AbsenceRow extends Absence {
  staff_name: string
  /** Az enyém-e (a tulajdonos mindenkiét látja). */
  sajat: boolean
}

/** A napi kártyára: kinek mi változik aznap. */
export interface DayAbsence extends Omit<Absence, 'day'> {
  staff_name: string
  /** Beleszámít-e a kapacitásba (csak az alkalmazottaké). */
  szamit: boolean
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
  STAFF: 'A napi munkához mindent tud: időpontot vesz fel, módosít és zár le. '
    + 'Az Áttekintéshez és a Beállításokhoz nem fér hozzá. Az Ügyfelek, valamint '
    + 'a Cégek és bérletesek menüpont alapból csak olvasható nála — ezt a lap '
    + 'tetején lévő kapcsolóval lehet megnyitni, szerepkörre vagy egy fiókra.',
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
  /** Szerkesztheti-e most az ügyfeleket, cégeket és bérleteket. */
  can_edit_customers: boolean
  /** Igaz, ha ez a fiókra szóló külön döntés — nem a szerepköre alapértéke. */
  can_edit_customers_sajat: boolean
}

/** Egy szerepkör alapértelmezései. Amelyik fiókon nincs külön döntés, ezt követi. */
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
