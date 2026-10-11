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
  v_hatarido time := nullif(p->>'pick_up_time', '')::time;
  v_aznap   boolean;
  v_legkesobb time;
  v_elvitel date;
  v_be      jsonb;
  v_b       record;
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

  v_aznap := v_hatarido is not null and v_tipus = 'LEADOS' and not (v_full and v_masnap);
  if v_aznap then
    v_legkesobb := least(time '17:00', (select max(w.ends) from public.work_windows(v_nap) w));
    if v_hatarido > v_legkesobb then
      raise exception 'A határidő legkésőbb % lehet.', to_char(v_legkesobb, 'FMHH24:MI');
    end if;
    v_be := v_be || jsonb_build_object('pick_up_time', to_char(v_hatarido, 'HH24:MI'));
  end if;

  v_id := public.create_booking(v_be || jsonb_build_object('status', 'REQUESTED', 'source', 'ONLINE'));

  if v_aznap then
    select b.drop_off_at + make_interval(mins => b.planned_duration_minutes) as kesz, b.pick_up_at
      into v_b
      from public.bookings b where b.id = v_id;
    if v_b.kesz > v_b.pick_up_at then
      raise exception 'Ez a határidő túl korai: a munka legkorábban % körül készül el.',
        to_char(v_b.kesz at time zone 'Europe/Budapest', 'FMHH24:MI');
    end if;
  end if;

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
