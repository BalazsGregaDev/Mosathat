create type staff_role as enum ('SUPERADMIN', 'STAFF');

create type customer_type as enum ('MAGAN', 'CEG');

create type vehicle_category as enum ('SZEMELYAUTO', 'SUV', 'KISBUSZ');

create type service_area as enum ('KULSO', 'BELSO');

create type booking_scope as enum ('KULSO', 'BELSO', 'TELJES');

create type booking_type as enum ('VAROS', 'LEADOS', 'TOBBNAPOS', 'HOZOMVISZEM');

create type booking_status as enum (
  'REQUESTED',
  'CONFIRMED',
  'REJECTED',
  'ARRIVED',
  'IN_PROGRESS',
  'READY',
  'COMPLETED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_SHOP',
  'NO_SHOW'
);

create type booking_source as enum ('TELEFON', 'ONLINE', 'SZEMELYES', 'MESSENGER');

create type booking_item_kind as enum ('PACKAGE', 'FULL_SERVICE', 'EXTRA', 'SURCHARGE');

create type measure_unit as enum ('ALKALOM', 'DB', 'AJTO', 'ULES', 'LITER');

create type surcharge_kind as enum ('SZAZALEK', 'FIX');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.staff (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text        not null,
  role        staff_role  not null default 'STAFF',
  active      boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger staff_updated_at
  before update on public.staff
  for each row execute function public.set_updated_at();

create table public.customers (
  id                     uuid primary key default gen_random_uuid(),
  type                   customer_type not null default 'MAGAN',
  name                   text not null,

  phone                  text not null,
  email                  text,

  company_name           text,
  tax_number             text,

  default_travel_minutes integer,

  notes                  text,
  internal_notes         text,

  anonymized_at          timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create index customers_phone_idx on public.customers (phone);
create index customers_name_idx  on public.customers (lower(name));

create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers(id) on delete cascade,

  plate_raw        text not null,

  plate_normalized text generated always as (
    upper(regexp_replace(plate_raw, '[^A-Za-z0-9]', '', 'g'))
  ) stored,

  plate_country    text not null default 'HU',

  brand            text,
  model            text,
  year             integer,
  category         vehicle_category not null,

  seats            integer,

  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

create index vehicles_plate_idx    on public.vehicles (plate_normalized);
create index vehicles_customer_idx on public.vehicles (customer_id);

create table public.packages (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  description         text,

  includes_package_id uuid references public.packages(id),

  sort_order          integer not null default 0,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger packages_updated_at
  before update on public.packages
  for each row execute function public.set_updated_at();

create table public.package_items (
  id                uuid primary key default gen_random_uuid(),
  package_id        uuid not null references public.packages(id) on delete cascade,
  name              text not null,
  area              service_area not null,

  overrides_item_id uuid references public.package_items(id) on delete set null,

  sort_order        integer not null default 0,
  active            boolean not null default true
);

create index package_items_package_idx on public.package_items (package_id);

create table public.package_pricing (
  id               uuid primary key default gen_random_uuid(),
  package_id       uuid not null references public.packages(id) on delete cascade,
  category         vehicle_category not null,
  scope            booking_scope not null,

  price_huf        integer,

  duration_minutes integer,

  requires_quote   boolean not null default false,

  unique (package_id, category, scope)
);

create table public.full_service_pricing (
  id              uuid primary key default gen_random_uuid(),
  package_id      uuid not null references public.packages(id) on delete cascade,
  category        vehicle_category not null,
  price_huf       integer,
  included_seats  integer not null default 5,

  requires_quote  boolean not null default false,

  unique (package_id, category)
);

create or replace function public.resolve_package_items(p_package_id uuid)
returns table (name text, area service_area, sort_order integer)
language sql
stable
as $$
  with recursive chain as (
    select id, includes_package_id
      from public.packages
     where id = p_package_id

    union all

    select p.id, p.includes_package_id
      from public.packages p
      join chain c on p.id = c.includes_package_id
  ),
  items as (
    select pi.*
      from public.package_items pi
      join chain c on c.id = pi.package_id
     where pi.active
  )
  select i.name, i.area, i.sort_order
    from items i
   where not exists (
     select 1 from items o where o.overrides_item_id = i.id
   )
   order by i.area, i.sort_order;
$$;

create table public.extras (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  description          text,
  area                 service_area,

  price_huf            integer,
  price_unit           measure_unit not null default 'ALKALOM',

  work_minutes         integer,
  duration_unit        measure_unit not null default 'ALKALOM',

  rest_minutes         integer not null default 0,

  recommends_overnight boolean not null default false,

  requires_quote       boolean not null default false,

  sort_order           integer not null default 0,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger extras_updated_at
  before update on public.extras
  for each row execute function public.set_updated_at();

create table public.surcharges (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  kind            surcharge_kind not null,

  default_value   numeric(8,2) not null,

  max_value       numeric(8,2),

  time_multiplier numeric(4,2) not null default 1.0,

  sort_order      integer not null default 0,
  active          boolean not null default true
);

create table public.business_hours (
  weekday smallint primary key check (weekday between 1 and 7),
  opens   time,
  closes  time,
  closed  boolean not null default false
);

create table public.working_hours (
  weekday smallint primary key check (weekday between 1 and 7),
  starts  time,
  ends    time,
  closed  boolean not null default false
);

create table public.break_windows (
  id      uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 7),
  starts  time not null,
  ends    time not null,
  label   text not null default 'Ebédszünet'
);

create table public.shop_settings (
  id                     boolean primary key default true check (id),

  drop_off_from          time not null default '07:15',

  default_parallel_slots integer not null default 2,

  default_travel_minutes integer not null default 20,

  updated_at             timestamptz not null default now()
);

create trigger shop_settings_updated_at
  before update on public.shop_settings
  for each row execute function public.set_updated_at();

create table public.day_overrides (
  day             date primary key,
  closed          boolean not null default false,
  opens           time,
  closes          time,
  work_starts     time,
  work_ends       time,
  parallel_slots  integer,
  note            text
);

create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id),
  vehicle_id     uuid not null references public.vehicles(id),

  booking_type   booking_type   not null,
  status         booking_status not null default 'CONFIRMED',
  source         booking_source not null default 'TELEFON',

  service_date   date not null,

  start_at       timestamptz,

  drop_off_at    timestamptz,
  pick_up_at     timestamptz,

  arrived_at     timestamptz,
  deadline_at    timestamptz,

  package_id     uuid references public.packages(id),
  scope          booking_scope not null default 'TELJES',
  full_service   boolean not null default false,

  planned_duration_minutes integer not null default 0,

  rest_minutes             integer not null default 0,

  actual_started_at        timestamptz,
  actual_finished_at       timestamptz,

  estimated_price_huf      integer not null default 0,
  final_price_huf          integer,
  price_adjustment_reason  text,

  notes                    text,
  internal_notes           text,

  moved_to_booking_id      uuid references public.bookings(id),

  created_by               uuid references public.staff(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint varos_needs_start
    check (booking_type <> 'VAROS' or start_at is not null),

  constraint tobbnapos_needs_deadline
    check (booking_type <> 'TOBBNAPOS' or deadline_at is not null)
);

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create index bookings_date_idx     on public.bookings (service_date);
create index bookings_status_idx   on public.bookings (status);
create index bookings_customer_idx on public.bookings (customer_id);
create index bookings_vehicle_idx  on public.bookings (vehicle_id);

create index bookings_tobbnapos_idx
  on public.bookings (deadline_at)
  where booking_type = 'TOBBNAPOS'
    and status not in ('COMPLETED', 'REJECTED', 'CANCELLED_BY_CUSTOMER',
                       'CANCELLED_BY_SHOP', 'NO_SHOW');

create table public.booking_items (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings(id) on delete cascade,
  kind              booking_item_kind not null,

  ref_id            uuid,

  name_snapshot     text not null,
  quantity          numeric(8,2) not null default 1,
  unit_price_huf    integer not null default 0,
  price_huf         integer not null default 0,
  work_minutes      integer not null default 0,
  sort_order        integer not null default 0
);

create index booking_items_booking_idx on public.booking_items (booking_id);

create table public.booking_tasks (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  name        text not null,
  area        service_area,
  sort_order  integer not null default 0,
  done        boolean not null default false,
  done_at     timestamptz,
  done_by     uuid references public.staff(id)
);

create index booking_tasks_booking_idx on public.booking_tasks (booking_id);

create table public.multiday_allocations (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  day        date not null,
  minutes    integer not null default 0,
  primary key (booking_id, day)
);

create table public.audit_log (
  id         bigserial primary key,
  staff_id   uuid references public.staff(id),
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_at_idx     on public.audit_log (at desc);

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.active
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.active and s.role = 'SUPERADMIN'
  );
$$;

alter table public.staff                enable row level security;
alter table public.customers            enable row level security;
alter table public.vehicles             enable row level security;
alter table public.packages             enable row level security;
alter table public.package_items        enable row level security;
alter table public.package_pricing      enable row level security;
alter table public.full_service_pricing enable row level security;
alter table public.extras               enable row level security;
alter table public.surcharges           enable row level security;
alter table public.business_hours       enable row level security;
alter table public.working_hours        enable row level security;
alter table public.break_windows        enable row level security;
alter table public.shop_settings        enable row level security;
alter table public.day_overrides        enable row level security;
alter table public.bookings             enable row level security;
alter table public.booking_items        enable row level security;
alter table public.booking_tasks        enable row level security;
alter table public.multiday_allocations enable row level security;
alter table public.audit_log            enable row level security;

create policy staff_select on public.staff
  for select using (public.is_staff());

create policy staff_write on public.staff
  for all using (public.is_superadmin()) with check (public.is_superadmin());

do $$
declare
  t text;
  tables text[] := array[
    'customers', 'vehicles', 'packages', 'package_items', 'package_pricing',
    'full_service_pricing', 'extras', 'surcharges', 'business_hours',
    'working_hours', 'break_windows', 'shop_settings', 'day_overrides',
    'bookings', 'booking_items', 'booking_tasks', 'multiday_allocations'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on public.%I for all using (public.is_staff()) with check (public.is_staff());',
      t || '_staff_all', t
    );
  end loop;
end
$$;

create policy audit_log_select on public.audit_log
  for select using (public.is_staff());

create policy audit_log_insert on public.audit_log
  for insert with check (public.is_staff());
