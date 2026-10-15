create or replace function public.elerheto_perc(b public.bookings, p_day date)
returns numeric
language plpgsql
stable
as $$
declare
  v_ma    date := (now() at time zone 'Europe/Budapest')::date;
  v_tol   time := time '00:00';
  v_ig    time := time '23:59:59';
  v_hozza timestamptz := coalesce(b.drop_off_at, b.start_at);
  v_viszi timestamptz := coalesce(b.pick_up_at, b.deadline_at);
  v_perc  numeric := 0;
  w       record;
begin
  if p_day < v_ma then return 0; end if;
  if v_hozza is not null and (v_hozza at time zone 'Europe/Budapest')::date = p_day then
    v_tol := (v_hozza at time zone 'Europe/Budapest')::time;
  end if;
  if p_day = v_ma then
    v_tol := greatest(v_tol, (now() at time zone 'Europe/Budapest')::time);
  end if;
  if v_viszi is not null and (v_viszi at time zone 'Europe/Budapest')::date = p_day then
    v_ig := (v_viszi at time zone 'Europe/Budapest')::time;
  end if;

  for w in select ww.starts, ww.ends from public.work_windows(p_day) ww loop
    if least(w.ends, v_ig) > greatest(w.starts, v_tol) then
      v_perc := v_perc + extract(epoch from (least(w.ends, v_ig) - greatest(w.starts, v_tol))) / 60;
    end if;
  end loop;
  return v_perc;
end;
$$;

grant execute on function public.elerheto_perc(public.bookings, date) to authenticated;

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

create or replace function public.booking_not_fitted(p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
begin
  if public.my_role() is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Nincs ilyen foglalás.'; end if;
  if b.status in ('COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW', 'REJECTED') then
    raise exception 'Ez a foglalás már le van zárva vagy törölve.';
  end if;

  update public.bookings
     set final_price_huf = 0, not_fitted = true, updated_at = now()
   where id = p_booking_id;
  perform public.set_booking_status(p_booking_id, 'COMPLETED', 'Nem fért be — 0 Ft-tal lezárva.');
end;
$$;

grant execute on function public.booking_not_fitted(uuid) to authenticated;
