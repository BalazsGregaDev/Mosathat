alter table public.contracts
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

update public.customers c
   set company_name = c.name
 where c.company_id is null
   and exists (select 1 from public.contracts ct where ct.customer_id = c.id);

update public.contracts ct
   set company_id = c.company_id
  from public.customers c
 where c.id = ct.customer_id
   and ct.company_id is null;

alter table public.contracts alter column customer_id drop not null;
alter table public.contracts drop constraint if exists contracts_customer_id_key;

create unique index if not exists contracts_ceg_aktiv
  on public.contracts (company_id) where active;

drop trigger if exists contracts_kizaras_trg on public.contracts;

drop view if exists public.v_contracts;

alter table public.contract_prices
  add column if not exists package_id uuid references public.packages(id) on delete cascade;
alter table public.contract_prices
  add column if not exists kind contract_kind not null default 'FLOTTA';

update public.contract_prices cp
   set package_id = (select id from public.packages where code =
                       case when cp.tier::text = 'NORMAL' then 'START' else 'PREMIUM' end)
 where cp.package_id is null;

insert into public.contract_prices (contract_id, tier, size, price_huf, package_id, kind)
select cp.contract_id, cp.tier, cp.size, cp.price_huf,
       (select id from public.packages where code = 'ELIT'), cp.kind
  from public.contract_prices cp
 where cp.tier::text = 'PREMIUM'
   and not exists (
     select 1 from public.contract_prices x
      where x.contract_id = cp.contract_id and x.size = cp.size and x.kind = cp.kind
        and x.package_id = (select id from public.packages where code = 'ELIT'));

alter table public.contract_prices drop constraint if exists contract_prices_contract_id_tier_size_key;
alter table public.contract_prices drop column if exists tier;
alter table public.contract_prices alter column package_id set not null;

create unique index if not exists contract_prices_egyedi
  on public.contract_prices (contract_id, package_id, size, kind);

drop function if exists public.customer_price(uuid, uuid, vehicle_category);

alter table public.bookings add column if not exists contract_kind contract_kind;
alter table public.vehicles add column if not exists contract_kind contract_kind;

create or replace function public.ceg_szerzodes_aktiv(p_company uuid, p_nap date default current_date)
returns uuid
language sql
stable
as $$
  select ct.id from public.contracts ct
   where ct.company_id = p_company
     and ct.active
     and (ct.valid_until is null or ct.valid_until >= p_nap)
   order by ct.created_at desc
   limit 1;
$$;

create or replace function public.ceg_szamlazas_frissit(p_company uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_van boolean := public.ceg_szerzodes_aktiv(p_company) is not null;
begin
  update public.customers c
     set billing_kind = case
           when c.billing_kind = 'BERLETES' then c.billing_kind
           when v_van then 'SZERZODESES'::billing_kind
           else 'NORMAL'::billing_kind end
   where c.company_id = p_company;
end;
$$;

create or replace function public.customers_szamlazas_cegbol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.billing_kind = 'BERLETES' then return new; end if;
  new.billing_kind := case
    when new.company_id is not null and public.ceg_szerzodes_aktiv(new.company_id) is not null
      then 'SZERZODESES'::billing_kind
    else 'NORMAL'::billing_kind end;
  return new;
end;
$$;

drop trigger if exists customers_szinkron_szamlazas on public.customers;
create trigger customers_szinkron_szamlazas
  before insert or update of company_name, company_id on public.customers
  for each row execute function public.customers_szamlazas_cegbol();

do $$
declare r record;
begin
  for r in select distinct company_id from public.contracts where company_id is not null loop
    perform public.ceg_szamlazas_frissit(r.company_id);
  end loop;
end $$;

create view public.v_contracts
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
    where c.company_id = ct.company_id)       as jarmuvek
from public.contracts ct
join public.companies co on co.id = ct.company_id;

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
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
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
                                  pickup_delivery_fee_huf, valid_until, notes)
    values (v_ceg, v_ugyfel,
            nullif(trim(p->>'tax_number'), ''),
            v_hozom,
            case when v_hozom then nullif(p->>'pickup_delivery_fee_huf','')::integer end,
            nullif(p->>'valid_until','')::date,
            nullif(trim(p->>'notes'), ''))
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

create or replace function public.foglalas_tetelek(
  p_package_id   uuid,
  p_category     vehicle_category,
  p_scope        booking_scope,
  p_full         boolean,
  p_extras       jsonb,
  p_pct          numeric,
  p_fix          integer,
  p_company_id   uuid,
  p_kind         contract_kind,
  p_type         booking_type,
  p_date         date
)
returns table (
  kind           booking_item_kind,
  ref_id         uuid,
  name           text,
  quantity       numeric,
  unit_price_huf integer,
  price_huf      integer,
  work_minutes   integer,
  sort_order     integer
)
language plpgsql
stable
as $$
declare
  v_szerz    uuid;
  v_szerz_ar integer;
  v_fuvar    integer;
  v_meret    contract_size := case when p_category = 'SZEMELYAUTO' then 'NORMAL' else 'NAGY' end;
  v_pp       record;
  v_fs       record;
  v_alap     integer := 0;
  v_sort     integer := 0;
  v_vegso    integer;
  v_csomag_ar integer;
  r          record;
  v_qty      numeric;
  v_line     integer;
begin
  if p_company_id is not null then
    v_szerz := public.ceg_szerzodes_aktiv(p_company_id, coalesce(p_date, current_date));
  end if;

  if v_szerz is not null and p_package_id is not null and not coalesce(p_full, false)
     and coalesce(p_scope, 'TELJES') = 'TELJES' then
    select cp.price_huf into v_szerz_ar
      from public.contract_prices cp
     where cp.contract_id = v_szerz and cp.package_id = p_package_id
       and cp.size = v_meret and cp.kind = coalesce(p_kind, 'FLOTTA');
  end if;

  if p_package_id is not null then
    select pp.price_huf, pp.duration_minutes into v_pp
      from public.package_pricing pp
     where pp.package_id = p_package_id and pp.category = p_category
       and pp.scope = coalesce(p_scope, 'TELJES');

    v_csomag_ar := coalesce(v_szerz_ar, v_pp.price_huf, 0);

    kind := 'PACKAGE'; ref_id := p_package_id;
    select pk.name
             || case when coalesce(p_scope, 'TELJES') = 'TELJES' then '' else ' — ' || p_scope::text end
             || case when v_szerz_ar is not null
                     then case when coalesce(p_kind, 'FLOTTA') = 'FLOTTA'
                               then ' (szerződéses, flotta)' else ' (szerződéses, saját autó)' end
                     else '' end
      into name from public.packages pk where pk.id = p_package_id;
    quantity := 1; unit_price_huf := v_csomag_ar; price_huf := v_csomag_ar;
    work_minutes := coalesce(v_pp.duration_minutes, 0); sort_order := v_sort;
    return next;

    v_alap := v_alap + v_csomag_ar;
    v_sort := v_sort + 1;
  end if;

  if coalesce(p_full, false) then
    select fp.price_huf, fp.extra_work_minutes into v_fs
      from public.full_service_pricing fp
     where fp.package_id = p_package_id and fp.category = p_category;

    kind := 'FULL_SERVICE'; ref_id := null;
    name := 'Full Service (Csomag+Kárpit/Bőrtisztítás)';
    quantity := 1;
    unit_price_huf := coalesce(v_fs.price_huf, 0) - v_alap;
    price_huf := unit_price_huf;
    work_minutes := coalesce(v_fs.extra_work_minutes, 45);
    sort_order := v_sort;
    return next;

    v_alap := coalesce(v_fs.price_huf, v_alap);
    v_sort := v_sort + 1;
  end if;

  for r in
    select e.*, coalesce((x->>'quantity')::numeric, 1) as qty
      from jsonb_array_elements(coalesce(p_extras, '[]'::jsonb)) as x
      join public.extras e on e.id = (x->>'extra_id')::uuid
     order by e.sort_order
  loop
    v_qty  := greatest(r.qty, 1);
    v_line := case
                when r.requires_quote or r.price_huf is null then 0
                when r.price_unit = 'ALKALOM' then r.price_huf
                else (r.price_huf * v_qty)::integer
              end;

    kind := 'EXTRA'; ref_id := r.id; name := r.name; quantity := v_qty;
    unit_price_huf := coalesce(r.price_huf, 0); price_huf := v_line;
    work_minutes := coalesce(r.work_minutes, 0)
                    * case when r.duration_unit = 'ALKALOM' then 1 else v_qty end;
    sort_order := v_sort;
    return next;

    v_alap := v_alap + v_line;
    v_sort := v_sort + 1;
  end loop;

  v_vegso := v_alap;
  if p_pct is not null and p_pct <> 0 then
    v_vegso := round(v_vegso * (1 + p_pct / 100.0))::integer;
  end if;
  v_vegso := v_vegso + coalesce(p_fix, 0);

  if v_vegso <> v_alap then
    kind := 'SURCHARGE'; ref_id := null;
    name := case when coalesce(p_pct, 0) <> 0 and coalesce(p_fix, 0) <> 0
                   then 'Felár (' || p_pct || '% + fix)'
                 when coalesce(p_pct, 0) <> 0 then 'Felár (' || p_pct || '%)'
                 else 'Felár' end;
    quantity := 1; unit_price_huf := v_vegso - v_alap; price_huf := v_vegso - v_alap;
    work_minutes := 0; sort_order := v_sort;
    return next;
    v_sort := v_sort + 1;
  end if;

  if p_type = 'HOZOMVISZEM' and v_szerz is not null then
    select ct.pickup_delivery_fee_huf into v_fuvar
      from public.contracts ct
     where ct.id = v_szerz and ct.pickup_delivery;
    if coalesce(v_fuvar, 0) > 0 then
      kind := 'FUVAR'; ref_id := null; name := 'Hozom-viszem fuvar';
      quantity := 1; unit_price_huf := v_fuvar; price_huf := v_fuvar;
      work_minutes := 0; sort_order := v_sort;
      return next;
    end if;
  end if;
end;
$$;

grant execute on function public.foglalas_tetelek(
  uuid, vehicle_category, booking_scope, boolean, jsonb, numeric, integer,
  uuid, contract_kind, booking_type, date) to authenticated;

create or replace function public.quote_booking(p jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  v_category vehicle_category := coalesce(nullif(p->>'category','')::vehicle_category, 'SZEMELYAUTO');
  v_scope    booking_scope    := coalesce(nullif(p->>'scope','')::booking_scope, 'TELJES');
  v_package  uuid             := nullif(p->>'package_id','')::uuid;
  v_full     boolean          := coalesce((p->>'full_service')::boolean, false);
  v_extras   jsonb            := coalesce(p->'extras', '[]'::jsonb);
  v_pct      numeric          := coalesce((p->>'surcharge_pct')::numeric, 0);
  v_fix      integer          := coalesce((p->>'surcharge_fix')::integer, 0);
  v_type     booking_type     := coalesce(nullif(p->>'booking_type','')::booking_type, 'LEADOS');
  v_date     date             := coalesce(nullif(p->>'service_date','')::date, current_date);
  v_kind     contract_kind    := nullif(p->>'contract_kind','')::contract_kind;
  v_ceg      uuid;
  v_szerz    uuid;
  v_calc     record;
  v_sorok    jsonb;
  v_ar       integer;
  v_szerz_sor boolean;
  v_csomagarak jsonb;
begin
  v_ceg := public.foglalas_cege(p);
  if v_ceg is not null then
    v_szerz := public.ceg_szerzodes_aktiv(v_ceg, v_date);
  end if;

  select * into v_calc
    from public.calc_service(v_package, v_category, v_scope, v_full, v_extras, v_pct, v_fix);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.sort_order), '[]'::jsonb),
         coalesce(sum(t.price_huf), 0)::integer,
         coalesce(bool_or(t.kind = 'PACKAGE' and t.name like '%(szerződéses%'), false)
    into v_sorok, v_ar, v_szerz_sor
    from public.foglalas_tetelek(v_package, v_category, v_scope, v_full, v_extras, v_pct, v_fix,
                                 v_ceg, v_kind, v_type, v_date) t;

  if v_szerz is not null and v_scope = 'TELJES' and not v_full then
    select coalesce(jsonb_object_agg(cp.package_id, cp.price_huf), '{}'::jsonb)
      into v_csomagarak
      from public.contract_prices cp
     where cp.contract_id = v_szerz
       and cp.size = case when v_category = 'SZEMELYAUTO' then 'NORMAL' else 'NAGY' end::contract_size
       and cp.kind = coalesce(v_kind, 'FLOTTA');
  end if;

  return jsonb_build_object(
    'price_huf',       v_ar,
    'work_minutes',    v_calc.work_minutes,
    'rest_minutes',    v_calc.rest_minutes,
    'requires_quote',  v_calc.requires_quote,
    'duration_known',  v_calc.duration_known,
    'lines',           v_sorok,
    'company_id',      v_ceg,
    'contract_id',     v_szerz,
    'contract_kind',   case when v_szerz is not null then coalesce(v_kind, 'FLOTTA'::contract_kind) end,
    'contract_price',  v_szerz_sor,
    'contract_prices', coalesce(v_csomagarak, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.quote_booking(jsonb) to authenticated;

create or replace function public.foglalas_cege(p jsonb)
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(p->>'company_id','')::uuid,
    (select co.id from public.companies co
      where co.name_key = public.ceg_kulcs(nullif(trim(p->>'company_name'), ''))),
    (select c.company_id from public.customers c where c.id = nullif(p->>'customer_id','')::uuid),
    (select c.company_id from public.vehicles v join public.customers c on c.id = v.customer_id
      where v.id = nullif(p->>'vehicle_id','')::uuid)
  );
$$;

grant execute on function public.foglalas_cege(jsonb) to authenticated;

create or replace function public.search_companies(p_q text, p_limit integer default 6)
returns table (
  id         uuid,
  name       text,
  tax_number text,
  ugyfelek   integer,
  jarmuvek   integer,
  szerzodes  boolean
)
language sql
stable
as $$
  with q as (select public.ceg_kulcs(p_q) as kulcs, public.ekezettelen(trim(coalesce(p_q, ''))) as nyers)
  select co.id, co.name, co.tax_number,
         (select count(*)::integer from public.customers c where c.company_id = co.id),
         (select count(*)::integer from public.vehicles v
            join public.customers c on c.id = v.customer_id where c.company_id = co.id),
         exists (select 1 from public.contracts ct where ct.company_id = co.id and ct.active)
    from public.companies co, q
   where q.nyers <> ''
     and (   (q.kulcs is not null and co.name_key like '%' || q.kulcs || '%')
          or public.ekezettelen(co.name) like '%' || q.nyers || '%')
   order by
     case when q.kulcs is not null and co.name_key like q.kulcs || '%' then 0 else 1 end,
     co.name
   limit greatest(coalesce(p_limit, 6), 1);
$$;

grant execute on function public.search_companies(text, integer) to authenticated;

grant execute on function public.search_companies(text, integer) to authenticated;
