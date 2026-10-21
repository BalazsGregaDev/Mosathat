alter table public.contracts
  add column if not exists napi_limit integer
    check (napi_limit is null or napi_limit between 1 and 200);

create or replace view public.v_contracts
with (security_invoker = on) as
select
  ct.id,
  ct.company_id,
  co.name                                    as company_name,
  coalesce(ct.customer_id,
           (select c.id from public.customers c
             where c.company_id = ct.company_id order by c.created_at limit 1)) as customer_id,
  coalesce((select c.name from public.customers c where c.id = ct.customer_id), co.name)
                                             as customer_name,
  coalesce(ct.tax_number, co.tax_number)     as tax_number,
  ct.pickup_delivery,
  ct.pickup_delivery_fee_huf,
  ct.valid_from,
  ct.valid_until,
  ct.active,
  ct.notes,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'package_id',   cp.package_id,
             'package_code', pk.code,
             'package_name', pk.name,
             'size',         cp.size,
             'kind',         cp.kind,
             'price_huf',    cp.price_huf,
             'tier',         case when pk.code = 'START' then 'NORMAL' else 'PREMIUM' end)
           order by cp.kind, pk.sort_order, cp.size)
      from public.contract_prices cp
      join public.packages pk on pk.id = cp.package_id
     where cp.contract_id = ct.id
  ), '[]'::jsonb) as prices,
  (select count(*)::integer from public.customers c where c.company_id = ct.company_id) as ugyfelek,
  (select count(*)::integer from public.vehicles v
     join public.customers c on c.id = v.customer_id
    where c.company_id = ct.company_id)       as jarmuvek,
  ct.cycle_day,
  ct.fleet_cars,
  ct.napi_limit
from public.contracts ct
join public.companies co on co.id = ct.company_id;

create or replace function public.save_contract(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid := nullif(p->>'id','')::uuid;
  v_ceg     uuid := nullif(p->>'company_id','')::uuid;
  v_ugyfel  uuid := nullif(p->>'customer_id','')::uuid;
  v_kulcs   text;
  r         jsonb;
  v_csomag  uuid;
  v_csomagok uuid[];
  v_meret   contract_size;
  v_fajta   contract_kind;
  v_ar      integer;
  v_hozom   boolean := coalesce((p->>'pickup_delivery')::boolean, false);
  v_fordulo integer := nullif(p->>'cycle_day', '')::integer;
  v_limit   integer := nullif(p->>'napi_limit', '')::integer;
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;
  if v_fordulo is not null and (v_fordulo < 1 or v_fordulo > 28) then
    raise exception 'A fordulónap 1 és 28 között lehet.';
  end if;
  if v_limit is not null and (v_limit < 1 or v_limit > 200) then
    raise exception 'A napi limit 1 és 200 autó között lehet.';
  end if;

  if v_ceg is null and nullif(trim(p->>'company_name'), '') is not null then
    v_kulcs := public.ceg_kulcs(p->>'company_name');
    select id into v_ceg from public.companies where name_key = v_kulcs;
    if v_ceg is null then
      insert into public.companies (name, name_key) values (trim(p->>'company_name'), v_kulcs)
      returning id into v_ceg;
    end if;
  end if;

  if v_ceg is null and v_ugyfel is not null then
    select company_id into v_ceg from public.customers where id = v_ugyfel;
    if v_ceg is null then
      update public.customers set company_name = name where id = v_ugyfel
      returning company_id into v_ceg;
    end if;
  end if;

  if v_ceg is null and v_id is not null then
    select company_id into v_ceg from public.contracts where id = v_id;
  end if;

  if v_ceg is null then
    raise exception 'Válaszd ki, melyik céggel szerződtek.';
  end if;

  if nullif(trim(p->>'tax_number'), '') is not null then
    update public.companies set tax_number = trim(p->>'tax_number') where id = v_ceg;
  end if;

  if v_id is null then
    if exists (select 1 from public.contracts where company_id = v_ceg and active) then
      raise exception 'Ennek a cégnek már van élő szerződése. Azt kell szerkeszteni.';
    end if;
    insert into public.contracts (company_id, customer_id, tax_number, pickup_delivery,
                                  pickup_delivery_fee_huf, valid_until, notes, cycle_day, napi_limit)
    values (v_ceg, v_ugyfel,
            nullif(trim(p->>'tax_number'), ''),
            v_hozom,
            case when v_hozom then nullif(p->>'pickup_delivery_fee_huf','')::integer end,
            nullif(p->>'valid_until','')::date,
            nullif(trim(p->>'notes'), ''),
            coalesce(v_fordulo, 1),
            v_limit)
    returning id into v_id;
  else
    update public.contracts
       set company_id      = v_ceg,
           tax_number      = nullif(trim(p->>'tax_number'), ''),
           pickup_delivery = v_hozom,
           pickup_delivery_fee_huf =
             case when v_hozom then nullif(p->>'pickup_delivery_fee_huf','')::integer end,
           valid_until     = nullif(p->>'valid_until','')::date,
           notes           = nullif(trim(p->>'notes'), ''),
           cycle_day       = coalesce(v_fordulo, cycle_day),
           napi_limit      = case when p ? 'napi_limit' then v_limit else napi_limit end,
           updated_at      = now()
     where id = v_id;
    if not found then raise exception 'Nincs ilyen szerződés.'; end if;
  end if;

  delete from public.contract_prices where contract_id = v_id;

  for r in select * from jsonb_array_elements(coalesce(p->'prices', '[]'::jsonb))
  loop
    v_ar := nullif(r->>'price_huf', '')::integer;
    continue when v_ar is null or v_ar <= 0;

    v_meret := (r->>'size')::contract_size;
    v_fajta := coalesce(nullif(r->>'kind', '')::contract_kind, 'FLOTTA');

    v_csomag := coalesce(
      nullif(r->>'package_id', '')::uuid,
      (select id from public.packages where code = upper(r->>'package_code')));

    if v_csomag is not null then
      v_csomagok := array[v_csomag];
    elsif r->>'tier' = 'NORMAL' then
      v_csomagok := array(select id from public.packages where code = 'START');
    elsif r->>'tier' = 'PREMIUM' then
      v_csomagok := array(select id from public.packages where code in ('PREMIUM', 'ELIT'));
    else
      raise exception 'Az árnál hiányzik, melyik csomagra szól.';
    end if;

    insert into public.contract_prices (contract_id, package_id, size, kind, price_huf)
    select v_id, x, v_meret, v_fajta, v_ar from unnest(v_csomagok) x
    on conflict (contract_id, package_id, size, kind) do update set price_huf = excluded.price_huf;
  end loop;

  perform public.ceg_szamlazas_frissit(v_ceg);
  return v_id;
end;
$$;
grant execute on function public.save_contract(jsonb) to authenticated;

create or replace function public.nap_terhelese(p_nap date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select c.load_pct from public.day_capacity(p_nap) c), 0);
$$;

revoke all on function public.nap_terhelese(date) from public, anon, authenticated;

create or replace function public.ceg_nap_db(p_ceg uuid, p_nap date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.bookings b
    join public.customers c on c.id = b.customer_id
   where b.service_date = p_nap
     and (c.company_id = p_ceg or b.ceg_link_company = p_ceg)
     and b.status not in ('REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW');
$$;

revoke all on function public.ceg_nap_db(uuid, date) from public, anon, authenticated;

create or replace function public.ceg_limit_tele(p_ceg uuid, p_nap date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.ceg_nap_db(p_ceg, p_nap) >= ct.napi_limit
      from public.contracts ct
     where ct.id = public.ceg_szerzodes_aktiv(p_ceg, (now() at time zone 'Europe/Budapest')::date)
       and ct.napi_limit is not null), false);
$$;

revoke all on function public.ceg_limit_tele(uuid, date) from public, anon, authenticated;

create or replace function public.ceg_teli_napok(p_token text, p_tol date, p_ig date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ceg uuid := public.ceg_link_ceg(p_token);
  v_ma  date := (now() at time zone 'Europe/Budapest')::date;
  v_tol date := greatest(p_tol, v_ma);
  v_ig  date := least(p_ig, v_ma + 70);
  v_ki  jsonb := '[]'::jsonb;
  d     date;
begin
  if v_ceg is null or p_tol is null or p_ig is null or v_tol > v_ig then
    return v_ki;
  end if;
  d := v_tol;
  while d <= v_ig loop
    if public.munkanap(d) and (public.ceg_limit_tele(v_ceg, d) or public.nap_terhelese(d) >= 70) then
      v_ki := v_ki || to_jsonb(d::text);
    end if;
    d := d + 1;
  end loop;
  return v_ki;
end;
$$;

revoke all on function public.ceg_teli_napok(text, date, date) from public;
grant execute on function public.ceg_teli_napok(text, date, date) to anon, authenticated;

drop function if exists public.ceg_foglalas(text, jsonb);

create function public.ceg_foglalas(p_token text, p jsonb)
returns jsonb
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
  v_nap        date := nullif(p->>'service_date', '')::date;
  v_terhe      numeric;
  v_auto       boolean := false;
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

  if v_nap is not null then
    if public.ceg_limit_tele(v_ceg, v_nap) then
      raise exception 'Erre a napra a cég már nem foglalhat több autót. Kérjük, válassz másik napot.';
    end if;
    v_terhe := public.nap_terhelese(v_nap);
    if v_terhe >= 70 then
      raise exception 'Erre a napra már nincs szabad hely céges foglalásra. Kérjük, válassz másik napot.';
    end if;
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

  if coalesce(v_terhe, 0) <= 35 then
    perform public.online_keres_dontes(v_id, true);
    v_auto := true;
  end if;

  return jsonb_build_object('id', v_id, 'megerositve', v_auto);
end;
$$;

revoke all on function public.ceg_foglalas(text, jsonb) from public;
grant execute on function public.ceg_foglalas(text, jsonb) to anon, authenticated;

create or replace function public.patch_booking(p_booking_id uuid, p_patch jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_status booking_status;
  v_alap   jsonb;
  v_eltol  integer;
  v_tipus  text;
  v_kezd   text;
  v_hoz    text;
begin
  select status into v_status from public.bookings where id = p_booking_id;
  if v_status is null then
    raise exception 'Nincs ilyen foglalás.';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'Ez a foglalás le van zárva, már nem szerkeszthető.'
      using hint = 'Ha mégis módosítani kell, előbb vissza kell nyitni.';
  end if;

  v_alap := public.booking_patch_alap(p_booking_id);

  if p_patch ? 'service_date' and not (p_patch ? 'pick_up_date')
     and v_alap->>'pick_up_date' is not null then
    v_eltol := (p_patch->>'service_date')::date - (v_alap->>'service_date')::date;
    v_alap := v_alap || jsonb_build_object(
      'pick_up_date', ((v_alap->>'pick_up_date')::date + v_eltol)::text);
  end if;

  v_tipus := coalesce(nullif(p_patch->>'booking_type', ''), v_alap->>'booking_type');
  v_kezd  := coalesce(nullif(p_patch->>'start_time', ''), case when p_patch ? 'start_time' then null else v_alap->>'start_time' end);
  v_hoz   := coalesce(nullif(p_patch->>'drop_off_time', ''), case when p_patch ? 'drop_off_time' then null else v_alap->>'drop_off_time' end);

  if v_tipus = 'VAROS' and v_kezd is null then
    if v_hoz is null then
      raise exception 'Megvárós foglaláshoz meg kell adni, mikor kezdjük. Előbb írd be a kezdés idejét, utána állítsd Megvárósra.';
    end if;
    p_patch := p_patch || jsonb_build_object('start_time', v_hoz);
  elsif v_tipus <> 'VAROS' and (v_alap->>'booking_type') = 'VAROS' and v_hoz is null and v_kezd is not null then
    p_patch := p_patch || jsonb_build_object('drop_off_time', v_kezd);
  end if;

  return public.update_booking(p_booking_id, v_alap || p_patch);
end;
$$;
