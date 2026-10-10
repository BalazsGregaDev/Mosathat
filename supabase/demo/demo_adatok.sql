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

  insert into public.customers (type, name, phone, company_name, tax_number,
                                default_travel_minutes, internal_notes)
  values ('CEG', 'Autó Trans Kft.', '+36 1 999 1234', 'Autó Trans Kft.',
          '12345678-2-41', 25, 'DEMO — szerződött partner, HozomViszem')
  returning id into v_ker;

  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_c1, 'ABC-123', 'SZEMELYAUTO', 'BMW', '530d', 5, 'DEMO')
  returning id into v_v1;

  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_c2, 'LMN-882', 'SZEMELYAUTO', 'Škoda', 'Octavia', 5, 'DEMO')
  returning id into v_v2;

  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_c3, 'AABB-123', 'SUV', 'Toyota', 'RAV4', 5, 'DEMO')
  returning id into v_v3;

  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_c4, 'PQR-450', 'KISBUSZ', 'VW', 'Transporter', 9, 'DEMO')
  returning id into v_v4;

  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_ker, 'KER-100', 'SZEMELYAUTO', 'VW', 'Passat B8', 5, 'DEMO')
  returning id into v_vk1;

  insert into public.vehicles (customer_id, plate_raw, category, brand, model, seats, notes)
  values (v_ker, 'KER-214', 'SZEMELYAUTO', 'Opel', 'Astra', 5, 'DEMO')
  returning id into v_vk2;

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
  update public.booking_tasks set done = true, done_at = now()
   where booking_id = v_b and sort_order <= 40;

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

  for v_calc in
    select * from (values
      (1,  42, 'PREMIUM'), (1, 111, 'PREMIUM'), (1, 187, 'ELIT'),
      (2,  22, 'START'),   (2,  67, 'START'),
      (3, 116, 'PREMIUM')
    ) as t(ki, napja, csomag)
  loop
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
      (v_ma - v_calc.napja + time '09:05'
        + (coalesce(v_ar.work_minutes, 90) - 8) * interval '1 minute')
        at time zone 'Europe/Budapest',
      'DEMO');
  end loop;

end $$;

insert into public.business_hours (weekday, opens, closes, closed)
values (6, '08:00', '14:00', false)
on conflict (weekday) do update
  set opens = excluded.opens, closes = excluded.closes, closed = excluded.closed;

insert into public.working_hours (weekday, starts, ends, closed)
values (6, '07:30', '14:00', false)
on conflict (weekday) do update
  set starts = excluded.starts, ends = excluded.ends, closed = excluded.closed;

do $$
declare
  r        record;
  v_nap    date;
  v_h      date := date_trunc('week', current_date)::date;
  v_cust   uuid;
  v_veh    uuid;
  v_ar     record;
  v_stat   booking_status;
begin
  for r in
    select * from (values
      (1, 'ELIT',    'SZEMELYAUTO', 'LMN-204', 'Audi',       'A4',        'Tóth Gergő'),
      (1, 'PREMIUM', 'SUV',         'RPX-618', 'Kia',        'Sportage',  'Barna Réka'),
      (1, 'PREMIUM', 'SZEMELYAUTO', 'HFE-330', 'Opel',       'Astra',     'Décsi Márk'),
      (1, 'START',   'SZEMELYAUTO', 'KTU-905', 'Suzuki',     'Swift',     'Faragó Nóra'),
      (2, 'ELIT',    'KISBUSZ',     'VBN-712', 'Ford',       'Transit',   'Szalai Bence'),
      (2, 'ELIT',    'SUV',         'DJW-441', 'Volvo',      'XC60',      'Holló Eszter'),
      (2, 'PREMIUM', 'KISBUSZ',     'MZC-158', 'Renault',    'Trafic',    'Vass Tibor'),
      (2, 'PREMIUM', 'SUV',         'GYT-863', 'Mazda',      'CX-5',      'Kelemen Júlia'),
      (2, 'ELIT',    'SZEMELYAUTO', 'SOB-027', 'Skoda',      'Superb',    'Baranyi Ádám'),
      (2, 'START',   'SZEMELYAUTO', 'PFL-596', 'Dacia',      'Sandero',   'Illés Kata'),
      (3, 'ELIT',    'KISBUSZ',     'WNA-334', 'Mercedes',   'Vito',      'Rácz Levente'),
      (3, 'ELIT',    'KISBUSZ',     'CZK-780', 'VW',         'Transporter', 'Molnár Dóra'),
      (3, 'ELIT',    'SUV',         'TQE-215', 'BMW',        'X3',        'Bogdán Zsolt'),
      (3, 'ELIT',    'SZEMELYAUTO', 'HRV-648', 'Lexus',      'IS',        'Csorba Anna'),
      (3, 'PREMIUM', 'KISBUSZ',     'JMD-901', 'Fiat',       'Ducato',    'Sipos Balázs'),
      (3, 'PREMIUM', 'SUV',         'YXL-473', 'Hyundai',    'Tucson',    'Végh Krisztina'),
      (3, 'PREMIUM', 'SZEMELYAUTO', 'BUC-359', 'Toyota',     'Corolla',   'Fodor Máté'),
      (4, 'PREMIUM', 'SUV',         'NKP-186', 'Nissan',     'Qashqai',   'Szabó Villő'),
      (4, 'PREMIUM', 'SZEMELYAUTO', 'GDT-742', 'Honda',      'Civic',     'Lantos Emese'),
      (4, 'ELIT',    'SZEMELYAUTO', 'ZVE-508', 'Mercedes',   'C220',      'Pintér Attila'),
      (4, 'START',   'SUV',         'AOR-267', 'Jeep',       'Renegade',  'Halász Gábor'),
      (4, 'START',   'SZEMELYAUTO', 'EWB-930', 'Seat',       'Ibiza',     'Bognár Lilla'),
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

do $$
declare
  v_ugyfel  uuid;
  v_ceg     uuid;
  v_prem    uuid := (select id from public.packages where code = 'PREMIUM');
  v_start   uuid := (select id from public.packages where code = 'START');
  v_auto    uuid;
  v_b       uuid;
  v_calc    record;
begin
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

  select id into v_ceg from public.customers where name = 'Autó Trans Kft.' limit 1;

  perform public.save_contract(jsonb_build_object(
    'customer_id',     v_ceg,
    'tax_number',      '12345678-2-41',
    'pickup_delivery', true,
    'pickup_delivery_fee_huf', 4000,
    'valid_until',     (current_date + 300)::text,
    'notes',           'DEMO — flottaszerződés, hozom-viszem szolgáltatással',
    'prices', jsonb_build_array(
      jsonb_build_object('package_code', 'START',   'size', 'NORMAL', 'kind', 'FLOTTA', 'price_huf', 10500),
      jsonb_build_object('package_code', 'START',   'size', 'NAGY',   'kind', 'FLOTTA', 'price_huf', 13500),
      jsonb_build_object('package_code', 'PREMIUM', 'size', 'NORMAL', 'kind', 'FLOTTA', 'price_huf', 14500),
      jsonb_build_object('package_code', 'PREMIUM', 'size', 'NAGY',   'kind', 'FLOTTA', 'price_huf', 18000),
      jsonb_build_object('package_code', 'ELIT',    'size', 'NORMAL', 'kind', 'FLOTTA', 'price_huf', 24000),
      jsonb_build_object('package_code', 'ELIT',    'size', 'NAGY',   'kind', 'FLOTTA', 'price_huf', 29000),
      jsonb_build_object('package_code', 'START',   'size', 'NORMAL', 'kind', 'SAJAT',  'price_huf', 12500),
      jsonb_build_object('package_code', 'START',   'size', 'NAGY',   'kind', 'SAJAT',  'price_huf', 15500),
      jsonb_build_object('package_code', 'PREMIUM', 'size', 'NORMAL', 'kind', 'SAJAT',  'price_huf', 17500),
      jsonb_build_object('package_code', 'PREMIUM', 'size', 'NAGY',   'kind', 'SAJAT',  'price_huf', 21000))));

  update public.customers set billing_kind = 'SZERZODESES' where id = v_ceg;

  select v.id into v_auto from public.vehicles v
   where v.customer_id = v_ceg order by v.plate_raw limit 1;

  if v_auto is not null then
    select * into v_calc from public.calc_service(v_prem, 'SZEMELYAUTO', 'TELJES');
    insert into public.bookings (
      customer_id, vehicle_id, booking_type, status, source, service_date,
      drop_off_at, pick_up_at, package_id, scope, planned_duration_minutes,
      estimated_price_huf, internal_notes)
    values (v_ceg, v_auto, 'HOZOMVISZEM', 'CONFIRMED', 'TELEFON', current_date,
      (current_date + time '10:00') at time zone 'Europe/Budapest',
      (current_date + time '15:00') at time zone 'Europe/Budapest',
      v_prem, 'TELJES', v_calc.work_minutes, v_calc.price_huf, 'DEMO')
    returning id into v_b;
    perform public.foglalas_tetelek_ir(
      v_b, v_prem, 'SZEMELYAUTO', 'TELJES', false, '[]'::jsonb, 0, 0,
      (select company_id from public.customers where id = v_ceg),
      'FLOTTA', 'HOZOMVISZEM', current_date);
    perform public.rebuild_booking_tasks(v_b);
  end if;
end $$;

select 'ügyfél' as mi, count(*) from public.customers
union all select 'jármű',    count(*) from public.vehicles
union all select 'foglalás', count(*) from public.bookings
union all select 'tétel',    count(*) from public.booking_items
union all select 'munkalépés', count(*) from public.booking_tasks;

select * from public.day_capacity(current_date);
