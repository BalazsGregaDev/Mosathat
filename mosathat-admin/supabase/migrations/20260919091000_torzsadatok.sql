-- =============================================================================
--  MOSATHAT AUTÓKOZMETIKA — 0002 VALÓS ADATOK
-- =============================================================================
--  Ez a fájl tölti fel a rendszert a tényleges üzleti adatokkal: csomagok,
--  tartalmuk, árak, Full Service mátrix, extrák, felárak, nyitvatartás.
--
--  Az árak forrása a mosathat.hu 2026.01.01-i árlistája, bruttó értékben.
--
--  FUTTATÁS: a 0001_schema.sql UTÁN, ugyanúgy az SQL Editorban.
--
--  Ez a fájl többször is lefuttatható: mindenhol "on conflict" kezelés van,
--  tehát nem duplikál. Ha később árat módosítotok, elég ezt újra lefuttatni.
-- =============================================================================


-- =============================================================================
--  1. NYITVATARTÁS HÁROM RÉTEGBEN
-- =============================================================================
--  1 = hétfő ... 5 = péntek. Szombat és vasárnap zárva — a ledolgozós
--  szombatokat (évi 2-3 alkalom) a day_overrides tábla kezeli majd.

-- Hivatalos nyitvatartás: ez megy a weboldalra és a Google cégprofilba.
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

-- Tényleges munkavégzés: ketten 7-re bent vannak, 8-tól dolgoztok.
-- EBBŐL SZÁMOL A KAPACITÁS, nem a hivatalos nyitvatartásból.
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

-- Ebédszünet minden hétköznap. Várós foglalás nem lóghat bele.
delete from public.break_windows where label = 'Ebédszünet';
insert into public.break_windows (weekday, starts, ends, label)
select w, '12:00'::time, '13:30'::time, 'Ebédszünet'
from generate_series(1, 5) as w;

-- Egysoros beállítás.
insert into public.shop_settings (id, drop_off_from, default_parallel_slots, default_travel_minutes)
values (true, '07:15', 2, 20)
on conflict (id) do update set
  drop_off_from          = excluded.drop_off_from,
  default_parallel_slots = excluded.default_parallel_slots,
  default_travel_minutes = excluded.default_travel_minutes;


-- =============================================================================
--  2. CSOMAGOK
-- =============================================================================
--  A csomagok egymásra épülnek: Premium tartalmazza a Startot,
--  Elit a Premiumot.

insert into public.packages (code, name, description, sort_order) values
  ('START',   'Start',   'Alap külső mosás és belső takarítás.', 1),
  ('PREMIUM', 'Premium', 'A Start mindene, plusz viaszolás, gumiápolás és belső ápolás.', 2),
  ('ELIT',    'Elit',    'A Premium mindene, hosszantartó vaxszal, falc mélytisztítással és alja kárpit mélytisztítással.', 3)
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order;

-- Az öröklődés beállítása. Külön lépés, mert magukra hivatkoznak.
update public.packages p
set includes_package_id = (select id from public.packages where code = 'START')
where p.code = 'PREMIUM';

update public.packages p
set includes_package_id = (select id from public.packages where code = 'PREMIUM')
where p.code = 'ELIT';


-- =============================================================================
--  3. CSOMAGTARTALOM
-- =============================================================================
--  EZ A LISTA EGYSZER LÉTEZIK, DE HÁROM HELYEN HASZNOSUL:
--    1. a weboldal árlistája ebből rajzolja ki a táblázatot,
--    2. a munkalista ebből generálja a kipipálandó lépéseket,
--    3. a "csak kívül" / "csak belül" rendelésnél ebből derül ki,
--       mely lépések kellenek egyáltalán.
--
--  A sort_order a megjelenítési sorrend. Szándékosan hagytunk benne
--  lyukakat (10, 20, 30...), hogy később könnyű legyen közé szúrni.
--
--  A mosás blokkját a két "szintes" tétel zárja — a falctisztítás és a
--  viaszolás. Ezek adják el a Premiumot és az Elitet.

-- Tiszta lappal indulunk, hogy a fájl újrafuttatható maradjon.
delete from public.package_items;

-- --- START -------------------------------------------------------------------
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

-- --- PREMIUM (csak amit a Starthoz HOZZÁAD) ----------------------------------
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

-- --- ELIT --------------------------------------------------------------------
-- Az Elit egy tételt ad hozzá (alja kárpit), és KETTŐT FELÜLÍR.
insert into public.package_items (package_id, name, area, sort_order)
select p.id, 'Alja kárpit mélytisztítás', 'BELSO'::service_area, 160
from public.packages p where p.code = 'ELIT';

-- Falc mélytisztítás — az örökölt "Falc áttörlés" HELYÉRE lép.
-- Ugyanaz a munka, csak mélyebben: a zsanérok és a szűk helyek is sorra kerülnek.
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

-- Hosszantartó vax — az örökölt "Gyors viasz" HELYÉRE lép.
-- Ez nem alaposabb munka, hanem MÁS ANYAG. Az adatbázisnak mindkettő
-- ugyanaz a művelet (felülírás), a vevőnek viszont más az üzenet:
-- az egyiknél alaposabbat kap, a másiknál tartósabbat.
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


-- =============================================================================
--  4. ÁRAK ÉS IDŐTARTAMOK
-- =============================================================================
--  27 ársor: 3 csomag × 3 járműkategória × 3 terjedelem.
--
--  FIGYELEM: a TELJES ára mindig KEVESEBB, mint a KULSO + BELSO összege.
--  Például Start személyautó: 6 000 + 8 000 = 14 000, de a teljes 12 800.
--  Ez tudatos kedvezmény, ezért a rendszer sosem adja össze a kettőt.
--
--  Az időtartam csak a TELJES sorokra van meg. A csak külső és csak belső
--  időtartamai még hiányoznak (18 cella) — ott NULL marad, és a felület
--  jelzi, hogy hiányzik. Nem fele-fele, mert az árak sem azok.

delete from public.package_pricing;

insert into public.package_pricing (package_id, category, scope, price_huf, duration_minutes)
select p.id, v.cat::vehicle_category, v.scope::booking_scope, v.price, v.mins
from public.packages p,
     (values
        -- csomag,   kategória,     terjedelem, ár,     perc
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


-- =============================================================================
--  5. FULL SERVICE (KÁRPITTISZTÍTÁS CSOMAG)
-- =============================================================================
--  Csomag + 5 ülés nedves kárpittisztítása, kedvezményes áron.
--
--  Miért saját ártábla és nem csomag + extra?
--  Mert a beépített kárpittisztítás ára nem állandó:
--    Start személyautó:  35 000 − 12 800 = 22 200 Ft
--    Elit  személyautó:  50 000 − 19 800 = 30 200 Ft
--  Ugyanazért az öt ülésért. Egyetlen extra-ár nem tudná lefedni.
--
--  A kisbusz/furgon azért árajánlatos, mert 2, 3, 5, 7 vagy 9 üléses is lehet,
--  a csomagár pedig 5 ülésre szól.

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


-- =============================================================================
--  6. EXTRÁK
-- =============================================================================
--  Ahol az ár NULL, ott még nincs megadva — a felület ezt jelezni fogja,
--  és amíg nincs ár, az extra nem kerül ki a publikus oldalra.
--
--  Három dolog, amire figyelni kell:
--
--  a) A vizes kárpittisztításnál az ÁR ülésenkénti (6 500 Ft/ülés),
--     de a 45 perc AZ EGÉSZ AUTÓRA vonatkozik. Ezért külön a price_unit
--     és a duration_unit. Ha egy mező lenne, egy 5 üléses autónál a
--     rendszer 225 percet számolna 45 helyett.
--
--  b) A száradás (rest_minutes) NEM terheli a napi kapacitást, mert nem
--     dolgozik rajta senki — csak az autó ottlétét hosszabbítja.
--     A vizes kárpitnál ez 24 óra = 1440 perc.
--
--  c) A gumiápolás benne van a Premiumban és az Elitben, DE külön is
--     kérhető — például egy Start csomagot rendelő ügyfélnek.
--     Ehhez még kell egy ár.

delete from public.extras;

insert into public.extras
  (name, area, price_huf, price_unit, work_minutes, duration_unit,
   rest_minutes, recommends_overnight, requires_quote, sort_order)
values
  -- Külső
  ('Felni és gumi mélytisztítás és ápolás', 'KULSO',  null, 'ALKALOM',   30, 'ALKALOM',    0, false, false, 10),
  ('Külső műanyagápolás',                   'KULSO',  3000, 'ALKALOM',   10, 'ALKALOM',    0, false, false, 20),
  ('Gumiápolás (külön kérve)',              'KULSO',  null, 'ALKALOM', null, 'ALKALOM',    0, false, false, 30),
  ('Karc eltávolítás (kis polír)',          'KULSO',  null, 'ALKALOM',   30, 'ALKALOM',    0, false, false, 40),
  ('Karosszéria polírozás',                 'KULSO',  null, 'ALKALOM', null, 'ALKALOM',    0, false, true,  50),
  ('Fényszóró felújítás',                   'KULSO',  null, 'ALKALOM', null, 'ALKALOM',    0, false, true,  60),
  ('Kerámia bevonat',                       'KULSO',  null, 'ALKALOM', null, 'ALKALOM',    0, false, true,  70),

  -- Belső
  ('Vizes kárpittisztítás',                 'BELSO',  6500, 'ULES',      45, 'ALKALOM', 1440, true,  false, 110),
  ('Bőrtisztítás és ápolás',                'BELSO',  null, 'ALKALOM',   45, 'ALKALOM',    0, false, false, 120),
  ('Tetőkárpit tisztítás',                  'BELSO',  null, 'ALKALOM',   20, 'ALKALOM',    0, false, false, 130),
  ('Ajtókárpit tisztítás',                  'BELSO',  null, 'AJTO',       5, 'AJTO',       0, false, false, 140),
  ('Ózongenerátoros utastér fertőtlenítés', 'BELSO',  null, 'ALKALOM',   30, 'ALKALOM',    0, false, false, 150),

  -- Egyéb
  ('Motortér kozmetika',                     null,    null, 'ALKALOM',   20, 'ALKALOM',    0, false, false, 210),
  ('Szezon szerinti ablakmosó folyadék',     null,    1000, 'LITER',      0, 'ALKALOM',    0, false, false, 220);


-- =============================================================================
--  7. FELÁRAK
-- =============================================================================
--  Az "erősen szennyezett" felár szövege a mostani oldalon:
--  "AKÁR 50%-os felárat is felszámíthatunk, egyeztetés után."
--
--  Az "akár" fontos: ez nem kapcsoló, hanem 0 és 50 közötti sáv.
--  A dolgozó a helyszínen írja be a tényleges értéket, a max_value csak
--  a felső határ.
--
--  A time_multiplier mindkettőnél 1.0, vagyis a felár egyelőre csak az
--  árat emeli, az időt nem. Ezt nem kell most eldönteni: ha a tervezett
--  és a tényleges időt rögzítitek, fél év múlva az adatból derül ki,
--  mennyivel tartanak tovább a felaras munkák — és akkor ezt a számot
--  adatból lehet beállítani, nem érzésből.

delete from public.surcharges;

insert into public.surcharges (name, kind, default_value, max_value, time_multiplier, sort_order)
values
  ('Erősen szennyezett', 'SZAZALEK', 50,   50,   1.0, 10),
  ('Erős kutyaszőr',     'FIX',      2000, null, 1.0, 20);


-- =============================================================================
--  ELLENŐRZÉS
-- =============================================================================
--  Futtasd le ezt is: ha minden szám stimmel, a betöltés rendben van.

select 'csomag'            as tabla, count(*) as darab from public.packages
union all select 'csomagtartalom',   count(*) from public.package_items
union all select 'ársor',            count(*) from public.package_pricing
union all select 'full service ár',  count(*) from public.full_service_pricing
union all select 'extra',            count(*) from public.extras
union all select 'felár',            count(*) from public.surcharges
union all select 'nyitvatartás',     count(*) from public.business_hours
union all select 'munkaidő',         count(*) from public.working_hours
union all select 'ebédszünet',       count(*) from public.break_windows;

-- Várt eredmény:
--   csomag            3
--   csomagtartalom   16
--   ársor            27
--   full service ár   9
--   extra            14
--   felár             2
--   nyitvatartás      7
--   munkaidő          7
--   ebédszünet        5
