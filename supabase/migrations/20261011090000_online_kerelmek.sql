create or replace view public.v_online_kerelmek
with (security_invoker = on) as
select
  v.*,
  b.created_at as beerkezett,
  c.email      as ugyfel_email,
  (select count(*)::integer from public.bookings x
    where x.customer_id = v.customer_id and x.id <> v.id and x.status = 'COMPLETED') as korabbi_db,
  (select max(x.service_date) from public.bookings x
    where x.customer_id = v.customer_id and x.id <> v.id and x.status = 'COMPLETED') as utolso_nap,
  (select count(*)::integer from public.bookings x
    where x.customer_id = v.customer_id and x.status = 'NO_SHOW')                   as nem_jott_db,
  (select count(*)::integer from public.bookings x
    where x.customer_id = v.customer_id and x.status = 'CANCELLED_BY_CUSTOMER')     as lemondta_db
from public.v_day_bookings v
join public.bookings  b on b.id = v.id
join public.customers c on c.id = v.customer_id
where v.status = 'REQUESTED'
  and v.last_day >= (now() at time zone 'Europe/Budapest')::date;

revoke all on public.v_online_kerelmek from anon;
grant select on public.v_online_kerelmek to authenticated;

create or replace function public.online_keres_dontes(p_id uuid, p_elfogad boolean)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_allapot booking_status;
begin
  select status into v_allapot from public.bookings where id = p_id for update;
  if v_allapot is null then
    raise exception 'Nincs ilyen foglalás.';
  end if;
  if v_allapot <> 'REQUESTED' then
    return v_allapot::text;
  end if;
  perform public.set_booking_status(
    p_id,
    case when p_elfogad then 'CONFIRMED' else 'REJECTED' end::booking_status,
    null,
    true);
  return 'OK';
end;
$$;

revoke all on function public.online_keres_dontes(uuid, boolean) from public, anon;
grant execute on function public.online_keres_dontes(uuid, boolean) to authenticated;
