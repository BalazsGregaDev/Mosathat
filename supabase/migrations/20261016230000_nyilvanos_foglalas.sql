alter table public.bookings
  add column if not exists request_email text
    check (request_email is null or length(request_email) <= 120);

alter table public.bookings
  add column if not exists public_request boolean not null default false;

create index if not exists bookings_public_request_idx
  on public.bookings (created_at) where public_request;

create or replace function public.foglalas_visszaigazolas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if new.status = 'CONFIRMED'
     and old.status = 'REQUESTED'
     and new.source = 'ONLINE' then
    select coalesce(nullif(trim(new.request_email), ''), nullif(trim(c.email), '')) into v_email
      from public.customers c
     where c.id = new.customer_id;
    if v_email is not null then
      insert into public.notifications (booking_id, kind, to_address)
      values (new.id, 'BOOKING_CONFIRMED', v_email);
    end if;
  end if;
  return new;
end;
$$;

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
  b.seat_material
from public.v_day_bookings v
join public.bookings  b on b.id = v.id
join public.customers c on c.id = v.customer_id
where v.status = 'REQUESTED'
  and v.last_day >= (now() at time zone 'Europe/Budapest')::date;

revoke all on public.v_online_kerelmek from anon;
grant select on public.v_online_kerelmek to authenticated;

create or replace function public.publikus_oldal()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'arculat',     (select s.arculat from public.shop_settings s limit 1),
    'arculat_mod', (select s.arculat_mod from public.shop_settings s limit 1),
    'lemondas_ora', coalesce((select s.online_lemondas_ora from public.shop_settings s limit 1), 24),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description,
               'includes_package_id', p.includes_package_id, 'sort_order', p.sort_order, 'active', p.active)
             order by p.sort_order)
        from public.packages p
       where p.active), '[]'::jsonb),
    'packagePricing', coalesce((
      select jsonb_agg(jsonb_build_object(
               'package_id', pp.package_id, 'category', pp.category, 'scope', pp.scope,
               'price_huf', pp.price_huf, 'duration_minutes', pp.duration_minutes,
               'requires_quote', pp.requires_quote))
        from public.package_pricing pp
        join public.packages p on p.id = pp.package_id and p.active), '[]'::jsonb),
    'fullServicePricing', coalesce((
      select jsonb_agg(jsonb_build_object(
               'package_id', fp.package_id, 'category', fp.category, 'price_huf', fp.price_huf,
               'included_seats', fp.included_seats, 'requires_quote', fp.requires_quote))
        from public.full_service_pricing fp
        join public.packages p on p.id = fp.package_id and p.active), '[]'::jsonb),
    'extras', coalesce((
      select jsonb_agg(to_jsonb(e) - 'created_at' - 'updated_at' order by e.sort_order)
        from public.extras e
       where e.active), '[]'::jsonb),
    'packageItems', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.area, m.sort_order, m.package_sort)
        from public.v_package_matrix m), '[]'::jsonb),
    'packageExtras', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.area, x.sort_order)
        from public.v_package_extra x), '[]'::jsonb));
$$;

revoke all on function public.publikus_oldal() from public;
grant execute on function public.publikus_oldal() to anon, authenticated;

create or replace function public.publikus_nap(p_nap date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ma date := (now() at time zone 'Europe/Budapest')::date;
begin
  if p_nap is null or p_nap < v_ma or p_nap > v_ma + 70 then
    return jsonb_build_object('foglalasok', '[]'::jsonb, 'savok', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'foglalasok', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', left(md5(coalesce(b->>'id', '') || p_nap::text), 12),
               'status', b->>'status',
               'booking_type', b->>'booking_type',
               'service_date', b->>'service_date',
               'last_day', b->>'last_day',
               'start_at', b->>'start_at',
               'drop_off_at', b->>'drop_off_at',
               'pick_up_at', b->>'pick_up_at',
               'deadline_at', b->>'deadline_at',
               'planned_duration_minutes', (b->>'planned_duration_minutes')::integer,
               'rest_minutes', (b->>'rest_minutes')::integer,
               'napi_perc', (b->>'napi_perc')::integer,
               'kezdve', b->>'kezdve',
               'befejezve', b->>'befejezve',
               'tentative', coalesce((b->>'tentative')::boolean, false),
               'not_fitted', coalesce((b->>'not_fitted')::boolean, false)))
        from public.day_bookings(p_nap) b), '[]'::jsonb),
    'savok', coalesce((
      select jsonb_agg(jsonb_build_object('starts', l.starts, 'ends', l.ends, 'lanes', l.lanes)
             order by l.starts)
        from public.day_lanes(p_nap) l), '[]'::jsonb));
end;
$$;

revoke all on function public.publikus_nap(date) from public;
grant execute on function public.publikus_nap(date) to anon, authenticated;

create or replace function public.publikus_ajanlat(p jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.quote_booking(
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
      'company_id',    null,
      'company_name',  null,
      'customer_id',   null,
      'vehicle_id',    null,
      'contract_kind', null));
$$;

revoke all on function public.publikus_ajanlat(jsonb) from public;
grant execute on function public.publikus_ajanlat(jsonb) to anon, authenticated;

create or replace function public.publikus_foglalas(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tel        text := public.phone_norm(p->>'customer_phone');
  v_nev        text := btrim(coalesce(p->>'customer_name', ''));
  v_email      text := nullif(btrim(coalesce(p->>'customer_email', '')), '');
  v_rendszam   text := upper(regexp_replace(coalesce(p->>'plate_raw', ''), '[^A-Za-z0-9]', '', 'g'));
  v_ugyfel     record;
  v_jarmu      record;
  v_be         jsonb;
  v_id         uuid;
  v_megj       text[] := '{}';
begin
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
     where b.public_request and b.status = 'REQUESTED'
       and b.created_at > now() - interval '24 hours'
       and public.phone_norm(c.phone) = v_tel) >= 3 then
    raise exception 'Erről a telefonszámról már több kérés vár visszaigazolásra. Kérjük, hívj minket: +36 1 506 0420.';
  end if;

  if (select count(*) from public.bookings b
       where b.public_request
         and b.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Most túl sok kérés érkezett. Kérjük, próbáld újra később, vagy hívj minket: +36 1 506 0420.';
  end if;

  select c.id, c.name, c.phone into v_ugyfel
    from public.customers c
   where v_tel is not null and public.phone_norm(c.phone) = v_tel
   limit 1;

  select v.id, v.brand, v.model, v.category, v.seats, v.contract_kind into v_jarmu
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
       set brand = v_jarmu.brand, model = v_jarmu.model, category = v_jarmu.category,
           seats = v_jarmu.seats, contract_kind = v_jarmu.contract_kind
     where id = v_jarmu.id;
  end if;

  update public.bookings
     set request_email = v_email,
         public_request = true,
         internal_notes = case
           when array_length(v_megj, 1) is null then internal_notes
           else concat_ws(E'\n', nullif(internal_notes, ''), 'Online kérés: ' || array_to_string(v_megj, ' '))
         end
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.publikus_foglalas(jsonb) from public;
grant execute on function public.publikus_foglalas(jsonb) to anon, authenticated;
