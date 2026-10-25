import { PGlite } from '@electric-sql/pglite'

const MIGRACIOK = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

import demoAdatok from '../../../supabase/demo/demo_adatok.sql?raw'

import type {
  AbsenceInput, AbsenceRow, DayAbsence, CompanySummary,
  SheetColumn, SheetCompany, SheetDetail, SheetForBooking, SheetRowInput,
  BerletLap, BerletLapListaElem, BerletFoglalashoz, BerletSorInput, BerletLinkAdat, BerletLinkSor,
  BookingStatus, BookingTask, CalcInput, DashboardSummary, DayBooking, DayCapacity,
  DayOverride, BookingExtraRow, BookingFormData, BookingScope, CustomerSummary, VehicleSummary,
  ContractInput, ContractRow, Extra, LatestStart,
  NewBookingInput, NewPassInput, NewStaffInput, OpeningDay, PassBalanceRow, SearchHit, ServiceArea,
  RolePermission, ShopSettings, StaffRole, StaffRow, StandingCar, VehicleCategory, WeekDay, WorkWindow,
  Quote, CompanyHit, CompanyCandidate, FinishPreview, KeszOpciok, ModositasCsoport, VacationRow, VacationInput, DayLane, OnlineBookingInput,
  OnlineKeres, CegLink, CegLinkAdat, FoglalasEredmeny, DontesEredmeny, KuldesEredmeny, ArculatValasztas, CsomagSzerkesztoAdat, CsomagMentesEredmeny, PublikusNapAdat,
} from '../lib/types'
import type { Catalog, DataSource, KeresesMezo, PublikusAdat, PublikusNyers, SessionUser } from './source'
import type { PublikusMentes, VelemenySor } from '../lib/publikusTartalom'
import type { GyikAdmin, GyikMod, GyikSor } from '../lib/gyik'
import { adatUrl, kepKicsinyit } from '../lib/kep'
import type { JogiBlokk, JogiFajl, JogiFeltoltes, JogiLap, JogiValtozat } from '../lib/jogiDokumentum'
import type { Nyelv } from '../lib/nyelv'
import type { FoglalasKereses, FoglalasomAdat, FoglalasTalalat } from '../../../supabase/functions/_shared/tipusok.ts'
import { idoRovidit, num, numOrNull, publikusbol, publikusNapbol, toExtra, toOnlineKeres, toQuote } from './source'
import { DEMO_BELEPOK, DEMO_STAFF_ID } from './demoBelepok'


const AUTH_STUB = `
create schema if not exists auth;
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
  readonly isDemo = true
  private db: PGlite | null = null
  private user: SessionUser | null = null
  private figyelok = new Set<() => void>()

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

    await db.exec(demoAdatok)

    await db.exec(`
      insert into auth.users (id, email) values
        ('00000000-0000-4000-8000-000000000004', 'gabor@demo.local'),
        ('00000000-0000-4000-8000-000000000005', 'peter@demo.local')
      on conflict do nothing;
      insert into public.staff (id, full_name, role) values
        ('00000000-0000-4000-8000-000000000004', 'Gábor', 'STAFF'),
        ('00000000-0000-4000-8000-000000000005', 'Péter', 'STAFF')
      on conflict (id) do nothing;
      insert into public.staff_absences (staff_id, day, kind, starts, note) values
        ('00000000-0000-4000-8000-000000000004', public.budapest_ma(), 'KORABBAN_TAVOZIK',
         '16:00', 'DEMO — korábban megy');
      insert into public.staff_vacations (staff_id, from_day, to_day, note) values
        ('00000000-0000-4000-8000-000000000005', public.budapest_ma() + 14, public.budapest_ma() + 17, 'DEMO');
    `)
    this.db = db
    if (import.meta.env.DEV) {
      Object.assign(window, {
        mosathatDemoSql: (sql: string, p: unknown[] = []) => this.rows(sql, p),
        mosathatDemoValtozas: () => { for (const f of this.figyelok) f() },
      })
    }
  }

  private static readonly PARSERS = {
    1082: (v: string) => v,
    1114: (v: string) => new Date(v + 'Z').toISOString(),
    1184: (v: string) => new Date(v).toISOString(),
  }

  private async rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const r = await this.pg.query<T>(sql, params, { parsers: DemoSource.PARSERS })
    return r.rows
  }

  async signIn(email: string): Promise<SessionUser> {
    const b = DEMO_BELEPOK.find((x) => x.email === email.trim().toLowerCase())
      ?? DEMO_BELEPOK[0]

    await this.pg.exec(`select set_config('app.uid', '${b.id}', false)`)
    const u: SessionUser = {
      id: b.id, name: b.name, role: b.role, email: b.email,
      canEditCustomers: await this.szerkesztheti(),
    }
    this.user = u
    return u
  }

  async signOut(): Promise<void> {
    this.user = null
  }

  async currentUser(): Promise<SessionUser | null> {
    if (this.user) this.user = { ...this.user, canEditCustomers: await this.szerkesztheti() }
    return this.user
  }

  private async szerkesztheti(): Promise<boolean> {
    const [r] = await this.rows<{ v: boolean }>(`select can_edit_customers() as v`)
    return r?.v === true
  }

  async getCatalog(): Promise<Catalog> {
    const [packages, pp, fs, extras, surcharges, matrix, tobblet] = await Promise.all([
      this.rows<any>(`select * from packages where active order by sort_order`),
      this.rows<any>(`select * from package_pricing`),
      this.rows<any>(`select * from full_service_pricing`),
      this.rows<any>(`select * from extras where active order by sort_order`),
      this.rows<any>(`select * from surcharges where active order by sort_order`),
      this.rows<any>(`select * from v_package_matrix order by area, sort_order, package_sort`),
      this.rows<any>(`select * from v_package_extra order by area, sort_order`),
    ])
    return {
      packages,
      packagePricing: pp,
      fullServicePricing: fs,
      extras: extras.map(toExtra),
      packageItems: matrix,
      packageExtras: tobblet,
      surcharges: surcharges.map((s) => ({
        ...s,
        default_value: num(s.default_value),
        max_value: numOrNull(s.max_value),
      })),
    }
  }

  async getDay(date: string): Promise<DayBooking[]> {
    const r = await this.rows<{ day_bookings: DayBooking }>(
      `select * from day_bookings($1::date)`, [date])
    return r.map((x) => x.day_bookings)
  }

  async setDayOrder(date: string, ids: string[]): Promise<void> {
    await this.pg.query(`select set_day_order($1::date, $2::uuid[])`, [date, ids])
  }

  async getDayAbsences(date: string): Promise<DayAbsence[]> {
    const r = await this.rows<DayAbsence>(`select * from day_absences($1::date)`, [date])
    return r.map(idoRovidit)
  }

  async listAbsences(): Promise<AbsenceRow[]> {
    const r = await this.rows<AbsenceRow>(`select * from absence_list()`)
    return r.map(idoRovidit)
  }

  async setAbsence(input: AbsenceInput): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select set_absence($1::jsonb) as id`,
      [JSON.stringify(input)])
    return r.id
  }

  async deleteAbsence(id: string): Promise<void> {
    await this.pg.query(`select delete_absence($1::uuid)`, [id])
  }
  async listVacations(): Promise<VacationRow[]> {
    return this.rows<VacationRow>(`select * from vacation_list()`)
  }

  async getVacations(from: string, to: string): Promise<VacationRow[]> {
    return this.rows<VacationRow>(`select * from vacations_range($1::date, $2::date)`, [from, to])
  }

  async setVacation(input: VacationInput): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select set_vacation($1::jsonb) as id`,
      [JSON.stringify(input)])
    return r.id
  }

  async deleteVacation(id: string): Promise<void> {
    await this.pg.query(`select delete_vacation($1::uuid)`, [id])
  }

  async getRange(from: string, to: string): Promise<DayBooking[]> {
    return this.rows<DayBooking>(
      `select * from v_day_bookings
        where service_date <= $2::date and last_day >= $1::date
        order by service_date, coalesce(start_at, drop_off_at) nulls last, plate_raw`,
      [from, to],
    )
  }

  async getRangeOrder(from: string, to: string): Promise<Map<string, number>> {
    const r = await this.rows<{ day: string; booking_id: string; sorrend: number }>(
      `select day::text as day, booking_id::text as booking_id, sorrend
         from range_order($1::date, $2::date)`, [from, to])
    return new Map(r.map((x) => [`${String(x.day).slice(0, 10)}|${x.booking_id}`, Number(x.sorrend)]))
  }

  async getDayLanes(date: string): Promise<DayLane[]> {
    const r = await this.rows<DayLane>(
      `select starts::text as starts, ends::text as ends, lanes from day_lanes($1::date)`, [date])
    return r.map((x) => ({ ...x, lanes: Number(x.lanes) }))
  }

  async getStartMinutes(): Promise<number | null> {
    const [r] = await this.rows<{ p: number | null }>(`select start_perc() as p`)
    return r?.p == null ? null : Number(r.p)
  }

  async listOnlineKeresek(): Promise<OnlineKeres[]> {
    const r = await this.rows<OnlineKeres>(`select * from v_online_kerelmek order by beerkezett`)
    return r.map(toOnlineKeres)
  }

  async onlineKeresDontes(bookingId: string, elfogad: boolean): Promise<DontesEredmeny> {
    const [r] = await this.rows<{ eredmeny: DontesEredmeny }>(
      `select online_keres_dontes($1::uuid, $2::boolean) as eredmeny`, [bookingId, elfogad])
    return r.eredmeny
  }

  async ertesitesekKuldese(): Promise<KuldesEredmeny | null> {
    return null
  }

  async getArculat(): Promise<ArculatValasztas> {
    const [r] = await this.rows<{ arculat: string | null; arculat_mod: ArculatValasztas['mod'] }>(
      `select arculat, arculat_mod from shop_settings`)
    return { kod: r?.arculat ?? null, mod: r?.arculat_mod ?? null }
  }

  async saveArculat(kod: string, mod: 'VILAGOS' | 'SOTET'): Promise<void> {
    await this.rows(`select arculat_valasztas($1, $2)`, [kod, mod])
  }

  async publikusNap(nap: string): Promise<PublikusNapAdat> {
    const [r] = await this.rows<{ x: { foglalasok: DayBooking[]; savok: DayLane[] } }>(`select publikus_nap($1::date) x`, [nap])
    return publikusNapbol(r?.x ?? null)
  }

  async publikusAjanlat(input: Partial<NewBookingInput> & CalcInput): Promise<Quote> {
    const [r] = await this.rows<{ x: Record<string, unknown> }>(`select publikus_ajanlat($1::jsonb) x`, [JSON.stringify(input)])
    return toQuote(r?.x)
  }

  async publikusFoglalas(input: OnlineBookingInput): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select publikus_foglalas($1::jsonb) id`, [JSON.stringify(input)])
    return r.id
  }

  async publikusJogi(lap: JogiLap, nyelv: Nyelv): Promise<JogiBlokk[] | null> {
    const [r] = await this.rows<{ x: JogiBlokk[] | null }>(`select publikus_jogi($1, $2) x`, [lap, nyelv])
    return r?.x ?? null
  }

  async cegLinkek(): Promise<CegLink[]> {
    const [r] = await this.rows<{ x: CegLink[] }>(`select ceg_linkek() x`)
    return r?.x ?? []
  }

  async cegLinkUj(companyId: string): Promise<string> {
    const [r] = await this.rows<{ k: string }>(`select ceg_link_uj($1::uuid) k`, [companyId])
    return r.k
  }

  async cegLinkAtir(companyId: string, cim: string): Promise<string> {
    const [r] = await this.rows<{ k: string }>(`select ceg_link_cim($1::uuid, $2) k`, [companyId, cim])
    return r.k
  }

  async cegLinkUzenet(companyId: string, uzenet: string): Promise<void> {
    await this.rows(`select ceg_link_uzenet($1::uuid, $2)`, [companyId, uzenet])
  }

  async cegLinkAdat(token: string): Promise<CegLinkAdat | null> {
    const [r] = await this.rows<{ x: CegLinkAdat | null }>(`select ceg_link_adat($1) x`, [token])
    return r?.x ?? null
  }

  async cegAjanlat(token: string, input: Partial<NewBookingInput> & CalcInput): Promise<Quote> {
    const [r] = await this.rows<{ x: Record<string, unknown> }>(`select ceg_ajanlat($1, $2::jsonb) x`, [token, JSON.stringify(input)])
    return toQuote(r?.x)
  }

  async cegFoglalas(token: string, input: OnlineBookingInput): Promise<FoglalasEredmeny> {
    const [r] = await this.rows<{ x: FoglalasEredmeny }>(`select ceg_foglalas($1, $2::jsonb) x`, [token, JSON.stringify(input)])
    return r.x
  }

  async berletLinkek(): Promise<BerletLinkSor[]> {
    const [r] = await this.rows<{ x: BerletLinkSor[] }>(`select berlet_linkek() x`)
    return r?.x ?? []
  }

  async berletLinkUj(customerId: string): Promise<string> {
    const [r] = await this.rows<{ k: string }>(`select berlet_link_uj($1::uuid) k`, [customerId])
    return r.k
  }

  async berletLinkAtir(customerId: string, cim: string): Promise<string> {
    const [r] = await this.rows<{ k: string }>(`select berlet_link_cim($1::uuid, $2) k`, [customerId, cim])
    return r.k
  }

  async berletLinkAdat(token: string): Promise<BerletLinkAdat | null> {
    const [r] = await this.rows<{ x: BerletLinkAdat | null }>(`select berlet_link_adat($1) x`, [token])
    return r?.x ?? null
  }

  async berletAjanlat(token: string, input: Partial<NewBookingInput> & CalcInput): Promise<Quote> {
    const [r] = await this.rows<{ x: Record<string, unknown> }>(`select berlet_ajanlat($1, $2::jsonb) x`, [token, JSON.stringify(input)])
    return toQuote(r?.x)
  }

  async berletFoglalas(token: string, input: OnlineBookingInput): Promise<FoglalasEredmeny> {
    const [r] = await this.rows<{ x: FoglalasEredmeny }>(`select berlet_foglalas($1, $2::jsonb) x`, [token, JSON.stringify(input)])
    return r.x
  }

  async cegTeliNapok(token: string, tol: string, ig: string): Promise<string[]> {
    const [r] = await this.rows<{ x: string[] | null }>(`select ceg_teli_napok($1, $2::date, $3::date) x`, [token, tol, ig])
    return r?.x ?? []
  }

  async foglalasKereses(adat: FoglalasKereses): Promise<FoglalasTalalat[]> {
    const [r] = await this.rows<{ x: FoglalasTalalat[] }>(`select foglalas_kereses($1::jsonb) x`, [JSON.stringify(adat)])
    return r?.x ?? []
  }

  async foglalasom(token: string): Promise<FoglalasomAdat> {
    const [r] = await this.rows<{ x: FoglalasomAdat }>(`select foglalasom($1) x`, [token])
    return r.x
  }

  async foglalasomModositas(token: string, uzenet: string): Promise<FoglalasomAdat> {
    const [r] = await this.rows<{ x: FoglalasomAdat }>(`select foglalasom_modositas($1, $2) x`, [token, uzenet])
    return r.x
  }

  async foglalasomLemondas(token: string): Promise<FoglalasomAdat> {
    const [r] = await this.rows<{ x: FoglalasomAdat }>(`select foglalasom_lemondas($1) x`, [token])
    return r.x
  }

  async jogiValtozatok(): Promise<JogiValtozat[]> {
    const [r] = await this.rows<{ x: JogiValtozat[] }>(`select jogi_valtozatok() x`)
    return r?.x ?? []
  }

  async jogiFeltoltes(p: JogiFeltoltes): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select jogi_valtozat_feltoltes($1::jsonb) id`, [JSON.stringify(p)])
    return r.id
  }

  async jogiFajl(id: string): Promise<JogiFajl> {
    const [r] = await this.rows<{ x: JogiFajl }>(`select jogi_valtozat_fajl($1::uuid) x`, [id])
    return r.x
  }

  async jogiVisszaallitas(id: string): Promise<void> {
    await this.rows(`select jogi_valtozat_visszaallitas($1::uuid)`, [id])
  }

  async savePublikusTartalom(p: PublikusMentes): Promise<void> {
    await this.rows(`select publikus_tartalom_mentes($1::jsonb)`, [JSON.stringify(p)])
  }

  async velemenyekLista(): Promise<VelemenySor[]> {
    const [r] = await this.rows<{ x: VelemenySor[] }>(`select velemenyek_lista() x`)
    return r.x ?? []
  }

  async velemenyekMentes(lista: VelemenySor[]): Promise<void> {
    await this.rows(`select velemenyek_mentes($1::jsonb)`, [JSON.stringify(lista)])
  }

  async gyikLista(): Promise<GyikAdmin> {
    const [r] = await this.rows<{ x: GyikAdmin }>(`select gyik_lista() x`)
    return r.x
  }

  async gyikMentes(k: Partial<GyikSor> & { kerdes: string }): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select gyik_mentes($1::jsonb) id`, [JSON.stringify(k)])
    return r.id
  }

  async gyikTorles(id: string): Promise<void> {
    await this.rows(`select gyik_torles($1::uuid)`, [id])
  }

  async gyikSorrend(ids: string[]): Promise<void> {
    await this.rows(`select gyik_sorrend($1::uuid[])`, [ids])
  }

  async gyikBeallitas(mod: GyikMod, max: number): Promise<void> {
    await this.rows(`select gyik_beallitas($1, $2)`, [mod, max])
  }

  async gyikKepFeltoltes(f: Blob): Promise<string> {
    return adatUrl(await kepKicsinyit(f, 1000, 0.72))
  }

  async getPublikus(): Promise<PublikusAdat> {
    const [r] = await this.rows<{ x: PublikusNyers }>(`select publikus_oldal() x`)
    return publikusbol(r.x)
  }

  async getCsomagSzerkeszto(): Promise<CsomagSzerkesztoAdat> {
    const [r] = await this.rows<{ x: CsomagSzerkesztoAdat }>(`select csomag_szerkeszto() x`)
    return r.x
  }

  async saveCsomagSzerkeszto(adat: CsomagSzerkesztoAdat): Promise<CsomagMentesEredmeny> {
    const [r] = await this.rows<{ x: CsomagMentesEredmeny }>(`select csomag_szerkeszto_mentes($1::jsonb) x`, [JSON.stringify(adat)])
    return r.x
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
      base_capacity_minutes: num(r?.base_capacity_minutes),
      staff_pct: numOrNull(r?.staff_pct),
      staff_total: num(r?.staff_total),
      cars: num(r?.cars),
      revenue_huf: num(r?.revenue_huf),
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

  async searchCustomers(q: string, limit = 5, mezo: KeresesMezo = 'MIND'): Promise<SearchHit[]> {
    return this.rows<SearchHit>(
      `select * from search_customers($1, $2::integer, $3)`, [q, limit, mezo])
  }

  async quoteBooking(input: Partial<NewBookingInput> & CalcInput & { booking_id?: string | null }): Promise<Quote> {
    const [r] = await this.rows<{ r: Record<string, unknown> }>(
      `select quote_booking($1::jsonb) as r`, [JSON.stringify(input)])
    return toQuote(r?.r)
  }

  async searchCompanies(q: string, limit = 6): Promise<CompanyHit[]> {
    return this.rows<CompanyHit>(`select * from search_companies($1, $2::integer)`, [q, limit])
  }

  async companyCandidates(name: string): Promise<CompanyCandidate[]> {
    return this.rows<CompanyCandidate>(`select * from ceg_jeloltek($1)`, [name])
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

  async reopenBooking(bookingId: string): Promise<BookingStatus> {
    const [r] = await this.rows<{ s: BookingStatus }>(`select booking_reopen($1::uuid) as s`, [bookingId])
    return r.s
  }
  async finishPreview(bookingId: string, done: string[]): Promise<FinishPreview> {
    const [r] = await this.rows<{ p: FinishPreview }>(
      `select booking_finish_preview($1::uuid, $2::uuid[]) as p`, [bookingId, done])
    return r.p
  }

  async finishBooking(bookingId: string, done: string[], opciok: KeszOpciok = {}): Promise<FinishPreview> {
    const [r] = await this.rows<{ p: FinishPreview }>(
      `select booking_finish($1::uuid, $2::uuid[], $3::integer, $4, $5::boolean) as p`,
      [bookingId, done, opciok.ar ?? null, opciok.indok ?? null, opciok.email === true])
    return r.p
  }

  async foglalasLink(bookingId: string): Promise<string> {
    const [r] = await this.rows<{ t: string }>(`select foglalas_link($1::uuid) t`, [bookingId])
    return r.t
  }

  async modositasiKerelmek(): Promise<ModositasCsoport[]> {
    const [r] = await this.rows<{ x: ModositasCsoport[] | null }>(`select modositasi_kerelmek() x`)
    return r?.x ?? []
  }

  async modositasElintezve(bookingId: string): Promise<number> {
    const [r] = await this.rows<{ n: number }>(`select modositas_elintezve($1::uuid) n`, [bookingId])
    return Number(r?.n ?? 0)
  }

  async setContractFleet(contractId: string, value: boolean): Promise<void> {
    await this.rows(`select set_contract_fleet($1::uuid, $2::boolean)`, [contractId, value])
  }

  async contractIsFleet(contractId: string): Promise<boolean> {
    const [r] = await this.rows<{ f: boolean }>(`select szerzodes_flottas($1::uuid) as f`, [contractId])
    return r?.f === true
  }

  async createFleetBooking(input: NewBookingInput, count: number): Promise<string> {
    const [r] = await this.rows<{ g: string }>(`select create_fleet_booking($1::jsonb, $2::int) as g`,
      [JSON.stringify(input), count])
    return r.g
  }

  async fleetAddCar(groupId: string): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select fleet_add_car($1::uuid) as id`, [groupId])
    return r.id
  }

  async fleetPatch(groupId: string, patch: Record<string, unknown>): Promise<void> {
    await this.rows(`select fleet_patch($1::uuid, $2::jsonb)`, [groupId, JSON.stringify(patch)])
  }

  async fleetSetPlate(bookingId: string, plate: string): Promise<void> {
    await this.rows(`select fleet_set_plate($1::uuid, $2)`, [bookingId, plate])
  }

  async fleetStep(groupId: string, delta: 1 | -1): Promise<string | null> {
    const [r] = await this.rows<{ id: string | null }>(`select fleet_step($1::uuid, $2::int) as id`,
      [groupId, delta])
    return r?.id ?? null
  }

  async getFleetGroup(groupId: string): Promise<DayBooking[]> {
    return this.rows<DayBooking>(
      `select * from v_day_bookings where fleet_group = $1::uuid order by fleet_index`, [groupId])
  }

  async setTentative(bookingId: string, value: boolean): Promise<void> {
    await this.rows(`select set_booking_tentative($1::uuid, $2::boolean)`, [bookingId, value])
  }

  async notFitted(bookingId: string): Promise<void> {
    await this.rows(`select booking_not_fitted($1::uuid)`, [bookingId])
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

  async updateExtra(id: string, patch: Partial<Extra>): Promise<void> {
    await this.rows(`select extra_mentes($1::uuid, $2::jsonb)`, [id, JSON.stringify(patch)])
  }

  async createExtra(input: { name: string; area?: ServiceArea; price_huf: number | null; work_minutes: number | null }): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select create_extra($1::jsonb) as id`,
      [JSON.stringify(input)])
    return r.id
  }

  async deleteExtra(id: string): Promise<void> {
    await this.rows(`select extra_torles($1::uuid)`, [id])
  }

  async sortExtras(ids: string[]): Promise<void> {
    await this.rows(`select extrak_sorrend($1::uuid[])`, [ids])
  }

  async listAllExtras(): Promise<Extra[]> {
    return (await this.rows<Extra>(`select * from extras order by sort_order, name`)).map(toExtra)
  }

  async updatePackagePrice(
    packageId: string, category: VehicleCategory, scope: BookingScope,
    patch: { price_huf?: number | null; duration_minutes?: number | null },
  ): Promise<void> {
    await this.pg.query(
      `insert into package_pricing (package_id, category, scope, price_huf, duration_minutes)
       values ($1::uuid, $2::vehicle_category, $3::booking_scope, $4, $5)
       on conflict (package_id, category, scope) do update
         set price_huf = case when $6 then excluded.price_huf else package_pricing.price_huf end,
             duration_minutes = case when $7 then excluded.duration_minutes else package_pricing.duration_minutes end`,
      [packageId, category, scope, patch.price_huf ?? null, patch.duration_minutes ?? null,
       'price_huf' in patch, 'duration_minutes' in patch],
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
         set price_huf = case when $5 then excluded.price_huf else full_service_pricing.price_huf end,
             extra_work_minutes = case when $6 then excluded.extra_work_minutes
                                       else full_service_pricing.extra_work_minutes end`,
      [packageId, category, patch.price_huf ?? null, patch.extra_work_minutes ?? null,
       'price_huf' in patch, 'extra_work_minutes' in patch],
    )
  }

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

  async addVehicle(input: Record<string, unknown>): Promise<string> {
    const [r] = await this.rows<{ id: string }>(
      `select add_vehicle($1::jsonb) as id`, [JSON.stringify(input)])
    return r.id
  }

  async addCustomer(input: Record<string, unknown>): Promise<string> {
    const [r] = await this.rows<{ id: string }>(
      `select add_customer($1::jsonb) as id`, [JSON.stringify(input)])
    return r.id
  }

  async listCustomers(q = ''): Promise<CustomerSummary[]> {
    return this.rows<CustomerSummary>(`select * from list_customers($1, 200)`, [q])
  }

  async listVehicles(q = ''): Promise<VehicleSummary[]> {
    return this.rows<VehicleSummary>(`select * from list_vehicles($1, 200)`, [q])
  }

  async listCompanies(q = ''): Promise<CompanySummary[]> {
    const r = await this.rows<{ c: CompanySummary }>(`select list_companies($1, 200) as c`, [q])
    return r.map((x) => x.c)
  }

  async listSheetCompanies(month: string): Promise<SheetCompany[]> {
    const [r] = await this.rows<{ d: SheetCompany[] }>(`select sheet_cegek($1::date) as d`, [month])
    return r.d ?? []
  }

  async getSheet(companyId: string, month: string): Promise<SheetDetail> {
    const [r] = await this.rows<{ d: SheetDetail }>(
      `select sheet_detail($1::uuid, $2::date) as d`, [companyId, month])
    return r.d
  }

  async sheetForBooking(bookingId: string): Promise<SheetForBooking> {
    const [r] = await this.rows<{ d: SheetForBooking }>(
      `select sheet_for_booking($1::uuid) as d`, [bookingId])
    return r.d
  }

  async saveSheetRow(input: SheetRowInput): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select sheet_row_save($1::jsonb) as id`,
      [JSON.stringify(input)])
    return r.id
  }

  async deleteSheetRow(id: string): Promise<void> {
    await this.pg.query(`select sheet_row_delete($1::uuid)`, [id])
  }

  async berletLapok(): Promise<BerletLapListaElem[]> {
    const [r] = await this.rows<{ d: BerletLapListaElem[] }>(`select berlet_lapok() as d`)
    return r.d ?? []
  }

  async berletLap(passId: string): Promise<BerletLap> {
    const [r] = await this.rows<{ d: BerletLap }>(`select berlet_lap($1::uuid) as d`, [passId])
    return r.d
  }

  async berletFoglalashoz(bookingId: string): Promise<BerletFoglalashoz> {
    const [r] = await this.rows<{ d: BerletFoglalashoz }>(
      `select berlet_lap_foglalashoz($1::uuid) as d`, [bookingId])
    return r.d
  }

  async saveBerletSor(input: BerletSorInput): Promise<string> {
    const [r] = await this.rows<{ id: string }>(`select berlet_sor_mentes($1::jsonb) as id`,
      [JSON.stringify(input)])
    return r.id
  }

  async deleteBerletSor(id: string): Promise<void> {
    await this.pg.query(`select berlet_sor_torles($1::uuid)`, [id])
  }

  async closeSheet(companyId: string, month: string): Promise<void> {
    await this.pg.query(`select sheet_close($1::uuid, $2::date)`, [companyId, month])
  }

  async reopenSheet(companyId: string, month: string): Promise<void> {
    await this.pg.query(`select sheet_reopen($1::uuid, $2::date)`, [companyId, month])
  }

  async saveSheetSettings(companyId: string, s: { columns: SheetColumn[]; footer_text: string | null }): Promise<void> {
    await this.pg.query(`select sheet_settings_save($1::uuid, $2::jsonb)`, [companyId, JSON.stringify(s)])
  }

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
      online_lemondas_ora: num(r.online_lemondas_ora),
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

  async listStaff(): Promise<StaffRow[]> {
    return this.rows<StaffRow>(`select * from list_staff()`)
  }

  async createStaff(input: NewStaffInput): Promise<string | null> {
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
    patch: { full_name?: string; role?: StaffRole; active?: boolean; can_edit_customers?: boolean | null; kozos?: boolean },
  ): Promise<void> {
    await this.rows(`select set_staff($1::jsonb)`, [JSON.stringify({ id, ...patch })])
  }

  async listRolePermissions(): Promise<RolePermission[]> {
    return this.rows<RolePermission>(`select * from list_role_permissions()`)
  }

  async setRolePermission(role: StaffRole, patch: { can_edit_customers: boolean }): Promise<void> {
    await this.rows(`select set_role_permission($1::jsonb)`,
      [JSON.stringify({ role, ...patch })])
  }

  async deleteInvite(email: string): Promise<void> {
    await this.rows(`select delete_invite($1)`, [email])
  }

  async changeOwnPassword(): Promise<void> {
    throw new Error('A demóban nincs valódi jelszó, ezért nincs mit átírni. '
      + 'Éles adatbázissal ez a gomb működik.')
  }

  async setStaffPassword(): Promise<void> {
    throw new Error('A demóban nincs valódi jelszó, ezért nincs mit átírni. '
      + 'Éles adatbázissal ez a gomb működik.')
  }

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

  async deleteContract(id: string): Promise<void> {
    await this.pg.query(`select delete_contract($1::uuid)`, [id])
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

  subscribe(onValtozas: () => void): () => void {
    this.figyelok.add(onValtozas)
    return () => { this.figyelok.delete(onValtozas) }
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
