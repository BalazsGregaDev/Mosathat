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

  return format('Kész. %s (%s) jelszava beállítva.%s',
    coalesce(v_nev, v_email),
    coalesce(v_role::text, 'nincs hozzá dolgozói sor'),
    case when v_aktiv is false
         then ' FIGYELEM: ez a hozzáférés ki van kapcsolva, így belépni sem fog. '
              || 'Kapcsold vissza a Felhasználók képernyőn.'
         else '' end);
end;
$$;

revoke all on function public.jelszo_visszaallitas(text, text) from public;
revoke all on function public.jelszo_visszaallitas(text, text) from anon;
revoke all on function public.jelszo_visszaallitas(text, text) from authenticated;
