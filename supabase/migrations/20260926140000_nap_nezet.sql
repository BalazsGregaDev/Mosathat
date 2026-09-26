-- =============================================================================
--  20260926140000_nap_nezet.sql — a napi kártyához hiányzó mezők
-- =============================================================================
--  A kártya az időpontot intervallumként mutatja: kezdés – vég. Többnapos
--  munkánál a vég a határidő, ami eddig nem szerepelt a nézetben.
--
--  Emellett a foglalás megnyitásakor kell a tételek mennyisége is: az
--  ablakmosó folyadék litereit a munkalistán adják meg, nem foglaláskor.
-- =============================================================================

-- Új oszlopokat a CREATE OR REPLACE csak a lista VÉGÉRE enged betenni, mi
-- viszont a logikus helyükre tesszük őket. Ezért előbb eldobjuk a nézetet.
-- Semmi nem függ tőle az adatbázisban — csak a felület olvassa.
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

  (select count(*) from public.booking_tasks t where t.booking_id = b.id)              as tasks_total,
  (select count(*) from public.booking_tasks t where t.booking_id = b.id and t.done)   as tasks_done,

  (select min(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as first_done_at,
  (select max(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as last_done_at
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.vehicles  v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id;


-- -----------------------------------------------------------------------------
--  Egy foglalás mennyiséges tételei — a munkalistán szerkeszthetők
-- -----------------------------------------------------------------------------
--  Az ablakmosó folyadékot literben mérik, és a mennyiség akkor derül ki,
--  amikor betöltik — nem akkor, amikor a foglalás készül. Ugyanez igaz a
--  kárpittisztításnál az ülésszámra.

create or replace view public.v_booking_extras
with (security_invoker = on) as
select
  bi.booking_id,
  bi.id            as item_id,
  bi.ref_id        as extra_id,
  bi.name_snapshot as name,
  bi.quantity,
  bi.price_huf,
  e.price_unit,
  e.duration_unit
from public.booking_items bi
join public.extras e on e.id = bi.ref_id
where bi.kind = 'EXTRA'
  and e.price_unit <> 'ALKALOM';


-- A mennyiség módosítása a munkalistáról. Az ár és az idő újraszámolódik,
-- mert a liter és az ülésszám mindkettőt befolyásolhatja.
create or replace function public.set_booking_extra_qty(
  p_item_id uuid,
  p_qty     numeric)
returns void
language plpgsql
volatile
as $$
declare
  v_b uuid;
  v_e record;
begin
  select bi.booking_id into v_b from public.booking_items bi where bi.id = p_item_id;
  if v_b is null then
    raise exception 'Nincs ilyen tétel.';
  end if;
  if public.lezart_e(v_b) then
    raise exception 'A foglalás le van zárva, a tétel nem módosítható.';
  end if;

  select e.* into v_e
    from public.booking_items bi join public.extras e on e.id = bi.ref_id
   where bi.id = p_item_id;

  update public.booking_items bi
     set quantity     = greatest(p_qty, 0),
         price_huf    = case
                          when v_e.requires_quote or v_e.price_huf is null then 0
                          when v_e.price_unit = 'ALKALOM' then v_e.price_huf
                          else (v_e.price_huf * greatest(p_qty, 0))::integer
                        end,
         work_minutes = coalesce(v_e.work_minutes, 0)
                        * case when v_e.duration_unit = 'ALKALOM' then 1
                               else greatest(p_qty, 0) end
   where bi.id = p_item_id;

  -- A foglalás összegét a tételekből írjuk vissza, hogy a kettő ne csússzon el.
  update public.bookings b
     set estimated_price_huf = (select coalesce(sum(i.price_huf), 0)
                                  from public.booking_items i where i.booking_id = v_b),
         planned_duration_minutes = (select coalesce(sum(i.work_minutes), 0)
                                  from public.booking_items i where i.booking_id = v_b),
         updated_at = now()
   where b.id = v_b;
end;
$$;

grant execute on function public.set_booking_extra_qty(uuid, numeric) to authenticated;
