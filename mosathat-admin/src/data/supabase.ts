import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type {
  BookingStatus, BookingTask, CalcInput, CalcResult, DashboardSummary, DayBooking, DayCapacity,
  DayOverride, BookingExtraRow, BookingFormData, BookingScope, CustomerSummary, VehicleSummary,
  ContractInput, ContractRow, Extra, LatestStart,
  NewBookingInput, NewPassInput, NewStaffInput, OpeningDay, PassBalanceRow, PlateLookup, SearchHit, ServiceArea,
  ShopSettings, StaffRole, StaffRow, StandingCar, VehicleCategory, WeekDay, WorkWindow,
} from '../lib/types'
import type { Catalog, DataSource, SessionUser } from './source'
import { calcArgs, num, numOrNull, toCalcResult } from './source'

// ---------------------------------------------------------------------------
//  Éles mód — Supabase
//
//  Ugyanazok a hívások, mint demóban, csak a hálózaton át. A táblákat és
//  nézeteket a PostgREST szolgálja ki, a függvényeket az .rpc().
//
//  Amit itt kapunk meg ráadásként: az RLS. A böngészőben futó kulcs
//  (anon key) önmagában semmit nem lát — a szabályok a bejelentkezett
//  felhasználóhoz kötik a hozzáférést. Ezért nem baj, hogy a kulcs benne
//  van a kiszállított JavaScriptben.
// ---------------------------------------------------------------------------

function fail(op: string, error: { message: string } | null): never {
  throw new Error(`${op}: ${error?.message ?? 'ismeretlen hiba'}`)
}

export class SupabaseSource implements DataSource {
  readonly label = 'Supabase'
  readonly isDemo = false
  private sb: SupabaseClient
  // Új felhasználó felvételéhez kell egy második, eldobható kliens — lásd
  // a createStaff() magyarázatát.
  private readonly url: string
  private readonly anonKey: string

  constructor(url: string, anonKey: string) {
    this.url = url
    this.anonKey = anonKey
    this.sb = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }

  async init(): Promise<void> {
    /* a kliens azonnal használható */
  }

  // --- belépés --------------------------------------------------------------

  async signIn(email: string, password: string): Promise<SessionUser> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password })
    if (error) fail('Belépés', error)
    const u = await this.loadStaff(data.user!.id, data.user!.email ?? null)
    if (!u) throw new Error('Ez a fiók nincs felvéve dolgozóként.')
    return u
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut()
  }

  async currentUser(): Promise<SessionUser | null> {
    const { data } = await this.sb.auth.getUser()
    if (!data.user) return null
    return this.loadStaff(data.user.id, data.user.email ?? null)
  }

  private async loadStaff(id: string, email: string | null): Promise<SessionUser | null> {
    const { data } = await this.sb
      .from('staff')
      .select('id, full_name, role, active')
      .eq('id', id)
      .maybeSingle()
    if (!data || !data.active) return null
    return { id: data.id, name: data.full_name, role: data.role, email }
  }

  // --- katalógus ------------------------------------------------------------

  async getCatalog(): Promise<Catalog> {
    const [pk, pp, fs, ex, su] = await Promise.all([
      this.sb.from('packages').select('*').eq('active', true).order('sort_order'),
      this.sb.from('package_pricing').select('*'),
      this.sb.from('full_service_pricing').select('*'),
      this.sb.from('extras').select('*').eq('active', true).order('sort_order'),
      this.sb.from('surcharges').select('*').eq('active', true).order('sort_order'),
    ])
    for (const [name, r] of [
      ['Csomagok', pk], ['Árak', pp], ['Full Service árak', fs],
      ['Extrák', ex], ['Felárak', su],
    ] as const) {
      if (r.error) fail(name, r.error)
    }
    return {
      packages: pk.data ?? [],
      packagePricing: pp.data ?? [],
      fullServicePricing: fs.data ?? [],
      extras: ex.data ?? [],
      surcharges: (su.data ?? []).map((s) => ({
        ...s,
        default_value: num(s.default_value),
        max_value: numOrNull(s.max_value),
      })),
    }
  }

  // --- nap ------------------------------------------------------------------

  async getDay(date: string): Promise<DayBooking[]> {
    const { data, error } = await this.sb
      .from('v_day_bookings')
      .select('*')
      .eq('service_date', date)
      .order('start_at', { nullsFirst: false })
      .order('drop_off_at', { nullsFirst: false })
    if (error) fail('Napi foglalások', error)
    return (data ?? []) as DayBooking[]
  }

  async getBooking(id: string): Promise<DayBooking | null> {
    const { data, error } = await this.sb.from('v_day_bookings').select('*').eq('id', id).maybeSingle()
    if (error) fail('Foglalás', error)
    return (data as DayBooking | null) ?? null
  }

  async getCapacity(date: string): Promise<DayCapacity> {
    const { data, error } = await this.sb.rpc('day_capacity', { p_day: date })
    if (error) fail('Kapacitás', error)
    const r = (data as any[])?.[0]
    return {
      parallel_slots: num(r?.parallel_slots),
      open_minutes: num(r?.open_minutes),
      capacity_minutes: num(r?.capacity_minutes),
      booked_minutes: num(r?.booked_minutes),
      free_minutes: num(r?.free_minutes),
      load_pct: num(r?.load_pct),
    }
  }

  async getWorkWindows(date: string): Promise<WorkWindow[]> {
    const { data, error } = await this.sb.rpc('work_windows', { p_day: date })
    if (error) fail('Munkaidő sávok', error)
    return (data ?? []) as WorkWindow[]
  }

  async getLatestStart(date: string, minutes: number): Promise<LatestStart[]> {
    const { data, error } = await this.sb.rpc('latest_start', { p_day: date, p_minutes: minutes })
    if (error) fail('Legkésőbbi kezdés', error)
    return (data ?? []) as LatestStart[]
  }

  async getStandingCars(): Promise<StandingCar[]> {
    const { data, error } = await this.sb
      .from('v_standing_cars')
      .select('*')
      .order('deadline_at', { nullsFirst: false })
    if (error) fail('Nálunk álló autók', error)
    return (data ?? []).map((x: any) => ({
      ...x, days_in: num(x.days_in), days_left: num(x.days_left),
    })) as StandingCar[]
  }

  // --- foglalás -------------------------------------------------------------

  async lookupPlate(plate: string): Promise<PlateLookup | null> {
    const { data, error } = await this.sb.rpc('lookup_plate', { p_plate: plate })
    if (error) fail('Rendszám keresés', error)
    return (data as PlateLookup | null) ?? null
  }

  async searchCustomers(q: string, limit = 5): Promise<SearchHit[]> {
    const { data, error } = await this.sb.rpc('search_customers', { p_q: q, p_limit: limit })
    if (error) fail('Keresés', error)
    return (data ?? []) as SearchHit[]
  }

  async calcService(input: CalcInput): Promise<CalcResult> {
    const { data, error } = await this.sb.rpc('calc_service', calcArgs(input))
    if (error) fail('Árszámítás', error)
    return toCalcResult((data as any[])?.[0])
  }

  async createBooking(input: NewBookingInput): Promise<string> {
    const { data, error } = await this.sb.rpc('create_booking', { p: input })
    if (error) fail('Foglalás mentése', error)
    return data as string
  }

  async updateBooking(bookingId: string, input: NewBookingInput): Promise<void> {
    const { error } = await this.sb.rpc('update_booking', { p_booking_id: bookingId, p: input })
    if (error) fail('Foglalás módosítása', error)
  }

  async getBookingFormData(bookingId: string): Promise<BookingFormData | null> {
    const { data, error } = await this.sb.rpc('booking_form_data', { p_booking_id: bookingId })
    if (error) fail('Foglalás betöltése', error)
    return (data as BookingFormData | null) ?? null
  }

  async setStatus(bookingId: string, status: BookingStatus, note?: string): Promise<void> {
    const { error } = await this.sb.rpc('set_booking_status', {
      p_booking_id: bookingId, p_status: status, p_note: note ?? null,
    })
    if (error) fail('Állapotváltás', error)
  }

  async setFinalPrice(bookingId: string, price: number, reason?: string): Promise<void> {
    const { error } = await this.sb.rpc('set_final_price', {
      p_booking_id: bookingId, p_price: price, p_reason: reason ?? null,
    })
    if (error) fail('Végleges ár', error)
  }


  // --- szolgáltatások szerkesztése -------------------------------------------

  async updateExtra(id: string, patch: Partial<Extra>): Promise<void> {
    const { error } = await this.sb.from('extras').update(patch).eq('id', id)
    if (error) fail('Szolgáltatás mentése', error)
  }

  async updatePackagePrice(
    packageId: string, category: VehicleCategory, scope: BookingScope,
    patch: { price_huf?: number | null; duration_minutes?: number | null },
  ): Promise<void> {
    const { error } = await this.sb
      .from('package_pricing')
      .upsert({ package_id: packageId, category, scope, ...patch },
              { onConflict: 'package_id,category,scope' })
    if (error) fail('Ár mentése', error)
  }

  async updateFullServicePrice(
    packageId: string, category: VehicleCategory,
    patch: { price_huf?: number | null; extra_work_minutes?: number | null },
  ): Promise<void> {
    const { error } = await this.sb
      .from('full_service_pricing')
      .upsert({ package_id: packageId, category, ...patch }, { onConflict: 'package_id,category' })
    if (error) fail('Full Service ár mentése', error)
  }

  async updatePackage(id: string, patch: { name?: string; description?: string | null }): Promise<void> {
    const { error } = await this.sb.from('packages').update(patch).eq('id', id)
    if (error) fail('Csomag mentése', error)
  }

  // --- ügyfelek és járművek ---------------------------------------------------

  async listCustomers(q = ''): Promise<CustomerSummary[]> {
    const { data, error } = await this.sb.rpc('list_customers', { p_q: q, p_limit: 200 })
    if (error) fail('Ügyfelek', error)
    return (data ?? []) as CustomerSummary[]
  }

  async listVehicles(q = ''): Promise<VehicleSummary[]> {
    const { data, error } = await this.sb.rpc('list_vehicles', { p_q: q, p_limit: 200 })
    if (error) fail('Járművek', error)
    return (data ?? []) as VehicleSummary[]
  }

  // --- áttekintés -------------------------------------------------------------

  async getDashboard(date: string): Promise<DashboardSummary> {
    const { data, error } = await this.sb.rpc('dashboard_summary', { p_day: date })
    if (error) fail('Áttekintés', error)
    return data as DashboardSummary
  }

  async getWeekCapacity(date: string): Promise<WeekDay[]> {
    const { data, error } = await this.sb.rpc('week_capacity', { p_from: date })
    if (error) fail('Heti kapacitás', error)
    return ((data ?? []) as Record<string, unknown>[])
      .map((x) => ({
        nap: String(x.nap),
        hetfotol: num(x.hetfotol),
        parallel_slots: num(x.parallel_slots),
        capacity_minutes: num(x.capacity_minutes),
        booked_minutes: num(x.booked_minutes),
        free_minutes: num(x.free_minutes),
        load_pct: numOrNull(x.load_pct),
      }))
      .sort((a, b) => a.hetfotol - b.hetfotol)
  }

  // --- beállítások ------------------------------------------------------------

  async getOpening(): Promise<OpeningDay[]> {
    const { data, error } = await this.sb.from('v_opening').select('*').order('weekday')
    if (error) fail('Nyitvatartás', error)
    return (data ?? []) as OpeningDay[]
  }

  async saveDayHours(day: OpeningDay): Promise<void> {
    const { error } = await this.sb.rpc('save_day_hours', { p: day })
    if (error) fail('Nyitvatartás mentése', error)
  }

  async getShopSettings(): Promise<ShopSettings> {
    const { data, error } = await this.sb.from('shop_settings').select('*').single()
    if (error) fail('Beállítások', error)
    return data as ShopSettings
  }

  async saveShopSettings(s: ShopSettings): Promise<void> {
    const { error } = await this.sb.rpc('save_shop_settings', { p: s })
    if (error) fail('Beállítások mentése', error)
  }

  async listDayOverrides(from: string): Promise<DayOverride[]> {
    const { data, error } = await this.sb.from('day_overrides').select('*')
      .gte('day', from).order('day')
    if (error) fail('Kivételnapok', error)
    return (data ?? []) as DayOverride[]
  }

  async saveDayOverride(o: DayOverride): Promise<void> {
    const { error } = await this.sb.rpc('save_day_override', { p: o })
    if (error) fail('Kivételnap mentése', error)
  }

  async deleteDayOverride(day: string): Promise<void> {
    const { error } = await this.sb.rpc('delete_day_override', { p_day: day })
    if (error) fail('Kivételnap törlése', error)
  }

  // --- felhasználók -----------------------------------------------------------

  async listStaff(): Promise<StaffRow[]> {
    const { data, error } = await this.sb.rpc('list_staff')
    if (error) fail('Felhasználók', error)
    return (data ?? []) as StaffRow[]
  }

  /**
   * Új felhasználó két lépésben.
   *
   * Supabase-en belépőt létrehozni csak a service role kulccsal lehet, azt
   * pedig soha nem szabad a böngészőbe tenni — aki megnyitja a fejlesztői
   * eszközöket, mindenhez hozzáférne. Marad a rendes regisztráció.
   *
   * Csakhogy a signUp() bejelentkeztetné az ÚJ felhasználót, és a tulaj
   * kiesne a saját munkamenetéből. Ezért a regisztráció egy külön, eldobható
   * klienssel megy, ami nem ment el semmit (persistSession: false). A bent
   * ülő felhasználó munkamenetéhez ez hozzá sem ér.
   *
   * A szerepkör közben NEM utazik a böngészőn át: azt az előbb felvett
   * meghívó sor hordozza az adatbázisban.
   */
  async createStaff(input: NewStaffInput): Promise<void> {
    const email = input.email.trim().toLowerCase()

    const { error: meghivoHiba } = await this.sb.rpc('invite_staff', {
      p: { email, full_name: input.full_name, role: input.role },
    })
    if (meghivoHiba) fail('Meghívó', meghivoHiba)

    const eldobhato = createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { error } = await eldobhato.auth.signUp({ email, password: input.password })

    if (error) {
      // A meghívó maradjon meg: így a képernyőn látszik, hogy elkezdődött a
      // felvétel, és nem tűnik el nyomtalanul egy félresikerült regisztráció.
      fail('Fiók létrehozása', error)
    }
  }

  async updateStaff(
    id: string,
    patch: { full_name?: string; role?: StaffRole; active?: boolean },
  ): Promise<void> {
    const { error } = await this.sb.rpc('set_staff', { p: { id, ...patch } })
    if (error) fail('Felhasználó módosítása', error)
  }

  async deleteInvite(email: string): Promise<void> {
    const { error } = await this.sb.rpc('delete_invite', { p_email: email })
    if (error) fail('Meghívó törlése', error)
  }

  // --- bérletek és szerződések -----------------------------------------------

  async listPasses(): Promise<PassBalanceRow[]> {
    const { data, error } = await this.sb.from('v_pass_balance').select('*')
      .order('customer_name').order('pass_name')
    if (error) fail('Bérletek', error)
    return (data ?? []) as PassBalanceRow[]
  }

  async createPass(input: NewPassInput): Promise<string> {
    const { data, error } = await this.sb.rpc('create_pass', { p: input })
    if (error) fail('Bérlet létrehozása', error)
    return data as string
  }

  async deactivatePass(passId: string): Promise<void> {
    const { error } = await this.sb.rpc('deactivate_pass', { p_pass_id: passId })
    if (error) fail('Bérlet kivezetése', error)
  }

  async listContracts(): Promise<ContractRow[]> {
    const { data, error } = await this.sb.from('v_contracts').select('*').order('company_name')
    if (error) fail('Szerződések', error)
    return (data ?? []) as ContractRow[]
  }

  async saveContract(input: ContractInput): Promise<string> {
    const { data, error } = await this.sb.rpc('save_contract', { p: input })
    if (error) fail('Szerződés mentése', error)
    return data as string
  }

  async getBookingExtras(bookingId: string): Promise<BookingExtraRow[]> {
    const { data, error } = await this.sb
      .from('v_booking_extras').select('*').eq('booking_id', bookingId).order('name')
    if (error) fail('Tételek', error)
    return (data ?? []).map((x: any) => ({ ...x, quantity: num(x.quantity) })) as BookingExtraRow[]
  }

  async setBookingExtraQty(itemId: string, qty: number): Promise<void> {
    const { error } = await this.sb.rpc('set_booking_extra_qty', { p_item_id: itemId, p_qty: qty })
    if (error) fail('Mennyiség mentése', error)
  }

  subscribe(onValtozas: () => void): () => void {
    // Két táblát figyelünk: a foglalásokat és a munkalistát. Ez a kettő
    // változik menet közben — az egyik a pultnál, a másik a mosóállásban.
    //
    // A változás tartalmát szándékosan nem használjuk fel: csak jelezzük,
    // hogy újra kell tölteni. Így nem kell a kliensben újraépíteni azt,
    // amit az adatbázis nézetei már összeraknak.
    const csatorna = this.sb
      .channel('mosathat-elo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, onValtozas)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_tasks' }, onValtozas)
      .subscribe()

    return () => {
      void this.sb.removeChannel(csatorna)
    }
  }

  async getTasks(bookingId: string): Promise<BookingTask[]> {
    const { data, error } = await this.sb
      .from('booking_tasks')
      .select('*')
      .eq('booking_id', bookingId)
      .order('sort_order')
    if (error) fail('Munkalista', error)
    return (data ?? []) as BookingTask[]
  }

  async toggleTask(taskId: string, done: boolean): Promise<void> {
    const { error } = await this.sb.rpc('toggle_task', { p_task_id: taskId, p_done: done })
    if (error) fail('Munkalista pipálás', error)
  }

  async toggleTaskGroup(bookingId: string, area: ServiceArea, done: boolean): Promise<number> {
    const { data, error } = await this.sb.rpc('toggle_task_group', {
      p_booking_id: bookingId, p_area: area, p_done: done,
    })
    if (error) fail('Csoportos pipálás', error)
    return num(data)
  }

  async setNotes(bookingId: string, notes: string): Promise<void> {
    const { error } = await this.sb.rpc('set_booking_notes', {
      p_booking_id: bookingId, p_notes: notes,
    })
    if (error) fail('Megjegyzés mentése', error)
  }
}
