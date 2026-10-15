insert into public.business_hours (weekday, opens, closes, closed) values
  (1, '09:00', '17:00', false),
  (2, '09:00', '17:00', false),
  (3, '09:00', '17:00', false),
  (4, '09:00', '17:00', false),
  (5, '09:00', '17:00', false),
  (6, null, null, true),
  (7, null, null, true)
on conflict (weekday) do update
  set opens = excluded.opens, closes = excluded.closes, closed = excluded.closed;

insert into public.working_hours (weekday, starts, ends, closed) values
  (1, '08:00', '17:00', false),
  (2, '08:00', '17:00', false),
  (3, '08:00', '17:00', false),
  (4, '08:00', '17:00', false),
  (5, '08:00', '17:00', false),
  (6, null, null, true),
  (7, null, null, true)
on conflict (weekday) do update
  set starts = excluded.starts, ends = excluded.ends, closed = excluded.closed;

delete from public.break_windows where label = 'Ebédszünet';
insert into public.break_windows (weekday, starts, ends, label)
select w, '12:00'::time, '13:30'::time, 'Ebédszünet'
from generate_series(1, 5) as w;

insert into public.shop_settings (id, drop_off_from, default_parallel_slots, default_travel_minutes)
values (true, '07:15', 2, 20)
on conflict (id) do update set
  drop_off_from          = excluded.drop_off_from,
  default_parallel_slots = excluded.default_parallel_slots,
  default_travel_minutes = excluded.default_travel_minutes;

insert into public.packages (code, name, description, sort_order) values
  ('START',   'Start',   'Alap külső mosás és belső takarítás.', 1),
  ('PREMIUM', 'Premium', 'A Start mindene, plusz viaszolás, gumiápolás és belső ápolás.', 2),
  ('ELIT',    'Elit',    'A Premium mindene, hosszantartó vaxszal, falc mélytisztítással és alja kárpit mélytisztítással.', 3)
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order;

update public.packages p
set includes_package_id = (select id from public.packages where code = 'START')
where p.code = 'PREMIUM';

update public.packages p
set includes_package_id = (select id from public.packages where code = 'PREMIUM')
where p.code = 'ELIT';

delete from public.package_items;

insert into public.package_items (package_id, name, area, sort_order)
select p.id, v.name, v.area::service_area, v.ord
from public.packages p,
     (values
        ('Bogároldó',                'KULSO', 10),
        ('Előmosó (aktív hab)',      'KULSO', 20),
        ('Kézi mosás samponnal',     'KULSO', 30),
        ('Szárazolás',               'KULSO', 40),
        ('Külső ablaktisztítás',     'KULSO', 50),
        ('Falc áttörlés',            'KULSO', 80),
        ('Porszívózás',              'BELSO', 110),
        ('Műanyag áttörlés (APC)',   'BELSO', 120),
        ('Belső ablaktisztítás',     'BELSO', 130)
     ) as v(name, area, ord)
where p.code = 'START';

insert into public.package_items (package_id, name, area, sort_order)
select p.id, v.name, v.area::service_area, v.ord
from public.packages p,
     (values
        ('Gumiápolás',                    'KULSO', 60),
        ('Gyors viasz',                   'KULSO', 90),
        ('Műszerfal és műanyag ápolás',   'BELSO', 140),
        ('Illatosítás',                   'BELSO', 150)
     ) as v(name, area, ord)
where p.code = 'PREMIUM';

insert into public.package_items (package_id, name, area, sort_order)
select p.id, 'Alja kárpit mélytisztítás', 'BELSO'::service_area, 160
from public.packages p where p.code = 'ELIT';

insert into public.package_items (package_id, name, area, sort_order, overrides_item_id)
select
  (select id from public.packages where code = 'ELIT'),
  'Falc mélytisztítás',
  'KULSO'::service_area,
  80,
  (select pi.id
     from public.package_items pi
     join public.packages pk on pk.id = pi.package_id
    where pk.code = 'START' and pi.name = 'Falc áttörlés');

insert into public.package_items (package_id, name, area, sort_order, overrides_item_id)
select
  (select id from public.packages where code = 'ELIT'),
  'Hosszantartó vax',
  'KULSO'::service_area,
  90,
  (select pi.id
     from public.package_items pi
     join public.packages pk on pk.id = pi.package_id
    where pk.code = 'PREMIUM' and pi.name = 'Gyors viasz');

delete from public.package_pricing;

insert into public.package_pricing (package_id, category, scope, price_huf, duration_minutes)
select p.id, v.cat::vehicle_category, v.scope::booking_scope, v.price, v.mins
from public.packages p,
     (values
        ('START',   'SZEMELYAUTO', 'TELJES',  12800,   60),
        ('START',   'SZEMELYAUTO', 'KULSO',    6000, null),
        ('START',   'SZEMELYAUTO', 'BELSO',    8000, null),
        ('START',   'SUV',         'TELJES',  14600,   75),
        ('START',   'SUV',         'KULSO',    7000, null),
        ('START',   'SUV',         'BELSO',    9000, null),
        ('START',   'KISBUSZ',     'TELJES',  18000,   90),
        ('START',   'KISBUSZ',     'KULSO',    9000, null),
        ('START',   'KISBUSZ',     'BELSO',   10000, null),

        ('PREMIUM', 'SZEMELYAUTO', 'TELJES',  15600,   90),
        ('PREMIUM', 'SZEMELYAUTO', 'KULSO',    8000, null),
        ('PREMIUM', 'SZEMELYAUTO', 'BELSO',    9000, null),
        ('PREMIUM', 'SUV',         'TELJES',  17800,  105),
        ('PREMIUM', 'SUV',         'KULSO',    9000, null),
        ('PREMIUM', 'SUV',         'BELSO',   10000, null),
        ('PREMIUM', 'KISBUSZ',     'TELJES',  21200,  120),
        ('PREMIUM', 'KISBUSZ',     'KULSO',   11000, null),
        ('PREMIUM', 'KISBUSZ',     'BELSO',   12000, null),

        ('ELIT',    'SZEMELYAUTO', 'TELJES',  19800,  120),
        ('ELIT',    'SZEMELYAUTO', 'KULSO',   10000, null),
        ('ELIT',    'SZEMELYAUTO', 'BELSO',   11000, null),
        ('ELIT',    'SUV',         'TELJES',  22600,  135),
        ('ELIT',    'SUV',         'KULSO',   12000, null),
        ('ELIT',    'SUV',         'BELSO',   13000, null),
        ('ELIT',    'KISBUSZ',     'TELJES',  25900,  150),
        ('ELIT',    'KISBUSZ',     'KULSO',   14000, null),
        ('ELIT',    'KISBUSZ',     'BELSO',   15000, null)
     ) as v(code, cat, scope, price, mins)
where p.code = v.code;

delete from public.full_service_pricing;

insert into public.full_service_pricing (package_id, category, price_huf, requires_quote)
select p.id, v.cat::vehicle_category, v.price, v.quote
from public.packages p,
     (values
        ('START',   'SZEMELYAUTO', 35000, false),
        ('START',   'SUV',         40000, false),
        ('START',   'KISBUSZ',      null, true),
        ('PREMIUM', 'SZEMELYAUTO', 40000, false),
        ('PREMIUM', 'SUV',         45000, false),
        ('PREMIUM', 'KISBUSZ',      null, true),
        ('ELIT',    'SZEMELYAUTO', 50000, false),
        ('ELIT',    'SUV',         55000, false),
        ('ELIT',    'KISBUSZ',      null, true)
     ) as v(code, cat, price, quote)
where p.code = v.code;

delete from public.extras;

insert into public.extras
  (name, area, price_huf, price_unit, work_minutes, duration_unit,
   rest_minutes, recommends_overnight, requires_quote, sort_order)
values
  ('Felni és gumi mélytisztítás és ápolás', 'KULSO',  null, 'ALKALOM',   30, 'ALKALOM',    0, false, false, 10),
  ('Külső műanyagápolás',                   'KULSO',  3000, 'ALKALOM',   10, 'ALKALOM',    0, false, false, 20),
  ('Gumiápolás (külön kérve)',              'KULSO',  null, 'ALKALOM', null, 'ALKALOM',    0, false, false, 30),
  ('Karc eltávolítás (kis polír)',          'KULSO',  null, 'ALKALOM',   30, 'ALKALOM',    0, false, false, 40),
  ('Karosszéria polírozás',                 'KULSO',  null, 'ALKALOM', null, 'ALKALOM',    0, false, true,  50),
  ('Fényszóró felújítás',                   'KULSO',  null, 'ALKALOM', null, 'ALKALOM',    0, false, true,  60),
  ('Kerámia bevonat',                       'KULSO',  null, 'ALKALOM', null, 'ALKALOM',    0, false, true,  70),

  ('Vizes kárpittisztítás',                 'BELSO',  6500, 'ULES',      45, 'ALKALOM', 1440, true,  false, 110),
  ('Bőrtisztítás és ápolás',                'BELSO',  null, 'ALKALOM',   45, 'ALKALOM',    0, false, false, 120),
  ('Tetőkárpit tisztítás',                  'BELSO',  null, 'ALKALOM',   20, 'ALKALOM',    0, false, false, 130),
  ('Ajtókárpit tisztítás',                  'BELSO',  null, 'AJTO',       5, 'AJTO',       0, false, false, 140),
  ('Ózongenerátoros utastér fertőtlenítés', 'BELSO',  null, 'ALKALOM',   30, 'ALKALOM',    0, false, false, 150),

  ('Motortér kozmetika',                     null,    null, 'ALKALOM',   20, 'ALKALOM',    0, false, false, 210),
  ('Szezon szerinti ablakmosó folyadék',     null,    1000, 'LITER',      0, 'ALKALOM',    0, false, false, 220);

delete from public.surcharges;

insert into public.surcharges (name, kind, default_value, max_value, time_multiplier, sort_order)
values
  ('Erősen szennyezett', 'SZAZALEK', 50,   50,   1.0, 10),
  ('Erős kutyaszőr',     'FIX',      2000, null, 1.0, 20);

select 'csomag'            as tabla, count(*) as darab from public.packages
union all select 'csomagtartalom',   count(*) from public.package_items
union all select 'ársor',            count(*) from public.package_pricing
union all select 'full service ár',  count(*) from public.full_service_pricing
union all select 'extra',            count(*) from public.extras
union all select 'felár',            count(*) from public.surcharges
union all select 'nyitvatartás',     count(*) from public.business_hours
union all select 'munkaidő',         count(*) from public.working_hours
union all select 'ebédszünet',       count(*) from public.break_windows;
