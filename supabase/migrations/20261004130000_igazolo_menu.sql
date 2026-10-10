create or replace function public.sheet_cegek(p_month date)
returns jsonb
language sql
stable
as $$
  with honap as (select date_trunc('month', p_month)::date as m),
  cegek as (
    select co.id, co.name, public.sheet_kell(co.id) as kell
      from public.companies co
     where public.sheet_kell(co.id)
        or exists (select 1 from public.company_sheets s where s.company_id = co.id)
  ),
  lap as (
    select s.* from public.company_sheets s, honap where s.month = honap.m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',        c.id,
      'name',      c.name,
      'kell',      c.kell,
      'szerzodes', public.ceg_szerzodes_aktiv(c.id) is not null,
      'berletes',  exists (select 1 from public.customers cu
                            where cu.company_id = c.id and cu.billing_kind = 'BERLETES'),
      'rows',      (select count(*) from public.company_sheet_rows r
                      join lap l on l.id = r.sheet_id where l.company_id = c.id),
      'unsigned',  (select count(*) from public.company_sheet_rows r
                      join lap l on l.id = r.sheet_id
                     where l.company_id = c.id and r.signature is null),
      'closed',    exists (select 1 from lap l where l.company_id = c.id and l.closed_at is not null),
      'open_before', (select count(*) from public.company_sheets s, honap
                       where s.company_id = c.id and s.closed_at is null and s.month < honap.m))
    order by c.kell desc, c.name), '[]'::jsonb)
  from cegek c;
$$;

grant execute on function public.sheet_cegek(date) to authenticated;
