alter table public.bookings
  add column if not exists skip_note           text,
  add column if not exists skip_huf            integer,
  add column if not exists pre_finish_price_huf integer,
  add column if not exists finish_price_set    boolean not null default false;

drop function if exists public.set_booking_status(uuid, booking_status, text);

create or replace function public.set_booking_status(
  p_booking_id uuid,
  p_status     booking_status,
  p_note       text default null,
  p_pipal      boolean default true)
returns void
language plpgsql
volatile
as $$
declare
  v_old       booking_status;
  v_nem_fert  boolean;
  v_kesz      boolean := p_status in ('READY', 'COMPLETED');
  v_volt_kesz boolean;
  v_pipalt    uuid[];
  v_staff     uuid := (select s.id from public.staff s where s.id = auth.uid());
begin
  select status, not_fitted into v_old, v_nem_fert from public.bookings where id = p_booking_id;
  if v_old is null then
    raise exception 'Nincs ilyen foglalás: %', p_booking_id;
  end if;
  if v_old = p_status then return; end if;
  v_volt_kesz := v_old in ('READY', 'COMPLETED');

  if v_kesz and not v_volt_kesz then
    if p_pipal and not coalesce(v_nem_fert, false) then
      with pipa as (
        update public.booking_tasks t
           set done = true, done_at = now(), done_by = v_staff
         where t.booking_id = p_booking_id and not t.done
        returning t.id
      )
      select array_agg(id) into v_pipalt from pipa;
    end if;
    update public.bookings
       set pre_ready_status = v_old,
           auto_done_tasks  = coalesce(v_pipalt, '{}')
     where id = p_booking_id;
  end if;

  update public.bookings
     set status = p_status,
         arrived_at = case when p_status = 'ARRIVED' and arrived_at is null
                           then now() else arrived_at end,
         actual_started_at = case
           when p_status = 'IN_PROGRESS' and actual_started_at is null then now()
           when p_status in ('READY','COMPLETED') and actual_started_at is null
             then coalesce(arrived_at, now())
           else actual_started_at end,
         actual_finished_at = case when p_status in ('READY','COMPLETED')
                                    and actual_finished_at is null
                           then now() else actual_finished_at end,
         internal_notes = case when p_note is null then internal_notes
                           else coalesce(internal_notes || E'\n', '') || p_note end,
         updated_at = now()
   where id = p_booking_id;

  if v_volt_kesz and not v_kesz then
    update public.booking_tasks t
       set done = false, done_at = null, done_by = null
     where t.booking_id = p_booking_id
       and t.id = any (coalesce((select auto_done_tasks from public.bookings where id = p_booking_id), '{}'));
    update public.bookings
       set final_price_huf = case when finish_price_set then pre_finish_price_huf else final_price_huf end,
           pre_ready_status = null, auto_done_tasks = null,
           skip_note = null, skip_huf = null,
           pre_finish_price_huf = null, finish_price_set = false,
           actual_finished_at = null
     where id = p_booking_id;
  end if;

  insert into public.audit_log (staff_id, entity, entity_id, action, before, after)
  values (v_staff, 'bookings', p_booking_id, 'status_change',
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;

revoke all on function public.set_booking_status(uuid, booking_status, text, boolean) from public, anon;
grant execute on function public.set_booking_status(uuid, booking_status, text, boolean) to authenticated;

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
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Nincs ilyen foglalás.'; end if;
  v_alap := public.booking_patch_alap(p_booking_id);
  v_kat  := (v_alap->>'category')::vehicle_category;
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
                                 b.booking_type, b.service_date) t;
  select coalesce(sum(t.price_huf), 0)::integer into v_uj
    from public.foglalas_tetelek(b.package_id, v_kat, v_scope, v_full, v_extrak,
                                 0, (v_alap->>'surcharge_fix')::integer, v_ceg, b.contract_kind,
                                 b.booking_type, b.service_date) t
   where not (v_csomag_ki and t.kind = 'PACKAGE');

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

create or replace function public.booking_finish(p_booking_id uuid, p_done uuid[])
returns jsonb
language plpgsql
volatile
as $$
declare
  b       public.bookings%rowtype;
  v_elo   jsonb;
  v_staff uuid := (select s.id from public.staff s where s.id = auth.uid());
  v_pipalt uuid[];
  v_skip  integer;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Nincs ilyen foglalás.'; end if;
  if b.status in ('READY', 'COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW') then
    raise exception 'Ez a foglalás már kész, lezárt vagy törölt.';
  end if;

  v_elo  := public.booking_finish_preview(p_booking_id, coalesce(p_done, '{}'));
  v_skip := (v_elo->>'skip_huf')::integer;

  perform public.set_booking_status(p_booking_id, 'READY', null, false);

  with pipa as (
    update public.booking_tasks t
       set done = true, done_at = now(), done_by = v_staff
     where t.booking_id = p_booking_id and not t.done and t.id = any (coalesce(p_done, '{}'))
    returning t.id
  )
  select array_agg(id) into v_pipalt from pipa;

  update public.bookings
     set auto_done_tasks = coalesce(v_pipalt, '{}'),
         skip_note = v_elo->>'skip_note',
         skip_huf  = nullif(v_skip, 0),
         pre_finish_price_huf = final_price_huf,
         finish_price_set = v_skip > 0,
         final_price_huf = case when v_skip > 0
                                then greatest(coalesce(final_price_huf, estimated_price_huf) - v_skip, 0)
                                else final_price_huf end,
         updated_at = now()
   where id = p_booking_id;

  return v_elo;
end;
$$;

grant execute on function public.booking_finish_preview(uuid, uuid[]) to authenticated;
grant execute on function public.booking_finish(uuid, uuid[])         to authenticated;

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
  b.skip_huf
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.vehicles  v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id;
