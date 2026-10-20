alter table public.publikus_szovegek
  add column if not exists nyelv text not null default 'hu' check (nyelv in ('hu', 'en'));
alter table public.publikus_szovegek drop constraint if exists publikus_szovegek_pkey;
alter table public.publikus_szovegek add primary key (kulcs, nyelv);

alter table public.publikus_adatok
  add column if not exists szint_en           text check (char_length(szint_en) <= 80),
  add column if not exists bejarat_en         text check (char_length(bejarat_en) <= 120),
  add column if not exists kerulet_en         text check (char_length(kerulet_en) <= 80),
  add column if not exists kamera_megorzes_en text check (char_length(kamera_megorzes_en) <= 120);

alter table public.publikus_kamerak
  add column if not exists hely_en    text check (char_length(hely_en) <= 120),
  add column if not exists terulet_en text check (char_length(terulet_en) <= 400);

alter table public.packages
  add column if not exists name_en        text check (char_length(name_en) <= 80),
  add column if not exists description_en text check (char_length(description_en) <= 1000);

alter table public.package_slots
  add column if not exists name_en text check (char_length(name_en) <= 120);

alter table public.package_slot_cells
  add column if not exists name_en text check (char_length(name_en) <= 120);

alter table public.extras
  add column if not exists name_en        text check (char_length(name_en) <= 120),
  add column if not exists description_en text check (char_length(description_en) <= 1000);

with forditas(hu, en) as (values
  ('Start', 'Start'),
  ('Premium', 'Premium'),
  ('Elit', 'Elite'))
update public.packages p set name_en = f.en from forditas f where p.name = f.hu and p.name_en is null;

update public.packages
   set description_en = 'Basic exterior wash and interior cleaning.'
 where description = 'Alap külső mosás és belső takarítás.' and description_en is null;

create temporary table munka_forditas(hu text primary key, en text not null);
insert into munka_forditas values
  ('Bogároldó', 'Bug removal'),
  ('Előmosó (aktív hab)', 'Pre-wash (snow foam)'),
  ('Kézi mosás samponnal', 'Hand wash with shampoo'),
  ('Szárazolás', 'Drying'),
  ('Külső ablaktisztítás', 'Exterior window cleaning'),
  ('Gumiápolás', 'Tyre dressing'),
  ('Falc áttörlés', 'Door shut wipe-down'),
  ('Falc mélytisztítás', 'Door shut deep clean'),
  ('Gyors viasz', 'Quick wax'),
  ('Hosszantartó vax', 'Long-lasting wax'),
  ('Porszívózás', 'Vacuuming'),
  ('Műanyag áttörlés (APC)', 'Plastic wipe-down (APC)'),
  ('Belső ablaktisztítás', 'Interior window cleaning'),
  ('Műszerfal és műanyag ápolás', 'Dashboard and plastics care'),
  ('Illatosítás', 'Interior fragrance'),
  ('Alja kárpit mélytisztítás', 'Floor carpet deep clean'),
  ('Felni és gumi mélytisztítás és ápolás', 'Wheel and tyre deep clean and dressing'),
  ('Külső műanyagápolás', 'Exterior plastics care'),
  ('Karc eltávolítás (kis polír)', 'Scratch removal (spot polish)'),
  ('Karosszéria polírozás', 'Paintwork polishing'),
  ('Fényszóró felújítás', 'Headlight restoration'),
  ('Kerámia bevonat', 'Ceramic coating'),
  ('Vizes kárpittisztítás', 'Upholstery wet cleaning'),
  ('Bőrtisztítás és ápolás', 'Leather cleaning and conditioning'),
  ('Tetőkárpit tisztítás', 'Headliner cleaning'),
  ('Ajtókárpit tisztítás', 'Door panel cleaning'),
  ('Ózongenerátoros utastér fertőtlenítés', 'Ozone interior disinfection'),
  ('Motortér kozmetika', 'Engine bay detailing'),
  ('Szezon szerinti ablakmosó folyadék', 'Seasonal screenwash');

update public.package_slots s set name_en = f.en
  from munka_forditas f where s.name = f.hu and s.name_en is null;

update public.package_slot_cells c set name_en = f.en
  from munka_forditas f, public.package_slots s
 where s.id = c.slot_id and c.name = f.hu and c.name <> s.name and c.name_en is null;

update public.extras e set name_en = f.en
  from munka_forditas f where e.name = f.hu and e.name_en is null;

drop table munka_forditas;

create or replace function public.publikus_tartalom_mentes(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_adat  jsonb := p->'adatok';
  v_kam   jsonb := p->'kamerak';
  v_nyelv text;
  v_szov  jsonb;
  v_kulcs text;
  v_ertek jsonb;
  v_sor   jsonb;
  v_n     integer := 0;
  v_email text;
begin
  if not public.is_owner() then
    raise exception 'A publikus oldal tartalmát csak a tulajdonos és a fejlesztő módosíthatja.' using errcode = '42501';
  end if;

  if v_adat is not null and jsonb_typeof(v_adat) = 'object' then
    v_email := nullif(btrim(coalesce(v_adat->>'email', '')), '');
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Az e-mail cím formátuma nem megfelelő.';
    end if;
    update public.publikus_adatok set
      nev                = case when v_adat ? 'nev'                then nullif(btrim(v_adat->>'nev'), '')                else nev end,
      telefon            = case when v_adat ? 'telefon'            then nullif(btrim(v_adat->>'telefon'), '')            else telefon end,
      email              = case when v_adat ? 'email'              then v_email                                          else email end,
      irsz               = case when v_adat ? 'irsz'               then nullif(btrim(v_adat->>'irsz'), '')               else irsz end,
      cim                = case when v_adat ? 'cim'                then nullif(btrim(v_adat->>'cim'), '')                else cim end,
      haz                = case when v_adat ? 'haz'                then nullif(btrim(v_adat->>'haz'), '')                else haz end,
      szint              = case when v_adat ? 'szint'              then nullif(btrim(v_adat->>'szint'), '')              else szint end,
      bejarat            = case when v_adat ? 'bejarat'            then nullif(btrim(v_adat->>'bejarat'), '')            else bejarat end,
      kerulet            = case when v_adat ? 'kerulet'            then nullif(btrim(v_adat->>'kerulet'), '')            else kerulet end,
      szint_en           = case when v_adat ? 'szint_en'           then nullif(btrim(v_adat->>'szint_en'), '')           else szint_en end,
      bejarat_en         = case when v_adat ? 'bejarat_en'         then nullif(btrim(v_adat->>'bejarat_en'), '')         else bejarat_en end,
      kerulet_en         = case when v_adat ? 'kerulet_en'         then nullif(btrim(v_adat->>'kerulet_en'), '')         else kerulet_en end,
      ceg_nev            = case when v_adat ? 'ceg_nev'            then nullif(btrim(v_adat->>'ceg_nev'), '')            else ceg_nev end,
      ceg_rovid_nev      = case when v_adat ? 'ceg_rovid_nev'      then nullif(btrim(v_adat->>'ceg_rovid_nev'), '')      else ceg_rovid_nev end,
      ceg_szekhely       = case when v_adat ? 'ceg_szekhely'       then nullif(btrim(v_adat->>'ceg_szekhely'), '')       else ceg_szekhely end,
      ceg_cegjegyzekszam = case when v_adat ? 'ceg_cegjegyzekszam' then nullif(btrim(v_adat->>'ceg_cegjegyzekszam'), '') else ceg_cegjegyzekszam end,
      ceg_cegbirosag     = case when v_adat ? 'ceg_cegbirosag'     then nullif(btrim(v_adat->>'ceg_cegbirosag'), '')     else ceg_cegbirosag end,
      ceg_adoszam        = case when v_adat ? 'ceg_adoszam'        then nullif(btrim(v_adat->>'ceg_adoszam'), '')        else ceg_adoszam end,
      jogi_hataly        = case when v_adat ? 'jogi_hataly'        then nullif(btrim(v_adat->>'jogi_hataly'), '')        else jogi_hataly end,
      jogi_tervezet      = case when v_adat ? 'jogi_tervezet'      then (v_adat->>'jogi_tervezet')::boolean              else jogi_tervezet end,
      konyvelo_nev       = case when v_adat ? 'konyvelo_nev'       then nullif(btrim(v_adat->>'konyvelo_nev'), '')       else konyvelo_nev end,
      konyvelo_cim       = case when v_adat ? 'konyvelo_cim'       then nullif(btrim(v_adat->>'konyvelo_cim'), '')       else konyvelo_cim end,
      kamera_megorzes    = case when v_adat ? 'kamera_megorzes'    then nullif(btrim(v_adat->>'kamera_megorzes'), '')    else kamera_megorzes end,
      kamera_megorzes_en = case when v_adat ? 'kamera_megorzes_en' then nullif(btrim(v_adat->>'kamera_megorzes_en'), '') else kamera_megorzes_en end,
      updated_at         = now();
  end if;

  foreach v_nyelv in array array['hu', 'en'] loop
    v_szov := p->(case v_nyelv when 'hu' then 'szovegek' else 'szovegek_en' end);
    if v_szov is not null and jsonb_typeof(v_szov) = 'object' then
      for v_kulcs, v_ertek in select * from jsonb_each(v_szov) loop
        if v_kulcs !~ '^[a-z0-9_.]{1,80}$' then
          raise exception 'Érvénytelen szövegkulcs: %', left(v_kulcs, 80);
        end if;
        if v_ertek is null or jsonb_typeof(v_ertek) = 'null' or btrim(v_ertek #>> '{}') = '' then
          delete from public.publikus_szovegek where kulcs = v_kulcs and nyelv = v_nyelv;
        else
          if char_length(v_ertek #>> '{}') > 4000 then
            raise exception 'Egy szöveg legfeljebb 4000 karakter lehet.';
          end if;
          insert into public.publikus_szovegek (kulcs, nyelv, ertek) values (v_kulcs, v_nyelv, v_ertek #>> '{}')
          on conflict (kulcs, nyelv) do update set ertek = excluded.ertek, updated_at = now();
        end if;
      end loop;
    end if;
  end loop;

  if v_kam is not null and jsonb_typeof(v_kam) = 'array' then
    if jsonb_array_length(v_kam) > 30 then
      raise exception 'Legfeljebb 30 kamera vehető fel.';
    end if;
    delete from public.publikus_kamerak where true;
    for v_sor in select * from jsonb_array_elements(v_kam) loop
      if nullif(btrim(coalesce(v_sor->>'hely', '')), '') is null or nullif(btrim(coalesce(v_sor->>'terulet', '')), '') is null then
        raise exception 'Minden kameránál add meg a helyét és azt, hogy mit lát.';
      end if;
      insert into public.publikus_kamerak (hely, terulet, hely_en, terulet_en, sort_order)
      values (btrim(v_sor->>'hely'), btrim(v_sor->>'terulet'),
              nullif(btrim(coalesce(v_sor->>'hely_en', '')), ''), nullif(btrim(coalesce(v_sor->>'terulet_en', '')), ''), v_n);
      v_n := v_n + 1;
    end loop;
  end if;
end;
$$;

revoke all on function public.publikus_tartalom_mentes(jsonb) from public, anon;
grant execute on function public.publikus_tartalom_mentes(jsonb) to authenticated;

create or replace function public.publikus_oldal()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'arculat',     (select s.arculat from public.shop_settings s limit 1),
    'arculat_mod', (select s.arculat_mod from public.shop_settings s limit 1),
    'lemondas_ora', coalesce((select s.online_lemondas_ora from public.shop_settings s limit 1), 24),
    'leadas',      (select to_char(s.drop_off_from, 'HH24:MI') from public.shop_settings s limit 1),
    'nyitvatartas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'weekday', h.weekday, 'closed', h.closed,
               'opens', to_char(h.opens, 'HH24:MI'), 'closes', to_char(h.closes, 'HH24:MI'))
             order by h.weekday)
        from public.business_hours h), '[]'::jsonb),
    'adatok', coalesce((select to_jsonb(a) - 'id' - 'updated_at' from public.publikus_adatok a limit 1), '{}'::jsonb),
    'szovegek', coalesce((select jsonb_object_agg(s.kulcs, s.ertek) from public.publikus_szovegek s where s.nyelv = 'hu'), '{}'::jsonb),
    'szovegek_en', coalesce((select jsonb_object_agg(s.kulcs, s.ertek) from public.publikus_szovegek s where s.nyelv = 'en'), '{}'::jsonb),
    'kamerak', coalesce((
      select jsonb_agg(jsonb_build_object('hely', k.hely, 'terulet', k.terulet, 'hely_en', k.hely_en, 'terulet_en', k.terulet_en)
             order by k.sort_order)
        from public.publikus_kamerak k), '[]'::jsonb),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description,
               'name_en', p.name_en, 'description_en', p.description_en,
               'includes_package_id', p.includes_package_id, 'sort_order', p.sort_order, 'active', p.active)
             order by p.sort_order)
        from public.packages p
       where p.active), '[]'::jsonb),
    'packagePricing', coalesce((
      select jsonb_agg(jsonb_build_object(
               'package_id', pp.package_id, 'category', pp.category, 'scope', pp.scope,
               'price_huf', pp.price_huf, 'duration_minutes', pp.duration_minutes,
               'requires_quote', pp.requires_quote))
        from public.package_pricing pp
        join public.packages p on p.id = pp.package_id and p.active), '[]'::jsonb),
    'fullServicePricing', coalesce((
      select jsonb_agg(jsonb_build_object(
               'package_id', fp.package_id, 'category', fp.category, 'price_huf', fp.price_huf,
               'included_seats', fp.included_seats, 'requires_quote', fp.requires_quote))
        from public.full_service_pricing fp
        join public.packages p on p.id = fp.package_id and p.active), '[]'::jsonb),
    'extras', coalesce((
      select jsonb_agg(to_jsonb(e) - 'created_at' - 'updated_at' order by e.sort_order)
        from public.extras e
       where e.active), '[]'::jsonb),
    'packageItems', coalesce((
      select jsonb_agg(to_jsonb(m) || jsonb_build_object(
               'slot_name_en', s.name_en,
               'name_en', coalesce(c.name_en, case when c.name = s.name then s.name_en end))
             order by m.area, m.sort_order, m.package_sort)
        from public.v_package_matrix m
        join public.package_slots s on s.id = m.slot_id
        join public.package_slot_cells c on c.slot_id = m.slot_id and c.package_id = m.package_id), '[]'::jsonb),
    'packageExtras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'package_id', p.id, 'package_code', p.code,
               'parent_name', e.name, 'parent_name_en', e.name_en,
               'name', c.name, 'name_en', coalesce(c.name_en, case when c.name = s.name then s.name_en end),
               'area', s.area, 'sort_order', s.sort_order)
             order by s.area, s.sort_order)
        from public.packages p
        join public.packages e on e.id = p.includes_package_id
        join public.package_slot_cells c on c.package_id = p.id and c.active
        join public.package_slots s on s.id = c.slot_id
       where p.active
         and not exists (
           select 1 from public.package_slot_cells pc
            where pc.package_id = e.id and pc.slot_id = c.slot_id and pc.active and pc.name = c.name)), '[]'::jsonb));
$$;

revoke all on function public.publikus_oldal() from public;
grant execute on function public.publikus_oldal() to anon, authenticated;

create or replace function public.csomag_szerkeszto()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'csomagok', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description,
               'name_en', p.name_en, 'description_en', p.description_en,
               'includes_package_id', p.includes_package_id,
               'hasznalt', public.csomag_hasznalt(p.id))
             order by p.sort_order, p.name)
        from public.packages p
       where p.active), '[]'::jsonb),
    'sorok', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'name', s.name, 'name_en', s.name_en, 'area', s.area, 'sort_order', s.sort_order,
               'cellak', coalesce((
                 select jsonb_object_agg(c.package_id, jsonb_build_object('name', c.name, 'name_en', c.name_en, 'active', c.active))
                   from public.package_slot_cells c
                   join public.packages p on p.id = c.package_id and p.active
                  where c.slot_id = s.id), '{}'::jsonb))
             order by s.area, s.sort_order, s.name)
        from public.package_slots s), '[]'::jsonb),
    'extrak', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'name', e.name, 'description', e.description,
               'name_en', e.name_en, 'description_en', e.description_en)
             order by e.sort_order, e.name)
        from public.extras e
       where e.active), '[]'::jsonb));
$$;

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

  for v_ex in select * from jsonb_array_elements(coalesce(p -> 'extrak', '[]'::jsonb)) loop
    v_nev := btrim(coalesce(v_ex ->> 'name', ''));
    if v_nev = '' then
      raise exception 'Az extra neve nem lehet üres.';
    end if;
    update public.extras
       set name = v_nev,
           description = nullif(btrim(coalesce(v_ex ->> 'description', '')), ''),
           name_en = nullif(btrim(coalesce(v_ex ->> 'name_en', '')), ''),
           description_en = nullif(btrim(coalesce(v_ex ->> 'description_en', '')), '')
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
