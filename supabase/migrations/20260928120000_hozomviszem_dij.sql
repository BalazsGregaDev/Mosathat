alter table public.contracts
  add column if not exists pickup_delivery_fee_huf integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contracts_pickup_fee_chk') then
    alter table public.contracts
      add constraint contracts_pickup_fee_chk
      check (pickup_delivery_fee_huf is null or pickup_delivery_fee_huf >= 0);
  end if;
end $$;

drop view if exists public.v_contracts;

create view public.v_contracts
with (security_invoker = on) as
select
  ct.id,
  ct.customer_id,
  c.name         as customer_name,
  c.company_name,
  ct.tax_number,
  ct.pickup_delivery,
  ct.pickup_delivery_fee_huf,
  ct.valid_from,
  ct.valid_until,
  ct.active,
  ct.notes,
  coalesce((
    select jsonb_agg(jsonb_build_object('tier', cp.tier, 'size', cp.size, 'price_huf', cp.price_huf)
                     order by cp.tier, cp.size)
      from public.contract_prices cp where cp.contract_id = ct.id
  ), '[]'::jsonb) as prices
from public.contracts ct
join public.customers c on c.id = ct.customer_id;

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
    insert into public.contracts (customer_id, tax_number, pickup_delivery,
                                  pickup_delivery_fee_huf, valid_until, notes)
    values ((p->>'customer_id')::uuid,
            nullif(p->>'tax_number',''),
            coalesce((p->>'pickup_delivery')::boolean, false),
            case when coalesce((p->>'pickup_delivery')::boolean, false)
                 then nullif(p->>'pickup_delivery_fee_huf','')::integer end,
            nullif(p->>'valid_until','')::date,
            nullif(p->>'notes',''))
    returning id into v_id;
  else
    update public.contracts
       set tax_number      = nullif(p->>'tax_number',''),
           pickup_delivery = coalesce((p->>'pickup_delivery')::boolean, false),
           pickup_delivery_fee_huf = case
             when coalesce((p->>'pickup_delivery')::boolean, false)
             then nullif(p->>'pickup_delivery_fee_huf','')::integer end,
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

drop view if exists public.v_day_bookings;

create view public.v_day_bookings
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
     where ct.customer_id = b.customer_id
       and ct.active
       and ct.pickup_delivery
       and (ct.valid_until is null or ct.valid_until >= b.service_date)
     limit 1
  ) end as pickup_fee_huf,

  (select count(*) from public.booking_tasks t where t.booking_id = b.id)              as tasks_total,
  (select count(*) from public.booking_tasks t where t.booking_id = b.id and t.done)   as tasks_done,

  (select min(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as first_done_at,
  (select max(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as last_done_at
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.vehicles  v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id;
