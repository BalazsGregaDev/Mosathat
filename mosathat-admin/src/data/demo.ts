import { PGlite } from '@electric-sql/pglite'

// A migrációk MINDEGYIKE, automatikusan.
//
// Korábban egyesével voltak felsorolva, és amikor új migráció született, a
// demó mód csendben a régi sémán futott tovább — a hiba pedig csak jóval
// később derült ki. Az import.meta.glob a mappa teljes tartalmát behúzza,
// így nincs mit elfelejteni.
//
// A kulcs a fájl útvonala, ezért a névsorrend = az időbélyeg sorrendje =
// a futtatási sorrend. Pontosan az, amit a Supabase CLI is csinál.
const MIGRACIOK = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// A próbaadat NEM migráció, és nincs a migrations mappában: különben a
// GitHub-integráció felvinné az éles adatbázisba is. Csak ide töltjük be.
import demoAdatok from '../../../supabase/demo/demo_adatok.sql?raw'

import type {
  BookingStatus, BookingTask, CalcInput, CalcResult, DayBooking, DayCapacity,
  BookingFormData, LatestStart, NewBookingInput, PlateLookup, SearchHit, ServiceArea,
  StandingCar, WorkWindow,
} from '../lib/types'
import type { Catalog, DataSource, SessionUser } from './source'
import { calcArgs, num, numOrNull, toCalcResult } from './source'

// ---------------------------------------------------------------------------
//  Demó mód — valódi PostgreSQL a böngészőben
//
//  A PGlite egy WASM-ra fordított PostgreSQL. Ugyanazok a migrációk futnak le
//  benne, mint majd a Supabase-en: ugyanaz a calc_service(), ugyanazok a
//  nézetek, ugyanaz a create_booking(). Nem utánzat, hanem ugyanaz a
//  motor — így nem fordulhat elő, hogy a demó mást mutat, mint az éles.
//
//  Amit pótolni kell: a Supabase `auth` sémáját. Ott ez adott, itt három
//  sornyi csonk. A jogosultságellenőrzés (RLS) emiatt demóban nem szűr —
//  egy felhasználó van, és az mindent lát.
//
//  Az adat a memóriában él: lap újratöltésekor minden visszaáll a kiinduló
//  állapotra. Bemutatáshoz ez előny, nem hátrány.
// ---------------------------------------------------------------------------

const DEMO_STAFF_ID = '00000000-0000-4000-8000-000000000001'

const AUTH_STUB = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select current_setting('app.uid', true)::uuid $$;
create or replace function auth.role() returns text
  language sql stable as $$ select 'authenticated'::text $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
`

export class DemoSource implements DataSource {
  readonly label = 'Demó adatbázis'
  readonly isDemo = true
  private db: PGlite | null = null
  private user: SessionUser | null = null

  private get pg(): PGlite {
    if (!this.db) throw new Error('Az adatbázis még nem indult el.')
    return this.db
  }

  async init(): Promise<void> {
    if (this.db) return
    const db = await PGlite.create()
    await db.exec(AUTH_STUB)

    const sorrendben = Object.keys(MIGRACIOK).sort()
    for (const utvonal of sorrendben) await db.exec(MIGRACIOK[utvonal])
    await db.exec(demoAdatok)

    // Egy dolgozó, hogy a created_by és a done_by ne legyen üres.
    await db.query(
      `insert into auth.users (id, email) values ($1, 'demo@mosathat.hu') on conflict do nothing`,
      [DEMO_STAFF_ID],
    )
    await db.query(
      `insert into public.staff (id, full_name, role) values ($1, 'Demó felhasználó', 'SUPERADMIN')
       on conflict (id) do nothing`,
      [DEMO_STAFF_ID],
    )
    await db.exec(`select set_config('app.uid', '${DEMO_STAFF_ID}', false)`)
    this.db = db
  }

  // -------------------------------------------------------------------------
  //  Dátumok: ugyanaz az alak, mint a Supabase-nél
  //
  //  A PGlite alapból JavaScript Date objektumot ad vissza a date és timestamp
  //  oszlopokra, a Supabase viszont szöveget (JSON-on keresztül jön). Ha ezt
  //  nem egyenlítjük ki, a felület demóban máshogy viselkedik, mint élesben —
  //  és pont ez az a hiba, ami csak élesben derül ki.
  //
  //  Ezért a típusértelmezőt átállítjuk:
  //    date         → "2026-09-26"            (ahogy a Supabase adja)
  //    timestamptz  → "2026-09-26T06:00:00Z"  (ISO, ahogy a Supabase adja)
  //
  //  Az adapter dolga, hogy a különbség ne szivárogjon fel a React kódba.
  // -------------------------------------------------------------------------
  private static readonly PARSERS = {
    1082: (v: string) => v, // date — a Postgres szöveges alakja már YYYY-MM-DD
    1114: (v: string) => new Date(v + 'Z').toISOString(), // timestamp
    1184: (v: string) => new Date(v).toISOString(), // timestamptz
  }

  private async rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.pg.query<T>(sql, params, { parsers: DemoSource.PARSERS })
    return r.rows
  }

  // --- belépés --------------------------------------------------------------
  // Demóban nincs jelszó. A képernyő azért van meg, mert élesben lesz.

  async signIn(): Promise<SessionUser> {
    this.user = { id: DEMO_STAFF_ID, name: 'Demó felhasználó', role: 'SUPERADMIN', email: 'demo@mosathat.hu' }
    return this.user
  }

  async signOut(): Promise<void> {
    this.user = null
  }

  async currentUser(): Promise<SessionUser | null> {
    return this.user
  }

  // --- katalógus ------------------------------------------------------------

  async getCatalog(): Promise<Catalog> {
    const [packages, pp, fs, extras, surcharges] = await Promise.all([
      this.rows<any>(`select * from packages where active order by sort_order`),
      this.rows<any>(`select * from package_pricing`),
      this.rows<any>(`select * from full_service_pricing`),
      this.rows<any>(`select * from extras where active order by sort_order`),
      this.rows<any>(`select * from surcharges where active order by sort_order`),
    ])
    return {
      packages,
      packagePricing: pp,
      fullServicePricing: fs,
      extras,
      surcharges: surcharges.map((s) => ({
        ...s,
        default_value: num(s.default_value),
        max_value: numOrNull(s.max_value),
      })),
    }
  }

  // --- nap ------------------------------------------------------------------

  async getDay(date: string): Promise<DayBooking[]> {
    return this.rows<DayBooking>(
      `select * from v_day_bookings
        where service_date = $1::date
        order by coalesce(start_at, drop_off_at) nulls last, plate_raw`,
      [date],
    )
  }

  async getBooking(id: string): Promise<DayBooking | null> {
    const [r] = await this.rows<DayBooking>(`select * from v_day_bookings where id = $1::uuid`, [id])
    return r ?? null
  }

  async getCapacity(date: string): Promise<DayCapacity> {
    const [r] = await this.rows<any>(`select * from day_capacity($1::date)`, [date])
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
    return this.rows<WorkWindow>(`select * from work_windows($1::date)`, [date])
  }

  async getLatestStart(date: string, minutes: number): Promise<LatestStart[]> {
    return this.rows<LatestStart>(`select * from latest_start($1::date, $2::integer)`, [date, minutes])
  }

  async getStandingCars(): Promise<StandingCar[]> {
    const r = await this.rows<any>(`select * from v_standing_cars order by deadline_at nulls last`)
    return r.map((x) => ({ ...x, days_in: num(x.days_in), days_left: num(x.days_left) }))
  }

  // --- foglalás -------------------------------------------------------------

  async lookupPlate(plate: string): Promise<PlateLookup | null> {
    const [r] = await this.rows<{ r: PlateLookup | null }>(`select lookup_plate($1) as r`, [plate])
    return r?.r ?? null
  }

  async searchCustomers(q: string, limit = 5): Promise<SearchHit[]> {
    return this.rows<SearchHit>(`select * from search_customers($1, $2::integer)`, [q, limit])
  }

  async calcService(input: CalcInput): Promise<CalcResult> {
    const a = calcArgs(input)
    const [row] = await this.rows<any>(
      `select * from calc_service($1::uuid, $2::vehicle_category, $3::booking_scope,
                                  $4::boolean, $5::jsonb, $6::numeric, $7::integer)`,
      [a.p_package_id, a.p_category, a.p_scope, a.p_full_service,
       JSON.stringify(a.p_extras), a.p_surcharge_pct, a.p_surcharge_fix],
    )
    return toCalcResult(row)
  }

  async createBooking(input: NewBookingInput): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select create_booking($1::jsonb) as id`, [
      JSON.stringify(input),
    ])
    return r.id
  }

  async updateBooking(bookingId: string, input: NewBookingInput): Promise<void> {
    await this.pg.query(`select update_booking($1::uuid, $2::jsonb)`, [
      bookingId, JSON.stringify(input),
    ])
  }

  async getBookingFormData(bookingId: string): Promise<BookingFormData | null> {
    const [r] = await this.rows<{ d: BookingFormData | null }>(
      `select booking_form_data($1::uuid) as d`, [bookingId])
    return r?.d ?? null
  }

  async setStatus(bookingId: string, status: BookingStatus, note?: string): Promise<void> {
    await this.pg.query(`select set_booking_status($1::uuid, $2::booking_status, $3)`, [
      bookingId, status, note ?? null,
    ])
  }

  async setFinalPrice(bookingId: string, price: number, reason?: string): Promise<void> {
    await this.pg.query(`select set_final_price($1::uuid, $2::integer, $3)`, [
      bookingId, price, reason ?? null,
    ])
  }

  async getTasks(bookingId: string): Promise<BookingTask[]> {
    return this.rows<BookingTask>(
      `select * from booking_tasks where booking_id = $1::uuid order by sort_order, name`,
      [bookingId],
    )
  }

  async toggleTask(taskId: string, done: boolean): Promise<void> {
    await this.pg.query(`select toggle_task($1::uuid, $2::boolean)`, [taskId, done])
  }

  async toggleTaskGroup(bookingId: string, area: ServiceArea, done: boolean): Promise<number> {
    const [r] = await this.rows<{ n: number }>(
      `select toggle_task_group($1::uuid, $2::service_area, $3::boolean) as n`,
      [bookingId, area, done],
    )
    return num(r?.n)
  }

  async setNotes(bookingId: string, notes: string): Promise<void> {
    await this.pg.query(`select set_booking_notes($1::uuid, $2)`, [bookingId, notes])
  }
}
