-- =============================================================================
--  20260927090000_csomag_tartalom.sql
--  Mi van a csomagokban — összehasonlító táblázat
-- =============================================================================
--  Eddig a Szolgáltatások képernyő az ÁRAKAT mutatta: melyik csomag mennyibe
--  kerül melyik méretnél. A leggyakoribb telefonos kérdésre viszont nem
--  válaszolt: „és mi a különbség a Premium és az Elit között?"
--
--  A tartalom eddig is megvolt az adatbázisban (package_items), és a
--  resolve_package_items() ki is számolta — de csak a munkalista készítésekor
--  használtuk. A felület nem tudta megmutatni.
--
--  Ehhez egy dolog hiányzott: a SOR AZONOSÍTÓJA.
--
--  A csomagok öröklődnek (Elit ⊃ Premium ⊃ Start), és két tétel nem
--  hozzáadódik, hanem FELÜLÍR egy örököltet:
--
--      Falc áttörlés   (Start)    →  Falc mélytisztítás  (Elit)
--      Gyors viasz     (Premium)  →  Hosszantartó vax    (Elit)
--
--  Ha ezeket külön sorként mutatnánk, a táblázat azt állítaná, hogy az
--  Elitből hiányzik a falctisztítás — miközben pont alaposabb. Ezért minden
--  tétel megkapja a felülírási lánc gyökerének az azonosítóját: ez fogja egy
--  sorba a kettőt, és a cellában az látszik, hogy az adott csomagban minek
--  hívják.
--
--  A logika egy helyen marad: a resolve_package_items() mostantól ugyanebből
--  a függvényből olvas, tehát a munkalista és a táblázat nem tudnak eltérni
--  egymástól.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  Egy csomag tényleges tartalma, sorazonosítóval
-- -----------------------------------------------------------------------------
--  Amit visszaad:
--    slot_id    – a felülírási lánc gyökere: EZ a táblázat sora
--    slot_name  – a gyökér neve, vagyis a sor felirata
--    item_id    – ami ebben a csomagban ténylegesen benne van
--    name       – ennek a neve (a gyökérétől eltérhet: „Falc mélytisztítás")
--
--  Ellenőrzött viselkedés:
--    Start   →  9 sor, mind slot_name = name
--    Premium → 13 sor
--    Elit    → 14 sor, ebből kettőnél name <> slot_name

create or replace function public.resolve_package_slots(p_package_id uuid)
returns table (
  slot_id    uuid,
  slot_name  text,
  item_id    uuid,
  name       text,
  area       service_area,
  sort_order integer)
language sql
stable
as $$
  with recursive
  -- az öröklődési lánc: Elit → Premium → Start
  chain as (
    select p.id, p.includes_package_id
      from public.packages p
     where p.id = p_package_id
    union all
    select p.id, p.includes_package_id
      from public.packages p
      join chain c on p.id = c.includes_package_id
  ),
  items as (
    select pi.*
      from public.package_items pi
      join chain c on c.id = pi.package_id
     where pi.active
  ),
  -- ami ténylegesen benne van: amit semmi nem ír felül
  hatasos as (
    select i.*
      from items i
     where not exists (select 1 from items o where o.overrides_item_id = i.id)
  ),
  -- felfelé a felülírási láncon, amíg van mit felülírni
  lanc as (
    select h.id as item_id, h.id as lepcso, h.overrides_item_id
      from hatasos h
    union all
    select l.item_id, pi.id, pi.overrides_item_id
      from lanc l
      join public.package_items pi on pi.id = l.overrides_item_id
  ),
  gyoker as (
    select l.item_id, l.lepcso as slot_id
      from lanc l
     where l.overrides_item_id is null
  )
  select
    g.slot_id,
    (select pi.name from public.package_items pi where pi.id = g.slot_id) as slot_name,
    h.id,
    h.name,
    h.area,
    -- A sor helyét a gyökér sorrendje adja, hogy a felülírt és a felülíró
    -- tétel biztosan egy vonalban maradjon.
    (select pi.sort_order from public.package_items pi where pi.id = g.slot_id) as sort_order
  from hatasos h
  join gyoker g on g.item_id = h.id
  order by h.area, 6;
$$;


-- A régi függvény innentől ugyanebből olvas. A visszatérési típusa
-- változatlan — a foglalási motor és a munkalap ugyanúgy hívja.
create or replace function public.resolve_package_items(p_package_id uuid)
returns table (name text, area service_area, sort_order integer)
language sql
stable
as $$
  select s.name, s.area, s.sort_order
    from public.resolve_package_slots(p_package_id) s
   order by s.area, s.sort_order;
$$;


-- -----------------------------------------------------------------------------
--  Az összehasonlító táblázat egyetlen nézetben
-- -----------------------------------------------------------------------------
--  Hosszú formában adja vissza: csomagonként egy sor minden tételről. A
--  felület ebből rak össze oszlopokat — az, hogy három csomag van, a
--  megjelenítés dolga, nem az adatbázisé. Ha holnap lesz egy negyedik,
--  a táblázat magától egy oszloppal bővül.

create or replace view public.v_package_matrix
with (security_invoker = on) as
select
  p.id           as package_id,
  p.code         as package_code,
  p.name         as package_name,
  p.sort_order   as package_sort,
  s.slot_id,
  s.slot_name,
  s.name,
  s.area,
  s.sort_order
from public.packages p
join lateral public.resolve_package_slots(p.id) s on true
where p.active;

comment on view public.v_package_matrix is
  'Mi van az egyes csomagokban. Egy sor = egy csomag egy tétele. A slot_id '
  'köti össze a felülírt és a felülíró tételt (Falc áttörlés / Falc '
  'mélytisztítás), hogy a táblázatban egy sorba kerüljenek.';

-- -----------------------------------------------------------------------------
--  „Mivel több az előzőnél" — egy sor a csomag neve mellé
-- -----------------------------------------------------------------------------
--  A teljes táblázat tizennégy soros. Foglalás közben, telefonnal a fülnél
--  ennyit nem olvas el senki. Ott az kell, ami ténylegesen elhangzik:
--
--      „A Premium a Start mindene, plusz gyors viasz, gumiápolás,
--       illatosítás és műszerfalápolás."
--
--  Ez a nézet pontosan ezt a felsorolást adja: amivel a csomag több a
--  közvetlen elődjénél. Kétféleképpen lehet több:
--
--    ÚJ tétel      – az elődben nincs ilyen sor (Gumiápolás, Illatosítás)
--    MÁS tétel     – ugyanaz a sor, de más munka vagy más anyag
--                    (Falc áttörlés → Falc mélytisztítás,
--                     Gyors viasz   → Hosszantartó vax)
--
--  Mindkettő különbség, tehát mindkettő belekerül — a csomagban érvényes
--  nevén. A Startnak nincs elődje, ezért nem is ad vissza rá sort: ott
--  nincs mihez képest többet mondani.

create or replace view public.v_package_extra
with (security_invoker = on) as
select
  p.id    as package_id,
  p.code  as package_code,
  e.name  as parent_name,
  s.name,
  s.area,
  s.sort_order
from public.packages p
join public.packages e on e.id = p.includes_package_id
join lateral public.resolve_package_slots(p.id) s on true
where p.active
  and not exists (
    select 1
      from public.resolve_package_slots(p.includes_package_id) sz
     where sz.slot_id = s.slot_id
       and sz.name    = s.name
  );

comment on view public.v_package_extra is
  'Amivel egy csomag több a közvetlen elődjénél: új tételek és a felülírt '
  'tételek új neve. A Startra nem ad sort, mert nincs elődje.';


-- A nézetek security_invoker-ek, tehát a hívó jogaival olvasnak. A
-- package_items táblát minden belépett dolgozó olvashatja (írni csak a
-- tulaj tudja), így a táblázatot az alkalmazott is látja — pont ez volt a cél.
grant execute on function public.resolve_package_slots(uuid) to authenticated;
grant select on public.v_package_matrix to authenticated;
grant select on public.v_package_extra  to authenticated;
