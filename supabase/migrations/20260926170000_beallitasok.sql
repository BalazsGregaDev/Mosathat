-- =============================================================================
--  20260926170000_beallitasok.sql — a Beállítások képernyő
-- =============================================================================
--  Három időréteg van, és ezek NEM ugyanazok:
--
--    Nyitvatartás   – amit a weboldal kiír, és amikor az ügyfél jöhet
--    Munkaidő       – amikor ténylegesen dolgozunk. A KAPACITÁS ebből számol.
--    Szünetek       – az ebédszünet, ami kiveszi a közepét
--
--  A munkaidő korábban kezdődik, mint a nyitvatartás: nyolckor már dolgozunk,
--  de kilencre nyitunk. Ha a kapacitás a nyitvatartásból számolna, minden nap
--  egy órával kevesebbet mutatna a valóságnál.
-- =============================================================================

create or replace view public.v_opening
with (security_invoker = on) as
select
  d.weekday,
  case d.weekday
    when 1 then 'Hétfő' when 2 then 'Kedd' when 3 then 'Szerda' when 4 then 'Csütörtök'
    when 5 then 'Péntek' when 6 then 'Szombat' else 'Vasárnap' end as nev,
  bh.opens, bh.closes, coalesce(bh.closed, true) as business_closed,
  wh.starts, wh.ends,  coalesce(wh.closed, true) as work_closed,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', bw.id, 'starts', bw.starts,
                                        'ends', bw.ends, 'label', bw.label)
                     order by bw.starts)
      from public.break_windows bw where bw.weekday = d.weekday
  ), '[]'::jsonb) as breaks
from (select generate_series(1, 7) as weekday) d
left join public.business_hours bh on bh.weekday = d.weekday
left join public.working_hours  wh on wh.weekday = d.weekday;


-- Egy nap teljes beállítása egy hívásban: nyitvatartás, munkaidő, szünetek.
-- Külön mentve könnyen félresiklana — a szünet kikerülhetne egy olyan napra,
-- ami közben zárva lett.
create or replace function public.save_day_hours(p jsonb)
returns void
language plpgsql
volatile
as $$
declare
  v_wd smallint := (p->>'weekday')::smallint;
  r    jsonb;
begin
  insert into public.business_hours (weekday, opens, closes, closed)
  values (v_wd, nullif(p->>'opens','')::time, nullif(p->>'closes','')::time,
          coalesce((p->>'business_closed')::boolean, false))
  on conflict (weekday) do update
    set opens = excluded.opens, closes = excluded.closes, closed = excluded.closed;

  insert into public.working_hours (weekday, starts, ends, closed)
  values (v_wd, nullif(p->>'starts','')::time, nullif(p->>'ends','')::time,
          coalesce((p->>'work_closed')::boolean, false))
  on conflict (weekday) do update
    set starts = excluded.starts, ends = excluded.ends, closed = excluded.closed;

  -- A szünetek teljesen újraíródnak: a felület a nap MOSTANI állapotát küldi.
  delete from public.break_windows where weekday = v_wd;
  for r in select * from jsonb_array_elements(coalesce(p->'breaks', '[]'::jsonb))
  loop
    if nullif(r->>'starts','') is not null and nullif(r->>'ends','') is not null then
      insert into public.break_windows (weekday, starts, ends, label)
      values (v_wd, (r->>'starts')::time, (r->>'ends')::time,
              coalesce(nullif(r->>'label',''), 'Szünet'));
    end if;
  end loop;
end;
$$;


create or replace function public.save_shop_settings(p jsonb)
returns void
language sql
volatile
as $$
  insert into public.shop_settings (
    id, drop_off_from, default_parallel_slots, default_travel_minutes,
    pass_validity_kind, pass_validity_value, updated_at)
  values (
    true,
    coalesce(nullif(p->>'drop_off_from','')::time, '07:15'),
    greatest(coalesce((p->>'default_parallel_slots')::integer, 2), 1),
    greatest(coalesce((p->>'default_travel_minutes')::integer, 20), 0),
    coalesce(nullif(p->>'pass_validity_kind','')::validity_kind, 'EV'),
    coalesce(nullif(p->>'pass_validity_value',''), '1'),
    now())
  on conflict (id) do update set
    drop_off_from          = excluded.drop_off_from,
    default_parallel_slots = excluded.default_parallel_slots,
    default_travel_minutes = excluded.default_travel_minutes,
    pass_validity_kind     = excluded.pass_validity_kind,
    pass_validity_value    = excluded.pass_validity_value,
    updated_at             = now();
$$;


-- Kivételnapok: ledolgozós szombat, ünnep körüli szabadnap.
-- Mindkét irányban működik — rendkívüli nyitva és rendkívüli zárva.
create or replace function public.save_day_override(p jsonb)
returns void
language sql
volatile
as $$
  insert into public.day_overrides (day, closed, opens, closes, work_starts, work_ends,
                                    parallel_slots, note)
  values (
    (p->>'day')::date,
    coalesce((p->>'closed')::boolean, false),
    nullif(p->>'opens','')::time,
    nullif(p->>'closes','')::time,
    nullif(p->>'work_starts','')::time,
    nullif(p->>'work_ends','')::time,
    nullif(p->>'parallel_slots','')::integer,
    nullif(p->>'note',''))
  on conflict (day) do update set
    closed = excluded.closed, opens = excluded.opens, closes = excluded.closes,
    work_starts = excluded.work_starts, work_ends = excluded.work_ends,
    parallel_slots = excluded.parallel_slots, note = excluded.note;
$$;

create or replace function public.delete_day_override(p_day date)
returns void
language sql
volatile
as $$
  delete from public.day_overrides where day = p_day;
$$;


grant execute on function public.save_day_hours(jsonb)        to authenticated;
grant execute on function public.save_shop_settings(jsonb)    to authenticated;
grant execute on function public.save_day_override(jsonb)     to authenticated;
grant execute on function public.delete_day_override(date)    to authenticated;
