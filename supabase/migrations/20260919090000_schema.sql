-- =============================================================================
--  MOSATHAT AUTÓKOZMETIKA — 0001 ADATBÁZIS SÉMA
-- =============================================================================
--  Ez a fájl hozza létre a teljes Fázis 1 adatmodellt: típusokat, táblákat,
--  kapcsolatokat, indexeket és a jogosultsági (RLS) szabályokat.
--
--  HOGYAN FUTTASD:
--    Supabase felület → SQL Editor → beilleszted → Run.
--    Utána jöhet a 0002_seed.sql, ami feltölti a valós adatokkal.
--
--  KÉT SZABÁLY, AMI VÉGIGMEGY AZ EGÉSZ SÉMÁN:
--
--  1) A PÉNZ EGÉSZ SZÁM, FORINTBAN, BRUTTÓ.
--     Soha nem lebegőpontos (numeric/float), mert abból kerekítési hiba lesz.
--     Ezért minden ár mezőt "_huf" végződéssel és integer típussal írunk.
--
--  2) MINDEN IDŐPONT timestamptz.
--     Ez azt jelenti, hogy az adatbázis UTC-ben tárol, de ismeri az időzónát.
--     A felületen mindig helyi időt fogunk mutatni — az átváltás a kliens
--     dolga lesz. Így a nyári időszámítás váltása sem okoz gondot.
-- =============================================================================


-- =============================================================================
--  1. TÍPUSOK (ENUM)
-- =============================================================================
--  Az enum egy olyan oszloptípus, ami csak előre felsorolt értékeket enged meg.
--  Előnye, hogy az adatbázis maga őrzi, mi a helyes érték — elgépelni nem lehet.
--  Ha később új értéket kell hozzáadni:
--      alter type booking_status add value 'VALAMI_UJ';
--  Értéket törölni viszont nem lehet, ezért csak stabil fogalmakra használjuk.

-- Ki használja a rendszert.
create type staff_role as enum ('SUPERADMIN', 'STAFF');

-- Az ügyfél magánszemély vagy cég (autókereskedő, HozomViszem partner).
create type customer_type as enum ('MAGAN', 'CEG');

-- A három járműkategória, amire az árazás épül.
create type vehicle_category as enum ('SZEMELYAUTO', 'SUV', 'KISBUSZ');

-- A műhely két munkaterülete. Ugyanez a bontás dönti el azt is,
-- hogy egy "csak kívül" foglalás munkalistájára mely lépések kerülnek fel.
create type service_area as enum ('KULSO', 'BELSO');

-- Mit rendelt az ügyfél: csak külsőt, csak belsőt, vagy a teljes csomagot.
-- Fontos: a TELJES ára NEM a KULSO + BELSO összege, hanem kedvezményes,
-- ezért külön ársor tartozik hozzá.
create type booking_scope as enum ('KULSO', 'BELSO', 'TELJES');

-- A foglalás típusa. Ez a rendszer legfontosabb fogalma:
--   VAROS       – az ügyfél megvárja. Konkrét kezdés, fix idő, nem lóghat
--                 sem az ebédszünetbe, sem a zárás utánra.
--   LEADOS      – ott hagyja az autót. Csak a napi kapacitást terheli.
--   TOBBNAPOS   – napokig áll nálunk (autókereskedő). Nyitvatartási időn
--                 kívül dolgozunk rajta, ezért a napi kapacitást nem terheli.
--   HOZOMVISZEM – mi megyünk az autóért szerződött céges ügyfélhez.
create type booking_type as enum ('VAROS', 'LEADOS', 'TOBBNAPOS', 'HOZOMVISZEM');

-- A foglalás állapotai. A REQUESTED csak online kérésnél fordul elő —
-- a telefonos foglalás egyből CONFIRMED.
-- A lemondás szándékosan kettéválik: más, ha az ügyfél mondja le, és más,
-- ha mi. Egy közös CANCELLED érték mellett a statisztika semmit nem mondana.
create type booking_status as enum (
  'REQUESTED',
  'CONFIRMED',
  'REJECTED',
  'ARRIVED',
  'IN_PROGRESS',
  'READY',
  'COMPLETED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_SHOP',
  'NO_SHOW'
);

-- Honnan jött a foglalás. A Messenger egyelőre csak forrásként létezik:
-- kimenő üzenetet nem lehet rajta automatizálni.
create type booking_source as enum ('TELEFON', 'ONLINE', 'SZEMELYES', 'MESSENGER');

-- Egy foglalás tételei: a csomag, a Full Service kiegészítés, az extrák
-- és a felárak mind külön sorként kerülnek a booking_items táblába.
create type booking_item_kind as enum ('PACKAGE', 'FULL_SERVICE', 'EXTRA', 'SURCHARGE');

-- Mértékegység. Azért kell, mert az ár és az idő NEM ugyanúgy szorzódik:
--   ajtókárpit  → 5 perc / ajtó,  az ár is ajtónként
--   vizes kárpit → 6 500 Ft / ülés, de a 45 perc az EGÉSZ autóra vonatkozik
create type measure_unit as enum ('ALKALOM', 'DB', 'AJTO', 'ULES', 'LITER');

-- A felár lehet százalékos (erősen szennyezett: 0–50%) vagy fix (kutyaszőr: 2 000 Ft).
create type surcharge_kind as enum ('SZAZALEK', 'FIX');


-- =============================================================================
--  2. SEGÉDFÜGGVÉNY: updated_at automatikus karbantartása
-- =============================================================================
--  Minden táblánál, ahol van updated_at oszlop, ez a trigger frissíti azt
--  módosításkor. Így nem kell a kódban gondolni rá, és nem lehet elfelejteni.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
--  3. DOLGOZÓK
-- =============================================================================
--  A Supabase a bejelentkezést az auth.users táblában kezeli — azt nem mi
--  írjuk, azt a Supabase adja. Ez a tábla csak kiegészíti: nevet és
--  szerepkört tesz mellé. Ezért az id ugyanaz, mint az auth.users id-ja.

create table public.staff (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text        not null,
  role        staff_role  not null default 'STAFF',
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger staff_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();


-- =============================================================================
--  4. ÜGYFELEK ÉS JÁRMŰVEK
-- =============================================================================

create table public.customers (
  id                     uuid primary key default gen_random_uuid(),
  type                   customer_type not null default 'MAGAN',
  name                   text not null,

  -- A telefonszám kötelező, az email nem. Ez tudatos: SMS-sel mindenkit
  -- elérünk, emaillel nem. A dashboard régen is azt jelezte, hogy
  -- "3 foglalásnak nincs email címe" — tehát a valóság ez.
  phone                  text not null,
  email                  text,

  -- Csak céges ügyfélnél.
  company_name           text,
  tax_number             text,

  -- HozomViszem: az odaút-visszaút átlagosan 20 perc, de cégenként eltér,
  -- mert nem mindenki van ugyanolyan messze. Ezért itt tároljuk, és
  -- foglalásonként felülírható.
  default_travel_minutes integer,

  notes                  text,   -- amit az ügyfél is tudhat
  internal_notes         text,   -- belső megjegyzés, sosem megy ki

  -- GDPR: törlési igénynél NEM töröljük a sort, hanem anonimizáljuk.
  -- A név, telefon, email kiürül, a foglalás statisztikai sora megmarad,
  -- így a bevételi adat nem sérül. Ide kerül az anonimizálás időpontja.
  anonymized_at          timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create index customers_phone_idx on public.customers (phone);
create index customers_name_idx  on public.customers (lower(name));


create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers(id) on delete cascade,

  -- A rendszámot ÚGY tároljuk, AHOGY beírták — semmilyen formátumot nem
  -- kényszerítünk rá, mert külföldi autó is jön.
  plate_raw        text not null,

  -- Ez a keresési kulcs: nagybetűsítve, minden elválasztó nélkül.
  -- A "generated always as ... stored" azt jelenti, hogy az adatbázis
  -- SZÁMOLJA ki magától a plate_raw-ból, nem kell a kódban foglalkozni vele.
  -- Így az "ABC-123", az "abc 123" és az "AbC123" ugyanazt találja meg.
  plate_normalized text generated always as (
    upper(regexp_replace(plate_raw, '[^A-Za-z0-9]', '', 'g'))
  ) stored,

  -- Alapértelmezés HU. Ha a rendszám nem illeszkedik magyar mintára,
  -- a felület "Külföldi"-t javasol — de a beírást soha nem utasítjuk vissza.
  plate_country    text not null default 'HU',

  brand            text,
  model            text,
  year             integer,
  category         vehicle_category not null,

  -- Ülésszám: a Full Service csomagár 5 ülésre szól, e fölött árajánlat kell.
  seats            integer,

  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

-- Ez az index teszi gyorssá a foglalásfelvitelt: beírod a rendszámot,
-- és egy pillanat alatt előjön az ügyfél az előzményeivel.
create index vehicles_plate_idx    on public.vehicles (plate_normalized);
create index vehicles_customer_idx on public.vehicles (customer_id);


-- =============================================================================
--  5. CSOMAGOK ÉS TARTALMUK
-- =============================================================================

create table public.packages (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,         -- START / PREMIUM / ELIT
  name                text not null,
  description         text,

  -- A csomagok egymásra épülnek: a Premium tartalmazza a Startot,
  -- az Elit a Premiumot. Így nem kell háromszor leírni ugyanazt.
  includes_package_id uuid references public.packages(id),

  sort_order          integer not null default 0,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger packages_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();


create table public.package_items (
  id                uuid primary key default gen_random_uuid(),
  package_id        uuid not null references public.packages(id) on delete cascade,
  name              text not null,
  area              service_area not null,

  -- EZ A SÉMA EGYIK LEGFONTOSABB MEZŐJE.
  --
  -- Egy szolgáltatás nem csak "van" vagy "nincs" — szintje is lehet.
  -- Két ilyen van ma, és kétféleképpen működnek:
  --
  --   Falctisztítás — ugyanaz a munka megy mélyebben.
  --     Start és Premium: áttörlés. Elit: mélytisztítás a zsanéroknál.
  --
  --   Viaszolás — nem alaposabb munka, hanem MÁS ANYAG.
  --     Start: nincs. Premium: gyors viasz. Elit: hosszantartó vax.
  --
  -- Enélkül a mező az Elit egyszerre örökölné az áttörlést ÉS kapná a
  -- mélytisztítást, és mindkettő rákerülne a munkalistára.
  -- Ez a mező mondja meg: "ez a tétel az örökölt helyére lép".
  overrides_item_id uuid references public.package_items(id) on delete set null,

  sort_order        integer not null default 0,
  active            boolean not null default true
);

create index package_items_package_idx on public.package_items (package_id);


-- -----------------------------------------------------------------------------
--  Árak és időtartamok
-- -----------------------------------------------------------------------------
--  Három dimenzió szorzódik: csomag × járműkategória × terjedelem.
--  Ez összesen 3 × 3 × 3 = 27 ársor.
--
--  A TELJES ára mindig kevesebb, mint a KULSO + BELSO összege — ez tudatos
--  kedvezmény. Ezért a rendszer SOHA nem adja össze a kettőt, hanem a
--  megfelelő sort olvassa ki.

create table public.package_pricing (
  id               uuid primary key default gen_random_uuid(),
  package_id       uuid not null references public.packages(id) on delete cascade,
  category         vehicle_category not null,
  scope            booking_scope not null,

  -- Bruttó ár forintban. Lehet NULL, ha requires_quote = true.
  price_huf        integer,

  -- Munkaidő percben. A TELJES sorokra megvan, a KULSO és BELSO sorokra
  -- még nincs adat — ezért engedünk NULL-t. A felület jelzi, ha hiányzik.
  duration_minutes integer,

  -- "Érdeklődjön". Bármelyik árcella lehet szám helyett árajánlatos.
  requires_quote   boolean not null default false,

  unique (package_id, category, scope)
);


-- -----------------------------------------------------------------------------
--  Full Service (kárpittisztítás csomag)
-- -----------------------------------------------------------------------------
--  Ez SAJÁT ártábla, nem csomag + extra. Miért?
--  A beépített kárpittisztítás ára nem állandó: Startnál személyautóra
--  22 200 Ft (35 000 − 12 800), Elitnél 30 200 Ft (50 000 − 19 800).
--  Egyetlen extra-ár nem tudná lefedni, ezért a Full Service egy jelölő
--  a foglaláson, és bekapcsolva az ár innen jön.
--
--  Az IDŐ viszont összeadódik: csomag időtartama + 45 perc kárpittisztítás.

create table public.full_service_pricing (
  id              uuid primary key default gen_random_uuid(),
  package_id      uuid not null references public.packages(id) on delete cascade,
  category        vehicle_category not null,
  price_huf       integer,
  included_seats  integer not null default 5,   -- a csomagár 5 ülésre szól

  -- Kisbusz/furgon mindig árajánlatos, mert 2, 3, 5, 7 vagy 9 üléses is lehet.
  requires_quote  boolean not null default false,

  unique (package_id, category)
);


-- -----------------------------------------------------------------------------
--  A csomagtartalom feloldása: öröklődés + felülírás
-- -----------------------------------------------------------------------------
--  Ez a függvény adja vissza egy csomag TELJES tartalmát: a sajátjait és az
--  örökölteket is, a felülírt tételek nélkül.
--
--  Ugyanez a lekérdezés szolgálja ki a weboldal árlistáját ÉS az admin
--  munkalistáját — ezért nem a kódban van, hanem az adatbázisban. Így nem
--  fordulhat elő, hogy a kettő eltér egymástól.
--
--  Használat:
--    select * from resolve_package_items('<csomag id>');
--
--  Csak kívül rendelt foglalásnál elég ennyivel szűrni:
--    select * from resolve_package_items('<csomag id>') where area = 'KULSO';
--
--  Ellenőrzött viselkedés:
--    Start   →  9 tétel, benne "Falc áttörlés"
--    Premium → 13 tétel, hozzájön a gumiápolás és a gyors viasz
--    Elit    → 14 tétel, ahol a "Falc áttörlés" helyén "Falc mélytisztítás",
--              a "Gyors viasz" helyén pedig "Hosszantartó vax" áll —
--              és a felülírt tételek NEM jelennek meg.

create or replace function public.resolve_package_items(p_package_id uuid)
returns table (name text, area service_area, sort_order integer)
language sql
stable
as $$
  -- A "with recursive" végigjárja az öröklődési láncot:
  -- Elit → Premium → Start.
  with recursive chain as (
    select id, includes_package_id
      from public.packages
     where id = p_package_id

    union all

    select p.id, p.includes_package_id
      from public.packages p
      join chain c on p.id = c.includes_package_id
  ),
  -- A lánc összes tétele egy halmazban.
  items as (
    select pi.*
      from public.package_items pi
      join chain c on c.id = pi.package_id
     where pi.active
  )
  -- És most kihagyjuk azokat, amiket a láncban valami felülír.
  select i.name, i.area, i.sort_order
    from items i
   where not exists (
     select 1 from items o where o.overrides_item_id = i.id
   )
   order by i.area, i.sort_order;
$$;


-- =============================================================================
--  6. EXTRÁK ÉS FELÁRAK
-- =============================================================================

create table public.extras (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  description          text,
  area                 service_area,     -- lehet NULL: pl. motortér kozmetika

  price_huf            integer,          -- NULL, ha még nincs megadva vagy árajánlatos
  price_unit           measure_unit not null default 'ALKALOM',

  -- Munkaidő: ez terheli a napi kapacitást.
  work_minutes         integer,
  duration_unit        measure_unit not null default 'ALKALOM',

  -- Száradási idő: NEM terheli a kapacitást (nem dolgozik rajta senki),
  -- de az autó ottlétét meghosszabbítja.
  -- A vizes kárpittisztításnál ez 24 óra = 1440 perc.
  rest_minutes         integer not null default 0,

  -- Ha igaz, a foglalási folyamat felajánlja az éjszakás leadást.
  -- De NEM dönt az ügyfél helyett: vizesen is elviheti, ha sietős.
  recommends_overnight boolean not null default false,

  -- Polírozás, kerámia: előre nem árazható és nem időzíthető.
  -- Ilyenkor a foglalásból árajánlatkérés lesz.
  requires_quote       boolean not null default false,

  sort_order           integer not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger extras_updated_at
  before update on public.extras
  for each row execute function public.set_updated_at();


create table public.surcharges (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  kind            surcharge_kind not null,

  -- Százalékos felárnál ez %, fix felárnál forint.
  default_value   numeric(8,2) not null,

  -- Az oldal szövege szerint "AKÁR 50%-os felárat is felszámíthatunk".
  -- Az "akár" fontos: ez nem kapcsoló, hanem 0 és 50 közötti sáv,
  -- amit a helyszínen döntötök el. Ez a mező a felső határ.
  max_value       numeric(8,2),

  -- Hatás az IDŐRE. Egyelőre 1.0, vagyis a felár csak az árat emeli.
  -- Ezt nem kell most eldönteni: ha a tervezett és a tényleges időt
  -- rögzítitek, fél év múlva az adatból derül ki a helyes érték.
  time_multiplier numeric(4,2) not null default 1.0,

  sort_order      integer not null default 0,
  active          boolean not null default true
);


-- =============================================================================
--  7. NYITVATARTÁS — HÁROM RÉTEGBEN
-- =============================================================================
--  Ez a rendszer egyik legfontosabb finomsága. Nem ugyanaz a hivatalos
--  nyitvatartás, a tényleges munkaidő és az, hogy mikortól lehet autót leadni.
--
--    Hivatalos nyitvatartás  9:00–17:00  → weboldal, Google cégprofil,
--                                          online várós időpontok
--    Tényleges munkavégzés   8:00–17:00  → EBBŐL SZÁMOL A KAPACITÁS
--    Autóleadás              7:15-től    → a LEADOS foglalás drop_off_at mezője
--
--  Ha ezt a hármat egybemostuk volna, a rendszer naponta másfél órát tévedne.
--
--  A hét napjait ISO szerint számozzuk: 1 = hétfő ... 7 = vasárnap.
--  (Ez a postgres extract(isodow from dátum) számozása.)

create table public.business_hours (
  weekday smallint primary key check (weekday between 1 and 7),
  opens   time,
  closes  time,
  closed  boolean not null default false
);

create table public.working_hours (
  weekday smallint primary key check (weekday between 1 and 7),
  starts  time,
  ends    time,
  closed  boolean not null default false
);

-- Az ebédszünet. Várós foglalás nem indulhat és nem fejeződhet be benne;
-- a leadós és a többnapos munkát viszont nem érinti, csak a napi
-- elérhető munkaidőt csökkenti.
create table public.break_windows (
  id      uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 7),
  starts  time not null,
  ends    time not null,
  label   text not null default 'Ebédszünet'
);


-- Egysoros beállítástábla.
-- A "id boolean primary key default true check (id)" trükk azt jelenti,
-- hogy ebbe a táblába CSAK EGYETLEN sor fér bele — az id csak true lehet,
-- és az elsődleges kulcs miatt csak egyszer szerepelhet.
create table public.shop_settings (
  id                     boolean primary key default true check (id),

  -- Nem 7:00, hanem 7:15 — van, hogy késtek, és a rendszer ne ígérjen olyat,
  -- amit nem lehet tartani.
  drop_off_from          time not null default '07:15',

  -- Hány autón dolgoztok párhuzamosan. Alapból 2, naponta felülírható 3-ra,
  -- ha a harmadik ember is autón dolgozik.
  default_parallel_slots integer not null default 2,

  -- HozomViszem: átlagos fordulóidő percben, ha a cégnél nincs sajátja megadva.
  default_travel_minutes integer not null default 20,

  updated_at             timestamptz not null default now()
);

create trigger shop_settings_updated_at
  before update on public.shop_settings
  for each row execute function public.set_updated_at();


-- Kivételnapok, mindkét irányban:
--   rendkívül ZÁRVA  – ünnep, szabadság, hosszú hétvége
--   rendkívül NYITVA – ledolgozós szombat (évi 2-3 alkalom)
--
-- Magyar sajátosság: csütörtöki vagy keddi ünnepnap esetén a péntek/hétfő is
-- szabadnap, és azt szombaton kell ledolgozni. Ez a tábla mindkettőt kezeli.
create table public.day_overrides (
  day             date primary key,
  closed          boolean not null default false,
  opens           time,
  closes          time,
  work_starts     time,
  work_ends       time,
  parallel_slots  integer,
  note            text
);


-- =============================================================================
--  8. FOGLALÁSOK
-- =============================================================================

create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id),
  vehicle_id     uuid not null references public.vehicles(id),

  booking_type   booking_type   not null,
  status         booking_status not null default 'CONFIRMED',
  source         booking_source not null default 'TELEFON',

  -- Melyik napról van szó. Minden típusnál kitöltjük, mert a naptár
  -- és a kapacitásszámítás erre épül.
  service_date   date not null,

  -- VAROS: konkrét kezdés.
  start_at       timestamptz,

  -- LEADOS: mikor hozza, mikor viszi.
  drop_off_at    timestamptz,
  pick_up_at     timestamptz,

  -- TOBBNAPOS: mikor érkezett és mikorra kell.
  arrived_at     timestamptz,
  deadline_at    timestamptz,

  -- Mit rendelt.
  package_id     uuid references public.packages(id),
  scope          booking_scope not null default 'TELJES',
  full_service   boolean not null default false,

  -- Tervezett munkaidő percben: csomag + Full Service + extrák + felár-idő.
  -- Ez terheli a napi kapacitást.
  planned_duration_minutes integer not null default 0,

  -- Száradási idő percben. Az ottlétet hosszabbítja, a kapacitást NEM terheli.
  rest_minutes             integer not null default 0,

  -- Tényleges munkaidő. Ebből derül ki fél év múlva, mennyire jók a becslések,
  -- és mennyivel tart tovább egy felaras munka.
  actual_started_at        timestamptz,
  actual_finished_at       timestamptz,

  -- AZ ÁR BECSLÉS, NEM ÁR.
  -- A végösszeg a helyszínen dől el, ezért a kettőt külön tároljuk.
  -- Ha ez egy mezőben lenne, minden bevételi statisztika hazudna.
  estimated_price_huf      integer not null default 0,
  final_price_huf          integer,
  price_adjustment_reason  text,

  notes                    text,
  internal_notes           text,

  -- Az időpont-áthelyezés NEM állapot, hanem kapcsolat: új foglalás jön
  -- létre, és az eredetin ez a mező mutat rá. Így megmarad az előzmény.
  moved_to_booking_id      uuid references public.bookings(id),

  created_by               uuid references public.staff(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- Várós foglaláshoz kötelező a kezdési időpont.
  constraint varos_needs_start
    check (booking_type <> 'VAROS' or start_at is not null),

  -- Több napos munkához kötelező a határidő. Nem formaság: ez az egyetlen
  -- dolog, ami ezeket a munkákat sorba rendezi.
  constraint tobbnapos_needs_deadline
    check (booking_type <> 'TOBBNAPOS' or deadline_at is not null)
);

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create index bookings_date_idx     on public.bookings (service_date);
create index bookings_status_idx   on public.bookings (status);
create index bookings_customer_idx on public.bookings (customer_id);
create index bookings_vehicle_idx  on public.bookings (vehicle_id);

-- Ez az index a "Nálunk álló autók" sávot szolgálja ki: a még le nem zárt
-- több napos munkákat kérdezi le határidő szerint rendezve.
create index bookings_tobbnapos_idx
  on public.bookings (deadline_at)
  where booking_type = 'TOBBNAPOS'
    and status not in ('COMPLETED', 'REJECTED', 'CANCELLED_BY_CUSTOMER',
                       'CANCELLED_BY_SHOP', 'NO_SHOW');


-- -----------------------------------------------------------------------------
--  Foglalási tételek
-- -----------------------------------------------------------------------------
--  A FOGLALÁS LEMENTI A SAJÁT ADATAIT.
--
--  A csomag nevét, árát és időtartamát a foglalás a létrehozás pillanatában
--  lemásolja ide. Ezért van minden mezőn "_snapshot" a nevében.
--
--  Miért? Mert ha márciusban áremeltek, a januári bevétel nem változhat
--  visszamenőleg. Ha csak hivatkoznánk az ártáblára, minden múltbeli
--  statisztika átíródna egy áremeléssel.

create table public.booking_items (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings(id) on delete cascade,
  kind              booking_item_kind not null,

  -- Melyik csomagra / extrára / felárra hivatkozik. Csak nyomkövetésre —
  -- az összeg és a név már le van mentve, tehát ha a hivatkozott sor
  -- később megváltozik vagy törlődik, ez a tétel akkor is helyes marad.
  ref_id            uuid,

  name_snapshot     text not null,
  quantity          numeric(8,2) not null default 1,   -- pl. 4 ajtó, 5 ülés
  unit_price_huf    integer not null default 0,
  price_huf         integer not null default 0,        -- a tényleges összeg
  work_minutes      integer not null default 0,
  sort_order        integer not null default 0
);

create index booking_items_booking_idx on public.booking_items (booking_id);


-- -----------------------------------------------------------------------------
--  Munkalista — a pipálás
-- -----------------------------------------------------------------------------
--  Minden foglalás mellé legenerálódik a lépéslista a csomag tartalmából
--  (a terjedelem szerint szűrve) és a választott extrákból.
--
--  A done_at és a done_by nem adminisztráció, hanem ADAT: ebből derül ki,
--  MIKOR készült a munka. Így mérhető, mennyi bevétel jött olyan munkából,
--  aminek a lépéseit 8:00 előtt vagy 17:00 után pipálták ki — külön
--  nyilvántartás nélkül.

create table public.booking_tasks (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  name        text not null,
  area        service_area,
  sort_order  integer not null default 0,
  done        boolean not null default false,
  done_at     timestamptz,
  done_by     uuid references public.staff(id)
);

create index booking_tasks_booking_idx on public.booking_tasks (booking_id);


-- -----------------------------------------------------------------------------
--  Napi óraterv a több napos munkákhoz
-- -----------------------------------------------------------------------------
--  A több napos autók nem terhelik a 8:00–17:00 kapacitást, mert hajnalban
--  vagy este készülnek. Ha mégis terveztek rájuk időt egy adott napon,
--  ide beírható — és akkor beleszámít a nap terhelésébe.
--  Ha nem írtok be semmit, nulla: a szabad idő megy rájuk, ami a valóság.

create table public.multiday_allocations (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  day        date not null,
  minutes    integer not null default 0,
  primary key (booking_id, day)
);


-- =============================================================================
--  9. NAPLÓ
-- =============================================================================
--  Ki módosította az árat, ki törölte a foglalást. Négy embernél ez pár hét
--  után hiányozni fog, ezért az elején kerül be, nem a végén.

create table public.audit_log (
  id         bigserial primary key,
  staff_id   uuid references public.staff(id),
  entity     text not null,      -- pl. 'bookings'
  entity_id  uuid,
  action     text not null,      -- pl. 'update', 'status_change'
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_at_idx     on public.audit_log (at desc);


-- =============================================================================
--  10. JOGOSULTSÁGOK (ROW LEVEL SECURITY)
-- =============================================================================
--  Az RLS azt jelenti, hogy a jogosultságot maga az adatbázis ellenőrzi,
--  nem a frontend. Ez azért fontos, mert a frontend megkerülhető — a
--  Supabase kulcsával bárki közvetlenül is hívhatná az adatbázist.
--
--  A szabály egyszerű: a rendszert csak bejelentkezett, AKTÍV dolgozó éri el.
--  A publikus foglalás (Fázis 2) nem itt fog beírni, hanem szerveroldali
--  végponton keresztül, validálással és rate limitinggel — így nem lesz
--  nyilvános insert jogosultság a bookings táblára.

-- Ez a függvény mondja meg, hogy a bejelentkezett felhasználó aktív dolgozó-e.
-- A "security definer" azért kell, hogy a függvény maga ne akadjon fenn a
-- staff táblára tett RLS szabályon (ez végtelen körbehivatkozás lenne).
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.active
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.active and s.role = 'SUPERADMIN'
  );
$$;


-- Bekapcsoljuk az RLS-t minden táblán.
-- FONTOS: bekapcsolás után alapból SENKI nem lát semmit, amíg nincs
-- rá engedélyező szabály. Ez a helyes sorrend — előbb bezárjuk, aztán nyitunk.
alter table public.staff                enable row level security;
alter table public.customers            enable row level security;
alter table public.vehicles             enable row level security;
alter table public.packages             enable row level security;
alter table public.package_items        enable row level security;
alter table public.package_pricing      enable row level security;
alter table public.full_service_pricing enable row level security;
alter table public.extras               enable row level security;
alter table public.surcharges           enable row level security;
alter table public.business_hours       enable row level security;
alter table public.working_hours        enable row level security;
alter table public.break_windows        enable row level security;
alter table public.shop_settings        enable row level security;
alter table public.day_overrides        enable row level security;
alter table public.bookings             enable row level security;
alter table public.booking_items        enable row level security;
alter table public.booking_tasks        enable row level security;
alter table public.multiday_allocations enable row level security;
alter table public.audit_log            enable row level security;


-- A dolgozók táblája külön kezelendő:
--   mindenki látja a listát (kell a "ki pipálta ki" megjelenítéshez),
--   de módosítani csak a superadmin tud.
create policy staff_select on public.staff
  for select using (public.is_staff());

create policy staff_write on public.staff
  for all using (public.is_superadmin()) with check (public.is_superadmin());


-- A többi táblán: aktív dolgozó mindent olvashat és írhat.
-- Ha később finomabb szerepkörök kellenek (pl. a STAFF ne törölhessen
-- foglalást), akkor ezeket a szabályokat kell szűkíteni — a kódot nem.
do $$
declare
  t text;
  tables text[] := array[
    'customers', 'vehicles', 'packages', 'package_items', 'package_pricing',
    'full_service_pricing', 'extras', 'surcharges', 'business_hours',
    'working_hours', 'break_windows', 'shop_settings', 'day_overrides',
    'bookings', 'booking_items', 'booking_tasks', 'multiday_allocations'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t || '_staff_all', t
    );
  end loop;
end
$$;


-- A napló csak olvasható és bővíthető — módosítani és törölni nem lehet.
-- Ez teszi naplóvá: ha átírható lenne, nem érne semmit.
create policy audit_log_select on public.audit_log
  for select using (public.is_staff());

create policy audit_log_insert on public.audit_log
  for insert with check (public.is_staff());


-- =============================================================================
--  KÉSZ.
--  Következő lépés: 0002_seed.sql — a valós csomagok, árak, extrák betöltése.
-- =============================================================================
