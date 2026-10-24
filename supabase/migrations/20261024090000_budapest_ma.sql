create or replace function public.budapest_ma()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Europe/Budapest')::date;
$$;

revoke all on function public.budapest_ma() from public, anon;
grant execute on function public.budapest_ma() to authenticated;

CREATE OR REPLACE FUNCTION public.absence_list(p_from date DEFAULT public.budapest_ma())
 RETURNS TABLE(id uuid, staff_id uuid, staff_name text, day date, kind absence_kind, starts time without time zone, ends time without time zone, note text, sajat boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, a.staff_id, s.full_name, a.day, a.kind, a.starts, a.ends, a.note,
         a.staff_id = auth.uid()
    from public.staff_absences a
    join public.staff s on s.id = a.staff_id
   where a.day >= p_from
     and (a.staff_id = auth.uid() or public.is_owner())
   order by a.day, public.tavollet_tol(a), s.full_name;
$function$;

CREATE OR REPLACE FUNCTION public.berlet_lejarat(p_kind validity_kind, p_value text, p_from date DEFAULT public.budapest_ma())
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_kind
    when 'DATUM' then p_value::date
    when 'EV'    then (p_from + (coalesce(nullif(p_value,''),'1')::integer * interval '1 year'))::date
    when 'NAP'   then (p_from + (coalesce(nullif(p_value,''),'0')::integer * interval '1 day'))::date
  end;
$function$;

CREATE OR REPLACE FUNCTION public.ceg_szerzodes_aktiv(p_company uuid, p_nap date DEFAULT public.budapest_ma())
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select ct.id from public.contracts ct
   where ct.company_id = p_company
     and ct.active
     and (ct.valid_until is null or ct.valid_until >= p_nap)
   order by ct.created_at desc
   limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.create_pass(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id    uuid;
  v_from  date := coalesce(nullif(p->>'valid_from','')::date, public.budapest_ma());
  v_until date;
  r       jsonb;
  v_sort  integer := 0;
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;

  v_until := coalesce(
    nullif(p->>'valid_until','')::date,
    public.berlet_lejarat(
      coalesce(nullif(p->>'validity_kind','')::validity_kind, 'EV'),
      coalesce(nullif(p->>'validity_value',''), '1'),
      v_from));

  insert into public.passes (customer_id, name, price_huf, valid_from, valid_until, notes, created_by)
  values (
    (p->>'customer_id')::uuid,
    coalesce(nullif(p->>'name',''), 'Bérlet'),
    coalesce((p->>'price_huf')::integer, 0),
    v_from, v_until,
    nullif(p->>'notes',''),
    (select s.id from public.staff s where s.id = auth.uid()))
  returning id into v_id;

  for r in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb))
  loop
    insert into public.pass_items (pass_id, package_id, category, qty_total, sort_order)
    values (
      v_id,
      nullif(r->>'package_id','')::uuid,
      nullif(r->>'category','')::vehicle_category,
      greatest(coalesce((r->>'qty_total')::integer, 1), 1),
      v_sort);
    v_sort := v_sort + 1;
  end loop;

  if v_sort = 0 then
    raise exception 'A bérletnek legalább egy tételt tartalmaznia kell.';
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_adat(p_day date DEFAULT public.budapest_ma())
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  with elo as (
    select b.*, public.booking_ertek(b) as ertek
      from public.bookings b
     where b.status not in ('CANCELLED_BY_CUSTOMER','CANCELLED_BY_SHOP','NO_SHOW','REJECTED')
  ),
  kap as (
    select * from public.day_capacity(p_day)
  ),
  ma as (
    select k.cars           as db,
           k.revenue_huf    as bevetel,
           k.booked_minutes as percek,
           (select count(*)::integer from elo
             where elo.service_date <= p_day and elo.last_day >= p_day
               and elo.status = 'COMPLETED') as kesz
      from kap k
  ),
  het as (
    select count(*)::integer                as db,
           coalesce(sum(ertek), 0)::integer as bevetel
      from elo
     where service_date between date_trunc('week', p_day)::date
                            and (date_trunc('week', p_day) + interval '6 days')::date
  ),
  nepszeru as (
    select coalesce(jsonb_agg(x order by x.db desc), '[]'::jsonb) as lista
      from (
        select p.name || ' ' ||
               case v.category when 'SZEMELYAUTO' then 'sedan'
                               when 'SUV' then 'SUV' else 'kisbusz' end as nev,
               count(*)::integer as db
          from elo b
          join public.vehicles v on v.id = b.vehicle_id
          join public.packages p on p.id = b.package_id
         where b.service_date >= p_day - 90
         group by 1
         order by 2 desc
         limit 5
      ) x
  ),
  rovid as (
    select b.id, b.service_date, b.last_day, b.status, b.planned_duration_minutes,
           b.booking_type,
           v.plate_raw,
           coalesce(nullif(trim(c.phone), ''), '—') as phone
      from elo b
      join public.vehicles  v on v.id = b.vehicle_id
      join public.customers c on c.id = b.customer_id
  ),
  gondok as (
    select coalesce(jsonb_agg(g order by g.suly desc, g.cimke), '[]'::jsonb) as lista
      from (
        select 'Idő nélkül' as cimke,
               count(*)::text || ' foglalásnak nincs időtartama — nem számít a kapacitásba' as szoveg,
               2 as suly,
               'munkalap' as cel,
               jsonb_agg(jsonb_build_object('id', r.id, 'plate_raw', r.plate_raw,
                                            'service_date', r.service_date)
                         order by r.service_date, r.plate_raw) as foglalasok
          from rovid r
         where r.last_day >= p_day and r.planned_duration_minutes = 0
           and r.status <> 'COMPLETED'
         having count(*) > 0

        union all
        select 'Határidő',
               r.plate_raw || ' határideje ' ||
               case when r.last_day < p_day then 'lejárt'
                    when r.last_day = p_day then 'ma jár le'
                    else 'holnap jár le' end,
               case when r.last_day <= p_day then 3 else 2 end,
               'munkalap',
               jsonb_build_array(jsonb_build_object('id', r.id, 'plate_raw', r.plate_raw,
                                                    'service_date', r.service_date))
          from rovid r
         where (r.last_day > r.service_date or r.booking_type = 'TOBBNAPOS')
           and r.status not in ('COMPLETED', 'READY')
           and r.last_day <= p_day + 1
           and r.last_day >= p_day - 14

        union all
        select 'Elérhetőség',
               count(*)::text || ' foglaláshoz nincs telefonszám',
               1,
               'telefon',
               jsonb_agg(jsonb_build_object('id', r.id, 'plate_raw', r.plate_raw,
                                            'service_date', r.service_date)
                         order by r.service_date, r.plate_raw)
          from rovid r
         where r.last_day >= p_day and r.phone = '—'
         having count(*) > 0

        union all
        select 'Hiányzó adat',
               count(*)::text || ' szolgáltatásnak nincs ára a Szolgáltatások alatt',
               1, 'szolgaltatasok', null::jsonb
          from public.extras
         where active and price_huf is null and not requires_quote
         having count(*) > 0

        union all
        select 'Hiányzó adat',
               count(*)::text || ' Kívül/Belül munkához nincs időtartam',
               2, 'szolgaltatasok', null::jsonb
          from public.package_pricing
         where scope <> 'TELJES' and duration_minutes is null
         having count(*) > 0

        union all
        select 'Bérlet',
               b.customer_name || ' bérlete ' || (b.valid_until - p_day)::text || ' nap múlva lejár',
               1, 'partnerek', null::jsonb
          from public.v_pass_balance b
         where b.active and not b.lejart and b.qty_left > 0
           and b.valid_until <= p_day + 30
         group by b.customer_name, b.valid_until
      ) g
  )
  select jsonb_build_object(
    'nap',        p_day,
    'ma',         (select to_jsonb(ma) from ma),
    'het',        (select to_jsonb(het) from het),
    'nepszeru',   (select lista from nepszeru),
    'gondok',     (select lista from gondok)
  );
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_summary(p_day date DEFAULT public.budapest_ma())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  if auth.uid() is not null and not public.is_owner() then
    raise exception 'Az áttekintéshez nincs jogosultságod.' using errcode = '42501';
  end if;
  return public.dashboard_adat(p_day);
end;
$function$;

CREATE OR REPLACE FUNCTION public.foglalas_tetelek(p_package_id uuid, p_category vehicle_category, p_scope booking_scope, p_full boolean, p_extras jsonb, p_pct numeric, p_fix integer, p_company_id uuid, p_kind contract_kind, p_type booking_type, p_date date)
 RETURNS TABLE(kind booking_item_kind, ref_id uuid, name text, quantity numeric, unit_price_huf integer, price_huf integer, work_minutes integer, sort_order integer)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_szerz    uuid;
  v_szerz_ar integer;
  v_fuvar    integer;
  v_meret    contract_size := case when p_category = 'SZEMELYAUTO' then 'NORMAL' else 'NAGY' end;
  v_pp       record;
  v_fs       record;
  v_alap     integer := 0;
  v_sort     integer := 0;
  v_vegso    integer;
  v_csomag_ar integer;
  r          record;
  v_qty      numeric;
  v_line     integer;
begin
  if p_company_id is not null then
    v_szerz := public.ceg_szerzodes_aktiv(p_company_id, coalesce(p_date, public.budapest_ma()));
  end if;

  if v_szerz is not null and p_package_id is not null and not coalesce(p_full, false)
     and coalesce(p_scope, 'TELJES') = 'TELJES' then
    select cp.price_huf into v_szerz_ar
      from public.contract_prices cp
     where cp.contract_id = v_szerz and cp.package_id = p_package_id
       and cp.size = v_meret and cp.kind = coalesce(p_kind, 'FLOTTA');
  end if;

  if p_package_id is not null then
    select pp.price_huf, pp.duration_minutes into v_pp
      from public.package_pricing pp
     where pp.package_id = p_package_id and pp.category = p_category
       and pp.scope = coalesce(p_scope, 'TELJES');

    v_csomag_ar := coalesce(v_szerz_ar, v_pp.price_huf, 0);

    kind := 'PACKAGE'; ref_id := p_package_id;
    select pk.name
             || case when coalesce(p_scope, 'TELJES') = 'TELJES' then '' else ' — ' || p_scope::text end
             || case when v_szerz_ar is not null
                     then case when coalesce(p_kind, 'FLOTTA') = 'FLOTTA'
                               then ' (szerződéses, flotta)' else ' (szerződéses, saját autó)' end
                     else '' end
      into name from public.packages pk where pk.id = p_package_id;
    quantity := 1; unit_price_huf := v_csomag_ar; price_huf := v_csomag_ar;
    work_minutes := coalesce(v_pp.duration_minutes, 0); sort_order := v_sort;
    return next;

    v_alap := v_alap + v_csomag_ar;
    v_sort := v_sort + 1;
  end if;

  if coalesce(p_full, false) then
    select fp.price_huf, fp.extra_work_minutes into v_fs
      from public.full_service_pricing fp
     where fp.package_id = p_package_id and fp.category = p_category;

    kind := 'FULL_SERVICE'; ref_id := null;
    name := 'Full Service (Csomag+Kárpit/Bőrtisztítás)';
    quantity := 1;
    unit_price_huf := coalesce(v_fs.price_huf, 0) - v_alap;
    price_huf := unit_price_huf;
    work_minutes := coalesce(v_fs.extra_work_minutes, 45);
    sort_order := v_sort;
    return next;

    v_alap := coalesce(v_fs.price_huf, v_alap);
    v_sort := v_sort + 1;
  end if;

  for r in
    select e.*, coalesce((x->>'quantity')::numeric, 1) as qty
      from jsonb_array_elements(coalesce(p_extras, '[]'::jsonb)) as x
      join public.extras e on e.id = (x->>'extra_id')::uuid
     order by e.sort_order
  loop
    v_qty  := greatest(r.qty, 1);
    v_line := case
                when r.requires_quote or r.price_huf is null then 0
                when r.price_unit = 'ALKALOM' then r.price_huf
                else (r.price_huf * v_qty)::integer
              end;

    kind := 'EXTRA'; ref_id := r.id; name := r.name; quantity := v_qty;
    unit_price_huf := coalesce(r.price_huf, 0); price_huf := v_line;
    work_minutes := coalesce(r.work_minutes, 0)
                    * case when r.duration_unit = 'ALKALOM' then 1 else v_qty end;
    sort_order := v_sort;
    return next;

    v_alap := v_alap + v_line;
    v_sort := v_sort + 1;
  end loop;

  v_vegso := v_alap;
  if p_pct is not null and p_pct <> 0 then
    v_vegso := round(v_vegso * (1 + p_pct / 100.0))::integer;
  end if;
  v_vegso := v_vegso + coalesce(p_fix, 0);

  if v_vegso <> v_alap then
    kind := 'SURCHARGE'; ref_id := null;
    name := case when coalesce(p_pct, 0) <> 0 and coalesce(p_fix, 0) <> 0
                   then 'Felár (' || p_pct || '% + fix)'
                 when coalesce(p_pct, 0) <> 0 then 'Felár (' || p_pct || '%)'
                 else 'Felár' end;
    quantity := 1; unit_price_huf := v_vegso - v_alap; price_huf := v_vegso - v_alap;
    work_minutes := 0; sort_order := v_sort;
    return next;
    v_sort := v_sort + 1;
  end if;

  if p_type = 'HOZOMVISZEM' and v_szerz is not null then
    select ct.pickup_delivery_fee_huf into v_fuvar
      from public.contracts ct
     where ct.id = v_szerz and ct.pickup_delivery;
    if coalesce(v_fuvar, 0) > 0 then
      kind := 'FUVAR'; ref_id := null; name := 'Hozom-viszem fuvar';
      quantity := 1; unit_price_huf := v_fuvar; price_huf := v_fuvar;
      work_minutes := 0; sort_order := v_sort;
      return next;
    end if;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.quote_booking(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_category vehicle_category := coalesce(nullif(p->>'category','')::vehicle_category, 'SZEMELYAUTO');
  v_scope    booking_scope    := coalesce(nullif(p->>'scope','')::booking_scope, 'TELJES');
  v_package  uuid             := nullif(p->>'package_id','')::uuid;
  v_full     boolean          := coalesce((p->>'full_service')::boolean, false);
  v_extras   jsonb            := coalesce(p->'extras', '[]'::jsonb);
  v_pct      numeric          := coalesce((p->>'surcharge_pct')::numeric, 0);
  v_fix      integer          := coalesce((p->>'surcharge_fix')::integer, 0);
  v_type     booking_type     := coalesce(nullif(p->>'booking_type','')::booking_type, 'LEADOS');
  v_date     date             := coalesce(nullif(p->>'service_date','')::date, public.budapest_ma());
  v_kind     contract_kind    := nullif(p->>'contract_kind','')::contract_kind;
  v_ceg      uuid;
  v_szerz    uuid;
  v_calc     record;
  v_sorok    jsonb;
  v_ar       integer;
  v_szerz_sor boolean;
  v_csomagarak jsonb;
begin
  v_ceg := public.foglalas_cege(p);
  if v_ceg is not null then
    v_szerz := public.ceg_szerzodes_aktiv(v_ceg, v_date);
  end if;

  select * into v_calc
    from public.calc_service(v_package, v_category, v_scope, v_full, v_extras, v_pct, v_fix);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb),
         coalesce(sum(t.price_huf), 0)::integer,
         coalesce(bool_or(t.kind = 'PACKAGE' and t.name like '%(szerződéses%'), false)
    into v_sorok, v_ar, v_szerz_sor
    from public.foglalas_tetelek(v_package, v_category, v_scope, v_full, v_extras, v_pct, v_fix,
                                 v_ceg, v_kind, v_type, v_date) t;

  if v_szerz is not null and v_scope = 'TELJES' and not v_full then
    select coalesce(jsonb_object_agg(cp.package_id, cp.price_huf), '{}'::jsonb)
      into v_csomagarak
      from public.contract_prices cp
     where cp.contract_id = v_szerz
       and cp.size = case when v_category = 'SZEMELYAUTO' then 'NORMAL' else 'NAGY' end::contract_size
       and cp.kind = coalesce(v_kind, 'FLOTTA');
  end if;

  return jsonb_build_object(
    'price_huf',       v_ar,
    'work_minutes',    v_calc.work_minutes,
    'rest_minutes',    v_calc.rest_minutes,
    'requires_quote',  v_calc.requires_quote,
    'duration_known',  v_calc.duration_known,
    'lines',           v_sorok,
    'company_id',      v_ceg,
    'contract_id',     v_szerz,
    'contract_kind',   case when v_szerz is not null then coalesce(v_kind, 'FLOTTA'::contract_kind) end,
    'contract_price',  v_szerz_sor,
    'contract_prices', coalesce(v_csomagarak, '{}'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.vacation_list(p_from date DEFAULT public.budapest_ma())
 RETURNS TABLE(id uuid, staff_id uuid, staff_name text, from_day date, to_day date, note text, sajat boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select v.id, v.staff_id, s.full_name, v.from_day, v.to_day, v.note, v.staff_id = auth.uid()
    from public.staff_vacations v
    join public.staff s on s.id = v.staff_id
   where v.to_day >= p_from
     and (v.staff_id = auth.uid() or public.is_owner())
   order by v.from_day, s.full_name;
$function$;

CREATE OR REPLACE FUNCTION public.week_capacity(p_from date DEFAULT public.budapest_ma())
 RETURNS TABLE(nap date, hetfotol integer, parallel_slots integer, capacity_minutes integer, booked_minutes integer, free_minutes integer, load_pct numeric)
 LANGUAGE sql
 STABLE
AS $function$
  select
    d::date,
    (d::date - date_trunc('week', p_from)::date)::integer,
    c.parallel_slots, c.capacity_minutes, c.booked_minutes, c.free_minutes, c.load_pct
  from generate_series(
         date_trunc('week', p_from)::date,
         (date_trunc('week', p_from) + interval '6 days')::date,
         interval '1 day') d
  cross join lateral public.day_capacity(d::date) c;
$function$;

create or replace view public.v_pass_balance with (security_invoker=on) as
 SELECT p.id AS pass_id,
    p.customer_id,
    c.name AS customer_name,
    p.name AS pass_name,
    p.price_huf,
    p.valid_from,
    p.valid_until,
    p.active,
    p.valid_until < public.budapest_ma() AS lejart,
    p.valid_until - public.budapest_ma() AS napok_hatra,
    i.id AS pass_item_id,
    i.package_id,
    pk.code AS package_code,
    pk.name AS package_name,
    i.category,
    i.qty_total,
    COALESCE(u.felhasznalt, 0) AS qty_used,
    i.qty_total - COALESCE(u.felhasznalt, 0) AS qty_left
   FROM passes p
     JOIN customers c ON c.id = p.customer_id
     JOIN pass_items i ON i.pass_id = p.id
     LEFT JOIN packages pk ON pk.id = i.package_id
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS felhasznalt
           FROM pass_usages x
          WHERE x.pass_item_id = i.id) u ON true;

create or replace view public.v_standing_cars with (security_invoker=on) as
 SELECT b.id,
    COALESCE(b.arrived_at, b.drop_off_at, b.service_date::timestamp with time zone) AS arrived_at,
    b.deadline_at,
    public.budapest_ma() - COALESCE((b.arrived_at AT TIME ZONE 'Europe/Budapest')::date, b.service_date) AS days_in,
    (b.deadline_at AT TIME ZONE 'Europe/Budapest')::date - public.budapest_ma() AS days_left,
    ((b.deadline_at AT TIME ZONE 'Europe/Budapest')::date - public.budapest_ma()) <= 1 AS urgent,
    b.status,
    c.name AS customer_name,
    c.company_name,
    v.plate_raw,
    v.brand,
    v.model,
    p.name AS package_name,
    ( SELECT count(*) AS count
           FROM booking_tasks t
          WHERE t.booking_id = b.id) AS tasks_total,
    ( SELECT count(*) AS count
           FROM booking_tasks t
          WHERE t.booking_id = b.id AND t.done) AS tasks_done
   FROM bookings b
     JOIN customers c ON c.id = b.customer_id
     JOIN vehicles v ON v.id = b.vehicle_id
     LEFT JOIN packages p ON p.id = b.package_id
  WHERE (b.booking_type = 'TOBBNAPOS'::booking_type OR b.last_day > b.service_date) AND b.service_date <= public.budapest_ma() AND (b.status <> ALL (ARRAY['COMPLETED'::booking_status, 'REJECTED'::booking_status, 'CANCELLED_BY_CUSTOMER'::booking_status, 'CANCELLED_BY_SHOP'::booking_status, 'NO_SHOW'::booking_status]));

alter table public.passes alter column valid_from set default public.budapest_ma();
alter table public.contracts alter column valid_from set default public.budapest_ma();
