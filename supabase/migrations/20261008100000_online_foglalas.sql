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

  v_id := public.create_booking(
    (p - 'customer_email' - 'status' - 'source' - 'pick_up_date'
       - 'company_id' - 'company_name' - 'contract_kind' - 'customer_id' - 'vehicle_id')
    || jsonb_build_object('status', 'REQUESTED', 'source', 'ONLINE'));

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
