alter table public.bookings add column if not exists last_day date;

create or replace function public.bookings_utolso_nap()
returns trigger
language plpgsql
as $$
declare
  v_vege timestamptz;
begin
  if new.booking_type = 'TOBBNAPOS' then
    v_vege := coalesce(new.deadline_at, new.pick_up_at);
  else
    v_vege := new.pick_up_at;
  end if;

  new.last_day := greatest(
    new.service_date,
    coalesce((v_vege at time zone 'Europe/Budapest')::date, new.service_date));

  if new.booking_type <> 'TOBBNAPOS' then
    new.deadline_at := case when new.last_day > new.service_date then new.pick_up_at end;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_utolso_nap on public.bookings;
create trigger bookings_utolso_nap
  before insert or update of service_date, pick_up_at, deadline_at, booking_type
  on public.bookings
  for each row execute function public.bookings_utolso_nap();

update public.bookings set service_date = service_date;

alter table public.bookings alter column last_day set not null;

create index if not exists bookings_napok_idx on public.bookings (service_date, last_day);

create or replace view public.v_standing_cars
with (security_invoker = on) as
select
  b.id,
  coalesce(b.arrived_at, b.drop_off_at, b.service_date::timestamptz)  as arrived_at,
  b.deadline_at,
  (current_date - coalesce(b.arrived_at::date, b.service_date))       as days_in,
  (b.deadline_at::date - current_date)                                 as days_left,
  (b.deadline_at::date - current_date) <= 1                            as urgent,
  b.status,
  c.name         as customer_name,
  c.company_name,
  v.plate_raw,
  v.brand,
  v.model,
  p.name         as package_name,
  (select count(*) from public.booking_tasks t where t.booking_id = b.id)            as tasks_total,
  (select count(*) from public.booking_tasks t where t.booking_id = b.id and t.done) as tasks_done
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.vehicles  v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id
where (b.booking_type = 'TOBBNAPOS' or b.last_day > b.service_date)
  and b.service_date <= current_date
  and b.status not in ('COMPLETED', 'REJECTED', 'CANCELLED_BY_CUSTOMER',
                       'CANCELLED_BY_SHOP', 'NO_SHOW');

create or replace function public.foglalas_idok(
  p jsonb,
  p_date date,
  p_type booking_type,
  out start_at    timestamptz,
  out drop_off_at timestamptz,
  out pick_up_at  timestamptz,
  out deadline_at timestamptz)
language plpgsql
stable
as $$
declare
  v_nap date;
  v_ora time;
begin
  if nullif(p->>'start_time', '') is not null then
    start_at := (p_date + (p->>'start_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'drop_off_time', '') is not null then
    drop_off_at := (p_date + (p->>'drop_off_time')::time) at time zone 'Europe/Budapest';
  end if;

  v_nap := coalesce(nullif(p->>'pick_up_date', '')::date,
                    nullif(p->>'deadline_date', '')::date,
                    p_date);
  v_ora := coalesce(nullif(p->>'pick_up_time', '')::time,
                    nullif(p->>'deadline_time', '')::time);

  if v_nap < p_date then
    raise exception 'A Viszi napja nem lehet korábban, mint a Hozza napja.';
  end if;

  if v_ora is not null then
    pick_up_at := (v_nap + v_ora) at time zone 'Europe/Budapest';
  elsif v_nap > p_date or p_type = 'TOBBNAPOS' then
    pick_up_at := (v_nap + time '17:00') at time zone 'Europe/Budapest';
  end if;

  if v_nap > p_date or p_type = 'TOBBNAPOS' then
    deadline_at := pick_up_at;
  end if;
end;
$$;

create or replace function public.foglalas_tetelek_ir(
  p_booking_id uuid,
  p_package_id uuid,
  p_category   vehicle_category,
  p_scope      booking_scope,
  p_full       boolean,
  p_extras     jsonb,
  p_pct        numeric,
  p_fix        integer,
  p_company_id uuid,
  p_kind       contract_kind,
  p_type       booking_type,
  p_date       date)
returns integer
language plpgsql
volatile
as $$
declare
  v_osszeg integer;
begin
  delete from public.booking_items where booking_id = p_booking_id;

  insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                    quantity, unit_price_huf, price_huf, work_minutes, sort_order)
  select p_booking_id, t.kind, t.ref_id, t.name,
         t.quantity, t.unit_price_huf, t.price_huf, t.work_minutes, t.sort_order
    from public.foglalas_tetelek(p_package_id, p_category, p_scope, p_full, p_extras,
                                 p_pct, p_fix, p_company_id, p_kind, p_type, p_date) t;

  select coalesce(sum(price_huf), 0)::integer
    into v_osszeg
    from public.booking_items where booking_id = p_booking_id;

  update public.bookings
     set estimated_price_huf = v_osszeg,
         contract_kind = case when public.ceg_szerzodes_aktiv(p_company_id, p_date) is not null
                              then coalesce(p_kind, 'FLOTTA') end
   where id = p_booking_id;

  return v_osszeg;
end;
$$;

create or replace function public.create_booking(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_customer_id uuid;
  v_vehicle_id  uuid;
  v_booking_id  uuid;
  v_category    vehicle_category;
  v_scope       booking_scope;
  v_type        booking_type;
  v_date        date;
  v_package_id  uuid;
  v_full        boolean;
  v_extras      jsonb;
  v_pct         numeric;
  v_fix         integer;
  v_kind        contract_kind;
  v_ceg         uuid;
  v_calc        record;
  v_idok        record;
  v_staff       uuid;
begin
  v_category   := (p->>'category')::vehicle_category;
  v_scope      := coalesce((p->>'scope')::booking_scope, 'TELJES');
  v_type       := (p->>'booking_type')::booking_type;
  v_date       := (p->>'service_date')::date;
  v_package_id := nullif(p->>'package_id','')::uuid;
  v_full       := coalesce((p->>'full_service')::boolean, false);
  v_extras     := coalesce(p->'extras', '[]'::jsonb);
  v_pct        := coalesce((p->>'surcharge_pct')::numeric, 0);
  v_fix        := coalesce((p->>'surcharge_fix')::integer, 0);
  v_kind       := nullif(p->>'contract_kind','')::contract_kind;
  v_staff      := (select s.id from public.staff s where s.id = auth.uid());

  if v_category is null then raise exception 'Hiányzik a járműkategória.'; end if;
  if v_type     is null then raise exception 'Hiányzik a foglalás típusa.';  end if;
  if v_date     is null then raise exception 'Hiányzik a dátum.';            end if;
  if v_package_id is null then
    raise exception 'Válassz csomagot.'
      using hint = 'A Start az alap: csomag nélkül nem lehet foglalást menteni.';
  end if;

  v_customer_id := nullif(p->>'customer_id','')::uuid;

  if v_customer_id is null then
    select c.id into v_customer_id
      from public.customers c
     where public.phone_norm(c.phone) = public.phone_norm(p->>'customer_phone')
       and public.phone_norm(p->>'customer_phone') is not null
     limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (name, phone, type, company_id, company_name)
    values (coalesce(nullif(p->>'customer_name',''), 'Névtelen'),
            coalesce(nullif(p->>'customer_phone',''), '—'),
            'MAGAN',
            nullif(p->>'company_id','')::uuid,
            nullif(trim(p->>'company_name'),''))
    returning id into v_customer_id;
  else
    update public.customers
       set name  = coalesce(nullif(p->>'customer_name',''),  name),
           phone = coalesce(nullif(p->>'customer_phone',''), phone),
           updated_at = now()
     where id = v_customer_id;

    if nullif(p->>'company_id','') is not null then
      update public.customers set company_id = (p->>'company_id')::uuid where id = v_customer_id;
    elsif nullif(trim(p->>'company_name'),'') is not null then
      update public.customers set company_name = trim(p->>'company_name') where id = v_customer_id;
    end if;
  end if;

  select company_id into v_ceg from public.customers where id = v_customer_id;

  v_vehicle_id := nullif(p->>'vehicle_id','')::uuid;

  if v_vehicle_id is null and coalesce(p->>'plate_raw','') <> '' then
    select v.id into v_vehicle_id
      from public.vehicles v
     where v.plate_normalized = upper(regexp_replace(p->>'plate_raw', '[^A-Za-z0-9]', '', 'g'))
     limit 1;
  end if;

  if v_vehicle_id is null then
    insert into public.vehicles (customer_id, plate_raw, plate_country, brand, model, category,
                                 seats, contract_kind)
    values (v_customer_id,
            coalesce(nullif(p->>'plate_raw',''), '—'),
            coalesce(nullif(p->>'plate_country',''), 'HU'),
            nullif(p->>'brand',''),
            nullif(p->>'model',''),
            v_category,
            nullif(p->>'seats','')::integer,
            v_kind)
    returning id into v_vehicle_id;
  else
    update public.vehicles
       set brand    = coalesce(nullif(p->>'brand',''),  brand),
           model    = coalesce(nullif(p->>'model',''),  model),
           category = v_category,
           seats    = coalesce(nullif(p->>'seats','')::integer, seats),
           contract_kind = coalesce(v_kind, contract_kind),
           updated_at = now()
     where id = v_vehicle_id;
  end if;

  v_kind := coalesce(v_kind, (select contract_kind from public.vehicles where id = v_vehicle_id));

  select * into v_calc
    from public.calc_service(v_package_id, v_category, v_scope, v_full, v_extras, v_pct, v_fix);
  select * into v_idok from public.foglalas_idok(p, v_date, v_type);

  insert into public.bookings (
    customer_id, vehicle_id, booking_type, status, source, service_date,
    start_at, drop_off_at, pick_up_at, deadline_at,
    package_id, scope, full_service,
    planned_duration_minutes, rest_minutes, estimated_price_huf,
    notes, internal_notes, created_by)
  values (
    v_customer_id, v_vehicle_id, v_type,
    coalesce((p->>'status')::booking_status, 'CONFIRMED'),
    coalesce((p->>'source')::booking_source, 'TELEFON'),
    v_date,
    v_idok.start_at, v_idok.drop_off_at, v_idok.pick_up_at, v_idok.deadline_at,
    v_package_id, v_scope, v_full,
    coalesce(v_calc.work_minutes, 0),
    coalesce(v_calc.rest_minutes, 0),
    0,
    nullif(p->>'notes',''),
    nullif(p->>'internal_notes',''),
    v_staff)
  returning id into v_booking_id;

  perform public.foglalas_tetelek_ir(v_booking_id, v_package_id, v_category, v_scope, v_full,
                                     v_extras, v_pct, v_fix, v_ceg, v_kind, v_type, v_date);

  perform public.rebuild_booking_tasks(v_booking_id);

  return v_booking_id;
end;
$$;

create or replace function public.update_booking(p_booking_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_regi        record;
  v_customer_id uuid;
  v_vehicle_id  uuid;
  v_category    vehicle_category;
  v_scope       booking_scope;
  v_type        booking_type;
  v_date        date;
  v_package_id  uuid;
  v_full        boolean;
  v_extras      jsonb;
  v_pct         numeric;
  v_fix         integer;
  v_kind        contract_kind;
  v_ceg         uuid;
  v_calc        record;
  v_idok        record;
begin
  select * into v_regi from public.bookings where id = p_booking_id;
  if v_regi is null then
    raise exception 'Nincs ilyen foglalás: %', p_booking_id;
  end if;
  if v_regi.status = 'COMPLETED' then
    raise exception 'A foglalás le van zárva. Módosításhoz előbb vissza kell nyitni.';
  end if;

  v_category := coalesce(
    nullif(p->>'category','')::vehicle_category,
    (select v.category from public.vehicles v where v.id = v_regi.vehicle_id));
  v_scope      := coalesce((p->>'scope')::booking_scope, v_regi.scope);
  v_type       := coalesce((p->>'booking_type')::booking_type, v_regi.booking_type);
  v_date       := coalesce((p->>'service_date')::date, v_regi.service_date);
  v_package_id := nullif(p->>'package_id','')::uuid;
  v_full       := coalesce((p->>'full_service')::boolean, false);
  v_extras     := coalesce(p->'extras', '[]'::jsonb);
  v_pct        := coalesce((p->>'surcharge_pct')::numeric, 0);
  v_fix        := coalesce((p->>'surcharge_fix')::integer, 0);

  if v_package_id is null and v_regi.package_id is not null then
    raise exception 'A csomagot nem lehet levenni a foglalásról.'
      using hint = 'Ha mást kér, válassz másik csomagot. A Start az alap.';
  end if;

  v_customer_id := v_regi.customer_id;
  v_vehicle_id  := v_regi.vehicle_id;

  update public.customers
     set name  = coalesce(nullif(p->>'customer_name',''),  name),
         phone = coalesce(nullif(p->>'customer_phone',''), phone),
         updated_at = now()
   where id = v_customer_id;

  if p ? 'company_id' then
    update public.customers
       set company_id = nullif(p->>'company_id','')::uuid,
           company_name = case when nullif(p->>'company_id','') is null
                               then nullif(trim(p->>'company_name'),'') else company_name end
     where id = v_customer_id;
  elsif nullif(trim(p->>'company_name'),'') is not null then
    update public.customers set company_name = trim(p->>'company_name') where id = v_customer_id;
  end if;

  select company_id into v_ceg from public.customers where id = v_customer_id;

  v_kind := coalesce(nullif(p->>'contract_kind','')::contract_kind,
                     v_regi.contract_kind,
                     (select contract_kind from public.vehicles where id = v_vehicle_id));

  update public.vehicles
     set plate_raw = coalesce(nullif(p->>'plate_raw',''), plate_raw),
         brand     = coalesce(nullif(p->>'brand',''), brand),
         model     = coalesce(nullif(p->>'model',''), model),
         category  = v_category,
         seats     = coalesce(nullif(p->>'seats','')::integer, seats),
         contract_kind = coalesce(nullif(p->>'contract_kind','')::contract_kind, contract_kind),
         updated_at = now()
   where id = v_vehicle_id;

  select * into v_calc
    from public.calc_service(v_package_id, v_category, v_scope, v_full, v_extras, v_pct, v_fix);
  select * into v_idok from public.foglalas_idok(p, v_date, v_type);

  update public.bookings
     set booking_type = v_type,
         service_date = v_date,
         start_at     = v_idok.start_at,
         drop_off_at  = v_idok.drop_off_at,
         pick_up_at   = v_idok.pick_up_at,
         deadline_at  = v_idok.deadline_at,
         package_id   = v_package_id,
         scope        = v_scope,
         full_service = v_full,
         planned_duration_minutes = coalesce(v_calc.work_minutes, 0),
         rest_minutes             = coalesce(v_calc.rest_minutes, 0),
         notes                    = nullif(trim(coalesce(p->>'notes','')), ''),
         updated_at = now()
   where id = p_booking_id;

  perform public.foglalas_tetelek_ir(p_booking_id, v_package_id, v_category, v_scope, v_full,
                                     v_extras, v_pct, v_fix, v_ceg, v_kind, v_type, v_date);

  perform public.rebuild_booking_tasks(p_booking_id);

  return p_booking_id;
end;
$$;

create or replace function public.booking_patch_alap(p_booking_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'category',      v.category,
    'scope',         b.scope,
    'booking_type',  b.booking_type,
    'service_date',  b.service_date::text,
    'package_id',    b.package_id,
    'full_service',  b.full_service,
    'notes',         coalesce(b.notes, ''),
    'contract_kind', b.contract_kind,

    'start_time',    to_char(b.start_at    at time zone 'Europe/Budapest', 'HH24:MI'),
    'drop_off_time', to_char(b.drop_off_at at time zone 'Europe/Budapest', 'HH24:MI'),
    'pick_up_date',  to_char(coalesce(b.pick_up_at, b.deadline_at) at time zone 'Europe/Budapest',
                             'YYYY-MM-DD'),
    'pick_up_time',  to_char(coalesce(b.pick_up_at, b.deadline_at) at time zone 'Europe/Budapest',
                             'HH24:MI'),

    'extras', coalesce((
      select jsonb_agg(jsonb_build_object('extra_id', bi.ref_id, 'quantity', bi.quantity))
        from public.booking_items bi
       where bi.booking_id = b.id and bi.kind = 'EXTRA' and bi.ref_id is not null
    ), '[]'::jsonb),

    'surcharge_pct', 0,
    'surcharge_fix', coalesce((
      select bi.price_huf from public.booking_items bi
       where bi.booking_id = b.id and bi.kind = 'SURCHARGE' limit 1), 0)
  )
  from public.bookings b
  join public.vehicles v on v.id = b.vehicle_id
  where b.id = p_booking_id;
$$;

create or replace function public.patch_booking(p_booking_id uuid, p_patch jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_status booking_status;
  v_alap   jsonb;
  v_eltol  integer;
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

  return public.update_booking(p_booking_id, v_alap || p_patch);
end;
$$;

create or replace function public.booking_form_data(p_booking_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'booking',  (select to_jsonb(b) from public.bookings b where b.id = p_booking_id),
    'customer', (select to_jsonb(c) from public.customers c
                  where c.id = (select customer_id from public.bookings where id = p_booking_id)),
    'vehicle',  (select to_jsonb(v) from public.vehicles v
                  where v.id = (select vehicle_id from public.bookings where id = p_booking_id)),
    'company',  (select to_jsonb(co) from public.companies co
                  where co.id = (select c.company_id from public.customers c
                                  join public.bookings b on b.customer_id = c.id
                                 where b.id = p_booking_id)),
    'extras',   coalesce((
                  select jsonb_agg(jsonb_build_object('extra_id', bi.ref_id, 'quantity', bi.quantity))
                    from public.booking_items bi
                   where bi.booking_id = p_booking_id
                     and bi.kind = 'EXTRA'
                     and bi.ref_id is not null
                ), '[]'::jsonb)
  );
$$;

drop function if exists public.search_customers(text, integer, text);

create or replace function public.search_customers(
  p_q     text,
  p_limit integer default 5,
  p_mezo  text    default 'MIND'
)
returns table (
  vehicle_id     uuid,
  plate_raw      text,
  brand          text,
  model          text,
  category       vehicle_category,
  seats          integer,
  customer_id    uuid,
  customer_name  text,
  customer_phone text,
  customer_type  customer_type,
  company_name   text,
  utolso_datum   date,
  utolso_csomag  text,
  utolso_ar      integer,
  company_id     uuid,
  contract_kind  contract_kind
)
language sql
stable
as $$
  with q as (
    select
      trim(coalesce(p_q, ''))                                              as nyers,
      upper(regexp_replace(coalesce(p_q, ''), '[^A-Za-z0-9]', '', 'g'))    as rendszam,
      upper(coalesce(nullif(trim(p_mezo), ''), 'MIND'))                    as mezo
  )
  select
    v.id, v.plate_raw, v.brand, v.model, v.category, v.seats,
    c.id, c.name, c.phone, c.type, c.company_name,
    u.service_date, u.package_name, u.price_huf,
    c.company_id, v.contract_kind
  from public.vehicles v
  join public.customers c on c.id = v.customer_id
  cross join q
  left join lateral (
    select h.service_date, h.package_name, h.price_huf
      from public.v_customer_history h
     where h.vehicle_id = v.id
     order by h.service_date desc
     limit 1
  ) u on true
  where q.nyers <> ''
    and c.anonymized_at is null
    and (
      (q.mezo = 'RENDSZAM' and q.rendszam <> ''
        and v.plate_normalized like '%' || q.rendszam || '%')
      or (q.mezo = 'NEV' and (
             public.ekezettelen(c.name)         like '%' || public.ekezettelen(q.nyers) || '%'
          or public.ekezettelen(c.company_name) like '%' || public.ekezettelen(q.nyers) || '%'))
      or (q.mezo = 'MIND' and (
             (q.rendszam <> '' and v.plate_normalized like q.rendszam || '%')
          or v.plate_normalized like '%' || q.rendszam || '%'
          or public.ekezettelen(c.name)         like '%' || public.ekezettelen(q.nyers) || '%'
          or public.ekezettelen(c.company_name) like '%' || public.ekezettelen(q.nyers) || '%'))
    )
  order by
    case when q.rendszam <> '' and v.plate_normalized like q.rendszam || '%' then 0 else 1 end,
    case when public.ekezettelen(c.name) like public.ekezettelen(q.nyers) || '%'
           or public.ekezettelen(c.company_name) like public.ekezettelen(q.nyers) || '%'
         then 0 else 1 end,
    u.service_date desc nulls last,
    v.plate_raw
  limit greatest(coalesce(p_limit, 5), 1);
$$;

grant execute on function public.search_customers(text, integer, text) to authenticated;

update public.extras
   set name = 'Gumiápolás'
 where name = 'Gumiápolás (külön kérve)';

update public.booking_items bi
   set name_snapshot = 'Gumiápolás'
  from public.bookings b
 where b.id = bi.booking_id
   and bi.kind = 'EXTRA'
   and bi.name_snapshot = 'Gumiápolás (külön kérve)'
   and b.status <> 'COMPLETED';
