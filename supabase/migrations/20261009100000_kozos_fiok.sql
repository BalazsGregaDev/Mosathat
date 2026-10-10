alter table public.staff add column if not exists kozos boolean not null default false;

update public.staff set kozos = true where lower(trim(full_name)) = 'tablet';

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

  select count(*) into v_dolgozok from public.staff s where s.active and s.role = 'STAFF' and not s.kozos;

  for w in select ww.starts, ww.ends from public.work_windows(p_day) ww loop
    select array_agg(distinct t order by t) into v_pontok
      from (
        select w.starts as t
        union select w.ends
        union select public.tavollet_tol(a) from public.napi_tavollet(p_day) a
               join public.staff s on s.id = a.staff_id
              where a.day = p_day and s.active and s.role = 'STAFF' and not s.kozos
                and public.tavollet_tol(a) > w.starts and public.tavollet_tol(a) < w.ends
        union select public.tavollet_ig(a) from public.napi_tavollet(p_day) a
               join public.staff s on s.id = a.staff_id
              where a.day = p_day and s.active and s.role = 'STAFF' and not s.kozos
                and public.tavollet_ig(a) > w.starts and public.tavollet_ig(a) < w.ends
      ) x;

    for i in 1 .. array_length(v_pontok, 1) - 1 loop
      v_hossz := extract(epoch from (v_pontok[i + 1] - v_pontok[i])) / 60;
      v_kozep := v_pontok[i] + (v_pontok[i + 1] - v_pontok[i]) / 2;

      select count(distinct a.staff_id) into v_hianyzik
        from public.napi_tavollet(p_day) a
        join public.staff s on s.id = a.staff_id
       where a.day = p_day and s.active and s.role = 'STAFF' and not s.kozos
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

create or replace function public.day_lanes(p_day date)
returns table (starts time, ends time, lanes integer)
language plpgsql
stable
as $$
declare
  v_slots    integer;
  v_dolgozok integer;
  w          record;
  v_t        time;
  v_v        time;
  v_kozep    time;
  v_hianyzik integer;
begin
  select coalesce(o.parallel_slots, s.default_parallel_slots, 2)
    into v_slots
    from public.shop_settings s
    left join public.day_overrides o on o.day = p_day
   limit 1;
  v_slots := coalesce(v_slots, 2);
  select count(*) into v_dolgozok from public.staff s where s.active and s.role = 'STAFF' and not s.kozos;

  for w in select ww.starts, ww.ends from public.work_windows(p_day) ww order by ww.starts loop
    v_t := w.starts;
    while v_t < w.ends loop
      v_v := least(v_t + interval '15 minutes', w.ends);
      v_kozep := v_t + (v_v - v_t) / 2;
      select count(distinct a.staff_id) into v_hianyzik
        from public.napi_tavollet(p_day) a
        join public.staff s on s.id = a.staff_id
       where s.active and s.role = 'STAFF' and not s.kozos
         and public.tavollet_tol(a) <= v_kozep and v_kozep < public.tavollet_ig(a);
      starts := v_t;
      ends   := v_v;
      lanes  := greatest(least(v_slots, greatest(v_dolgozok, v_slots) - v_hianyzik), 0);
      return next;
      v_t := v_v;
    end loop;
  end loop;
end;
$$;

grant execute on function public.day_lanes(date) to authenticated;

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
         (s.role = 'STAFF' and s.active and not s.kozos)
    from public.staff_absences a
    join public.staff s on s.id = a.staff_id
   where a.day = p_day
   order by public.tavollet_tol(a), s.full_name;
$$;

grant execute on function public.day_absences(date) to authenticated;

drop function if exists public.list_staff();

create or replace function public.list_staff()
returns table (
  id            uuid,
  full_name     text,
  role          staff_role,
  active        boolean,
  email         text,
  belepett_mar  boolean,
  meghivo       boolean,
  created_at    timestamptz,
  can_edit_customers boolean,
  can_edit_customers_sajat boolean,
  kozos         boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.my_role() is null or public.my_role() = 'STAFF' then
    raise exception 'A felhasználók listájához nincs jogosultságod.'
      using errcode = '42501';
  end if;

  return query
  select s.id, s.full_name, s.role, s.active,
         u.email::text,
         (u.last_sign_in_at is not null),
         false,
         s.created_at,
         coalesce(s.can_edit_customers, rp.can_edit_customers, false),
         (s.can_edit_customers is not null),
         s.kozos
    from public.staff s
    left join auth.users u on u.id = s.id
    left join public.role_permissions rp on rp.role = s.role

  union all

  select null::uuid, i.full_name, i.role, true,
         i.email::text, false, true, i.created_at,
         coalesce(rp.can_edit_customers, false), false, false
    from public.staff_invites i
    left join public.role_permissions rp on rp.role = i.role
   where i.used_at is null

  order by 7, 3, 2;
end;
$$;

grant execute on function public.list_staff() to authenticated;

create or replace function public.set_staff(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid := (p->>'id')::uuid;
  v_sajat   staff_role := public.my_role();
  v_cel     staff_role;
  v_uj_role staff_role := nullif(p->>'role','')::staff_role;
begin
  select role into v_cel from public.staff where id = v_id;
  if not found then
    raise exception 'Nincs ilyen felhasználó.';
  end if;

  if v_sajat is null or v_sajat = 'STAFF' then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;

  if v_id = auth.uid() and (p ? 'active' or v_uj_role is not null) then
    raise exception 'A saját hozzáférésedet nem tudod elvenni.';
  end if;

  if v_sajat::text = 'TULAJDONOS' then
    if v_cel <> 'STAFF' then
      raise exception 'A fejlesztői és tulajdonosi hozzáférést a fejlesztő kezeli.'
        using errcode = '42501';
    end if;
    if v_uj_role is not null and v_uj_role <> 'STAFF' then
      raise exception 'Tulajdonosként alkalmazotti szerepkört tudsz adni.'
        using errcode = '42501';
    end if;
  end if;

  update public.staff
     set full_name = coalesce(nullif(trim(p->>'full_name'),''), full_name),
         role      = coalesce(v_uj_role, role),
         active    = coalesce((p->>'active')::boolean, active),
         can_edit_customers = case
           when p ? 'can_edit_customers' then (p->>'can_edit_customers')::boolean
           when v_uj_role is not null    then null
           else can_edit_customers end,
         kozos = coalesce((p->>'kozos')::boolean, kozos),
         updated_at = now()
   where id = v_id;
end;
$$;

grant execute on function public.set_staff(jsonb) to authenticated;
