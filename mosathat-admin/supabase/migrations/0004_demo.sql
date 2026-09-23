-- =============================================================================
--  MOSATHAT AUTÓKOZMETIKA — 0004 PRÓBAADATOK
-- =============================================================================
--  Ez NEM éles adat. Néhány ügyfél, jármű és foglalás, hogy legyen mit nézni
--  az adminban, amíg nincs valódi forgalom.
--
--  MIKOR TÖRÖLD: mielőtt élesben elkezditek használni. A legvégén van egy
--  parancs, ami mindent kiszed, amit ez a fájl beírt.
--
--  Minden itt létrehozott sor megjegyzésébe bekerül a "DEMO" szó, hogy
--  később egyértelmű legyen, mi próbaadat.
-- =============================================================================

do $$
declare
  v_start uuid := (select id from public.packages where code = 'START');
  v_prem  uuid := (select id from public.packages where code = 'PREMIUM');
  v_elit  uuid := (select id from public.packages where code = 'ELIT');

  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_ker uuid;
  v_v1 uuid; v_v2 uuid; v_v3 uuid; v_v4 uuid; v_vk1 uuid; v_vk2 uuid;
  v_b  uuid;
  v_calc record;
  v_ar        record;
  v_jarmu     uuid;
  v_kategoria vehicle_category;
  v_felni uuid := (select id from public.extras where name like 'Felni és gumi%');
  v_karp  uuid := (select id from public.extras where name = 'Vizes kárpittisztítás');
  v_ma    date := current_date;
begin

  -- ---------- ÜGYFELEK ----------
  insert into public.customers (type, name, phone, email, internal_notes)
  values ('MAGAN', 'Kovács Péter', '+36 30 111 2233', 'kovacs.peter@example.com', 'DEMO')
  returning id into v_c1;

  insert into public.customers (type, name, phone, internal_notes)
  values ('MAGAN', 'Nagy Anita', '+36 20 555 8890', 'DEMO')
  returning id into v_c2;

  insert into public.customers (type, name, phone, email, internal_notes)
  values ('MAGAN', 'Tóth Gergő', '+36 70 244 1100', 'toth.gergo@example.com', 'DEMO')
  returning id into v_c3;

  insert into public.customers (type, name, phone, internal_notes)
  values ('MAGAN', 'Szabó Márk', '+36 30 777 4412', 'DEMO')
  returning id into v_c4;

  -- céges ügyfél: az autókereskedő, akinek a kocsijai napokig állnak nálunk
  insert into public.customers (type, name, phone, company_name, tax_number,
                                default_travel_minutes, internal_notes)
  values ('CEG', 'Autó Trans Kft.', '+36 1 999 1234', 'Autó Trans Kft.',
          '12345678-2-41', 25, 'DEMO — szerződött partner, HozomViszem')
  returning id into v_ker;

  -- ---------- JÁRMŰVEK ----------
  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_c1, 'ABC-123', 'SZEMELYAUTO', 'BMW', '530d', 5, 'DEMO')
  returning id into v_v1;

  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_c2, 'LMN-882', 'SZEMELYAUTO', 'Škoda', 'Octavia', 5, 'DEMO')
  returning id into v_v2;

  -- új magyar rendszámformátum, hogy az is látsszon a felületen
  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_c3, 'AABB-123', 'SUV', 'Toyota', 'RAV4', 5, 'DEMO')
  returning id into v_v3;

  -- kisbusz: ezen látszik, hogy a Full Service nála árajánlatos,
  -- mert a csomagár öt ülésre szól
  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_c4, 'PQR-450', 'KISBUSZ', 'VW', 'Transporter', 9, 'DEMO')
  returning id into v_v4;

  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_ker, 'KER-100', 'SZEMELYAUTO', 'VW', 'Passat B8', 5, 'DEMO')
  returning id into v_vk1;

  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_ker, 'KER-214', 'SZEMELYAUTO', 'Opel', 'Astra', 5, 'DEMO')
  returning id into v_vk2;


  -- ==========================================================================
  --  MAI FOGLALÁSOK
  --  Figyeld meg: az árat és az időt NEM kézzel írjuk be, hanem a
  --  calc_service() számolja ki — ugyanaz a függvény, amit az admin is hív.
  --  Így a próbaadat is a valódi logikán megy át.
  -- ==========================================================================

  -- 1) Premium sedan + felni mélytisztítás, az ügyfél megvárja
  select * into v_calc from public.calc_service(
    v_prem, 'SZEMELYAUTO', 'TELJES', false,
    jsonb_build_array(jsonb_build_object('extra_id', v_felni, 'quantity', 1)));

  insert into public.bookings (
    customer_id, vehicle_id, booking_type, status, source, service_date,
    start_at, package_id, scope, planned_duration_minutes, rest_minutes,
    estimated_price_huf, internal_notes)
  values (v_c1, v_v1, 'VAROS', 'IN_PROGRESS', 'TELEFON', v_ma,
    (v_ma + time '08:00') at time zone 'Europe/Budapest',
    v_prem, 'TELJES', v_calc.work_minutes, v_calc.rest_minutes,
    v_calc.price_huf, 'DEMO')
  returning id into v_b;

  insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                    quantity, unit_price_huf, price_huf, work_minutes)
  values (v_b, 'PACKAGE', v_prem, 'Premium — Sedan, külső és belső', 1, 15600, 15600, 90),
         (v_b, 'EXTRA', v_felni, 'Felni és gumi mélytisztítás', 1, 0, 0, 30);
  perform public.rebuild_booking_tasks(v_b);
  -- a mosás első négy lépése már kész
  update public.booking_tasks set done = true, done_at = now()
   where booking_id = v_b and sort_order <= 40;

  -- 2) Start sedan, leadós — reggel 7:20-kor hozta, délután viszi
  select * into v_calc from public.calc_service(v_start, 'SZEMELYAUTO', 'TELJES');
  insert into public.bookings (
    customer_id, vehicle_id, booking_type, status, source, service_date,
    drop_off_at, pick_up_at, package_id, scope,
    planned_duration_minutes, estimated_price_huf, internal_notes)
  values (v_c2, v_v2, 'LEADOS', 'ARRIVED', 'TELEFON', v_ma,
    (v_ma + time '07:20') at time zone 'Europe/Budapest',
    (v_ma + time '16:30') at time zone 'Europe/Budapest',
    v_start, 'TELJES', v_calc.work_minutes, v_calc.price_huf, 'DEMO')
  returning id into v_b;
  insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                    quantity, unit_price_huf, price_huf, work_minutes)
  values (v_b, 'PACKAGE', v_start, 'Start — Sedan, külső és belső', 1, 12800, 12800, 60);
  perform public.rebuild_booking_tasks(v_b);

  -- 3) Premium SUV + Full Service — holnapig marad, mert szárad a kárpit
  select * into v_calc from public.calc_service(v_prem, 'SUV', 'TELJES', true);
  insert into public.bookings (
    customer_id, vehicle_id, booking_type, status, source, service_date,
    drop_off_at, pick_up_at, package_id, scope, full_service,
    planned_duration_minutes, rest_minutes, estimated_price_huf, notes, internal_notes)
  values (v_c3, v_v3, 'LEADOS', 'CONFIRMED', 'ONLINE', v_ma,
    (v_ma + time '10:15') at time zone 'Europe/Budapest',
    (v_ma + 1 + time '09:00') at time zone 'Europe/Budapest',
    v_prem, 'TELJES', true,
    v_calc.work_minutes, v_calc.rest_minutes, v_calc.price_huf,
    'A kárpit 24 órát szárad, holnap reggel viszi.', 'DEMO')
  returning id into v_b;
  insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                    quantity, unit_price_huf, price_huf, work_minutes)
  values (v_b, 'FULL_SERVICE', v_prem, 'Premium + Full Service — SUV, 5 ülés',
          1, 45000, 45000, 150);
  perform public.rebuild_booking_tasks(v_b);

  -- 4) Elit kisbusz, várós — délelőtt, épp belefér az ebéd előtt
  select * into v_calc from public.calc_service(v_elit, 'KISBUSZ', 'TELJES');
  insert into public.bookings (
    customer_id, vehicle_id, booking_type, status, source, service_date,
    start_at, package_id, scope, planned_duration_minutes,
    estimated_price_huf, internal_notes)
  values (v_c4, v_v4, 'VAROS', 'CONFIRMED', 'TELEFON', v_ma,
    (v_ma + time '09:30') at time zone 'Europe/Budapest',
    v_elit, 'TELJES', v_calc.work_minutes, v_calc.price_huf, 'DEMO')
  returning id into v_b;
  insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                    quantity, unit_price_huf, price_huf, work_minutes)
  values (v_b, 'PACKAGE', v_elit, 'Elit — Kisbusz, külső és belső', 1, 25900, 25900, 150);
  perform public.rebuild_booking_tasks(v_b);


  -- ==========================================================================
  --  TÖBB NAPOS MUNKÁK — a kereskedő autói
  --  Ezek NEM terhelik a napi kapacitást, mert nyitvatartáson kívül készülnek.
  -- ==========================================================================

  select * into v_calc from public.calc_service(v_elit, 'SZEMELYAUTO', 'TELJES');
  insert into public.bookings (
    customer_id, vehicle_id, booking_type, status, source, service_date,
    arrived_at, deadline_at, package_id, scope,
    planned_duration_minutes, estimated_price_huf, internal_notes)
  values (v_ker, v_vk1, 'TOBBNAPOS', 'IN_PROGRESS', 'TELEFON', v_ma - 3,
    (v_ma - 3 + time '08:00') at time zone 'Europe/Budapest',
    (v_ma + 1 + time '17:00') at time zone 'Europe/Budapest',
    v_elit, 'TELJES', v_calc.work_minutes, v_calc.price_huf,
    'DEMO — kereskedős autó, polírozás is kell')
  returning id into v_b;
  insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                    quantity, unit_price_huf, price_huf, work_minutes)
  values (v_b, 'PACKAGE', v_elit, 'Elit — Sedan, külső és belső', 1, 19800, 19800, 120);
  perform public.rebuild_booking_tasks(v_b);
  -- hajnalban dolgoztak rajta: a lépések 6:40-kor lettek kipipálva
  update public.booking_tasks
     set done = true, done_at = (v_ma - 1 + time '06:40') at time zone 'Europe/Budapest'
   where booking_id = v_b and sort_order <= 50;

  select * into v_calc from public.calc_service(v_prem, 'SZEMELYAUTO', 'TELJES');
  insert into public.bookings (
    customer_id, vehicle_id, booking_type, status, source, service_date,
    arrived_at, deadline_at, package_id, scope,
    planned_duration_minutes, estimated_price_huf, internal_notes)
  values (v_ker, v_vk2, 'TOBBNAPOS', 'CONFIRMED', 'TELEFON', v_ma - 1,
    (v_ma - 1 + time '15:00') at time zone 'Europe/Budapest',
    (v_ma + 2 + time '17:00') at time zone 'Europe/Budapest',
    v_prem, 'TELJES', v_calc.work_minutes, v_calc.price_huf, 'DEMO')
  returning id into v_b;
  insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                    quantity, unit_price_huf, price_huf, work_minutes)
  values (v_b, 'PACKAGE', v_prem, 'Premium — Sedan, külső és belső', 1, 15600, 15600, 90);
  perform public.rebuild_booking_tasks(v_b);
  update public.booking_tasks set done = true, done_at = now() - interval '20 hours'
   where booking_id = v_b and sort_order <= 20;


  -- ==========================================================================
  --  KORÁBBI, LEZÁRT MUNKÁK
  --  Ezektől lesz mit mutatni az "Új időpont" ablakban a "Korábban ezeket
  --  kérte" listában, amikor beírod a rendszámot.
  -- ==========================================================================
  for v_calc in
    select * from (values
      (1,  42, 'PREMIUM'), (1, 111, 'PREMIUM'), (1, 187, 'ELIT'),
      (2,  22, 'START'),   (2,  67, 'START'),
      (3, 116, 'PREMIUM')
    ) as t(ki, napja, csomag)
  loop
    -- A jármű SAJÁT kategóriájával számolunk, nem beégetett személyautóval:
    -- a Toyota RAV4 SUV, és a Premium SUV nem annyi, mint a Premium sedan.
    -- Az árat és az időt ugyanaz a calc_service() adja, amit az admin hív.
    v_jarmu    := case v_calc.ki when 1 then v_v1 when 2 then v_v2 else v_v3 end;
    v_kategoria := (select category from public.vehicles where id = v_jarmu);

    select * into v_ar
      from public.calc_service(
        (select id from public.packages where code = v_calc.csomag),
        v_kategoria, 'TELJES', false, '[]'::jsonb, 0, 0);

    insert into public.bookings (
      customer_id, vehicle_id, booking_type, status, source, service_date,
      start_at, package_id, scope, planned_duration_minutes,
      estimated_price_huf, final_price_huf,
      actual_started_at, actual_finished_at, internal_notes)
    values (
      case v_calc.ki when 1 then v_c1 when 2 then v_c2 else v_c3 end,
      v_jarmu,
      'VAROS', 'COMPLETED', 'TELEFON', v_ma - v_calc.napja,
      (v_ma - v_calc.napja + time '09:00') at time zone 'Europe/Budapest',
      (select id from public.packages where code = v_calc.csomag),
      'TELJES', coalesce(v_ar.work_minutes, 0),
      v_ar.price_huf, v_ar.price_huf,
      (v_ma - v_calc.napja + time '09:05') at time zone 'Europe/Budapest',
      -- a valós munkaidő szándékosan tér el a tervezettől: pont ez az
      -- eltérés lesz később a leghasznosabb adat
      (v_ma - v_calc.napja + time '09:05'
        + (coalesce(v_ar.work_minutes, 90) - 8) * interval '1 minute')
        at time zone 'Europe/Budapest',
      'DEMO');
  end loop;

end $$;


-- =============================================================================
--  ELLENŐRZÉS
-- =============================================================================
select 'ügyfél' as mi, count(*) from public.customers
union all select 'jármű',    count(*) from public.vehicles
union all select 'foglalás', count(*) from public.bookings
union all select 'tétel',    count(*) from public.booking_items
union all select 'munkalépés', count(*) from public.booking_tasks;

select * from public.day_capacity(current_date);


-- =============================================================================
--  A PRÓBAADATOK TÖRLÉSE
-- =============================================================================
--  Amikor élesben indultok, futtasd le ezt a blokkot. A foglalások, tételek
--  és munkalépések a kapcsolatok miatt maguktól törlődnek az ügyféllel együtt.
--
--  delete from public.customers where internal_notes like 'DEMO%';
--
--  Utána ellenőrizd, hogy üres-e:
--  select count(*) from public.bookings;
-- =============================================================================
