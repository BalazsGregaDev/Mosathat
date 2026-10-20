create or replace function public.csomag_hasznalt(p_package_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.bookings where package_id = p_package_id)
      or exists (select 1 from public.pass_items where package_id = p_package_id)
      or exists (select 1 from public.contract_prices where package_id = p_package_id);
$$;

revoke all on function public.csomag_hasznalt(uuid) from public, anon;
grant execute on function public.csomag_hasznalt(uuid) to authenticated;

create or replace function public.csomag_kod(p_nev text)
returns text
language plpgsql
stable
as $$
declare
  v_alap text;
  v_kod  text;
  v_i    integer := 1;
begin
  v_alap := upper(translate(coalesce(p_nev, ''), 'áéíóöőúüűÁÉÍÓÖŐÚÜŰ', 'aeiooouuuAEIOOOUUU'));
  v_alap := btrim(regexp_replace(v_alap, '[^A-Z0-9]+', '_', 'g'), '_');
  v_alap := left(coalesce(nullif(v_alap, ''), 'CSOMAG'), 24);
  v_kod := v_alap;
  while exists (select 1 from public.packages where code = v_kod) loop
    v_i := v_i + 1;
    v_kod := v_alap || '_' || v_i;
  end loop;
  return v_kod;
end;
$$;

create or replace function public.csomag_szerkeszto()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'csomagok', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description,
               'includes_package_id', p.includes_package_id,
               'hasznalt', public.csomag_hasznalt(p.id))
             order by p.sort_order, p.name)
        from public.packages p
       where p.active), '[]'::jsonb),
    'sorok', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'area', s.area, 'sort_order', s.sort_order,
               'cellak', coalesce((
                 select jsonb_object_agg(c.package_id, jsonb_build_object('name', c.name, 'active', c.active))
                   from public.package_slot_cells c
                   join public.packages p on p.id = c.package_id and p.active
                  where c.slot_id = s.id), '{}'::jsonb))
             order by s.area, s.sort_order, s.name)
        from public.package_slots s), '[]'::jsonb));
$$;

drop function if exists public.csomag_szerkeszto_mentes(jsonb);

create function public.csomag_szerkeszto_mentes(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cs        jsonb;
  v_sor       jsonb;
  v_cella     record;
  v_slot      uuid;
  v_csomag    uuid;
  v_alap      uuid;
  v_regi_nev  text;
  v_megtart   uuid[] := '{}';
  v_csomagok  uuid[] := '{}';
  v_nev       text;
  v_rend      integer := 0;
  v_terulet   service_area;
  v_b         record;
  v_db        integer := 0;
  v_torolt    integer := 0;
  v_kivezetve text[] := '{}';
  v_x         record;
begin
  if not public.is_owner() then
    raise exception 'Csak a tulajdonos vagy a fejlesztő szerkesztheti a csomagokat.'
      using errcode = '42501';
  end if;

  if jsonb_array_length(coalesce(p -> 'csomagok', '[]'::jsonb)) = 0 then
    raise exception 'Legalább egy csomagnak maradnia kell.';
  end if;

  for v_cs in select * from jsonb_array_elements(p -> 'csomagok') loop
    v_nev := btrim(coalesce(v_cs ->> 'name', ''));
    if v_nev = '' then
      raise exception 'A csomag neve nem lehet üres.';
    end if;
    v_csomag := (v_cs ->> 'id')::uuid;
    v_rend := v_rend + 1;

    if exists (select 1 from public.packages where id = v_csomag) then
      update public.packages
         set name = v_nev,
             description = nullif(btrim(coalesce(v_cs ->> 'description', '')), ''),
             sort_order = v_rend,
             active = true
       where id = v_csomag;
    else
      insert into public.packages (id, code, name, description, sort_order)
      values (v_csomag, public.csomag_kod(v_nev), v_nev,
              nullif(btrim(coalesce(v_cs ->> 'description', '')), ''), v_rend);

      insert into public.package_pricing (package_id, category, scope)
      select v_csomag, c, s
        from unnest(enum_range(null::vehicle_category)) c,
             unnest(enum_range(null::booking_scope)) s
      on conflict do nothing;

      insert into public.full_service_pricing (package_id, category)
      select v_csomag, c
        from unnest(enum_range(null::vehicle_category)) c
      on conflict do nothing;
    end if;
    v_csomagok := v_csomagok || v_csomag;
  end loop;

  for v_x in
    select pk.id, pk.name
      from public.packages pk
     where pk.active and not (pk.id = any (v_csomagok))
  loop
    update public.packages set includes_package_id = null where includes_package_id = v_x.id;
    if public.csomag_hasznalt(v_x.id) then
      update public.packages set active = false where id = v_x.id;
      v_kivezetve := v_kivezetve || v_x.name;
    else
      delete from public.packages where id = v_x.id;
      v_torolt := v_torolt + 1;
    end if;
  end loop;

  for v_cs in select * from jsonb_array_elements(p -> 'csomagok') loop
    v_csomag := (v_cs ->> 'id')::uuid;
    v_alap := nullif(v_cs ->> 'includes_package_id', '')::uuid;
    if v_alap = v_csomag or not (v_alap = any (v_csomagok)) then
      v_alap := null;
    end if;
    update public.packages set includes_package_id = v_alap where id = v_csomag;
  end loop;

  v_rend := 0;
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
      select pk_id as package_id,
             nullif(btrim(coalesce(v_sor -> 'cellak' -> pk_id::text ->> 'name', '')), '') as nev,
             coalesce((v_sor -> 'cellak' -> pk_id::text ->> 'active')::boolean, false) as aktiv
        from unnest(v_csomagok) pk_id
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
    select b.id
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

  return jsonb_build_object('frissitett', v_db, 'torolt', v_torolt, 'kivezetve', to_jsonb(v_kivezetve));
end;
$$;

revoke all on function public.csomag_szerkeszto_mentes(jsonb) from public, anon;
grant execute on function public.csomag_szerkeszto_mentes(jsonb) to authenticated;
