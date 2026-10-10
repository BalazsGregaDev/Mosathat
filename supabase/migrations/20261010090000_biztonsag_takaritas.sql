create or replace function public.day_absences(p_day date)
  returns table(id uuid, staff_id uuid, staff_name text, kind absence_kind, starts time, ends time, note text, szamit boolean)
  language sql stable security definer
  set search_path to 'public'
as $$
  select a.id, a.staff_id, s.full_name, a.kind, a.starts, a.ends, a.note,
         (s.role = 'STAFF' and s.active and not s.kozos)
    from public.staff_absences a
    join public.staff s on s.id = a.staff_id
   where a.day = p_day
     and public.is_staff()
   order by public.tavollet_tol(a), s.full_name;
$$;

create or replace function public.ugyfel_jog_ellenor()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if not public.can_edit_customers() then
    raise exception 'Ehhez nincs jogosultságod. (%)', tg_table_name
      using errcode = '42501',
            hint = 'Bérletet és szerződést az ügyfélszerkesztési joggal lehet módosítani.';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['passes', 'pass_items', 'contracts', 'contract_prices'] loop
    execute format('drop trigger if exists %1$s_jog on public.%1$s', t);
    execute format(
      'create trigger %1$s_jog before insert or update or delete on public.%1$s
         for each row execute function public.ugyfel_jog_ellenor()', t);
  end loop;
end $$;

alter function public.create_pass(jsonb) security definer set search_path = public;
alter function public.deactivate_pass(uuid) security definer set search_path = public;

drop function if exists public.my_absences(date);
drop function if exists public.sheet_honap_nev(date);
drop function if exists public.lookup_plate(text);

alter policy audit_log_insert on public.audit_log
  with check ((select public.is_staff()));
alter policy audit_log_select on public.audit_log
  using ((select public.is_staff()));
alter policy booking_items_staff_all on public.booking_items
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
alter policy booking_tasks_staff_all on public.booking_tasks
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
alter policy bookings_staff_all on public.bookings
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
alter policy break_windows_iras on public.break_windows
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy break_windows_olvas on public.break_windows
  using ((select public.is_staff()));
alter policy business_hours_iras on public.business_hours
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy business_hours_olvas on public.business_hours
  using ((select public.is_staff()));
alter policy companies_olvas on public.companies
  using ((select public.is_staff()));
alter policy company_sheet_rows_olvas on public.company_sheet_rows
  using ((select public.is_staff()));
alter policy company_sheet_settings_olvas on public.company_sheet_settings
  using ((select public.is_staff()));
alter policy company_sheets_olvas on public.company_sheets
  using ((select public.is_staff()));
alter policy contract_prices_iras on public.contract_prices
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy contract_prices_olvas on public.contract_prices
  using ((select public.is_staff()));
alter policy contracts_iras on public.contracts
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy contracts_olvas on public.contracts
  using ((select public.is_staff()));
alter policy customers_staff_all on public.customers
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
alter policy day_order_staff on public.day_order
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
alter policy day_overrides_iras on public.day_overrides
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy day_overrides_olvas on public.day_overrides
  using ((select public.is_staff()));
alter policy extras_iras on public.extras
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy extras_olvas on public.extras
  using ((select public.is_staff()));
alter policy full_service_pricing_iras on public.full_service_pricing
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy full_service_pricing_olvas on public.full_service_pricing
  using ((select public.is_staff()));
alter policy multiday_allocations_staff_all on public.multiday_allocations
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
alter policy package_items_iras on public.package_items
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy package_items_olvas on public.package_items
  using ((select public.is_staff()));
alter policy package_pricing_iras on public.package_pricing
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy package_pricing_olvas on public.package_pricing
  using ((select public.is_staff()));
alter policy packages_iras on public.packages
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy packages_olvas on public.packages
  using ((select public.is_staff()));
alter policy pass_items_iras on public.pass_items
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy pass_items_olvas on public.pass_items
  using ((select public.is_staff()));
alter policy pass_usages_staff on public.pass_usages
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
alter policy passes_iras on public.passes
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy passes_olvas on public.passes
  using ((select public.is_staff()));
alter policy shop_settings_iras on public.shop_settings
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy shop_settings_olvas on public.shop_settings
  using ((select public.is_staff()));
alter policy staff_insert_owner on public.staff
  with check (((((select public.my_role()))::text = 'TULAJDONOS'::text) AND (role = 'STAFF'::staff_role)));
alter policy staff_select on public.staff
  using ((select public.is_staff()));
alter policy staff_self on public.staff
  using ((id = (select auth.uid())))
  with check (((id = (select auth.uid())) AND (role = (select public.my_role())) AND active));
alter policy staff_update_owner on public.staff
  using (((((select public.my_role()))::text = 'TULAJDONOS'::text) AND (role = 'STAFF'::staff_role)))
  with check (((((select public.my_role()))::text = 'TULAJDONOS'::text) AND (role = 'STAFF'::staff_role)));
alter policy staff_write_super on public.staff
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));
alter policy staff_absences_olvas on public.staff_absences
  using ((select public.is_staff()));
alter policy staff_invites_olvas on public.staff_invites
  using ((select public.is_owner()));
alter policy staff_invites_owner on public.staff_invites
  with check (((((select public.my_role()))::text = 'TULAJDONOS'::text) AND (role = 'STAFF'::staff_role)));
alter policy staff_invites_super on public.staff_invites
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));
alter policy staff_vacations_olvas on public.staff_vacations
  using ((select public.is_staff()));
alter policy surcharges_iras on public.surcharges
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy surcharges_olvas on public.surcharges
  using ((select public.is_staff()));
alter policy vehicles_staff_all on public.vehicles
  using ((select public.is_staff()))
  with check ((select public.is_staff()));
alter policy working_hours_iras on public.working_hours
  using ((select public.is_owner()))
  with check ((select public.is_owner()));
alter policy working_hours_olvas on public.working_hours
  using ((select public.is_staff()));

create index if not exists bookings_package_id_idx on public.bookings (package_id);
create index if not exists bookings_moved_to_booking_id_idx on public.bookings (moved_to_booking_id);
create index if not exists day_order_booking_id_idx on public.day_order (booking_id);
create index if not exists staff_absences_staff_id_idx on public.staff_absences (staff_id);
create index if not exists staff_vacations_staff_id_idx on public.staff_vacations (staff_id);
create index if not exists contracts_customer_id_idx on public.contracts (customer_id);
create index if not exists contract_prices_package_id_idx on public.contract_prices (package_id);
create index if not exists pass_items_package_id_idx on public.pass_items (package_id);
create index if not exists packages_includes_package_id_idx on public.packages (includes_package_id);

do $$
declare
  r record;
  v_service boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  for r in
    select p.oid::regprocedure as fn,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth,
           v_service and has_function_privilege('service_role', p.oid, 'EXECUTE') as szerviz
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
  loop
    if r.auth then
      execute format('grant execute on function %s to authenticated', r.fn);
    end if;
    if r.szerviz then
      execute format('grant execute on function %s to service_role', r.fn);
    end if;
  end loop;
end $$;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges revoke execute on functions from public;

do $$
declare
  r record;
begin
  for r in
    select d.objoid, d.objsubid, c.relkind
      from pg_description d
      join pg_class c on c.oid = d.objoid
     where d.classoid = 'pg_class'::regclass
       and c.relnamespace = 'public'::regnamespace
  loop
    begin
      if r.objsubid > 0 then
        execute format('comment on column %s.%I is null', r.objoid::regclass,
          (select a.attname from pg_attribute a where a.attrelid = r.objoid and a.attnum = r.objsubid));
      elsif r.relkind = 'v' then
        execute format('comment on view %s is null', r.objoid::regclass);
      else
        execute format('comment on table %s is null', r.objoid::regclass);
      end if;
    exception when others then
      null;
    end;
  end loop;

  for r in
    select d.objoid
      from pg_description d
      join pg_proc p on p.oid = d.objoid
     where d.classoid = 'pg_proc'::regclass
       and p.pronamespace = 'public'::regnamespace
  loop
    begin
      execute format('comment on function %s is null', r.objoid::regprocedure);
    exception when others then
      null;
    end;
  end loop;
end $$;
