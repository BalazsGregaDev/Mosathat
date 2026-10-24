create or replace function public.foglalas_osszegzes(p_booking uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',                       b.id,
    'service_date',             b.service_date,
    'booking_type',             b.booking_type,
    'status',                   b.status,
    'start_at',                 b.start_at,
    'drop_off_at',              b.drop_off_at,
    'pick_up_at',               b.pick_up_at,
    'planned_duration_minutes', b.planned_duration_minutes,
    'scope',                    b.scope,
    'full_service',             b.full_service,
    'full_service_nev',         (select bi.name_snapshot from public.booking_items bi
                                  where bi.booking_id = b.id and bi.kind = 'FULL_SERVICE'
                                  order by bi.sort_order limit 1),
    'estimated_price_huf',      b.estimated_price_huf,
    'berlet',                   b.pass_item_id is not null and not coalesce(b.not_fitted, false),
    'notes',                    b.notes,
    'customer_name',            c.name,
    'plate_raw',                v.plate_raw,
    'brand',                    v.brand,
    'model',                    v.model,
    'category',                 v.category,
    'package_name',             p.name,
    'extras_summary',           (select string_agg(bi.name_snapshot, ', ' order by bi.sort_order)
                                   from public.booking_items bi
                                  where bi.booking_id = b.id and bi.kind = 'EXTRA'))
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    join public.vehicles  v on v.id = b.vehicle_id
    left join public.packages p on p.id = b.package_id
   where b.id = p_booking;
$$;

create or replace function public.foglalas_kep(p_booking uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nap',          b.service_date,
    'tipus',        case when b.booking_type = 'TOBBNAPOS' then 'LEADOS' else b.booking_type::text end,
    'kezdes',       to_char(b.start_at at time zone 'Europe/Budapest', 'HH24:MI'),
    'hozas',        to_char(b.drop_off_at at time zone 'Europe/Budapest', 'HH24:MI'),
    'kesz',         case when b.booking_type = 'VAROS' and b.start_at is not null and b.planned_duration_minutes > 0
                         then to_char((b.start_at + make_interval(mins => b.planned_duration_minutes)) at time zone 'Europe/Budapest', 'HH24:MI') end,
    'elvitel_nap',  (coalesce(b.pick_up_at, b.deadline_at) at time zone 'Europe/Budapest')::date,
    'elvitel',      to_char(coalesce(b.pick_up_at, b.deadline_at) at time zone 'Europe/Budapest', 'HH24:MI'),
    'csomag',       p.name,
    'csomag_en',    coalesce(nullif(btrim(p.name_en), ''), p.name),
    'full_service', b.full_service,
    'terjedelem',   b.scope,
    'kategoria',    v.category,
    'extrak',       coalesce((
                      select jsonb_agg(jsonb_build_object(
                               'nev', bi.name_snapshot,
                               'nev_en', coalesce(nullif(btrim(e.name_en), ''), bi.name_snapshot),
                               'db', bi.quantity)
                             order by bi.sort_order)
                        from public.booking_items bi
                        left join public.extras e on e.id = bi.ref_id
                       where bi.booking_id = b.id and bi.kind = 'EXTRA'), '[]'::jsonb),
    'rendszam',     upper(v.plate_raw),
    'marka',        v.brand,
    'modell',       v.model,
    'ar',           b.estimated_price_huf,
    'berlet',       b.pass_item_id is not null and not coalesce(b.not_fitted, false))
    from public.bookings b
    join public.vehicles v on v.id = b.vehicle_id
    left join public.packages p on p.id = b.package_id
   where b.id = p_booking;
$$;

create or replace function public.foglalasom_adat(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b          public.bookings%rowtype;
  v_ma       date := (now() at time zone 'Europe/Budapest')::date;
  v_allapot  text;
  v_lejar    timestamptz;
  v_ceges    boolean;
  v_lem      jsonb;
  v_kesz_ig  timestamptz;
  v_nap      date;
  v_zaras    time;
  v_kep      jsonb;
  v_eredeti  jsonb;
  v_nyitott  integer;
  v_nev      text;
  v_kesz     boolean;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then
    return jsonb_build_object('allapot', 'ISMERETLEN');
  end if;

  v_allapot := case
    when b.status = 'REQUESTED' then 'KERES'
    when b.status = 'READY' then 'KESZ'
    when b.status = 'COMPLETED' and b.not_fitted then 'NEM_FERT_BE'
    when b.status = 'COMPLETED' then 'ATVEVE'
    when b.status in ('CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP') then 'LEMONDVA'
    when b.status = 'REJECTED' then 'ELUTASITVA'
    when b.status = 'NO_SHOW' then 'NEM_JOTT'
    else 'VISSZAIGAZOLVA'
  end;

  v_lejar := case
    when b.status = 'COMPLETED' then coalesce(b.atvetel_at, b.updated_at) + interval '10 days'
    when b.status in ('CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'REJECTED', 'NO_SHOW')
      then ((b.service_date + 11)::timestamp at time zone 'Europe/Budapest')
  end;

  if v_lejar is not null and now() >= v_lejar then
    return jsonb_build_object('allapot', 'LEJART', 'nyelv', b.nyelv);
  end if;

  v_ceges := b.contract_kind is not null or b.ceg_link_company is not null;
  v_kesz  := b.status in ('READY', 'COMPLETED');

  if b.status = 'READY' then
    v_kesz_ig := coalesce(b.pick_up_at, b.deadline_at);
    if v_kesz_ig is null or v_kesz_ig < now() then
      v_kesz_ig := null;
      v_nap := greatest(b.service_date, v_ma);
      for i in 0..14 loop
        v_zaras := public.nap_zaras(v_nap);
        if v_zaras is not null and ((v_nap + v_zaras)::timestamp at time zone 'Europe/Budapest') > now() then
          v_kesz_ig := (v_nap + v_zaras)::timestamp at time zone 'Europe/Budapest';
          exit;
        end if;
        v_nap := v_nap + 1;
      end loop;
    end if;
  end if;

  v_lem := public.lemondas_ertekel(p_booking);
  v_kep := public.foglalas_kep(p_booking);
  select l.eredeti into v_eredeti from public.booking_links l where l.booking_id = p_booking;
  v_eredeti := coalesce(v_eredeti, v_kep);
  if v_ceges then
    v_kep := v_kep - 'ar';
    v_eredeti := v_eredeti - 'ar';
  end if;

  select count(*) into v_nyitott
    from public.booking_change_requests r
   where r.booking_id = p_booking and r.handled_at is null;

  select btrim(c.name) into v_nev from public.customers c where c.id = b.customer_id;

  return jsonb_build_object(
    'allapot',           v_allapot,
    'nyelv',             b.nyelv,
    'nev',               v_nev,
    'ceges',             v_ceges,
    'most',              v_kep,
    'eredeti',           v_eredeti,
    'ar',                case when v_ceges then null else jsonb_build_object(
                           'becsult',      b.estimated_price_huf,
                           'vegleges',     case when v_kesz then coalesce(b.final_price_huf, b.estimated_price_huf) end,
                           'felar_indok',  case when v_kesz then b.felar_indok end,
                           'kimaradt',     case when v_kesz then b.skip_note end,
                           'kimaradt_huf', case when v_kesz then b.skip_huf end,
                           'berlet',       b.pass_item_id is not null and not coalesce(b.not_fitted, false)) end,
    'kesz_ig',           v_kesz_ig,
    'atveve',            b.atvetel_at,
    'lejar',             v_lejar,
    'lemondhato',        v_lem->>'allapot' = 'LEMONDHATO',
    'lemondas_hatarido', v_lem->'hatarido',
    'modosithato',       b.status in ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'READY'),
    'nyitott_kerelem',   v_nyitott,
    'kerelmek',          coalesce((
                           select jsonb_agg(jsonb_build_object(
                                    'uzenet', r.uzenet, 'mikor', r.created_at, 'elintezve', r.handled_at)
                                  order by r.created_at)
                             from public.booking_change_requests r
                            where r.booking_id = p_booking), '[]'::jsonb));
end;
$$;

create table if not exists public.customer_booking_links (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  token       text not null unique check (token ~ '^[a-z0-9]{20,64}$'),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.staff(id) on delete set null
);

alter table public.customer_booking_links enable row level security;
revoke all on public.customer_booking_links from public, anon, authenticated;

alter table public.bookings add column if not exists berlet_link boolean not null default false;

create or replace function public.berlet_aktiv(p_customer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.passes p
                  where p.customer_id = p_customer and p.active
                    and p.valid_until >= public.budapest_ma());
$$;

create or replace function public.berlet_link_ugyfel(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.customer_id
    from public.customer_booking_links l
   where coalesce(p_token, '') ~ '^[a-z0-9]{20,64}$'
     and l.token = p_token
     and public.berlet_aktiv(l.customer_id);
$$;

create or replace function public.berlet_linkek()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_edit_customers() then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('customer_id', l.customer_id, 'token', l.token, 'created_at', l.created_at))
      from public.customer_booking_links l), '[]'::jsonb);
end;
$$;

create or replace function public.berlet_link_uj(p_customer uuid)
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
  if not public.can_edit_customers() then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  if not public.berlet_aktiv(p_customer) then
    raise exception 'Ennek az ügyfélnek nincs érvényes bérlete, ezért foglalási link sem készíthető.';
  end if;

  select l.token into v_regi from public.customer_booking_links l where l.customer_id = p_customer;

  insert into public.customer_booking_links (customer_id, token, created_at, created_by)
  values (p_customer, v_token, now(), (select s.id from public.staff s where s.id = auth.uid()))
  on conflict (customer_id) do update
    set token = excluded.token, created_at = now(), created_by = excluded.created_by;

  insert into public.audit_log (staff_id, entity, entity_id, action, before, after)
  values ((select s.id from public.staff s where s.id = auth.uid()), 'customer_booking_links', p_customer,
          case when v_regi is null then 'link_letrehozva' else 'link_csereve' end, null, null);

  return v_token;
end;
$$;

create or replace function public.berlet_link_adat(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with u as (select public.berlet_link_ugyfel(p_token) as id),
  tetel as (
    select p.id as pass_id, p.name as pass_name, p.valid_until, i.id, i.package_id, i.category, i.sort_order,
           coalesce(pk.name, 'Bármelyik csomag') as package_name,
           coalesce(pk.name_en, pk.name, 'Any package') as package_name_en,
           greatest(public.berlet_szabad(i.id), 0) as szabad
      from u
      join public.passes p on p.customer_id = u.id
      join public.pass_items i on i.pass_id = p.id
      left join public.packages pk on pk.id = i.package_id
     where p.active and p.valid_until >= public.budapest_ma()
  )
  select jsonb_build_object(
    'nev', (select btrim(c.name) from public.customers c where c.id = u.id),
    'berletek', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nev', x.pass_name, 'ervenyes', x.valid_until,
               'tetelek', (select jsonb_agg(jsonb_build_object(
                                    'csomag', t.package_name, 'csomag_en', t.package_name_en,
                                    'kategoria', t.category, 'maradt', t.szabad) order by t.sort_order)
                             from tetel t where t.pass_id = x.pass_id))
             order by x.valid_until)
        from (select distinct pass_id, pass_name, valid_until from tetel) x), '[]'::jsonb),
    'csomagok', coalesce((
      select jsonb_agg(pk.id order by pk.sort_order)
        from public.packages pk
       where pk.active
         and exists (select 1 from tetel t where t.szabad > 0 and (t.package_id is null or t.package_id = pk.id))), '[]'::jsonb))
    from u
   where u.id is not null;
$$;

create or replace function public.berlet_ajanlat(p_token text, p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ugyfel uuid := public.berlet_link_ugyfel(p_token);
  v_q      jsonb;
begin
  if v_ugyfel is null then
    raise exception 'Ez a foglalási link már nem érvényes. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;
  v_q := public.quote_booking(
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
      'customer_id',   v_ugyfel,
      'vehicle_id',    null,
      'contract_kind', null));
  return v_q - 'company_id' - 'contract_id' - 'contract_kind' - 'contract_price' - 'contract_prices';
end;
$$;

create or replace function public.berlet_foglalas(p_token text, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ugyfel   uuid := public.berlet_link_ugyfel(p_token);
  v_c        record;
  v_tel      text := btrim(coalesce(p->>'customer_phone', ''));
  v_nev      text := btrim(coalesce(p->>'customer_name', ''));
  v_email    text := nullif(btrim(coalesce(p->>'customer_email', '')), '');
  v_be       jsonb;
  v_id       uuid;
  v_b        record;
  v_kat      vehicle_category;
  v_megj     text[] := '{}';
  v_nap      date := nullif(p->>'service_date', '')::date;
  v_terhe    numeric;
  v_auto     boolean := false;
begin
  if v_ugyfel is null then
    raise exception 'Ez a foglalási link már nem érvényes. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;
  if coalesce(p->>'weboldal', '') <> '' then
    raise exception 'A kérés nem küldhető el.';
  end if;
  if length(v_nev) > 80 then raise exception 'A név legfeljebb 80 karakter lehet.'; end if;
  if length(v_tel) > 30 then raise exception 'A telefonszám túl hosszú.'; end if;
  if length(coalesce(v_email, '')) > 120 then raise exception 'Az e-mail cím túl hosszú.'; end if;
  if length(coalesce(p->>'plate_raw', '')) > 15 then raise exception 'A rendszám túl hosszú.'; end if;
  if length(coalesce(p->>'brand', '')) > 40 or length(coalesce(p->>'model', '')) > 40 then
    raise exception 'A márka és a modell legfeljebb 40 karakter lehet.';
  end if;
  if length(coalesce(p->>'notes', '')) > 1000 then raise exception 'A megjegyzés legfeljebb 1000 karakter lehet.'; end if;
  if v_nev = '' then raise exception 'Add meg a neved.'; end if;
  if public.phone_norm(v_tel) is null then raise exception 'Add meg a telefonszámod.'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Az e-mail cím formátuma nem jó.';
  end if;

  if (select count(*) from public.bookings b
       where b.berlet_link and b.customer_id = v_ugyfel and b.status = 'REQUESTED'
         and b.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Erről a linkről már több kérés vár visszaigazolásra. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;
  if (select count(*) from public.bookings b
       where b.berlet_link and b.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Most túl sok kérés érkezett. Kérjük, próbáld újra később, vagy hívj minket: %.', public.publikus_telefon();
  end if;

  select c.id, c.name, c.phone, c.email, c.company_id into v_c from public.customers c where c.id = v_ugyfel;

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
    'customer_name',    to_jsonb(v_c.name),
    'customer_phone',   to_jsonb(v_c.phone),
    'plate_raw',        p->'plate_raw',
    'brand',            p->'brand',
    'model',            p->'model',
    'notes',            p->'notes');

  v_id := public.online_foglalas(v_be);

  select b.customer_id, b.vehicle_id, b.package_id, b.scope, b.full_service, b.booking_type, b.service_date
    into v_b from public.bookings b where b.id = v_id;

  if v_b.customer_id is distinct from v_ugyfel then
    update public.vehicles set customer_id = v_ugyfel
     where id = v_b.vehicle_id and customer_id = v_b.customer_id
       and not exists (select 1 from public.bookings x where x.vehicle_id = v_b.vehicle_id and x.id <> v_id);
    update public.bookings set customer_id = v_ugyfel where id = v_id;
    delete from public.customers c
     where c.id = v_b.customer_id
       and not exists (select 1 from public.bookings x where x.customer_id = c.id)
       and not exists (select 1 from public.vehicles x where x.customer_id = c.id);
    select v.category into v_kat from public.vehicles v where v.id = v_b.vehicle_id;
    perform public.foglalas_tetelek_ir(
      v_id, v_b.package_id, v_kat, v_b.scope, v_b.full_service,
      public.booking_patch_alap(v_id)->'extras', 0, 0, v_c.company_id, null, v_b.booking_type, v_b.service_date);
  end if;
  update public.customers set name = v_c.name, phone = v_c.phone where id = v_ugyfel;

  if v_nev is distinct from btrim(v_c.name) then
    v_megj := v_megj || format('A kérésben megadott név: %s.', v_nev);
  end if;
  if public.phone_norm(v_tel) is distinct from public.phone_norm(v_c.phone) then
    v_megj := v_megj || format('A kérésben megadott telefonszám: %s.', v_tel);
  end if;

  if v_email is not null and nullif(btrim(coalesce(v_c.email, '')), '') is null then
    update public.customers set email = v_email where id = v_ugyfel;
  end if;

  update public.bookings
     set request_email = v_email,
         public_request = true,
         berlet_link = true,
         internal_notes = concat_ws(E'\n', nullif(internal_notes, ''),
           'Bérletes foglalási linkről érkezett.'
           || case when array_length(v_megj, 1) is null then '' else ' ' || array_to_string(v_megj, ' ') end)
   where id = v_id;

  if v_nap is not null then
    v_terhe := public.nap_terhelese(v_nap);
    if v_terhe <= 35 then
      perform public.online_keres_dontes(v_id, true);
      v_auto := true;
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'megerositve', v_auto);
end;
$$;

revoke all on function public.berlet_aktiv(uuid) from public, anon, authenticated;
revoke all on function public.berlet_link_ugyfel(text) from public, anon, authenticated;
revoke all on function public.berlet_linkek() from public, anon;
revoke all on function public.berlet_link_uj(uuid) from public, anon;
revoke all on function public.berlet_link_adat(text) from public;
revoke all on function public.berlet_ajanlat(text, jsonb) from public;
revoke all on function public.berlet_foglalas(text, jsonb) from public;
grant execute on function public.berlet_linkek() to authenticated;
grant execute on function public.berlet_link_uj(uuid) to authenticated;
grant execute on function public.berlet_link_adat(text) to anon, authenticated;
grant execute on function public.berlet_ajanlat(text, jsonb) to anon, authenticated;
grant execute on function public.berlet_foglalas(text, jsonb) to anon, authenticated;

create or replace function public.list_customers(p_q text default '', p_limit integer default 100)
returns setof public.v_customer_summary
language sql
stable
as $$
  with k as (
    select coalesce(trim(p_q), '') as nyers,
           public.ekezettelen(coalesce(trim(p_q), '')) as szoveg,
           case when coalesce(p_q, '') !~ '[[:alpha:]]'
                 and length(regexp_replace(coalesce(p_q, ''), '[^0-9]', '', 'g')) >= 3
                then public.phone_norm(p_q) end as tel,
           upper(regexp_replace(coalesce(p_q, ''), '[^A-Za-z0-9]', '', 'g')) as rendszam
  )
  select s.* from public.v_customer_summary s, k
   where k.nyers = ''
      or public.ekezettelen(s.name)         like '%' || k.szoveg || '%'
      or public.ekezettelen(s.company_name) like '%' || k.szoveg || '%'
      or (k.tel is not null and public.phone_norm(s.phone) like '%' || k.tel || '%')
      or (length(k.rendszam) >= 2 and exists (
        select 1 from public.vehicles v
         where v.customer_id = s.id
           and v.plate_normalized like '%' || k.rendszam || '%'))
   order by
     case when k.nyers <> '' and (public.ekezettelen(s.name) like k.szoveg || '%'
                                  or public.ekezettelen(s.company_name) like k.szoveg || '%') then 0 else 1 end,
     s.utolso desc nulls last, s.name
   limit greatest(coalesce(p_limit, 100), 1);
$$;
