alter table public.bookings
  add column if not exists pass_item_id uuid references public.pass_items(id) on delete set null;

create index if not exists bookings_pass_item_idx on public.bookings (pass_item_id) where pass_item_id is not null;

alter table public.pass_usages alter column booking_id drop not null;

alter table public.pass_usages
  add column if not exists day         date,
  add column if not exists plate       text check (char_length(plate) <= 20),
  add column if not exists name        text check (char_length(name) <= 120),
  add column if not exists note        text check (char_length(note) <= 300),
  add column if not exists signature   text,
  add column if not exists signed_at   timestamptz,
  add column if not exists kitoltve_at timestamptz,
  add column if not exists updated_at  timestamptz not null default now();

update public.pass_usages u
   set day = coalesce(
         (select coalesce(b.last_day, b.service_date) from public.bookings b where b.id = u.booking_id),
         (u.used_at at time zone 'Europe/Budapest')::date)
 where u.day is null;

alter table public.pass_usages alter column day set default public.budapest_ma();
alter table public.pass_usages alter column day set not null;

drop policy if exists pass_usages_staff on public.pass_usages;
drop policy if exists pass_usages_olvas on public.pass_usages;
create policy pass_usages_olvas on public.pass_usages
  for select to authenticated
  using ((select public.is_staff()));

drop function if exists public.use_pass(uuid, uuid);
drop function if exists public.release_pass(uuid);

create or replace function public.berlet_szabad(p_item uuid, p_booking uuid default null)
returns integer
language sql
stable
set search_path = public
as $$
  select i.qty_total
       - (select count(*)::integer from public.pass_usages u
           where u.pass_item_id = i.id
             and (p_booking is null or u.booking_id is distinct from p_booking))
       - (select count(*)::integer from public.bookings b
           where b.pass_item_id = i.id
             and (p_booking is null or b.id <> p_booking)
             and b.status in ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
             and not exists (select 1 from public.pass_usages u where u.booking_id = b.id))
    from public.pass_items i
   where i.id = p_item;
$$;

create or replace function public.berlet_fedezet(
  p_customer uuid, p_package uuid, p_category vehicle_category, p_scope booking_scope,
  p_date date, p_booking uuid default null)
returns uuid
language sql
stable
set search_path = public
as $$
  select i.id
    from public.passes p
    join public.pass_items i on i.pass_id = p.id
   where p_customer is not null
     and p_package is not null
     and coalesce(p_scope, 'TELJES') = 'TELJES'
     and p.customer_id = p_customer
     and p.active
     and coalesce(p_date, public.budapest_ma()) between p.valid_from and p.valid_until
     and (i.package_id is null or i.package_id = p_package)
     and (i.category is null or i.category = p_category)
     and public.berlet_szabad(i.id, p_booking) > 0
   order by (i.package_id is not null) desc, (i.category is not null) desc, p.valid_until, i.sort_order
   limit 1;
$$;

create or replace function public.berlet_alkalmaz(p_booking uuid)
returns void
language plpgsql
volatile
set search_path = public
as $$
declare
  b          public.bookings%rowtype;
  v_kat      vehicle_category;
  v_item     uuid;
  v_hasznalt uuid;
  v_alap     jsonb;
  v_ceg      uuid;
  v_csomag   record;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then return; end if;
  select v.category into v_kat from public.vehicles v where v.id = b.vehicle_id;

  select u.pass_item_id into v_hasznalt from public.pass_usages u where u.booking_id = p_booking;
  if v_hasznalt is not null and b.package_id is not null and b.scope = 'TELJES' and exists (
       select 1 from public.pass_items i join public.passes p on p.id = i.pass_id
        where i.id = v_hasznalt and p.customer_id = b.customer_id
          and (i.package_id is null or i.package_id = b.package_id)
          and (i.category is null or i.category = v_kat)) then
    v_item := v_hasznalt;
  elsif not coalesce(b.not_fitted, false)
        and (b.pass_item_id is not null or b.status in ('REQUESTED', 'CONFIRMED')) then
    v_item := public.berlet_fedezet(b.customer_id, b.package_id, v_kat, b.scope, b.service_date, p_booking);
  end if;

  if v_item is distinct from b.pass_item_id then
    update public.bookings set pass_item_id = v_item where id = p_booking;
  end if;

  if v_item is not null then
    update public.booking_items bi
       set unit_price_huf = 0,
           price_huf      = 0,
           name_snapshot  = case when bi.name_snapshot like '% (bérlet)' then bi.name_snapshot
                                 else bi.name_snapshot || ' (bérlet)' end
     where bi.booking_id = p_booking and bi.kind = 'PACKAGE';
  elsif exists (select 1 from public.booking_items bi
                 where bi.booking_id = p_booking and bi.kind = 'PACKAGE'
                   and bi.name_snapshot like '% (bérlet)') then
    v_alap := public.booking_patch_alap(p_booking);
    select c.company_id into v_ceg from public.customers c where c.id = b.customer_id;
    select t.name, t.unit_price_huf, t.price_huf into v_csomag
      from public.foglalas_tetelek(b.package_id, v_kat, b.scope, b.full_service, v_alap->'extras',
                                   0, 0, v_ceg, b.contract_kind, b.booking_type, b.service_date) t
     where t.kind = 'PACKAGE';
    update public.booking_items bi
       set name_snapshot  = coalesce(v_csomag.name, regexp_replace(bi.name_snapshot, ' \(bérlet\)$', '')),
           unit_price_huf = coalesce(v_csomag.unit_price_huf, 0),
           price_huf      = coalesce(v_csomag.price_huf, 0)
     where bi.booking_id = p_booking and bi.kind = 'PACKAGE';
  end if;

  update public.bookings
     set estimated_price_huf = (select coalesce(sum(bi.price_huf), 0)::integer
                                  from public.booking_items bi where bi.booking_id = p_booking)
   where id = p_booking;
end;
$$;

create or replace function public.berlet_hasznalat_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item uuid := new.pass_item_id;
begin
  if tg_op = 'UPDATE'
     and (old.status in ('REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW')
          or coalesce(old.not_fitted, false))
     and new.status not in ('REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW')
     and not coalesce(new.not_fitted, false) then
    perform public.berlet_alkalmaz(new.id);
    select b.pass_item_id into v_item from public.bookings b where b.id = new.id;
  end if;

  if v_item is null
     or new.status in ('REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW')
     or coalesce(new.not_fitted, false) then
    delete from public.pass_usages where booking_id = new.id;
    return null;
  end if;

  if tg_op = 'UPDATE'
     and old.status in ('READY', 'COMPLETED')
     and new.status in ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS') then
    delete from public.pass_usages where booking_id = new.id and kitoltve_at is null;
  end if;

  update public.pass_usages
     set pass_item_id = v_item, updated_at = now()
   where booking_id = new.id and pass_item_id is distinct from v_item;

  if new.status in ('READY', 'COMPLETED') then
    insert into public.pass_usages (pass_item_id, booking_id, used_by, day, plate, name)
    select v_item, new.id,
           (select s.id from public.staff s where s.id = auth.uid()),
           coalesce(new.last_day, new.service_date),
           nullif(btrim(v.plate_raw), '—'),
           nullif(btrim(c.name), 'Névtelen')
      from public.vehicles v, public.customers c
     where v.id = new.vehicle_id and c.id = new.customer_id
    on conflict (booking_id) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists bookings_berlet_trg on public.bookings;
create trigger bookings_berlet_trg
  after insert or update of status, not_fitted, pass_item_id on public.bookings
  for each row execute function public.berlet_hasznalat_trg();

create or replace function public.foglalas_tetelek_ir(
  p_booking_id uuid,
  p_package_id uuid,
  p_category   vehicle_category,
  p_scope      booking_scope,
  p_full       boolean,
  p_extras     jsonb,
  p_pct        numeric,
  p_fix        integer,
  p_company_id uuid,
  p_kind       contract_kind,
  p_type       booking_type,
  p_date       date)
returns integer
language plpgsql
volatile
as $$
declare
  v_osszeg integer;
begin
  delete from public.booking_items where booking_id = p_booking_id;

  insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                    quantity, unit_price_huf, price_huf, work_minutes, sort_order)
  select p_booking_id, t.kind, t.ref_id, t.name,
         t.quantity, t.unit_price_huf, t.price_huf, t.work_minutes, t.sort_order
    from public.foglalas_tetelek(p_package_id, p_category, p_scope, p_full, p_extras,
                                 p_pct, p_fix, p_company_id, p_kind, p_type, p_date) t;

  update public.booking_items bi
     set name_snapshot = public.full_service_nev(b.seat_material)
    from public.bookings b
   where b.id = p_booking_id
     and bi.booking_id = p_booking_id
     and bi.kind = 'FULL_SERVICE';

  update public.bookings
     set contract_kind = case when public.ceg_szerzodes_aktiv(p_company_id, p_date) is not null
                              then coalesce(p_kind, 'FLOTTA') end
   where id = p_booking_id;

  perform public.berlet_alkalmaz(p_booking_id);

  select estimated_price_huf into v_osszeg from public.bookings where id = p_booking_id;
  return v_osszeg;
end;
$$;

create or replace function public.quote_booking(p jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_category vehicle_category := coalesce(nullif(p->>'category','')::vehicle_category, 'SZEMELYAUTO');
  v_scope    booking_scope    := coalesce(nullif(p->>'scope','')::booking_scope, 'TELJES');
  v_package  uuid             := nullif(p->>'package_id','')::uuid;
  v_full     boolean          := coalesce((p->>'full_service')::boolean, false);
  v_extras   jsonb            := coalesce(p->'extras', '[]'::jsonb);
  v_pct      numeric          := coalesce((p->>'surcharge_pct')::numeric, 0);
  v_fix      integer          := coalesce((p->>'surcharge_fix')::integer, 0);
  v_type     booking_type     := coalesce(nullif(p->>'booking_type','')::booking_type, 'LEADOS');
  v_date     date             := coalesce(nullif(p->>'service_date','')::date, public.budapest_ma());
  v_kind     contract_kind    := nullif(p->>'contract_kind','')::contract_kind;
  v_foglalas uuid             := nullif(p->>'booking_id','')::uuid;
  v_ugyfel   uuid;
  v_ceg      uuid;
  v_szerz    uuid;
  v_calc     record;
  v_sorok    jsonb;
  v_ar       integer;
  v_szerz_sor boolean;
  v_csomagarak jsonb;
  v_berlet   uuid;
  v_berlet_adat jsonb;
  v_berlet_csomagok jsonb := '[]'::jsonb;
begin
  v_ceg := public.foglalas_cege(p);
  if v_ceg is not null then
    v_szerz := public.ceg_szerzodes_aktiv(v_ceg, v_date);
  end if;

  v_ugyfel := coalesce(
    nullif(p->>'customer_id','')::uuid,
    (select v.customer_id from public.vehicles v where v.id = nullif(p->>'vehicle_id','')::uuid));
  if exists (select 1 from public.bookings b
              where b.id = v_foglalas and b.pass_item_id is null
                and b.status not in ('REQUESTED', 'CONFIRMED')) then
    v_ugyfel := null;
  end if;
  if v_ugyfel is not null then
    v_berlet := public.berlet_fedezet(v_ugyfel, v_package, v_category, v_scope, v_date, v_foglalas);
    if v_scope = 'TELJES' then
      select coalesce(jsonb_agg(pk.id order by pk.sort_order), '[]'::jsonb) into v_berlet_csomagok
        from public.packages pk
       where pk.active
         and public.berlet_fedezet(v_ugyfel, pk.id, v_category, 'TELJES', v_date, v_foglalas) is not null;
    end if;
  end if;

  select * into v_calc
    from public.calc_service(v_package, v_category, v_scope, v_full, v_extras, v_pct, v_fix);

  select coalesce(jsonb_agg(
           case when t.kind = 'PACKAGE' and v_berlet is not null
                then to_jsonb(t) || jsonb_build_object('unit_price_huf', 0, 'price_huf', 0, 'name', t.name || ' (bérlet)')
                else to_jsonb(t) end
           order by t.sort_order), '[]'::jsonb),
         coalesce(sum(case when t.kind = 'PACKAGE' and v_berlet is not null then 0 else t.price_huf end), 0)::integer,
         coalesce(bool_or(t.kind = 'PACKAGE' and t.name like '%(szerződéses%'), false)
    into v_sorok, v_ar, v_szerz_sor
    from public.foglalas_tetelek(v_package, v_category, v_scope, v_full, v_extras, v_pct, v_fix,
                                 v_ceg, v_kind, v_type, v_date) t;

  if v_szerz is not null and v_scope = 'TELJES' and not v_full then
    select coalesce(jsonb_object_agg(cp.package_id, cp.price_huf), '{}'::jsonb)
      into v_csomagarak
      from public.contract_prices cp
     where cp.contract_id = v_szerz
       and cp.size = case when v_category = 'SZEMELYAUTO' then 'NORMAL' else 'NAGY' end::contract_size
       and cp.kind = coalesce(v_kind, 'FLOTTA');
  end if;

  if v_berlet is not null then
    select jsonb_build_object(
             'pass_item_id', i.id,
             'pass_id',      ps.id,
             'nev',          ps.name,
             'maradt',       greatest(public.berlet_szabad(i.id, v_foglalas) - 1, 0))
      into v_berlet_adat
      from public.pass_items i join public.passes ps on ps.id = i.pass_id
     where i.id = v_berlet;
  end if;

  return jsonb_build_object(
    'price_huf',       v_ar,
    'work_minutes',    v_calc.work_minutes,
    'rest_minutes',    v_calc.rest_minutes,
    'requires_quote',  v_calc.requires_quote,
    'duration_known',  v_calc.duration_known,
    'lines',           v_sorok,
    'company_id',      v_ceg,
    'contract_id',     v_szerz,
    'contract_kind',   case when v_szerz is not null then coalesce(v_kind, 'FLOTTA'::contract_kind) end,
    'contract_price',  v_szerz_sor,
    'contract_prices', coalesce(v_csomagarak, '{}'::jsonb),
    'berlet',          v_berlet_adat,
    'berlet_csomagok', v_berlet_csomagok
  );
end;
$$;

create or replace function public.booking_finish_preview(p_booking_id uuid, p_done uuid[])
returns jsonb
language plpgsql
stable
as $$
declare
  b        public.bookings%rowtype;
  v_alap   jsonb;
  v_ceg    uuid;
  v_kat    vehicle_category;
  v_kulso_ki boolean;
  v_belso_ki boolean;
  v_scope  booking_scope;
  v_csomag_ki boolean := false;
  v_full   boolean;
  v_extrak jsonb;
  v_base   integer;
  v_uj     integer;
  v_nevek  text[] := '{}';
  v_kimaradt_extrak text[];
  v_berlet boolean;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Nincs ilyen foglalás.'; end if;
  v_alap := public.booking_patch_alap(p_booking_id);
  v_kat  := (v_alap->>'category')::vehicle_category;
  v_berlet := b.pass_item_id is not null;
  select c.company_id into v_ceg from public.customers c where c.id = b.customer_id;

  select bool_and(not (t.done or t.id = any (p_done))) filter (where t.area = 'KULSO'),
         bool_and(not (t.done or t.id = any (p_done))) filter (where t.area = 'BELSO')
    into v_kulso_ki, v_belso_ki
    from public.booking_tasks t
   where t.booking_id = p_booking_id and t.source = 'PACKAGE';
  v_kulso_ki := coalesce(v_kulso_ki, false);
  v_belso_ki := coalesce(v_belso_ki, false);

  v_scope := b.scope;
  if b.scope = 'TELJES' then
    if v_kulso_ki and v_belso_ki then v_csomag_ki := true;
    elsif v_kulso_ki then v_scope := 'BELSO';
    elsif v_belso_ki then v_scope := 'KULSO';
    end if;
  elsif (b.scope = 'KULSO' and v_kulso_ki) or (b.scope = 'BELSO' and v_belso_ki) then
    v_csomag_ki := true;
  end if;
  if v_kulso_ki then v_nevek := array_append(v_nevek, 'Külső terület'); end if;
  if v_belso_ki then v_nevek := array_append(v_nevek, 'Belső terület'); end if;

  select array_agg(t.name order by t.sort_order) into v_kimaradt_extrak
    from public.booking_tasks t
   where t.booking_id = p_booking_id and t.source = 'EXTRA'
     and not (t.done or t.id = any (p_done));
  v_kimaradt_extrak := coalesce(v_kimaradt_extrak, '{}');
  v_nevek := v_nevek || v_kimaradt_extrak;

  v_full := b.full_service and not exists (
    select 1 from public.booking_items bi
     where bi.booking_id = p_booking_id and bi.kind = 'FULL_SERVICE'
       and bi.name_snapshot = any (v_kimaradt_extrak));

  select coalesce(jsonb_agg(jsonb_build_object('extra_id', bi.ref_id, 'quantity', bi.quantity)), '[]'::jsonb)
    into v_extrak
    from public.booking_items bi
   where bi.booking_id = p_booking_id and bi.kind = 'EXTRA' and bi.ref_id is not null
     and not (bi.name_snapshot = any (v_kimaradt_extrak));

  select coalesce(sum(t.price_huf), 0)::integer into v_base
    from public.foglalas_tetelek(b.package_id, v_kat, b.scope, b.full_service, v_alap->'extras',
                                 0, (v_alap->>'surcharge_fix')::integer, v_ceg, b.contract_kind,
                                 b.booking_type, b.service_date) t
   where not (v_berlet and t.kind = 'PACKAGE');
  select coalesce(sum(t.price_huf), 0)::integer into v_uj
    from public.foglalas_tetelek(b.package_id, v_kat, v_scope, v_full, v_extrak,
                                 0, (v_alap->>'surcharge_fix')::integer, v_ceg, b.contract_kind,
                                 b.booking_type, b.service_date) t
   where not (v_csomag_ki and t.kind = 'PACKAGE')
     and not (v_berlet and t.kind = 'PACKAGE');

  return jsonb_build_object(
    'base',          v_base,
    'adjusted',      v_uj,
    'skip_huf',      greatest(v_base - v_uj, 0),
    'skip_note',     nullif(array_to_string(v_nevek, ', '), ''),
    'skipped_areas', to_jsonb(array_remove(array[
                       case when v_kulso_ki then 'KULSO' end,
                       case when v_belso_ki then 'BELSO' end], null)),
    'skipped_items', to_jsonb(v_kimaradt_extrak));
end;
$$;

create or replace function public.create_pass(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_from  date := coalesce(nullif(p->>'valid_from','')::date, public.budapest_ma());
  v_until date;
  r       jsonb;
  v_sort  integer := 0;
  v_b     record;
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;

  v_until := coalesce(
    nullif(p->>'valid_until','')::date,
    public.berlet_lejarat(
      coalesce(nullif(p->>'validity_kind','')::validity_kind, 'EV'),
      coalesce(nullif(p->>'validity_value',''), '1'),
      v_from));

  insert into public.passes (customer_id, name, price_huf, valid_from, valid_until, notes, created_by)
  values (
    (p->>'customer_id')::uuid,
    coalesce(nullif(p->>'name',''), 'Bérlet'),
    coalesce((p->>'price_huf')::integer, 0),
    v_from, v_until,
    nullif(p->>'notes',''),
    (select s.id from public.staff s where s.id = auth.uid()))
  returning id into v_id;

  for r in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb))
  loop
    insert into public.pass_items (pass_id, package_id, category, qty_total, sort_order)
    values (
      v_id,
      nullif(r->>'package_id','')::uuid,
      nullif(r->>'category','')::vehicle_category,
      greatest(coalesce((r->>'qty_total')::integer, 1), 1),
      v_sort);
    v_sort := v_sort + 1;
  end loop;

  if v_sort = 0 then
    raise exception 'A bérletnek legalább egy tételt tartalmaznia kell.';
  end if;

  for v_b in
    select b.id
      from public.bookings b
     where b.customer_id = (p->>'customer_id')::uuid
       and b.status in ('REQUESTED', 'CONFIRMED')
       and b.pass_item_id is null
       and b.service_date between v_from and v_until
     order by b.service_date, b.created_at
  loop
    perform public.berlet_alkalmaz(v_b.id);
  end loop;

  return v_id;
end;
$$;

create or replace function public.deactivate_pass(p_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;

  update public.passes set active = false, updated_at = now() where id = p_pass_id;

  for r in
    select b.id
      from public.bookings b
      join public.pass_items i on i.id = b.pass_item_id
     where i.pass_id = p_pass_id
       and b.status in ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
       and not exists (select 1 from public.pass_usages u where u.booking_id = b.id)
     order by b.service_date, b.created_at
  loop
    perform public.berlet_alkalmaz(r.id);
  end loop;
end;
$$;

create or replace view public.v_day_bookings
with (security_invoker = on) as
select
  b.id,
  b.service_date,
  b.booking_type,
  b.status,
  b.source,
  b.start_at,
  b.drop_off_at,
  b.pick_up_at,
  b.deadline_at,
  b.arrived_at,
  b.scope,
  b.full_service,
  b.planned_duration_minutes,
  b.rest_minutes,
  b.estimated_price_huf,
  b.final_price_huf,
  b.notes,
  b.internal_notes,

  c.id           as customer_id,
  c.name         as customer_name,
  c.phone        as customer_phone,
  c.type         as customer_type,
  c.company_name,
  c.billing_kind,

  v.id           as vehicle_id,
  v.plate_raw,
  v.plate_country,
  v.brand,
  v.model,
  v.category,
  v.seats,

  p.id           as package_id,
  p.code         as package_code,
  p.name         as package_name,

  case when b.booking_type = 'HOZOMVISZEM' then (
    select ct.pickup_delivery_fee_huf
      from public.contracts ct
     where ct.company_id = c.company_id
       and ct.active
       and ct.pickup_delivery
       and (ct.valid_until is null or ct.valid_until >= b.service_date)
     limit 1
  ) end as pickup_fee_huf,

  (select count(*) from public.booking_tasks t where t.booking_id = b.id)              as tasks_total,
  (select count(*) from public.booking_tasks t where t.booking_id = b.id and t.done)   as tasks_done,

  (select min(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as first_done_at,
  (select max(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as last_done_at,

  b.last_day,
  b.contract_kind,
  c.company_id,
  (select string_agg(bi.name_snapshot, ', ' order by bi.sort_order)
     from public.booking_items bi
    where bi.booking_id = b.id and bi.kind = 'EXTRA')                                   as extras_summary,
  (select count(*)::integer from public.booking_items bi
    where bi.booking_id = b.id and bi.kind = 'EXTRA')                                   as extras_count,

  b.tentative,
  b.not_fitted,
  b.fleet_group,
  b.fleet_index,

  b.skip_note,
  b.skip_huf,

  b.ceg_link_company,

  b.felar_indok,
  b.price_adjustment_reason,
  b.nyelv,
  coalesce(nullif(btrim(b.request_email), ''), nullif(btrim(c.email), ''))             as ugyfel_email,
  b.pass_item_id
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.vehicles  v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id;

create or replace view public.v_pass_balance with (security_invoker=on) as
 SELECT p.id AS pass_id,
    p.customer_id,
    c.name AS customer_name,
    p.name AS pass_name,
    p.price_huf,
    p.valid_from,
    p.valid_until,
    p.active,
    p.valid_until < public.budapest_ma() AS lejart,
    p.valid_until - public.budapest_ma() AS napok_hatra,
    i.id AS pass_item_id,
    i.package_id,
    pk.code AS package_code,
    pk.name AS package_name,
    i.category,
    i.qty_total,
    COALESCE(u.felhasznalt, 0) AS qty_used,
    GREATEST(i.qty_total - COALESCE(u.felhasznalt, 0) - COALESCE(f.foglalt, 0), 0) AS qty_left,
    COALESCE(f.foglalt, 0) AS qty_reserved
   FROM passes p
     JOIN customers c ON c.id = p.customer_id
     JOIN pass_items i ON i.pass_id = p.id
     LEFT JOIN packages pk ON pk.id = i.package_id
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS felhasznalt
           FROM pass_usages x
          WHERE x.pass_item_id = i.id) u ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS foglalt
           FROM bookings b
          WHERE b.pass_item_id = i.id
            AND b.status IN ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
            AND NOT EXISTS (SELECT 1 FROM pass_usages x WHERE x.booking_id = b.id)) f ON true;

create or replace function public.berlet_sor_json(u public.pass_usages, p_sorszam integer)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id',           u.id,
    'booking_id',   u.booking_id,
    'pass_item_id', u.pass_item_id,
    'day',          u.day,
    'plate',        u.plate,
    'name',         u.name,
    'note',         u.note,
    'signature',    u.signature,
    'signed_at',    u.signed_at,
    'kitoltve_at',  u.kitoltve_at,
    'sorszam',      p_sorszam,
    'package_name', coalesce(pk.name, 'Bármelyik csomag'),
    'category',     i.category,
    'kezi',         u.booking_id is null)
    from public.pass_items i
    left join public.packages pk on pk.id = i.package_id
   where i.id = u.pass_item_id;
$$;

create or replace function public.berlet_lap(p_pass uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_ki jsonb;
begin
  if not public.is_staff() then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'pass', jsonb_build_object(
      'id', p.id, 'name', p.name, 'customer_id', p.customer_id, 'customer_name', c.name,
      'customer_phone', c.phone, 'price_huf', p.price_huf, 'valid_from', p.valid_from,
      'valid_until', p.valid_until, 'active', p.active,
      'lejart', p.valid_until < public.budapest_ma(), 'notes', p.notes),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'package_id', i.package_id,
               'package_name', coalesce(pk.name, 'Bármelyik csomag'),
               'category', i.category, 'qty_total', i.qty_total,
               'used', (select count(*)::integer from public.pass_usages u where u.pass_item_id = i.id),
               'left', greatest(public.berlet_szabad(i.id), 0))
             order by i.sort_order)
        from public.pass_items i
        left join public.packages pk on pk.id = i.package_id
       where i.pass_id = p.id), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(public.berlet_sor_json(s.u, s.n) order by s.n)
        from (select u, row_number() over (order by u.day, u.used_at)::integer n
                from public.pass_usages u
                join public.pass_items i on i.id = u.pass_item_id
               where i.pass_id = p.id) s), '[]'::jsonb),
    'reserved', coalesce((
      select jsonb_agg(jsonb_build_object(
               'booking_id', b.id, 'service_date', b.service_date,
               'plate', nullif(btrim(v.plate_raw), '—'),
               'package_name', coalesce(pk.name, 'Bármelyik csomag'))
             order by b.service_date, b.created_at)
        from public.bookings b
        join public.pass_items i on i.id = b.pass_item_id
        join public.vehicles v on v.id = b.vehicle_id
        left join public.packages pk on pk.id = i.package_id
       where i.pass_id = p.id
         and b.status in ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
         and not exists (select 1 from public.pass_usages u where u.booking_id = b.id)), '[]'::jsonb))
    into v_ki
    from public.passes p
    join public.customers c on c.id = p.customer_id
   where p.id = p_pass;
  if v_ki is null then
    raise exception 'Nincs ilyen bérlet.';
  end if;
  return v_ki;
end;
$$;

create or replace function public.berlet_lapok()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.elo desc, x.vege desc, x.nev)
      from (
        select p.active and p.valid_until >= public.budapest_ma() as elo,
               p.valid_until as vege, c.name as nev,
               jsonb_build_object(
                 'id', p.id, 'name', p.name, 'customer_name', c.name,
                 'valid_from', p.valid_from, 'valid_until', p.valid_until,
                 'active', p.active, 'lejart', p.valid_until < public.budapest_ma(),
                 'total', (select coalesce(sum(i.qty_total), 0)::integer from public.pass_items i where i.pass_id = p.id),
                 'used', (select count(*)::integer from public.pass_usages u
                            join public.pass_items i on i.id = u.pass_item_id where i.pass_id = p.id),
                 'unsigned', (select count(*)::integer from public.pass_usages u
                                join public.pass_items i on i.id = u.pass_item_id
                               where i.pass_id = p.id and u.signature is null),
                 'reserved', (select count(*)::integer from public.bookings b
                                join public.pass_items i on i.id = b.pass_item_id
                               where i.pass_id = p.id
                                 and b.status in ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS')
                                 and not exists (select 1 from public.pass_usages u where u.booking_id = b.id))) as j
          from public.passes p
          join public.customers c on c.id = p.customer_id
      ) x), '[]'::jsonb);
end;
$$;

create or replace function public.berlet_lap_foglalashoz(p_booking uuid)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  b      public.bookings%rowtype;
  v_u    public.pass_usages%rowtype;
  v_pass record;
  v_n    integer;
begin
  if not public.is_staff() then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_booking;
  if not found then
    raise exception 'Nincs ilyen foglalás.';
  end if;
  select * into v_u from public.pass_usages where booking_id = p_booking;
  if b.pass_item_id is null and v_u.id is null then
    return jsonb_build_object('pass_id', null);
  end if;

  select p.id, p.name, c.name as customer_name,
         (select coalesce(sum(i2.qty_total), 0)::integer from public.pass_items i2 where i2.pass_id = p.id) as total
    into v_pass
    from public.pass_items i
    join public.passes p on p.id = i.pass_id
    join public.customers c on c.id = p.customer_id
   where i.id = coalesce(v_u.pass_item_id, b.pass_item_id);

  if v_u.id is not null then
    select s.n into v_n
      from (select u.id, row_number() over (order by u.day, u.used_at)::integer n
              from public.pass_usages u join public.pass_items i on i.id = u.pass_item_id
             where i.pass_id = v_pass.id) s
     where s.id = v_u.id;
  else
    select count(*)::integer + 1 into v_n
      from public.pass_usages u join public.pass_items i on i.id = u.pass_item_id
     where i.pass_id = v_pass.id;
    v_u.pass_item_id := b.pass_item_id;
    v_u.booking_id := b.id;
    v_u.day := coalesce(b.last_day, b.service_date);
    select nullif(btrim(v.plate_raw), '—') into v_u.plate from public.vehicles v where v.id = b.vehicle_id;
    select nullif(btrim(c.name), 'Névtelen') into v_u.name from public.customers c where c.id = b.customer_id;
  end if;

  return jsonb_build_object(
    'pass_id',       v_pass.id,
    'pass_name',     v_pass.name,
    'customer_name', v_pass.customer_name,
    'total',         v_pass.total,
    'row',           public.berlet_sor_json(v_u, v_n));
end;
$$;

create or replace function public.berlet_sor_mentes(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid := nullif(p->>'id', '')::uuid;
  v_booking uuid := nullif(p->>'booking_id', '')::uuid;
  v_item    uuid := nullif(p->>'pass_item_id', '')::uuid;
  v_nap     date := nullif(p->>'day', '')::date;
  v_alairas text := nullif(p->>'signature', '');
  v_b       public.bookings%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  if v_nap is null then
    raise exception 'Add meg a dátumot.';
  end if;
  if v_alairas is not null and length(v_alairas) > 400000 then
    raise exception 'Az aláírás képe túl nagy.';
  end if;

  if v_id is null and v_booking is not null then
    select u.id into v_id from public.pass_usages u where u.booking_id = v_booking;
  end if;

  if v_id is null and v_booking is not null then
    select * into v_b from public.bookings where id = v_booking;
    if not found then
      raise exception 'Nincs ilyen foglalás.';
    end if;
    if v_b.pass_item_id is null then
      raise exception 'Ehhez a foglaláshoz nem tartozik bérlet.';
    end if;
    if v_b.status in ('REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW') or v_b.not_fitted then
      raise exception 'Lemondott vagy be nem fért foglalás nem kerülhet a bérlet lapjára.';
    end if;
    insert into public.pass_usages (pass_item_id, booking_id, used_by, day, plate, name, note,
                                    signature, signed_at, kitoltve_at)
    values (v_b.pass_item_id, v_booking, (select s.id from public.staff s where s.id = auth.uid()), v_nap,
            nullif(btrim(p->>'plate'), ''), nullif(btrim(p->>'name'), ''), nullif(btrim(p->>'note'), ''),
            v_alairas, case when v_alairas is not null then now() end, now())
    returning id into v_id;
    return v_id;
  end if;

  if v_id is null then
    if not public.can_edit_customers() then
      raise exception 'Korábbi alkalmat a tulajdonos vehet fel kézzel.' using errcode = '42501';
    end if;
    if v_item is null then
      raise exception 'Válaszd ki, melyik tételből vonjuk le az alkalmat.';
    end if;
    if not exists (select 1 from public.pass_items i where i.id = v_item) then
      raise exception 'Nincs ilyen bérlettétel.';
    end if;
    if coalesce(public.berlet_szabad(v_item), 0) <= 0 then
      raise exception 'Ezen a tételen nincs több felhasználható alkalom.';
    end if;
    insert into public.pass_usages (pass_item_id, booking_id, used_by, day, plate, name, note,
                                    signature, signed_at, kitoltve_at)
    values (v_item, null, (select s.id from public.staff s where s.id = auth.uid()), v_nap,
            nullif(btrim(p->>'plate'), ''), nullif(btrim(p->>'name'), ''), nullif(btrim(p->>'note'), ''),
            v_alairas, case when v_alairas is not null then now() end, now())
    returning id into v_id;
    return v_id;
  end if;

  if not exists (select 1 from public.pass_usages where id = v_id) then
    raise exception 'Nincs ilyen sor.';
  end if;
  update public.pass_usages
     set day         = v_nap,
         plate       = nullif(btrim(p->>'plate'), ''),
         name        = nullif(btrim(p->>'name'), ''),
         note        = case when p ? 'note' then nullif(btrim(p->>'note'), '') else note end,
         signature   = case when p ? 'signature' then v_alairas else signature end,
         signed_at   = case when p ? 'signature'
                            then case when v_alairas is null then null else now() end
                            else signed_at end,
         kitoltve_at = now(),
         updated_at  = now()
   where id = v_id;
  return v_id;
end;
$$;

create or replace function public.berlet_sor_torles(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_booking uuid;
begin
  if not public.can_edit_customers() then
    raise exception 'Korábbi alkalmat a tulajdonos törölhet.' using errcode = '42501';
  end if;
  select u.booking_id into v_booking from public.pass_usages u where u.id = p_id;
  if not found then
    raise exception 'Nincs ilyen sor.';
  end if;
  if v_booking is not null then
    raise exception 'Foglaláshoz tartozó sor nem törölhető: ha az időpont elmarad, a lemondással magától lekerül.';
  end if;
  delete from public.pass_usages where id = p_id;
end;
$$;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['pass_usages'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime'
                      and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

revoke all on function public.berlet_szabad(uuid, uuid) from public, anon;
revoke all on function public.berlet_fedezet(uuid, uuid, vehicle_category, booking_scope, date, uuid) from public, anon;
revoke all on function public.berlet_alkalmaz(uuid) from public, anon;
revoke all on function public.berlet_hasznalat_trg() from public, anon, authenticated;
revoke all on function public.berlet_sor_json(public.pass_usages, integer) from public, anon;
revoke all on function public.berlet_lap(uuid) from public, anon;
revoke all on function public.berlet_lapok() from public, anon;
revoke all on function public.berlet_lap_foglalashoz(uuid) from public, anon;
revoke all on function public.berlet_sor_mentes(jsonb) from public, anon;
revoke all on function public.berlet_sor_torles(uuid) from public, anon;
revoke all on function public.foglalas_tetelek_ir(uuid, uuid, vehicle_category, booking_scope, boolean, jsonb, numeric, integer, uuid, contract_kind, booking_type, date) from public, anon;
revoke all on function public.quote_booking(jsonb) from public, anon;
revoke all on function public.booking_finish_preview(uuid, uuid[]) from public, anon;
revoke all on function public.create_pass(jsonb) from public, anon;
revoke all on function public.deactivate_pass(uuid) from public, anon;

grant execute on function public.berlet_szabad(uuid, uuid) to authenticated;
grant execute on function public.berlet_fedezet(uuid, uuid, vehicle_category, booking_scope, date, uuid) to authenticated;
grant execute on function public.berlet_alkalmaz(uuid) to authenticated;
grant execute on function public.berlet_sor_json(public.pass_usages, integer) to authenticated;
grant execute on function public.berlet_lap(uuid) to authenticated;
grant execute on function public.berlet_lapok() to authenticated;
grant execute on function public.berlet_lap_foglalashoz(uuid) to authenticated;
grant execute on function public.berlet_sor_mentes(jsonb) to authenticated;
grant execute on function public.berlet_sor_torles(uuid) to authenticated;
grant execute on function public.foglalas_tetelek_ir(uuid, uuid, vehicle_category, booking_scope, boolean, jsonb, numeric, integer, uuid, contract_kind, booking_type, date) to authenticated;
grant execute on function public.quote_booking(jsonb) to authenticated;
grant execute on function public.booking_finish_preview(uuid, uuid[]) to authenticated;
grant execute on function public.create_pass(jsonb) to authenticated;
grant execute on function public.deactivate_pass(uuid) to authenticated;
