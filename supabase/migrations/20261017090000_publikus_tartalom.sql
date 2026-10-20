create table if not exists public.publikus_adatok (
  id                  boolean primary key default true check (id),
  nev                 text check (char_length(nev) <= 80),
  telefon             text check (char_length(telefon) <= 40),
  email               text check (char_length(email) <= 120),
  irsz                text check (char_length(irsz) <= 80),
  cim                 text check (char_length(cim) <= 120),
  haz                 text check (char_length(haz) <= 80),
  szint               text check (char_length(szint) <= 80),
  bejarat             text check (char_length(bejarat) <= 120),
  kerulet             text check (char_length(kerulet) <= 80),
  ceg_nev             text check (char_length(ceg_nev) <= 200),
  ceg_rovid_nev       text check (char_length(ceg_rovid_nev) <= 120),
  ceg_szekhely        text check (char_length(ceg_szekhely) <= 200),
  ceg_cegjegyzekszam  text check (char_length(ceg_cegjegyzekszam) <= 40),
  ceg_cegbirosag      text check (char_length(ceg_cegbirosag) <= 120),
  ceg_adoszam         text check (char_length(ceg_adoszam) <= 40),
  jogi_hataly         text check (char_length(jogi_hataly) <= 60),
  jogi_tervezet       boolean,
  konyvelo_nev        text check (char_length(konyvelo_nev) <= 200),
  konyvelo_cim        text check (char_length(konyvelo_cim) <= 200),
  kamera_megorzes     text check (char_length(kamera_megorzes) <= 120),
  updated_at          timestamptz not null default now()
);

insert into public.publikus_adatok (id) values (true) on conflict (id) do nothing;

create table if not exists public.publikus_szovegek (
  kulcs       text primary key check (kulcs ~ '^[a-z0-9_.]{1,80}$'),
  ertek       text not null check (char_length(ertek) <= 4000),
  updated_at  timestamptz not null default now()
);

create table if not exists public.publikus_kamerak (
  id          uuid primary key default gen_random_uuid(),
  hely        text not null check (char_length(hely) between 1 and 120),
  terulet     text not null check (char_length(terulet) between 1 and 400),
  sort_order  integer not null default 0
);

alter table public.publikus_adatok   enable row level security;
alter table public.publikus_szovegek enable row level security;
alter table public.publikus_kamerak  enable row level security;

revoke all on public.publikus_adatok, public.publikus_szovegek, public.publikus_kamerak from anon, authenticated;

create or replace function public.publikus_telefon()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select nullif(btrim(a.telefon), '') from public.publikus_adatok a limit 1), '+36 1 506 0420');
$$;

revoke all on function public.publikus_telefon() from public;
grant execute on function public.publikus_telefon() to authenticated;

create or replace function public.publikus_tartalom_mentes(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_adat  jsonb := p->'adatok';
  v_szov  jsonb := p->'szovegek';
  v_kam   jsonb := p->'kamerak';
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
      updated_at         = now();
  end if;

  if v_szov is not null and jsonb_typeof(v_szov) = 'object' then
    for v_kulcs, v_ertek in select * from jsonb_each(v_szov) loop
      if v_kulcs !~ '^[a-z0-9_.]{1,80}$' then
        raise exception 'Érvénytelen szövegkulcs: %', left(v_kulcs, 80);
      end if;
      if v_ertek is null or jsonb_typeof(v_ertek) = 'null' or btrim(v_ertek #>> '{}') = '' then
        delete from public.publikus_szovegek where kulcs = v_kulcs;
      else
        if char_length(v_ertek #>> '{}') > 4000 then
          raise exception 'Egy szöveg legfeljebb 4000 karakter lehet.';
        end if;
        insert into public.publikus_szovegek (kulcs, ertek) values (v_kulcs, v_ertek #>> '{}')
        on conflict (kulcs) do update set ertek = excluded.ertek, updated_at = now();
      end if;
    end loop;
  end if;

  if v_kam is not null and jsonb_typeof(v_kam) = 'array' then
    if jsonb_array_length(v_kam) > 30 then
      raise exception 'Legfeljebb 30 kamera vehető fel.';
    end if;
    delete from public.publikus_kamerak where true;
    for v_sor in select * from jsonb_array_elements(v_kam) loop
      if nullif(btrim(coalesce(v_sor->>'hely', '')), '') is null or nullif(btrim(coalesce(v_sor->>'terulet', '')), '') is null then
        raise exception 'Minden kameránál add meg a helyét és azt, hogy mit lát.';
      end if;
      insert into public.publikus_kamerak (hely, terulet, sort_order)
      values (btrim(v_sor->>'hely'), btrim(v_sor->>'terulet'), v_n);
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
    'szovegek', coalesce((select jsonb_object_agg(s.kulcs, s.ertek) from public.publikus_szovegek s), '{}'::jsonb),
    'kamerak', coalesce((
      select jsonb_agg(jsonb_build_object('hely', k.hely, 'terulet', k.terulet) order by k.sort_order)
        from public.publikus_kamerak k), '[]'::jsonb),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description,
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
      select jsonb_agg(to_jsonb(m) order by m.area, m.sort_order, m.package_sort)
        from public.v_package_matrix m), '[]'::jsonb),
    'packageExtras', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.area, x.sort_order)
        from public.v_package_extra x), '[]'::jsonb));
$$;

revoke all on function public.publikus_oldal() from public;
grant execute on function public.publikus_oldal() to anon, authenticated;

create or replace function public.publikus_foglalas(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tel        text := public.phone_norm(p->>'customer_phone');
  v_nev        text := btrim(coalesce(p->>'customer_name', ''));
  v_email      text := nullif(btrim(coalesce(p->>'customer_email', '')), '');
  v_rendszam   text := upper(regexp_replace(coalesce(p->>'plate_raw', ''), '[^A-Za-z0-9]', '', 'g'));
  v_ugyfel     record;
  v_jarmu      record;
  v_be         jsonb;
  v_id         uuid;
  v_megj       text[] := '{}';
begin
  if coalesce(p->>'weboldal', '') <> '' then
    raise exception 'A kérés nem küldhető el.';
  end if;

  if length(v_nev) > 80 then raise exception 'A név legfeljebb 80 karakter lehet.'; end if;
  if length(coalesce(p->>'customer_phone', '')) > 30 then raise exception 'A telefonszám túl hosszú.'; end if;
  if length(coalesce(v_email, '')) > 120 then raise exception 'Az e-mail cím túl hosszú.'; end if;
  if length(coalesce(p->>'plate_raw', '')) > 15 then raise exception 'A rendszám túl hosszú.'; end if;
  if length(coalesce(p->>'brand', '')) > 40 or length(coalesce(p->>'model', '')) > 40 then
    raise exception 'A márka és a modell legfeljebb 40 karakter lehet.';
  end if;
  if length(coalesce(p->>'notes', '')) > 1000 then raise exception 'A megjegyzés legfeljebb 1000 karakter lehet.'; end if;

  if v_tel is not null and (
    select count(*) from public.bookings b
      join public.customers c on c.id = b.customer_id
     where b.public_request and b.status = 'REQUESTED'
       and b.created_at > now() - interval '24 hours'
       and public.phone_norm(c.phone) = v_tel) >= 3 then
    raise exception 'Erről a telefonszámról már több kérés vár visszaigazolásra. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;

  if (select count(*) from public.bookings b
       where b.public_request
         and b.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Most túl sok kérés érkezett. Kérjük, próbáld újra később, vagy hívj minket: %.', public.publikus_telefon();
  end if;

  select c.id, c.name, c.phone into v_ugyfel
    from public.customers c
   where v_tel is not null and public.phone_norm(c.phone) = v_tel
   limit 1;

  select v.id, v.brand, v.model, v.category, v.seats, v.contract_kind into v_jarmu
    from public.vehicles v
   where v_rendszam <> '' and v.plate_normalized = v_rendszam
   limit 1;

  v_be := jsonb_build_object(
    'category',         p->'category',
    'scope',            p->'scope',
    'package_id',       p->'package_id',
    'full_service',     coalesce(p->'full_service', 'false'::jsonb),
    'seat_material',    p->'seat_material',
    'next_day_pick_up', coalesce(p->'next_day_pick_up', 'false'::jsonb),
    'extras',           coalesce(p->'extras', '[]'::jsonb),
    'pick_up_time',     p->'pick_up_time',
    'booking_type',     p->'booking_type',
    'service_date',     p->'service_date',
    'start_time',       p->'start_time',
    'drop_off_time',    p->'drop_off_time',
    'customer_name',    to_jsonb(v_nev),
    'customer_phone',   p->'customer_phone',
    'plate_raw',        p->'plate_raw',
    'brand',            p->'brand',
    'model',            p->'model',
    'notes',            p->'notes');

  v_id := public.online_foglalas(v_be);

  if v_ugyfel.id is not null then
    if v_ugyfel.name is distinct from v_nev then
      v_megj := v_megj || format('A kérésben megadott név: %s (az ügyfélkártyán: %s).', v_nev, v_ugyfel.name);
    end if;
    update public.customers set name = v_ugyfel.name, phone = v_ugyfel.phone where id = v_ugyfel.id;
  elsif v_email is not null then
    update public.customers c set email = v_email
      from public.bookings b
     where b.id = v_id and c.id = b.customer_id;
  end if;

  if v_jarmu.id is not null then
    if nullif(btrim(coalesce(p->>'brand', '')), '') is distinct from v_jarmu.brand
       and nullif(btrim(coalesce(p->>'brand', '')), '') is not null
       or nullif(btrim(coalesce(p->>'model', '')), '') is distinct from v_jarmu.model
       and nullif(btrim(coalesce(p->>'model', '')), '') is not null then
      v_megj := v_megj || format('A kérésben megadott jármű: %s %s (a nyilvántartásban: %s %s).',
        coalesce(p->>'brand', ''), coalesce(p->>'model', ''), coalesce(v_jarmu.brand, ''), coalesce(v_jarmu.model, ''));
    end if;
    update public.vehicles
       set brand = v_jarmu.brand, model = v_jarmu.model, category = v_jarmu.category,
           seats = v_jarmu.seats, contract_kind = v_jarmu.contract_kind
     where id = v_jarmu.id;
  end if;

  update public.bookings
     set request_email = v_email,
         public_request = true,
         internal_notes = case
           when array_length(v_megj, 1) is null then internal_notes
           else concat_ws(E'\n', nullif(internal_notes, ''), 'Online kérés: ' || array_to_string(v_megj, ' '))
         end
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.publikus_foglalas(jsonb) from public;
grant execute on function public.publikus_foglalas(jsonb) to anon, authenticated;
