-- =============================================================================
--  20260926150000_ugyfelek.sql — az Ügyfelek képernyő adatai
-- =============================================================================
--  Egy oldal, két rendezés. Ugyanaz az adat — ügyfél, jármű, foglalások —,
--  csak más a lista sora. A műhelyben a belépési pont szinte mindig a
--  rendszám, cégeknél viszont a cégnév; ezért kell mindkettő.
--
--  Amit a soron látni kell, az nem a nyers adat, hanem a történet: hányszor
--  járt itt, mennyit költött, mikor volt utoljára, milyen sűrűn jár. Ezt az
--  adatbázis számolja ki, nem a felület — így a szám mindenhol ugyanaz.
-- =============================================================================

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
  -- Átlagos költés: a lezárt munkák átlaga, nem a teljes összeg osztva.
  case when coalesce(t.latogatas,0) > 0
       then (t.osszesen / t.latogatas)::integer end as atlag,
  -- Milyen sűrűn jár: az első és az utolsó látogatás közti idő elosztva a
  -- látogatások közti szakaszok számával. Kevesebb mint két látogatásnál
  -- nincs értelme, ezért ott NULL.
  case when coalesce(t.latogatas,0) > 1
       then ((t.utolso - t.elso) / (t.latogatas - 1))::integer end as atlag_napok,
  t.kedvenc_csomag
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
  t.utolso_csomag
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


-- Szűrés ugyanazzal a logikával, mint a foglalásfelvitel keresője:
-- rendszám, név és cégnév egyszerre, ékezet nélkül is.

create or replace function public.list_customers(p_q text default '', p_limit integer default 100)
returns setof public.v_customer_summary
language sql
stable
as $$
  select s.* from public.v_customer_summary s
   where coalesce(trim(p_q), '') = ''
      or public.ekezettelen(s.name)         like '%' || public.ekezettelen(p_q) || '%'
      or public.ekezettelen(s.company_name) like '%' || public.ekezettelen(p_q) || '%'
      or s.phone like '%' || p_q || '%'
      or exists (
        select 1 from public.vehicles v
         where v.customer_id = s.id
           and v.plate_normalized like
               '%' || upper(regexp_replace(p_q, '[^A-Za-z0-9]', '', 'g')) || '%')
   order by s.utolso desc nulls last, s.name
   limit greatest(coalesce(p_limit, 100), 1);
$$;

create or replace function public.list_vehicles(p_q text default '', p_limit integer default 100)
returns setof public.v_vehicle_summary
language sql
stable
as $$
  select s.* from public.v_vehicle_summary s
   where coalesce(trim(p_q), '') = ''
      or s.plate_normalized like
         '%' || upper(regexp_replace(p_q, '[^A-Za-z0-9]', '', 'g')) || '%'
      or public.ekezettelen(s.customer_name) like '%' || public.ekezettelen(p_q) || '%'
      or public.ekezettelen(s.company_name)  like '%' || public.ekezettelen(p_q) || '%'
      or public.ekezettelen(coalesce(s.brand,'') || ' ' || coalesce(s.model,''))
         like '%' || public.ekezettelen(p_q) || '%'
   order by s.utolso desc nulls last, s.plate_raw
   limit greatest(coalesce(p_limit, 100), 1);
$$;

grant execute on function public.list_customers(text, integer) to authenticated;
grant execute on function public.list_vehicles(text, integer)  to authenticated;
