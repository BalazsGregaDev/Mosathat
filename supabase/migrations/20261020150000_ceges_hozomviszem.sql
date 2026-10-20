create or replace function public.ceg_link_hozomviszem(p_ceg uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select ct.pickup_delivery from public.contracts ct
     where ct.id = public.ceg_szerzodes_aktiv(p_ceg, (now() at time zone 'Europe/Budapest')::date)), false);
$$;

revoke all on function public.ceg_link_hozomviszem(uuid) from public, anon, authenticated;

create or replace function public.ceg_link_adat(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ceg',         co.name,
    'uzenet',      l.message,
    'hozomviszem', public.ceg_link_hozomviszem(co.id),
    'csomagok',    coalesce((
      select jsonb_agg(distinct cp.package_id)
        from public.contract_prices cp
       where cp.contract_id = public.ceg_szerzodes_aktiv(co.id, (now() at time zone 'Europe/Budapest')::date)
         and cp.kind = 'FLOTTA'
         and cp.price_huf is not null), '[]'::jsonb))
    from public.company_booking_links l
    join public.companies co on co.id = l.company_id
   where l.company_id = public.ceg_link_ceg(p_token);
$$;

revoke all on function public.ceg_link_adat(text) from public;
grant execute on function public.ceg_link_adat(text) to anon, authenticated;

create or replace function public.ceg_foglalas(p_token text, p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ceg        uuid := public.ceg_link_ceg(p_token);
  v_ceg_nev    text;
  v_tel        text := public.phone_norm(p->>'customer_phone');
  v_nev        text := btrim(coalesce(p->>'customer_name', ''));
  v_email      text := nullif(btrim(coalesce(p->>'customer_email', '')), '');
  v_rendszam   text := upper(regexp_replace(coalesce(p->>'plate_raw', ''), '[^A-Za-z0-9]', '', 'g'));
  v_ugyfel     record;
  v_jarmu      record;
  v_be         jsonb;
  v_id         uuid;
  v_b          record;
  v_megj       text[] := '{}';
  v_ido        time;
  v_hv         boolean := p->>'booking_type' = 'HOZOMVISZEM';
begin
  if v_ceg is null then
    raise exception 'Ez a foglalási link már nem érvényes. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;
  if coalesce(p->>'weboldal', '') <> '' then
    raise exception 'A kérés nem küldhető el.';
  end if;

  if length(v_nev) > 80 then raise exception 'A név legfeljebb 80 karakter lehet.'; end if;
  if length(coalesce(p->>'customer_phone', '')) > 30 then raise exception 'A telefonszám túl hosszú.'; end if;
  if length(coalesce(v_email, '')) > 120 then raise exception 'Az e-mail cím túl hosszú.'; end if;
  if length(coalesce(p->>'plate_raw', '')) > 15 then raise exception 'A rendszám túl hosszú.'; end if;
  if length(coalesce(p->>'brand', '')) > 40 or length(coalesce(p->>'model', '')) > 40 then
    raise exception 'A márka és a modell legfeljebb 40 karakter lehet.';
  end if;
  if length(coalesce(p->>'notes', '')) > 1000 then raise exception 'A megjegyzés legfeljebb 1000 karakter lehet.'; end if;

  if not public.ceg_link_csomag(v_ceg, nullif(p->>'package_id', '')::uuid) then
    raise exception 'Ez a csomag nem szerepel a cég szerződésében.';
  end if;

  if v_hv and not public.ceg_link_hozomviszem(v_ceg) then
    raise exception 'A cég szerződésében nincs hozom-viszem.';
  end if;

  v_ido := coalesce(nullif(p->>'drop_off_time', ''), nullif(p->>'start_time', ''))::time;
  if v_ido is not null and (v_ido < time '07:30' or v_ido > time '17:00') then
    raise exception 'Céges foglalásnál 7:30 és 17:00 között lehet időpontot választani.';
  end if;

  if v_tel is not null and (
    select count(*) from public.bookings b
      join public.customers c on c.id = b.customer_id
     where b.ceg_link_company is not null and b.status = 'REQUESTED'
       and b.created_at > now() - interval '24 hours'
       and public.phone_norm(c.phone) = v_tel) >= 10 then
    raise exception 'Erről a telefonszámról már több kérés vár visszaigazolásra. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;

  if (select count(*) from public.bookings b
       where b.ceg_link_company = v_ceg and b.status = 'REQUESTED'
         and b.created_at > now() - interval '24 hours') >= 40 then
    raise exception 'Ehhez a céghez most túl sok kérés vár visszaigazolásra. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;

  if (select count(*) from public.bookings b
       where b.ceg_link_company is not null
         and b.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Most túl sok kérés érkezett. Kérjük, próbáld újra később, vagy hívj minket: %.', public.publikus_telefon();
  end if;

  select co.name into v_ceg_nev from public.companies co where co.id = v_ceg;

  select c.id, c.name, c.phone into v_ugyfel
    from public.customers c
   where v_tel is not null and public.phone_norm(c.phone) = v_tel
   limit 1;

  select v.id, v.brand, v.model, v.category, v.seats into v_jarmu
    from public.vehicles v
   where v_rendszam <> '' and v.plate_normalized = v_rendszam
   limit 1;

  v_be := jsonb_build_object(
    'category',         coalesce(v_jarmu.category::text, 'SZEMELYAUTO'),
    'scope',            'TELJES',
    'package_id',       p->'package_id',
    'full_service',     false,
    'seat_material',    null,
    'next_day_pick_up', false,
    'extras',           '[]'::jsonb,
    'pick_up_time',     p->'pick_up_time',
    'booking_type',     case when v_hv then 'LEADOS' else p->>'booking_type' end,
    'service_date',     p->'service_date',
    'start_time',       p->'start_time',
    'drop_off_time',    p->'drop_off_time',
    'customer_name',    to_jsonb(v_nev),
    'customer_phone',   p->'customer_phone',
    'plate_raw',        p->'plate_raw',
    'brand',            p->'brand',
    'model',            p->'model',
    'notes',            p->'notes');

  v_id := public.online_foglalas(v_be);

  if v_hv then
    update public.bookings set booking_type = 'HOZOMVISZEM' where id = v_id;
  end if;

  if v_ugyfel.id is not null then
    if v_ugyfel.name is distinct from v_nev then
      v_megj := v_megj || format('A kérésben megadott név: %s (az ügyfélkártyán: %s).', v_nev, v_ugyfel.name);
    end if;
    update public.customers set name = v_ugyfel.name, phone = v_ugyfel.phone where id = v_ugyfel.id;
  elsif v_email is not null then
    update public.customers c set email = v_email
      from public.bookings b
     where b.id = v_id and c.id = b.customer_id;
  end if;

  if v_jarmu.id is not null then
    if nullif(btrim(coalesce(p->>'brand', '')), '') is distinct from v_jarmu.brand
       and nullif(btrim(coalesce(p->>'brand', '')), '') is not null
       or nullif(btrim(coalesce(p->>'model', '')), '') is distinct from v_jarmu.model
       and nullif(btrim(coalesce(p->>'model', '')), '') is not null then
      v_megj := v_megj || format('A kérésben megadott jármű: %s %s (a nyilvántartásban: %s %s).',
        coalesce(p->>'brand', ''), coalesce(p->>'model', ''), coalesce(v_jarmu.brand, ''), coalesce(v_jarmu.model, ''));
    end if;
    update public.vehicles
       set brand = v_jarmu.brand, model = v_jarmu.model, category = v_jarmu.category, seats = v_jarmu.seats
     where id = v_jarmu.id;
  end if;

  select b.customer_id, b.vehicle_id, b.package_id, b.scope, b.full_service, b.booking_type, b.service_date
    into v_b
    from public.bookings b where b.id = v_id;

  if v_ugyfel.id is null then
    update public.customers set company_id = v_ceg where id = v_b.customer_id;
  end if;
  if v_jarmu.id is null then
    update public.vehicles set contract_kind = 'FLOTTA' where id = v_b.vehicle_id;
  end if;

  perform public.foglalas_tetelek_ir(
    v_id, v_b.package_id, coalesce(v_jarmu.category, 'SZEMELYAUTO'), 'TELJES', false,
    '[]'::jsonb, 0, 0, v_ceg, 'FLOTTA', v_b.booking_type, v_b.service_date);

  update public.bookings
     set request_email = v_email,
         ceg_link_company = v_ceg,
         internal_notes = concat_ws(E'\n', nullif(internal_notes, ''),
           format('Céges foglalási linkről érkezett (%s).', v_ceg_nev)
           || case when array_length(v_megj, 1) is null then ''
                   else ' ' || array_to_string(v_megj, ' ') end)
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.ceg_foglalas(text, jsonb) from public;
grant execute on function public.ceg_foglalas(text, jsonb) to anon, authenticated;
