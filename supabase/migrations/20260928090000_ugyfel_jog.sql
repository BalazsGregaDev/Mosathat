create table if not exists public.role_permissions (
  role               staff_role primary key,
  can_edit_customers boolean not null default false,
  updated_at         timestamptz not null default now()
);

insert into public.role_permissions (role, can_edit_customers) values
  ('SUPERADMIN',  true),
  ('TULAJDONOS',  true),
  ('STAFF',       false)
on conflict (role) do nothing;

alter table public.role_permissions enable row level security;

drop policy if exists role_permissions_olvas on public.role_permissions;
create policy role_permissions_olvas on public.role_permissions
  for select to authenticated using (true);

alter table public.staff
  add column if not exists can_edit_customers boolean;

create or replace function public.can_edit_customers()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(s.can_edit_customers, rp.can_edit_customers)
       from public.staff s
       left join public.role_permissions rp on rp.role = s.role
      where s.id = auth.uid() and s.active),
    false);
$$;

grant execute on function public.can_edit_customers() to authenticated;

create or replace function public.phone_norm(p text)
returns text
language sql
immutable
as $$
  with d as (
    select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as x
  )
  select nullif(
    case
      when x like '0036%'                        then substring(x from 5)
      when x like '06%'                          then substring(x from 3)
      when x like '36%' and length(x) in (10, 11) then substring(x from 3)
      else x
    end, '')
  from d;
$$;

grant execute on function public.phone_norm(text) to authenticated, anon;

create or replace function public.add_customer(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nev  text := trim(coalesce(p->>'name',''));
  v_tel  text := trim(coalesce(p->>'phone',''));
  v_id   uuid;
  v_regi text;
begin
  if not public.can_edit_customers() then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.' using errcode = '42501';
  end if;

  if v_nev = '' then raise exception 'A név nem maradhat üresen.'; end if;
  if v_tel = '' then raise exception 'A telefonszám nem maradhat üresen.'; end if;

  select c.name into v_regi
    from public.customers c
   where public.phone_norm(c.phone) = public.phone_norm(v_tel)
   limit 1;

  if v_regi is not null and coalesce((p->>'megis')::boolean, false) is not true then
    raise exception 'Ezzel a telefonszámmal már van ügyfél: %', v_regi
      using hint = 'Ha tényleg két külön ügyfélről van szó, vedd fel mégis.';
  end if;

  insert into public.customers (name, phone, email, type, company_name, tax_number,
                                notes, internal_notes)
  values (v_nev, v_tel,
          nullif(trim(p->>'email'),''),
          coalesce(nullif(p->>'type','')::customer_type, 'MAGAN'),
          nullif(trim(p->>'company_name'),''),
          nullif(trim(p->>'tax_number'),''),
          nullif(trim(p->>'notes'),''),
          nullif(trim(p->>'internal_notes'),''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.add_customer(jsonb) to authenticated;

create or replace function public.add_vehicle(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_customer uuid := (p->>'customer_id')::uuid;
  v_plate    text := trim(coalesce(p->>'plate_raw',''));
  v_norm     text := upper(regexp_replace(v_plate, '[^A-Za-z0-9]', '', 'g'));
  v_letezo   uuid;
  v_gazda    text;
  v_id       uuid;
begin
  if not public.can_edit_customers() then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.customers c where c.id = v_customer) then
    raise exception 'Nincs ilyen ügyfél.';
  end if;

  if v_plate = '' then
    raise exception 'A rendszám nem maradhat üresen.';
  end if;

  select v.id, c.name into v_letezo, v_gazda
    from public.vehicles v
    join public.customers c on c.id = v.customer_id
   where v.plate_normalized = v_norm
   limit 1;

  if v_letezo is not null then
    if (select customer_id from public.vehicles where id = v_letezo) = v_customer then
      raise exception 'Ez a rendszám már szerepel nála.';
    end if;
    raise exception 'Ez a rendszám már % ügyfélhez tartozik.', v_gazda
      using hint = 'Ha az autó gazdát cserélt, a régi ügyfélnél kell átírni — '
                || 'így az előzménye is vele marad.';
  end if;

  insert into public.vehicles (customer_id, plate_raw, plate_country, brand, model,
                               category, seats, notes)
  values (v_customer,
          v_plate,
          coalesce(nullif(p->>'plate_country',''), 'HU'),
          nullif(trim(p->>'brand'),''),
          nullif(trim(p->>'model'),''),
          coalesce(nullif(p->>'category','')::vehicle_category, 'SZEMELYAUTO'),
          nullif(p->>'seats','')::integer,
          nullif(trim(p->>'notes'),''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.add_vehicle(jsonb) to authenticated;

create or replace function public.save_customer(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := (p->>'id')::uuid;
begin
  if not public.can_edit_customers() then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.'
      using errcode = '42501',
            hint = 'A foglaláshoz tartozó adatokat a foglalási ablakban tudod átírni.';
  end if;

  if v_id is null then
    raise exception 'Hiányzik az ügyfél azonosítója.';
  end if;

  update public.customers
     set name           = coalesce(nullif(trim(p->>'name'),''), name),
         phone          = coalesce(nullif(trim(p->>'phone'),''), phone),
         email          = case when p ? 'email'
                               then nullif(trim(p->>'email'),'') else email end,
         type           = coalesce(nullif(p->>'type','')::customer_type, type),
         company_name   = case when p ? 'company_name'
                               then nullif(trim(p->>'company_name'),'') else company_name end,
         tax_number     = case when p ? 'tax_number'
                               then nullif(trim(p->>'tax_number'),'') else tax_number end,
         default_travel_minutes = case when p ? 'default_travel_minutes'
                               then nullif(p->>'default_travel_minutes','')::integer
                               else default_travel_minutes end,
         notes          = case when p ? 'notes'
                               then nullif(trim(p->>'notes'),'') else notes end,
         internal_notes = case when p ? 'internal_notes'
                               then nullif(trim(p->>'internal_notes'),'') else internal_notes end,
         updated_at     = now()
   where id = v_id;

  if not found then
    raise exception 'Nincs ilyen ügyfél.';
  end if;
  return v_id;
end;
$$;

create or replace function public.save_vehicle(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := (p->>'id')::uuid;
begin
  if not public.can_edit_customers() then
    raise exception 'A járműadatokat a tulajdonos kezeli.'
      using errcode = '42501',
            hint = 'A foglaláshoz tartozó adatokat a foglalási ablakban tudod átírni.';
  end if;

  if v_id is null then
    raise exception 'Hiányzik a jármű azonosítója.';
  end if;

  update public.vehicles
     set plate_raw = coalesce(nullif(trim(p->>'plate_raw'),''), plate_raw),
         brand     = case when p ? 'brand' then nullif(trim(p->>'brand'),'') else brand end,
         model     = case when p ? 'model' then nullif(trim(p->>'model'),'') else model end,
         year      = case when p ? 'year' then nullif(p->>'year','')::integer else year end,
         category  = coalesce(nullif(p->>'category','')::vehicle_category, category),
         seats     = case when p ? 'seats' then nullif(p->>'seats','')::integer else seats end,
         notes     = case when p ? 'notes' then nullif(trim(p->>'notes'),'') else notes end,
         updated_at = now()
   where id = v_id;

  if not found then
    raise exception 'Nincs ilyen jármű.';
  end if;

  if nullif(p->>'category','') is not null then
    perform public.patch_booking(b.id, jsonb_build_object('category', p->>'category'))
      from public.bookings b
     where b.vehicle_id = v_id
       and b.status not in ('COMPLETED','CANCELLED_BY_CUSTOMER','CANCELLED_BY_SHOP',
                            'NO_SHOW','REJECTED');
  end if;

  return v_id;
end;
$$;

grant execute on function public.save_customer(jsonb) to authenticated;
grant execute on function public.save_vehicle(jsonb)  to authenticated;

drop function if exists public.list_staff();

create or replace function public.list_staff()
returns table (
  id            uuid,
  full_name     text,
  role          staff_role,
  active        boolean,
  email         text,
  belepett_mar  boolean,
  meghivo       boolean,
  created_at    timestamptz,
  can_edit_customers boolean,
  can_edit_customers_sajat boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.my_role() is null or public.my_role() = 'STAFF' then
    raise exception 'A felhasználók listájához nincs jogosultságod.'
      using errcode = '42501';
  end if;

  return query
  select s.id, s.full_name, s.role, s.active,
         u.email::text,
         (u.last_sign_in_at is not null),
         false,
         s.created_at,
         coalesce(s.can_edit_customers, rp.can_edit_customers, false),
         (s.can_edit_customers is not null)
    from public.staff s
    left join auth.users u on u.id = s.id
    left join public.role_permissions rp on rp.role = s.role

  union all

  select null::uuid, i.full_name, i.role, true,
         i.email::text, false, true, i.created_at,
         coalesce(rp.can_edit_customers, false), false
    from public.staff_invites i
    left join public.role_permissions rp on rp.role = i.role
   where i.used_at is null

  order by 7, 3, 2;
end;
$$;

grant execute on function public.list_staff() to authenticated;

create or replace function public.set_staff(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid := (p->>'id')::uuid;
  v_sajat   staff_role := public.my_role();
  v_cel     staff_role;
  v_uj_role staff_role := nullif(p->>'role','')::staff_role;
begin
  select role into v_cel from public.staff where id = v_id;
  if not found then
    raise exception 'Nincs ilyen felhasználó.';
  end if;

  if v_sajat is null or v_sajat = 'STAFF' then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;

  if v_id = auth.uid() and (p ? 'active' or v_uj_role is not null) then
    raise exception 'A saját hozzáférésedet nem tudod elvenni.';
  end if;

  if v_sajat::text = 'TULAJDONOS' then
    if v_cel <> 'STAFF' then
      raise exception 'A fejlesztői és tulajdonosi hozzáférést a fejlesztő kezeli.'
        using errcode = '42501';
    end if;
    if v_uj_role is not null and v_uj_role <> 'STAFF' then
      raise exception 'Tulajdonosként alkalmazotti szerepkört tudsz adni.'
        using errcode = '42501';
    end if;
  end if;

  update public.staff
     set full_name = coalesce(nullif(trim(p->>'full_name'),''), full_name),
         role      = coalesce(v_uj_role, role),
         active    = coalesce((p->>'active')::boolean, active),
         can_edit_customers = case
           when p ? 'can_edit_customers' then (p->>'can_edit_customers')::boolean
           when v_uj_role is not null    then null
           else can_edit_customers end,
         updated_at = now()
   where id = v_id;
end;
$$;

grant execute on function public.set_staff(jsonb) to authenticated;

create or replace function public.set_role_permission(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sajat staff_role := public.my_role();
  v_cel   staff_role := nullif(p->>'role','')::staff_role;
begin
  if v_sajat is null or v_sajat = 'STAFF' then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  if v_cel is null then
    raise exception 'Hiányzik a szerepkör.';
  end if;
  if v_sajat::text = 'TULAJDONOS' and v_cel <> 'STAFF' then
    raise exception 'A fejlesztői és tulajdonosi jogokat a fejlesztő kezeli.'
      using errcode = '42501';
  end if;
  if not (p ? 'can_edit_customers') then
    raise exception 'Nincs megadva, mit kell átállítani.';
  end if;

  insert into public.role_permissions (role, can_edit_customers)
  values (v_cel, (p->>'can_edit_customers')::boolean)
  on conflict (role) do update
     set can_edit_customers = excluded.can_edit_customers,
         updated_at         = now();
end;
$$;

grant execute on function public.set_role_permission(jsonb) to authenticated;

create or replace function public.list_role_permissions()
returns table (role staff_role, can_edit_customers boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.my_role() is null or public.my_role() = 'STAFF' then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  return query
    select rp.role, rp.can_edit_customers
      from public.role_permissions rp
     order by rp.role;
end;
$$;

grant execute on function public.list_role_permissions() to authenticated;

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
  v_calc        record;
  v_start       timestamptz;
  v_drop        timestamptz;
  v_pick        timestamptz;
  v_deadline    timestamptz;
  v_staff       uuid;
  v_items_sum   integer := 0;
  v_sort        integer := 0;
  v_pp          record;
  v_fs          record;
  r             record;
  v_qty         numeric;
  v_line        integer;
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
  v_staff      := (select s.id from public.staff s where s.id = auth.uid());

  if v_category is null then raise exception 'Hiányzik a járműkategória.'; end if;
  if v_type     is null then raise exception 'Hiányzik a foglalás típusa.';  end if;
  if v_date     is null then raise exception 'Hiányzik a dátum.';            end if;

  v_customer_id := nullif(p->>'customer_id','')::uuid;

  if v_customer_id is null then
    select c.id into v_customer_id
      from public.customers c
     where public.phone_norm(c.phone) = public.phone_norm(p->>'customer_phone')
       and public.phone_norm(p->>'customer_phone') is not null
     limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (name, phone, type)
    values (coalesce(nullif(p->>'customer_name',''), 'Névtelen'),
            coalesce(nullif(p->>'customer_phone',''), '—'),
            'MAGAN')
    returning id into v_customer_id;
  else
    update public.customers
       set name  = coalesce(nullif(p->>'customer_name',''),  name),
           phone = coalesce(nullif(p->>'customer_phone',''), phone),
           updated_at = now()
     where id = v_customer_id;
  end if;

  v_vehicle_id := nullif(p->>'vehicle_id','')::uuid;

  if v_vehicle_id is null and coalesce(p->>'plate_raw','') <> '' then
    select v.id into v_vehicle_id
      from public.vehicles v
     where v.plate_normalized = upper(regexp_replace(p->>'plate_raw', '[^A-Za-z0-9]', '', 'g'))
     limit 1;
  end if;

  if v_vehicle_id is null then
    insert into public.vehicles (customer_id, plate_raw, plate_country, brand, model, category, seats)
    values (v_customer_id,
            coalesce(nullif(p->>'plate_raw',''), '—'),
            coalesce(nullif(p->>'plate_country',''), 'HU'),
            nullif(p->>'brand',''),
            nullif(p->>'model',''),
            v_category,
            nullif(p->>'seats','')::integer)
    returning id into v_vehicle_id;
  else
    update public.vehicles
       set brand    = coalesce(nullif(p->>'brand',''),  brand),
           model    = coalesce(nullif(p->>'model',''),  model),
           category = v_category,
           seats    = coalesce(nullif(p->>'seats','')::integer, seats),
           updated_at = now()
     where id = v_vehicle_id;
  end if;

  select * into v_calc
    from public.calc_service(v_package_id, v_category, v_scope, v_full, v_extras, v_pct, v_fix);

  if nullif(p->>'start_time','') is not null then
    v_start := (v_date + (p->>'start_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'drop_off_time','') is not null then
    v_drop := (v_date + (p->>'drop_off_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'pick_up_time','') is not null then
    v_pick := (v_date + (p->>'pick_up_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'deadline_date','') is not null then
    v_deadline := ((p->>'deadline_date')::date
                   + coalesce(nullif(p->>'deadline_time','')::time, time '17:00'))
                  at time zone 'Europe/Budapest';
  end if;

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
    v_start, v_drop, v_pick, v_deadline,
    v_package_id, v_scope, v_full,
    coalesce(v_calc.work_minutes, 0),
    coalesce(v_calc.rest_minutes, 0),
    coalesce(v_calc.price_huf, 0),
    nullif(p->>'notes',''),
    nullif(p->>'internal_notes',''),
    v_staff)
  returning id into v_booking_id;

  if v_package_id is not null then
    select pp.price_huf, pp.duration_minutes into v_pp
      from public.package_pricing pp
     where pp.package_id = v_package_id and pp.category = v_category and pp.scope = v_scope;

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    select v_booking_id, 'PACKAGE', v_package_id,
           pk.name || case when v_scope = 'TELJES' then '' else ' — ' || v_scope::text end,
           1, coalesce(v_pp.price_huf,0), coalesce(v_pp.price_huf,0),
           coalesce(v_pp.duration_minutes,0), v_sort
      from public.packages pk where pk.id = v_package_id;

    v_items_sum := v_items_sum + coalesce(v_pp.price_huf, 0);
    v_sort := v_sort + 1;
  end if;

  if v_full then
    select fp.price_huf into v_fs
      from public.full_service_pricing fp
     where fp.package_id = v_package_id and fp.category = v_category;

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (v_booking_id, 'FULL_SERVICE', null, 'Full Service (Csomag+Kárpit/Bőrtisztítás)',
            1, coalesce(v_fs.price_huf,0) - v_items_sum, coalesce(v_fs.price_huf,0) - v_items_sum,
            coalesce((select extra_work_minutes from public.full_service_pricing
                       where package_id = v_package_id and category = v_category), 45),
            v_sort);

    v_items_sum := coalesce(v_fs.price_huf, v_items_sum);
    v_sort := v_sort + 1;
  end if;

  for r in
    select e.*, coalesce((x->>'quantity')::numeric, 1) as qty
      from jsonb_array_elements(v_extras) as x
      join public.extras e on e.id = (x->>'extra_id')::uuid
     order by e.sort_order
  loop
    v_qty  := greatest(r.qty, 1);
    v_line := case
                when r.requires_quote or r.price_huf is null then 0
                when r.price_unit = 'ALKALOM' then r.price_huf
                else (r.price_huf * v_qty)::integer
              end;

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (v_booking_id, 'EXTRA', r.id, r.name,
            v_qty, coalesce(r.price_huf, 0), v_line,
            coalesce(r.work_minutes,0) * case when r.duration_unit = 'ALKALOM' then 1 else v_qty end,
            v_sort);

    v_items_sum := v_items_sum + v_line;
    v_sort := v_sort + 1;
  end loop;

  if coalesce(v_calc.price_huf,0) <> v_items_sum then
    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (v_booking_id, 'SURCHARGE', null,
            case when v_pct <> 0 and v_fix <> 0 then 'Felár (' || v_pct || '% + fix)'
                 when v_pct <> 0                then 'Felár (' || v_pct || '%)'
                 else 'Felár' end,
            1,
            coalesce(v_calc.price_huf,0) - v_items_sum,
            coalesce(v_calc.price_huf,0) - v_items_sum,
            0, v_sort);
  end if;

  perform public.rebuild_booking_tasks(v_booking_id);

  return v_booking_id;
end;
$$;

create or replace function public.list_customers(p_q text default '', p_limit integer default 100)
returns setof public.v_customer_summary
language sql
stable
as $$
  select s.* from public.v_customer_summary s
   where coalesce(trim(p_q), '') = ''
      or public.ekezettelen(s.name)         like '%' || public.ekezettelen(p_q) || '%'
      or public.ekezettelen(s.company_name) like '%' || public.ekezettelen(p_q) || '%'
      or (public.phone_norm(p_q) is not null
          and public.phone_norm(s.phone) like '%' || public.phone_norm(p_q) || '%')
      or exists (
        select 1 from public.vehicles v
         where v.customer_id = s.id
           and v.plate_normalized like
               '%' || upper(regexp_replace(p_q, '[^A-Za-z0-9]', '', 'g')) || '%')
   order by s.utolso desc nulls last, s.name
   limit greatest(coalesce(p_limit, 100), 1);
$$;

create or replace function public.create_pass(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_id    uuid;
  v_from  date := coalesce(nullif(p->>'valid_from','')::date, current_date);
  v_until date;
  r       jsonb;
  v_sort  integer := 0;
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;

  v_until := coalesce(
    nullif(p->>'valid_until','')::date,
    public.berlet_lejarat(
      coalesce(nullif(p->>'validity_kind','')::validity_kind, 'EV'),
      coalesce(nullif(p->>'validity_value',''), '1'),
      v_from));

  insert into public.passes (customer_id, name, price_huf, valid_from, valid_until, notes, created_by)
  values (
    (p->>'customer_id')::uuid,
    coalesce(nullif(p->>'name',''), 'Bérlet'),
    coalesce((p->>'price_huf')::integer, 0),
    v_from, v_until,
    nullif(p->>'notes',''),
    (select s.id from public.staff s where s.id = auth.uid()))
  returning id into v_id;

  for r in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb))
  loop
    insert into public.pass_items (pass_id, package_id, category, qty_total, sort_order)
    values (
      v_id,
      nullif(r->>'package_id','')::uuid,
      nullif(r->>'category','')::vehicle_category,
      greatest(coalesce((r->>'qty_total')::integer, 1), 1),
      v_sort);
    v_sort := v_sort + 1;
  end loop;

  if v_sort = 0 then
    raise exception 'A bérletnek legalább egy tételt tartalmaznia kell.';
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_pass(jsonb) to authenticated;

create or replace function public.save_contract(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_id uuid := nullif(p->>'id','')::uuid;
  r    jsonb;
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.contracts (customer_id, tax_number, pickup_delivery, valid_until, notes)
    values ((p->>'customer_id')::uuid,
            nullif(p->>'tax_number',''),
            coalesce((p->>'pickup_delivery')::boolean, false),
            nullif(p->>'valid_until','')::date,
            nullif(p->>'notes',''))
    returning id into v_id;
  else
    update public.contracts
       set tax_number      = nullif(p->>'tax_number',''),
           pickup_delivery = coalesce((p->>'pickup_delivery')::boolean, false),
           valid_until     = nullif(p->>'valid_until','')::date,
           notes           = nullif(p->>'notes',''),
           updated_at      = now()
     where id = v_id;
  end if;

  delete from public.contract_prices where contract_id = v_id;

  for r in select * from jsonb_array_elements(coalesce(p->'prices', '[]'::jsonb))
  loop
    if nullif(r->>'price_huf','') is not null and (r->>'price_huf')::integer > 0 then
      insert into public.contract_prices (contract_id, tier, size, price_huf)
      values (v_id, (r->>'tier')::contract_tier, (r->>'size')::contract_size,
              (r->>'price_huf')::integer);
    end if;
  end loop;

  return v_id;
end;
$$;

grant execute on function public.save_contract(jsonb) to authenticated;

create or replace function public.deactivate_pass(p_pass_id uuid)
returns void
language plpgsql
volatile
as $$
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;

  update public.passes set active = false, updated_at = now() where id = p_pass_id;
end;
$$;

grant execute on function public.deactivate_pass(uuid) to authenticated;

create or replace function public.list_vehicles(p_q text default '', p_limit integer default 100)
returns setof public.v_vehicle_summary
language sql
stable
as $$
  select s.* from public.v_vehicle_summary s
   where coalesce(trim(p_q), '') = ''
      or s.plate_normalized like
         '%' || upper(regexp_replace(p_q, '[^A-Za-z0-9]', '', 'g')) || '%'
      or public.ekezettelen(s.customer_name) like '%' || public.ekezettelen(p_q) || '%'
      or public.ekezettelen(s.company_name)  like '%' || public.ekezettelen(p_q) || '%'
      or public.ekezettelen(coalesce(s.brand,'') || ' ' || coalesce(s.model,''))
         like '%' || public.ekezettelen(p_q) || '%'
      or (public.phone_norm(p_q) is not null
          and public.phone_norm(s.customer_phone) like '%' || public.phone_norm(p_q) || '%')
   order by s.utolso desc nulls last, s.plate_raw
   limit greatest(coalesce(p_limit, 100), 1);
$$;
