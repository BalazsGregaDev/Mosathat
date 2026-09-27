-- =============================================================================
--  20260927110000_jelszo.sql
--  Jelszó megadása egy másik felhasználónak
-- =============================================================================
--  Eddig a jelszót csak a fiók létrehozásakor lehetett megadni. Ha egy
--  dolgozó elfelejtette, nem volt mit tenni: új fiókot kellett neki csinálni.
--
--  A SAJÁT jelszavát mindenki a Supabase-en keresztül írja át — ahhoz nem
--  kell adatbázisfüggvény, azt a felület intézi (updateUser). Ez a fájl a
--  másik esetről szól: a tulaj megad egy új jelszót annak, aki kizárta magát.
--
--  MIÉRT ÍGY?
--
--  A „rendes" út az admin API vagy a jelszó-emlékeztető levél volna. Az
--  előbbihez service-role kulcs kell, ami SOHA nem kerülhet a böngészőbe —
--  azzal a kulccsal az egész adatbázist bárki átírhatná, aki megnyitja a
--  fejlesztői eszközöket. Az utóbbihoz működő levélküldés kell; a beépített
--  Supabase SMTP óránként két levelet enged, és csak a projekt tagjainak.
--
--  Marad az, hogy az adatbázis maga írja át a jelszó lenyomatát. Ez működik,
--  mert a Supabase ugyanazt a bcrypt formátumot használja, amit a pgcrypto
--  előállít.
--
--  AMIT TUDNI KELL RÓLA: az auth.users a Supabase saját táblája, nem a
--  miénk. Ma működik; ha a Supabase egyszer átalakítja a belső tárolást, ez
--  a függvény eltörhet. Akkor egy Edge Function lesz a megoldás, service-role
--  kulccsal — az a szerveren fut, tehát oda való. Addig ez a legkevésbé
--  kockázatos út, ami valóban működik.
--
--  A demóban (böngészőben futó PostgreSQL) nincs pgcrypto, és nincs is
--  valódi bejelentkezés. A függvény ott létrejön, de nem hívjuk meg — a
--  plpgsql a törzsében lévő függvényneveket csak híváskor keresi ki, ezért a
--  migráció ettől még hibátlanul lefut.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  Jelszó beállítása egy másik felhasználónak
-- -----------------------------------------------------------------------------
--  Ugyanaz a jogosultsági szabály, mint a set_staff()-nál:
--    fejlesztő → bárkinek
--    tulajdonos → csak alkalmazottnak
--    alkalmazott → senkinek
--
--  A saját jelszavát senki nem ezen az úton írja át. Annak a felületen külön
--  útja van, ahol meg kell adni a MOSTANIT is — enélkül egy nyitva felejtett
--  gépnél bárki átvehetné a fiókot.

create or replace function public.set_staff_password(p_staff_id uuid, p_jelszo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sajat public.staff_role := public.my_role();
  v_cel   public.staff_role;
  v_nev   text;
begin
  if v_sajat is null or v_sajat = 'STAFF' then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;

  select s.role, s.full_name into v_cel, v_nev
    from public.staff s where s.id = p_staff_id;
  if not found then
    raise exception 'Nincs ilyen felhasználó.';
  end if;

  if p_staff_id = auth.uid() then
    raise exception 'A saját jelszavadat a fiókodnál tudod átírni.'
      using hint = 'Ott a mostani jelszót is meg kell adni.';
  end if;

  if v_sajat::text = 'TULAJDONOS' and v_cel <> 'STAFF' then
    raise exception 'A fejlesztői és tulajdonosi jelszót a fejlesztő kezeli.'
      using errcode = '42501';
  end if;

  if p_jelszo is null or length(p_jelszo) < 8 then
    raise exception 'A jelszó legyen legalább 8 karakter.';
  end if;

  -- A költség szándékosan 10, nem az alapértelmezett 6: ugyanaz, amivel a
  -- Supabase is dolgozik. Kisebb költség gyorsabban törhető jelszót ad.
  update auth.users u
     set encrypted_password = extensions.crypt(p_jelszo, extensions.gen_salt('bf', 10)),
         updated_at         = now()
   where u.id = p_staff_id;

  if not found then
    raise exception 'Ehhez a felhasználóhoz még nincs belépési fiók.'
      using hint = 'Akkor jön létre, amikor először belép a megadott jelszóval.';
  end if;
end;
$$;

comment on function public.set_staff_password(uuid, text) is
  'Új jelszó egy másik felhasználónak. A saját jelszó nem ezen az úton megy: '
  'ahhoz a mostanit is meg kell adni, azt a felület intézi.';

revoke all on function public.set_staff_password(uuid, text) from public;
grant execute on function public.set_staff_password(uuid, text) to authenticated;
