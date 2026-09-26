import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type {
  BookingStatus, BookingTask, CalcInput, CalcResult, DayBooking, DayCapacity,
  BookingFormData, LatestStart, NewBookingInput, PlateLookup, SearchHit, ServiceArea,
  StandingCar, WorkWindow,
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

  constructor(url: string, anonKey: string) {
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
