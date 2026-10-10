alter table public.bookings
  add column if not exists tentative  boolean not null default false,
  add column if not exists not_fitted boolean not null default false;

create or replace function public.vehicles_rendszam_nagybetu()
returns trigger
language plpgsql
as $$
begin
  new.plate_raw := upper(new.plate_raw);
  return new;
end;
$$;

drop trigger if exists vehicles_rendszam_nagybetu on public.vehicles;
create trigger vehicles_rendszam_nagybetu
  before insert or update of plate_raw on public.vehicles
  for each row execute function public.vehicles_rendszam_nagybetu();

update public.vehicles set plate_raw = upper(plate_raw)
 where plate_raw is distinct from upper(plate_raw);

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
  b.not_fitted
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.vehicles  v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id;

create or replace function public.set_booking_tentative(p_booking_id uuid, p_value boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.my_role() is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  update public.bookings
     set tentative = coalesce(p_value, false), updated_at = now()
   where id = p_booking_id;
  if not found then raise exception 'Nincs ilyen foglalás.'; end if;
end;
$$;

create or replace function public.booking_not_fitted(p_booking_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
begin
  if public.my_role() is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Nincs ilyen foglalás.'; end if;
  if not b.tentative then
    raise exception 'Csak kérdőjeles foglalás zárható le „Nem fért be"-ként.';
  end if;
  if b.status in ('COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW') then
    raise exception 'Ez a foglalás már le van zárva vagy törölve.';
  end if;

  update public.bookings
     set final_price_huf = 0, not_fitted = true, updated_at = now()
   where id = p_booking_id;
  perform public.set_booking_status(p_booking_id, 'COMPLETED', 'Nem fért be — 0 Ft-tal lezárva.');
end;
$$;

create or replace function public.bookings_nem_fert_be_vissza()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'COMPLETED' and new.status <> 'COMPLETED' and old.not_fitted then
    new.not_fitted := false;
    new.final_price_huf := null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_nem_fert_be_vissza on public.bookings;
create trigger bookings_nem_fert_be_vissza
  before update of status on public.bookings
  for each row execute function public.bookings_nem_fert_be_vissza();

grant execute on function public.set_booking_tentative(uuid, boolean) to authenticated;
grant execute on function public.booking_not_fitted(uuid)             to authenticated;
