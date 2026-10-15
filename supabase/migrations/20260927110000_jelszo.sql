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

revoke all on function public.set_staff_password(uuid, text) from public;
grant execute on function public.set_staff_password(uuid, text) to authenticated;
