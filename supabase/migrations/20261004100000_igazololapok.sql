create or replace function public.sheet_alap_oszlopok()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(
    jsonb_build_object('key', 'DATUM',    'label', 'Dátum',         'visible', true),
    jsonb_build_object('key', 'RENDSZAM', 'label', 'Rendszám',      'visible', true),
    jsonb_build_object('key', 'KM',       'label', 'Km óra állás',  'visible', true),
    jsonb_build_object('key', 'NETTO',    'label', 'Nettó ár',      'visible', true),
    jsonb_build_object('key', 'NEV',      'label', 'Név',           'visible', true),
    jsonb_build_object('key', 'ALAIRAS',  'label', 'Aláírás',       'visible', true));
$$;

create table if not exists public.company_sheet_settings (
  company_id  uuid primary key references public.companies(id) on delete cascade,
  columns     jsonb not null default public.sheet_alap_oszlopok(),
  footer_text text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.company_sheets (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  month      date not null check (extract(day from month) = 1),
  closed_at  timestamptz,
  closed_by  uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, month)
);

create table if not exists public.company_sheet_rows (
  id         uuid primary key default gen_random_uuid(),
  sheet_id   uuid not null references public.company_sheets(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  day        date not null,
  plate      text,
  km         integer check (km is null or km >= 0),
  net_huf    integer,
  name       text,
  extra      jsonb not null default '{}'::jsonb,
  signature  text,
  signed_at  timestamptz,
  created_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_sheet_rows_foglalas
  on public.company_sheet_rows (booking_id) where booking_id is not null;
create index if not exists company_sheet_rows_lap on public.company_sheet_rows (sheet_id, day);

alter table public.company_sheet_settings enable row level security;
alter table public.company_sheets         enable row level security;
alter table public.company_sheet_rows     enable row level security;

drop policy if exists company_sheet_settings_olvas on public.company_sheet_settings;
create policy company_sheet_settings_olvas on public.company_sheet_settings
  for select to authenticated using (public.is_staff());
drop policy if exists company_sheets_olvas on public.company_sheets;
create policy company_sheets_olvas on public.company_sheets
  for select to authenticated using (public.is_staff());
drop policy if exists company_sheet_rows_olvas on public.company_sheet_rows;
create policy company_sheet_rows_olvas on public.company_sheet_rows
  for select to authenticated using (public.is_staff());

create or replace function public.sheet_oszlopok(p_company uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(
    (select s.columns from public.company_sheet_settings s where s.company_id = p_company),
    public.sheet_alap_oszlopok());
$$;

create or replace function public.sheet_kell(p_company uuid)
returns boolean
language sql
stable
as $$
  select p_company is not null and (
    public.ceg_szerzodes_aktiv(p_company) is not null
    or exists (select 1 from public.customers c
                where c.company_id = p_company and c.billing_kind = 'BERLETES'));
$$;

create or replace function public.sheet_honap_nev(p_month date)
returns text
language sql
immutable
as $$ select to_char(p_month, 'YYYY. MM.') $$;

create or replace function public.sheet_detail(p_company uuid, p_month date)
returns jsonb
language sql
stable
as $$
  with honap as (select date_trunc('month', p_month)::date as m),
  lap as (
    select s.* from public.company_sheets s, honap
     where s.company_id = p_company and s.month = honap.m
  )
  select jsonb_build_object(
    'company', (select jsonb_build_object('id', co.id, 'name', co.name, 'tax_number', co.tax_number)
                  from public.companies co where co.id = p_company),
    'month',   (select m from honap),
    'sheet',   (select jsonb_build_object(
                  'id', l.id, 'closed_at', l.closed_at,
                  'closed_by_name', (select st.full_name from public.staff st where st.id = l.closed_by))
                  from lap l),
    'columns', public.sheet_oszlopok(p_company),
    'footer_text', (select s.footer_text from public.company_sheet_settings s
                     where s.company_id = p_company),
    'prices',  coalesce((
       select v.prices from public.v_contracts v
        where v.id = public.ceg_szerzodes_aktiv(p_company)), '[]'::jsonb),
    'rows',    coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', r.id, 'booking_id', r.booking_id, 'day', r.day, 'plate', r.plate,
                'km', r.km, 'net_huf', r.net_huf, 'name', r.name, 'extra', r.extra,
                'signature', r.signature, 'signed_at', r.signed_at)
              order by r.day, r.created_at)
         from public.company_sheet_rows r join lap l on l.id = r.sheet_id), '[]'::jsonb),
    'months',  coalesce((
       select jsonb_agg(jsonb_build_object(
                'month', s.month, 'closed', s.closed_at is not null,
                'rows', (select count(*) from public.company_sheet_rows r where r.sheet_id = s.id))
              order by s.month desc)
         from public.company_sheets s where s.company_id = p_company), '[]'::jsonb)
  );
$$;

grant execute on function public.sheet_detail(uuid, date) to authenticated;

create or replace function public.sheet_for_booking(p_booking_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'company_id',   c.company_id,
    'company_name', co.name,
    'kell',         public.sheet_kell(c.company_id),
    'columns',      public.sheet_oszlopok(c.company_id),
    'closed',       exists (select 1 from public.company_sheets s
                             where s.company_id = c.company_id
                               and s.month = date_trunc('month', coalesce(r.day, b.last_day))::date
                               and s.closed_at is not null),
    'row', coalesce(
      (select jsonb_build_object(
                'id', r.id, 'booking_id', r.booking_id, 'day', r.day, 'plate', r.plate,
                'km', r.km, 'net_huf', r.net_huf, 'name', r.name, 'extra', r.extra,
                'signature', r.signature, 'signed_at', r.signed_at)
         where r.id is not null),
      jsonb_build_object(
        'id', null, 'booking_id', b.id, 'day', b.last_day, 'plate', v.plate_raw,
        'km', null,
        'net_huf', round(coalesce(b.final_price_huf, b.estimated_price_huf) / 1.27)::integer,
        'name', nullif(c.name, 'Névtelen'), 'extra', '{}'::jsonb,
        'signature', null, 'signed_at', null))
  )
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  join public.vehicles  v on v.id = b.vehicle_id
  left join public.companies co on co.id = c.company_id
  left join public.company_sheet_rows r on r.booking_id = b.id
  where b.id = p_booking_id;
$$;

grant execute on function public.sheet_for_booking(uuid) to authenticated;

create or replace function public.sheet_row_save(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid := nullif(p->>'id', '')::uuid;
  v_booking uuid := nullif(p->>'booking_id', '')::uuid;
  v_ceg     uuid := nullif(p->>'company_id', '')::uuid;
  v_nap     date := nullif(p->>'day', '')::date;
  v_honap   date;
  v_lap     uuid;
  v_zarva   timestamptz;
  v_regi_ceg   uuid;
  v_regi_zarva timestamptz;
  v_alairas text := nullif(p->>'signature', '');
begin
  if public.my_role() is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  if v_nap is null then
    raise exception 'Add meg a dátumot.';
  end if;
  if v_alairas is not null and length(v_alairas) > 400000 then
    raise exception 'Az aláírás képe túl nagy.';
  end if;

  if v_id is null and v_booking is not null then
    select r.id into v_id from public.company_sheet_rows r where r.booking_id = v_booking;
  end if;
  if v_id is not null then
    select s.company_id, s.closed_at into v_regi_ceg, v_regi_zarva
      from public.company_sheet_rows r join public.company_sheets s on s.id = r.sheet_id
     where r.id = v_id;
    if not found then
      raise exception 'Nincs ilyen sor.';
    end if;
    if v_regi_zarva is not null then
      raise exception 'Ez a lap le van zárva, már nem írható.'
        using hint = 'Ha mégis javítani kell, a tulajdonos újranyithatja.';
    end if;
    v_ceg := coalesce(v_ceg, v_regi_ceg);
  end if;

  if v_ceg is null and v_booking is not null then
    select c.company_id into v_ceg
      from public.bookings b join public.customers c on c.id = b.customer_id
     where b.id = v_booking;
  end if;
  if v_ceg is null then
    raise exception 'Ehhez a foglaláshoz nem tartozik cég, ezért igazolólap sem.';
  end if;

  v_honap := date_trunc('month', v_nap)::date;
  insert into public.company_sheets (company_id, month)
  values (v_ceg, v_honap)
  on conflict (company_id, month) do nothing;
  select s.id, s.closed_at into v_lap, v_zarva
    from public.company_sheets s where s.company_id = v_ceg and s.month = v_honap;
  if v_zarva is not null then
    raise exception 'A % havi lap le van zárva.', public.sheet_honap_nev(v_honap)
      using hint = 'Ha mégis bele kell írni, a tulajdonos újranyithatja.';
  end if;

  if v_id is null then
    insert into public.company_sheet_rows
      (sheet_id, booking_id, day, plate, km, net_huf, name, extra, signature, signed_at, created_by)
    values (v_lap, v_booking, v_nap,
            nullif(trim(p->>'plate'), ''),
            nullif(p->>'km', '')::integer,
            nullif(p->>'net_huf', '')::integer,
            nullif(trim(p->>'name'), ''),
            coalesce(p->'extra', '{}'::jsonb),
            v_alairas,
            case when v_alairas is not null then now() end,
            auth.uid())
    returning id into v_id;
  else
    update public.company_sheet_rows
       set sheet_id = v_lap,
           day      = v_nap,
           plate    = nullif(trim(p->>'plate'), ''),
           km       = nullif(p->>'km', '')::integer,
           net_huf  = nullif(p->>'net_huf', '')::integer,
           name     = nullif(trim(p->>'name'), ''),
           extra    = coalesce(p->'extra', extra),
           signature = case when p ? 'signature' then v_alairas else signature end,
           signed_at = case when p ? 'signature'
                            then case when v_alairas is null then null else now() end
                            else signed_at end,
           updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.sheet_row_delete(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_zarva timestamptz;
begin
  if public.my_role() is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  select s.closed_at into v_zarva
    from public.company_sheet_rows r join public.company_sheets s on s.id = r.sheet_id
   where r.id = p_id;
  if not found then
    raise exception 'Nincs ilyen sor.';
  end if;
  if v_zarva is not null then
    raise exception 'Ez a lap le van zárva, már nem írható.';
  end if;
  delete from public.company_sheet_rows where id = p_id;
end;
$$;

grant execute on function public.sheet_row_save(jsonb)  to authenticated;
grant execute on function public.sheet_row_delete(uuid) to authenticated;

create or replace function public.sheet_close(p_company uuid, p_month date)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_honap date := date_trunc('month', p_month)::date;
begin
  if not public.can_edit_customers() then
    raise exception 'A lapot a tulajdonos zárja le.' using errcode = '42501';
  end if;
  insert into public.company_sheets (company_id, month, closed_at, closed_by)
  values (p_company, v_honap, now(), auth.uid())
  on conflict (company_id, month) do update
    set closed_at = coalesce(company_sheets.closed_at, now()),
        closed_by = coalesce(company_sheets.closed_by, auth.uid());
end;
$$;

create or replace function public.sheet_reopen(p_company uuid, p_month date)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.can_edit_customers() then
    raise exception 'A lezárt lapot a tulajdonos nyithatja újra.' using errcode = '42501';
  end if;
  update public.company_sheets
     set closed_at = null, closed_by = null
   where company_id = p_company and month = date_trunc('month', p_month)::date;
end;
$$;

grant execute on function public.sheet_close(uuid, date)  to authenticated;
grant execute on function public.sheet_reopen(uuid, date) to authenticated;

create or replace function public.sheet_settings_save(p_company uuid, p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_oszlopok jsonb := p->'columns';
  o          jsonb;
  v_kulcsok  text[] := '{}';
  k          text;
begin
  if not public.can_edit_customers() then
    raise exception 'Az igazolólap oszlopait a tulajdonos állítja be.' using errcode = '42501';
  end if;
  if v_oszlopok is null or jsonb_typeof(v_oszlopok) <> 'array' then
    raise exception 'Hiányoznak az oszlopok.';
  end if;

  for o in select * from jsonb_array_elements(v_oszlopok) loop
    k := o->>'key';
    if k is null or not (k in ('DATUM','RENDSZAM','KM','NETTO','NEV','ALAIRAS') or k ~ '^E_[a-z0-9]+$') then
      raise exception 'Ismeretlen oszlop: %', coalesce(k, '(üres)');
    end if;
    if k = any (v_kulcsok) then
      raise exception 'Egy oszlop kétszer szerepel: %', k;
    end if;
    if nullif(trim(o->>'label'), '') is null then
      raise exception 'Minden oszlopnak legyen neve.';
    end if;
    v_kulcsok := v_kulcsok || k;
  end loop;

  foreach k in array array['DATUM','RENDSZAM','KM','NETTO','NEV','ALAIRAS'] loop
    if not (k = any (v_kulcsok)) then
      raise exception 'Az alap oszlop nem törölhető (legfeljebb elrejthető): %', k;
    end if;
  end loop;

  insert into public.company_sheet_settings (company_id, columns, footer_text, updated_at)
  values (p_company,
          (select jsonb_agg(jsonb_build_object(
                    'key', x->>'key',
                    'label', trim(x->>'label'),
                    'visible', coalesce((x->>'visible')::boolean, true)))
             from jsonb_array_elements(v_oszlopok) x),
          nullif(trim(p->>'footer_text'), ''),
          now())
  on conflict (company_id) do update
    set columns = excluded.columns,
        footer_text = excluded.footer_text,
        updated_at = now();
end;
$$;

grant execute on function public.sheet_settings_save(uuid, jsonb) to authenticated;

create or replace function public.list_companies(p_q text default '', p_limit integer default 100)
returns setof jsonb
language sql
stable
as $$
  with talalt as (
    select co.*
      from public.companies co
     where coalesce(trim(p_q), '') = ''
        or public.ekezettelen(co.name) like '%' || public.ekezettelen(p_q) || '%'
        or public.ceg_kulcs(co.name) like '%' || coalesce(public.ceg_kulcs(p_q), '#') || '%'
        or exists (
             select 1 from public.v_vehicle_summary s
              where s.company_id = co.id
                and (s.plate_normalized like
                       '%' || upper(regexp_replace(p_q, '[^A-Za-z0-9]', '', 'g')) || '%'
                     or public.ekezettelen(s.customer_name) like '%' || public.ekezettelen(p_q) || '%'))
  )
  select jsonb_build_object(
    'id',          co.id,
    'name',        co.name,
    'tax_number',  co.tax_number,
    'szerzodes',   ct.id is not null,
    'szerzodes_vege', ct.valid_until,
    'hozom_viszem',   coalesce(ct.pickup_delivery, false),
    'berletes',    exists (select 1 from public.customers c
                            where c.company_id = co.id and c.billing_kind = 'BERLETES'),
    'lapos',       public.sheet_kell(co.id),
    'ugyfelek',    (select count(*)::integer from public.customers c
                     where c.company_id = co.id and c.anonymized_at is null),
    'jarmuvek',    (select count(*)::integer from public.v_vehicle_summary s where s.company_id = co.id),
    'latogatas',   coalesce((select sum(s.latogatas)::integer from public.v_vehicle_summary s
                              where s.company_id = co.id), 0),
    'utolso',      (select max(s.utolso) from public.v_vehicle_summary s where s.company_id = co.id),
    'autok',       coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', s.id, 'plate_raw', s.plate_raw, 'brand', s.brand, 'model', s.model,
                'category', s.category, 'customer_id', s.customer_id,
                'customer_name', s.customer_name, 'customer_phone', s.customer_phone,
                'contract_kind', s.contract_kind, 'latogatas', s.latogatas, 'utolso', s.utolso)
              order by s.plate_raw)
         from public.v_vehicle_summary s where s.company_id = co.id), '[]'::jsonb)
  )
  from talalt co
  left join public.contracts ct on ct.id = public.ceg_szerzodes_aktiv(co.id)
  order by public.sheet_kell(co.id) desc, co.name
  limit greatest(coalesce(p_limit, 100), 1);
$$;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['company_sheet_rows', 'company_sheets'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime'
                      and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
