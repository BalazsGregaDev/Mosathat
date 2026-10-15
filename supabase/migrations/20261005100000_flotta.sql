alter table public.contracts
  add column if not exists fleet_cars boolean not null default false;

alter table public.bookings
  add column if not exists fleet_group uuid,
  add column if not exists fleet_index smallint;

create index if not exists bookings_fleet_group_idx
  on public.bookings (fleet_group) where fleet_group is not null;

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
  ct.fleet_cars
from public.contracts ct
join public.companies co on co.id = ct.company_id;

create or replace view public.v_day_bookings
with (security_invoker = on) as
select
  b.id,
  b.service_date,
  b.booking_type,
  b.status,
  b.source,
  b.start_at,
  b.drop_off_at,
  b.pick_up_at,
  b.deadline_at,
  b.arrived_at,
  b.scope,
  b.full_service,
  b.planned_duration_minutes,
  b.rest_minutes,
  b.estimated_price_huf,
  b.final_price_huf,
  b.notes,
  b.internal_notes,

  c.id           as customer_id,
  c.name         as customer_name,
  c.phone        as customer_phone,
  c.type         as customer_type,
  c.company_name,
  c.billing_kind,

  v.id           as vehicle_id,
  v.plate_raw,
  v.plate_country,
  v.brand,
  v.model,
  v.category,
  v.seats,

  p.id           as package_id,
  p.code         as package_code,
  p.name         as package_name,

  case when b.booking_type = 'HOZOMVISZEM' then (
    select ct.pickup_delivery_fee_huf
      from public.contracts ct
     where ct.company_id = c.company_id
       and ct.active
       and ct.pickup_delivery
       and (ct.valid_until is null or ct.valid_until >= b.service_date)
     limit 1
  ) end as pickup_fee_huf,

  (select count(*) from public.booking_tasks t where t.booking_id = b.id)              as tasks_total,
  (select count(*) from public.booking_tasks t where t.booking_id = b.id and t.done)   as tasks_done,

  (select min(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as first_done_at,
  (select max(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as last_done_at,

  b.last_day,
  b.contract_kind,
  c.company_id,
  (select string_agg(bi.name_snapshot, ', ' order by bi.sort_order)
     from public.booking_items bi
    where bi.booking_id = b.id and bi.kind = 'EXTRA')                                   as extras_summary,
  (select count(*)::integer from public.booking_items bi
    where bi.booking_id = b.id and bi.kind = 'EXTRA')                                   as extras_count,

  b.tentative,
  b.not_fitted,

  b.fleet_group,
  b.fleet_index
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.vehicles  v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id;

create or replace function public.set_contract_fleet(p_contract uuid, p_value boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.' using errcode = '42501';
  end if;
  update public.contracts set fleet_cars = coalesce(p_value, false), updated_at = now()
   where id = p_contract;
  if not found then raise exception 'Nincs ilyen szerződés.'; end if;
end;
$$;

create or replace function public.szerzodes_flottas(p_contract uuid)
returns boolean
language sql
stable
as $$ select coalesce((select fleet_cars from public.contracts where id = p_contract), false) $$;

create or replace function public.create_fleet_booking(p jsonb, p_count integer)
returns uuid
language plpgsql
volatile
as $$
declare
  v_csoport uuid := gen_random_uuid();
  v_id      uuid;
  v_p       jsonb;
  i         integer;
begin
  if p_count is null or p_count < 1 or p_count > 40 then
    raise exception 'Az autók száma 1 és 40 között lehet.';
  end if;
  v_p := (p - 'plate_raw' - 'vehicle_id' - 'drop_off_time' - 'start_time')
         || jsonb_build_object('plate_raw', '');
  if v_p->>'booking_type' = 'VAROS' then
    v_p := v_p || jsonb_build_object('booking_type', 'LEADOS');
  end if;

  for i in 1 .. p_count loop
    v_id := public.create_booking(v_p);
    update public.bookings set fleet_group = v_csoport, fleet_index = i where id = v_id;
    if i = 1 then
      v_p := v_p || jsonb_build_object(
        'customer_id', (select customer_id from public.bookings where id = v_id));
    end if;
  end loop;
  return v_csoport;
end;
$$;

create or replace function public.fleet_add_car(p_group uuid)
returns uuid
language plpgsql
volatile
as $$
declare
  v_minta uuid;
  v_p     jsonb;
  v_id    uuid;
begin
  select b.id into v_minta from public.bookings b
   where b.fleet_group = p_group
   order by (b.status in ('CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW')), b.fleet_index
   limit 1;
  if v_minta is null then raise exception 'Nincs ilyen flottás csoport.'; end if;

  v_p := public.booking_patch_alap(v_minta)
         - 'extras' - 'surcharge_fix' - 'drop_off_time' - 'start_time'
         || jsonb_build_object(
              'customer_id', (select customer_id from public.bookings where id = v_minta),
              'plate_raw', '',
              'extras', '[]'::jsonb,
              'source', 'TELEFON');
  v_id := public.create_booking(v_p);
  update public.bookings
     set fleet_group = p_group,
         fleet_index = (select coalesce(max(fleet_index), 0) + 1 from public.bookings
                         where fleet_group = p_group)
   where id = v_id;
  return v_id;
end;
$$;

create or replace function public.fleet_patch(p_group uuid, p_patch jsonb)
returns void
language plpgsql
volatile
as $$
declare
  r record;
begin
  for r in select b.id from public.bookings b
            where b.fleet_group = p_group
              and b.status not in ('COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW')
            order by b.fleet_index
  loop
    perform public.patch_booking(r.id, p_patch);
  end loop;
end;
$$;

create or replace function public.fleet_set_plate(p_booking_id uuid, p_plate text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  b        public.bookings%rowtype;
  v_regi   public.vehicles%rowtype;
  v_uj     uuid;
  v_rsz    text := upper(trim(coalesce(p_plate, '')));
  v_norm   text := upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if public.my_role() is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Nincs ilyen foglalás.'; end if;
  select * into v_regi from public.vehicles where id = b.vehicle_id;

  if v_norm = '' then
    if v_regi.plate_raw = '—' then return; end if;
    insert into public.vehicles (customer_id, plate_raw, category, contract_kind)
    values (b.customer_id, '—', v_regi.category, v_regi.contract_kind)
    returning id into v_uj;
  else
    select v.id into v_uj from public.vehicles v
     where v.plate_normalized = v_norm and v.id <> v_regi.id
     order by v.updated_at desc nulls last limit 1;
    if v_uj is null then
      if v_regi.plate_raw = '—' then
        update public.vehicles set plate_raw = v_rsz, updated_at = now() where id = v_regi.id;
        v_uj := v_regi.id;
      else
        insert into public.vehicles (customer_id, plate_raw, category, contract_kind)
        values (b.customer_id, v_rsz, v_regi.category, v_regi.contract_kind)
        returning id into v_uj;
      end if;
    end if;
  end if;

  if v_uj <> v_regi.id then
    update public.bookings set vehicle_id = v_uj, updated_at = now() where id = p_booking_id;
    if v_regi.plate_raw = '—'
       and not exists (select 1 from public.bookings x where x.vehicle_id = v_regi.id) then
      delete from public.vehicles where id = v_regi.id;
    end if;
  end if;

  update public.company_sheet_rows r
     set plate = nullif(v_rsz, ''), updated_at = now()
   where r.booking_id = p_booking_id and (r.plate is null or r.plate = '—');

  if b.status <> 'COMPLETED' then
    perform public.patch_booking(p_booking_id, '{}'::jsonb);
  end if;
end;
$$;

create or replace function public.sheet_for_booking(p_booking_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'company_id',   c.company_id,
    'company_name', co.name,
    'kell',         public.sheet_kell(c.company_id),
    'columns',      coalesce(
                      (select s.frozen->'columns' from public.company_sheets s
                        where s.company_id = c.company_id
                          and s.month = public.sheet_idoszak(c.company_id, coalesce(r.day, b.last_day))
                          and s.closed_at is not null and s.frozen is not null),
                      public.sheet_oszlopok(c.company_id)),
    'closed',       exists (select 1 from public.company_sheets s
                             where s.company_id = c.company_id
                               and s.month = public.sheet_idoszak(c.company_id, coalesce(r.day, b.last_day))
                               and s.closed_at is not null),
    'row', coalesce(
      (select jsonb_build_object(
                'id', r.id, 'booking_id', r.booking_id, 'day', r.day, 'plate', r.plate,
                'km', r.km, 'net_huf', r.net_huf, 'name', r.name, 'extra', r.extra,
                'signature', r.signature, 'signed_at', r.signed_at)
         where r.id is not null),
      jsonb_build_object(
        'id', null, 'booking_id', b.id, 'day', b.last_day, 'plate', nullif(v.plate_raw, '—'),
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

create or replace function public.day_bookings(p_day date)
returns setof jsonb
language sql
stable
as $$
  with napi as (
    select v.*,
           case when v.service_date = p_day
                then coalesce((v.start_at    at time zone 'Europe/Budapest')::time,
                              (v.drop_off_at at time zone 'Europe/Budapest')::time,
                              time '00:00')
                else time '00:00' end as napi_ido,
           o.pos
      from public.v_day_bookings v
      left join public.day_order o on o.day = p_day and o.booking_id = v.id
     where v.service_date <= p_day and v.last_day >= p_day
  ),
  horgony as (
    select n.*,
           case when n.pos is not null then n.pos
                when n.fleet_group is not null then 0
                else coalesce((select max(k.pos) from napi k
                                where k.pos is not null and k.napi_ido <= n.napi_ido), 0)
           end as hely,
           (n.pos is null)::integer as uj
      from napi n
  )
  select (to_jsonb(h) - 'napi_ido' - 'pos' - 'hely' - 'uj')
         || jsonb_build_object(
              'sorrend',     row_number() over (order by h.hely, h.uj, (h.fleet_group is null), h.napi_ido, h.plate_raw),
              'nap_szama',   (p_day - h.service_date) + 1,
              'napok_szama', (h.last_day - h.service_date) + 1)
    from horgony h
   order by h.hely, h.uj, (h.fleet_group is null), h.napi_ido, h.plate_raw;
$$;
grant execute on function public.day_bookings(date) to authenticated;

grant execute on function public.set_contract_fleet(uuid, boolean)       to authenticated;
grant execute on function public.szerzodes_flottas(uuid)                  to authenticated;
grant execute on function public.create_fleet_booking(jsonb, integer)     to authenticated;
grant execute on function public.fleet_add_car(uuid)                      to authenticated;
grant execute on function public.fleet_patch(uuid, jsonb)                 to authenticated;
grant execute on function public.fleet_set_plate(uuid, text)              to authenticated;
