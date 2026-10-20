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
