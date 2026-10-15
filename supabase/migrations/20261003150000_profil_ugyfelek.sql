create or replace function public.absence_list(p_from date default current_date)
returns table (
  id         uuid,
  staff_id   uuid,
  staff_name text,
  day        date,
  kind       absence_kind,
  starts     time,
  ends       time,
  note       text,
  sajat      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.staff_id, s.full_name, a.day, a.kind, a.starts, a.ends, a.note,
         a.staff_id = auth.uid()
    from public.staff_absences a
    join public.staff s on s.id = a.staff_id
   where a.day >= p_from
     and (a.staff_id = auth.uid() or public.is_owner())
   order by a.day, public.tavollet_tol(a), s.full_name;
$$;

grant execute on function public.absence_list(date) to authenticated;

create or replace function public.create_extra(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_nev text := nullif(trim(p->>'name'), '');
  v_id  uuid;
begin
  if not public.is_owner() then
    raise exception 'Új szolgáltatást a tulajdonos vesz fel.' using errcode = '42501';
  end if;
  if v_nev is null then
    raise exception 'Add meg a szolgáltatás nevét.';
  end if;
  if exists (select 1 from public.extras e
              where public.ekezettelen(e.name) = public.ekezettelen(v_nev)) then
    raise exception 'Ilyen nevű szolgáltatás már van: %', v_nev
      using hint = 'Ha inaktív, a listában újra bekapcsolható.';
  end if;

  insert into public.extras (name, description, price_huf, work_minutes, sort_order, active)
  values (v_nev,
          nullif(trim(p->>'description'), ''),
          nullif(p->>'price_huf', '')::integer,
          nullif(p->>'work_minutes', '')::integer,
          coalesce((select max(sort_order) from public.extras), 0) + 10,
          true)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_extra(jsonb) to authenticated;

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
  (select count(*) from public.vehicles v where v.customer_id = c.id)::integer as jarmuvek,
  coalesce(t.latogatas, 0)      as latogatas,
  coalesce(t.osszesen, 0)       as osszesen,
  t.utolso,
  case when coalesce(t.latogatas,0) > 0
       then (t.osszesen / t.latogatas)::integer end as atlag,
  case when coalesce(t.latogatas,0) > 1
       then ((t.utolso - t.elso) / (t.latogatas - 1))::integer end as atlag_napok,
  t.kedvenc_csomag,
  coalesce((select array_agg(v.plate_raw order by v.created_at, v.plate_raw)
              from public.vehicles v where v.customer_id = c.id), '{}') as rendszamok
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

create or replace view public.v_vehicle_summary
with (security_invoker = on) as
select
  v.id,
  v.plate_raw,
  v.plate_normalized,
  v.brand,
  v.model,
  v.category,
  v.seats,
  v.notes,
  c.id            as customer_id,
  c.name          as customer_name,
  c.phone         as customer_phone,
  c.company_name,
  c.billing_kind,
  coalesce(t.latogatas, 0) as latogatas,
  t.utolso,
  t.utolso_csomag,
  c.company_id,
  v.contract_kind,
  (c.company_id is not null
   and public.ceg_szerzodes_aktiv(c.company_id) is not null) as szerzodes
from public.vehicles v
join public.customers c on c.id = v.customer_id
left join lateral (
  select count(*)::integer as latogatas,
         max(b.service_date) as utolso,
         (select p.name from public.bookings b2
            left join public.packages p on p.id = b2.package_id
           where b2.vehicle_id = v.id and b2.status = 'COMPLETED'
           order by b2.service_date desc limit 1) as utolso_csomag
    from public.bookings b
   where b.vehicle_id = v.id and b.status = 'COMPLETED'
) t on true
where c.anonymized_at is null;

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
    'ugyfelek',    (select count(*)::integer from public.customers c
                     where c.company_id = co.id and c.anonymized_at is null),
    'jarmuvek',    (select count(*)::integer from public.v_vehicle_summary s where s.company_id = co.id),
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
         from public.v_vehicle_summary s where s.company_id = co.id), '[]'::jsonb)
  )
  from talalt co
  left join public.contracts ct on ct.id = public.ceg_szerzodes_aktiv(co.id)
  order by co.name
  limit greatest(coalesce(p_limit, 100), 1);
$$;

grant execute on function public.list_companies(text, integer) to authenticated;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['day_order', 'staff_absences'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime'
                      and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
