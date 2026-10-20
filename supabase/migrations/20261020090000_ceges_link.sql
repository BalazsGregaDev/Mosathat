create table if not exists public.company_booking_links (
  company_id  uuid primary key references public.companies(id) on delete cascade,
  token       text unique check (token is null or token ~ '^[a-z0-9]{20,64}$'),
  message     text check (message is null or char_length(message) <= 1000),
  created_at  timestamptz,
  created_by  uuid references public.staff(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.company_booking_links enable row level security;
revoke all on public.company_booking_links from public, anon, authenticated;

alter table public.bookings
  add column if not exists ceg_link_company uuid references public.companies(id) on delete set null;

create index if not exists bookings_ceg_link_idx
  on public.bookings (created_at) where ceg_link_company is not null;

create or replace view public.v_online_kerelmek
with (security_invoker = on) as
select
  v.*,
  b.created_at as beerkezett,
  coalesce(nullif(trim(b.request_email), ''), c.email) as ugyfel_email,
  (select count(*)::integer from public.bookings x
    where x.customer_id = v.customer_id and x.id <> v.id and x.status = 'COMPLETED') as korabbi_db,
  (select max(x.service_date) from public.bookings x
    where x.customer_id = v.customer_id and x.id <> v.id and x.status = 'COMPLETED') as utolso_nap,
  (select count(*)::integer from public.bookings x
    where x.customer_id = v.customer_id and x.status = 'NO_SHOW')                   as nem_jott_db,
  (select count(*)::integer from public.bookings x
    where x.customer_id = v.customer_id and x.status = 'CANCELLED_BY_CUSTOMER')     as lemondta_db,
  b.seat_material,
  b.ceg_link_company,
  (select co.name from public.companies co where co.id = b.ceg_link_company) as ceg_link_nev
from public.v_day_bookings v
join public.bookings  b on b.id = v.id
join public.customers c on c.id = v.customer_id
where v.status = 'REQUESTED'
  and v.last_day >= (now() at time zone 'Europe/Budapest')::date;

revoke all on public.v_online_kerelmek from anon;
grant select on public.v_online_kerelmek to authenticated;

create or replace function public.ceg_link_ceg(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.company_id
    from public.company_booking_links l
   where coalesce(p_token, '') ~ '^[a-z0-9]{20,64}$'
     and l.token = p_token
     and public.ceg_szerzodes_aktiv(l.company_id, (now() at time zone 'Europe/Budapest')::date) is not null;
$$;

revoke all on function public.ceg_link_ceg(text) from public, anon, authenticated;

create or replace function public.ceg_linkek()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ma date := (now() at time zone 'Europe/Budapest')::date;
begin
  if not public.is_owner() then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'company_id',  co.id,
             'name',        co.name,
             'token',       l.token,
             'message',     l.message,
             'created_at',  l.created_at,
             'valid_until', ct.valid_until)
           order by lower(co.name))
      from public.companies co
      join public.contracts ct on ct.id = public.ceg_szerzodes_aktiv(co.id, v_ma)
      left join public.company_booking_links l on l.company_id = co.id), '[]'::jsonb);
end;
$$;

revoke all on function public.ceg_linkek() from public, anon;
grant execute on function public.ceg_linkek() to authenticated;

create or replace function public.ceg_link_uj(p_company uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_regi  text;
  v_token text := left(md5(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text), 24);
begin
  if not public.is_owner() then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  if public.ceg_szerzodes_aktiv(p_company, (now() at time zone 'Europe/Budapest')::date) is null then
    raise exception 'Ennek a cégnek nincs érvényes szerződése, ezért foglalási link sem készíthető.';
  end if;

  select l.token into v_regi from public.company_booking_links l where l.company_id = p_company;

  insert into public.company_booking_links (company_id, token, created_at, created_by, updated_at)
  values (p_company, v_token, now(), auth.uid(), now())
  on conflict (company_id) do update
    set token = excluded.token, created_at = now(), created_by = auth.uid(), updated_at = now();

  insert into public.audit_log (staff_id, entity, entity_id, action, before, after)
  values ((select s.id from public.staff s where s.id = auth.uid()), 'company_booking_links', p_company,
          case when v_regi is null then 'link_letrehozva' else 'link_csereve' end,
          null, null);

  return v_token;
end;
$$;

revoke all on function public.ceg_link_uj(uuid) from public, anon;
grant execute on function public.ceg_link_uj(uuid) to authenticated;

create or replace function public.ceg_link_uzenet(p_company uuid, p_uzenet text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uzenet text := nullif(btrim(coalesce(p_uzenet, '')), '');
begin
  if not public.is_owner() then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  if char_length(coalesce(v_uzenet, '')) > 1000 then
    raise exception 'Az üzenet legfeljebb 1000 karakter lehet.';
  end if;
  if not exists (select 1 from public.companies co where co.id = p_company) then
    raise exception 'Nincs ilyen cég.';
  end if;

  insert into public.company_booking_links (company_id, message, updated_at)
  values (p_company, v_uzenet, now())
  on conflict (company_id) do update
    set message = excluded.message, updated_at = now();
end;
$$;

revoke all on function public.ceg_link_uzenet(uuid, text) from public, anon;
grant execute on function public.ceg_link_uzenet(uuid, text) to authenticated;

create or replace function public.ceg_link_adat(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ceg',    co.name,
    'uzenet', l.message,
    'arak',   coalesce((
      select jsonb_agg(jsonb_build_object(
               'package_id', cp.package_id, 'size', cp.size, 'price_huf', cp.price_huf))
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

create or replace function public.ceg_ajanlat(p_token text, p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ceg uuid := public.ceg_link_ceg(p_token);
begin
  if v_ceg is null then
    raise exception 'Ez a foglalási link már nem érvényes. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;
  return public.quote_booking(
    jsonb_build_object(
      'package_id',    p->'package_id',
      'category',      p->'category',
      'scope',         p->'scope',
      'full_service',  coalesce(p->'full_service', 'false'::jsonb),
      'extras',        coalesce(p->'extras', '[]'::jsonb),
      'booking_type',  p->'booking_type',
      'service_date',  p->'service_date',
      'surcharge_pct', 0,
      'surcharge_fix', 0,
      'company_id',    v_ceg,
      'company_name',  null,
      'customer_id',   null,
      'vehicle_id',    null,
      'contract_kind', 'FLOTTA'));
end;
$$;

revoke all on function public.ceg_ajanlat(text, jsonb) from public;
grant execute on function public.ceg_ajanlat(text, jsonb) to anon, authenticated;

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
    'category',         p->'category',
    'scope',            p->'scope',
    'package_id',       p->'package_id',
    'full_service',     coalesce(p->'full_service', 'false'::jsonb),
    'seat_material',    p->'seat_material',
    'next_day_pick_up', coalesce(p->'next_day_pick_up', 'false'::jsonb),
    'extras',           coalesce(p->'extras', '[]'::jsonb),
    'pick_up_time',     p->'pick_up_time',
    'booking_type',     p->'booking_type',
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
    v_id, v_b.package_id, (p->>'category')::vehicle_category, v_b.scope, v_b.full_service,
    coalesce(p->'extras', '[]'::jsonb), 0, 0, v_ceg, 'FLOTTA', v_b.booking_type, v_b.service_date);

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

create or replace function public.online_keres_dontes(p_id uuid, p_elfogad boolean)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_b record;
begin
  select b.status, b.customer_id, b.vehicle_id, b.ceg_link_company into v_b
    from public.bookings b where b.id = p_id for update;
  if v_b.status is null then
    raise exception 'Nincs ilyen foglalás.';
  end if;
  if v_b.status <> 'REQUESTED' then
    return v_b.status::text;
  end if;
  perform public.set_booking_status(
    p_id,
    case when p_elfogad then 'CONFIRMED' else 'REJECTED' end::booking_status,
    null,
    true);
  if p_elfogad and v_b.ceg_link_company is not null then
    update public.customers set company_id = v_b.ceg_link_company
     where id = v_b.customer_id and company_id is distinct from v_b.ceg_link_company;
    update public.vehicles set contract_kind = 'FLOTTA'
     where id = v_b.vehicle_id and contract_kind is distinct from 'FLOTTA';
  end if;
  return 'OK';
end;
$$;

revoke all on function public.online_keres_dontes(uuid, boolean) from public, anon;
grant execute on function public.online_keres_dontes(uuid, boolean) to authenticated;
