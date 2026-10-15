alter table public.extras
  add column if not exists included_in_packages uuid[] not null default '{}',
  add column if not exists included_in_full_service boolean not null default false;

with extra_kulcs as (
  select e.id,
         lower(trim(regexp_replace(regexp_replace(e.name, '\([^)]*\)', ' ', 'g'), '\s+', ' ', 'g'))) as k
    from public.extras e
),
tetel_kulcs as (
  select m.package_id,
         lower(trim(regexp_replace(regexp_replace(m.name, '\([^)]*\)', ' ', 'g'), '\s+', ' ', 'g'))) as k1,
         lower(trim(regexp_replace(regexp_replace(m.slot_name, '\([^)]*\)', ' ', 'g'), '\s+', ' ', 'g'))) as k2
    from public.v_package_matrix m
)
update public.extras e
   set included_in_packages = coalesce((
         select array_agg(distinct t.package_id order by t.package_id)
           from tetel_kulcs t
          where t.k1 = x.k or t.k2 = x.k), '{}')
  from extra_kulcs x
 where x.id = e.id
   and e.included_in_packages = '{}';

update public.extras
   set included_in_full_service = true
 where lower(trim(regexp_replace(regexp_replace(name, '\([^)]*\)', ' ', 'g'), '\s+', ' ', 'g')))
       in ('vizes kárpittisztítás', 'bőrtisztítás és ápolás');

alter table public.bookings
  add column if not exists seat_material text
    check (seat_material in ('KARPIT', 'BOR', 'KARPIT_BOR'));

create or replace function public.full_service_nev(p_ules text)
returns text
language sql
immutable
as $$
  select 'Full Service (Csomag+' || case p_ules
           when 'KARPIT'     then 'Kárpittisztítás'
           when 'BOR'        then 'Bőrtisztítás'
           when 'KARPIT_BOR' then 'Kárpit- és bőrtisztítás'
           else 'Kárpit/Bőrtisztítás'
         end || ')';
$$;

grant execute on function public.full_service_nev(text) to authenticated;

create or replace function public.foglalas_tetelek_ir(
  p_booking_id uuid,
  p_package_id uuid,
  p_category   vehicle_category,
  p_scope      booking_scope,
  p_full       boolean,
  p_extras     jsonb,
  p_pct        numeric,
  p_fix        integer,
  p_company_id uuid,
  p_kind       contract_kind,
  p_type       booking_type,
  p_date       date)
returns integer
language plpgsql
volatile
as $$
declare
  v_osszeg integer;
begin
  delete from public.booking_items where booking_id = p_booking_id;

  insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                    quantity, unit_price_huf, price_huf, work_minutes, sort_order)
  select p_booking_id, t.kind, t.ref_id, t.name,
         t.quantity, t.unit_price_huf, t.price_huf, t.work_minutes, t.sort_order
    from public.foglalas_tetelek(p_package_id, p_category, p_scope, p_full, p_extras,
                                 p_pct, p_fix, p_company_id, p_kind, p_type, p_date) t;

  update public.booking_items bi
     set name_snapshot = public.full_service_nev(b.seat_material)
    from public.bookings b
   where b.id = p_booking_id
     and bi.booking_id = p_booking_id
     and bi.kind = 'FULL_SERVICE';

  select coalesce(sum(price_huf), 0)::integer
    into v_osszeg
    from public.booking_items where booking_id = p_booking_id;

  update public.bookings
     set estimated_price_huf = v_osszeg,
         contract_kind = case when public.ceg_szerzodes_aktiv(p_company_id, p_date) is not null
                              then coalesce(p_kind, 'FLOTTA') end
   where id = p_booking_id;

  return v_osszeg;
end;
$$;

create or replace function public.foglalas_napi_terhe(b public.bookings, p_day date)
returns numeric
language plpgsql
stable
as $$
declare
  v_ma        date := (now() at time zone 'Europe/Budapest')::date;
  v_napon     numeric;
  v_kesz      numeric;
  v_maradek   numeric;
  v_osszes    numeric;
  v_napok     integer;
begin
  if b.status in ('REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW')
     or coalesce(b.not_fitted, false) then
    return 0;
  end if;
  if p_day < b.service_date or p_day > b.last_day then
    return 0;
  end if;

  if b.last_day = b.service_date then
    return b.planned_duration_minutes;
  end if;

  if b.booking_type = 'LEADOS' and coalesce(b.rest_minutes, 0) > 0 then
    return case when p_day = b.service_date then b.planned_duration_minutes else 0 end;
  end if;

  with pipa as (
    select (t.done_at at time zone 'Europe/Budapest')::date as nap, fp.perc
      from public.booking_tasks t
      join public.feladat_percek(b.id) fp on fp.task_id = t.id
     where t.booking_id = b.id and t.done and t.done_at is not null
  )
  select coalesce(sum(perc) filter (where nap = p_day), 0), coalesce(sum(perc), 0)
    into v_napon, v_kesz
    from pipa;

  if v_napon > 0 then return v_napon; end if;
  if p_day < v_ma then return 0; end if;
  if not public.munkanap(p_day) then return 0; end if;

  v_maradek := greatest(b.planned_duration_minutes - v_kesz, 0);

  select coalesce(sum(public.elerheto_perc(b, d::date)), 0), count(*)
    into v_osszes, v_napok
    from generate_series(greatest(b.service_date, v_ma), b.last_day, interval '1 day') d
   where public.munkanap(d::date)
     and not exists (
       select 1 from public.booking_tasks t
        where t.booking_id = b.id and t.done
          and (t.done_at at time zone 'Europe/Budapest')::date = d::date);

  if v_napok = 0 then return 0; end if;
  if v_osszes <= 0 then return v_maradek / v_napok; end if;
  return v_maradek * public.elerheto_perc(b, p_day) / v_osszes;
end;
$$;

create or replace function public.online_foglalas(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_id      uuid;
  v_nap     date := nullif(p->>'service_date', '')::date;
  v_holnap  date := (now() at time zone 'Europe/Budapest')::date + 1;
  v_tipus   text := p->>'booking_type';
  v_email   text := nullif(trim(p->>'customer_email'), '');
  v_full    boolean := coalesce((p->>'full_service')::boolean, false);
  v_ules    text := nullif(p->>'seat_material', '');
  v_masnap  boolean := coalesce((p->>'next_day_pick_up')::boolean, false);
  v_elvitel date;
  v_be      jsonb;
begin
  if coalesce(trim(p->>'customer_name'), '') = '' then
    raise exception 'Add meg a neved.';
  end if;
  if public.phone_norm(p->>'customer_phone') is null then
    raise exception 'Add meg a telefonszámod.';
  end if;
  if coalesce(trim(p->>'plate_raw'), '') = '' then
    raise exception 'Add meg a rendszámot.';
  end if;
  if nullif(p->>'package_id', '') is null then
    raise exception 'Válassz csomagot.';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Az e-mail cím formátuma nem jó.';
  end if;

  if v_nap is null then raise exception 'Válassz napot.'; end if;
  if v_nap < v_holnap then raise exception 'Online legkorábban holnapra lehet foglalni.'; end if;
  if v_nap > v_holnap + 56 then raise exception 'Legfeljebb 8 hétre előre lehet foglalni.'; end if;
  if not public.munkanap(v_nap) then raise exception 'Ezen a napon zárva vagyunk.'; end if;

  if v_tipus not in ('VAROS', 'LEADOS') then
    raise exception 'Online csak „Megvárja" vagy „Itt hagyja" foglalás kérhető.';
  end if;

  v_be := p - 'customer_email' - 'status' - 'source'
            - 'pick_up_date' - 'pick_up_time' - 'deadline_date' - 'deadline_time'
            - 'seat_material' - 'next_day_pick_up'
            - 'company_id' - 'company_name' - 'contract_kind' - 'customer_id' - 'vehicle_id';

  if v_full then
    if v_tipus <> 'LEADOS' then
      raise exception 'Full Service-nél az autót itt kell hagyni.';
    end if;
    if v_ules is null or v_ules not in ('KARPIT', 'BOR', 'KARPIT_BOR') then
      raise exception 'Válaszd ki, milyen az ülés.';
    end if;
    if not exists (
      select 1 from public.full_service_pricing fp
       where fp.package_id = (p->>'package_id')::uuid
         and fp.category = (p->>'category')::vehicle_category
         and fp.price_huf is not null
         and not fp.requires_quote) then
      raise exception 'Ehhez az autóhoz a Full Service árát egyeztetni kell, kérjük, hívj minket.';
    end if;

    v_be := v_be || jsonb_build_object('scope', 'TELJES');

    if v_masnap then
      v_elvitel := v_nap + 1;
      while not public.munkanap(v_elvitel) loop
        v_elvitel := v_elvitel + 1;
        if v_elvitel > v_nap + 14 then
          raise exception 'A következő két hétben nincs olyan nap, amikor elvihetnéd.';
        end if;
      end loop;
      v_be := v_be || jsonb_build_object(
        'pick_up_date', v_elvitel,
        'pick_up_time', to_char(greatest(time '08:00',
                          (select min(w.starts) from public.work_windows(v_elvitel) w)), 'HH24:MI'));
    end if;
  end if;

  v_id := public.create_booking(v_be || jsonb_build_object('status', 'REQUESTED', 'source', 'ONLINE'));

  if v_full then
    update public.bookings set seat_material = v_ules where id = v_id;
    update public.booking_items
       set name_snapshot = public.full_service_nev(v_ules)
     where booking_id = v_id and kind = 'FULL_SERVICE';
    perform public.rebuild_booking_tasks(v_id);
  end if;

  if v_email is not null then
    update public.customers c
       set email = v_email
      from public.bookings b
     where b.id = v_id and c.id = b.customer_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.online_foglalas(jsonb) from public, anon;
grant execute on function public.online_foglalas(jsonb) to authenticated;

create or replace view public.v_online_kerelmek
with (security_invoker = on) as
select
  v.*,
  b.created_at as beerkezett,
  c.email      as ugyfel_email,
  (select count(*)::integer from public.bookings x
    where x.customer_id = v.customer_id and x.id <> v.id and x.status = 'COMPLETED') as korabbi_db,
  (select max(x.service_date) from public.bookings x
    where x.customer_id = v.customer_id and x.id <> v.id and x.status = 'COMPLETED') as utolso_nap,
  (select count(*)::integer from public.bookings x
    where x.customer_id = v.customer_id and x.status = 'NO_SHOW')                   as nem_jott_db,
  (select count(*)::integer from public.bookings x
    where x.customer_id = v.customer_id and x.status = 'CANCELLED_BY_CUSTOMER')     as lemondta_db,
  b.seat_material
from public.v_day_bookings v
join public.bookings  b on b.id = v.id
join public.customers c on c.id = v.customer_id
where v.status = 'REQUESTED'
  and v.last_day >= (now() at time zone 'Europe/Budapest')::date;

revoke all on public.v_online_kerelmek from anon;
grant select on public.v_online_kerelmek to authenticated;
