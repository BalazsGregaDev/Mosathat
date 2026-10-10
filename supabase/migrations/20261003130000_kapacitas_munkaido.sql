alter table public.shop_settings
  add column if not exists kapacitas_szorzo numeric not null default 1.2;
alter table public.shop_settings
  add column if not exists hianyzas_szorzok integer[] not null default '{100,80,40,0}';

create table if not exists public.staff_absences (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff(id) on delete cascade,
  day        date not null,
  kind       absence_kind not null,
  starts     time,
  ends       time,
  note       text,
  created_at timestamptz not null default now(),
  constraint absence_idok check (
       (kind = 'KESOBB_ERKEZIK'   and ends   is not null)
    or (kind = 'KORABBAN_TAVOZIK' and starts is not null)
    or (kind = 'TAVOL'            and starts is not null and ends is not null and starts < ends)
    or  kind = 'EGESZ_NAP')
);

create index if not exists staff_absences_nap on public.staff_absences (day);

alter table public.staff_absences enable row level security;
drop policy if exists staff_absences_olvas on public.staff_absences;
create policy staff_absences_olvas on public.staff_absences
  for select to authenticated using (public.is_staff());

create or replace function public.tavollet_tol(a public.staff_absences)
returns time language sql immutable as $$
  select case a.kind when 'KORABBAN_TAVOZIK' then a.starts
                     when 'TAVOL'            then a.starts
                     else time '00:00' end;
$$;

create or replace function public.tavollet_ig(a public.staff_absences)
returns time language sql immutable as $$
  select case a.kind when 'KESOBB_ERKEZIK' then a.ends
                     when 'TAVOL'          then a.ends
                     else time '24:00' end;
$$;

create or replace function public.set_absence(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id    uuid := nullif(p->>'id','')::uuid;
  v_kinek uuid := coalesce(nullif(p->>'staff_id','')::uuid, auth.uid());
  v_szerep staff_role := public.my_role();
  v_kind  absence_kind := (p->>'kind')::absence_kind;
  v_tol   time := nullif(p->>'starts','')::time;
  v_ig    time := nullif(p->>'ends','')::time;
begin
  if v_szerep is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  if v_kinek <> auth.uid() and v_szerep::text not in ('SUPERADMIN', 'TULAJDONOS') then
    raise exception 'Más munkaidejét a tulajdonos állítja.' using errcode = '42501';
  end if;
  if v_id is not null and not exists (
       select 1 from public.staff_absences a where a.id = v_id
          and (a.staff_id = auth.uid() or v_szerep::text in ('SUPERADMIN', 'TULAJDONOS'))) then
    raise exception 'Nincs ilyen bejegyzés.';
  end if;

  if v_kind is null then raise exception 'Mi változik: később jön, korábban megy, vagy távol lesz?'; end if;
  if v_kind = 'KESOBB_ERKEZIK'   and v_ig  is null then raise exception 'Mikor érkezel?'; end if;
  if v_kind = 'KORABBAN_TAVOZIK' and v_tol is null then raise exception 'Mikor mész el?'; end if;
  if v_kind = 'TAVOL' and (v_tol is null or v_ig is null) then
    raise exception 'Mettől meddig leszel távol?';
  end if;
  if v_kind = 'TAVOL' and v_tol >= v_ig then
    raise exception 'A távollét vége legyen később, mint a kezdete.';
  end if;

  if v_id is null then
    insert into public.staff_absences (staff_id, day, kind, starts, ends, note)
    values (v_kinek, (p->>'day')::date, v_kind,
            case when v_kind in ('KORABBAN_TAVOZIK', 'TAVOL') then v_tol end,
            case when v_kind in ('KESOBB_ERKEZIK', 'TAVOL')   then v_ig  end,
            nullif(trim(p->>'note'), ''))
    returning id into v_id;
  else
    update public.staff_absences
       set day    = (p->>'day')::date,
           kind   = v_kind,
           starts = case when v_kind in ('KORABBAN_TAVOZIK', 'TAVOL') then v_tol end,
           ends   = case when v_kind in ('KESOBB_ERKEZIK', 'TAVOL')   then v_ig  end,
           note   = nullif(trim(p->>'note'), '')
     where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_absence(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  delete from public.staff_absences a
   where a.id = p_id
     and (a.staff_id = auth.uid() or public.my_role()::text in ('SUPERADMIN', 'TULAJDONOS'));
  if not found then raise exception 'Nincs ilyen bejegyzés.'; end if;
end;
$$;

create or replace function public.my_absences(p_from date default current_date)
returns setof public.staff_absences
language sql
stable
security definer
set search_path = public
as $$
  select * from public.staff_absences
   where staff_id = auth.uid() and day >= p_from
   order by day, coalesce(starts, ends, time '00:00');
$$;

create or replace function public.day_absences(p_day date)
returns table (
  id         uuid,
  staff_id   uuid,
  staff_name text,
  kind       absence_kind,
  starts     time,
  ends       time,
  note       text,
  szamit     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.staff_id, s.full_name, a.kind, a.starts, a.ends, a.note,
         (s.role = 'STAFF' and s.active)
    from public.staff_absences a
    join public.staff s on s.id = a.staff_id
   where a.day = p_day
   order by public.tavollet_tol(a), s.full_name;
$$;

grant execute on function public.set_absence(jsonb)     to authenticated;
grant execute on function public.delete_absence(uuid)   to authenticated;
grant execute on function public.my_absences(date)      to authenticated;
grant execute on function public.day_absences(date)     to authenticated;

create or replace function public.munkanap(p_day date)
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.work_windows(p_day));
$$;

create or replace function public.foglalas_napi_terhe(b public.bookings, p_day date)
returns numeric
language plpgsql
stable
as $$
declare
  v_napok integer;
begin
  if b.status in ('REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW') then
    return 0;
  end if;
  if p_day < b.service_date or p_day > b.last_day then
    return 0;
  end if;

  if b.last_day = b.service_date then
    return b.planned_duration_minutes;
  end if;

  if exists (select 1 from public.multiday_allocations ma where ma.booking_id = b.id) then
    return coalesce((select ma.minutes from public.multiday_allocations ma
                      where ma.booking_id = b.id and ma.day = p_day), 0);
  end if;

  if not public.munkanap(p_day) then return 0; end if;
  select count(*) into v_napok
    from generate_series(b.service_date, b.last_day, interval '1 day') d
   where public.munkanap(d::date);
  if v_napok = 0 then return 0; end if;
  return b.planned_duration_minutes::numeric / v_napok;
end;
$$;

drop function if exists public.day_capacity(date);

create or replace function public.day_capacity(p_day date)
returns table (
  parallel_slots        integer,
  open_minutes          integer,
  capacity_minutes      integer,
  booked_minutes        integer,
  free_minutes          integer,
  load_pct              numeric,
  base_capacity_minutes integer,
  staff_pct             numeric,
  staff_total           integer,
  cars                  integer,
  revenue_huf           integer
)
language plpgsql
stable
as $$
declare
  v_ovr      public.day_overrides%rowtype;
  v_open     integer;
  v_slots    integer;
  v_szorzo   numeric;
  v_hiany    integer[];
  v_dolgozok integer;
  v_sulyozott numeric := 0;
  v_book     numeric;
  w          record;
  v_pontok   time[];
  i          integer;
  v_kozep    time;
  v_hianyzik integer;
  v_hossz    numeric;
  v_tenyezo  numeric;
begin
  select * into v_ovr from public.day_overrides where day = p_day;

  select coalesce(sum(extract(epoch from (ww.ends - ww.starts)) / 60), 0)::integer
    into v_open
    from public.work_windows(p_day) ww;

  select coalesce(v_ovr.parallel_slots, s.default_parallel_slots, 2),
         coalesce(s.kapacitas_szorzo, 1.2),
         coalesce(s.hianyzas_szorzok, '{100,80,40,0}')
    into v_slots, v_szorzo, v_hiany
    from public.shop_settings s
   limit 1;
  v_slots  := coalesce(v_slots, 2);
  v_szorzo := coalesce(v_szorzo, 1.2);
  v_hiany  := coalesce(v_hiany, '{100,80,40,0}');

  select count(*) into v_dolgozok from public.staff s where s.active and s.role = 'STAFF';

  for w in select ww.starts, ww.ends from public.work_windows(p_day) ww loop
    select array_agg(distinct t order by t) into v_pontok
      from (
        select w.starts as t
        union select w.ends
        union select public.tavollet_tol(a) from public.staff_absences a
               join public.staff s on s.id = a.staff_id
              where a.day = p_day and s.active and s.role = 'STAFF'
                and public.tavollet_tol(a) > w.starts and public.tavollet_tol(a) < w.ends
        union select public.tavollet_ig(a) from public.staff_absences a
               join public.staff s on s.id = a.staff_id
              where a.day = p_day and s.active and s.role = 'STAFF'
                and public.tavollet_ig(a) > w.starts and public.tavollet_ig(a) < w.ends
      ) x;

    for i in 1 .. array_length(v_pontok, 1) - 1 loop
      v_hossz := extract(epoch from (v_pontok[i + 1] - v_pontok[i])) / 60;
      v_kozep := v_pontok[i] + (v_pontok[i + 1] - v_pontok[i]) / 2;

      select count(distinct a.staff_id) into v_hianyzik
        from public.staff_absences a
        join public.staff s on s.id = a.staff_id
       where a.day = p_day and s.active and s.role = 'STAFF'
         and public.tavollet_tol(a) <= v_kozep and v_kozep < public.tavollet_ig(a);

      v_tenyezo := case
        when v_dolgozok = 0 then 100
        else v_hiany[least(v_hianyzik + 1, array_length(v_hiany, 1))] end;

      v_sulyozott := v_sulyozott + v_hossz * v_tenyezo / 100.0;
    end loop;
  end loop;

  select coalesce(sum(public.foglalas_napi_terhe(b, p_day)), 0)
    into v_book
    from public.bookings b
   where b.service_date <= p_day and b.last_day >= p_day;

  parallel_slots        := v_slots;
  open_minutes          := v_open;
  base_capacity_minutes := round(v_open * v_slots * v_szorzo)::integer;
  capacity_minutes      := round(v_sulyozott * v_slots * v_szorzo)::integer;
  booked_minutes        := round(v_book)::integer;
  free_minutes          := greatest(capacity_minutes - booked_minutes, 0);
  load_pct              := case when capacity_minutes > 0
                                then round(booked_minutes * 100.0 / capacity_minutes, 1) end;
  staff_pct             := case when v_open > 0 then round(v_sulyozott * 100.0 / v_open, 1) end;
  staff_total           := v_dolgozok;

  select count(*)::integer into cars
    from public.bookings b
   where b.service_date <= p_day and b.last_day >= p_day
     and b.status not in ('REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW');

  select coalesce(sum(public.booking_ertek(b)), 0)::integer into revenue_huf
    from public.bookings b
   where b.service_date = p_day;

  return next;
end;
$$;

grant execute on function public.day_capacity(date) to authenticated;

create or replace function public.week_capacity(p_from date default current_date)
returns table (
  nap              date,
  hetfotol         integer,
  parallel_slots   integer,
  capacity_minutes integer,
  booked_minutes   integer,
  free_minutes     integer,
  load_pct         numeric
)
language sql
stable
as $$
  select
    d::date,
    (d::date - date_trunc('week', p_from)::date)::integer,
    c.parallel_slots, c.capacity_minutes, c.booked_minutes, c.free_minutes, c.load_pct
  from generate_series(
         date_trunc('week', p_from)::date,
         (date_trunc('week', p_from) + interval '6 days')::date,
         interval '1 day') d
  cross join lateral public.day_capacity(d::date) c;
$$;

grant execute on function public.week_capacity(date) to authenticated;

drop view if exists public.v_day_bookings;

create view public.v_day_bookings
with (security_invoker = on) as
select
  b.id,
  b.service_date,
  b.booking_type,
  b.status,
  b.source,
  b.start_at,
  b.drop_off_at,
  b.pick_up_at,
  b.deadline_at,
  b.arrived_at,
  b.scope,
  b.full_service,
  b.planned_duration_minutes,
  b.rest_minutes,
  b.estimated_price_huf,
  b.final_price_huf,
  b.notes,
  b.internal_notes,

  c.id           as customer_id,
  c.name         as customer_name,
  c.phone        as customer_phone,
  c.type         as customer_type,
  c.company_name,
  c.billing_kind,

  v.id           as vehicle_id,
  v.plate_raw,
  v.plate_country,
  v.brand,
  v.model,
  v.category,
  v.seats,

  p.id           as package_id,
  p.code         as package_code,
  p.name         as package_name,

  case when b.booking_type = 'HOZOMVISZEM' then (
    select ct.pickup_delivery_fee_huf
      from public.contracts ct
     where ct.company_id = c.company_id
       and ct.active
       and ct.pickup_delivery
       and (ct.valid_until is null or ct.valid_until >= b.service_date)
     limit 1
  ) end as pickup_fee_huf,

  (select count(*) from public.booking_tasks t where t.booking_id = b.id)              as tasks_total,
  (select count(*) from public.booking_tasks t where t.booking_id = b.id and t.done)   as tasks_done,

  (select min(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as first_done_at,
  (select max(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as last_done_at,

  b.last_day,
  b.contract_kind,
  c.company_id,
  (select string_agg(bi.name_snapshot, ', ' order by bi.sort_order)
     from public.booking_items bi
    where bi.booking_id = b.id and bi.kind = 'EXTRA')                                   as extras_summary,
  (select count(*)::integer from public.booking_items bi
    where bi.booking_id = b.id and bi.kind = 'EXTRA')                                   as extras_count
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.vehicles  v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id;

create table if not exists public.day_order (
  day        date not null,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  pos        integer not null,
  primary key (day, booking_id)
);

alter table public.day_order enable row level security;
drop policy if exists day_order_staff on public.day_order;
create policy day_order_staff on public.day_order
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create or replace function public.set_day_order(p_day date, p_ids uuid[])
returns void
language plpgsql
volatile
as $$
begin
  delete from public.day_order where day = p_day;
  insert into public.day_order (day, booking_id, pos)
  select p_day, x.id, (min(x.n) * 10)::integer
    from unnest(p_ids) with ordinality as x(id, n)
   where exists (select 1 from public.bookings b where b.id = x.id)
   group by x.id;
end;
$$;

grant execute on function public.set_day_order(date, uuid[]) to authenticated;

create or replace function public.day_bookings(p_day date)
returns setof jsonb
language sql
stable
as $$
  with napi as (
    select v.*,
           case when v.service_date = p_day
                then coalesce((v.start_at    at time zone 'Europe/Budapest')::time,
                              (v.drop_off_at at time zone 'Europe/Budapest')::time,
                              time '00:00')
                else time '00:00' end as napi_ido,
           o.pos
      from public.v_day_bookings v
      left join public.day_order o on o.day = p_day and o.booking_id = v.id
     where v.service_date <= p_day and v.last_day >= p_day
  ),
  horgony as (
    select n.*,
           case when n.pos is not null then n.pos
                else coalesce((select max(k.pos) from napi k
                                where k.pos is not null and k.napi_ido <= n.napi_ido), 0)
           end as hely,
           (n.pos is null)::integer as uj
      from napi n
  )
  select (to_jsonb(h) - 'napi_ido' - 'pos' - 'hely' - 'uj')
         || jsonb_build_object(
              'sorrend',     row_number() over (order by h.hely, h.uj, h.napi_ido, h.plate_raw),
              'nap_szama',   (p_day - h.service_date) + 1,
              'napok_szama', (h.last_day - h.service_date) + 1)
    from horgony h
   order by h.hely, h.uj, h.napi_ido, h.plate_raw;
$$;

grant execute on function public.day_bookings(date) to authenticated;
