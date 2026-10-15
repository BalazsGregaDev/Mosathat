create or replace function public.feladat_percek(p_booking uuid)
returns table (task_id uuid, perc numeric)
language plpgsql
stable
as $$
declare
  b          public.bookings%rowtype;
  v_kat      vehicle_category;
  v_csomag   numeric;
  v_k        numeric;
  v_bl       numeric;
  v_k_db     integer;
  v_b_db     integer;
  v_db       integer;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then return; end if;
  select v.category into v_kat from public.vehicles v where v.id = b.vehicle_id;

  select coalesce(sum(bi.work_minutes), 0) into v_csomag
    from public.booking_items bi where bi.booking_id = p_booking and bi.kind = 'PACKAGE';

  select count(*) filter (where t.area = 'KULSO'),
         count(*) filter (where t.area is distinct from 'KULSO'),
         count(*)
    into v_k_db, v_b_db, v_db
    from public.booking_tasks t where t.booking_id = p_booking and t.source = 'PACKAGE';

  select pp.duration_minutes into v_k from public.package_pricing pp
   where pp.package_id = b.package_id and pp.category = v_kat and pp.scope = 'KULSO';
  select pp.duration_minutes into v_bl from public.package_pricing pp
   where pp.package_id = b.package_id and pp.category = v_kat and pp.scope = 'BELSO';

  return query
  select t.id,
         case
           when v_db = 0 then 0::numeric
           when b.scope = 'TELJES' and coalesce(v_k, 0) > 0 and coalesce(v_bl, 0) > 0
                and v_k_db > 0 and v_b_db > 0 then
             case when t.area = 'KULSO'
                  then v_csomag * v_k / (v_k + v_bl) / v_k_db
                  else v_csomag * v_bl / (v_k + v_bl) / v_b_db end
           else v_csomag / v_db
         end
    from public.booking_tasks t
   where t.booking_id = p_booking and t.source = 'PACKAGE';

  return query
  select t.id, coalesce((
           select sum(bi.work_minutes)::numeric from public.booking_items bi
            where bi.booking_id = p_booking and bi.kind in ('EXTRA', 'FULL_SERVICE')
              and bi.name_snapshot = t.name), 0)
    from public.booking_tasks t
   where t.booking_id = p_booking and t.source = 'EXTRA';
end;
$$;

grant execute on function public.feladat_percek(uuid) to authenticated;

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
  v_napok     integer;
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

  with pipa as (
    select (t.done_at at time zone 'Europe/Budapest')::date as nap, fp.perc
      from public.booking_tasks t
      join public.feladat_percek(b.id) fp on fp.task_id = t.id
     where t.booking_id = b.id and t.done and t.done_at is not null
  )
  select coalesce(sum(perc) filter (where nap = p_day), 0), coalesce(sum(perc), 0)
    into v_napon, v_kesz
    from pipa;

  if v_napon > 0 then
    return v_napon;
  end if;
  if p_day < v_ma then
    return 0;
  end if;
  if not public.munkanap(p_day) then
    return 0;
  end if;

  v_maradek := greatest(b.planned_duration_minutes - v_kesz, 0);
  select count(*) into v_napok
    from generate_series(greatest(b.service_date, v_ma), b.last_day, interval '1 day') d
   where public.munkanap(d::date)
     and not exists (
       select 1 from public.booking_tasks t
        where t.booking_id = b.id and t.done
          and (t.done_at at time zone 'Europe/Budapest')::date = d::date);
  if v_napok = 0 then return 0; end if;
  return v_maradek / v_napok;
end;
$$;

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
  select count(*) into v_dolgozok from public.staff s where s.active and s.role = 'STAFF';

  for w in select ww.starts, ww.ends from public.work_windows(p_day) ww order by ww.starts loop
    v_t := w.starts;
    while v_t < w.ends loop
      v_v := least(v_t + interval '15 minutes', w.ends);
      v_kozep := v_t + (v_v - v_t) / 2;
      select count(distinct a.staff_id) into v_hianyzik
        from public.napi_tavollet(p_day) a
        join public.staff s on s.id = a.staff_id
       where s.active and s.role = 'STAFF'
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

create or replace function public.start_perc()
returns integer
language sql
stable
as $$
  select pp.duration_minutes
    from public.package_pricing pp
    join public.packages p on p.id = pp.package_id
   where p.code = 'START' and pp.category = 'SZEMELYAUTO' and pp.scope = 'TELJES'
   limit 1;
$$;

grant execute on function public.start_perc() to authenticated;

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
                when n.fleet_group is not null then 0
                else coalesce((select max(k.pos) from napi k
                                where k.pos is not null and k.napi_ido <= n.napi_ido), 0)
           end as hely,
           (n.pos is null)::integer as uj
      from napi n
  )
  select (to_jsonb(h) - 'napi_ido' - 'pos' - 'hely' - 'uj')
         || jsonb_build_object(
              'sorrend',     row_number() over (order by h.hely, h.uj, (h.fleet_group is null), h.napi_ido, h.plate_raw),
              'nap_szama',   (p_day - h.service_date) + 1,
              'napok_szama', (h.last_day - h.service_date) + 1,
              'napi_perc',   (select round(public.foglalas_napi_terhe(bb, p_day))::integer
                                from public.bookings bb where bb.id = h.id),
              'kezdve',      (select bb.actual_started_at  from public.bookings bb where bb.id = h.id),
              'befejezve',   (select bb.actual_finished_at from public.bookings bb where bb.id = h.id))
    from horgony h
   order by h.hely, h.uj, (h.fleet_group is null), h.napi_ido, h.plate_raw;
$$;

grant execute on function public.day_bookings(date) to authenticated;
