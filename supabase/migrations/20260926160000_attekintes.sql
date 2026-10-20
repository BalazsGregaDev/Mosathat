create or replace function public.booking_ertek(b public.bookings)
returns integer
language sql
immutable
as $$
  select case
    when b.status in ('CANCELLED_BY_CUSTOMER','CANCELLED_BY_SHOP','NO_SHOW','REJECTED')
      then 0
    else coalesce(b.final_price_huf, b.estimated_price_huf)
  end;
$$;

create or replace function public.dashboard_summary(p_day date default current_date)
returns jsonb
language sql
stable
as $$
  with elo as (
    select b.*, public.booking_ertek(b) as ertek
      from public.bookings b
     where b.status not in ('CANCELLED_BY_CUSTOMER','CANCELLED_BY_SHOP','NO_SHOW','REJECTED')
  ),
  ma as (
    select count(*)::integer                              as db,
           coalesce(sum(ertek), 0)::integer               as bevetel,
           coalesce(sum(planned_duration_minutes), 0)::integer as percek,
           count(*) filter (where status = 'COMPLETED')::integer as kesz
      from elo where service_date = p_day
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
  gondok as (
    select coalesce(jsonb_agg(g order by g.suly desc), '[]'::jsonb) as lista
      from (
        select 'Idő nélkül' as cimke,
               count(*)::text || ' foglalásnak nincs időtartama — nem számít a kapacitásba' as szoveg,
               2 as suly
          from elo where service_date >= p_day and planned_duration_minutes = 0
         having count(*) > 0

        union all
        select 'Határidő',
               v.plate_raw || ' határideje ' ||
               case when b.deadline_at::date < p_day then 'lejárt'
                    when b.deadline_at::date = p_day then 'ma jár le'
                    else 'holnap jár le' end,
               case when b.deadline_at::date <= p_day then 3 else 2 end
          from elo b join public.vehicles v on v.id = b.vehicle_id
         where b.booking_type = 'TOBBNAPOS'
           and b.status <> 'COMPLETED'
           and b.deadline_at::date <= p_day + 1

        union all
        select 'Elérhetőség',
               count(*)::text || ' foglaláshoz nincs telefonszám',
               1
          from elo b join public.customers c on c.id = b.customer_id
         where b.service_date >= p_day and (c.phone is null or c.phone = '—')
         having count(*) > 0

        union all
        select 'Hiányzó adat',
               count(*)::text || ' szolgáltatásnak nincs ára a Szolgáltatások alatt',
               1
          from public.extras
         where active and price_huf is null and not requires_quote
         having count(*) > 0

        union all
        select 'Hiányzó adat',
               count(*)::text || ' Kívül/Belül munkához nincs időtartam',
               2
          from public.package_pricing
         where scope <> 'TELJES' and duration_minutes is null
         having count(*) > 0

        union all
        select 'Bérlet',
               b.customer_name || ' bérlete ' || (b.valid_until - p_day)::text || ' nap múlva lejár',
               1
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

create or replace function public.week_capacity(p_from date default current_date)
returns table (
  nap              date,
  hetfotol         integer,
  parallel_slots   integer,
  capacity_minutes integer,
  booked_minutes   integer,
  free_minutes     integer,
  load_pct         numeric
)
language sql
stable
as $$
  select
    d::date,
    (d::date - date_trunc('week', p_from)::date)::integer,
    c.parallel_slots, c.capacity_minutes, c.booked_minutes, c.free_minutes, c.load_pct
  from generate_series(
         date_trunc('week', p_from)::date,
         (date_trunc('week', p_from) + interval '6 days')::date,
         interval '1 day') d
  cross join lateral public.day_capacity(d::date) c;
$$;

grant execute on function public.dashboard_summary(date) to authenticated;
grant execute on function public.week_capacity(date)     to authenticated;
