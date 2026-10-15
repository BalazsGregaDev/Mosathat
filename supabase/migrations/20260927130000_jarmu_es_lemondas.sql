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
  if public.my_role() is null or public.my_role() = 'STAFF' then
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
  if public.my_role() is null or public.my_role() = 'STAFF' then
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
  if public.my_role() is null or public.my_role() = 'STAFF' then
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
