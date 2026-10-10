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
where bi.kind = 'EXTRA';
