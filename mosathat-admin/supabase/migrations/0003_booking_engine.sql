-- =============================================================================
--  MOSATHAT AUTÓKOZMETIKA — 0003 FOGLALÁSI MOTOR
-- =============================================================================
--  A 0001 a táblákat hozta létre, a 0002 feltöltötte valós adattal.
--  Ez a fájl a LOGIKÁT teszi rájuk: árszámítás, időszámítás, munkalista,
--  kapacitás és az ebédszünet szabálya.
--
--  MIÉRT AZ ADATBÁZISBAN ÉS NEM A KÓDBAN?
--  Mert három helyen kell ugyanaz az eredmény: az adminban, a publikus
--  árkalkulátorban és az online foglalásnál. Ha mindhárom külön számolná,
--  előbb-utóbb eltérnének — és a különbséget az ügyfél venné észre.
--  Így egy helyen van, és ha változik a szabály, egy helyen kell javítani.
--
--  FUTTATÁS: a 0002_seed.sql után, ugyanúgy az SQL Editorban.
-- =============================================================================


-- =============================================================================
--  0. EGY HIÁNYZÓ MEZŐ
-- =============================================================================
--  A Full Service a csomag + a nedves kárpittisztítás. Az ára saját táblából
--  jön, az IDEJE viszont hozzáadódik a csomagéhoz. Eddig ez a 45 perc a
--  kódban lett volna beégetve — tegyük inkább ide, hogy szerkeszthető legyen.

alter table public.full_service_pricing
  add column if not exists extra_work_minutes integer not null default 45;

comment on column public.full_service_pricing.extra_work_minutes is
  'A kárpittisztítás munkaideje percben, ami a csomag idejéhez hozzáadódik.';


-- =============================================================================
--  1. ÁR- ÉS IDŐSZÁMÍTÁS
-- =============================================================================
--  Ez a rendszer legfontosabb függvénye.
--
--  Az extrákat JSON tömbként kapja, mert darabszám is tartozhat hozzájuk:
--    '[{"extra_id":"...","quantity":4}, {"extra_id":"...","quantity":5}]'
--
--  Két szabály, amit külön figyel:
--
--  a) AZ ÁR ÉS AZ IDŐ NEM UGYANÚGY SZORZÓDIK.
--     Ajtókárpit: 5 perc/ajtó — az ár és az idő is darabra megy.
--     Vizes kárpit: 6 500 Ft/ülés, de a 45 perc az EGÉSZ autóra.
--     Ezért néz külön a price_unit és a duration_unit mezőre.
--
--  b) A SZÁRADÁS NEM MUNKAIDŐ.
--     A rest_minutes külön jön vissza: az autó ottlétét hosszabbítja,
--     de a napi kapacitást nem terheli.

create or replace function public.calc_service(
  p_package_id    uuid,
  p_category      vehicle_category,
  p_scope         booking_scope default 'TELJES',
  p_full_service  boolean       default false,
  p_extras        jsonb         default '[]'::jsonb,
  p_surcharge_pct numeric       default 0,      -- 0–50, erősen szennyezett
  p_surcharge_fix integer       default 0       -- pl. kutyaszőr 2 000 Ft
)
returns table (
  price_huf      integer,   -- ha requires_quote igaz, ez csak RÉSZÖSSZEG
  work_minutes   integer,   -- ez terheli a napi kapacitást; NULL, ha nem ismert
  rest_minutes   integer,   -- száradás; az ottlétet hosszabbítja, kapacitást nem
  requires_quote boolean,   -- ha bármelyik tétel nem árazható előre
  duration_known boolean    -- hamis, ha hiányzik az időtartam (csak külső/belső)
)
language plpgsql
stable
as $$
declare
  v_price  integer := 0;
  v_work   integer := 0;
  v_rest   integer := 0;
  v_quote  boolean := false;
  v_known  boolean := true;
  r        record;
  v_qty    numeric;
begin
  -- ---------- CSOMAG ----------
  if p_full_service then
    -- Full Service: az ár a saját táblából jön, NEM a csomag + extra összege.
    -- (Startnál a kárpit 22 200 Ft-ot ér, Elitnél 30 200-at — ugyanazért az
    --  öt ülésért. Egyetlen extra-ár ezt nem tudná lefedni.)
    select fsp.price_huf, fsp.requires_quote, fsp.extra_work_minutes
      into r
      from public.full_service_pricing fsp
     where fsp.package_id = p_package_id and fsp.category = p_category;

    if not found or r.requires_quote or r.price_huf is null then
      v_quote := true;                         -- pl. kisbusz: "Érdeklődjön"
    else
      v_price := v_price + r.price_huf;
    end if;

    -- az idő viszont összeadódik: csomag + kárpittisztítás
    v_work := v_work + coalesce((
      select pp.duration_minutes from public.package_pricing pp
       where pp.package_id = p_package_id and pp.category = p_category
         and pp.scope = 'TELJES'), 0)
      + coalesce(r.extra_work_minutes, 45);

    -- a kárpit szárad: a leghosszabb száradási időt vesszük figyelembe
    v_rest := greatest(v_rest, coalesce((
      select e.rest_minutes from public.extras e
       where e.recommends_overnight and e.active
       order by e.rest_minutes desc limit 1), 0));

  else
    select pp.price_huf, pp.duration_minutes, pp.requires_quote
      into r
      from public.package_pricing pp
     where pp.package_id = p_package_id and pp.category = p_category and pp.scope = p_scope;

    if not found or r.requires_quote or r.price_huf is null then
      v_quote := true;
    else
      v_price := v_price + r.price_huf;
    end if;

    if r.duration_minutes is null then
      -- A csak külső és csak belső időtartamai még nincsenek feltöltve.
      -- Nem tippelünk: jelezzük, hogy az idő nem ismert.
      v_known := false;
    else
      v_work := v_work + r.duration_minutes;
    end if;
  end if;

  -- ---------- EXTRÁK ----------
  for r in
    select e.*, coalesce((x->>'quantity')::numeric, 1) as qty
      from jsonb_array_elements(coalesce(p_extras, '[]'::jsonb)) as x
      join public.extras e on e.id = (x->>'extra_id')::uuid
     where e.active
  loop
    v_qty := greatest(r.qty, 1);

    if r.requires_quote or r.price_huf is null then
      v_quote := true;                          -- polírozás, kerámia, vagy hiányzó ár
    else
      -- az ár csak akkor szorzódik, ha darabra megy (ÜLÉS, AJTÓ, LITER, DB)
      v_price := v_price + (r.price_huf * case when r.price_unit = 'ALKALOM' then 1 else v_qty end)::integer;
    end if;

    if r.work_minutes is not null then
      -- az idő külön mértékegység szerint szorzódik
      v_work := v_work + (r.work_minutes * case when r.duration_unit = 'ALKALOM' then 1 else v_qty end)::integer;
    end if;

    v_rest := greatest(v_rest, coalesce(r.rest_minutes, 0));
  end loop;

  -- ---------- FELÁRAK ----------
  -- A százalékos felár a teljes összegre megy. A fix hozzáadódik.
  if p_surcharge_pct is not null and p_surcharge_pct <> 0 then
    v_price := round(v_price * (1 + p_surcharge_pct / 100.0))::integer;
  end if;
  v_price := v_price + coalesce(p_surcharge_fix, 0);

  price_huf := v_price;

  -- Ha az időtartam nem ismert (csak külső / csak belső, ahol még nincs
  -- feltöltve adat), NULL-t adunk vissza, nem nullát. A nulla azt jelentené,
  -- hogy a munka nem foglal időt — és a napi kapacitás csendben alábecsülné
  -- a terhelést. Így a felület rákérdez, és a dolgozó beírja a valós időt.
  work_minutes   := case when v_known then v_work else null end;

  rest_minutes   := v_rest;
  requires_quote := v_quote;
  duration_known := v_known;
  return next;
end;
$$;

comment on function public.calc_service is
  'Ár- és időszámítás egy helyen: csomag + terjedelem + Full Service + extrák + felár. '
  'Ha requires_quote igaz, a price_huf csak részösszeg. '
  'Ha duration_known hamis, a work_minutes NULL — a felületnek rá kell kérdeznie.';


-- =============================================================================
--  2. MUNKALISTA GENERÁLÁS
-- =============================================================================
--  A lépések forrása a csomagtartalom (öröklődéssel és felülírással feloldva)
--  és a választott extrák. Nincs külön sablontábla: ugyanaz a lista, amiből
--  a weboldal árlistája készül.
--
--  A függvény ÚJRAFUTTATHATÓ: ha menet közben változik a csomag, a már
--  kipipált lépéseket megtartja, a feleslegeseket kiveszi, az újakat beteszi.
--  Így egy javítás nem törli el a dolgozó munkáját.

--  Előbb egy külön függvény arra, hogy MI KELLENE a listára.
--  Szándékosan nem ideiglenes táblát használunk: az `on commit drop`
--  temp tábla egy tranzakción belül másodszorra már létezne, és a
--  foglalásfelvitel jellemzően több foglalást hoz létre egy menetben.

create or replace function public.booking_task_plan(p_booking_id uuid)
returns table (name text, area service_area, sort_order integer)
language sql
stable
as $$
  -- a csomag tételei, a terjedelem szerint szűrve
  -- (egy "csak kívül" foglalás listájára nem kerülhet fel a porszívózás)
  select r.name, r.area, r.sort_order
    from public.bookings b
    join lateral public.resolve_package_items(b.package_id) r on true
   where b.id = p_booking_id
     and b.package_id is not null
     and (b.scope = 'TELJES' or r.area::text = b.scope::text)

  union all

  -- a választott extrák, a csomag lépései után
  select bi.name_snapshot, e.area, 900 + bi.sort_order
    from public.booking_items bi
    left join public.extras e on e.id = bi.ref_id
   where bi.booking_id = p_booking_id
     and bi.kind in ('EXTRA', 'FULL_SERVICE');
$$;


create or replace function public.rebuild_booking_tasks(p_booking_id uuid)
returns integer      -- hány lépés lett a listán
language plpgsql
volatile
as $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.bookings where id = p_booking_id) then
    raise exception 'Nincs ilyen foglalás: %', p_booking_id;
  end if;

  -- 1. Kivesszük azt, ami már nem kell — de csak ha NINCS kipipálva.
  delete from public.booking_tasks t
   where t.booking_id = p_booking_id
     and not t.done
     and not exists (
       select 1 from public.booking_task_plan(p_booking_id) k where k.name = t.name);

  -- 2. Betesszük, ami hiányzik.
  insert into public.booking_tasks (booking_id, name, area, sort_order)
  select p_booking_id, k.name, k.area, min(k.sort_order)
    from public.booking_task_plan(p_booking_id) k
   where not exists (
     select 1 from public.booking_tasks t
      where t.booking_id = p_booking_id and t.name = k.name)
   group by k.name, k.area;

  select count(*) into v_count from public.booking_tasks where booking_id = p_booking_id;
  return v_count;
end;
$$;


-- =============================================================================
--  3. NYITVATARTÁS ÉS AZ EBÉDSZÜNET SZABÁLYA
-- =============================================================================
--  A nap munkaideje szünetekre bontva. Egy ebédszünet két sávot ad:
--  nyitástól 12:00-ig, majd 13:30-tól zárásig.
--
--  A kivételnapok mindkét irányban működnek: rendkívüli zárva (ünnep körüli
--  szabadnap) és rendkívüli nyitva (ledolgozós szombat).

create or replace function public.work_windows(p_day date)
returns table (window_no integer, starts time, ends time)
language plpgsql
stable
as $$
declare
  v_dow    smallint := extract(isodow from p_day);
  v_ovr    public.day_overrides%rowtype;
  v_start  time;
  v_end    time;
  v_closed boolean;
  v_cur    time;
  v_n      integer := 0;
  b        record;
begin
  select * into v_ovr from public.day_overrides where day = p_day;
  select wh.starts, wh.ends, wh.closed into v_start, v_end, v_closed
    from public.working_hours wh where wh.weekday = v_dow;

  if v_ovr.day is not null then
    if v_ovr.closed then
      v_closed := true;
    end if;
    -- ledolgozós szombat: a kivételnap ad munkaidőt oda, ahol amúgy zárva van
    if v_ovr.work_starts is not null then v_start := v_ovr.work_starts; v_closed := false; end if;
    if v_ovr.work_ends   is not null then v_end   := v_ovr.work_ends;   v_closed := false; end if;
  end if;

  if coalesce(v_closed, true) or v_start is null or v_end is null then
    return;                      -- zárva: nincs egyetlen sáv sem
  end if;

  v_cur := v_start;
  for b in
    select bw.starts, bw.ends from public.break_windows bw
     where bw.weekday = v_dow and bw.ends > v_start and bw.starts < v_end
     order by bw.starts
  loop
    if b.starts > v_cur then
      v_n := v_n + 1;
      window_no := v_n; starts := v_cur; ends := b.starts; return next;
    end if;
    v_cur := greatest(v_cur, b.ends);
  end loop;

  if v_cur < v_end then
    v_n := v_n + 1;
    window_no := v_n; starts := v_cur; ends := v_end; return next;
  end if;
end;
$$;


--  A legkésőbbi kezdés sávonként.
--  Ez a szabály megy a kódba, nem a konkrét órák:
--      legkésőbbi kezdés = a sáv vége − a teljes munkaidő
--  Ebből jön ki magától, hogy Elit személyautóra délelőtt 10:00 a határ,
--  Startra 11:00 — és ha változik az ebédidő, ez is vele változik.

create or replace function public.latest_start(p_day date, p_minutes integer)
returns table (window_no integer, starts time, ends time, latest_start time, fits boolean)
language sql
stable
as $$
  select w.window_no, w.starts, w.ends,
         case when w.ends - make_interval(mins => p_minutes) >= w.starts
              then (w.ends - make_interval(mins => p_minutes))::time end,
         (w.ends - make_interval(mins => p_minutes)) >= w.starts
    from public.work_windows(p_day) w
   order by w.window_no;
$$;


-- =============================================================================
--  4. NAPI KAPACITÁS
-- =============================================================================
--      napi kapacitás = párhuzamos autók × (munkaidő − szünetek)
--      terhelés       = a várós és leadós munkák tervezett ideje
--                     + a több napos autókra AZNAPRA tervezett idő
--
--  A több napos munkák alapból NEM terhelik a keretet, mert nyitvatartáson
--  kívül készülnek. Csak akkor számítanak bele, ha valaki beírt rájuk órát
--  arra a napra.

create or replace function public.day_capacity(p_day date)
returns table (
  parallel_slots   integer,
  open_minutes     integer,   -- tényleges munkaidő szünetek nélkül
  capacity_minutes integer,   -- ennyi munkaóra fér a napba
  booked_minutes   integer,
  free_minutes     integer,
  load_pct         numeric
)
language plpgsql
stable
as $$
declare
  v_ovr   public.day_overrides%rowtype;
  v_open  integer;
  v_slots integer;
  v_book  integer;
begin
  select * into v_ovr from public.day_overrides where day = p_day;

  select coalesce(sum(extract(epoch from (w.ends - w.starts)) / 60), 0)::integer
    into v_open
    from public.work_windows(p_day) w;

  select coalesce(v_ovr.parallel_slots, s.default_parallel_slots, 2)
    into v_slots
    from public.shop_settings s
   limit 1;

  select coalesce(sum(b.planned_duration_minutes), 0)::integer
    into v_book
    from public.bookings b
   where b.service_date = p_day
     and b.booking_type in ('VAROS', 'LEADOS')
     and b.status not in ('REJECTED', 'CANCELLED_BY_CUSTOMER',
                          'CANCELLED_BY_SHOP', 'NO_SHOW');

  v_book := v_book + coalesce((
    select sum(ma.minutes) from public.multiday_allocations ma where ma.day = p_day), 0);

  parallel_slots   := v_slots;
  open_minutes     := v_open;
  capacity_minutes := v_open * v_slots;
  booked_minutes   := v_book;
  free_minutes     := greatest(capacity_minutes - v_book, 0);
  load_pct         := case when capacity_minutes > 0
                           then round(v_book * 100.0 / capacity_minutes, 1) end;
  return next;
end;
$$;


-- =============================================================================
--  5. NÉZETEK AZ ADMINHOZ
-- =============================================================================
--  A "security_invoker = on" azt jelenti, hogy a nézet a HÍVÓ jogaival fut,
--  tehát a táblákra tett RLS szabályok érvényesek maradnak. Enélkül a nézet
--  megkerülné a jogosultságellenőrzést — ez a leggyakoribb RLS-hiba.

create or replace view public.v_day_bookings
with (security_invoker = on) as
select
  b.id,
  b.service_date,
  b.booking_type,
  b.status,
  b.source,
  b.start_at,
  b.drop_off_at,
  b.pick_up_at,
  b.scope,
  b.full_service,
  b.planned_duration_minutes,
  b.rest_minutes,
  b.estimated_price_huf,
  b.final_price_huf,
  b.notes,
  b.internal_notes,

  c.id           as customer_id,
  c.name         as customer_name,
  c.phone        as customer_phone,
  c.type         as customer_type,
  c.company_name,

  v.id           as vehicle_id,
  v.plate_raw,
  v.plate_country,
  v.brand,
  v.model,
  v.category,
  v.seats,

  p.code         as package_code,
  p.name         as package_name,

  -- a munkalista állása: ez megy a kártyára "4/9" formában
  (select count(*) from public.booking_tasks t where t.booking_id = b.id)              as tasks_total,
  (select count(*) from public.booking_tasks t where t.booking_id = b.id and t.done)   as tasks_done,

  -- mikor pipálták ki az első és az utolsó lépést — ebből derül ki,
  -- hogy nyitvatartási időn kívül készült-e a munka
  (select min(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as first_done_at,
  (select max(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as last_done_at
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.vehicles  v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id;


--  A "Nálunk álló autók" sáv adata: a több napos munkák, határidő szerint.
create or replace view public.v_standing_cars
with (security_invoker = on) as
select
  b.id,
  b.arrived_at,
  b.deadline_at,
  (current_date - b.arrived_at::date)                       as days_in,
  (b.deadline_at::date - current_date)                      as days_left,
  (b.deadline_at::date - current_date) <= 1                 as urgent,
  b.status,
  c.name         as customer_name,
  c.company_name,
  v.plate_raw,
  v.brand,
  v.model,
  p.name         as package_name,
  (select count(*) from public.booking_tasks t where t.booking_id = b.id)            as tasks_total,
  (select count(*) from public.booking_tasks t where t.booking_id = b.id and t.done) as tasks_done
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.vehicles  v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id
where b.booking_type = 'TOBBNAPOS'
  and b.status not in ('COMPLETED', 'REJECTED', 'CANCELLED_BY_CUSTOMER',
                       'CANCELLED_BY_SHOP', 'NO_SHOW');


--  Az ügyfél korábbi munkái — ez tölti fel az "Új időpont" ablakban a
--  "Korábban ezeket kérte" listát, amire rákoppintva beáll a csomag.
create or replace view public.v_customer_history
with (security_invoker = on) as
select
  b.customer_id,
  b.vehicle_id,
  v.plate_normalized,
  b.service_date,
  p.code  as package_code,
  p.name  as package_name,
  b.scope,
  b.full_service,
  coalesce(b.final_price_huf, b.estimated_price_huf) as price_huf
from public.bookings b
join public.vehicles v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id
where b.status = 'COMPLETED'
order by b.service_date desc;


-- =============================================================================
--  KÉSZ.
--  Következő: 0004_demo.sql — néhány próbafoglalás, hogy legyen mit nézni.
-- =============================================================================
