create or replace function public.list_staff()
returns table (
  id            uuid,
  full_name     text,
  role          staff_role,
  active        boolean,
  email         text,
  belepett_mar  boolean,
  meghivo       boolean,
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
         (u.last_sign_in_at is not null),
         false,
         s.created_at
    from public.staff s
    left join auth.users u on u.id = s.id

  union all

  select null::uuid, i.full_name, i.role, true,
         i.email::text, false, true, i.created_at
    from public.staff_invites i
   where i.used_at is null

  order by 7, 3, 2;
end;
$$;

grant execute on function public.list_staff() to authenticated;
