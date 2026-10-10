create table if not exists public.staff_vacations (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff(id) on delete cascade,
  from_day   date not null,
  to_day     date not null,
  note       text,
  created_at timestamptz not null default now(),
  constraint szabadsag_sorrend check (to_day >= from_day)
);

create index if not exists staff_vacations_napok on public.staff_vacations (from_day, to_day);

alter table public.staff_vacations enable row level security;
drop policy if exists staff_vacations_olvas on public.staff_vacations;
create policy staff_vacations_olvas on public.staff_vacations
  for select to authenticated using (public.is_staff());

create or replace function public.set_vacation(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id     uuid := nullif(p->>'id','')::uuid;
  v_kinek  uuid := coalesce(nullif(p->>'staff_id','')::uuid, auth.uid());
  v_szerep staff_role := public.my_role();
  v_tol    date := nullif(p->>'from_day','')::date;
  v_ig     date := coalesce(nullif(p->>'to_day','')::date, nullif(p->>'from_day','')::date);
begin
  if v_szerep is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  if v_kinek <> auth.uid() and v_szerep::text not in ('SUPERADMIN', 'TULAJDONOS') then
    raise exception 'Más szabadságát a tulajdonos írja be.' using errcode = '42501';
  end if;
  if v_id is not null and not exists (
       select 1 from public.staff_vacations a where a.id = v_id
          and (a.staff_id = auth.uid() or v_szerep::text in ('SUPERADMIN', 'TULAJDONOS'))) then
    raise exception 'Nincs ilyen szabadság.';
  end if;
  if v_tol is null then raise exception 'Melyik naptól?'; end if;
  if v_ig < v_tol then raise exception 'Az utolsó nap nem lehet korábban, mint az első.'; end if;

  if v_id is null then
    insert into public.staff_vacations (staff_id, from_day, to_day, note)
    values (v_kinek, v_tol, v_ig, nullif(trim(p->>'note'), ''))
    returning id into v_id;
  else
    update public.staff_vacations
       set staff_id = v_kinek, from_day = v_tol, to_day = v_ig,
           note = nullif(trim(p->>'note'), '')
     where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_vacation(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  delete from public.staff_vacations a
   where a.id = p_id
     and (a.staff_id = auth.uid() or public.my_role()::text in ('SUPERADMIN', 'TULAJDONOS'));
  if not found then raise exception 'Nincs ilyen szabadság.'; end if;
end;
$$;

create or replace function public.vacation_list(p_from date default current_date)
returns table (
  id uuid, staff_id uuid, staff_name text, from_day date, to_day date, note text, sajat boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.staff_id, s.full_name, v.from_day, v.to_day, v.note, v.staff_id = auth.uid()
    from public.staff_vacations v
    join public.staff s on s.id = v.staff_id
   where v.to_day >= p_from
     and (v.staff_id = auth.uid() or public.is_owner())
   order by v.from_day, s.full_name;
$$;

create or replace function public.vacations_range(p_from date, p_to date)
returns table (
  id uuid, staff_id uuid, staff_name text, from_day date, to_day date, note text, sajat boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.staff_id, s.full_name, v.from_day, v.to_day, v.note, v.staff_id = auth.uid()
    from public.staff_vacations v
    join public.staff s on s.id = v.staff_id
   where public.is_staff()
     and v.from_day <= p_to and v.to_day >= p_from
   order by v.from_day, s.full_name;
$$;

grant execute on function public.set_vacation(jsonb)           to authenticated;
grant execute on function public.delete_vacation(uuid)         to authenticated;
grant execute on function public.vacation_list(date)           to authenticated;
grant execute on function public.vacations_range(date, date)   to authenticated;

create or replace function public.napi_tavollet(p_day date)
returns setof public.staff_absences
language sql
stable
as $$
  select a.* from public.staff_absences a where a.day = p_day
  union all
  select v.id, v.staff_id, p_day, 'EGESZ_NAP'::absence_kind, null::time, null::time,
         coalesce(v.note, 'Szabadság'), v.created_at
    from public.staff_vacations v
   where p_day between v.from_day and v.to_day;
$$;

grant execute on function public.napi_tavollet(date) to authenticated;

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
        union select public.tavollet_tol(a) from public.napi_tavollet(p_day) a
               join public.staff s on s.id = a.staff_id
              where a.day = p_day and s.active and s.role = 'STAFF'
                and public.tavollet_tol(a) > w.starts and public.tavollet_tol(a) < w.ends
        union select public.tavollet_ig(a) from public.napi_tavollet(p_day) a
               join public.staff s on s.id = a.staff_id
              where a.day = p_day and s.active and s.role = 'STAFF'
                and public.tavollet_ig(a) > w.starts and public.tavollet_ig(a) < w.ends
      ) x;

    for i in 1 .. array_length(v_pontok, 1) - 1 loop
      v_hossz := extract(epoch from (v_pontok[i + 1] - v_pontok[i])) / 60;
      v_kozep := v_pontok[i] + (v_pontok[i + 1] - v_pontok[i]) / 2;

      select count(distinct a.staff_id) into v_hianyzik
        from public.napi_tavollet(p_day) a
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

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'staff_vacations') then
    alter publication supabase_realtime add table public.staff_vacations;
  end if;
end $$;
