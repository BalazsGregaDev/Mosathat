import type {
  BookingExtraRow, BookingFormData, BookingScope, CustomerSummary, VehicleSummary, BookingStatus, BookingTask, CalcInput,
  ContractInput, ContractRow, DashboardSummary, DayBooking, DayCapacity, DayOverride,
  Extra, FullServicePrice,
  LatestStart, NewBookingInput, PackageMatrixRow, PackageExtraRow, NewPassInput, NewStaffInput, OpeningDay, Package, PackagePrice, PassBalanceRow,
  Quote, CompanyHit, CompanyCandidate, AbsenceInput, AbsenceRow, DayAbsence,
  CompanySummary, SheetCompany, SheetDetail, SheetForBooking, SheetRowInput, SheetColumn, RolePermission, SearchHit, ServiceArea, ShopSettings, StaffRole, StaffRow, StandingCar, Surcharge, VehicleCategory,
  WeekDay, WorkWindow, FinishPreview, KeszOpciok, ModositasCsoport, VacationRow, VacationInput, DayLane, OnlineBookingInput,
  OnlineKeres, CegLink, CegLinkAdat, FoglalasEredmeny, DontesEredmeny, KuldesEredmeny, ArculatValasztas, CsomagSzerkesztoAdat, CsomagMentesEredmeny,
  PublikusNapAdat, BerletLap, BerletLapListaElem, BerletFoglalashoz, BerletSorInput, BerletLinkAdat, BerletLinkSor,
} from '../lib/types'
import { URES_GYIK, type GyikAdmin, type GyikMod, type GyikPublikus, type GyikSor } from '../lib/gyik'
import type { NyitvaNap, Velemeny, VelemenySor, PublikusAdatokNyers, PublikusMentes, PublikusTartalomNyers } from '../lib/publikusTartalom'
import type { Kamera } from '../lib/ceg'
import type { JogiBlokk, JogiFajl, JogiFeltoltes, JogiLap, JogiValtozat } from '../lib/jogiDokumentum'
import type { Nyelv } from '../lib/nyelv'
import type { FoglalasKereses, FoglalasomAdat, FoglalasTalalat } from '../../../supabase/functions/_shared/tipusok.ts'

export interface Catalog {
  packages: Package[]
  packagePricing: PackagePrice[]
  fullServicePricing: FullServicePrice[]
  extras: Extra[]
  surcharges: Surcharge[]
  packageItems: PackageMatrixRow[]
  packageExtras: PackageExtraRow[]
}

export interface PublikusAdat {
  arculat: string | null
  mod: 'VILAGOS' | 'SOTET' | null
  lemondasOra: number
  katalogus: Catalog
  tartalom: PublikusTartalomNyers
}

export interface PublikusNyers {
  arculat: string | null
  arculat_mod: 'VILAGOS' | 'SOTET' | null
  lemondas_ora?: number
  leadas?: string | null
  nyitvatartas?: NyitvaNap[]
  adatok?: PublikusAdatokNyers
  szovegek?: Record<string, string>
  szovegek_en?: Record<string, string>
  kamerak?: Kamera[]
  velemenyek?: Velemeny[]
  gyik?: GyikPublikus
  extras?: Extra[]
  fullServicePricing?: Catalog['fullServicePricing']
  packages: Catalog['packages']
  packagePricing: Catalog['packagePricing']
  packageItems: Catalog['packageItems']
  packageExtras: Catalog['packageExtras']
}

export function publikusbol(n: PublikusNyers): PublikusAdat {
  return {
    arculat: n.arculat,
    mod: n.arculat_mod,
    lemondasOra: num(n.lemondas_ora ?? 24),
    katalogus: {
      packages: n.packages ?? [],
      packagePricing: n.packagePricing ?? [],
      packageItems: n.packageItems ?? [],
      packageExtras: n.packageExtras ?? [],
      fullServicePricing: n.fullServicePricing ?? [],
      extras: (n.extras ?? []).map(toExtra),
      surcharges: [],
    },
    tartalom: {
      adatok: n.adatok ?? {},
      szovegek: n.szovegek ?? {},
      szovegek_en: n.szovegek_en ?? {},
      kamerak: n.kamerak ?? [],
      velemenyek: n.velemenyek ?? [],
      gyik: n.gyik ?? URES_GYIK,
      nyitvatartas: n.nyitvatartas ?? [],
      leadas: n.leadas ?? null,
    },
  }
}

export type KeresesMezo = 'MIND' | 'RENDSZAM' | 'NEV'

export interface SessionUser {
  id: string
  name: string
  role: StaffRole
  email: string | null
  canEditCustomers: boolean
}

export interface DataSource {
  readonly isDemo: boolean

  init(): Promise<void>

  signIn(email: string, password: string): Promise<SessionUser>
  signOut(): Promise<void>
  currentUser(): Promise<SessionUser | null>

  getCatalog(): Promise<Catalog>

  getDay(date: string): Promise<DayBooking[]>
  getRange(from: string, to: string): Promise<DayBooking[]>
  getRangeOrder(from: string, to: string): Promise<Map<string, number>>
  getDayLanes(date: string): Promise<DayLane[]>
  getStartMinutes(): Promise<number | null>
  listOnlineKeresek(): Promise<OnlineKeres[]>
  onlineKeresDontes(bookingId: string, elfogad: boolean): Promise<DontesEredmeny>
  ertesitesekKuldese(): Promise<KuldesEredmeny | null>
  getArculat(): Promise<ArculatValasztas>
  saveArculat(kod: string, mod: 'VILAGOS' | 'SOTET'): Promise<void>
  getCsomagSzerkeszto(): Promise<CsomagSzerkesztoAdat>
  getPublikus(): Promise<PublikusAdat>
  savePublikusTartalom(p: PublikusMentes): Promise<void>
  velemenyekLista(): Promise<VelemenySor[]>
  velemenyekMentes(lista: VelemenySor[]): Promise<void>
  gyikLista(): Promise<GyikAdmin>
  gyikMentes(k: Partial<GyikSor> & { kerdes: string }): Promise<string>
  gyikTorles(id: string): Promise<void>
  gyikSorrend(ids: string[]): Promise<void>
  gyikBeallitas(mod: GyikMod, max: number): Promise<void>
  gyikKepFeltoltes(f: Blob): Promise<string>
  publikusNap(nap: string): Promise<PublikusNapAdat>
  publikusAjanlat(input: Partial<NewBookingInput> & CalcInput): Promise<Quote>
  publikusFoglalas(input: OnlineBookingInput): Promise<string>
  publikusJogi(lap: JogiLap, nyelv: Nyelv): Promise<JogiBlokk[] | null>
  cegLinkek(): Promise<CegLink[]>
  cegLinkUj(companyId: string): Promise<string>
  cegLinkAtir(companyId: string, cim: string): Promise<string>
  cegLinkUzenet(companyId: string, uzenet: string): Promise<void>
  cegLinkAdat(token: string): Promise<CegLinkAdat | null>
  cegAjanlat(token: string, input: Partial<NewBookingInput> & CalcInput): Promise<Quote>
  cegFoglalas(token: string, input: OnlineBookingInput): Promise<FoglalasEredmeny>
  cegTeliNapok(token: string, tol: string, ig: string): Promise<string[]>
  berletLinkek(): Promise<BerletLinkSor[]>
  berletLinkUj(customerId: string): Promise<string>
  berletLinkAtir(customerId: string, cim: string): Promise<string>
  berletLinkAdat(token: string): Promise<BerletLinkAdat | null>
  berletAjanlat(token: string, input: Partial<NewBookingInput> & CalcInput): Promise<Quote>
  berletFoglalas(token: string, input: OnlineBookingInput): Promise<FoglalasEredmeny>
  foglalasom(token: string): Promise<FoglalasomAdat>
  foglalasKereses(adat: FoglalasKereses): Promise<FoglalasTalalat[]>
  foglalasomModositas(token: string, uzenet: string): Promise<FoglalasomAdat>
  foglalasomLemondas(token: string): Promise<FoglalasomAdat>
  jogiValtozatok(): Promise<JogiValtozat[]>
  jogiFeltoltes(p: JogiFeltoltes): Promise<string>
  jogiFajl(id: string): Promise<JogiFajl>
  jogiVisszaallitas(id: string): Promise<void>
  saveCsomagSzerkeszto(adat: CsomagSzerkesztoAdat): Promise<CsomagMentesEredmeny>
  getBooking(id: string): Promise<DayBooking | null>
  getCapacity(date: string): Promise<DayCapacity>
  getWorkWindows(date: string): Promise<WorkWindow[]>
  getLatestStart(date: string, minutes: number): Promise<LatestStart[]>
  getStandingCars(): Promise<StandingCar[]>

  searchCustomers(q: string, limit?: number, mezo?: KeresesMezo): Promise<SearchHit[]>
  quoteBooking(input: Partial<NewBookingInput> & CalcInput & { booking_id?: string | null }): Promise<Quote>

  setDayOrder(date: string, ids: string[]): Promise<void>

  getDayAbsences(date: string): Promise<DayAbsence[]>
  listAbsences(): Promise<AbsenceRow[]>
  setAbsence(input: AbsenceInput): Promise<string>
  deleteAbsence(id: string): Promise<void>

  listVacations(): Promise<VacationRow[]>
  getVacations(from: string, to: string): Promise<VacationRow[]>
  setVacation(input: VacationInput): Promise<string>
  deleteVacation(id: string): Promise<void>

  searchCompanies(q: string, limit?: number): Promise<CompanyHit[]>
  companyCandidates(name: string): Promise<CompanyCandidate[]>

  createBooking(input: NewBookingInput): Promise<string>
  updateBooking(bookingId: string, input: NewBookingInput): Promise<void>
  getBookingFormData(bookingId: string): Promise<BookingFormData | null>
  patchBooking(bookingId: string, patch: Record<string, unknown>): Promise<void>
  setStatus(bookingId: string, status: BookingStatus, note?: string): Promise<void>
  reopenBooking(bookingId: string): Promise<BookingStatus>
  finishPreview(bookingId: string, done: string[]): Promise<FinishPreview>
  finishBooking(bookingId: string, done: string[], opciok?: KeszOpciok): Promise<FinishPreview>
  foglalasLink(bookingId: string): Promise<string>
  modositasiKerelmek(): Promise<ModositasCsoport[]>
  modositasElintezve(bookingId: string): Promise<number>
  setContractFleet(contractId: string, value: boolean): Promise<void>
  contractIsFleet(contractId: string): Promise<boolean>
  createFleetBooking(input: NewBookingInput, count: number): Promise<string>
  fleetAddCar(groupId: string): Promise<string>
  fleetPatch(groupId: string, patch: Record<string, unknown>): Promise<void>
  fleetSetPlate(bookingId: string, plate: string): Promise<void>
  fleetStep(groupId: string, delta: 1 | -1): Promise<string | null>
  getFleetGroup(groupId: string): Promise<DayBooking[]>

  setTentative(bookingId: string, value: boolean): Promise<void>
  notFitted(bookingId: string): Promise<void>
  setFinalPrice(bookingId: string, price: number, reason?: string): Promise<void>

  updateExtra(id: string, patch: Partial<Extra>): Promise<void>
  createExtra(input: { name: string; price_huf: number | null; work_minutes: number | null }): Promise<string>
  updatePackagePrice(
    packageId: string, category: VehicleCategory, scope: BookingScope,
    patch: { price_huf?: number | null; duration_minutes?: number | null },
  ): Promise<void>
  updateFullServicePrice(
    packageId: string, category: VehicleCategory,
    patch: { price_huf?: number | null; extra_work_minutes?: number | null },
  ): Promise<void>

  listCustomers(q?: string): Promise<CustomerSummary[]>
  listVehicles(q?: string): Promise<VehicleSummary[]>
  listCompanies(q?: string): Promise<CompanySummary[]>

  listSheetCompanies(month: string): Promise<SheetCompany[]>
  getSheet(companyId: string, month: string): Promise<SheetDetail>
  sheetForBooking(bookingId: string): Promise<SheetForBooking>
  saveSheetRow(input: SheetRowInput): Promise<string>
  deleteSheetRow(id: string): Promise<void>
  berletLapok(): Promise<BerletLapListaElem[]>
  berletLap(passId: string): Promise<BerletLap>
  berletFoglalashoz(bookingId: string): Promise<BerletFoglalashoz>
  saveBerletSor(input: BerletSorInput): Promise<string>
  deleteBerletSor(id: string): Promise<void>
  closeSheet(companyId: string, month: string): Promise<void>
  reopenSheet(companyId: string, month: string): Promise<void>
  saveSheetSettings(companyId: string, s: { columns: SheetColumn[]; footer_text: string | null }): Promise<void>
  saveCustomer(patch: Record<string, unknown>): Promise<void>
  saveVehicle(patch: Record<string, unknown>): Promise<void>
  addVehicle(input: Record<string, unknown>): Promise<string>
  addCustomer(input: Record<string, unknown>): Promise<string>

  getDashboard(date: string): Promise<DashboardSummary>
  getWeekCapacity(date: string): Promise<WeekDay[]>

  getOpening(): Promise<OpeningDay[]>
  saveDayHours(day: OpeningDay): Promise<void>
  getShopSettings(): Promise<ShopSettings>
  saveShopSettings(s: ShopSettings): Promise<void>
  listDayOverrides(from: string): Promise<DayOverride[]>
  saveDayOverride(o: DayOverride): Promise<void>
  deleteDayOverride(day: string): Promise<void>

  listStaff(): Promise<StaffRow[]>
  createStaff(input: NewStaffInput): Promise<string | null>
  updateStaff(id: string, patch: {
    full_name?: string
    role?: StaffRole
    active?: boolean
    can_edit_customers?: boolean | null
    kozos?: boolean
  }): Promise<void>
  deleteInvite(email: string): Promise<void>

  listRolePermissions(): Promise<RolePermission[]>
  setRolePermission(role: StaffRole, patch: { can_edit_customers: boolean }): Promise<void>

  changeOwnPassword(mostani: string, uj: string): Promise<void>

  setStaffPassword(staffId: string, uj: string): Promise<void>

  listPasses(): Promise<PassBalanceRow[]>
  createPass(input: NewPassInput): Promise<string>
  deactivatePass(passId: string): Promise<void>
  listContracts(): Promise<ContractRow[]>
  deleteContract(id: string): Promise<void>
  saveContract(input: ContractInput): Promise<string>

  subscribe(onValtozas: () => void): () => void

  getBookingExtras(bookingId: string): Promise<BookingExtraRow[]>
  setBookingExtraQty(itemId: string, qty: number): Promise<void>

  getTasks(bookingId: string): Promise<BookingTask[]>
  toggleTask(taskId: string, done: boolean): Promise<void>
  toggleTaskGroup(bookingId: string, area: ServiceArea, done: boolean): Promise<number>
  setNotes(bookingId: string, notes: string): Promise<void>
}

export const num = (v: unknown): number =>
  v === null || v === undefined ? 0 : typeof v === 'number' ? v : Number(v)

export const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : typeof v === 'number' ? v : Number(v)

export function toOnlineKeres(r: OnlineKeres): OnlineKeres {
  return {
    ...r,
    korabbi_db: num(r.korabbi_db),
    nem_jott_db: num(r.nem_jott_db),
    lemondta_db: num(r.lemondta_db),
    utolso_nap: r.utolso_nap ? String(r.utolso_nap).slice(0, 10) : null,
    seat_material: r.seat_material ?? null,
    ceg_link_nev: r.ceg_link_nev ?? null,
  }
}

export function toExtra(r: Extra): Extra {
  const lista: unknown = r.included_in_packages
  return {
    ...r,
    included_in_packages: Array.isArray(lista) ? lista.map(String)
      : typeof lista === 'string' ? lista.replace(/[{}]/g, '').split(',').filter(Boolean)
      : [],
    included_in_full_service: Boolean(r.included_in_full_service),
  }
}

export function toQuote(r: Record<string, unknown> | null | undefined): Quote {
  const lines = Array.isArray(r?.lines) ? (r!.lines as Record<string, unknown>[]) : []
  return {
    price_huf: num(r?.price_huf),
    work_minutes: numOrNull(r?.work_minutes),
    rest_minutes: num(r?.rest_minutes),
    requires_quote: Boolean(r?.requires_quote),
    duration_known: r?.duration_known !== false,
    lines: lines.map((l) => ({
      kind: l.kind as Quote['lines'][number]['kind'],
      ref_id: (l.ref_id as string | null) ?? null,
      name: String(l.name ?? ''),
      quantity: num(l.quantity),
      unit_price_huf: num(l.unit_price_huf),
      price_huf: num(l.price_huf),
      work_minutes: num(l.work_minutes),
      sort_order: num(l.sort_order),
    })),
    company_id: (r?.company_id as string | null) ?? null,
    contract_id: (r?.contract_id as string | null) ?? null,
    contract_kind: (r?.contract_kind as Quote['contract_kind']) ?? null,
    contract_price: Boolean(r?.contract_price),
    contract_prices: Object.fromEntries(
      Object.entries((r?.contract_prices as Record<string, unknown> | null) ?? {})
        .map(([k, v]) => [k, num(v)]),
    ),
    berlet: r?.berlet && typeof r.berlet === 'object'
      ? {
          pass_item_id: String((r.berlet as Record<string, unknown>).pass_item_id),
          pass_id: String((r.berlet as Record<string, unknown>).pass_id),
          nev: String((r.berlet as Record<string, unknown>).nev ?? ''),
          maradt: num((r.berlet as Record<string, unknown>).maradt),
        }
      : null,
    berlet_csomagok: Array.isArray(r?.berlet_csomagok) ? (r!.berlet_csomagok as unknown[]).map(String) : [],
  }
}

export function idoRovidit<T extends { starts: string | null; ends: string | null }>(r: T): T {
  return {
    ...r,
    starts: r.starts ? r.starts.slice(0, 5) : null,
    ends: r.ends ? r.ends.slice(0, 5) : null,
  }
}

export function publikusNapbol(n: { foglalasok?: DayBooking[]; savok?: DayLane[] } | null): PublikusNapAdat {
  return {
    foglalasok: n?.foglalasok ?? [],
    savok: (n?.savok ?? []).map((x) => ({ ...x, lanes: Number(x.lanes) })),
  }
}
