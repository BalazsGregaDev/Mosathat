alter table public.bookings add column if not exists request_phone text;

create table if not exists public.foglalas_kereses_naplo (
  id       bigserial primary key,
  kulcsok  text[] not null,
  sikeres  boolean not null,
  at       timestamptz not null default now()
);

create index if not exists foglalas_kereses_naplo_at_idx on public.foglalas_kereses_naplo (at);

alter table public.foglalas_kereses_naplo enable row level security;
revoke all on public.foglalas_kereses_naplo from public, anon, authenticated;

create or replace function public.online_email_ellenor(p jsonb)
returns void
language plpgsql
immutable
as $$
declare
  v_email text := nullif(btrim(coalesce(p->>'customer_email', '')), '');
begin
  if btrim(coalesce(p->>'customer_name', '')) = ''
     or public.phone_norm(p->>'customer_phone') is null
     or btrim(coalesce(p->>'plate_raw', '')) = '' then
    return;
  end if;
  if v_email is null then
    raise exception 'Add meg az e-mail címed.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Az e-mail cím formátuma nem jó.';
  end if;
end;
$$;

revoke all on function public.online_email_ellenor(jsonb) from public, anon, authenticated;

create or replace function public.publikus_foglalas(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.online_email_ellenor(p);
  v_id := public.publikus_foglalas_alap(p);
  update public.bookings
     set nyelv = case when p->>'nyelv' = 'en' then 'en' else 'hu' end,
         request_phone = public.phone_norm(p->>'customer_phone')
   where id = v_id;
  return v_id;
end;
$$;

revoke all on function public.publikus_foglalas(jsonb) from public;
grant execute on function public.publikus_foglalas(jsonb) to anon, authenticated;

create or replace function public.ceg_foglalas(p_token text, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ki jsonb;
begin
  if public.ceg_link_ceg(p_token) is not null then
    perform public.online_email_ellenor(p);
  end if;
  v_ki := public.ceg_foglalas_alap(p_token, p);
  update public.bookings
     set nyelv = case when p->>'nyelv' = 'en' then 'en' else 'hu' end,
         request_phone = public.phone_norm(p->>'customer_phone')
   where id = (v_ki->>'id')::uuid;
  return v_ki;
end;
$$;

revoke all on function public.ceg_foglalas(text, jsonb) from public;
grant execute on function public.ceg_foglalas(text, jsonb) to anon, authenticated;

alter function public.berlet_foglalas(text, jsonb) rename to berlet_foglalas_alap;
revoke all on function public.berlet_foglalas_alap(text, jsonb) from public, anon, authenticated;

create function public.berlet_foglalas(p_token text, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ki jsonb;
begin
  if public.berlet_link_ugyfel(p_token) is not null then
    perform public.online_email_ellenor(p);
  end if;
  v_ki := public.berlet_foglalas_alap(p_token, p);
  update public.bookings
     set request_phone = public.phone_norm(p->>'customer_phone')
   where id = (v_ki->>'id')::uuid;
  return v_ki;
end;
$$;

revoke all on function public.berlet_foglalas(text, jsonb) from public;
grant execute on function public.berlet_foglalas(text, jsonb) to anon, authenticated;

create or replace function public.foglalas_kereses(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_rsz     text := upper(regexp_replace(coalesce(p->>'rendszam', ''), '[^A-Za-z0-9]', '', 'g'));
  v_tel     text := public.phone_norm(p->>'telefon');
  v_email   text := lower(nullif(btrim(coalesce(p->>'email', '')), ''));
  v_ip      text;
  v_kulcsok text[];
  v_lista   jsonb;
begin
  if length(coalesce(p->>'rendszam', '')) > 15 or length(coalesce(p->>'telefon', '')) > 30
     or length(coalesce(p->>'email', '')) > 120 then
    raise exception 'Valamelyik adat túl hosszú.';
  end if;
  if (v_rsz <> '')::int + (v_tel is not null)::int + (v_email is not null)::int < 2 then
    raise exception 'Adj meg legalább két adatot: rendszám, telefonszám vagy e-mail cím.';
  end if;

  begin
    v_ip := nullif(btrim(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1)), '');
  exception when others then
    v_ip := null;
  end;

  v_kulcsok := array_remove(array[
    case when v_rsz <> '' then 'r:' || md5(v_rsz) end,
    case when v_tel is not null then 't:' || md5(v_tel) end,
    case when v_email is not null then 'e:' || md5(v_email) end,
    case when v_ip is not null then 'i:' || md5(v_ip) end], null);

  delete from public.foglalas_kereses_naplo where at < now() - interval '1 day';

  if exists (
       select 1 from unnest(v_kulcsok) k
        where (select count(*) from public.foglalas_kereses_naplo n
                where not n.sikeres and n.at > now() - interval '1 hour' and k = any(n.kulcsok))
              >= case when k like 'i:%' then 20 else 5 end)
     or (select count(*) from public.foglalas_kereses_naplo n
          where not n.sikeres and n.at > now() - interval '10 minutes') >= 200 then
    raise exception 'Túl sok sikertelen próbálkozás. Kérjük, próbáld újra egy óra múlva, vagy hívj minket: %.', public.publikus_telefon();
  end if;

  with jelolt as (
    select b.id, b.service_date, b.created_at, l.token, v.plate_raw,
           pk.name as csomag, coalesce(pk.name_en, pk.name) as csomag_en,
           public.foglalasom_adat(b.id)->>'allapot' as allapot
      from public.bookings b
      join public.booking_links l on l.booking_id = b.id
      join public.vehicles v on v.id = b.vehicle_id
      join public.customers c on c.id = b.customer_id
      left join public.packages pk on pk.id = b.package_id
     where b.moved_to_booking_id is null
       and b.service_date >= public.budapest_ma() - 60
       and (v_rsz = '' or v.plate_normalized = v_rsz)
       and (v_tel is null or b.request_phone = v_tel or public.phone_norm(c.phone) = v_tel)
       and (v_email is null or lower(btrim(b.request_email)) = v_email or lower(btrim(c.email)) = v_email)
  )
  select jsonb_agg(jsonb_build_object(
           'token', j.token, 'nap', j.service_date, 'rendszam', j.plate_raw,
           'csomag', j.csomag, 'csomag_en', j.csomag_en, 'allapot', j.allapot)
         order by (j.service_date >= public.budapest_ma()) desc,
                  case when j.service_date >= public.budapest_ma() then j.service_date end,
                  j.service_date desc, j.created_at desc)
    into v_lista
    from (select * from jelolt where allapot not in ('LEJART', 'ISMERETLEN')
           order by (service_date >= public.budapest_ma()) desc,
                    case when service_date >= public.budapest_ma() then service_date end,
                    service_date desc, created_at desc
           limit 10) j;

  insert into public.foglalas_kereses_naplo (kulcsok, sikeres) values (v_kulcsok, v_lista is not null);

  return coalesce(v_lista, '[]'::jsonb);
end;
$$;

revoke all on function public.foglalas_kereses(jsonb) from public;
grant execute on function public.foglalas_kereses(jsonb) to anon, authenticated;
