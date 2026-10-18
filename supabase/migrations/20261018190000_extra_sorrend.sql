create or replace function public.csomag_szerkeszto_mentes(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cs        jsonb;
  v_sor       jsonb;
  v_ex        jsonb;
  v_cella     record;
  v_slot      uuid;
  v_csomag    uuid;
  v_alap      uuid;
  v_regi_nev  text;
  v_megtart   uuid[] := '{}';
  v_csomagok  uuid[] := '{}';
  v_nev       text;
  v_nev_en    text;
  v_rend      integer := 0;
  v_terulet   service_area;
  v_b         record;
  v_db        integer := 0;
  v_torolt    integer := 0;
  v_kivezetve text[] := '{}';
  v_x         record;
  v_extra_rend bigint;
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
             name_en = nullif(btrim(coalesce(v_cs ->> 'name_en', '')), ''),
             description_en = nullif(btrim(coalesce(v_cs ->> 'description_en', '')), ''),
             sort_order = v_rend,
             active = true
       where id = v_csomag;
    else
      insert into public.packages (id, code, name, description, name_en, description_en, sort_order)
      values (v_csomag, public.csomag_kod(v_nev), v_nev,
              nullif(btrim(coalesce(v_cs ->> 'description', '')), ''),
              nullif(btrim(coalesce(v_cs ->> 'name_en', '')), ''),
              nullif(btrim(coalesce(v_cs ->> 'description_en', '')), ''), v_rend);

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
    v_nev_en := nullif(btrim(coalesce(v_sor ->> 'name_en', '')), '');
    v_terulet := (v_sor ->> 'area')::service_area;
    v_rend := v_rend + 10;
    v_slot := nullif(v_sor ->> 'id', '')::uuid;
    v_regi_nev := (select ps.name from public.package_slots ps where ps.id = v_slot);

    if v_regi_nev is not null then
      update public.package_slots
         set name = v_nev, name_en = v_nev_en, area = v_terulet, sort_order = v_rend
       where id = v_slot;
    else
      insert into public.package_slots (name, name_en, area, sort_order)
      values (v_nev, v_nev_en, v_terulet, v_rend)
      returning id into v_slot;
    end if;
    v_megtart := v_megtart || v_slot;

    for v_cella in
      select pk_id as package_id,
             nullif(btrim(coalesce(v_sor -> 'cellak' -> pk_id::text ->> 'name', '')), '') as nev,
             nullif(btrim(coalesce(v_sor -> 'cellak' -> pk_id::text ->> 'name_en', '')), '') as nev_en,
             coalesce((v_sor -> 'cellak' -> pk_id::text ->> 'active')::boolean, false) as aktiv
        from unnest(v_csomagok) pk_id
    loop
      insert into public.package_slot_cells (slot_id, package_id, name, name_en, active)
      values (v_slot, v_cella.package_id,
              case when v_cella.nev is null or v_cella.nev = v_regi_nev then v_nev else v_cella.nev end,
              case when v_cella.nev_en is not distinct from v_nev_en then null else v_cella.nev_en end,
              v_cella.aktiv)
      on conflict (slot_id, package_id)
      do update set name = excluded.name, name_en = excluded.name_en, active = excluded.active;
    end loop;
  end loop;

  delete from public.package_slots where not (id = any (v_megtart));

  for v_ex, v_extra_rend in select e.value, e.ordinality from jsonb_array_elements(coalesce(p -> 'extrak', '[]'::jsonb)) with ordinality e loop
    v_nev := btrim(coalesce(v_ex ->> 'name', ''));
    if v_nev = '' then
      raise exception 'Az extra neve nem lehet üres.';
    end if;
    update public.extras
       set name = v_nev,
           description = nullif(btrim(coalesce(v_ex ->> 'description', '')), ''),
           name_en = nullif(btrim(coalesce(v_ex ->> 'name_en', '')), ''),
           description_en = nullif(btrim(coalesce(v_ex ->> 'description_en', '')), ''),
           sort_order = v_extra_rend * 10
     where id = (v_ex ->> 'id')::uuid;
  end loop;

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
