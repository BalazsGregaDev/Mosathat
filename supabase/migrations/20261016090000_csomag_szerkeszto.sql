create table if not exists public.package_slots (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  area       service_area not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.package_slot_cells (
  slot_id    uuid not null references public.package_slots(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete cascade,
  name       text not null check (btrim(name) <> ''),
  active     boolean not null default true,
  primary key (slot_id, package_id)
);

create index if not exists package_slot_cells_package_idx on public.package_slot_cells (package_id);

do $$
begin
  if not exists (select 1 from public.package_slots) then
    insert into public.package_slots (id, name, area, sort_order)
    select distinct on (s.slot_id) s.slot_id, s.slot_name, s.area, s.sort_order
      from public.packages p
      join lateral public.resolve_package_slots(p.id) s on true
     order by s.slot_id;

    insert into public.package_slot_cells (slot_id, package_id, name, active)
    select ps.id, p.id, coalesce(r.name, ps.name), r.name is not null
      from public.package_slots ps
     cross join public.packages p
      left join lateral (
        select s.name from public.resolve_package_slots(p.id) s where s.slot_id = ps.id limit 1
      ) r on true;
  end if;
end $$;

update public.packages
   set description = null
 where (code = 'PREMIUM' and description = 'A Start mindene, plusz viaszolás, gumiápolás és belső ápolás.')
    or (code = 'ELIT' and description = 'A Premium mindene, hosszantartó vaxszal, falc mélytisztítással és alja kárpit mélytisztítással.');

create or replace function public.resolve_package_slots(p_package_id uuid)
returns table (
  slot_id    uuid,
  slot_name  text,
  item_id    uuid,
  name       text,
  area       service_area,
  sort_order integer)
language sql
stable
as $$
  select s.id, s.name, s.id, c.name, s.area, s.sort_order
    from public.package_slots s
    join public.package_slot_cells c on c.slot_id = s.id
   where c.package_id = p_package_id
     and c.active
   order by s.area, s.sort_order;
$$;

alter table public.package_slots enable row level security;
alter table public.package_slot_cells enable row level security;

drop policy if exists package_slots_olvas on public.package_slots;
drop policy if exists package_slots_iras on public.package_slots;
drop policy if exists package_slot_cells_olvas on public.package_slot_cells;
drop policy if exists package_slot_cells_iras on public.package_slot_cells;

create policy package_slots_olvas on public.package_slots
  for select to authenticated using ((select public.is_staff()));
create policy package_slots_iras on public.package_slots
  for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy package_slot_cells_olvas on public.package_slot_cells
  for select to authenticated using ((select public.is_staff()));
create policy package_slot_cells_iras on public.package_slot_cells
  for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop trigger if exists package_slots_jog on public.package_slots;
create trigger package_slots_jog
  before insert or update or delete on public.package_slots
  for each row execute function public.csak_teljes_jogu();
drop trigger if exists package_slot_cells_jog on public.package_slot_cells;
create trigger package_slot_cells_jog
  before insert or update or delete on public.package_slot_cells
  for each row execute function public.csak_teljes_jogu();

grant select, insert, update, delete on public.package_slots to authenticated;
grant select, insert, update, delete on public.package_slot_cells to authenticated;

create or replace function public.csomag_szerkeszto()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'csomagok', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description)
             order by p.sort_order)
        from public.packages p
       where p.active), '[]'::jsonb),
    'sorok', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'area', s.area, 'sort_order', s.sort_order,
               'cellak', coalesce((
                 select jsonb_object_agg(c.package_id, jsonb_build_object('name', c.name, 'active', c.active))
                   from public.package_slot_cells c
                  where c.slot_id = s.id), '{}'::jsonb))
             order by s.area, s.sort_order, s.name)
        from public.package_slots s), '[]'::jsonb));
$$;

grant execute on function public.csomag_szerkeszto() to authenticated;

create or replace function public.csomag_szerkeszto_mentes(p jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cs       jsonb;
  v_sor      jsonb;
  v_cella    record;
  v_slot     uuid;
  v_regi_nev text;
  v_megtart  uuid[] := '{}';
  v_nev      text;
  v_rend     integer := 0;
  v_terulet  service_area;
  v_b        record;
  v_db       integer := 0;
begin
  if not public.is_owner() then
    raise exception 'Csak a tulajdonos vagy a fejlesztő szerkesztheti a csomagokat.'
      using errcode = '42501';
  end if;

  for v_cs in select * from jsonb_array_elements(coalesce(p -> 'csomagok', '[]'::jsonb)) loop
    v_nev := btrim(coalesce(v_cs ->> 'name', ''));
    if v_nev = '' then
      raise exception 'A csomag neve nem lehet üres.';
    end if;
    update public.packages
       set name = v_nev,
           description = nullif(btrim(coalesce(v_cs ->> 'description', '')), '')
     where id = (v_cs ->> 'id')::uuid;
  end loop;

  for v_sor in select * from jsonb_array_elements(coalesce(p -> 'sorok', '[]'::jsonb)) loop
    v_nev := btrim(coalesce(v_sor ->> 'name', ''));
    if v_nev = '' then
      raise exception 'A sor neve nem lehet üres.';
    end if;
    v_terulet := (v_sor ->> 'area')::service_area;
    v_rend := v_rend + 10;
    v_slot := nullif(v_sor ->> 'id', '')::uuid;
    v_regi_nev := (select ps.name from public.package_slots ps where ps.id = v_slot);

    if v_regi_nev is not null then
      update public.package_slots
         set name = v_nev, area = v_terulet, sort_order = v_rend
       where id = v_slot;
    else
      insert into public.package_slots (name, area, sort_order)
      values (v_nev, v_terulet, v_rend)
      returning id into v_slot;
    end if;
    v_megtart := v_megtart || v_slot;

    for v_cella in
      select pk.id as package_id,
             nullif(btrim(coalesce(v_sor -> 'cellak' -> pk.id::text ->> 'name', '')), '') as nev,
             coalesce((v_sor -> 'cellak' -> pk.id::text ->> 'active')::boolean, false) as aktiv
        from public.packages pk
    loop
      insert into public.package_slot_cells (slot_id, package_id, name, active)
      values (v_slot, v_cella.package_id,
              case when v_cella.nev is null or v_cella.nev = v_regi_nev then v_nev else v_cella.nev end,
              v_cella.aktiv)
      on conflict (slot_id, package_id)
      do update set name = excluded.name, active = excluded.active;
    end loop;
  end loop;

  delete from public.package_slots where not (id = any (v_megtart));

  for v_b in
    select b.id, b.scope
      from public.bookings b
     where b.package_id is not null
       and b.status in ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'READY')
  loop
    perform public.rebuild_booking_tasks(v_b.id);
    update public.booking_tasks t
       set sort_order = k.sort_order
      from public.booking_task_plan(v_b.id) k
     where t.booking_id = v_b.id
       and t.source = 'PACKAGE'
       and t.name = k.name
       and t.sort_order is distinct from k.sort_order;
    v_db := v_db + 1;
  end loop;

  update public.booking_items bi
     set name_snapshot = pk.name || case when b.scope = 'TELJES' then '' else ' — ' || b.scope::text end
    from public.bookings b, public.packages pk
   where bi.booking_id = b.id
     and bi.kind = 'PACKAGE'
     and pk.id = bi.ref_id
     and b.status in ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'READY')
     and bi.name_snapshot is distinct from
         pk.name || case when b.scope = 'TELJES' then '' else ' — ' || b.scope::text end;

  return v_db;
end;
$$;

revoke all on function public.csomag_szerkeszto_mentes(jsonb) from public, anon;
grant execute on function public.csomag_szerkeszto_mentes(jsonb) to authenticated;
