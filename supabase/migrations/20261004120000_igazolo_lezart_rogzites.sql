alter table public.company_sheets
  add column if not exists frozen jsonb;

create or replace function public.sheet_pillanatkep(p_company uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'columns',     public.sheet_oszlopok(p_company),
    'footer_text', (select s.footer_text from public.company_sheet_settings s
                     where s.company_id = p_company),
    'prices',      coalesce((
                     select v.prices from public.v_contracts v
                      where v.id = public.ceg_szerzodes_aktiv(p_company)), '[]'::jsonb));
$$;

update public.company_sheets
   set frozen = public.sheet_pillanatkep(company_id)
 where closed_at is not null and frozen is null;

create or replace function public.sheet_close(p_company uuid, p_month date)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_honap date := date_trunc('month', p_month)::date;
begin
  if not public.can_edit_customers() then
    raise exception 'A lapot a tulajdonos zárja le.' using errcode = '42501';
  end if;
  insert into public.company_sheets (company_id, month, closed_at, closed_by, frozen)
  values (p_company, v_honap, now(), auth.uid(), public.sheet_pillanatkep(p_company))
  on conflict (company_id, month) do update
    set closed_at = coalesce(company_sheets.closed_at, now()),
        closed_by = coalesce(company_sheets.closed_by, auth.uid()),
        frozen    = case when company_sheets.closed_at is null
                         then excluded.frozen else company_sheets.frozen end;
end;
$$;

create or replace function public.sheet_reopen(p_company uuid, p_month date)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.can_edit_customers() then
    raise exception 'A lezárt lapot a tulajdonos nyithatja újra.' using errcode = '42501';
  end if;
  update public.company_sheets
     set closed_at = null, closed_by = null, frozen = null
   where company_id = p_company and month = date_trunc('month', p_month)::date;
end;
$$;

create or replace function public.sheet_detail(p_company uuid, p_month date)
returns jsonb
language sql
stable
as $$
  with honap as (select date_trunc('month', p_month)::date as m),
  lap as (
    select s.* from public.company_sheets s, honap
     where s.company_id = p_company and s.month = honap.m
  ),
  kep as (
    select coalesce(
      (select l.frozen from lap l where l.closed_at is not null and l.frozen is not null),
      public.sheet_pillanatkep(p_company)) as k
  )
  select jsonb_build_object(
    'company', (select jsonb_build_object('id', co.id, 'name', co.name, 'tax_number', co.tax_number)
                  from public.companies co where co.id = p_company),
    'month',   (select m from honap),
    'sheet',   (select jsonb_build_object(
                  'id', l.id, 'closed_at', l.closed_at,
                  'closed_by_name', (select st.full_name from public.staff st where st.id = l.closed_by))
                  from lap l),
    'columns',     (select k->'columns' from kep),
    'footer_text', (select k->>'footer_text' from kep),
    'prices',      (select coalesce(k->'prices', '[]'::jsonb) from kep),
    'rows',    coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', r.id, 'booking_id', r.booking_id, 'day', r.day, 'plate', r.plate,
                'km', r.km, 'net_huf', r.net_huf, 'name', r.name, 'extra', r.extra,
                'signature', r.signature, 'signed_at', r.signed_at)
              order by r.day, r.created_at)
         from public.company_sheet_rows r join lap l on l.id = r.sheet_id), '[]'::jsonb),
    'months',  coalesce((
       select jsonb_agg(jsonb_build_object(
                'month', s.month, 'closed', s.closed_at is not null,
                'rows', (select count(*) from public.company_sheet_rows r where r.sheet_id = s.id))
              order by s.month desc)
         from public.company_sheets s where s.company_id = p_company), '[]'::jsonb)
  );
$$;

create or replace function public.sheet_for_booking(p_booking_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'company_id',   c.company_id,
    'company_name', co.name,
    'kell',         public.sheet_kell(c.company_id),
    'columns',      coalesce(
                      (select s.frozen->'columns' from public.company_sheets s
                        where s.company_id = c.company_id
                          and s.month = date_trunc('month', coalesce(r.day, b.last_day))::date
                          and s.closed_at is not null and s.frozen is not null),
                      public.sheet_oszlopok(c.company_id)),
    'closed',       exists (select 1 from public.company_sheets s
                             where s.company_id = c.company_id
                               and s.month = date_trunc('month', coalesce(r.day, b.last_day))::date
                               and s.closed_at is not null),
    'row', coalesce(
      (select jsonb_build_object(
                'id', r.id, 'booking_id', r.booking_id, 'day', r.day, 'plate', r.plate,
                'km', r.km, 'net_huf', r.net_huf, 'name', r.name, 'extra', r.extra,
                'signature', r.signature, 'signed_at', r.signed_at)
         where r.id is not null),
      jsonb_build_object(
        'id', null, 'booking_id', b.id, 'day', b.last_day, 'plate', v.plate_raw,
        'km', null,
        'net_huf', round(coalesce(b.final_price_huf, b.estimated_price_huf) / 1.27)::integer,
        'name', nullif(c.name, 'Névtelen'), 'extra', '{}'::jsonb,
        'signature', null, 'signed_at', null))
  )
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  join public.vehicles  v on v.id = b.vehicle_id
  left join public.companies co on co.id = c.company_id
  left join public.company_sheet_rows r on r.booking_id = b.id
  where b.id = p_booking_id;
$$;

grant execute on function public.sheet_pillanatkep(uuid)    to authenticated;
grant execute on function public.sheet_detail(uuid, date)   to authenticated;
grant execute on function public.sheet_for_booking(uuid)    to authenticated;
grant execute on function public.sheet_close(uuid, date)    to authenticated;
grant execute on function public.sheet_reopen(uuid, date)   to authenticated;
