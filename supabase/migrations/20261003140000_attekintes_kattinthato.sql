create or replace function public.dashboard_adat(p_day date default current_date)
returns jsonb
language sql
stable
as $$
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
$$;

grant execute on function public.dashboard_adat(date) to authenticated;
