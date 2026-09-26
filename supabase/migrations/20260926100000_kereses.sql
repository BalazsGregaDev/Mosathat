-- =============================================================================
--  20260926100000_kereses.sql — azonnali keresés a foglalásfelvitelnél
-- =============================================================================
--  Telefonos foglalásnál az első pár karakternél el kell dőlnie, hogy ismerjük-e
--  az ügyfelet. Eddig csak TELJES rendszámra kerestünk (lookup_plate), ami csak
--  akkor talál, ha az egészet beírják, és csak rendszámra működik.
--
--  Cégeknél viszont a cégnév a belépési pont, magánszemélyeknél néha a név.
--  Ezért egy kereső, ami mindhárom mezőben néz — rendszám, név, cég —, és a
--  legjobb öt találatot adja vissza.
-- =============================================================================

-- Index a rendszám ELEJÉRE. Ez a leggyakoribb keresés, és erre a sima
-- B-tree index is működik (a `like 'ABC%'` használni tudja).
--
-- A névre és cégnévre menő `%szó%` keresés nem tud indexet használni, de
-- ez itt nem baj: egy autókozmetika évek alatt sem gyűjt annyi ügyfelet,
-- ahol ez mérhető lenne. Ha egyszer mégis lassú lesz, a pg_trgm kiterjesztés
-- egy sorral bekapcsolható — addig felesleges bonyolítás lenne, és a
-- böngészőben futó demó adatbázisban nem is érhető el.
create index if not exists vehicles_plate_prefix_idx
  on public.vehicles (plate_normalized text_pattern_ops);


-- Ékezet nélküli összehasonlítás.
--
-- Telefon közben senki nem gépel ékezetet: az "auto" nem találná meg az
-- "Autó Trans Kft."-t, a "kovacs" a "Kovács Péter"-t. A Postgres unaccent
-- kiterjesztése megoldaná, de az sem érhető el mindenhol — ez a pár soros
-- fordítótábla viszont igen, és pontosan a magyar ékezeteket kezeli.
create or replace function public.ekezettelen(t text)
returns text
language sql
immutable
as $$
  select lower(translate(coalesce(t, ''),
    'áéíóöőúüűÁÉÍÓÖŐÚÜŰ',
    'aeiooouuuaeiooouuu'));
$$;


create or replace function public.search_customers(p_q text, p_limit integer default 5)
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
  -- mikor járt itt utoljára ezzel az autóval, és mit kért
  utolso_datum   date,
  utolso_csomag  text,
  utolso_ar      integer
)
language sql
stable
as $$
  with q as (
    select
      trim(coalesce(p_q, ''))                                              as nyers,
      upper(regexp_replace(coalesce(p_q, ''), '[^A-Za-z0-9]', '', 'g'))    as rendszam
  )
  select
    v.id, v.plate_raw, v.brand, v.model, v.category, v.seats,
    c.id, c.name, c.phone, c.type, c.company_name,
    u.service_date, u.package_name, u.price_huf
  from public.vehicles v
  join public.customers c on c.id = v.customer_id
  cross join q
  -- az adott jármű utolsó lezárt munkája
  left join lateral (
    select h.service_date, h.package_name, h.price_huf
      from public.v_customer_history h
     where h.vehicle_id = v.id
     order by h.service_date desc
     limit 1
  ) u on true
  where q.nyers <> ''
    and c.anonymized_at is null
    and (
      (q.rendszam <> '' and v.plate_normalized like q.rendszam || '%')
      or v.plate_normalized like '%' || q.rendszam || '%'
      or public.ekezettelen(c.name)         like '%' || public.ekezettelen(q.nyers) || '%'
      or public.ekezettelen(c.company_name) like '%' || public.ekezettelen(q.nyers) || '%'
    )
  order by
    -- 1. a rendszám ELEJE egyezik — ez a leggyakoribb és legbiztosabb találat
    case when q.rendszam <> '' and v.plate_normalized like q.rendszam || '%' then 0 else 1 end,
    -- 2. aki mostanában járt itt, valószínűbb, mint aki két éve
    u.service_date desc nulls last,
    v.plate_raw
  limit greatest(coalesce(p_limit, 5), 1);
$$;

comment on function public.search_customers is
  'Rendszám, név és cégnév egyszerre. A rendszám eleji egyezés viszi az első helyet.';

grant execute on function public.ekezettelen(text)                    to authenticated;
grant execute on function public.search_customers(text, integer)      to authenticated;
