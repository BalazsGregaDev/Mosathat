create or replace function public.foglalas_aktiv(p_status booking_status)
returns boolean
language sql
immutable
as $$ select p_status not in ('COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW', 'REJECTED') $$;

grant execute on function public.foglalas_aktiv(booking_status) to authenticated;

create or replace function public.foglalas_tarsai(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  v_valodi boolean;
begin
  if public.my_role() is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Nincs ilyen foglalás.';
  end if;
  select not public.helyettes_rendszam(v.plate_raw) into v_valodi from public.vehicles v where v.id = b.vehicle_id;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id,
             'service_date', x.service_date,
             'plate_raw', case when public.helyettes_rendszam(v.plate_raw) then null else v.plate_raw end,
             'package_name', p.name,
             'status', x.status,
             'ugyanaz_auto', coalesce(v_valodi, false) and x.vehicle_id = b.vehicle_id)
           order by x.service_date, x.created_at)
      from public.bookings x
      join public.vehicles v on v.id = x.vehicle_id
      left join public.packages p on p.id = x.package_id
     where x.customer_id = b.customer_id
       and x.id <> b.id
       and public.foglalas_aktiv(x.status)), '[]'::jsonb);
end;
$$;

revoke all on function public.foglalas_tarsai(uuid) from public, anon;
grant execute on function public.foglalas_tarsai(uuid) to authenticated;

create or replace function public.foglalas_levalaszt(p_booking_id uuid, p_tovabbi uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  b       public.bookings%rowtype;
  c       public.customers%rowtype;
  v_aktiv uuid[];
  v_mozog uuid[];
  v_uj    uuid;
begin
  if public.my_role() is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Nincs ilyen foglalás.';
  end if;
  if b.status = 'COMPLETED' then
    raise exception 'A foglalás le van zárva. Módosításhoz előbb vissza kell nyitni.';
  end if;
  select * into c from public.customers where id = b.customer_id;

  select coalesce(array_agg(x.id), '{}') into v_aktiv
    from public.bookings x
   where x.customer_id = b.customer_id and x.id <> b.id and public.foglalas_aktiv(x.status);

  select array_agg(distinct m) into v_mozog
    from (
      select b.id as m
      union all
      select x.id from public.bookings x
       where x.id = any (v_aktiv)
         and (x.id = any (coalesce(p_tovabbi, '{}'))
              or (x.vehicle_id = b.vehicle_id
                  and not public.helyettes_rendszam((select v.plate_raw from public.vehicles v where v.id = b.vehicle_id))))
    ) t;

  if not exists (select 1 from unnest(v_aktiv) a where not (a = any (v_mozog))) then
    return b.customer_id;
  end if;

  insert into public.customers (name, phone, email, type, company_id, company_name, notes)
  values (c.name, c.phone, c.email, c.type, c.company_id, c.company_name, c.notes)
  returning id into v_uj;

  update public.bookings set customer_id = v_uj, updated_at = now() where id = any (v_mozog);

  update public.vehicles v
     set customer_id = v_uj, updated_at = now()
   where v.id in (select x.vehicle_id from public.bookings x where x.id = any (v_mozog))
     and not exists (select 1 from public.bookings x
                      where x.vehicle_id = v.id and x.customer_id = c.id and public.foglalas_aktiv(x.status));

  return v_uj;
end;
$$;

revoke all on function public.foglalas_levalaszt(uuid, uuid[]) from public, anon;
grant execute on function public.foglalas_levalaszt(uuid, uuid[]) to authenticated;
