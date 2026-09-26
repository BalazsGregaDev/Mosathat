import type {
  BookingExtraRow, BookingFormData, BookingScope, CustomerSummary, VehicleSummary, BookingStatus, BookingTask, CalcInput, CalcResult,
  ContractInput, ContractRow, DashboardSummary, DayBooking, DayCapacity, DayOverride,
  Extra, FullServicePrice,
  LatestStart, NewBookingInput, NewPassInput, NewStaffInput, OpeningDay, Package, PackagePrice, PassBalanceRow,
  PlateLookup, SearchHit, ServiceArea, ShopSettings, StaffRole, StaffRow, StandingCar, Surcharge, VehicleCategory,
  WeekDay, WorkWindow,
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
  role: StaffRole
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
  /**
   * Foglalások egy időszakra, a heti és a havi nézethez. Ugyanaz a nézet,
   * mint a napinál — nem külön lekérdezés, hogy ne lehessen két különböző
   * válasz ugyanarra a napra.
   */
  getRange(from: string, to: string): Promise<DayBooking[]>
  getBooking(id: string): Promise<DayBooking | null>
  getCapacity(date: string): Promise<DayCapacity>
  getWorkWindows(date: string): Promise<WorkWindow[]>
  getLatestStart(date: string, minutes: number): Promise<LatestStart[]>
  getStandingCars(): Promise<StandingCar[]>

  lookupPlate(plate: string): Promise<PlateLookup | null>
  /** Rendszám, név és cégnév egyszerre — a legjobb néhány találat. */
  searchCustomers(q: string, limit?: number): Promise<SearchHit[]>
  calcService(input: CalcInput): Promise<CalcResult>

  createBooking(input: NewBookingInput): Promise<string>
  /** Meglévő foglalás módosítása. Ár, idő, tételek, munkalista újraszámolva. */
  updateBooking(bookingId: string, input: NewBookingInput): Promise<void>
  /** Amivel a szerkesztő űrlap fel tudja tölteni magát. */
  getBookingFormData(bookingId: string): Promise<BookingFormData | null>
  /**
   * Egyetlen adat átírása a munkalapon. A többi mező érintetlen marad, de az
   * ár, az idő és a munkalista újraszámolódik — ugyanazon az úton, mint a
   * teljes szerkesztésnél.
   */
  patchBooking(bookingId: string, patch: Record<string, unknown>): Promise<void>
  setStatus(bookingId: string, status: BookingStatus, note?: string): Promise<void>
  setFinalPrice(bookingId: string, price: number, reason?: string): Promise<void>

  // --- szolgáltatások szerkesztése ---
  updateExtra(id: string, patch: Partial<Extra>): Promise<void>
  updatePackagePrice(
    packageId: string, category: VehicleCategory, scope: BookingScope,
    patch: { price_huf?: number | null; duration_minutes?: number | null },
  ): Promise<void>
  updateFullServicePrice(
    packageId: string, category: VehicleCategory,
    patch: { price_huf?: number | null; extra_work_minutes?: number | null },
  ): Promise<void>
  updatePackage(id: string, patch: { name?: string; description?: string | null }): Promise<void>

  // --- ügyfelek és járművek ---
  listCustomers(q?: string): Promise<CustomerSummary[]>
  listVehicles(q?: string): Promise<VehicleSummary[]>
  saveCustomer(patch: Record<string, unknown>): Promise<void>
  saveVehicle(patch: Record<string, unknown>): Promise<void>

  // --- áttekintés ---
  getDashboard(date: string): Promise<DashboardSummary>
  getWeekCapacity(date: string): Promise<WeekDay[]>

  // --- beállítások ---
  getOpening(): Promise<OpeningDay[]>
  saveDayHours(day: OpeningDay): Promise<void>
  getShopSettings(): Promise<ShopSettings>
  saveShopSettings(s: ShopSettings): Promise<void>
  /** Kivételnapok a mai naptól: ünnep, szabadság, ledolgozós szombat. */
  listDayOverrides(from: string): Promise<DayOverride[]>
  saveDayOverride(o: DayOverride): Promise<void>
  deleteDayOverride(day: string): Promise<void>

  // --- felhasználók ---
  listStaff(): Promise<StaffRow[]>
  /**
   * Új felhasználó. A szerepkör NEM a böngészőből megy át: előbb meghívó
   * készül az adatbázisban (azt csak teljes jogú felhasználó írhatja), és a
   * regisztrációkor a trigger ABBÓL veszi a szerepkört.
   *
   * Ha a címhez már tartozott fiók, az kapja meg a szerepkört — ilyenkor a
   * visszaadott szöveg mondja meg, hogy ez történt, mert a jelszava a régi
   * marad. Egyébként null.
   */
  createStaff(input: NewStaffInput): Promise<string | null>
  updateStaff(id: string, patch: { full_name?: string; role?: StaffRole; active?: boolean }): Promise<void>
  deleteInvite(email: string): Promise<void>

  // --- bérletek és szerződések ---
  listPasses(): Promise<PassBalanceRow[]>
  createPass(input: NewPassInput): Promise<string>
  deactivatePass(passId: string): Promise<void>
  listContracts(): Promise<ContractRow[]>
  saveContract(input: ContractInput): Promise<string>

  /**
   * Élő frissítés: szól, ha bárki más módosít egy foglalást vagy munkalistát.
   * A visszaadott függvény leiratkozik. Demóban nincs mit figyelni — egy
   * felhasználó van —, ott üres függvényt ad vissza.
   */
  subscribe(onValtozas: () => void): () => void

  /** Mennyiséges tételek (liter, ülés, ajtó) — a munkalistán állíthatók. */
  getBookingExtras(bookingId: string): Promise<BookingExtraRow[]>
  setBookingExtraQty(itemId: string, qty: number): Promise<void>

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
