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
  BookingStatus, BookingTask, CalcInput, CalcResult, DashboardSummary, DayBooking, DayCapacity,
  DayOverride, BookingExtraRow, BookingFormData, BookingScope, CustomerSummary, VehicleSummary,
  ContractInput, ContractRow, Extra, LatestStart,
  NewBookingInput, NewPassInput, NewStaffInput, OpeningDay, PassBalanceRow, PlateLookup, SearchHit, ServiceArea,
  ShopSettings, StaffRole, StaffRow, StandingCar, VehicleCategory, WeekDay, WorkWindow,
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
//  Amit pótolni kell: a Supabase `auth` sémáját. Ott ez adott, itt néhány
//  sornyi csonk.
//
//  A jogosultság demóban másképp működik, és ezt érdemes tudni: a PGlite a
//  táblák tulajdonosaként fut, a Postgres pedig a tulajdonosra alapból nem
//  alkalmazza az RLS-t. Vagyis a SZABÁLYOK itt nem szűrnek. Ami viszont
//  működik, az a triggeres és a függvényekbe írt ellenőrzés — ezért látszik
//  demóban is pontosan, mit tud egy alkalmazott és mit nem.
//
//  Három belépő van, hogy ez ki is próbálható legyen. Élesben ez nem így
//  lesz: ott a Supabase Auth ad belépőt, és az RLS is él.
//
//  Az adat a memóriában él: lap újratöltésekor minden visszaáll a kiinduló
//  állapotra. Bemutatáshoz ez előny, nem hátrány.
// ---------------------------------------------------------------------------

const DEMO_STAFF_ID = '00000000-0000-4000-8000-000000000001'

/** A demó három belépője. Az e-mail dönti el, ki lép be. */
export const DEMO_BELEPOK = [
  { id: DEMO_STAFF_ID,
    email: 'demo@mosathat.hu',        name: 'Fejlesztő',   role: 'SUPERADMIN' as const },
  { id: '00000000-0000-4000-8000-000000000002',
    email: 'tulaj@mosathat.hu',       name: 'Tulaj Tamás', role: 'TULAJDONOS' as const },
  { id: '00000000-0000-4000-8000-000000000003',
    email: 'alkalmazott@mosathat.hu', name: 'Kis János',   role: 'STAFF' as const },
]

const AUTH_STUB = `
create schema if not exists auth;
-- Az oszloptípusok SZÁNDÉKOSAN ugyanazok, mint élesben a Supabase-nél.
-- Az email ott character varying(255), nem text — és pont ez a különbség
-- buktatott meg egy függvényt, ami demóban hibátlanul futott. Ha a csonk
-- pontos, az ilyen eltérés itt derül ki, nem a működő rendszerben.
create table if not exists auth.users (
  id              uuid primary key,
  email           character varying(255),
  last_sign_in_at timestamptz);
create or replace function auth.uid() returns uuid
  language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
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

    // A három belépő. Nem csak azért, hogy a created_by ne legyen üres:
    // így ki lehet próbálni, mit lát egy alkalmazott és mit a tulaj.
    for (const b of DEMO_BELEPOK) {
      await db.query(
        `insert into auth.users (id, email, last_sign_in_at)
         values ($1, $2, now()) on conflict do nothing`, [b.id, b.email])
      await db.query(
        `insert into public.staff (id, full_name, role)
         values ($1, $2, $3::staff_role) on conflict (id) do nothing`,
        [b.id, b.name, b.role])
    }
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

  async signIn(email: string): Promise<SessionUser> {
    const b = DEMO_BELEPOK.find((x) => x.email === email.trim().toLowerCase())
      ?? DEMO_BELEPOK[0]

    // Ettől kezdve az adatbázis is őt látja bejelentkezettnek: a jogosultsági
    // ellenőrzések ugyanúgy futnak, mint élesben.
    await this.pg.exec(`select set_config('app.uid', '${b.id}', false)`)
    const u: SessionUser = { id: b.id, name: b.name, role: b.role, email: b.email }
    this.user = u
    return u
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

  async getRange(from: string, to: string): Promise<DayBooking[]> {
    return this.rows<DayBooking>(
      `select * from v_day_bookings
        where service_date between $1::date and $2::date
        order by service_date, coalesce(start_at, drop_off_at) nulls last, plate_raw`,
      [from, to],
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


  // --- szolgáltatások szerkesztése -------------------------------------------

  async updateExtra(id: string, patch: Partial<Extra>): Promise<void> {
    await this.pg.query(
      `update extras set name = coalesce($2, name),
                         description = $3,
                         price_huf = $4,
                         work_minutes = $5,
                         rest_minutes = coalesce($6, rest_minutes),
                         active = coalesce($7, active),
                         updated_at = now()
        where id = $1::uuid`,
      [id, patch.name ?? null, patch.description ?? null, patch.price_huf ?? null,
       patch.work_minutes ?? null, patch.rest_minutes ?? null, patch.active ?? null],
    )
  }

  async updatePackagePrice(
    packageId: string, category: VehicleCategory, scope: BookingScope,
    patch: { price_huf?: number | null; duration_minutes?: number | null },
  ): Promise<void> {
    await this.pg.query(
      `insert into package_pricing (package_id, category, scope, price_huf, duration_minutes)
       values ($1::uuid, $2::vehicle_category, $3::booking_scope, $4, $5)
       on conflict (package_id, category, scope) do update
         set price_huf = excluded.price_huf, duration_minutes = excluded.duration_minutes`,
      [packageId, category, scope, patch.price_huf ?? null, patch.duration_minutes ?? null],
    )
  }

  async updateFullServicePrice(
    packageId: string, category: VehicleCategory,
    patch: { price_huf?: number | null; extra_work_minutes?: number | null },
  ): Promise<void> {
    await this.pg.query(
      `insert into full_service_pricing (package_id, category, price_huf, extra_work_minutes)
       values ($1::uuid, $2::vehicle_category, $3, coalesce($4, 45))
       on conflict (package_id, category) do update
         set price_huf = excluded.price_huf, extra_work_minutes = excluded.extra_work_minutes`,
      [packageId, category, patch.price_huf ?? null, patch.extra_work_minutes ?? null],
    )
  }

  async updatePackage(id: string, patch: { name?: string; description?: string | null }): Promise<void> {
    await this.pg.query(
      `update packages set name = coalesce($2, name), description = $3, updated_at = now()
        where id = $1::uuid`,
      [id, patch.name ?? null, patch.description ?? null],
    )
  }

  // --- ügyfelek és járművek ---------------------------------------------------

  async patchBooking(bookingId: string, patch: Record<string, unknown>): Promise<void> {
    await this.rows(`select patch_booking($1::uuid, $2::jsonb)`,
      [bookingId, JSON.stringify(patch)])
  }

  async saveCustomer(patch: Record<string, unknown>): Promise<void> {
    await this.rows(`select save_customer($1::jsonb)`, [JSON.stringify(patch)])
  }

  async saveVehicle(patch: Record<string, unknown>): Promise<void> {
    await this.rows(`select save_vehicle($1::jsonb)`, [JSON.stringify(patch)])
  }

  async listCustomers(q = ''): Promise<CustomerSummary[]> {
    return this.rows<CustomerSummary>(`select * from list_customers($1, 200)`, [q])
  }

  async listVehicles(q = ''): Promise<VehicleSummary[]> {
    return this.rows<VehicleSummary>(`select * from list_vehicles($1, 200)`, [q])
  }

  // --- áttekintés -------------------------------------------------------------

  async getDashboard(date: string): Promise<DashboardSummary> {
    const [r] = await this.rows<{ d: DashboardSummary }>(
      `select dashboard_summary($1::date) as d`, [date])
    return r.d
  }

  async getWeekCapacity(date: string): Promise<WeekDay[]> {
    const r = await this.rows<Record<string, unknown>>(
      `select * from week_capacity($1::date) order by hetfotol`, [date])
    return r.map((x) => ({
      nap: String(x.nap),
      hetfotol: num(x.hetfotol),
      parallel_slots: num(x.parallel_slots),
      capacity_minutes: num(x.capacity_minutes),
      booked_minutes: num(x.booked_minutes),
      free_minutes: num(x.free_minutes),
      load_pct: numOrNull(x.load_pct),
    }))
  }

  // --- beállítások ------------------------------------------------------------

  async getOpening(): Promise<OpeningDay[]> {
    return this.rows<OpeningDay>(`select * from v_opening order by weekday`)
  }

  async saveDayHours(day: OpeningDay): Promise<void> {
    await this.rows(`select save_day_hours($1::jsonb)`, [JSON.stringify(day)])
  }

  async getShopSettings(): Promise<ShopSettings> {
    const [r] = await this.rows<Record<string, unknown>>(`select * from shop_settings`)
    return {
      drop_off_from: String(r.drop_off_from),
      default_parallel_slots: num(r.default_parallel_slots),
      default_travel_minutes: num(r.default_travel_minutes),
      pass_validity_kind: r.pass_validity_kind as ShopSettings['pass_validity_kind'],
      pass_validity_value: String(r.pass_validity_value),
    }
  }

  async saveShopSettings(s: ShopSettings): Promise<void> {
    await this.rows(`select save_shop_settings($1::jsonb)`, [JSON.stringify(s)])
  }

  async listDayOverrides(from: string): Promise<DayOverride[]> {
    return this.rows<DayOverride>(
      `select * from day_overrides where day >= $1::date order by day`, [from])
  }

  async saveDayOverride(o: DayOverride): Promise<void> {
    await this.rows(`select save_day_override($1::jsonb)`, [JSON.stringify(o)])
  }

  async deleteDayOverride(day: string): Promise<void> {
    await this.rows(`select delete_day_override($1::date)`, [day])
  }

  // --- felhasználók -----------------------------------------------------------

  async listStaff(): Promise<StaffRow[]> {
    return this.rows<StaffRow>(`select * from list_staff()`)
  }

  async createStaff(input: NewStaffInput): Promise<string | null> {
    // Demóban nincs Supabase Auth, ezért a "regisztrációt" itt mi játsszuk el:
    // meghívó, majd egy auth.users sor. A trigger onnantól ugyanaz.
    const [r] = await this.rows<{ v: { mod?: string; uzenet?: string } }>(
      `select invite_staff($1::jsonb) as v`, [JSON.stringify({
        email: input.email, full_name: input.full_name, role: input.role,
      })])
    if (r?.v?.mod === 'osszekapcsolva') return r.v.uzenet ?? null

    await this.rows(
      `insert into auth.users (id, email) values (gen_random_uuid(), $1)`,
      [input.email.trim().toLowerCase()])
    return null
  }

  async updateStaff(
    id: string,
    patch: { full_name?: string; role?: StaffRole; active?: boolean },
  ): Promise<void> {
    await this.rows(`select set_staff($1::jsonb)`, [JSON.stringify({ id, ...patch })])
  }

  async deleteInvite(email: string): Promise<void> {
    await this.rows(`select delete_invite($1)`, [email])
  }

  // --- bérletek és szerződések -----------------------------------------------

  async listPasses(): Promise<PassBalanceRow[]> {
    return this.rows<PassBalanceRow>(
      `select * from v_pass_balance order by customer_name, pass_name, package_code nulls first`)
  }

  async createPass(input: NewPassInput): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select create_pass($1::jsonb) as id`,
      [JSON.stringify(input)])
    return r.id
  }

  async deactivatePass(passId: string): Promise<void> {
    await this.pg.query(`select deactivate_pass($1::uuid)`, [passId])
  }

  async listContracts(): Promise<ContractRow[]> {
    return this.rows<ContractRow>(`select * from v_contracts order by company_name, customer_name`)
  }

  async saveContract(input: ContractInput): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select save_contract($1::jsonb) as id`,
      [JSON.stringify(input)])
    return r.id
  }

  async getBookingExtras(bookingId: string): Promise<BookingExtraRow[]> {
    const r = await this.rows<any>(
      `select * from v_booking_extras where booking_id = $1::uuid order by name`, [bookingId])
    return r.map((x) => ({ ...x, quantity: num(x.quantity) }))
  }

  async setBookingExtraQty(itemId: string, qty: number): Promise<void> {
    await this.pg.query(`select set_booking_extra_qty($1::uuid, $2::numeric)`, [itemId, qty])
  }

  subscribe(): () => void {
    // A böngészőben futó adatbázist rajtad kívül senki nem írja.
    return () => {}
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
