-- =============================================================================
--  20260929090000_kereses_mezonkent.sql
--  A keresés ott történik, ahova az ember gépel
-- =============================================================================
--  Eddig a foglalási űrlap tetején volt egy külön kereső mező, és alatta a
--  rendszám meg a név mezők. Két helyre kellett ugyanazt beírni: előbb a
--  keresőbe (hátha ismerjük), aztán — ha nem volt találat — a rendszám
--  mezőbe. Telefonálás közben ez egy fölösleges lépés minden új autónál.
--
--  Mostantól maga a Rendszám és a Név mező keres. Amit beírsz, az akkor is a
--  helyén marad, ha nem ismerjük az ügyfelet — nincs mit újra begépelni.
--
--  Ehhez a keresésnek tudnia kell, MELYIK mezőből jött:
--
--    RENDSZAM  csak a rendszámok közt keres. Az „AB" nem hozhatja fel
--              Abonyi Pétert — a rendszám mezőben rendszámot keresünk.
--    NEV       a személynevek és a cégnevek közt. A cégnév azért van benne,
--              mert egy céges ügyfélnél a keresett név gyakran a cégé, és a
--              kettő ugyanarra az ügyfélre mutat.
--    MIND      a régi viselkedés: rendszám, név és cégnév egyszerre. Ezt
--              használja minden más hívó.
--
--  A régi, kétparaméteres hívások változatlanul működnek: az új paraméternek
--  alapértéke van.
-- =============================================================================

drop function if exists public.search_customers(text, integer);

create or replace function public.search_customers(
  p_q     text,
  p_limit integer default 5,
  p_mezo  text    default 'MIND'    -- 'MIND' | 'RENDSZAM' | 'NEV'
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
      upper(regexp_replace(coalesce(p_q, ''), '[^A-Za-z0-9]', '', 'g'))    as rendszam,
      upper(coalesce(nullif(trim(p_mezo), ''), 'MIND'))                    as mezo
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
      -- rendszám mező: csak rendszám. Az eleji egyezés a fontos, de a
      -- közepére is illesztünk — a rendszámot sokan a végéről mondják be.
      (q.mezo = 'RENDSZAM' and q.rendszam <> ''
        and v.plate_normalized like '%' || q.rendszam || '%')

      -- név mező: személynév és cégnév
      or (q.mezo = 'NEV' and (
             public.ekezettelen(c.name)         like '%' || public.ekezettelen(q.nyers) || '%'
          or public.ekezettelen(c.company_name) like '%' || public.ekezettelen(q.nyers) || '%'))

      -- mindenhol (a régi viselkedés)
      or (q.mezo = 'MIND' and (
             (q.rendszam <> '' and v.plate_normalized like q.rendszam || '%')
          or v.plate_normalized like '%' || q.rendszam || '%'
          or public.ekezettelen(c.name)         like '%' || public.ekezettelen(q.nyers) || '%'
          or public.ekezettelen(c.company_name) like '%' || public.ekezettelen(q.nyers) || '%'))
    )
  order by
    -- 1. a rendszám ELEJE egyezik — ez a leggyakoribb és legbiztosabb találat
    case when q.rendszam <> '' and v.plate_normalized like q.rendszam || '%' then 0 else 1 end,
    -- 2. a név ELEJE egyezik — ugyanez névre
    case when public.ekezettelen(c.name) like public.ekezettelen(q.nyers) || '%'
           or public.ekezettelen(c.company_name) like public.ekezettelen(q.nyers) || '%'
         then 0 else 1 end,
    -- 3. aki mostanában járt itt, valószínűbb, mint aki két éve
    u.service_date desc nulls last,
    v.plate_raw
  limit greatest(coalesce(p_limit, 5), 1);
$$;

comment on function public.search_customers is
  'Ügyfél- és járműkeresés. A p_mezo mondja meg, honnan jött a beírt szöveg: '
  'RENDSZAM csak rendszámot, NEV nevet és cégnevet keres, MIND mindet.';

grant execute on function public.search_customers(text, integer, text) to authenticated;
