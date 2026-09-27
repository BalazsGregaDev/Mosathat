-- =============================================================================
--  20260926220000_meghivo_osszekapcsolas.sql
--  „Ezzel az e-mail címmel már van fiók" — zsákutca volt
-- =============================================================================
--  Eddig ha egy e-mail címhez MÁR létezett Supabase-fiók, a meghívó felvétele
--  hibával elszállt. Ez a gyakorlatban zsákutca:
--
--    – a fiókot a Supabase felületén hozták létre kézzel (dolgozó sor nélkül),
--    – vagy egy korábbi próbálkozás felét sikerült csak befejezni.
--
--  Mindkét esetben van egy fiók, ami nem tud belépni az alkalmazásba, és nincs
--  mód arra, hogy hozzáférést kapjon: a meghívó nem vehető fel, a trigger
--  pedig csak ÚJ regisztrációnál fut le.
--
--  Mostantól ilyenkor a meghívó nem hiba, hanem összekapcsolás: a meglévő
--  fiók megkapja azt a szerepkört, amit a tulaj éppen most adott meg.
--
--  Miért nem veszélyes: a hozzáférést az adja, hogy egy teljes jogú felhasználó
--  beírta a nevet, az e-mailt és a szerepkört, és megnyomta a gombot. Ez maga a
--  felhatalmazás. A visszajelzés viszont más — a felület kiírja, hogy itt nem új
--  fiók készült, hanem egy meglévő kapott hozzáférést. Aki ezt nem várta, az
--  ebből tudja meg.
--
--  Aktív dolgozói sorhoz továbbra sem lehet meghívót felvenni: az már bent van.
-- =============================================================================

-- A régi változat szöveget adott vissza, az új jsonb-t. A CREATE OR REPLACE
-- nem tud visszatérési típust váltani, ezért előbb el kell dobni.
drop function if exists public.invite_staff(jsonb);

create or replace function public.invite_staff(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p->>'email'));
  v_nev   text := coalesce(nullif(trim(p->>'full_name'),''), lower(trim(p->>'email')));
  v_role  staff_role := coalesce(nullif(p->>'role','')::staff_role, 'STAFF');
  v_sajat staff_role := public.my_role();
  v_uid   uuid;
  v_van   boolean;
begin
  if v_sajat is null or v_sajat = 'STAFF' then
    raise exception 'Felhasználót csak a tulajdonos vagy a fejlesztő vehet fel.'
      using errcode = '42501';
  end if;

  -- A tulaj alkalmazottat vehet fel. Másik tulajt és fejlesztőt nem: az a
  -- fejlesztő dolga, mert az a rendszer gazdáját érinti, nem a napi munkát.
  if v_sajat::text = 'TULAJDONOS' and v_role <> 'STAFF' then
    raise exception 'Tulajdonosként alkalmazottat tudsz felvenni.'
      using errcode = '42501';
  end if;

  if v_email is null or v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Érvényes e-mail cím kell, ezzel fog belépni.';
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = v_email;

  if v_uid is not null then
    select exists (select 1 from public.staff s where s.id = v_uid and s.active)
      into v_van;

    if v_van then
      raise exception 'Ez a felhasználó már be van állítva a rendszerben.'
        using hint = 'A szerepkörét a listában tudod átállítani.';
    end if;

    -- Van fiók, de nincs (vagy inaktív) a dolgozói sora: most kapja meg.
    insert into public.staff (id, full_name, role, active)
    values (v_uid, v_nev, v_role, true)
    on conflict (id) do update
      set full_name = excluded.full_name,
          role      = excluded.role,
          active    = true;

    delete from public.staff_invites where email = v_email;

    return jsonb_build_object(
      'email', v_email,
      'mod',   'osszekapcsolva',
      'uzenet', 'Ehhez a címhez már tartozott fiók — most kapott hozzáférést. '
             || 'A jelszava a régi marad, az itt megadott kezdő jelszó nem érvényes rá.');
  end if;

  insert into public.staff_invites (email, full_name, role, invited_by)
  values (v_email, v_nev, v_role, auth.uid())
  on conflict (email) do update
    set full_name  = excluded.full_name,
        role       = excluded.role,
        invited_by = excluded.invited_by,
        created_at = now(),
        used_at    = null;

  return jsonb_build_object('email', v_email, 'mod', 'meghivo');
end;
$$;

grant execute on function public.invite_staff(jsonb) to authenticated;
