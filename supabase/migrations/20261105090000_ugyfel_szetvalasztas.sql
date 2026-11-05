create or replace function public.nev_kulcs(p text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select nullif(nullif(btrim(regexp_replace(public.ekezettelen(p), '\s+', ' ', 'g')), ''), 'nevtelen')
$$;

create or replace function public.foglalas_ceg(p jsonb)
returns uuid
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(nullif(p->>'company_id', '')::uuid,
                  (select co.id from public.companies co
                    where co.name_key = public.ceg_kulcs(nullif(btrim(coalesce(p->>'company_name', '')), ''))))
$$;

create or replace function public.ugyfel_par(p_nev text, p_tel text, p_ceg uuid, p_kihagy uuid default null, p_barmely boolean default false)
returns uuid
language sql
stable
set search_path = public, extensions
as $$
  select c.id
    from public.customers c
   where public.phone_norm(p_tel) is not null
     and public.phone_norm(c.phone) = public.phone_norm(p_tel)
     and c.anonymized_at is null
     and c.id is distinct from p_kihagy
     and (p_barmely or c.company_id is not distinct from p_ceg)
     and (public.nev_kulcs(p_nev) is null or public.nev_kulcs(c.name) is null
          or public.nev_kulcs(c.name) = public.nev_kulcs(p_nev))
   order by case when public.nev_kulcs(p_nev) is not null and public.nev_kulcs(c.name) = public.nev_kulcs(p_nev) then 0 else 1 end,
            (c.company_id is not distinct from p_ceg) desc,
            c.updated_at desc, c.created_at desc
   limit 1
$$;

create or replace function public.helyettes_ugyfel_ceg(p_ceg uuid, p_kihagy uuid default null)
returns uuid
language sql
stable
set search_path = public, extensions
as $$
  select c.id
    from public.customers c
   where public.helyettes_ugyfel(c.name, c.phone, c.email)
     and c.anonymized_at is null
     and c.company_id is not distinct from p_ceg
     and c.id is distinct from p_kihagy
   order by c.created_at
   limit 1
$$;

revoke all on function public.nev_kulcs(text) from public, anon;
revoke all on function public.foglalas_ceg(jsonb) from public, anon;
revoke all on function public.ugyfel_par(text, text, uuid, uuid, boolean) from public, anon;
revoke all on function public.helyettes_ugyfel_ceg(uuid, uuid) from public, anon;
grant execute on function public.nev_kulcs(text) to authenticated;
grant execute on function public.foglalas_ceg(jsonb) to authenticated;
grant execute on function public.ugyfel_par(text, text, uuid, uuid, boolean) to authenticated;
grant execute on function public.helyettes_ugyfel_ceg(uuid, uuid) to authenticated;


create or replace function public.create_booking(p jsonb)
returns uuid
language plpgsql
volatile
set search_path = public, extensions
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
  v_kind        contract_kind;
  v_ceg         uuid;
  v_calc        record;
  v_idok        record;
  v_staff       uuid;
  v_online      boolean;
  v_azonosito   boolean;
  v_ceg_adott   boolean;
  v_ceg_be      uuid;
  v_ceg_uj      boolean;
  v_c           public.customers%rowtype;
  v_rendszam    text;
  v_kert        boolean := false;
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
  v_kind       := nullif(p->>'contract_kind','')::contract_kind;
  v_staff      := (select s.id from public.staff s where s.id = auth.uid());
  v_online     := coalesce(nullif(p->>'source', ''), 'TELEFON') = 'ONLINE';
  v_azonosito  := public.nev_kulcs(p->>'customer_name') is not null or public.phone_norm(p->>'customer_phone') is not null;
  v_ceg_adott  := p ? 'company_id' or p ? 'company_name';
  v_ceg_be     := public.foglalas_ceg(p);
  v_ceg_uj     := v_ceg_be is null and nullif(btrim(coalesce(p->>'company_name', '')), '') is not null;
  v_rendszam   := upper(regexp_replace(coalesce(p->>'plate_raw', ''), '[^A-Za-z0-9]', '', 'g'));

  if v_category is null then raise exception 'Hiányzik a járműkategória.'; end if;
  if v_type     is null then raise exception 'Hiányzik a foglalás típusa.';  end if;
  if v_date     is null then raise exception 'Hiányzik a dátum.';            end if;
  if v_package_id is null then
    raise exception 'Válassz csomagot.'
      using hint = 'A Start az alap: csomag nélkül nem lehet foglalást menteni.';
  end if;

  v_customer_id := nullif(p->>'customer_id','')::uuid;

  if v_customer_id is not null and not v_online then
    select * into v_c from public.customers where id = v_customer_id;
    if not found
       or v_c.anonymized_at is not null
       or (v_azonosito and public.helyettes_ugyfel(v_c.name, v_c.phone, v_c.email))
       or (v_ceg_adott and (v_ceg_uj or v_c.company_id is distinct from v_ceg_be)) then
      v_customer_id := null;
    end if;
    v_kert := v_customer_id is not null;
  end if;

  if v_customer_id is null and not v_online and not v_ceg_uj then
    v_customer_id := public.ugyfel_par(p->>'customer_name', p->>'customer_phone', v_ceg_be, null, not v_ceg_adott);
  end if;

  if v_customer_id is null and v_online then
    select c.id into v_customer_id
      from public.customers c
     where public.phone_norm(c.phone) = public.phone_norm(p->>'customer_phone')
       and public.phone_norm(p->>'customer_phone') is not null
     limit 1;
  end if;

  if v_customer_id is null
     and public.helyettes_ugyfel(p->>'customer_name', p->>'customer_phone', null) then
    select c.id into v_customer_id
      from public.customers c
     where public.helyettes_ugyfel(c.name, c.phone, c.email)
       and c.anonymized_at is null
       and c.company_id is not distinct from v_ceg_be
       and (c.company_id is not null or nullif(trim(p->>'company_name'),'') is null)
     order by c.created_at
     limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (name, phone, type, company_id, company_name)
    values (coalesce(nullif(btrim(p->>'customer_name'),''), 'Névtelen'),
            coalesce(nullif(btrim(p->>'customer_phone'),''), '—'),
            'MAGAN',
            nullif(p->>'company_id','')::uuid,
            nullif(trim(p->>'company_name'),''))
    returning id into v_customer_id;
  elsif v_online or v_kert then
    update public.customers
       set name  = coalesce(nullif(btrim(p->>'customer_name'),''),  name),
           phone = coalesce(nullif(btrim(p->>'customer_phone'),''), phone),
           updated_at = now()
     where id = v_customer_id;

    if nullif(p->>'company_id','') is not null then
      update public.customers set company_id = (p->>'company_id')::uuid
       where id = v_customer_id and company_id is distinct from (p->>'company_id')::uuid;
    elsif nullif(trim(p->>'company_name'),'') is not null then
      update public.customers set company_name = trim(p->>'company_name')
       where id = v_customer_id and public.ceg_kulcs(company_name) is distinct from public.ceg_kulcs(p->>'company_name');
    end if;
  else
    update public.customers
       set name  = case when public.nev_kulcs(name) is null then coalesce(nullif(btrim(p->>'customer_name'),''), name) else name end,
           phone = case when public.phone_norm(phone) is null then coalesce(nullif(btrim(p->>'customer_phone'),''), phone) else phone end,
           updated_at = now()
     where id = v_customer_id
       and ((public.nev_kulcs(name) is null and public.nev_kulcs(p->>'customer_name') is not null)
            or (public.phone_norm(phone) is null and public.phone_norm(p->>'customer_phone') is not null));
  end if;

  select company_id into v_ceg from public.customers where id = v_customer_id;

  v_vehicle_id := nullif(p->>'vehicle_id','')::uuid;

  if v_vehicle_id is not null and not v_online then
    if not exists (select 1 from public.vehicles v where v.id = v_vehicle_id)
       or (v_rendszam <> '' and (select v.plate_normalized from public.vehicles v where v.id = v_vehicle_id) is distinct from v_rendszam) then
      v_vehicle_id := null;
    end if;
  end if;

  if v_vehicle_id is null and v_rendszam <> '' then
    select v.id into v_vehicle_id
      from public.vehicles v
     where v.plate_normalized = v_rendszam
     order by (v.customer_id = v_customer_id) desc, v.updated_at desc nulls last
     limit 1;
  end if;

  if v_vehicle_id is null then
    insert into public.vehicles (customer_id, plate_raw, plate_country, brand, model, category,
                                 seats, contract_kind)
    values (v_customer_id,
            coalesce(nullif(p->>'plate_raw',''), '—'),
            coalesce(nullif(p->>'plate_country',''), 'HU'),
            nullif(p->>'brand',''),
            nullif(p->>'model',''),
            v_category,
            nullif(p->>'seats','')::integer,
            v_kind)
    returning id into v_vehicle_id;
  else
    update public.vehicles
       set brand    = coalesce(nullif(p->>'brand',''),  brand),
           model    = coalesce(nullif(p->>'model',''),  model),
           category = v_category,
           seats    = coalesce(nullif(p->>'seats','')::integer, seats),
           contract_kind = coalesce(v_kind, contract_kind),
           updated_at = now()
     where id = v_vehicle_id;

    if not v_online then
      update public.vehicles v
         set customer_id = v_customer_id, updated_at = now()
       where v.id = v_vehicle_id
         and v.customer_id <> v_customer_id
         and not public.helyettes_rendszam(v.plate_raw)
         and exists (select 1 from public.customers c
                      where c.id = v.customer_id and public.helyettes_ugyfel(c.name, c.phone, c.email))
         and not exists (select 1 from public.customers c
                          where c.id = v_customer_id and public.helyettes_ugyfel(c.name, c.phone, c.email));
    end if;
  end if;

  v_kind := coalesce(v_kind, (select contract_kind from public.vehicles where id = v_vehicle_id));

  select * into v_calc
    from public.calc_service(v_package_id, v_category, v_scope, v_full, v_extras, v_pct, v_fix);
  select * into v_idok from public.foglalas_idok(p, v_date, v_type);

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
    v_idok.start_at, v_idok.drop_off_at, v_idok.pick_up_at, v_idok.deadline_at,
    v_package_id, v_scope, v_full,
    coalesce(v_calc.work_minutes, 0),
    coalesce(v_calc.rest_minutes, 0),
    0,
    nullif(p->>'notes',''),
    nullif(p->>'internal_notes',''),
    v_staff)
  returning id into v_booking_id;

  perform public.foglalas_tetelek_ir(v_booking_id, v_package_id, v_category, v_scope, v_full,
                                     v_extras, v_pct, v_fix, v_ceg, v_kind, v_type, v_date);

  perform public.rebuild_booking_tasks(v_booking_id);

  return v_booking_id;
end;
$$;


create or replace function public.foglalas_egysege(p_booking_id uuid)
returns uuid[]
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(array_agg(x.id order by x.service_date, x.created_at), '{}')
    from public.bookings b
    join public.vehicles v on v.id = b.vehicle_id
    join public.bookings x on x.customer_id = b.customer_id
   where b.id = p_booking_id
     and (x.id = b.id
          or (b.fleet_group is not null and x.fleet_group = b.fleet_group)
          or (x.vehicle_id = b.vehicle_id and not public.helyettes_rendszam(v.plate_raw) and public.foglalas_aktiv(x.status)))
$$;

revoke all on function public.foglalas_egysege(uuid) from public, anon;
grant execute on function public.foglalas_egysege(uuid) to authenticated;


create or replace function public.update_booking(p_booking_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_regi        record;
  v_customer_id uuid;
  v_vehicle_id  uuid;
  v_category    vehicle_category;
  v_scope       booking_scope;
  v_type        booking_type;
  v_date        date;
  v_package_id  uuid;
  v_full        boolean;
  v_extras      jsonb;
  v_pct         numeric;
  v_fix         integer;
  v_kind        contract_kind;
  v_ceg         uuid;
  v_calc        record;
  v_idok        record;
  v_c           public.customers%rowtype;
  v_nev_adott   boolean;
  v_tel_adott   boolean;
  v_uj_nev      text;
  v_uj_tel      text;
  v_ceg_adott   boolean;
  v_ceg_cel     uuid;
  v_ceg_uj      boolean;
  v_azonosito   boolean;
  v_ceg_valt    boolean;
  v_egyseg      uuid[];
  v_cel         uuid;
begin
  select * into v_regi from public.bookings where id = p_booking_id;
  if v_regi is null then
    raise exception 'Nincs ilyen foglalás: %', p_booking_id;
  end if;
  if v_regi.status = 'COMPLETED' then
    raise exception 'A foglalás le van zárva. Módosításhoz előbb vissza kell nyitni.';
  end if;

  v_category := coalesce(
    nullif(p->>'category','')::vehicle_category,
    (select v.category from public.vehicles v where v.id = v_regi.vehicle_id));
  v_scope      := coalesce((p->>'scope')::booking_scope, v_regi.scope);
  v_type       := coalesce((p->>'booking_type')::booking_type, v_regi.booking_type);
  v_date       := coalesce((p->>'service_date')::date, v_regi.service_date);
  v_package_id := nullif(p->>'package_id','')::uuid;
  v_full       := coalesce((p->>'full_service')::boolean, false);
  v_extras     := coalesce(p->'extras', '[]'::jsonb);
  v_pct        := coalesce((p->>'surcharge_pct')::numeric, 0);
  v_fix        := coalesce((p->>'surcharge_fix')::integer, 0);

  if v_package_id is null and v_regi.package_id is not null then
    raise exception 'A csomagot nem lehet levenni a foglalásról.'
      using hint = 'Ha mást kér, válassz másik csomagot. A Start az alap.';
  end if;

  v_customer_id := v_regi.customer_id;
  v_vehicle_id  := v_regi.vehicle_id;
  select * into v_c from public.customers where id = v_customer_id;

  v_nev_adott := p ? 'customer_name';
  v_tel_adott := p ? 'customer_phone';
  v_uj_nev    := nullif(btrim(coalesce(p->>'customer_name', '')), '');
  v_uj_tel    := nullif(nullif(btrim(coalesce(p->>'customer_phone', '')), ''), '—');
  v_ceg_adott := p ? 'company_id' or nullif(btrim(coalesce(p->>'company_name', '')), '') is not null;
  v_ceg_cel   := case when v_ceg_adott then public.foglalas_ceg(p) else v_c.company_id end;
  v_ceg_uj    := v_ceg_adott and v_ceg_cel is null and nullif(btrim(coalesce(p->>'company_name', '')), '') is not null;
  v_azonosito := (v_nev_adott and public.nev_kulcs(v_uj_nev) is not null)
              or (v_tel_adott and public.phone_norm(v_uj_tel) is not null);
  v_ceg_valt  := v_ceg_adott and (v_ceg_uj or v_ceg_cel is distinct from v_c.company_id);

  if public.helyettes_ugyfel(v_c.name, v_c.phone, v_c.email) and (v_azonosito or v_ceg_valt) then
    v_egyseg := public.foglalas_egysege(p_booking_id);
    v_cel := null;
    if not v_ceg_uj and v_tel_adott and public.phone_norm(v_uj_tel) is not null then
      v_cel := public.ugyfel_par(v_uj_nev, v_uj_tel, v_ceg_cel, v_customer_id);
    end if;
    if v_cel is null
       and exists (select 1 from public.bookings x where x.customer_id = v_customer_id and not (x.id = any (v_egyseg))) then
      if not v_azonosito and not v_ceg_uj then
        v_cel := public.helyettes_ugyfel_ceg(v_ceg_cel, v_customer_id);
      end if;
      if v_cel is null then
        insert into public.customers (name, phone, type, company_id, company_name, notes)
        values (v_c.name, v_c.phone, v_c.type,
                case when v_ceg_adott then v_ceg_cel else v_c.company_id end,
                case when v_ceg_adott then nullif(btrim(coalesce(p->>'company_name', '')), '') else v_c.company_name end,
                v_c.notes)
        returning id into v_cel;
      end if;
    end if;
    if v_cel is not null then
      update public.bookings set customer_id = v_cel, updated_at = now() where id = any (v_egyseg);
      update public.vehicles v
         set customer_id = v_cel, updated_at = now()
       where v.customer_id = v_customer_id
         and v.id in (select x.vehicle_id from public.bookings x where x.id = any (v_egyseg));
      v_customer_id := v_cel;
    end if;
  end if;

  update public.customers
     set name  = case when v_nev_adott then coalesce(v_uj_nev, 'Névtelen') else name end,
         phone = case when v_tel_adott then coalesce(v_uj_tel, '—') else phone end,
         updated_at = now()
   where id = v_customer_id
     and ((v_nev_adott and name is distinct from coalesce(v_uj_nev, 'Névtelen'))
          or (v_tel_adott and phone is distinct from coalesce(v_uj_tel, '—')));

  if nullif(p->>'company_id','') is not null then
    update public.customers set company_id = (p->>'company_id')::uuid
     where id = v_customer_id and company_id is distinct from (p->>'company_id')::uuid;
  elsif nullif(btrim(coalesce(p->>'company_name','')),'') is not null then
    update public.customers set company_name = btrim(p->>'company_name')
     where id = v_customer_id and public.ceg_kulcs(company_name) is distinct from public.ceg_kulcs(p->>'company_name');
  elsif p ? 'company_id' then
    update public.customers set company_id = null, company_name = null
     where id = v_customer_id and (company_id is not null or company_name is not null);
  end if;

  select company_id into v_ceg from public.customers where id = v_customer_id;

  v_kind := coalesce(nullif(p->>'contract_kind','')::contract_kind,
                     v_regi.contract_kind,
                     (select contract_kind from public.vehicles where id = v_vehicle_id));

  update public.vehicles
     set plate_raw = coalesce(nullif(p->>'plate_raw',''), plate_raw),
         brand     = coalesce(nullif(p->>'brand',''), brand),
         model     = coalesce(nullif(p->>'model',''), model),
         category  = v_category,
         seats     = coalesce(nullif(p->>'seats','')::integer, seats),
         contract_kind = coalesce(nullif(p->>'contract_kind','')::contract_kind, contract_kind),
         updated_at = now()
   where id = v_vehicle_id;

  select * into v_calc
    from public.calc_service(v_package_id, v_category, v_scope, v_full, v_extras, v_pct, v_fix);
  select * into v_idok from public.foglalas_idok(p, v_date, v_type);

  update public.bookings
     set booking_type = v_type,
         service_date = v_date,
         start_at     = v_idok.start_at,
         drop_off_at  = v_idok.drop_off_at,
         pick_up_at   = v_idok.pick_up_at,
         deadline_at  = v_idok.deadline_at,
         package_id   = v_package_id,
         scope        = v_scope,
         full_service = v_full,
         planned_duration_minutes = coalesce(v_calc.work_minutes, 0),
         rest_minutes             = coalesce(v_calc.rest_minutes, 0),
         notes                    = nullif(trim(coalesce(p->>'notes','')), ''),
         updated_at = now()
   where id = p_booking_id;

  perform public.foglalas_tetelek_ir(p_booking_id, v_package_id, v_category, v_scope, v_full,
                                     v_extras, v_pct, v_fix, v_ceg, v_kind, v_type, v_date);

  perform public.rebuild_booking_tasks(p_booking_id);

  return p_booking_id;
end;
$$;


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
  v_helyettes boolean;
begin
  if public.my_role() is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'Nincs ilyen foglalás.';
  end if;
  select not public.helyettes_rendszam(v.plate_raw) into v_valodi from public.vehicles v where v.id = b.vehicle_id;
  select public.helyettes_ugyfel(c.name, c.phone, c.email) into v_helyettes from public.customers c where c.id = b.customer_id;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.id,
             'service_date', x.service_date,
             'plate_raw', case when public.helyettes_rendszam(v.plate_raw) then null else v.plate_raw end,
             'package_name', p.name,
             'status', x.status,
             'ugyanaz_auto', coalesce(v_valodi, false) and x.vehicle_id = b.vehicle_id,
             'ugyanaz_flotta', b.fleet_group is not null and x.fleet_group = b.fleet_group)
           order by x.service_date, x.created_at)
      from public.bookings x
      join public.vehicles v on v.id = x.vehicle_id
      left join public.packages p on p.id = x.package_id
     where x.customer_id = b.customer_id
       and x.id <> b.id
       and public.foglalas_aktiv(x.status)
       and (not coalesce(v_helyettes, false)
            or (b.fleet_group is not null and x.fleet_group = b.fleet_group)
            or (coalesce(v_valodi, false) and x.vehicle_id = b.vehicle_id))), '[]'::jsonb);
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
  v_helyettes boolean;
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
  v_helyettes := public.helyettes_ugyfel(c.name, c.phone, c.email);

  select coalesce(array_agg(x.id), '{}') into v_aktiv
    from public.bookings x
   where x.customer_id = b.customer_id and x.id <> b.id and public.foglalas_aktiv(x.status);

  select array_agg(distinct m) into v_mozog
    from (
      select b.id as m
      union all
      select x.id from public.bookings x
       where x.id = any (v_aktiv)
         and ((x.id = any (coalesce(p_tovabbi, '{}')) and not v_helyettes)
              or (b.fleet_group is not null and x.fleet_group = b.fleet_group)
              or (x.vehicle_id = b.vehicle_id
                  and not public.helyettes_rendszam((select v.plate_raw from public.vehicles v where v.id = b.vehicle_id))))
    ) t;

  if not v_helyettes and not exists (select 1 from unnest(v_aktiv) a where not (a = any (v_mozog))) then
    return b.customer_id;
  end if;

  if v_helyettes and not exists (select 1 from public.bookings x where x.customer_id = c.id and not (x.id = any (v_mozog))) then
    return b.customer_id;
  end if;

  insert into public.customers (name, phone, email, type, company_id, company_name, notes)
  values (c.name, c.phone, c.email, c.type, c.company_id, c.company_name, c.notes)
  returning id into v_uj;

  update public.bookings set customer_id = v_uj, updated_at = now() where id = any (v_mozog);

  update public.vehicles v
     set customer_id = v_uj, updated_at = now()
   where v.id in (select x.vehicle_id from public.bookings x where x.id = any (v_mozog))
     and v.customer_id = c.id
     and not exists (select 1 from public.bookings x
                      where x.vehicle_id = v.id and x.customer_id = c.id and public.foglalas_aktiv(x.status));

  return v_uj;
end;
$$;

revoke all on function public.foglalas_levalaszt(uuid, uuid[]) from public, anon;
grant execute on function public.foglalas_levalaszt(uuid, uuid[]) to authenticated;


create or replace function public.save_customer(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := (p->>'id')::uuid;
  v_c  public.customers%rowtype;
begin
  if not public.can_edit_customers() then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.'
      using errcode = '42501',
            hint = 'A foglaláshoz tartozó adatokat a foglalási ablakban tudod átírni.';
  end if;

  if v_id is null then
    raise exception 'Hiányzik az ügyfél azonosítója.';
  end if;

  select * into v_c from public.customers where id = v_id;
  if found
     and public.helyettes_ugyfel(v_c.name, v_c.phone, v_c.email)
     and (public.nev_kulcs(p->>'name') is not null
          or public.phone_norm(p->>'phone') is not null
          or nullif(trim(coalesce(p->>'email', '')), '') is not null)
     and (select count(distinct b.vehicle_id) from public.bookings b where b.customer_id = v_id) > 1 then
    raise exception 'Ez a „Névtelen” ügyfél több, egymástól független foglalást fog össze (név és telefonszám nélkül felvett autókat).'
      using hint = 'A nevet és a telefonszámot az adott foglalás munkalapján írd be, így csak ahhoz az autóhoz kerül.';
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
