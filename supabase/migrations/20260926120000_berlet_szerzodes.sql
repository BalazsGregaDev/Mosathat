-- =============================================================================
--  20260926120000_berlet_szerzodes.sql — bérletek és szerződéses cégek
-- =============================================================================
--  Két külön üzleti konstrukció, és egy ügyfélnek CSAK AZ EGYIK lehet:
--
--  BÉRLET — magánszemély, az ügyfél nevére szól. Előre kifizetett alkalmak,
--  tetszőleges összetételben: "10 alkalom, ebből 8 Start és 2 Premium, tíz
--  Start áráért". Nincs két egyforma bérlet, ezért nincs bérlet-sablon sem:
--  minden bérlet a saját tételeivel és a saját árával jön létre.
--
--  SZERZŐDÉS — cég, fix Ft/autó árakkal. Legfeljebb négy ár: normál vagy
--  prémium csomag, normál vagy nagy méret. Nem mindegyiknél lesz mind a négy,
--  mert minden cég egyedi ajánlatot kap.
--
--  Miért nem a meglévő árazásba építettem bele? Mert a package_pricing a
--  LISTAÁR — az, amit a weboldal mutat. A szerződéses ár ettől külön él, és
--  egy áremelés nem írhatja felül a cégekkel kötött megállapodást.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1. Az ügyfél elszámolási módja
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'billing_kind') then
    create type billing_kind as enum ('NORMAL', 'BERLETES', 'SZERZODESES');
  end if;
end $$;

alter table public.customers
  add column if not exists billing_kind billing_kind not null default 'NORMAL';

comment on column public.customers.billing_kind is
  'NORMAL: listaáron fizet. BERLETES: van előre fizetett bérlete. '
  'SZERZODESES: cég, egyedi Ft/autó árakkal. A kettő kizárja egymást.';


-- -----------------------------------------------------------------------------
--  2. Bérletek
-- -----------------------------------------------------------------------------
--  A lejárat háromféleképpen adható meg a felületen — konkrét dátum, X év,
--  vagy X nap —, de a végeredmény mindig egy dátum. A számolást a
--  berlet_lejarat() végzi, hogy a felület és az adatbázis ne értelmezhesse
--  máshogy ugyanazt a beállítást.

create table if not exists public.passes (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers(id) on delete cascade,
  name         text not null,                  -- pl. "10 alkalmas vegyes"
  price_huf    integer not null default 0,     -- amit ténylegesen fizetett
  valid_from   date not null default current_date,
  valid_until  date not null,
  notes        text,
  active       boolean not null default true,
  created_by   uuid references public.staff(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists passes_customer_idx on public.passes (customer_id);

-- A bérlet tételei. Egy tétel = egy csomagból hány alkalom jár.
-- A package_id lehet NULL: az azt jelenti, hogy bármelyik csomagra váltható.
create table if not exists public.pass_items (
  id          uuid primary key default gen_random_uuid(),
  pass_id     uuid not null references public.passes(id) on delete cascade,
  package_id  uuid references public.packages(id),
  category    vehicle_category,               -- NULL: bármelyik méret
  qty_total   integer not null check (qty_total > 0),
  sort_order  integer not null default 0
);

create index if not exists pass_items_pass_idx on public.pass_items (pass_id);

-- A felhasználás KÜLÖN sorokban, nem egy csökkenő számlálóban.
--
-- Így egy lemondott foglalás felhasználása visszavonható, és utólag is
-- megmondható, melyik alkalmat mikor és melyik autóra használták el.
-- Egy csökkenő számláló ezt mind elveszítené.
create table if not exists public.pass_usages (
  id           uuid primary key default gen_random_uuid(),
  pass_item_id uuid not null references public.pass_items(id) on delete cascade,
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  used_at      timestamptz not null default now(),
  used_by      uuid references public.staff(id),
  unique (booking_id)     -- egy foglalás egy alkalmat fogyaszt
);

create index if not exists pass_usages_item_idx on public.pass_usages (pass_item_id);


-- -----------------------------------------------------------------------------
--  3. Szerződéses cégek
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'contract_tier') then
    create type contract_tier as enum ('NORMAL', 'PREMIUM');
  end if;
  if not exists (select 1 from pg_type where typname = 'contract_size') then
    create type contract_size as enum ('NORMAL', 'NAGY');
  end if;
end $$;

create table if not exists public.contracts (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers(id) on delete cascade,
  tax_number       text,
  pickup_delivery  boolean not null default false,  -- hozom-viszem jár-e
  valid_from       date not null default current_date,
  valid_until      date,                             -- NULL: határozatlan idejű
  notes            text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (customer_id)
);

-- Legfeljebb négy ár: csomagszint × méret. Nem kötelező mind a négy.
-- Az ár BRUTTÓ, mint a rendszerben mindenhol — a nettót a felület számolja.
create table if not exists public.contract_prices (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  tier        contract_tier not null,
  size        contract_size not null,
  price_huf   integer not null check (price_huf >= 0),
  unique (contract_id, tier, size)
);


-- -----------------------------------------------------------------------------
--  4. A kizárás: vagy bérlet, vagy szerződés
-- -----------------------------------------------------------------------------
--  Ezt nem a felületen kell megakadályozni. A felület elromolhat, egy import
--  megkerülheti — a szabály itt a helye.

create or replace function public.berlet_szerzodes_kizaras()
returns trigger
language plpgsql
as $$
declare
  v_kind billing_kind;
begin
  select billing_kind into v_kind from public.customers where id = new.customer_id;

  if tg_table_name = 'passes' and v_kind = 'SZERZODESES' then
    raise exception 'Ez az ügyfél szerződéses cég — nem kaphat bérletet is.';
  end if;
  if tg_table_name = 'contracts' and v_kind = 'BERLETES' then
    raise exception 'Ennek az ügyfélnek bérlete van — nem lehet egyszerre szerződéses is.';
  end if;

  -- A típust magától állítjuk be, hogy ne lehessen elfelejteni.
  update public.customers
     set billing_kind = (case when tg_table_name = 'passes' then 'BERLETES' else 'SZERZODESES' end)::billing_kind,
         updated_at = now()
   where id = new.customer_id
     and billing_kind = 'NORMAL';

  return new;
end;
$$;

drop trigger if exists passes_kizaras_trg on public.passes;
create trigger passes_kizaras_trg
  before insert on public.passes
  for each row execute function public.berlet_szerzodes_kizaras();

drop trigger if exists contracts_kizaras_trg on public.contracts;
create trigger contracts_kizaras_trg
  before insert on public.contracts
  for each row execute function public.berlet_szerzodes_kizaras();


-- -----------------------------------------------------------------------------
--  5. Lejárat kiszámolása
-- -----------------------------------------------------------------------------
--  Háromféle megadás, egy eredmény. A felület ugyanezt a függvényt hívja,
--  hogy előre megmutassa a dátumot, amit menteni fog.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'validity_kind') then
    create type validity_kind as enum ('DATUM', 'EV', 'NAP');
  end if;
end $$;

create or replace function public.berlet_lejarat(
  p_kind  validity_kind,
  p_value text,                       -- DATUM: '2027-03-01', EV/NAP: '1' / '90'
  p_from  date default current_date)
returns date
language sql
immutable
as $$
  select case p_kind
    when 'DATUM' then p_value::date
    when 'EV'    then (p_from + (coalesce(nullif(p_value,''),'1')::integer * interval '1 year'))::date
    when 'NAP'   then (p_from + (coalesce(nullif(p_value,''),'0')::integer * interval '1 day'))::date
  end;
$$;

-- A bérlet alapértelmezett érvényessége — a Beállítások menüpontból írható.
alter table public.shop_settings
  add column if not exists pass_validity_kind  validity_kind not null default 'EV',
  add column if not exists pass_validity_value text          not null default '1';


-- -----------------------------------------------------------------------------
--  6. Bérlet egyenlege
-- -----------------------------------------------------------------------------

create or replace view public.v_pass_balance
with (security_invoker = on) as
select
  p.id            as pass_id,
  p.customer_id,
  c.name          as customer_name,
  p.name          as pass_name,
  p.price_huf,
  p.valid_from,
  p.valid_until,
  p.active,
  (p.valid_until < current_date)                as lejart,
  (p.valid_until - current_date)                as napok_hatra,
  i.id            as pass_item_id,
  i.package_id,
  pk.code         as package_code,
  pk.name         as package_name,
  i.category,
  i.qty_total,
  coalesce(u.felhasznalt, 0)                    as qty_used,
  i.qty_total - coalesce(u.felhasznalt, 0)      as qty_left
from public.passes p
join public.customers c on c.id = p.customer_id
join public.pass_items i on i.pass_id = p.id
left join public.packages pk on pk.id = i.package_id
left join lateral (
  select count(*)::integer as felhasznalt
    from public.pass_usages x where x.pass_item_id = i.id
) u on true;

comment on view public.v_pass_balance is
  'Bérlet tételenként: mennyi volt, mennyi fogyott, mennyi maradt.';


-- -----------------------------------------------------------------------------
--  7. Bérlet létrehozása egy hívással
-- -----------------------------------------------------------------------------
--  Fej és tételek együtt, egy tranzakcióban — különben egy megszakadt kérés
--  után maradna egy bérlet nulla alkalommal.

create or replace function public.create_pass(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_id    uuid;
  v_from  date := coalesce(nullif(p->>'valid_from','')::date, current_date);
  v_until date;
  r       jsonb;
  v_sort  integer := 0;
begin
  -- A lejárat vagy kész dátumként jön, vagy módból + értékből számoljuk.
  v_until := coalesce(
    nullif(p->>'valid_until','')::date,
    public.berlet_lejarat(
      coalesce(nullif(p->>'validity_kind','')::validity_kind, 'EV'),
      coalesce(nullif(p->>'validity_value',''), '1'),
      v_from));

  insert into public.passes (customer_id, name, price_huf, valid_from, valid_until, notes, created_by)
  values (
    (p->>'customer_id')::uuid,
    coalesce(nullif(p->>'name',''), 'Bérlet'),
    coalesce((p->>'price_huf')::integer, 0),
    v_from, v_until,
    nullif(p->>'notes',''),
    (select s.id from public.staff s where s.id = auth.uid()))
  returning id into v_id;

  for r in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb))
  loop
    insert into public.pass_items (pass_id, package_id, category, qty_total, sort_order)
    values (
      v_id,
      nullif(r->>'package_id','')::uuid,
      nullif(r->>'category','')::vehicle_category,
      greatest(coalesce((r->>'qty_total')::integer, 1), 1),
      v_sort);
    v_sort := v_sort + 1;
  end loop;

  if v_sort = 0 then
    raise exception 'A bérletnek legalább egy tételt tartalmaznia kell.';
  end if;

  return v_id;
end;
$$;


-- -----------------------------------------------------------------------------
--  8. Alkalom felhasználása és visszavonása
-- -----------------------------------------------------------------------------
--  A felhasználás nem automatikus: az admin dönti el, hogy ezt a foglalást
--  bérletből vagy pénzért számoljuk el. Így egy tévedés is visszavonható.

create or replace function public.use_pass(p_booking_id uuid, p_pass_item_id uuid default null)
returns uuid       -- melyik tételből ment
language plpgsql
volatile
as $$
declare
  v_b    record;
  v_item uuid := p_pass_item_id;
begin
  select b.*, v.category into v_b
    from public.bookings b join public.vehicles v on v.id = b.vehicle_id
   where b.id = p_booking_id;
  if v_b is null then
    raise exception 'Nincs ilyen foglalás.';
  end if;

  -- Ha nem mondták meg, melyik tételből, megkeressük a legjobban illőt:
  -- pontos csomag- és méretegyezés előbb, aztán a szabadon felhasználható.
  if v_item is null then
    select b.pass_item_id into v_item
      from public.v_pass_balance b
     where b.customer_id = v_b.customer_id
       and b.active
       and not b.lejart
       and b.qty_left > 0
       and (b.package_id is null or b.package_id = v_b.package_id)
       and (b.category   is null or b.category   = v_b.category)
     order by (b.package_id is not null) desc, (b.category is not null) desc, b.valid_until
     limit 1;
  end if;

  if v_item is null then
    raise exception 'Nincs felhasználható alkalom ezen az ügyfélen.';
  end if;

  insert into public.pass_usages (pass_item_id, booking_id, used_by)
  values (v_item, p_booking_id, (select s.id from public.staff s where s.id = auth.uid()))
  on conflict (booking_id) do update set pass_item_id = excluded.pass_item_id;

  return v_item;
end;
$$;

create or replace function public.release_pass(p_booking_id uuid)
returns void
language sql
volatile
as $$
  delete from public.pass_usages where booking_id = p_booking_id;
$$;


-- -----------------------------------------------------------------------------
--  9. Mennyibe kerül ennek az ügyfélnek?
-- -----------------------------------------------------------------------------
--  A foglalási űrlap ezt hívja, miután tudja, ki az ügyfél és mit kér.
--  Ha szerződéses, a szerződéses ár jön. Ha bérletes és van szabad alkalma,
--  nulla — de megmondja, hogy bérletből megy.

create or replace function public.customer_price(
  p_customer_id uuid,
  p_package_id  uuid,
  p_category    vehicle_category)
returns table (
  mod          text,        -- 'LISTA' | 'SZERZODES' | 'BERLET'
  price_huf    integer,
  megjegyzes   text
)
language plpgsql
stable
as $$
declare
  v_kind billing_kind;
  v_ar   integer;
  v_tier contract_tier;
  v_size contract_size;
  v_left integer;
  v_pass text;
begin
  select billing_kind into v_kind from public.customers where id = p_customer_id;

  if v_kind = 'SZERZODESES' then
    -- A csomag "szintje": az Elit és a Premium prémiumnak számít, a Start normálnak.
    select case when pk.code = 'START' then 'NORMAL' else 'PREMIUM' end into v_tier
      from public.packages pk where pk.id = p_package_id;
    v_size := case when p_category = 'SZEMELYAUTO' then 'NORMAL' else 'NAGY' end;

    select cp.price_huf into v_ar
      from public.contract_prices cp
      join public.contracts ct on ct.id = cp.contract_id
     where ct.customer_id = p_customer_id
       and ct.active
       and (ct.valid_until is null or ct.valid_until >= current_date)
       and cp.tier = coalesce(v_tier, 'NORMAL')
       and cp.size = v_size;

    if v_ar is not null then
      mod := 'SZERZODES'; price_huf := v_ar;
      megjegyzes := 'Szerződéses ár'; return next; return;
    end if;
    mod := 'LISTA'; price_huf := null;
    megjegyzes := 'Szerződéses cég, de erre a csomag/méret párra nincs ár megadva';
    return next; return;
  end if;

  if v_kind = 'BERLETES' then
    select sum(b.qty_left)::integer, min(b.pass_name) into v_left, v_pass
      from public.v_pass_balance b
     where b.customer_id = p_customer_id
       and b.active and not b.lejart and b.qty_left > 0
       and (b.package_id is null or b.package_id = p_package_id)
       and (b.category   is null or b.category   = p_category);

    if coalesce(v_left, 0) > 0 then
      mod := 'BERLET'; price_huf := 0;
      megjegyzes := v_pass || ' — még ' || v_left || ' alkalom';
      return next; return;
    end if;
    mod := 'LISTA'; price_huf := null;
    megjegyzes := 'Bérletes ügyfél, de erre nincs szabad alkalma';
    return next; return;
  end if;

  mod := 'LISTA'; price_huf := null; megjegyzes := null; return next;
end;
$$;

comment on function public.customer_price is
  'Listaár, szerződéses ár vagy bérletes alkalom — egy helyen eldöntve.';


-- -----------------------------------------------------------------------------
--  10. Jogosultság
-- -----------------------------------------------------------------------------

alter table public.passes         enable row level security;
alter table public.pass_items     enable row level security;
alter table public.pass_usages    enable row level security;
alter table public.contracts      enable row level security;
alter table public.contract_prices enable row level security;

do $$
declare t text;
begin
  foreach t in array array['passes','pass_items','pass_usages','contracts','contract_prices']
  loop
    execute format($f$
      drop policy if exists %1$s_staff on public.%1$s;
      create policy %1$s_staff on public.%1$s
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t);
  end loop;
end $$;

grant execute on function public.create_pass(jsonb)                          to authenticated;
grant execute on function public.use_pass(uuid, uuid)                        to authenticated;
grant execute on function public.release_pass(uuid)                          to authenticated;
grant execute on function public.customer_price(uuid, uuid, vehicle_category) to authenticated;
grant execute on function public.berlet_lejarat(validity_kind, text, date)    to authenticated;
