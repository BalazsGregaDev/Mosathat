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
--  A DEMÓ SZOMBATJA
-- =============================================================================
--  Az éles törzsadatban szombat zárva van, és ez így helyes. A próbaadat
--  viszont a MAI napra teszi a foglalásokat, bármilyen nap is van — ha pedig
--  a mai nap zárva van, az Áttekintés egy olyan hetet mutat, amiben nulla
--  munka van, közben négy autó bent áll. Nem hibás a szoftver: a próbaadat
--  világa lenne önmagával ellentmondásban.
--
--  Ezért a demóban szombat nyitva van, vasárnap viszont marad zárva — így a
--  hét hét napjából hat konzisztens, és közben megmarad egy valóban zárt nap,
--  amin látszik, hogy a felület a zárt napot is helyesen kezeli.
--
--  Ez a blokk SZÁNDÉKOSAN nincs a migrációk között: élesbe nem megy ki.
-- =============================================================================
insert into public.business_hours (weekday, opens, closes, closed)
values (6, '08:00', '14:00', false)
on conflict (weekday) do update
  set opens = excluded.opens, closes = excluded.closes, closed = excluded.closed;

insert into public.working_hours (weekday, starts, ends, closed)
values (6, '07:30', '14:00', false)
on conflict (weekday) do update
  set starts = excluded.starts, ends = excluded.ends, closed = excluded.closed;


-- =============================================================================
--  EGY EGÉSZ HÉT FORGALMA
-- =============================================================================
--  Az Áttekintés heti kapacitássávjai csak akkor mondanak bármit, ha van mit
--  mutatniuk. Ez a blokk a MOSTANI hét hétfő–péntekjét tölti fel úgy, hogy
--  legyen benne bőven szabad nap, egy szoros nap és egy majdnem tele nap —
--  vagyis mind a három terhelési állapot látszódjon.
--
--  A státusz a naptól függ: ami elmúlt, az lezárt; ami ma van, az folyamatban;
--  ami jön, az visszaigazolt. Így a hét bármelyik napján nyitod meg, koherens.
-- =============================================================================
do $$
declare
  r        record;
  v_nap    date;
  v_h      date := date_trunc('week', current_date)::date;   -- hétfő
  v_cust   uuid;
  v_veh    uuid;
  v_ar     record;
  v_stat   booking_status;
begin
  for r in
    select * from (values
      -- hétfő: ráérős nap
      (1, 'ELIT',    'SZEMELYAUTO', 'LMN-204', 'Audi',       'A4',        'Tóth Gergő'),
      (1, 'PREMIUM', 'SUV',         'RPX-618', 'Kia',        'Sportage',  'Barna Réka'),
      (1, 'PREMIUM', 'SZEMELYAUTO', 'HFE-330', 'Opel',       'Astra',     'Décsi Márk'),
      (1, 'START',   'SZEMELYAUTO', 'KTU-905', 'Suzuki',     'Swift',     'Faragó Nóra'),
      -- kedd: szoros
      (2, 'ELIT',    'KISBUSZ',     'VBN-712', 'Ford',       'Transit',   'Szalai Bence'),
      (2, 'ELIT',    'SUV',         'DJW-441', 'Volvo',      'XC60',      'Holló Eszter'),
      (2, 'PREMIUM', 'KISBUSZ',     'MZC-158', 'Renault',    'Trafic',    'Vass Tibor'),
      (2, 'PREMIUM', 'SUV',         'GYT-863', 'Mazda',      'CX-5',      'Kelemen Júlia'),
      (2, 'ELIT',    'SZEMELYAUTO', 'SOB-027', 'Skoda',      'Superb',    'Baranyi Ádám'),
      (2, 'START',   'SZEMELYAUTO', 'PFL-596', 'Dacia',      'Sandero',   'Illés Kata'),
      -- szerda: majdnem tele
      (3, 'ELIT',    'KISBUSZ',     'WNA-334', 'Mercedes',   'Vito',      'Rácz Levente'),
      (3, 'ELIT',    'KISBUSZ',     'CZK-780', 'VW',         'Transporter', 'Molnár Dóra'),
      (3, 'ELIT',    'SUV',         'TQE-215', 'BMW',        'X3',        'Bogdán Zsolt'),
      (3, 'ELIT',    'SZEMELYAUTO', 'HRV-648', 'Lexus',      'IS',        'Csorba Anna'),
      (3, 'PREMIUM', 'KISBUSZ',     'JMD-901', 'Fiat',       'Ducato',    'Sipos Balázs'),
      (3, 'PREMIUM', 'SUV',         'YXL-473', 'Hyundai',    'Tucson',    'Végh Krisztina'),
      (3, 'PREMIUM', 'SZEMELYAUTO', 'BUC-359', 'Toyota',     'Corolla',   'Fodor Máté'),
      -- csütörtök: fele
      (4, 'PREMIUM', 'SUV',         'NKP-186', 'Nissan',     'Qashqai',   'Szabó Villő'),
      (4, 'PREMIUM', 'SZEMELYAUTO', 'GDT-742', 'Honda',      'Civic',     'Lantos Emese'),
      (4, 'ELIT',    'SZEMELYAUTO', 'ZVE-508', 'Mercedes',   'C220',      'Pintér Attila'),
      (4, 'START',   'SUV',         'AOR-267', 'Jeep',       'Renegade',  'Halász Gábor'),
      (4, 'START',   'SZEMELYAUTO', 'EWB-930', 'Seat',       'Ibiza',     'Bognár Lilla'),
      -- péntek: alig
      (5, 'PREMIUM', 'SZEMELYAUTO', 'TSM-415', 'Peugeot',    '308',       'Kozma Dávid'),
      (5, 'START',   'SUV',         'IUD-673', 'Dacia',      'Duster',    'Márkus Petra'),
      (5, 'START',   'SZEMELYAUTO', 'QLN-829', 'Citroen',    'C3',        'Erdős Zoltán')
    ) as t(dow, csomag, kat, rendszam, marka, modell, nev)
  loop
    v_nap := v_h + (r.dow - 1);

    insert into public.customers (type, name, phone, internal_notes)
    values ('MAGAN', r.nev,
            '+36 ' || (20 + (r.dow * 7) % 60)::text || ' ' ||
            lpad(((abs(hashtext(r.rendszam)) % 900) + 100)::text, 3, '0') || ' ' ||
            lpad(((abs(hashtext(r.nev)) % 9000) + 1000)::text, 4, '0'),
            'DEMO')
    returning id into v_cust;

    insert into public.vehicles (customer_id, plate_raw, brand, model, category, notes)
    values (v_cust, r.rendszam, r.marka, r.modell, r.kat::vehicle_category, 'DEMO')
    returning id into v_veh;

    select * into v_ar
      from public.calc_service(
        (select id from public.packages where code = r.csomag),
        r.kat::vehicle_category, 'TELJES', false, '[]'::jsonb, 0, 0);

    v_stat := case
      when v_nap <  current_date then 'COMPLETED'
      when v_nap =  current_date then 'CONFIRMED'
      else 'CONFIRMED' end::booking_status;

    insert into public.bookings (
      customer_id, vehicle_id, booking_type, status, source, service_date,
      start_at, package_id, scope, planned_duration_minutes,
      estimated_price_huf, final_price_huf,
      actual_started_at, actual_finished_at, internal_notes)
    values (
      v_cust, v_veh, 'LEADOS', v_stat, 'ONLINE', v_nap,
      (v_nap + time '08:00' + ((abs(hashtext(r.rendszam)) % 8) * interval '30 minutes'))
        at time zone 'Europe/Budapest',
      (select id from public.packages where code = r.csomag),
      'TELJES', coalesce(v_ar.work_minutes, 0),
      v_ar.price_huf,
      case when v_stat = 'COMPLETED' then v_ar.price_huf end,
      case when v_stat = 'COMPLETED'
        then (v_nap + time '08:05') at time zone 'Europe/Budapest' end,
      case when v_stat = 'COMPLETED'
        then (v_nap + time '08:05' + coalesce(v_ar.work_minutes, 90) * interval '1 minute')
             at time zone 'Europe/Budapest' end,
      'DEMO');
  end loop;
end $$;


-- =============================================================================
--  EGY BÉRLET ÉS EGY SZERZŐDÉS
-- =============================================================================
--  Hogy a "Cégek és bérletesek" képernyő ne üresen nyíljon meg, és látszódjon,
--  hogy néz ki egy vegyes bérlet (8 normál + 2 prémium alkalom, normál áron)
--  meg egy fix ft/autó megállapodás.
--
--  A bérlet lejárata szándékosan három hét múlva van: így az Áttekintés alatt
--  a "lejáró bérlet" figyelmeztetés is látszik, nem csak elméletben létezik.
-- =============================================================================
do $$
declare
  v_ugyfel  uuid;
  v_ceg     uuid;
  v_prem    uuid := (select id from public.packages where code = 'PREMIUM');
  v_start   uuid := (select id from public.packages where code = 'START');
begin
  -- ---------- BÉRLET: magánügyfél, tíz alkalom ----------
  select id into v_ugyfel from public.customers where name = 'Kovács Péter' limit 1;

  perform public.create_pass(jsonb_build_object(
    'customer_id',  v_ugyfel,
    'name',         '10 alkalmas bérlet',
    'price_huf',    128000,
    'valid_from',  (current_date - 40)::text,
    'valid_until', (current_date + 21)::text,
    'notes',        'DEMO — 8 alkalom Start, 2 alkalom Premium, Start áron',
    'items', jsonb_build_array(
      jsonb_build_object('package_id', v_start, 'category', 'SZEMELYAUTO', 'qty_total', 8),
      jsonb_build_object('package_id', v_prem,  'category', 'SZEMELYAUTO', 'qty_total', 2))));

  update public.customers set billing_kind = 'BERLETES' where id = v_ugyfel;

  -- ---------- SZERZŐDÉS: céges flotta, fix ft/autó ----------
  select id into v_ceg from public.customers where name = 'Autó Trans Kft.' limit 1;

  perform public.save_contract(jsonb_build_object(
    'customer_id',     v_ceg,
    'tax_number',      '12345678-2-41',
    'pickup_delivery', true,
    'valid_until',     (current_date + 300)::text,
    'notes',           'DEMO — flottaszerződés, hozom-viszem szolgáltatással',
    'prices', jsonb_build_array(
      jsonb_build_object('tier', 'NORMAL',  'size', 'NORMAL', 'price_huf', 10500),
      jsonb_build_object('tier', 'NORMAL',  'size', 'NAGY',   'price_huf', 13500),
      jsonb_build_object('tier', 'PREMIUM', 'size', 'NORMAL', 'price_huf', 14500),
      jsonb_build_object('tier', 'PREMIUM', 'size', 'NAGY',   'price_huf', 18000))));

  update public.customers set billing_kind = 'SZERZODESES' where id = v_ceg;
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
