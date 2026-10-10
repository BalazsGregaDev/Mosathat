create or replace function public.fleet_step(p_group uuid, p_delta integer)
returns uuid
language plpgsql
volatile
as $$
declare
  v_id uuid;
begin
  if p_delta > 0 then
    select b.id into v_id from public.bookings b
     where b.fleet_group = p_group
       and b.status not in ('COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW')
     order by b.fleet_index
     limit 1;
    if v_id is null then return null; end if;
    perform public.set_booking_status(v_id, 'COMPLETED', 'Flottás léptető: kész');
  elsif p_delta < 0 then
    select b.id into v_id from public.bookings b
     where b.fleet_group = p_group and b.status = 'COMPLETED'
     order by b.fleet_index desc
     limit 1;
    if v_id is null then return null; end if;
    perform public.set_booking_status(v_id, 'CONFIRMED', 'Flottás léptető: vissza');
  end if;
  return v_id;
end;
$$;

grant execute on function public.fleet_step(uuid, integer) to authenticated;
