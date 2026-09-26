-- =============================================================================
--  20260926210000_list_staff_javitas.sql
--  „structure of query does not match function result type"
-- =============================================================================
--  A hiba: a Supabase auth.users táblájában az email oszlop típusa
--  character varying(255), nem text. A list_staff() viszont text-et ígért.
--  A PostgreSQL a RETURN QUERY-nél pontos típusegyezést vár, és a varchar ≠ text
--  különbség elég ahhoz, hogy az egész hívás elszálljon.
--
--  Miért csak élesben derült ki: a demó auth csonkjában az email text volt.
--  Ez a csonk azóta varchar(255)-re változott, hogy a következő ilyen eltérés
--  már a fejlesztésnél kibukjon, ne a működő rendszerben.
--
--  A javítás egyetlen ::text — de a tanulság a csonkban van, nem itt.
-- =============================================================================

create or replace function public.list_staff()
returns table (
  id            uuid,
  full_name     text,
  role          staff_role,
  active        boolean,
  email         text,
  belepett_mar  boolean,
  meghivo       boolean,      -- még nincs fiókja, csak meghívva
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.my_role() is null or public.my_role() = 'STAFF' then
    raise exception 'A felhasználók listájához nincs jogosultságod.'
      using errcode = '42501';
  end if;

  return query
  select s.id, s.full_name, s.role, s.active,
         u.email::text,
         -- Belépett-e már valaha. Egy felvett, de soha be nem lépett
         -- dolgozónál ez az első kérdés, amikor azt mondja, "nem enged be".
         (u.last_sign_in_at is not null),
         false,
         s.created_at
    from public.staff s
    left join auth.users u on u.id = s.id

  union all

  -- A meghívók, amikhez még nem tartozik fiók. Enélkül a lista hazudna arról,
  -- hány embert vettek fel: a tulaj felvette, de a dolgozó még nem regisztrált.
  select null::uuid, i.full_name, i.role, true,
         i.email::text, false, true, i.created_at
    from public.staff_invites i
   where i.used_at is null

  order by 7, 3, 2;   -- előbb a meglévők, szerepkör, majd név szerint
end;
$$;

grant execute on function public.list_staff() to authenticated;
