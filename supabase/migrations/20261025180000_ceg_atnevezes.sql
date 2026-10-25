create or replace function public.ceg_tagjai(p_ugyfel uuid default null, p_ceg uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ceg uuid := p_ceg;
  v_nev text;
begin
  if not public.can_edit_customers() then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.' using errcode = '42501';
  end if;
  if v_ceg is null and p_ugyfel is not null then
    select company_id into v_ceg from public.customers where id = p_ugyfel;
  end if;
  if v_ceg is null then
    return null;
  end if;
  select name into v_nev from public.companies where id = v_ceg;
  if v_nev is null then
    return null;
  end if;
  return jsonb_build_object(
    'ceg_id', v_ceg,
    'nev', v_nev,
    'szerzodes', public.ceg_szerzodes_aktiv(v_ceg) is not null,
    'tagok', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'name', c.name,
               'phone', c.phone,
               'type', c.type,
               'rendszamok', coalesce((select jsonb_agg(v.plate_raw order by v.created_at, v.plate_raw)
                                         from public.vehicles v where v.customer_id = c.id), '[]'::jsonb))
             order by (c.type = 'CEG') desc, c.name)
        from public.customers c
       where c.company_id = v_ceg and c.anonymized_at is null), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.ceg_tagjai(uuid, uuid) from public, anon;
grant execute on function public.ceg_tagjai(uuid, uuid) to authenticated;

create or replace function public.ceg_atnevez(p_ceg uuid, p_nev text, p_ugyfelek uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nev    text := nullif(btrim(coalesce(p_nev, '')), '');
  v_kulcs  text;
  v_regi   text;
  v_regi_kulcs text;
  v_masik  uuid;
  v_masik_nev text;
  v_mind   boolean;
  v_cel    uuid;
  v_torolve boolean := false;
begin
  if not public.can_edit_customers() then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.' using errcode = '42501';
  end if;
  if v_nev is null then
    raise exception 'Add meg a cég új nevét.';
  end if;
  if char_length(v_nev) > 200 then
    raise exception 'A cégnév legfeljebb 200 karakter lehet.';
  end if;
  v_kulcs := public.ceg_kulcs(v_nev);
  if v_kulcs is null then
    raise exception 'A cégnévben legyen betű vagy szám.';
  end if;
  select name, name_key into v_regi, v_regi_kulcs from public.companies where id = p_ceg for update;
  if v_regi is null then
    raise exception 'Nincs ilyen cég.';
  end if;
  p_ugyfelek := coalesce(p_ugyfelek, '{}');
  if cardinality(p_ugyfelek) = 0
     and exists (select 1 from public.customers c where c.company_id = p_ceg and c.anonymized_at is null) then
    raise exception 'Jelölj ki legalább egy ügyfelet, akit át kell vinni az új cégnévre.';
  end if;
  if exists (select 1 from unnest(p_ugyfelek) u(id)
              where not exists (select 1 from public.customers c where c.id = u.id and c.company_id = p_ceg)) then
    raise exception 'A kijelölt ügyfelek közül valaki már nem ennél a cégnél van. Frissítsd az oldalt.';
  end if;

  v_mind := not exists (
    select 1 from public.customers c
     where c.company_id = p_ceg and c.anonymized_at is null and not (c.id = any (p_ugyfelek)));

  select id, name into v_masik, v_masik_nev from public.companies where name_key = v_kulcs and id <> p_ceg;

  if v_masik is null and v_mind then
    update public.companies set name = v_nev where id = p_ceg;
    v_cel := p_ceg;
  else
    if v_mind and exists (select 1 from public.contracts ct where ct.company_id = p_ceg) then
      raise exception 'Már van % nevű cég, de a(z) % cégnek szerződése van, ezért a kettő nem vonható össze.', v_masik_nev, v_regi
        using hint = 'Adj meg más nevet, vagy előbb rendezd a szerződést a Cégek és bérletesek menüben.';
    end if;
    if v_masik is null then
      insert into public.companies (name, name_key) values (v_nev, v_kulcs) returning id into v_masik;
    elsif v_masik_nev is distinct from v_nev then
      update public.companies set name = v_nev where id = v_masik;
    end if;
    update public.customers set company_id = v_masik
     where company_id = p_ceg and id = any (p_ugyfelek);
    v_cel := v_masik;
    if v_mind then
      update public.bookings set ceg_link_company = v_masik where ceg_link_company = p_ceg;
      if not exists (select 1 from public.company_sheets where company_id = p_ceg) then
        delete from public.companies where id = p_ceg;
        v_torolve := true;
      end if;
    end if;
  end if;

  update public.customers c
     set name = v_nev, updated_at = now()
   where c.id = any (p_ugyfelek)
     and c.type = 'CEG'
     and public.ceg_kulcs(c.name) = v_regi_kulcs
     and c.name is distinct from v_nev;

  return jsonb_build_object(
    'ceg_id', v_cel,
    'nev', (select name from public.companies where id = v_cel),
    'osszevonva', v_cel <> p_ceg and v_masik_nev is not null,
    'atvitt', cardinality(p_ugyfelek),
    'regi_torolve', v_torolve
  );
end;
$$;

revoke all on function public.ceg_atnevez(uuid, text, uuid[]) from public, anon;
grant execute on function public.ceg_atnevez(uuid, text, uuid[]) to authenticated;

create or replace function public.ceg_cel(p_ceg uuid, p_nev text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kulcs text := public.ceg_kulcs(p_nev);
  v_id    uuid;
begin
  if not public.can_edit_customers() then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.' using errcode = '42501';
  end if;
  if v_kulcs is null then
    return null;
  end if;
  select id into v_id from public.companies where name_key = v_kulcs and id is distinct from p_ceg;
  if v_id is null then
    return jsonb_build_object('letezo', false, 'sajat', exists (select 1 from public.companies where id = p_ceg and name_key = v_kulcs));
  end if;
  return jsonb_build_object(
    'letezo', true,
    'id', v_id,
    'nev', (select name from public.companies where id = v_id),
    'szerzodes', public.ceg_szerzodes_aktiv(v_id) is not null,
    'ugyfelek', (select count(*)::integer from public.customers c where c.company_id = v_id and c.anonymized_at is null),
    'jarmuvek', (select count(*)::integer from public.vehicles v join public.customers c on c.id = v.customer_id
                  where c.company_id = v_id and c.anonymized_at is null)
  );
end;
$$;

revoke all on function public.ceg_cel(uuid, text) from public, anon;
grant execute on function public.ceg_cel(uuid, text) to authenticated;
