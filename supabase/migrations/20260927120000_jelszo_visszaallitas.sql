-- =============================================================================
--  20260927120000_jelszo_visszaallitas.sql
--  Kizárta magát mindenki — jelszó visszaállítása kívülről
-- =============================================================================
--  A Felhasználók képernyőn már van „Új jelszó" gomb: a tulaj adhat újat az
--  alkalmazottnak, a fejlesztő bárkinek. Ez a legtöbb esetre elég.
--
--  Egy esetre viszont NEM elég, és pont az a rossz nap: amikor senki nem tud
--  belépni. Ha a tulajdonos elfelejti a jelszavát és a fejlesztő nem elérhető
--  — vagy ha a fejlesztői jelszó vész el —, akkor nincs olyan bejelentkezett
--  felhasználó, aki megnyomhatná azt a gombot. Egy felületen belüli megoldás
--  itt fogalmilag nem segít: ahhoz be kellene lépni.
--
--  Ezért ez a függvény NEM a felületről hívható. Nincs rá semmilyen
--  jogosultság kiadva — sem az alkalmazottnak, sem a tulajnak, senkinek.
--  Kizárólag onnan fut le, ahol az adatbázis gazdájaként dolgozol:
--
--      Supabase → SQL Editor:
--
--      select public.jelszo_visszaallitas('tulaj@mosathat.hu', 'ideiglenes123');
--
--  Ez szándékos. Ha a felületről is hívható lenne, akkor egy alkalmazott
--  saját magának adhatna tulajdonosi jelszót — vagyis a teljes
--  jogosultságrendszer meg lenne kerülve egyetlen gombbal.
--
--  A kulcs, amivel a Supabase SQL Editor dolgozik, nincs a böngészőben és
--  nincs a kódban: a saját Supabase-fiókod mögött van. Ez az egyetlen hely,
--  ahonnan ezt szabad megtenni.
-- =============================================================================

create or replace function public.jelszo_visszaallitas(p_email text, p_jelszo text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid;
  v_nev   text;
  v_role  public.staff_role;
  v_aktiv boolean;
begin
  if p_jelszo is null or length(p_jelszo) < 8 then
    raise exception 'A jelszó legyen legalább 8 karakter.';
  end if;

  select u.id into v_id from auth.users u where lower(u.email) = v_email;
  if v_id is null then
    raise exception 'Nincs ilyen e-mail címmel fiók: %', v_email
      using hint = 'A címet a Supabase → Authentication → Users listában tudod ellenőrizni.';
  end if;

  select s.full_name, s.role, s.active into v_nev, v_role, v_aktiv
    from public.staff s where s.id = v_id;

  update auth.users u
     set encrypted_password = extensions.crypt(p_jelszo, extensions.gen_salt('bf', 10)),
         updated_at         = now()
   where u.id = v_id;

  -- A kikapcsolt hozzáférés nem hiba, de tudni kell róla: jó jelszóval sem
  -- fog belépni, és a következő fél óra azzal menne el, hogy miért nem.
  return format('Kész. %s (%s) jelszava beállítva.%s',
    coalesce(v_nev, v_email),
    coalesce(v_role::text, 'nincs hozzá dolgozói sor'),
    case when v_aktiv is false
         then ' FIGYELEM: ez a hozzáférés ki van kapcsolva, így belépni sem fog. '
              || 'Kapcsold vissza a Felhasználók képernyőn.'
         else '' end);
end;
$$;

comment on function public.jelszo_visszaallitas(text, text) is
  'Vészhelyzeti jelszó-visszaállítás a Supabase SQL Editorból, amikor senki '
  'nem tud belépni. A felületről SZÁNDÉKOSAN nem hívható.';

-- A PostgreSQL alapból MINDENKINEK megadja a függvények futtatási jogát.
-- Itt ez végzetes volna: egy alkalmazott saját magának adhatna tulajdonosi
-- jelszót. Ezért elvesszük — és nem is adjuk vissza senkinek.
revoke all on function public.jelszo_visszaallitas(text, text) from public;
revoke all on function public.jelszo_visszaallitas(text, text) from anon;
revoke all on function public.jelszo_visszaallitas(text, text) from authenticated;
