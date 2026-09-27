-- =============================================================================
--  20260927100000_full_service_nev.sql
--  A Full Service tételsor neve a munkalapon
-- =============================================================================
--  A régi szöveg — „Full Service (mélytisztítás)" — nem mondta meg, mit tartalmaz.
--  Az új: „Full Service (Csomag+Kárpit/Bőrtisztítás)".
--
--  MIÉRT KELL EHHEZ MIGRÁCIÓ, ha csak egy felirat?
--
--  Mert ez nem felirat, hanem ADAT. A foglalás tételsorai a booking_items
--  táblában élnek, és a name_snapshot oszlopba az kerül, ahogy a tételt a
--  foglalás pillanatában hívtuk. Ez szándékos: ha jövőre átnevezünk egy
--  szolgáltatást, egy tavalyi munkalapon akkor is az álljon, ami akkor
--  elhangzott az ügyfélnek.
--
--  A nevet két függvény írja be:
--    create_booking  – új foglaláskor
--    update_booking  – minden módosításkor (a helyben szerkesztés is ezen megy)
--
--  A .sql fájlok ÁTÍRÁSA önmagában semmit nem csinál: azok a migrációk már
--  lefutottak az adatbázison. A függvényt új migrációban kell újradefiniálni
--  — ez a fájl pontosan ezt teszi. A két függvény törzse egy karakter
--  eltéréssel ugyanaz, mint az eredeti: a szövegen kívül semmi nem változott.
--
--  A MÁR MEGLÉVŐ SOROK:
--  A lezárt munkalapokat nem bántjuk — azok a maguk idejének a dokumentumai.
--  A még nyitott foglalásokon viszont átírjuk, mert azokat még most olvassák
--  fel az ügyfélnek, és ott a régi szöveg csak félreértést szülne.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1. Új foglalás
-- -----------------------------------------------------------------------------

create or replace function public.create_booking(p jsonb)
returns uuid
language plpgsql
volatile
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
  v_calc        record;
  v_start       timestamptz;
  v_drop        timestamptz;
  v_pick        timestamptz;
  v_deadline    timestamptz;
  v_staff       uuid;
  v_items_sum   integer := 0;
  v_sort        integer := 0;
  v_pp          record;
  v_fs          record;
  r             record;
  v_qty         numeric;
  v_line        integer;
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
  v_staff      := (select s.id from public.staff s where s.id = auth.uid());

  if v_category is null then raise exception 'Hiányzik a járműkategória.'; end if;
  if v_type     is null then raise exception 'Hiányzik a foglalás típusa.';  end if;
  if v_date     is null then raise exception 'Hiányzik a dátum.';            end if;

  -- ---------- 1. ÜGYFÉL ----------
  v_customer_id := nullif(p->>'customer_id','')::uuid;

  if v_customer_id is null then
    -- Ugyanazt a telefonszámot nem visszük fel kétszer: ha már ismerjük,
    -- ahhoz kötjük az autót. A telefonszám a gyakorlatban az azonosító.
    select c.id into v_customer_id
      from public.customers c
     where regexp_replace(c.phone, '[^0-9]', '', 'g')
         = regexp_replace(coalesce(p->>'customer_phone',''), '[^0-9]', '', 'g')
       and regexp_replace(coalesce(p->>'customer_phone',''), '[^0-9]', '', 'g') <> ''
     limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (name, phone, type)
    values (coalesce(nullif(p->>'customer_name',''), 'Névtelen'),
            coalesce(nullif(p->>'customer_phone',''), '—'),
            'MAGAN')
    returning id into v_customer_id;
  else
    -- amit most mondott, azt elmentjük, de nem törlünk felül meglévőt üressel
    update public.customers
       set name  = coalesce(nullif(p->>'customer_name',''),  name),
           phone = coalesce(nullif(p->>'customer_phone',''), phone),
           updated_at = now()
     where id = v_customer_id;
  end if;

  -- ---------- 2. JÁRMŰ ----------
  v_vehicle_id := nullif(p->>'vehicle_id','')::uuid;

  if v_vehicle_id is null and coalesce(p->>'plate_raw','') <> '' then
    select v.id into v_vehicle_id
      from public.vehicles v
     where v.plate_normalized = upper(regexp_replace(p->>'plate_raw', '[^A-Za-z0-9]', '', 'g'))
     limit 1;
  end if;

  if v_vehicle_id is null then
    insert into public.vehicles (customer_id, plate_raw, plate_country, brand, model, category, seats)
    values (v_customer_id,
            coalesce(nullif(p->>'plate_raw',''), '—'),
            coalesce(nullif(p->>'plate_country',''), 'HU'),
            nullif(p->>'brand',''),
            nullif(p->>'model',''),
            v_category,
            nullif(p->>'seats','')::integer)
    returning id into v_vehicle_id;
  else
    update public.vehicles
       set brand    = coalesce(nullif(p->>'brand',''),  brand),
           model    = coalesce(nullif(p->>'model',''),  model),
           category = v_category,      -- a felvevő most látja az autót
           seats    = coalesce(nullif(p->>'seats','')::integer, seats),
           updated_at = now()
     where id = v_vehicle_id;
  end if;

  -- ---------- 3. ÁR ÉS IDŐ ----------
  select * into v_calc
    from public.calc_service(v_package_id, v_category, v_scope, v_full, v_extras, v_pct, v_fix);

  -- ---------- időpontok ----------
  if nullif(p->>'start_time','') is not null then
    v_start := (v_date + (p->>'start_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'drop_off_time','') is not null then
    v_drop := (v_date + (p->>'drop_off_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'pick_up_time','') is not null then
    v_pick := (v_date + (p->>'pick_up_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'deadline_date','') is not null then
    v_deadline := ((p->>'deadline_date')::date
                   + coalesce(nullif(p->>'deadline_time','')::time, time '17:00'))
                  at time zone 'Europe/Budapest';
  end if;

  -- ---------- 4. FOGLALÁS ----------
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
    v_start, v_drop, v_pick, v_deadline,
    v_package_id, v_scope, v_full,
    coalesce(v_calc.work_minutes, 0),   -- ha nem ismert, 0 kerül be, és a
                                        -- felület jelzi, hogy pótolni kell
    coalesce(v_calc.rest_minutes, 0),
    coalesce(v_calc.price_huf, 0),
    nullif(p->>'notes',''),
    nullif(p->>'internal_notes',''),
    v_staff)
  returning id into v_booking_id;

  -- ---------- 5. TÉTELEK ----------
  -- Pillanatfelvétel: a név és az ár ide bemásolódik. Ha jövő januárban
  -- emelünk árat, a tavalyi foglalás akkor is a tavalyi árat mutatja.

  if v_package_id is not null then
    select pp.price_huf, pp.duration_minutes into v_pp
      from public.package_pricing pp
     where pp.package_id = v_package_id and pp.category = v_category and pp.scope = v_scope;

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    select v_booking_id, 'PACKAGE', v_package_id,
           pk.name || case when v_scope = 'TELJES' then '' else ' — ' || v_scope::text end,
           1, coalesce(v_pp.price_huf,0), coalesce(v_pp.price_huf,0),
           coalesce(v_pp.duration_minutes,0), v_sort
      from public.packages pk where pk.id = v_package_id;

    v_items_sum := v_items_sum + coalesce(v_pp.price_huf, 0);
    v_sort := v_sort + 1;
  end if;

  if v_full then
    select fp.price_huf into v_fs
      from public.full_service_pricing fp
     where fp.package_id = v_package_id and fp.category = v_category;

    -- A Full Service SAJÁT ártáblából megy, nem csomag + extra összegként.
    -- A tételsoron a különbözet jelenik meg, hogy a sorok összege stimmeljen.
    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (v_booking_id, 'FULL_SERVICE', null, 'Full Service (Csomag+Kárpit/Bőrtisztítás)',
            1, coalesce(v_fs.price_huf,0) - v_items_sum, coalesce(v_fs.price_huf,0) - v_items_sum,
            coalesce((select extra_work_minutes from public.full_service_pricing
                       where package_id = v_package_id and category = v_category), 45),
            v_sort);

    v_items_sum := coalesce(v_fs.price_huf, v_items_sum);
    v_sort := v_sort + 1;
  end if;

  for r in
    select e.*, coalesce((x->>'quantity')::numeric, 1) as qty
      from jsonb_array_elements(v_extras) as x
      join public.extras e on e.id = (x->>'extra_id')::uuid
     order by e.sort_order
  loop
    v_qty  := greatest(r.qty, 1);
    v_line := case
                when r.requires_quote or r.price_huf is null then 0
                when r.price_unit = 'ALKALOM' then r.price_huf
                else (r.price_huf * v_qty)::integer
              end;

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (v_booking_id, 'EXTRA', r.id, r.name,
            v_qty, coalesce(r.price_huf, 0), v_line,
            coalesce(r.work_minutes,0) * case when r.duration_unit = 'ALKALOM' then 1 else v_qty end,
            v_sort);

    v_items_sum := v_items_sum + v_line;
    v_sort := v_sort + 1;
  end loop;

  -- A felár sora pontosan a maradékot viszi. Így a tételsorok összege
  -- mindig egyezik a foglalás végösszegével, kerekítéssel együtt.
  if coalesce(v_calc.price_huf,0) <> v_items_sum then
    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (v_booking_id, 'SURCHARGE', null,
            case when v_pct <> 0 and v_fix <> 0 then 'Felár (' || v_pct || '% + fix)'
                 when v_pct <> 0                then 'Felár (' || v_pct || '%)'
                 else 'Felár' end,
            1,
            coalesce(v_calc.price_huf,0) - v_items_sum,
            coalesce(v_calc.price_huf,0) - v_items_sum,
            0, v_sort);
  end if;

  -- ---------- 6. MUNKALISTA ----------
  perform public.rebuild_booking_tasks(v_booking_id);

  return v_booking_id;
end;
$$;


-- -----------------------------------------------------------------------------
--  2. Foglalás módosítása
-- -----------------------------------------------------------------------------

create or replace function public.update_booking(p_booking_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
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
  v_calc        record;
  v_start       timestamptz;
  v_drop        timestamptz;
  v_pick        timestamptz;
  v_deadline    timestamptz;
  v_items_sum   integer := 0;
  v_sort        integer := 0;
  v_pp          record;
  v_fs          record;
  r             record;
  v_qty         numeric;
  v_line        integer;
begin
  select * into v_regi from public.bookings where id = p_booking_id;
  if v_regi is null then
    raise exception 'Nincs ilyen foglalás: %', p_booking_id;
  end if;
  if v_regi.status = 'COMPLETED' then
    raise exception 'A foglalás le van zárva. Módosításhoz előbb vissza kell nyitni.';
  end if;

  -- A kategória a JÁRMŰRŐL jön, ha az űrlap nem adja meg.
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

  v_customer_id := v_regi.customer_id;
  v_vehicle_id  := v_regi.vehicle_id;

  -- ---------- ügyfél és jármű frissítése ----------
  -- Üres értékkel nem írunk felül meglévőt: ha a felvevő nem tudja a nevet,
  -- attól még nem kell elveszíteni, amit korábban tudtunk.
  update public.customers
     set name  = coalesce(nullif(p->>'customer_name',''),  name),
         phone = coalesce(nullif(p->>'customer_phone',''), phone),
         company_name = coalesce(nullif(p->>'company_name',''), company_name),
         updated_at = now()
   where id = v_customer_id;

  update public.vehicles
     set plate_raw = coalesce(nullif(p->>'plate_raw',''), plate_raw),
         brand     = coalesce(nullif(p->>'brand',''), brand),
         model     = coalesce(nullif(p->>'model',''), model),
         category  = v_category,
         seats     = coalesce(nullif(p->>'seats','')::integer, seats),
         updated_at = now()
   where id = v_vehicle_id;

  -- ---------- ár és idő újraszámolása ----------
  select * into v_calc
    from public.calc_service(v_package_id, v_category, v_scope, v_full, v_extras, v_pct, v_fix);

  -- ---------- időpontok ----------
  if nullif(p->>'start_time','') is not null then
    v_start := (v_date + (p->>'start_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'drop_off_time','') is not null then
    v_drop := (v_date + (p->>'drop_off_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'pick_up_time','') is not null then
    v_pick := (v_date + (p->>'pick_up_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'deadline_date','') is not null then
    v_deadline := ((p->>'deadline_date')::date
                   + coalesce(nullif(p->>'deadline_time','')::time, time '17:00'))
                  at time zone 'Europe/Budapest';
  end if;

  -- ---------- a foglalás ----------
  update public.bookings
     set booking_type = v_type,
         service_date = v_date,
         start_at     = v_start,
         drop_off_at  = v_drop,
         pick_up_at   = v_pick,
         deadline_at  = v_deadline,
         package_id   = v_package_id,
         scope        = v_scope,
         full_service = v_full,
         planned_duration_minutes = coalesce(v_calc.work_minutes, 0),
         rest_minutes             = coalesce(v_calc.rest_minutes, 0),
         estimated_price_huf      = coalesce(v_calc.price_huf, 0),
         notes                    = nullif(trim(coalesce(p->>'notes','')), ''),
         updated_at = now()
   where id = p_booking_id;

  -- ---------- tételsorok újraírása ----------
  -- A tételek a MOSTANI állapotot tükrözik, ezért teljesen újraépülnek.
  delete from public.booking_items where booking_id = p_booking_id;

  if v_package_id is not null then
    select pp.price_huf, pp.duration_minutes into v_pp
      from public.package_pricing pp
     where pp.package_id = v_package_id and pp.category = v_category and pp.scope = v_scope;

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    select p_booking_id, 'PACKAGE', v_package_id,
           pk.name || case when v_scope = 'TELJES' then '' else ' — ' || v_scope::text end,
           1, coalesce(v_pp.price_huf,0), coalesce(v_pp.price_huf,0),
           coalesce(v_pp.duration_minutes,0), v_sort
      from public.packages pk where pk.id = v_package_id;

    v_items_sum := v_items_sum + coalesce(v_pp.price_huf, 0);
    v_sort := v_sort + 1;
  end if;

  if v_full then
    select fp.price_huf into v_fs
      from public.full_service_pricing fp
     where fp.package_id = v_package_id and fp.category = v_category;

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (p_booking_id, 'FULL_SERVICE', null, 'Full Service (Csomag+Kárpit/Bőrtisztítás)',
            1, coalesce(v_fs.price_huf,0) - v_items_sum, coalesce(v_fs.price_huf,0) - v_items_sum,
            coalesce((select extra_work_minutes from public.full_service_pricing
                       where package_id = v_package_id and category = v_category), 45),
            v_sort);

    v_items_sum := coalesce(v_fs.price_huf, v_items_sum);
    v_sort := v_sort + 1;
  end if;

  for r in
    select e.*, coalesce((x->>'quantity')::numeric, 1) as qty
      from jsonb_array_elements(v_extras) as x
      join public.extras e on e.id = (x->>'extra_id')::uuid
     order by e.sort_order
  loop
    v_qty  := greatest(r.qty, 1);
    v_line := case
                when r.requires_quote or r.price_huf is null then 0
                when r.price_unit = 'ALKALOM' then r.price_huf
                else (r.price_huf * v_qty)::integer
              end;

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (p_booking_id, 'EXTRA', r.id, r.name,
            v_qty, coalesce(r.price_huf, 0), v_line,
            coalesce(r.work_minutes,0) * case when r.duration_unit = 'ALKALOM' then 1 else v_qty end,
            v_sort);

    v_items_sum := v_items_sum + v_line;
    v_sort := v_sort + 1;
  end loop;

  if coalesce(v_calc.price_huf,0) <> v_items_sum then
    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (p_booking_id, 'SURCHARGE', null, 'Felár',
            1,
            coalesce(v_calc.price_huf,0) - v_items_sum,
            coalesce(v_calc.price_huf,0) - v_items_sum,
            0, v_sort);
  end if;

  -- ---------- munkalista ----------
  -- A rebuild megtartja a már kipipált lépéseket, és csak a különbséget
  -- vezeti át. Ha az ügyfél Premiumról Elitre vált, a kimosott karosszéria
  -- pipája nem vész el.
  perform public.rebuild_booking_tasks(p_booking_id);

  return p_booking_id;
end;
$$;


-- -----------------------------------------------------------------------------
--  3. A még nyitott foglalások tételsorai
-- -----------------------------------------------------------------------------

update public.booking_items bi
   set name_snapshot = 'Full Service (Csomag+Kárpit/Bőrtisztítás)'
  from public.bookings b
 where b.id = bi.booking_id
   and bi.kind = 'FULL_SERVICE'
   and bi.name_snapshot = 'Full Service (mélytisztítás)'
   and b.status <> 'COMPLETED';
