create index if not exists vehicles_plate_prefix_idx
  on public.vehicles (plate_normalized text_pattern_ops);

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
    case when q.rendszam <> '' and v.plate_normalized like q.rendszam || '%' then 0 else 1 end,
    u.service_date desc nulls last,
    v.plate_raw
  limit greatest(coalesce(p_limit, 5), 1);
$$;

grant execute on function public.ekezettelen(text)                    to authenticated;
grant execute on function public.search_customers(text, integer)      to authenticated;
