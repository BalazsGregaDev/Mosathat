create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.active
      and s.role::text in ('SUPERADMIN', 'TULAJDONOS')
  );
$$;

create or replace function public.my_role()
returns staff_role
language sql
stable
security definer
set search_path = public
as $$
  select s.role from public.staff s where s.id = auth.uid() and s.active;
$$;

grant execute on function public.is_owner() to authenticated;
grant execute on function public.my_role()  to authenticated;

update public.staff
   set full_name = 'Fejlesztő'
 where role = 'SUPERADMIN'
   and full_name in ('Grega Balázs', 'Gréga Balázs', 'Balázs');

create table if not exists public.staff_invites (
  email       text primary key,
  full_name   text        not null,
  role        staff_role  not null default 'STAFF',
  invited_by  uuid        references public.staff(id) on delete set null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

create or replace function public.staff_meghivo_bevaltas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.staff_invites%rowtype;
begin
  select * into v
    from public.staff_invites
   where email = lower(new.email) and used_at is null;

  if not found then
    return new;
  end if;

  insert into public.staff (id, full_name, role, active)
  values (new.id, v.full_name, v.role, true)
  on conflict (id) do update
    set full_name = excluded.full_name,
        role      = excluded.role,
        active    = true;

  update public.staff_invites set used_at = now() where email = v.email;
  return new;
end;
$$;

drop trigger if exists staff_meghivo on auth.users;
create trigger staff_meghivo
  after insert on auth.users
  for each row execute function public.staff_meghivo_bevaltas();

drop policy if exists staff_write on public.staff;

create policy staff_write_super on public.staff
  for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy staff_insert_owner on public.staff
  for insert to authenticated
  with check (public.my_role()::text = 'TULAJDONOS' and role = 'STAFF');

create policy staff_update_owner on public.staff
  for update to authenticated
  using (public.my_role()::text = 'TULAJDONOS' and role = 'STAFF')
  with check (public.my_role()::text = 'TULAJDONOS' and role = 'STAFF');

create policy staff_self on public.staff
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.my_role() and active);

alter table public.staff_invites enable row level security;

create policy staff_invites_olvas on public.staff_invites
  for select to authenticated using (public.is_owner());

create policy staff_invites_super on public.staff_invites
  for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

create policy staff_invites_owner on public.staff_invites
  for insert to authenticated
  with check (public.my_role()::text = 'TULAJDONOS' and role = 'STAFF');

do $$
declare
  t      text;
  vedett text[] := array[
    'packages', 'package_items', 'package_pricing', 'full_service_pricing',
    'extras', 'surcharges',
    'business_hours', 'working_hours', 'break_windows', 'shop_settings',
    'day_overrides',
    'passes', 'pass_items', 'contracts', 'contract_prices'
  ];
begin
  foreach t in array vedett loop
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);

    execute format($f$
      create policy %1$s_olvas on public.%1$s
        for select to authenticated using (public.is_staff());
      create policy %1$s_iras on public.%1$s
        for all to authenticated
        using (public.is_owner()) with check (public.is_owner());
    $f$, t);
  end loop;
end $$;

create or replace function public.csak_teljes_jogu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if not public.is_owner() then
    raise exception 'Ehhez nincs jogosultságod. (%)', tg_table_name
      using errcode = '42501',
            hint = 'Ezt a tulajdonos vagy a fejlesztő tudja módosítani.';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  t      text;
  vedett text[] := array[
    'packages', 'package_items', 'package_pricing', 'full_service_pricing',
    'extras', 'surcharges',
    'business_hours', 'working_hours', 'break_windows', 'shop_settings',
    'day_overrides',
    'passes', 'pass_items', 'contracts', 'contract_prices'
  ];
begin
  foreach t in array vedett loop
    execute format('drop trigger if exists %1$s_jog on public.%1$s', t);
    execute format($f$
      create trigger %1$s_jog
        before insert or update or delete on public.%1$s
        for each row execute function public.csak_teljes_jogu();
    $f$, t);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'dashboard_adat')
  then
    alter function public.dashboard_summary(date) rename to dashboard_adat;
  end if;
end $$;

create or replace function public.dashboard_summary(p_day date default current_date)
returns jsonb
language plpgsql
stable
as $$
begin
  if auth.uid() is not null and not public.is_owner() then
    raise exception 'Az áttekintéshez nincs jogosultságod.' using errcode = '42501';
  end if;
  return public.dashboard_adat(p_day);
end;
$$;

grant execute on function public.dashboard_adat(date)    to authenticated;
grant execute on function public.dashboard_summary(date) to authenticated;

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
         u.email,
         (u.last_sign_in_at is not null),
         false,
         s.created_at
    from public.staff s
    left join auth.users u on u.id = s.id

  union all

  select null::uuid, i.full_name, i.role, true,
         i.email, false, true, i.created_at
    from public.staff_invites i
   where i.used_at is null

  order by 7, 3, 2;
end;
$$;

grant execute on function public.list_staff() to authenticated;

create or replace function public.invite_staff(p jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p->>'email'));
  v_role  staff_role := coalesce(nullif(p->>'role','')::staff_role, 'STAFF');
  v_sajat staff_role := public.my_role();
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

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Ezzel az e-mail címmel már van fiók.';
  end if;

  insert into public.staff_invites (email, full_name, role, invited_by)
  values (v_email,
          coalesce(nullif(trim(p->>'full_name'),''), v_email),
          v_role,
          auth.uid())
  on conflict (email) do update
    set full_name  = excluded.full_name,
        role       = excluded.role,
        invited_by = excluded.invited_by,
        created_at = now(),
        used_at    = null;

  return v_email;
end;
$$;

create or replace function public.set_staff(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid := (p->>'id')::uuid;
  v_sajat   staff_role := public.my_role();
  v_cel     staff_role;
  v_uj_role staff_role := nullif(p->>'role','')::staff_role;
begin
  select role into v_cel from public.staff where id = v_id;
  if not found then
    raise exception 'Nincs ilyen felhasználó.';
  end if;

  if v_sajat is null or v_sajat = 'STAFF' then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;

  if v_id = auth.uid() and (p ? 'active' or v_uj_role is not null) then
    raise exception 'A saját hozzáférésedet nem tudod elvenni.';
  end if;

  if v_sajat::text = 'TULAJDONOS' then
    if v_cel <> 'STAFF' then
      raise exception 'A fejlesztői és tulajdonosi hozzáférést a fejlesztő kezeli.'
        using errcode = '42501';
    end if;
    if v_uj_role is not null and v_uj_role <> 'STAFF' then
      raise exception 'Tulajdonosként alkalmazotti szerepkört tudsz adni.'
        using errcode = '42501';
    end if;
  end if;

  update public.staff
     set full_name = coalesce(nullif(trim(p->>'full_name'),''), full_name),
         role      = coalesce(v_uj_role, role),
         active    = coalesce((p->>'active')::boolean, active),
         updated_at = now()
   where id = v_id;
end;
$$;

create or replace function public.delete_invite(p_email text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.my_role() is null or public.my_role() = 'STAFF' then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  delete from public.staff_invites
   where email = lower(p_email) and used_at is null;
end;
$$;

grant execute on function public.invite_staff(jsonb) to authenticated;
grant execute on function public.set_staff(jsonb)    to authenticated;
grant execute on function public.delete_invite(text) to authenticated;
