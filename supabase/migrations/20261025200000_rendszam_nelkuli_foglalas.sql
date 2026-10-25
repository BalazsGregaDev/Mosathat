create or replace function public.helyettes_rendszam(p text)
returns boolean
language sql
immutable
as $$ select coalesce(btrim(p), '') in ('', '—') $$;

create or replace function public.helyettes_ugyfel(p_nev text, p_tel text, p_email text)
returns boolean
language sql
immutable
as $$
  select coalesce(btrim(p_nev), '') in ('', 'Névtelen')
     and coalesce(btrim(p_tel), '') in ('', '—')
     and coalesce(btrim(p_email), '') = ''
$$;

grant execute on function public.helyettes_rendszam(text) to authenticated;
grant execute on function public.helyettes_ugyfel(text, text, text) to authenticated;


create or replace function public.create_booking(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_customer_id uuid;
  v_vehicle_id  uuid;
  v_booking_id  uuid;
  v_category    vehicle_category;
  v_scope       booking_scope;
  v_type        booking_type;
  v_date        date;
  v_package_id  uuid;
  v_full        boolean;
  v_extras      jsonb;
  v_pct         numeric;
  v_fix         integer;
  v_kind        contract_kind;
  v_ceg         uuid;
  v_calc        record;
  v_idok        record;
  v_staff       uuid;
begin
  v_category   := (p->>'category')::vehicle_category;
  v_scope      := coalesce((p->>'scope')::booking_scope, 'TELJES');
  v_type       := (p->>'booking_type')::booking_type;
  v_date       := (p->>'service_date')::date;
  v_package_id := nullif(p->>'package_id','')::uuid;
  v_full       := coalesce((p->>'full_service')::boolean, false);
  v_extras     := coalesce(p->'extras', '[]'::jsonb);
  v_pct        := coalesce((p->>'surcharge_pct')::numeric, 0);
  v_fix        := coalesce((p->>'surcharge_fix')::integer, 0);
  v_kind       := nullif(p->>'contract_kind','')::contract_kind;
  v_staff      := (select s.id from public.staff s where s.id = auth.uid());

  if v_category is null then raise exception 'Hiányzik a járműkategória.'; end if;
  if v_type     is null then raise exception 'Hiányzik a foglalás típusa.';  end if;
  if v_date     is null then raise exception 'Hiányzik a dátum.';            end if;
  if v_package_id is null then
    raise exception 'Válassz csomagot.'
      using hint = 'A Start az alap: csomag nélkül nem lehet foglalást menteni.';
  end if;

  v_customer_id := nullif(p->>'customer_id','')::uuid;

  if v_customer_id is null then
    select c.id into v_customer_id
      from public.customers c
     where public.phone_norm(c.phone) = public.phone_norm(p->>'customer_phone')
       and public.phone_norm(p->>'customer_phone') is not null
     limit 1;
  end if;

  if v_customer_id is null
     and public.helyettes_ugyfel(p->>'customer_name', p->>'customer_phone', null) then
    select c.id into v_customer_id
      from public.customers c
     where public.helyettes_ugyfel(c.name, c.phone, c.email)
       and c.anonymized_at is null
       and c.company_id is not distinct from coalesce(
             nullif(p->>'company_id','')::uuid,
             (select co.id from public.companies co
               where co.name_key = public.ceg_kulcs(nullif(trim(p->>'company_name'),''))))
       and (c.company_id is not null or nullif(trim(p->>'company_name'),'') is null)
     order by c.created_at
     limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (name, phone, type, company_id, company_name)
    values (coalesce(nullif(p->>'customer_name',''), 'Névtelen'),
            coalesce(nullif(p->>'customer_phone',''), '—'),
            'MAGAN',
            nullif(p->>'company_id','')::uuid,
            nullif(trim(p->>'company_name'),''))
    returning id into v_customer_id;
  else
    update public.customers
       set name  = coalesce(nullif(p->>'customer_name',''),  name),
           phone = coalesce(nullif(p->>'customer_phone',''), phone),
           updated_at = now()
     where id = v_customer_id;

    if nullif(p->>'company_id','') is not null then
      update public.customers set company_id = (p->>'company_id')::uuid where id = v_customer_id;
    elsif nullif(trim(p->>'company_name'),'') is not null then
      update public.customers set company_name = trim(p->>'company_name') where id = v_customer_id;
    end if;
  end if;

  select company_id into v_ceg from public.customers where id = v_customer_id;

  v_vehicle_id := nullif(p->>'vehicle_id','')::uuid;

  if v_vehicle_id is null and coalesce(p->>'plate_raw','') <> '' then
    select v.id into v_vehicle_id
      from public.vehicles v
     where v.plate_normalized = upper(regexp_replace(p->>'plate_raw', '[^A-Za-z0-9]', '', 'g'))
     limit 1;
  end if;

  if v_vehicle_id is null then
    insert into public.vehicles (customer_id, plate_raw, plate_country, brand, model, category,
                                 seats, contract_kind)
    values (v_customer_id,
            coalesce(nullif(p->>'plate_raw',''), '—'),
            coalesce(nullif(p->>'plate_country',''), 'HU'),
            nullif(p->>'brand',''),
            nullif(p->>'model',''),
            v_category,
            nullif(p->>'seats','')::integer,
            v_kind)
    returning id into v_vehicle_id;
  else
    update public.vehicles
       set brand    = coalesce(nullif(p->>'brand',''),  brand),
           model    = coalesce(nullif(p->>'model',''),  model),
           category = v_category,
           seats    = coalesce(nullif(p->>'seats','')::integer, seats),
           contract_kind = coalesce(v_kind, contract_kind),
           updated_at = now()
     where id = v_vehicle_id;
  end if;

  v_kind := coalesce(v_kind, (select contract_kind from public.vehicles where id = v_vehicle_id));

  select * into v_calc
    from public.calc_service(v_package_id, v_category, v_scope, v_full, v_extras, v_pct, v_fix);
  select * into v_idok from public.foglalas_idok(p, v_date, v_type);

  insert into public.bookings (
    customer_id, vehicle_id, booking_type, status, source, service_date,
    start_at, drop_off_at, pick_up_at, deadline_at,
    package_id, scope, full_service,
    planned_duration_minutes, rest_minutes, estimated_price_huf,
    notes, internal_notes, created_by)
  values (
    v_customer_id, v_vehicle_id, v_type,
    coalesce((p->>'status')::booking_status, 'CONFIRMED'),
    coalesce((p->>'source')::booking_source, 'TELEFON'),
    v_date,
    v_idok.start_at, v_idok.drop_off_at, v_idok.pick_up_at, v_idok.deadline_at,
    v_package_id, v_scope, v_full,
    coalesce(v_calc.work_minutes, 0),
    coalesce(v_calc.rest_minutes, 0),
    0,
    nullif(p->>'notes',''),
    nullif(p->>'internal_notes',''),
    v_staff)
  returning id into v_booking_id;

  perform public.foglalas_tetelek_ir(v_booking_id, v_package_id, v_category, v_scope, v_full,
                                     v_extras, v_pct, v_fix, v_ceg, v_kind, v_type, v_date);

  perform public.rebuild_booking_tasks(v_booking_id);

  return v_booking_id;
end;
$$;

create or replace view public.v_customer_summary
with (security_invoker = on) as
select
  c.id,
  c.name,
  c.phone,
  c.email,
  c.company_name,
  c.type,
  c.billing_kind,
  c.notes,
  c.internal_notes,
  (select count(*) from public.vehicles v where v.customer_id = c.id
     and not (public.helyettes_rendszam(v.plate_raw) and public.helyettes_ugyfel(c.name, c.phone, c.email)))::integer as jarmuvek,
  coalesce(t.latogatas, 0)      as latogatas,
  coalesce(t.osszesen, 0)       as osszesen,
  t.utolso,
  case when coalesce(t.latogatas,0) > 0
       then (t.osszesen / t.latogatas)::integer end as atlag,
  case when coalesce(t.latogatas,0) > 1
       then ((t.utolso - t.elso) / (t.latogatas - 1))::integer end as atlag_napok,
  t.kedvenc_csomag,
  coalesce((select array_agg(v.plate_raw order by v.created_at, v.plate_raw)
              from public.vehicles v where v.customer_id = c.id
                and not (public.helyettes_rendszam(v.plate_raw) and public.helyettes_ugyfel(c.name, c.phone, c.email))), '{}') as rendszamok
from public.customers c
left join lateral (
  select
    count(*)::integer                          as latogatas,
    sum(coalesce(b.final_price_huf, b.estimated_price_huf))::integer as osszesen,
    max(b.service_date)                        as utolso,
    min(b.service_date)                        as elso,
    (select p.name from public.bookings b2
       join public.packages p on p.id = b2.package_id
      where b2.customer_id = c.id and b2.status = 'COMPLETED'
      group by p.name order by count(*) desc limit 1) as kedvenc_csomag
  from public.bookings b
  where b.customer_id = c.id and b.status = 'COMPLETED'
) t on true
where c.anonymized_at is null;

create or replace function public.list_customers(p_q text default '', p_limit integer default 100)
returns setof public.v_customer_summary
language sql
stable
as $$
  with k as (
    select coalesce(trim(p_q), '') as nyers,
           public.ekezettelen(coalesce(trim(p_q), '')) as szoveg,
           case when coalesce(p_q, '') !~ '[[:alpha:]]'
                 and length(regexp_replace(coalesce(p_q, ''), '[^0-9]', '', 'g')) >= 3
                then public.phone_norm(p_q) end as tel,
           upper(regexp_replace(coalesce(p_q, ''), '[^A-Za-z0-9]', '', 'g')) as rendszam
  )
  select s.* from public.v_customer_summary s, k
   where not (public.helyettes_ugyfel(s.name, s.phone, s.email) and cardinality(s.rendszamok) = 0)
     and (k.nyers = ''
      or public.ekezettelen(s.name)         like '%' || k.szoveg || '%'
      or public.ekezettelen(s.company_name) like '%' || k.szoveg || '%'
      or ((k.nyers like '%@%' or length(k.szoveg) >= 3) and public.ekezettelen(s.email) like '%' || k.szoveg || '%')
      or (k.tel is not null and public.phone_norm(s.phone) like '%' || k.tel || '%')
      or (length(k.rendszam) >= 2 and exists (
        select 1 from public.vehicles v
         where v.customer_id = s.id
           and v.plate_normalized like '%' || k.rendszam || '%')))
   order by
     case when k.nyers <> '' and (public.ekezettelen(s.name) like k.szoveg || '%'
                                  or public.ekezettelen(s.company_name) like k.szoveg || '%') then 0 else 1 end,
     s.utolso desc nulls last, s.name
   limit greatest(coalesce(p_limit, 100), 1);
$$;

create or replace function public.list_vehicles(p_q text default '', p_limit integer default 100)
returns setof public.v_vehicle_summary
language sql
stable
as $$
  select s.* from public.v_vehicle_summary s
   where not (public.helyettes_rendszam(s.plate_raw) and public.helyettes_ugyfel(s.customer_name, s.customer_phone, null))
     and (coalesce(trim(p_q), '') = ''
      or s.plate_normalized like
         '%' || upper(regexp_replace(p_q, '[^A-Za-z0-9]', '', 'g')) || '%'
      or public.ekezettelen(s.customer_name) like '%' || public.ekezettelen(p_q) || '%'
      or public.ekezettelen(s.company_name)  like '%' || public.ekezettelen(p_q) || '%'
      or public.ekezettelen(coalesce(s.brand,'') || ' ' || coalesce(s.model,''))
         like '%' || public.ekezettelen(p_q) || '%'
      or (public.phone_norm(p_q) is not null
          and public.phone_norm(s.customer_phone) like '%' || public.phone_norm(p_q) || '%'))
   order by s.utolso desc nulls last, s.plate_raw
   limit greatest(coalesce(p_limit, 100), 1);
$$;

create or replace function public.list_companies(p_q text default '', p_limit integer default 100)
returns setof jsonb
language sql
stable
as $$
  with talalt as (
    select co.*
      from public.companies co
     where coalesce(trim(p_q), '') = ''
        or public.ekezettelen(co.name) like '%' || public.ekezettelen(p_q) || '%'
        or public.ceg_kulcs(co.name) like '%' || coalesce(public.ceg_kulcs(p_q), '#') || '%'
        or exists (
             select 1 from public.v_vehicle_summary s
              where s.company_id = co.id
                and (s.plate_normalized like
                       '%' || upper(regexp_replace(p_q, '[^A-Za-z0-9]', '', 'g')) || '%'
                     or public.ekezettelen(s.customer_name) like '%' || public.ekezettelen(p_q) || '%'))
  )
  select jsonb_build_object(
    'id',          co.id,
    'name',        co.name,
    'tax_number',  co.tax_number,
    'szerzodes',   ct.id is not null,
    'szerzodes_vege', ct.valid_until,
    'hozom_viszem',   coalesce(ct.pickup_delivery, false),
    'berletes',    exists (select 1 from public.customers c
                            where c.company_id = co.id and c.billing_kind = 'BERLETES'),
    'lapos',       public.sheet_kell(co.id),
    'ugyfelek',    (select count(*)::integer from public.customers c
                     where c.company_id = co.id and c.anonymized_at is null
                       and not (public.helyettes_ugyfel(c.name, c.phone, c.email) and not exists (select 1 from public.vehicles v where v.customer_id = c.id and not public.helyettes_rendszam(v.plate_raw)))),
    'jarmuvek',    (select count(*)::integer from public.v_vehicle_summary s
                     where s.company_id = co.id
                       and not (public.helyettes_rendszam(s.plate_raw) and public.helyettes_ugyfel(s.customer_name, s.customer_phone, null))),
    'latogatas',   coalesce((select sum(s.latogatas)::integer from public.v_vehicle_summary s
                              where s.company_id = co.id), 0),
    'utolso',      (select max(s.utolso) from public.v_vehicle_summary s where s.company_id = co.id),
    'autok',       coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', s.id, 'plate_raw', s.plate_raw, 'brand', s.brand, 'model', s.model,
                'category', s.category, 'customer_id', s.customer_id,
                'customer_name', s.customer_name, 'customer_phone', s.customer_phone,
                'contract_kind', s.contract_kind, 'latogatas', s.latogatas, 'utolso', s.utolso)
              order by s.plate_raw)
         from public.v_vehicle_summary s
        where s.company_id = co.id
          and not (public.helyettes_rendszam(s.plate_raw) and public.helyettes_ugyfel(s.customer_name, s.customer_phone, null))), '[]'::jsonb)
  )
  from talalt co
  left join public.contracts ct on ct.id = public.ceg_szerzodes_aktiv(co.id)
  order by public.sheet_kell(co.id) desc, co.name
  limit greatest(coalesce(p_limit, 100), 1);
$$;

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
                                         from public.vehicles v
                                        where v.customer_id = c.id
                                          and not (public.helyettes_rendszam(v.plate_raw) and public.helyettes_ugyfel(c.name, c.phone, c.email))), '[]'::jsonb))
             order by (c.type = 'CEG') desc, c.name)
        from public.customers c
       where c.company_id = v_ceg and c.anonymized_at is null
         and not (public.helyettes_ugyfel(c.name, c.phone, c.email) and not exists (select 1 from public.vehicles v where v.customer_id = c.id and not public.helyettes_rendszam(v.plate_raw)))), '[]'::jsonb)
  );
end;
$$;

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
     and exists (select 1 from public.customers c where c.company_id = p_ceg and c.anonymized_at is null
                   and not (public.helyettes_ugyfel(c.name, c.phone, c.email) and not exists (select 1 from public.vehicles v where v.customer_id = c.id and not public.helyettes_rendszam(v.plate_raw)))) then
    raise exception 'Jelölj ki legalább egy ügyfelet, akit át kell vinni az új cégnévre.';
  end if;
  if exists (select 1 from unnest(p_ugyfelek) u(id)
              where not exists (select 1 from public.customers c where c.id = u.id and c.company_id = p_ceg)) then
    raise exception 'A kijelölt ügyfelek közül valaki már nem ennél a cégnél van. Frissítsd az oldalt.';
  end if;

  v_mind := not exists (
    select 1 from public.customers c
     where c.company_id = p_ceg and c.anonymized_at is null and not (c.id = any (p_ugyfelek))
       and not (public.helyettes_ugyfel(c.name, c.phone, c.email) and not exists (select 1 from public.vehicles v where v.customer_id = c.id and not public.helyettes_rendszam(v.plate_raw))));

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
    update public.customers c set company_id = v_masik
     where c.company_id = p_ceg
       and (c.id = any (p_ugyfelek) or (v_mind and c.anonymized_at is null));
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

create or replace function public.search_customers(
  p_q     text,
  p_limit integer default 5,
  p_mezo  text    default 'MIND'
)
returns table (
  vehicle_id     uuid,
  plate_raw      text,
  brand          text,
  model          text,
  category       vehicle_category,
  seats          integer,
  customer_id    uuid,
  customer_name  text,
  customer_phone text,
  customer_type  customer_type,
  company_name   text,
  utolso_datum   date,
  utolso_csomag  text,
  utolso_ar      integer,
  company_id     uuid,
  contract_kind  contract_kind
)
language sql
stable
as $$
  with q as (
    select
      trim(coalesce(p_q, ''))                                              as nyers,
      upper(regexp_replace(coalesce(p_q, ''), '[^A-Za-z0-9]', '', 'g'))    as rendszam,
      upper(coalesce(nullif(trim(p_mezo), ''), 'MIND'))                    as mezo
  )
  select
    v.id, v.plate_raw, v.brand, v.model, v.category, v.seats,
    c.id, c.name, c.phone, c.type, c.company_name,
    u.service_date, u.package_name, u.price_huf,
    c.company_id, v.contract_kind
  from public.vehicles v
  join public.customers c on c.id = v.customer_id
  cross join q
  left join lateral (
    select h.service_date, h.package_name, h.price_huf
      from public.v_customer_history h
     where h.vehicle_id = v.id
     order by h.service_date desc
     limit 1
  ) u on true
  where q.nyers <> ''
    and c.anonymized_at is null
    and not (public.helyettes_rendszam(v.plate_raw) and public.helyettes_ugyfel(c.name, c.phone, c.email))
    and (
      (q.mezo = 'RENDSZAM' and q.rendszam <> ''
        and v.plate_normalized like '%' || q.rendszam || '%')
      or (q.mezo = 'NEV' and (
             public.ekezettelen(c.name)         like '%' || public.ekezettelen(q.nyers) || '%'
          or public.ekezettelen(c.company_name) like '%' || public.ekezettelen(q.nyers) || '%'))
      or (q.mezo = 'MIND' and (
             (q.rendszam <> '' and v.plate_normalized like q.rendszam || '%')
          or v.plate_normalized like '%' || q.rendszam || '%'
          or public.ekezettelen(c.name)         like '%' || public.ekezettelen(q.nyers) || '%'
          or public.ekezettelen(c.company_name) like '%' || public.ekezettelen(q.nyers) || '%'))
    )
  order by
    case when q.rendszam <> '' and v.plate_normalized like q.rendszam || '%' then 0 else 1 end,
    case when public.ekezettelen(c.name) like public.ekezettelen(q.nyers) || '%'
           or public.ekezettelen(c.company_name) like public.ekezettelen(q.nyers) || '%'
         then 0 else 1 end,
    u.service_date desc nulls last,
    v.plate_raw
  limit greatest(coalesce(p_limit, 5), 1);
$$;

create or replace function public.helyettes_takaritas()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r record;
  v_marad uuid;
  v_db integer := 0;
  v_n integer;
begin
  for r in
    select c.company_id, array_agg(c.id order by c.created_at) ids
      from public.customers c
     where public.helyettes_ugyfel(c.name, c.phone, c.email)
       and c.anonymized_at is null
       and c.billing_kind = 'NORMAL'
       and not exists (select 1 from public.passes x where x.customer_id = c.id)
       and not exists (select 1 from public.contracts x where x.customer_id = c.id)
       and not exists (select 1 from public.customer_booking_links x where x.customer_id = c.id)
     group by c.company_id
    having count(*) > 1
  loop
    v_marad := r.ids[1];
    update public.vehicles set customer_id = v_marad where customer_id = any (r.ids[2:]);
    update public.bookings set customer_id = v_marad where customer_id = any (r.ids[2:]);
    delete from public.customers where id = any (r.ids[2:]);
    v_db := v_db + cardinality(r.ids) - 1;
  end loop;

  delete from public.vehicles v
   where public.helyettes_rendszam(v.plate_raw)
     and not exists (select 1 from public.bookings b where b.vehicle_id = v.id);

  delete from public.customers c
   where public.helyettes_ugyfel(c.name, c.phone, c.email)
     and c.billing_kind = 'NORMAL'
     and not exists (select 1 from public.bookings b where b.customer_id = c.id)
     and not exists (select 1 from public.vehicles v where v.customer_id = c.id)
     and not exists (select 1 from public.passes x where x.customer_id = c.id)
     and not exists (select 1 from public.contracts x where x.customer_id = c.id)
     and not exists (select 1 from public.customer_booking_links x where x.customer_id = c.id);
  get diagnostics v_n = row_count;
  return v_db + v_n;
end;
$$;

revoke all on function public.helyettes_takaritas() from public, anon, authenticated;

select public.helyettes_takaritas();
