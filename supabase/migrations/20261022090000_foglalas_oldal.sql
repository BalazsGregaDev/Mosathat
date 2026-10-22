alter table public.bookings
  add column if not exists nyelv text not null default 'hu' check (nyelv in ('hu', 'en')),
  add column if not exists felar_indok text check (felar_indok is null or char_length(felar_indok) <= 1000),
  add column if not exists atvetel_at timestamptz;

update public.bookings
   set atvetel_at = coalesce(actual_finished_at, updated_at)
 where status = 'COMPLETED' and atvetel_at is null;

alter table public.publikus_adatok
  add column if not exists google_ertekeles text
    check (google_ertekeles is null or char_length(google_ertekeles) <= 500);

create or replace function public.foglalas_allapot_kovetes()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    new.atvetel_at := now();
  elsif new.status <> 'COMPLETED' and old.status = 'COMPLETED' then
    new.atvetel_at := null;
  end if;
  if old.status in ('READY', 'COMPLETED') and new.status not in ('READY', 'COMPLETED') then
    new.felar_indok := null;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_allapot_kovetes_trg on public.bookings;
create trigger bookings_allapot_kovetes_trg
  before update of status on public.bookings
  for each row execute function public.foglalas_allapot_kovetes();

create table if not exists public.booking_links (
  booking_id  uuid primary key references public.bookings(id) on delete cascade,
  token       text not null unique check (token ~ '^[a-f0-9]{32}$'),
  eredeti     jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.booking_change_requests (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  uzenet      text not null check (char_length(uzenet) between 1 and 1000),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  handled_by  uuid references public.staff(id) on delete set null
);

create index if not exists booking_change_requests_booking_idx on public.booking_change_requests (booking_id, created_at);
create index if not exists booking_change_requests_nyitott_idx on public.booking_change_requests (created_at) where handled_at is null;

alter table public.booking_links enable row level security;
alter table public.booking_change_requests enable row level security;

revoke all on public.booking_links from anon, authenticated;
revoke all on public.booking_change_requests from anon, authenticated;
grant select on public.booking_change_requests to authenticated;

drop policy if exists booking_change_requests_olvas on public.booking_change_requests;
create policy booking_change_requests_olvas on public.booking_change_requests
  for select using ((select public.is_staff()));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public'
                        and tablename = 'booking_change_requests') then
    alter publication supabase_realtime add table public.booking_change_requests;
  end if;
end $$;

create or replace function public.nap_zaras(p_nap date)
returns time
language sql
stable
security definer
set search_path = public
as $$
  select case when coalesce(o.closed, h.closed, true) then null else coalesce(o.closes, h.closes) end
    from (select 1) x
    left join public.business_hours h on h.weekday = extract(isodow from p_nap)
    left join public.day_overrides o on o.day = p_nap;
$$;

create or replace function public.foglalas_kep(p_booking uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'nap',          b.service_date,
    'tipus',        case when b.booking_type = 'TOBBNAPOS' then 'LEADOS' else b.booking_type::text end,
    'kezdes',       to_char(b.start_at at time zone 'Europe/Budapest', 'HH24:MI'),
    'hozas',        to_char(b.drop_off_at at time zone 'Europe/Budapest', 'HH24:MI'),
    'kesz',         case when b.booking_type = 'VAROS' and b.start_at is not null and b.planned_duration_minutes > 0
                         then to_char((b.start_at + make_interval(mins => b.planned_duration_minutes)) at time zone 'Europe/Budapest', 'HH24:MI') end,
    'elvitel_nap',  (coalesce(b.pick_up_at, b.deadline_at) at time zone 'Europe/Budapest')::date,
    'elvitel',      to_char(coalesce(b.pick_up_at, b.deadline_at) at time zone 'Europe/Budapest', 'HH24:MI'),
    'csomag',       p.name,
    'csomag_en',    coalesce(nullif(btrim(p.name_en), ''), p.name),
    'full_service', b.full_service,
    'terjedelem',   b.scope,
    'kategoria',    v.category,
    'extrak',       coalesce((
                      select jsonb_agg(jsonb_build_object(
                               'nev', bi.name_snapshot,
                               'nev_en', coalesce(nullif(btrim(e.name_en), ''), bi.name_snapshot),
                               'db', bi.quantity)
                             order by bi.sort_order)
                        from public.booking_items bi
                        left join public.extras e on e.id = bi.ref_id
                       where bi.booking_id = b.id and bi.kind = 'EXTRA'), '[]'::jsonb),
    'rendszam',     upper(v.plate_raw),
    'marka',        v.brand,
    'modell',       v.model,
    'ar',           b.estimated_price_huf)
    from public.bookings b
    join public.vehicles v on v.id = b.vehicle_id
    left join public.packages p on p.id = b.package_id
   where b.id = p_booking;
$$;

create or replace function public.foglalas_link_letrehoz(p_booking uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  select l.token into v_token from public.booking_links l where l.booking_id = p_booking;
  if v_token is not null then
    return v_token;
  end if;
  if not exists (select 1 from public.bookings b where b.id = p_booking) then
    return null;
  end if;
  insert into public.booking_links (booking_id, token, eredeti)
  values (p_booking, replace(gen_random_uuid()::text, '-', ''), public.foglalas_kep(p_booking))
  on conflict (booking_id) do nothing;
  select l.token into v_token from public.booking_links l where l.booking_id = p_booking;
  return v_token;
end;
$$;

create or replace function public.foglalas_link_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.foglalas_link_letrehoz(new.id);
  return null;
end;
$$;

drop trigger if exists bookings_link_trg on public.bookings;
create constraint trigger bookings_link_trg
  after insert on public.bookings
  deferrable initially deferred
  for each row execute function public.foglalas_link_trg();

insert into public.booking_links (booking_id, token, eredeti)
select b.id, replace(gen_random_uuid()::text, '-', ''), public.foglalas_kep(b.id)
  from public.bookings b
on conflict (booking_id) do nothing;

create or replace function public.foglalasom_adat(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b          public.bookings%rowtype;
  v_ma       date := (now() at time zone 'Europe/Budapest')::date;
  v_allapot  text;
  v_lejar    timestamptz;
  v_ceges    boolean;
  v_lem      jsonb;
  v_kesz_ig  timestamptz;
  v_nap      date;
  v_zaras    time;
  v_kep      jsonb;
  v_eredeti  jsonb;
  v_nyitott  integer;
  v_nev      text;
  v_kesz     boolean;
begin
  select * into b from public.bookings where id = p_booking;
  if not found then
    return jsonb_build_object('allapot', 'ISMERETLEN');
  end if;

  v_allapot := case
    when b.status = 'REQUESTED' then 'KERES'
    when b.status = 'READY' then 'KESZ'
    when b.status = 'COMPLETED' and b.not_fitted then 'NEM_FERT_BE'
    when b.status = 'COMPLETED' then 'ATVEVE'
    when b.status in ('CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP') then 'LEMONDVA'
    when b.status = 'REJECTED' then 'ELUTASITVA'
    when b.status = 'NO_SHOW' then 'NEM_JOTT'
    else 'VISSZAIGAZOLVA'
  end;

  v_lejar := case
    when b.status = 'COMPLETED' then coalesce(b.atvetel_at, b.updated_at) + interval '10 days'
    when b.status in ('CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'REJECTED', 'NO_SHOW')
      then ((b.service_date + 11)::timestamp at time zone 'Europe/Budapest')
  end;

  if v_lejar is not null and now() >= v_lejar then
    return jsonb_build_object('allapot', 'LEJART', 'nyelv', b.nyelv);
  end if;

  v_ceges := b.contract_kind is not null or b.ceg_link_company is not null;
  v_kesz  := b.status in ('READY', 'COMPLETED');

  if b.status = 'READY' then
    v_kesz_ig := coalesce(b.pick_up_at, b.deadline_at);
    if v_kesz_ig is null or v_kesz_ig < now() then
      v_kesz_ig := null;
      v_nap := greatest(b.service_date, v_ma);
      for i in 0..14 loop
        v_zaras := public.nap_zaras(v_nap);
        if v_zaras is not null and ((v_nap + v_zaras)::timestamp at time zone 'Europe/Budapest') > now() then
          v_kesz_ig := (v_nap + v_zaras)::timestamp at time zone 'Europe/Budapest';
          exit;
        end if;
        v_nap := v_nap + 1;
      end loop;
    end if;
  end if;

  v_lem := public.lemondas_ertekel(p_booking);
  v_kep := public.foglalas_kep(p_booking);
  select l.eredeti into v_eredeti from public.booking_links l where l.booking_id = p_booking;
  v_eredeti := coalesce(v_eredeti, v_kep);
  if v_ceges then
    v_kep := v_kep - 'ar';
    v_eredeti := v_eredeti - 'ar';
  end if;

  select count(*) into v_nyitott
    from public.booking_change_requests r
   where r.booking_id = p_booking and r.handled_at is null;

  select btrim(c.name) into v_nev from public.customers c where c.id = b.customer_id;

  return jsonb_build_object(
    'allapot',           v_allapot,
    'nyelv',             b.nyelv,
    'nev',               v_nev,
    'ceges',             v_ceges,
    'most',              v_kep,
    'eredeti',           v_eredeti,
    'ar',                case when v_ceges then null else jsonb_build_object(
                           'becsult',      b.estimated_price_huf,
                           'vegleges',     case when v_kesz then coalesce(b.final_price_huf, b.estimated_price_huf) end,
                           'felar_indok',  case when v_kesz then b.felar_indok end,
                           'kimaradt',     case when v_kesz then b.skip_note end,
                           'kimaradt_huf', case when v_kesz then b.skip_huf end) end,
    'kesz_ig',           v_kesz_ig,
    'atveve',            b.atvetel_at,
    'lejar',             v_lejar,
    'lemondhato',        v_lem->>'allapot' = 'LEMONDHATO',
    'lemondas_hatarido', v_lem->'hatarido',
    'modosithato',       b.status in ('REQUESTED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'READY'),
    'nyitott_kerelem',   v_nyitott,
    'kerelmek',          coalesce((
                           select jsonb_agg(jsonb_build_object(
                                    'uzenet', r.uzenet, 'mikor', r.created_at, 'elintezve', r.handled_at)
                                  order by r.created_at)
                             from public.booking_change_requests r
                            where r.booking_id = p_booking), '[]'::jsonb));
end;
$$;

create or replace function public.foglalas_link_booking(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.booking_id
    from public.booking_links l
   where p_token ~ '^[a-f0-9]{32}$' and l.token = p_token;
$$;

create or replace function public.foglalasom(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid := public.foglalas_link_booking(p_token);
begin
  if v_id is null then
    return jsonb_build_object('allapot', 'ISMERETLEN');
  end if;
  return public.foglalasom_adat(v_id);
end;
$$;

create or replace function public.foglalasom_modositas(p_token text, p_uzenet text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id     uuid := public.foglalas_link_booking(p_token);
  v_szoveg text := btrim(coalesce(p_uzenet, ''));
  v_adat   jsonb;
begin
  if v_id is null then
    raise exception 'Ez a link nem érvényes. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;
  perform 1 from public.bookings b where b.id = v_id for update;
  v_adat := public.foglalasom_adat(v_id);
  if not coalesce((v_adat->>'modosithato')::boolean, false) then
    raise exception 'Ehhez a foglaláshoz már nem kérhető módosítás. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;
  if char_length(v_szoveg) < 3 then
    raise exception 'Írd le röviden, mit szeretnél módosítani.';
  end if;
  if char_length(v_szoveg) > 1000 then
    raise exception 'Az üzenet legfeljebb 1000 karakter lehet.';
  end if;
  if (select count(*) from public.booking_change_requests r
       where r.booking_id = v_id and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'Ma már több módosítási kérést küldtél. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;
  insert into public.booking_change_requests (booking_id, uzenet) values (v_id, v_szoveg);
  return public.foglalasom_adat(v_id);
end;
$$;

create or replace function public.foglalasom_lemondas(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := public.foglalas_link_booking(p_token);
begin
  if v_id is null then
    raise exception 'Ez a link nem érvényes. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;
  perform 1 from public.bookings b where b.id = v_id for update;
  if public.lemondas_ertekel(v_id)->>'allapot' <> 'LEMONDHATO' then
    raise exception 'A foglalás online már nem mondható le. Kérjük, hívj minket: %.', public.publikus_telefon();
  end if;
  perform public.set_booking_status(
    v_id,
    'CANCELLED_BY_CUSTOMER',
    'Az ügyfél online lemondta a foglalása oldalán ('
      || to_char(now() at time zone 'Europe/Budapest', 'YYYY.MM.DD. HH24:MI') || ').',
    false);
  return public.foglalasom_adat(v_id);
end;
$$;

create or replace function public.foglalas_link(p_booking uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  return public.foglalas_link_letrehoz(p_booking);
end;
$$;

create or replace function public.modositasi_kerelmek()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'elso')
      from (
        select jsonb_build_object(
                 'booking_id',     b.id,
                 'plate_raw',      v.plate_raw,
                 'customer_name',  c.name,
                 'customer_phone', c.phone,
                 'service_date',   b.service_date,
                 'status',         b.status,
                 'elso',           min(r.created_at),
                 'kerelmek',       jsonb_agg(jsonb_build_object('id', r.id, 'uzenet', r.uzenet, 'mikor', r.created_at)
                                             order by r.created_at)) as x
          from public.booking_change_requests r
          join public.bookings b on b.id = r.booking_id
          join public.customers c on c.id = b.customer_id
          join public.vehicles v on v.id = b.vehicle_id
         where r.handled_at is null
         group by b.id, v.plate_raw, c.name, c.phone, b.service_date, b.status) s), '[]'::jsonb);
end;
$$;

create or replace function public.modositas_elintezve(p_booking uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_db integer;
begin
  if not public.is_staff() then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  update public.booking_change_requests
     set handled_at = now(), handled_by = (select s.id from public.staff s where s.id = auth.uid())
   where booking_id = p_booking and handled_at is null;
  get diagnostics v_db = row_count;
  return v_db;
end;
$$;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in ('BOOKING_CONFIRMED', 'CAR_READY'));

drop function if exists public.booking_finish(uuid, uuid[]);

create function public.booking_finish(
  p_booking_id uuid,
  p_done       uuid[],
  p_ar         integer default null,
  p_indok      text default null,
  p_email      boolean default false)
returns jsonb
language plpgsql
volatile
as $$
declare
  b        public.bookings%rowtype;
  v_elo    jsonb;
  v_staff  uuid := (select s.id from public.staff s where s.id = auth.uid());
  v_pipalt uuid[];
  v_skip   integer;
  v_veg    integer;
  v_indok  text := nullif(btrim(coalesce(p_indok, '')), '');
  v_ceges  boolean;
  v_email  text;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Nincs ilyen foglalás.'; end if;
  if b.status in ('READY', 'COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW') then
    raise exception 'Ez a foglalás már kész, lezárt vagy törölt.';
  end if;
  if p_ar is not null and (p_ar < 0 or p_ar > 10000000) then
    raise exception 'A végösszeg 0 és 10 000 000 Ft között lehet.';
  end if;
  if v_indok is not null and char_length(v_indok) > 1000 then
    raise exception 'A felár indoka legfeljebb 1000 karakter lehet.';
  end if;

  v_ceges := b.contract_kind is not null or b.ceg_link_company is not null;

  v_elo  := public.booking_finish_preview(p_booking_id, coalesce(p_done, '{}'));
  v_skip := (v_elo->>'skip_huf')::integer;

  v_veg := case when v_skip > 0
                then greatest(coalesce(b.final_price_huf, b.estimated_price_huf) - v_skip, 0)
                else coalesce(b.final_price_huf, b.estimated_price_huf) end;
  if p_ar is not null then
    v_veg := p_ar;
  end if;

  if p_ar is not null and v_veg > b.estimated_price_huf and v_indok is null and not v_ceges then
    raise exception 'A végösszeg magasabb a becsültnél. Írd be röviden az okát, az ügyfél a foglalása oldalán látja.';
  end if;

  perform public.set_booking_status(p_booking_id, 'READY', null, false);

  with pipa as (
    update public.booking_tasks t
       set done = true, done_at = now(), done_by = v_staff
     where t.booking_id = p_booking_id and not t.done and t.id = any (coalesce(p_done, '{}'))
    returning t.id
  )
  select array_agg(id) into v_pipalt from pipa;

  update public.bookings
     set auto_done_tasks      = coalesce(v_pipalt, '{}'),
         skip_note            = v_elo->>'skip_note',
         skip_huf             = nullif(v_skip, 0),
         pre_finish_price_huf = final_price_huf,
         finish_price_set     = v_veg is distinct from coalesce(final_price_huf, estimated_price_huf),
         final_price_huf      = case when v_veg is distinct from coalesce(final_price_huf, estimated_price_huf)
                                     then v_veg else final_price_huf end,
         felar_indok          = case when v_veg > estimated_price_huf
                                     then coalesce(v_indok, nullif(btrim(price_adjustment_reason), '')) end,
         updated_at           = now()
   where id = p_booking_id;

  if p_email then
    select coalesce(nullif(btrim(bb.request_email), ''), nullif(btrim(c.email), '')) into v_email
      from public.bookings bb
      join public.customers c on c.id = bb.customer_id
     where bb.id = p_booking_id;
    if v_email is not null then
      insert into public.notifications (booking_id, kind, to_address)
      values (p_booking_id, 'CAR_READY', v_email);
    end if;
  end if;

  return v_elo || jsonb_build_object('vegosszeg', v_veg, 'email', v_email is not null);
end;
$$;

revoke all on function public.booking_finish(uuid, uuid[], integer, text, boolean) from public, anon;
grant execute on function public.booking_finish(uuid, uuid[], integer, text, boolean) to authenticated;

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

  update public.notifications n
     set status = 'SKIPPED', last_error = 'Az autó közben már nem kész állapotú.'
    from public.bookings b
   where b.id = n.booking_id
     and n.status in ('PENDING', 'FAILED')
     and n.kind = 'CAR_READY'
     and b.status <> 'READY';

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
           'id',       f.id,
           'kind',     f.kind,
           'to',       f.to_address,
           'link',     public.foglalas_link_letrehoz(f.booking_id),
           'nyelv',    (select b.nyelv from public.bookings b where b.id = f.booking_id),
           'lemondas', public.lemondas_ertekel(f.booking_id),
           'oldal',    public.foglalasom_adat(f.booking_id))
    from frissitett f
   order by f.created_at;
end;
$$;

alter function public.publikus_foglalas(jsonb) rename to publikus_foglalas_alap;
revoke all on function public.publikus_foglalas_alap(jsonb) from public, anon, authenticated;

create function public.publikus_foglalas(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  v_id := public.publikus_foglalas_alap(p);
  update public.bookings
     set nyelv = case when p->>'nyelv' = 'en' then 'en' else 'hu' end
   where id = v_id;
  return v_id;
end;
$$;

revoke all on function public.publikus_foglalas(jsonb) from public;
grant execute on function public.publikus_foglalas(jsonb) to anon, authenticated;

alter function public.ceg_foglalas(text, jsonb) rename to ceg_foglalas_alap;
revoke all on function public.ceg_foglalas_alap(text, jsonb) from public, anon, authenticated;

create function public.ceg_foglalas(p_token text, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ki jsonb;
begin
  v_ki := public.ceg_foglalas_alap(p_token, p);
  update public.bookings
     set nyelv = case when p->>'nyelv' = 'en' then 'en' else 'hu' end
   where id = (v_ki->>'id')::uuid;
  return v_ki;
end;
$$;

revoke all on function public.ceg_foglalas(text, jsonb) from public;
grant execute on function public.ceg_foglalas(text, jsonb) to anon, authenticated;

create or replace view public.v_day_bookings
with (security_invoker = on) as
select
  b.id,
  b.service_date,
  b.booking_type,
  b.status,
  b.source,
  b.start_at,
  b.drop_off_at,
  b.pick_up_at,
  b.deadline_at,
  b.arrived_at,
  b.scope,
  b.full_service,
  b.planned_duration_minutes,
  b.rest_minutes,
  b.estimated_price_huf,
  b.final_price_huf,
  b.notes,
  b.internal_notes,

  c.id           as customer_id,
  c.name         as customer_name,
  c.phone        as customer_phone,
  c.type         as customer_type,
  c.company_name,
  c.billing_kind,

  v.id           as vehicle_id,
  v.plate_raw,
  v.plate_country,
  v.brand,
  v.model,
  v.category,
  v.seats,

  p.id           as package_id,
  p.code         as package_code,
  p.name         as package_name,

  case when b.booking_type = 'HOZOMVISZEM' then (
    select ct.pickup_delivery_fee_huf
      from public.contracts ct
     where ct.company_id = c.company_id
       and ct.active
       and ct.pickup_delivery
       and (ct.valid_until is null or ct.valid_until >= b.service_date)
     limit 1
  ) end as pickup_fee_huf,

  (select count(*) from public.booking_tasks t where t.booking_id = b.id)              as tasks_total,
  (select count(*) from public.booking_tasks t where t.booking_id = b.id and t.done)   as tasks_done,

  (select min(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as first_done_at,
  (select max(t.done_at) from public.booking_tasks t where t.booking_id = b.id and t.done) as last_done_at,

  b.last_day,
  b.contract_kind,
  c.company_id,
  (select string_agg(bi.name_snapshot, ', ' order by bi.sort_order)
     from public.booking_items bi
    where bi.booking_id = b.id and bi.kind = 'EXTRA')                                   as extras_summary,
  (select count(*)::integer from public.booking_items bi
    where bi.booking_id = b.id and bi.kind = 'EXTRA')                                   as extras_count,

  b.tentative,
  b.not_fitted,
  b.fleet_group,
  b.fleet_index,

  b.skip_note,
  b.skip_huf,

  b.ceg_link_company,

  b.felar_indok,
  b.price_adjustment_reason,
  b.nyelv,
  coalesce(nullif(btrim(b.request_email), ''), nullif(btrim(c.email), ''))             as ugyfel_email
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.vehicles  v on v.id = b.vehicle_id
left join public.packages p on p.id = b.package_id;

create or replace function public.publikus_tartalom_mentes(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_adat  jsonb := p->'adatok';
  v_kam   jsonb := p->'kamerak';
  v_nyelv text;
  v_szov  jsonb;
  v_kulcs text;
  v_ertek jsonb;
  v_sor   jsonb;
  v_n     integer := 0;
  v_email text;
  v_google text;
begin
  if not public.is_owner() then
    raise exception 'A publikus oldal tartalmát csak a tulajdonos és a fejlesztő módosíthatja.' using errcode = '42501';
  end if;

  if v_adat is not null and jsonb_typeof(v_adat) = 'object' then
    v_email := nullif(btrim(coalesce(v_adat->>'email', '')), '');
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Az e-mail cím formátuma nem megfelelő.';
    end if;
    v_google := nullif(btrim(coalesce(v_adat->>'google_ertekeles', '')), '');
    if v_google is not null and v_google !~ '^https://[^\s]+$' then
      raise exception 'A Google-értékelés linkjének https:// kezdetűnek kell lennie, szóköz nélkül.';
    end if;
    update public.publikus_adatok set
      nev                = case when v_adat ? 'nev'                then nullif(btrim(v_adat->>'nev'), '')                else nev end,
      telefon            = case when v_adat ? 'telefon'            then nullif(btrim(v_adat->>'telefon'), '')            else telefon end,
      email              = case when v_adat ? 'email'              then v_email                                          else email end,
      irsz               = case when v_adat ? 'irsz'               then nullif(btrim(v_adat->>'irsz'), '')               else irsz end,
      cim                = case when v_adat ? 'cim'                then nullif(btrim(v_adat->>'cim'), '')                else cim end,
      haz                = case when v_adat ? 'haz'                then nullif(btrim(v_adat->>'haz'), '')                else haz end,
      szint              = case when v_adat ? 'szint'              then nullif(btrim(v_adat->>'szint'), '')              else szint end,
      bejarat            = case when v_adat ? 'bejarat'            then nullif(btrim(v_adat->>'bejarat'), '')            else bejarat end,
      kerulet            = case when v_adat ? 'kerulet'            then nullif(btrim(v_adat->>'kerulet'), '')            else kerulet end,
      szint_en           = case when v_adat ? 'szint_en'           then nullif(btrim(v_adat->>'szint_en'), '')           else szint_en end,
      bejarat_en         = case when v_adat ? 'bejarat_en'         then nullif(btrim(v_adat->>'bejarat_en'), '')         else bejarat_en end,
      kerulet_en         = case when v_adat ? 'kerulet_en'         then nullif(btrim(v_adat->>'kerulet_en'), '')         else kerulet_en end,
      google_ertekeles   = case when v_adat ? 'google_ertekeles'   then v_google                                         else google_ertekeles end,
      ceg_nev            = case when v_adat ? 'ceg_nev'            then nullif(btrim(v_adat->>'ceg_nev'), '')            else ceg_nev end,
      ceg_rovid_nev      = case when v_adat ? 'ceg_rovid_nev'      then nullif(btrim(v_adat->>'ceg_rovid_nev'), '')      else ceg_rovid_nev end,
      ceg_szekhely       = case when v_adat ? 'ceg_szekhely'       then nullif(btrim(v_adat->>'ceg_szekhely'), '')       else ceg_szekhely end,
      ceg_cegjegyzekszam = case when v_adat ? 'ceg_cegjegyzekszam' then nullif(btrim(v_adat->>'ceg_cegjegyzekszam'), '') else ceg_cegjegyzekszam end,
      ceg_cegbirosag     = case when v_adat ? 'ceg_cegbirosag'     then nullif(btrim(v_adat->>'ceg_cegbirosag'), '')     else ceg_cegbirosag end,
      ceg_adoszam        = case when v_adat ? 'ceg_adoszam'        then nullif(btrim(v_adat->>'ceg_adoszam'), '')        else ceg_adoszam end,
      jogi_hataly        = case when v_adat ? 'jogi_hataly'        then nullif(btrim(v_adat->>'jogi_hataly'), '')        else jogi_hataly end,
      jogi_tervezet      = case when v_adat ? 'jogi_tervezet'      then (v_adat->>'jogi_tervezet')::boolean              else jogi_tervezet end,
      konyvelo_nev       = case when v_adat ? 'konyvelo_nev'       then nullif(btrim(v_adat->>'konyvelo_nev'), '')       else konyvelo_nev end,
      konyvelo_cim       = case when v_adat ? 'konyvelo_cim'       then nullif(btrim(v_adat->>'konyvelo_cim'), '')       else konyvelo_cim end,
      kamera_megorzes    = case when v_adat ? 'kamera_megorzes'    then nullif(btrim(v_adat->>'kamera_megorzes'), '')    else kamera_megorzes end,
      kamera_megorzes_en = case when v_adat ? 'kamera_megorzes_en' then nullif(btrim(v_adat->>'kamera_megorzes_en'), '') else kamera_megorzes_en end,
      updated_at         = now();
  end if;

  foreach v_nyelv in array array['hu', 'en'] loop
    v_szov := p->(case v_nyelv when 'hu' then 'szovegek' else 'szovegek_en' end);
    if v_szov is not null and jsonb_typeof(v_szov) = 'object' then
      for v_kulcs, v_ertek in select * from jsonb_each(v_szov) loop
        if v_kulcs !~ '^[a-z0-9_.]{1,80}$' then
          raise exception 'Érvénytelen szövegkulcs: %', left(v_kulcs, 80);
        end if;
        if v_ertek is null or jsonb_typeof(v_ertek) = 'null' or btrim(v_ertek #>> '{}') = '' then
          delete from public.publikus_szovegek where kulcs = v_kulcs and nyelv = v_nyelv;
        else
          if char_length(v_ertek #>> '{}') > 4000 then
            raise exception 'Egy szöveg legfeljebb 4000 karakter lehet.';
          end if;
          insert into public.publikus_szovegek (kulcs, nyelv, ertek) values (v_kulcs, v_nyelv, v_ertek #>> '{}')
          on conflict (kulcs, nyelv) do update set ertek = excluded.ertek, updated_at = now();
        end if;
      end loop;
    end if;
  end loop;

  if v_kam is not null and jsonb_typeof(v_kam) = 'array' then
    if jsonb_array_length(v_kam) > 30 then
      raise exception 'Legfeljebb 30 kamera vehető fel.';
    end if;
    delete from public.publikus_kamerak where true;
    for v_sor in select * from jsonb_array_elements(v_kam) loop
      if nullif(btrim(coalesce(v_sor->>'hely', '')), '') is null or nullif(btrim(coalesce(v_sor->>'terulet', '')), '') is null then
        raise exception 'Minden kameránál add meg a helyét és azt, hogy mit lát.';
      end if;
      insert into public.publikus_kamerak (hely, terulet, hely_en, terulet_en, sort_order)
      values (btrim(v_sor->>'hely'), btrim(v_sor->>'terulet'),
              nullif(btrim(coalesce(v_sor->>'hely_en', '')), ''), nullif(btrim(coalesce(v_sor->>'terulet_en', '')), ''), v_n);
      v_n := v_n + 1;
    end loop;
  end if;
end;
$$;

revoke all on function public.publikus_tartalom_mentes(jsonb) from public, anon;
grant execute on function public.publikus_tartalom_mentes(jsonb) to authenticated;

revoke all on function public.foglalas_allapot_kovetes()                from public, anon, authenticated;
revoke all on function public.nap_zaras(date)                           from public, anon, authenticated;
revoke all on function public.foglalas_kep(uuid)                        from public, anon, authenticated;
revoke all on function public.foglalas_link_letrehoz(uuid)              from public, anon, authenticated;
revoke all on function public.foglalas_link_trg()                       from public, anon, authenticated;
revoke all on function public.foglalasom_adat(uuid)                     from public, anon, authenticated;
revoke all on function public.foglalas_link_booking(text)               from public, anon, authenticated;
revoke all on function public.foglalasom(text)                          from public;
revoke all on function public.foglalasom_modositas(text, text)          from public;
revoke all on function public.foglalasom_lemondas(text)                 from public;
revoke all on function public.foglalas_link(uuid)                       from public, anon;
revoke all on function public.modositasi_kerelmek()                     from public, anon;
revoke all on function public.modositas_elintezve(uuid)                 from public, anon;
revoke all on function public.ertesitesek_atvetele(integer)             from public, anon, authenticated;

grant execute on function public.foglalasom(text)                       to anon, authenticated;
grant execute on function public.foglalasom_modositas(text, text)       to anon, authenticated;
grant execute on function public.foglalasom_lemondas(text)              to anon, authenticated;
grant execute on function public.foglalas_link(uuid)                    to authenticated;
grant execute on function public.modositasi_kerelmek()                  to authenticated;
grant execute on function public.modositas_elintezve(uuid)              to authenticated;
grant execute on function public.ertesitesek_atvetele(integer)          to service_role;
