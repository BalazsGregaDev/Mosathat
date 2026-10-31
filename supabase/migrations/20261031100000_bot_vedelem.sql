create table if not exists public.vedelem_naplo (
  id     bigserial primary key,
  hol    text not null,
  ip     text,
  bot    text,
  at     timestamptz not null default now()
);

create index if not exists vedelem_naplo_ip_idx on public.vedelem_naplo (ip, hol, at) where ip is not null;
create index if not exists vedelem_naplo_at_idx on public.vedelem_naplo (at);

alter table public.vedelem_naplo enable row level security;
revoke all on public.vedelem_naplo from public, anon, authenticated;

create or replace function public.keres_ip()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_fej json;
  v_ip  text;
begin
  begin
    v_fej := current_setting('request.headers', true)::json;
  exception when others then
    return null;
  end;
  if v_fej is null then
    return null;
  end if;
  v_ip := nullif(btrim(split_part(coalesce(v_fej->>'x-forwarded-for', ''), ',', 1)), '');
  v_ip := coalesce(v_ip, nullif(btrim(coalesce(v_fej->>'cf-connecting-ip', '')), ''), nullif(btrim(coalesce(v_fej->>'x-real-ip', '')), ''));
  if v_ip is null then
    return null;
  end if;
  return md5('mosathat-vedelem:' || v_ip);
end;
$$;

create or replace function public.vedelem_bot(p jsonb, p_min_ms integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then null
    when btrim(coalesce(p->>'weboldal', '')) <> '' then 'MEZO'
    when jsonb_typeof(p->'ido') = 'number' and (p->>'ido')::numeric < p_min_ms then 'GYORS'
  end;
$$;

create or replace function public.vedelem_kapu(p_hol text, p jsonb, p_min_ms integer, p_ora integer, p_nap integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ip  text := public.keres_ip();
  v_bot text := public.vedelem_bot(p, p_min_ms);
begin
  delete from public.vedelem_naplo where at < now() - interval '30 days';
  update public.vedelem_naplo set ip = null where ip is not null and at < now() - interval '2 days';

  if v_ip is not null and (
       (select count(*) from public.vedelem_naplo n
         where n.ip = v_ip and n.hol = p_hol and n.at > now() - interval '1 hour') >= p_ora
    or (select count(*) from public.vedelem_naplo n
         where n.ip = v_ip and n.hol = p_hol and n.at > now() - interval '1 day') >= p_nap) then
    raise exception 'Erről a hálózatról most túl sok kérés érkezett. Kérjük, próbáld újra később, vagy hívj minket: %.', public.publikus_telefon()
      using errcode = 'P0001';
  end if;

  insert into public.vedelem_naplo (hol, ip, bot) values (p_hol, v_ip, v_bot);
  return v_bot is not null;
end;
$$;

alter function public.publikus_foglalas(jsonb) rename to publikus_foglalas_v130;
revoke all on function public.publikus_foglalas_v130(jsonb) from public, anon, authenticated;

create function public.publikus_foglalas(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.vedelem_kapu('FOGLALAS', p, 3000, 5, 12) then
    return gen_random_uuid();
  end if;
  return public.publikus_foglalas_v130(coalesce(p, '{}'::jsonb) - 'weboldal' - 'ido');
end;
$$;

alter function public.ceg_foglalas(text, jsonb) rename to ceg_foglalas_v130;
revoke all on function public.ceg_foglalas_v130(text, jsonb) from public, anon, authenticated;

create function public.ceg_foglalas(p_token text, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.vedelem_kapu('CEG', p, 3000, 40, 120) then
    return jsonb_build_object('id', gen_random_uuid(), 'megerositve', false);
  end if;
  return public.ceg_foglalas_v130(p_token, coalesce(p, '{}'::jsonb) - 'weboldal' - 'ido');
end;
$$;

alter function public.berlet_foglalas(text, jsonb) rename to berlet_foglalas_v130;
revoke all on function public.berlet_foglalas_v130(text, jsonb) from public, anon, authenticated;

create function public.berlet_foglalas(p_token text, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.vedelem_kapu('BERLET', p, 3000, 15, 40) then
    return jsonb_build_object('id', gen_random_uuid(), 'megerositve', false);
  end if;
  return public.berlet_foglalas_v130(p_token, coalesce(p, '{}'::jsonb) - 'weboldal' - 'ido');
end;
$$;

alter function public.foglalas_kereses(jsonb) rename to foglalas_kereses_v130;
revoke all on function public.foglalas_kereses_v130(jsonb) from public, anon, authenticated;

create function public.foglalas_kereses(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if public.vedelem_kapu('KERESES', p, 1500, 60, 300) then
    return '[]'::jsonb;
  end if;
  return public.foglalas_kereses_v130(coalesce(p, '{}'::jsonb) - 'weboldal' - 'ido');
end;
$$;

create or replace function public.vedelem_statisztika()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'Ezt csak a tulajdonos és a fejlesztő láthatja.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'bot_7nap', (select count(*) from public.vedelem_naplo where bot is not null and at > now() - interval '7 days'),
    'bot_30nap', (select count(*) from public.vedelem_naplo where bot is not null),
    'keres_7nap', (select count(*) from public.vedelem_naplo where at > now() - interval '7 days'));
end;
$$;

revoke all on function public.keres_ip() from public, anon, authenticated;
revoke all on function public.vedelem_bot(jsonb, integer) from public, anon, authenticated;
revoke all on function public.vedelem_kapu(text, jsonb, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.vedelem_statisztika() from public, anon;
grant execute on function public.vedelem_statisztika() to authenticated;

revoke all on function public.publikus_foglalas(jsonb) from public;
revoke all on function public.ceg_foglalas(text, jsonb) from public;
revoke all on function public.berlet_foglalas(text, jsonb) from public;
revoke all on function public.foglalas_kereses(jsonb) from public;
grant execute on function public.publikus_foglalas(jsonb) to anon, authenticated;
grant execute on function public.ceg_foglalas(text, jsonb) to anon, authenticated;
grant execute on function public.berlet_foglalas(text, jsonb) to anon, authenticated;
grant execute on function public.foglalas_kereses(jsonb) to anon, authenticated;
