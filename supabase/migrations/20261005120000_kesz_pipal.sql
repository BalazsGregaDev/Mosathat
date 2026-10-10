alter table public.bookings
  add column if not exists pre_ready_status booking_status,
  add column if not exists auto_done_tasks  uuid[];

create or replace function public.set_booking_status(
  p_booking_id uuid,
  p_status     booking_status,
  p_note       text default null)
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
    if not coalesce(v_nem_fert, false) then
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
       set pre_ready_status = null, auto_done_tasks = null,
           actual_finished_at = null
     where id = p_booking_id;
  end if;

  insert into public.audit_log (staff_id, entity, entity_id, action, before, after)
  values (v_staff, 'bookings', p_booking_id, 'status_change',
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;

create or replace function public.booking_reopen(p_booking_id uuid)
returns booking_status
language plpgsql
volatile
as $$
declare
  b public.bookings%rowtype;
  v_cel booking_status;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Nincs ilyen foglalás.'; end if;
  if b.status not in ('READY', 'COMPLETED') then
    raise exception 'Csak kész vagy lezárt foglalás nyitható vissza.';
  end if;
  v_cel := coalesce(b.pre_ready_status, 'ARRIVED');
  if v_cel in ('READY', 'COMPLETED') then v_cel := 'ARRIVED'; end if;
  perform public.set_booking_status(p_booking_id, v_cel, 'Visszanyitva');
  return v_cel;
end;
$$;

grant execute on function public.set_booking_status(uuid, booking_status, text) to authenticated;
grant execute on function public.booking_reopen(uuid) to authenticated;
