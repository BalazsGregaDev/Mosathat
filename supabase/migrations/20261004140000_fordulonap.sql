alter table public.contracts
  add column if not exists cycle_day smallint not null default 1;

alter table public.contracts drop constraint if exists contracts_cycle_day_check;
alter table public.contracts
  add constraint contracts_cycle_day_check check (cycle_day between 1 and 28);

alter table public.company_sheets drop constraint if exists company_sheets_month_check;
alter table public.company_sheets drop constraint if exists company_sheets_kezdet_check;
alter table public.company_sheets
  add constraint company_sheets_kezdet_check check (extract(day from month) between 1 and 28);

create or replace view public.v_contracts
with (security_invoker = on) as
select
  ct.id,
  ct.company_id,
  co.name                                    as company_name,
  coalesce(ct.customer_id,
           (select c.id from public.customers c
             where c.company_id = ct.company_id order by c.created_at limit 1)) as customer_id,
  coalesce((select c.name from public.customers c where c.id = ct.customer_id), co.name)
                                             as customer_name,
  coalesce(ct.tax_number, co.tax_number)     as tax_number,
  ct.pickup_delivery,
  ct.pickup_delivery_fee_huf,
  ct.valid_from,
  ct.valid_until,
  ct.active,
  ct.notes,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'package_id',   cp.package_id,
             'package_code', pk.code,
             'package_name', pk.name,
             'size',         cp.size,
             'kind',         cp.kind,
             'price_huf',    cp.price_huf,
             'tier',         case when pk.code = 'START' then 'NORMAL' else 'PREMIUM' end)
           order by cp.kind, pk.sort_order, cp.size)
      from public.contract_prices cp
      join public.packages pk on pk.id = cp.package_id
     where cp.contract_id = ct.id
  ), '[]'::jsonb) as prices,
  (select count(*)::integer from public.customers c where c.company_id = ct.company_id) as ugyfelek,
  (select count(*)::integer from public.vehicles v
     join public.customers c on c.id = v.customer_id
    where c.company_id = ct.company_id)       as jarmuvek,
  ct.cycle_day
from public.contracts ct
join public.companies co on co.id = ct.company_id;

create or replace function public.ceg_fordulonap(p_company uuid)
returns integer
language sql
stable
as $$
  select coalesce(
    (select ct.cycle_day from public.contracts ct
      where ct.id = public.ceg_szerzodes_aktiv(p_company)),
    (select ct.cycle_day from public.contracts ct
      where ct.company_id = p_company
      order by ct.active desc, ct.valid_from desc, ct.created_at desc limit 1),
    1)::integer;
$$;

create or replace function public.sheet_idoszak(p_company uuid, p_nap date)
returns date
language sql
stable
as $$
  with f as (select public.ceg_fordulonap(p_company) as n)
  select case
    when extract(day from p_nap) >= f.n
      then (date_trunc('month', p_nap) + (f.n - 1) * interval '1 day')::date
    else (date_trunc('month', p_nap) - interval '1 month' + (f.n - 1) * interval '1 day')::date
  end
  from f;
$$;

create or replace function public.sheet_kezdet(p_company uuid, p_month date)
returns date
language sql
stable
as $$
  select (date_trunc('month', p_month)
          + (public.ceg_fordulonap(p_company) - 1) * interval '1 day')::date;
$$;

create or replace function public.sheet_veg(p_kezdet date)
returns date
language sql
immutable
as $$ select (p_kezdet + interval '1 month' - interval '1 day')::date $$;

create or replace function public.sheet_idoszak_nev(p_kezdet date)
returns text
language sql
immutable
as $$
  select case when extract(day from p_kezdet) = 1
    then to_char(p_kezdet, 'YYYY. MM.')
    else to_char(p_kezdet, 'YYYY.MM.DD.') || '–' || to_char(public.sheet_veg(p_kezdet), 'MM.DD.')
  end;
$$;

create or replace function public.sheet_feloldas(p_company uuid, p_month date)
returns date
language sql
stable
as $$
  with cel as (
    select case when extract(day from p_month) = 1
                then public.sheet_kezdet(p_company, p_month)
                else public.sheet_idoszak(p_company, p_month) end as k
  )
  select coalesce(
    (select s.month from public.company_sheets s
      where s.company_id = p_company and s.month = p_month),
    (select s.month from public.company_sheets s, cel
      where s.company_id = p_company and s.month = cel.k),
    (select s.month from public.company_sheets s
      where s.company_id = p_company and extract(day from p_month) = 1
        and date_trunc('month', s.month) = date_trunc('month', p_month)
      order by s.month desc limit 1),
    (select k from cel));
$$;

create or replace function public.contracts_fordulonap_ellenoriz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lapok text;
begin
  if not new.active then return new; end if;
  if tg_op = 'UPDATE' and new.cycle_day = old.cycle_day then return new; end if;

  select string_agg(public.sheet_idoszak_nev(s.month), ', ' order by s.month)
    into v_lapok
    from public.company_sheets s
   where s.company_id = new.company_id
     and s.closed_at is null
     and extract(day from s.month) <> new.cycle_day
     and exists (select 1 from public.company_sheet_rows r where r.sheet_id = s.id);

  if v_lapok is not null then
    raise exception 'A fordulónap csak akkor változtatható, ha a cég nyitott igazolólapjai le vannak zárva: %', v_lapok
      using hint = 'Zárd le ezeket a lapokat (Igazolólap → Hónap lezárása), utána mentsd újra a szerződést.';
  end if;

  delete from public.company_sheets s
   where s.company_id = new.company_id
     and s.closed_at is null
     and extract(day from s.month) <> new.cycle_day
     and not exists (select 1 from public.company_sheet_rows r where r.sheet_id = s.id);

  return new;
end;
$$;

drop trigger if exists contracts_fordulonap_ellenoriz on public.contracts;
create trigger contracts_fordulonap_ellenoriz
  before insert or update of cycle_day, active on public.contracts
  for each row execute function public.contracts_fordulonap_ellenoriz();

create or replace function public.save_contract(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid := nullif(p->>'id','')::uuid;
  v_ceg     uuid := nullif(p->>'company_id','')::uuid;
  v_ugyfel  uuid := nullif(p->>'customer_id','')::uuid;
  v_kulcs   text;
  r         jsonb;
  v_csomag  uuid;
  v_csomagok uuid[];
  v_meret   contract_size;
  v_fajta   contract_kind;
  v_ar      integer;
  v_hozom   boolean := coalesce((p->>'pickup_delivery')::boolean, false);
  v_fordulo integer := nullif(p->>'cycle_day', '')::integer;
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;
  if v_fordulo is not null and (v_fordulo < 1 or v_fordulo > 28) then
    raise exception 'A fordulónap 1 és 28 között lehet.';
  end if;

  if v_ceg is null and nullif(trim(p->>'company_name'), '') is not null then
    v_kulcs := public.ceg_kulcs(p->>'company_name');
    select id into v_ceg from public.companies where name_key = v_kulcs;
    if v_ceg is null then
      insert into public.companies (name, name_key) values (trim(p->>'company_name'), v_kulcs)
      returning id into v_ceg;
    end if;
  end if;

  if v_ceg is null and v_ugyfel is not null then
    select company_id into v_ceg from public.customers where id = v_ugyfel;
    if v_ceg is null then
      update public.customers set company_name = name where id = v_ugyfel
      returning company_id into v_ceg;
    end if;
  end if;

  if v_ceg is null and v_id is not null then
    select company_id into v_ceg from public.contracts where id = v_id;
  end if;

  if v_ceg is null then
    raise exception 'Válaszd ki, melyik céggel szerződtek.';
  end if;

  if nullif(trim(p->>'tax_number'), '') is not null then
    update public.companies set tax_number = trim(p->>'tax_number') where id = v_ceg;
  end if;

  if v_id is null then
    if exists (select 1 from public.contracts where company_id = v_ceg and active) then
      raise exception 'Ennek a cégnek már van élő szerződése. Azt kell szerkeszteni.';
    end if;
    insert into public.contracts (company_id, customer_id, tax_number, pickup_delivery,
                                  pickup_delivery_fee_huf, valid_until, notes, cycle_day)
    values (v_ceg, v_ugyfel,
            nullif(trim(p->>'tax_number'), ''),
            v_hozom,
            case when v_hozom then nullif(p->>'pickup_delivery_fee_huf','')::integer end,
            nullif(p->>'valid_until','')::date,
            nullif(trim(p->>'notes'), ''),
            coalesce(v_fordulo, 1))
    returning id into v_id;
  else
    update public.contracts
       set company_id      = v_ceg,
           tax_number      = nullif(trim(p->>'tax_number'), ''),
           pickup_delivery = v_hozom,
           pickup_delivery_fee_huf =
             case when v_hozom then nullif(p->>'pickup_delivery_fee_huf','')::integer end,
           valid_until     = nullif(p->>'valid_until','')::date,
           notes           = nullif(trim(p->>'notes'), ''),
           cycle_day       = coalesce(v_fordulo, cycle_day),
           updated_at      = now()
     where id = v_id;
    if not found then raise exception 'Nincs ilyen szerződés.'; end if;
  end if;

  delete from public.contract_prices where contract_id = v_id;

  for r in select * from jsonb_array_elements(coalesce(p->'prices', '[]'::jsonb))
  loop
    v_ar := nullif(r->>'price_huf', '')::integer;
    continue when v_ar is null or v_ar <= 0;

    v_meret := (r->>'size')::contract_size;
    v_fajta := coalesce(nullif(r->>'kind', '')::contract_kind, 'FLOTTA');

    v_csomag := coalesce(
      nullif(r->>'package_id', '')::uuid,
      (select id from public.packages where code = upper(r->>'package_code')));

    if v_csomag is not null then
      v_csomagok := array[v_csomag];
    elsif r->>'tier' = 'NORMAL' then
      v_csomagok := array(select id from public.packages where code = 'START');
    elsif r->>'tier' = 'PREMIUM' then
      v_csomagok := array(select id from public.packages where code in ('PREMIUM', 'ELIT'));
    else
      raise exception 'Az árnál hiányzik, melyik csomagra szól.';
    end if;

    insert into public.contract_prices (contract_id, package_id, size, kind, price_huf)
    select v_id, x, v_meret, v_fajta, v_ar from unnest(v_csomagok) x
    on conflict (contract_id, package_id, size, kind) do update set price_huf = excluded.price_huf;
  end loop;

  perform public.ceg_szamlazas_frissit(v_ceg);
  return v_id;
end;
$$;
grant execute on function public.save_contract(jsonb) to authenticated;

create or replace function public.sheet_row_save(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid := nullif(p->>'id', '')::uuid;
  v_booking uuid := nullif(p->>'booking_id', '')::uuid;
  v_ceg     uuid := nullif(p->>'company_id', '')::uuid;
  v_nap     date := nullif(p->>'day', '')::date;
  v_kezdet  date;
  v_lap     uuid;
  v_zarva   timestamptz;
  v_regi_ceg   uuid;
  v_regi_zarva timestamptz;
  v_alairas text := nullif(p->>'signature', '');
begin
  if public.my_role() is null then
    raise exception 'Ehhez be kell jelentkezni.' using errcode = '42501';
  end if;
  if v_nap is null then
    raise exception 'Add meg a dátumot.';
  end if;
  if v_alairas is not null and length(v_alairas) > 400000 then
    raise exception 'Az aláírás képe túl nagy.';
  end if;

  if v_id is null and v_booking is not null then
    select r.id into v_id from public.company_sheet_rows r where r.booking_id = v_booking;
  end if;
  if v_id is not null then
    select s.company_id, s.closed_at into v_regi_ceg, v_regi_zarva
      from public.company_sheet_rows r join public.company_sheets s on s.id = r.sheet_id
     where r.id = v_id;
    if not found then
      raise exception 'Nincs ilyen sor.';
    end if;
    if v_regi_zarva is not null then
      raise exception 'Ez a lap le van zárva, már nem írható.'
        using hint = 'Ha mégis javítani kell, a tulajdonos újranyithatja.';
    end if;
    v_ceg := coalesce(v_ceg, v_regi_ceg);
  end if;

  if v_ceg is null and v_booking is not null then
    select c.company_id into v_ceg
      from public.bookings b join public.customers c on c.id = b.customer_id
     where b.id = v_booking;
  end if;
  if v_ceg is null then
    raise exception 'Ehhez a foglaláshoz nem tartozik cég, ezért igazolólap sem.';
  end if;

  v_kezdet := public.sheet_idoszak(v_ceg, v_nap);
  insert into public.company_sheets (company_id, month)
  values (v_ceg, v_kezdet)
  on conflict (company_id, month) do nothing;
  select s.id, s.closed_at into v_lap, v_zarva
    from public.company_sheets s where s.company_id = v_ceg and s.month = v_kezdet;
  if v_zarva is not null then
    raise exception 'A % lap le van zárva.', public.sheet_idoszak_nev(v_kezdet)
      using hint = 'Ha mégis bele kell írni, a tulajdonos újranyithatja.';
  end if;

  if v_id is null then
    insert into public.company_sheet_rows
      (sheet_id, booking_id, day, plate, km, net_huf, name, extra, signature, signed_at, created_by)
    values (v_lap, v_booking, v_nap,
            nullif(trim(p->>'plate'), ''),
            nullif(p->>'km', '')::integer,
            nullif(p->>'net_huf', '')::integer,
            nullif(trim(p->>'name'), ''),
            coalesce(p->'extra', '{}'::jsonb),
            v_alairas,
            case when v_alairas is not null then now() end,
            auth.uid())
    returning id into v_id;
  else
    update public.company_sheet_rows
       set sheet_id = v_lap,
           day      = v_nap,
           plate    = nullif(trim(p->>'plate'), ''),
           km       = nullif(p->>'km', '')::integer,
           net_huf  = nullif(p->>'net_huf', '')::integer,
           name     = nullif(trim(p->>'name'), ''),
           extra    = coalesce(p->'extra', extra),
           signature = case when p ? 'signature' then v_alairas else signature end,
           signed_at = case when p ? 'signature'
                            then case when v_alairas is null then null else now() end
                            else signed_at end,
           updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;
grant execute on function public.sheet_row_save(jsonb) to authenticated;

create or replace function public.sheet_close(p_company uuid, p_month date)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_kezdet date := public.sheet_feloldas(p_company, p_month);
begin
  if not public.can_edit_customers() then
    raise exception 'A lapot a tulajdonos zárja le.' using errcode = '42501';
  end if;
  insert into public.company_sheets (company_id, month, closed_at, closed_by, frozen)
  values (p_company, v_kezdet, now(), auth.uid(), public.sheet_pillanatkep(p_company))
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
   where company_id = p_company and month = public.sheet_feloldas(p_company, p_month);
end;
$$;

create or replace function public.sheet_detail(p_company uuid, p_month date)
returns jsonb
language sql
stable
as $$
  with kezdet as (select public.sheet_feloldas(p_company, p_month) as k),
  lap as (
    select s.* from public.company_sheets s, kezdet
     where s.company_id = p_company and s.month = kezdet.k
  ),
  kep as (
    select coalesce(
      (select l.frozen from lap l where l.closed_at is not null and l.frozen is not null),
      public.sheet_pillanatkep(p_company)) as k
  )
  select jsonb_build_object(
    'company', (select jsonb_build_object('id', co.id, 'name', co.name, 'tax_number', co.tax_number)
                  from public.companies co where co.id = p_company),
    'month',        (select date_trunc('month', k)::date from kezdet),
    'period_start', (select k from kezdet),
    'period_end',   (select public.sheet_veg(k) from kezdet),
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
                'month', date_trunc('month', s.month)::date,
                'start', s.month,
                'end',   public.sheet_veg(s.month),
                'closed', s.closed_at is not null,
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
                          and s.month = public.sheet_idoszak(c.company_id, coalesce(r.day, b.last_day))
                          and s.closed_at is not null and s.frozen is not null),
                      public.sheet_oszlopok(c.company_id)),
    'closed',       exists (select 1 from public.company_sheets s
                             where s.company_id = c.company_id
                               and s.month = public.sheet_idoszak(c.company_id, coalesce(r.day, b.last_day))
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

create or replace function public.sheet_cegek(p_month date)
returns jsonb
language sql
stable
as $$
  with cegek as (
    select co.id, co.name, public.sheet_kell(co.id) as kell,
           public.sheet_feloldas(co.id, p_month) as kezdet
      from public.companies co
     where public.sheet_kell(co.id)
        or exists (select 1 from public.company_sheets s where s.company_id = co.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',           c.id,
      'name',         c.name,
      'kell',         c.kell,
      'szerzodes',    public.ceg_szerzodes_aktiv(c.id) is not null,
      'berletes',     exists (select 1 from public.customers cu
                               where cu.company_id = c.id and cu.billing_kind = 'BERLETES'),
      'period_start', c.kezdet,
      'period_end',   public.sheet_veg(c.kezdet),
      'rows',      (select count(*) from public.company_sheet_rows r
                      join public.company_sheets s on s.id = r.sheet_id
                     where s.company_id = c.id and s.month = c.kezdet),
      'unsigned',  (select count(*) from public.company_sheet_rows r
                      join public.company_sheets s on s.id = r.sheet_id
                     where s.company_id = c.id and s.month = c.kezdet and r.signature is null),
      'closed',    exists (select 1 from public.company_sheets s
                            where s.company_id = c.id and s.month = c.kezdet and s.closed_at is not null),
      'open_before', (select count(*) from public.company_sheets s
                       where s.company_id = c.id and s.closed_at is null and s.month < c.kezdet))
    order by c.kell desc, c.name), '[]'::jsonb)
  from cegek c;
$$;

grant execute on function public.ceg_fordulonap(uuid)          to authenticated;
grant execute on function public.sheet_idoszak(uuid, date)      to authenticated;
grant execute on function public.sheet_kezdet(uuid, date)       to authenticated;
grant execute on function public.sheet_veg(date)                to authenticated;
grant execute on function public.sheet_idoszak_nev(date)        to authenticated;
grant execute on function public.sheet_feloldas(uuid, date)     to authenticated;
grant execute on function public.sheet_detail(uuid, date)       to authenticated;
grant execute on function public.sheet_for_booking(uuid)        to authenticated;
grant execute on function public.sheet_close(uuid, date)        to authenticated;
grant execute on function public.sheet_reopen(uuid, date)       to authenticated;
grant execute on function public.sheet_cegek(date)              to authenticated;
