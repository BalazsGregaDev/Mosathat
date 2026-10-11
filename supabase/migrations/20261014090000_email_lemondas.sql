do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end $$;

alter table public.shop_settings
  add column if not exists online_lemondas_ora integer not null default 24
    check (online_lemondas_ora between 0 and 168);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  kind        text not null check (kind in ('BOOKING_CONFIRMED')),
  channel     text not null default 'EMAIL' check (channel in ('EMAIL')),
  to_address  text not null,
  status      text not null default 'PENDING'
                check (status in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempts    integer not null default 0,
  last_error  text,
  provider_id text,
  locked_at   timestamptz,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_queue_idx
  on public.notifications (status, created_at);
create index if not exists notifications_booking_idx
  on public.notifications (booking_id);

create table if not exists public.cancel_tokens (
  token_hash  text primary key,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

create index if not exists cancel_tokens_booking_idx on public.cancel_tokens (booking_id);

alter table public.notifications enable row level security;
alter table public.cancel_tokens enable row level security;

revoke all on public.notifications from anon, authenticated;
revoke all on public.cancel_tokens from anon, authenticated;
grant select on public.notifications to authenticated;

drop policy if exists notifications_olvas on public.notifications;
create policy notifications_olvas on public.notifications
  for select using ((select public.is_staff()));

create or replace function public.foglalas_visszaigazolas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if new.status = 'CONFIRMED'
     and old.status = 'REQUESTED'
     and new.source = 'ONLINE' then
    select nullif(trim(c.email), '') into v_email
      from public.customers c
     where c.id = new.customer_id;
    if v_email is not null then
      insert into public.notifications (booking_id, kind, to_address)
      values (new.id, 'BOOKING_CONFIRMED', v_email);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_visszaigazolas_trg on public.bookings;
create trigger bookings_visszaigazolas_trg
  after update of status on public.bookings
  for each row execute function public.foglalas_visszaigazolas();

create or replace function public.foglalas_osszegzes(p_booking uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id',                       b.id,
    'service_date',             b.service_date,
    'booking_type',             b.booking_type,
    'status',                   b.status,
    'start_at',                 b.start_at,
    'drop_off_at',              b.drop_off_at,
    'pick_up_at',               b.pick_up_at,
    'planned_duration_minutes', b.planned_duration_minutes,
    'scope',                    b.scope,
    'full_service',             b.full_service,
    'full_service_nev',         (select bi.name_snapshot from public.booking_items bi
                                  where bi.booking_id = b.id and bi.kind = 'FULL_SERVICE'
                                  order by bi.sort_order limit 1),
    'estimated_price_huf',      b.estimated_price_huf,
    'notes',                    b.notes,
    'customer_name',            c.name,
    'plate_raw',                v.plate_raw,
    'brand',                    v.brand,
    'model',                    v.model,
    'category',                 v.category,
    'package_name',             p.name,
    'extras_summary',           (select string_agg(bi.name_snapshot, ', ' order by bi.sort_order)
                                   from public.booking_items bi
                                  where bi.booking_id = b.id and bi.kind = 'EXTRA'))
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    join public.vehicles  v on v.id = b.vehicle_id
    left join public.packages p on p.id = b.package_id
   where b.id = p_booking;
$$;

create or replace function public.lemondo_token_hash(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

create or replace function public.lemondo_link_mentes(p_booking uuid, p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Túl rövid lemondó kulcs.';
  end if;
  insert into public.cancel_tokens (token_hash, booking_id)
  values (public.lemondo_token_hash(p_token), p_booking);
end;
$$;

create or replace function public.lemondas_ertekel(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_status   booking_status;
  v_kezdes   timestamptz;
  v_ora      integer;
  v_hatarido timestamptz;
  v_allapot  text;
begin
  select b.status,
         coalesce(b.start_at, b.drop_off_at,
                  (b.service_date::timestamp at time zone 'Europe/Budapest'))
    into v_status, v_kezdes
    from public.bookings b
   where b.id = p_booking;

  if v_status is null then
    return jsonb_build_object('allapot', 'ISMERETLEN');
  end if;

  select coalesce((select s.online_lemondas_ora from public.shop_settings s limit 1), 24) into v_ora;
  v_hatarido := v_kezdes - make_interval(hours => v_ora);

  v_allapot := case
    when v_status = 'CANCELLED_BY_CUSTOMER'          then 'LEMONDVA'
    when v_status not in ('REQUESTED', 'CONFIRMED')  then 'NEM_LEMONDHATO'
    when now() > v_hatarido                          then 'LEJART'
    else 'LEMONDHATO'
  end;

  return jsonb_build_object(
    'allapot',      v_allapot,
    'statusz',      v_status,
    'kezdes',       v_kezdes,
    'hatarido',     v_hatarido,
    'lemondas_ora', v_ora,
    'lemondva',     (select max(t.used_at) from public.cancel_tokens t where t.booking_id = p_booking),
    'foglalas',     public.foglalas_osszegzes(p_booking));
end;
$$;

create or replace function public.lemondas_allapot(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_booking uuid;
begin
  select t.booking_id into v_booking
    from public.cancel_tokens t
   where t.token_hash = public.lemondo_token_hash(p_token);
  if v_booking is null then
    return jsonb_build_object('allapot', 'ISMERETLEN');
  end if;
  return public.lemondas_ertekel(v_booking);
end;
$$;

create or replace function public.lemondas_vegrehajt(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_hash    text := public.lemondo_token_hash(p_token);
  v_booking uuid;
  v_elotte  jsonb;
begin
  select t.booking_id into v_booking
    from public.cancel_tokens t
   where t.token_hash = v_hash;
  if v_booking is null then
    return jsonb_build_object('allapot', 'ISMERETLEN', 'most_mondta_le', false);
  end if;

  perform 1 from public.bookings b where b.id = v_booking for update;

  v_elotte := public.lemondas_ertekel(v_booking);
  if v_elotte->>'allapot' <> 'LEMONDHATO' then
    return v_elotte || jsonb_build_object('most_mondta_le', false);
  end if;

  perform public.set_booking_status(
    v_booking,
    'CANCELLED_BY_CUSTOMER',
    'Az ügyfél online lemondta a visszaigazoló e-mail linkjével ('
      || to_char(now() at time zone 'Europe/Budapest', 'YYYY.MM.DD. HH24:MI') || ').',
    false);

  update public.cancel_tokens set used_at = now() where token_hash = v_hash;

  return public.lemondas_ertekel(v_booking) || jsonb_build_object('most_mondta_le', true);
end;
$$;

create or replace function public.ertesitesek_atvetele(p_limit integer default 10)
returns setof jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.notifications n
     set status = 'SKIPPED', last_error = 'A foglalás közben már nem visszaigazolt állapotú.'
    from public.bookings b
   where b.id = n.booking_id
     and n.status in ('PENDING', 'FAILED')
     and n.kind = 'BOOKING_CONFIRMED'
     and b.status <> 'CONFIRMED';

  return query
  with jelolt as (
    select n.id
      from public.notifications n
     where n.channel = 'EMAIL'
       and n.created_at > now() - interval '3 days'
       and n.attempts < 3
       and (n.status in ('PENDING', 'FAILED')
            or (n.status = 'SENDING' and n.locked_at < now() - interval '10 minutes'))
     order by n.created_at
     limit greatest(coalesce(p_limit, 10), 1)
     for update skip locked
  ),
  frissitett as (
    update public.notifications n
       set status = 'SENDING', attempts = n.attempts + 1, locked_at = now()
      from jelolt
     where n.id = jelolt.id
    returning n.id, n.kind, n.to_address, n.booking_id, n.created_at
  )
  select jsonb_build_object(
           'id',           f.id,
           'kind',         f.kind,
           'to',           f.to_address,
           'lemondas',     public.lemondas_ertekel(f.booking_id))
    from frissitett f
   order by f.created_at;
end;
$$;

create or replace function public.ertesites_eredmeny(
  p_id          uuid,
  p_ok          boolean,
  p_provider_id text default null,
  p_hiba        text default null)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.notifications
     set status      = case when p_ok then 'SENT' else 'FAILED' end,
         sent_at     = case when p_ok then now() else sent_at end,
         provider_id = coalesce(p_provider_id, provider_id),
         last_error  = case when p_ok then null else left(p_hiba, 500) end,
         locked_at   = null
   where id = p_id;
$$;

create or replace function public.save_shop_settings(p jsonb)
returns void
language sql
volatile
as $$
  insert into public.shop_settings (
    id, drop_off_from, default_parallel_slots, default_travel_minutes,
    pass_validity_kind, pass_validity_value, online_lemondas_ora, updated_at)
  values (
    true,
    coalesce(nullif(p->>'drop_off_from','')::time, '07:15'),
    greatest(coalesce((p->>'default_parallel_slots')::integer, 2), 1),
    greatest(coalesce((p->>'default_travel_minutes')::integer, 20), 0),
    coalesce(nullif(p->>'pass_validity_kind','')::validity_kind, 'EV'),
    coalesce(nullif(p->>'pass_validity_value',''), '1'),
    least(greatest(coalesce(nullif(p->>'online_lemondas_ora','')::integer, 24), 0), 168),
    now())
  on conflict (id) do update set
    drop_off_from          = excluded.drop_off_from,
    default_parallel_slots = excluded.default_parallel_slots,
    default_travel_minutes = excluded.default_travel_minutes,
    pass_validity_kind     = excluded.pass_validity_kind,
    pass_validity_value    = excluded.pass_validity_value,
    online_lemondas_ora    = excluded.online_lemondas_ora,
    updated_at             = now();
$$;

revoke all on function public.foglalas_visszaigazolas()                         from public, anon, authenticated;
revoke all on function public.foglalas_osszegzes(uuid)                          from public, anon, authenticated;
revoke all on function public.lemondo_link_mentes(uuid, text)                   from public, anon, authenticated;
revoke all on function public.lemondas_ertekel(uuid)                            from public, anon, authenticated;
revoke all on function public.lemondas_allapot(text)                            from public, anon, authenticated;
revoke all on function public.lemondas_vegrehajt(text)                          from public, anon, authenticated;
revoke all on function public.ertesitesek_atvetele(integer)                     from public, anon, authenticated;
revoke all on function public.ertesites_eredmeny(uuid, boolean, text, text)     from public, anon, authenticated;

grant execute on function public.lemondo_link_mentes(uuid, text)               to service_role;
grant execute on function public.lemondas_allapot(text)                        to service_role;
grant execute on function public.lemondas_vegrehajt(text)                      to service_role;
grant execute on function public.ertesitesek_atvetele(integer)                 to service_role;
grant execute on function public.ertesites_eredmeny(uuid, boolean, text, text) to service_role;
grant execute on function public.save_shop_settings(jsonb)                     to authenticated;
