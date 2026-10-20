do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['bookings', 'booking_tasks', 'booking_items', 'customers', 'vehicles',
                           'day_order', 'staff_absences', 'company_sheet_rows', 'company_sheets'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime'
                      and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

create or replace function public.range_order(p_from date, p_to date)
returns table (day date, booking_id uuid, sorrend integer)
language sql
stable
as $$
  select d::date,
         (x->>'id')::uuid,
         (x->>'sorrend')::integer
    from generate_series(p_from, p_to, interval '1 day') d
    cross join lateral public.day_bookings(d::date) x
   where p_to >= p_from and p_to - p_from <= 42;
$$;

grant execute on function public.range_order(date, date) to authenticated;
