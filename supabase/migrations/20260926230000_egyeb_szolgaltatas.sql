-- =============================================================================
--  20260926230000_egyeb_szolgaltatas.sql
--  Egyéb szolgáltatás felvétele a már rögzített foglalásra
-- =============================================================================
--  Eddig a foglaláson lévő extrákat csak a szerkesztő űrlapon lehetett
--  átállítani. A gyakorlatban viszont menet közben derül ki a legtöbb:
--  „nézd meg a kárpitot is", „ezt a kátrányt is szedjétek le". Ilyenkor a
--  teljes űrlap újranyitása négy kattintás, és közben minden más adatot is
--  meg kell erősíteni.
--
--  Ehhez a felületnek tudnia kell, MELYIK extrák vannak most a foglaláson.
--  A v_booking_extras eddig ezt nem mondta meg teljesen: kihagyta az
--  alkalmi árazású tételeket (price_unit = 'ALKALOM'), mert eredetileg csak
--  a mennyiség-szerkesztéshez készült — a literhez és az ülésszámhoz.
--
--  Így viszont a polírozás vagy a kátrányeltávolítás egyáltalán nem
--  szerepelt benne, tehát a felület nem tudta volna kipipálva mutatni.
--
--  A szűrő ezért kikerül. Nem lesz belőle két lista: ugyanez a nézet adja a
--  „mennyiségek" blokkot is, csak ott a felület a nem alkalmi tételeket
--  mutatja. Egy nézet, két felhasználás — nem két nézet, ami előbb-utóbb
--  eltér egymástól.
--
--  A felvétel és az elvétel a már meglévő patch_booking úton megy: az
--  'extras' kulcs átírása újraszámolja az árat, az időt és a munkalistát,
--  a többi adatot pedig változatlanul hagyja. Nem kell új függvény.
-- =============================================================================

create or replace view public.v_booking_extras
with (security_invoker = on) as
select
  bi.booking_id,
  bi.id            as item_id,
  bi.ref_id        as extra_id,
  bi.name_snapshot as name,
  bi.quantity,
  bi.price_huf,
  e.price_unit,
  e.duration_unit
from public.booking_items bi
join public.extras e on e.id = bi.ref_id
where bi.kind = 'EXTRA';

comment on view public.v_booking_extras is
  'Egy foglalás összes külön kért szolgáltatása. A mennyiséges tételeknél '
  '(liter, ülés, ajtó) a mennyiség a munkalapon szerkeszthető; az alkalmi '
  'árazásúak azért vannak benne, hogy a felület tudja, mi van kipipálva.';
