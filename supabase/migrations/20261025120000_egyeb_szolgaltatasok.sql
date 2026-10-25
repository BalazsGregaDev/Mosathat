create or replace function public.extra_mentes(p_id uuid, p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nev text;
begin
  if not public.is_owner() then
    raise exception 'Szolgáltatást a tulajdonos módosíthat.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.extras e where e.id = p_id) then
    raise exception 'Nincs ilyen szolgáltatás.';
  end if;
  if p ? 'name' then
    v_nev := nullif(btrim(coalesce(p->>'name', '')), '');
    if v_nev is null then
      raise exception 'A szolgáltatás neve nem lehet üres.';
    end if;
    if char_length(v_nev) > 120 then
      raise exception 'A név legfeljebb 120 karakter lehet.';
    end if;
    if exists (select 1 from public.extras e
                where e.id <> p_id and public.ekezettelen(e.name) = public.ekezettelen(v_nev)) then
      raise exception 'Ilyen nevű szolgáltatás már van: %', v_nev;
    end if;
  end if;
  if p ? 'area' and coalesce(p->>'area', '') not in ('KULSO', 'BELSO') then
    raise exception 'A szolgáltatás helye Külső vagy Belső lehet.';
  end if;
  if coalesce((p->>'price_huf')::numeric, 0) < 0 or coalesce((p->>'work_minutes')::numeric, 0) < 0
     or coalesce((p->>'rest_minutes')::numeric, 0) < 0 then
    raise exception 'Az ár és az idő nem lehet negatív.';
  end if;
  if char_length(coalesce(p->>'description', '')) > 1000 or char_length(coalesce(p->>'description_en', '')) > 1000 then
    raise exception 'A leírás legfeljebb 1000 karakter lehet.';
  end if;
  if char_length(btrim(coalesce(p->>'name_en', ''))) > 120 then
    raise exception 'Az angol név legfeljebb 120 karakter lehet.';
  end if;

  update public.extras set
    name           = case when p ? 'name' then v_nev else name end,
    description    = case when p ? 'description' then nullif(btrim(coalesce(p->>'description', '')), '') else description end,
    name_en        = case when p ? 'name_en' then nullif(btrim(coalesce(p->>'name_en', '')), '') else name_en end,
    description_en = case when p ? 'description_en' then nullif(btrim(coalesce(p->>'description_en', '')), '') else description_en end,
    area           = case when p ? 'area' then (p->>'area')::service_area else area end,
    price_huf      = case when p ? 'price_huf' then round((p->>'price_huf')::numeric)::integer else price_huf end,
    work_minutes   = case when p ? 'work_minutes' then round((p->>'work_minutes')::numeric)::integer else work_minutes end,
    rest_minutes   = case when p ? 'rest_minutes' then coalesce(round((p->>'rest_minutes')::numeric)::integer, 0) else rest_minutes end,
    active         = case when p ? 'active' then coalesce((p->>'active')::boolean, active) else active end,
    included_in_packages = case when p ? 'included_in_packages'
      then array(select jsonb_array_elements_text(coalesce(p->'included_in_packages', '[]'::jsonb)))::uuid[]
      else included_in_packages end,
    included_in_full_service = case when p ? 'included_in_full_service'
      then coalesce((p->>'included_in_full_service')::boolean, false) else included_in_full_service end,
    updated_at     = now()
  where id = p_id;
end;
$$;

revoke all on function public.extra_mentes(uuid, jsonb) from public, anon;
grant execute on function public.extra_mentes(uuid, jsonb) to authenticated;

create or replace function public.extra_torles(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Szolgáltatást a tulajdonos törölhet.' using errcode = '42501';
  end if;
  if exists (select 1 from public.booking_items i where i.kind = 'EXTRA' and i.ref_id = p_id) then
    raise exception 'Ez a szolgáltatás már szerepel foglalásban, ezért nem törölhető. Kapcsold ki az Aktív jelölővel, akkor sehol nem jelenik meg többé.';
  end if;
  delete from public.extras where id = p_id;
end;
$$;

revoke all on function public.extra_torles(uuid) from public, anon;
grant execute on function public.extra_torles(uuid) to authenticated;

create or replace function public.extrak_sorrend(p_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'A sorrendet a tulajdonos állíthatja.' using errcode = '42501';
  end if;
  update public.extras e
     set sort_order = s.rend * 10, updated_at = now()
    from unnest(p_ids) with ordinality as s(id, rend)
   where e.id = s.id and e.sort_order is distinct from s.rend * 10;
  update public.extras e
     set sort_order = (cardinality(p_ids) + 1) * 10 + e.sort_order
   where not (e.id = any (p_ids));
end;
$$;

revoke all on function public.extrak_sorrend(uuid[]) from public, anon;
grant execute on function public.extrak_sorrend(uuid[]) to authenticated;

create or replace function public.create_extra(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_nev  text := nullif(trim(p->>'name'), '');
  v_hely text := coalesce(nullif(p->>'area', ''), 'KULSO');
  v_id   uuid;
begin
  if not public.is_owner() then
    raise exception 'Új szolgáltatást a tulajdonos vesz fel.' using errcode = '42501';
  end if;
  if v_nev is null then
    raise exception 'Add meg a szolgáltatás nevét.';
  end if;
  if v_hely not in ('KULSO', 'BELSO') then
    raise exception 'A szolgáltatás helye Külső vagy Belső lehet.';
  end if;
  if coalesce((p->>'price_huf')::numeric, 0) < 0 or coalesce((p->>'work_minutes')::numeric, 0) < 0 then
    raise exception 'Az ár és az idő nem lehet negatív.';
  end if;
  if exists (select 1 from public.extras e
              where public.ekezettelen(e.name) = public.ekezettelen(v_nev)) then
    raise exception 'Ilyen nevű szolgáltatás már van: %', v_nev
      using hint = 'Ha inaktív, a listában újra bekapcsolható.';
  end if;

  insert into public.extras (name, description, area, price_huf, work_minutes, sort_order, active)
  values (v_nev,
          nullif(trim(p->>'description'), ''),
          v_hely::service_area,
          nullif(p->>'price_huf', '')::integer,
          nullif(p->>'work_minutes', '')::integer,
          coalesce((select max(sort_order) from public.extras), 0) + 10,
          true)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_extra(jsonb) to authenticated;
