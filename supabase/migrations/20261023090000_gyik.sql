alter table public.publikus_adatok
  add column if not exists gyik_mod text not null default 'VALOGATOTT' check (gyik_mod in ('VALOGATOTT', 'VELETLEN')),
  add column if not exists gyik_max integer not null default 5 check (gyik_max between 1 and 20);

create table if not exists public.gyik (
  id             uuid primary key default gen_random_uuid(),
  kerdes         text not null check (char_length(btrim(kerdes)) between 3 and 300),
  valasz         text not null default '' check (char_length(valasz) <= 600000),
  kerdes_en      text check (char_length(kerdes_en) <= 300),
  valasz_en      text check (char_length(valasz_en) <= 600000),
  kategoria      text not null default 'EGYEB' check (kategoria in ('KULSO', 'BELSO', 'EGYEB')),
  publikalt      boolean not null default false,
  kiemelt        boolean not null default false,
  sort_order     integer not null default 0,
  publikalva_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.gyik enable row level security;
revoke all on public.gyik from anon, authenticated;

create or replace function public.gyik_sima(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(regexp_replace(regexp_replace(coalesce(p, ''), '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g'));
$$;

create or replace function public.gyik_html_ellenoriz(p text, p_mit text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := coalesce(p, '');
begin
  if v ~* '<\s*(script|iframe|object|embed|style|form|input|button|svg|math|link|meta|base)\y' then
    raise exception '%: nem megengedett elem van a szövegben.', p_mit;
  end if;
  if v ~* '\son[a-z]+\s*=' then
    raise exception '%: nem megengedett attribútum van a szövegben.', p_mit;
  end if;
  if v ~* '(href|src)\s*=\s*["'']?\s*(javascript|vbscript|data:text)' then
    raise exception '%: nem megengedett link van a szövegben.', p_mit;
  end if;
  return v;
end;
$$;

create or replace function public.gyik_sor(g public.gyik)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', g.id, 'kerdes', g.kerdes, 'valasz', g.valasz, 'kerdes_en', g.kerdes_en, 'valasz_en', g.valasz_en,
    'kategoria', g.kategoria, 'kiemelt', g.kiemelt, 'publikalt', g.publikalt,
    'publikalva_at', g.publikalva_at, 'updated_at', g.updated_at);
$$;

create or replace function public.gyik_lista()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'A gyakori kérdéseket csak a tulajdonos és a fejlesztő kezelheti.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'mod', coalesce((select gyik_mod from public.publikus_adatok limit 1), 'VALOGATOTT'),
    'max', coalesce((select gyik_max from public.publikus_adatok limit 1), 5),
    'kerdesek', coalesce((select jsonb_agg(public.gyik_sor(g) order by g.sort_order, g.created_at) from public.gyik g), '[]'::jsonb));
end;
$$;

create or replace function public.gyik_mentes(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid := nullif(p->>'id', '')::uuid;
  v_kerdes  text := btrim(coalesce(p->>'kerdes', ''));
  v_valasz  text := public.gyik_html_ellenoriz(p->>'valasz', 'Válasz');
  v_kerd_en text := nullif(btrim(coalesce(p->>'kerdes_en', '')), '');
  v_val_en  text := nullif(public.gyik_html_ellenoriz(p->>'valasz_en', 'Angol válasz'), '');
  v_kat     text := coalesce(nullif(p->>'kategoria', ''), 'EGYEB');
  v_pub     boolean := coalesce((p->>'publikalt')::boolean, false);
  v_kiem    boolean := coalesce((p->>'kiemelt')::boolean, false);
  v_regi    public.gyik;
begin
  if not public.is_owner() then
    raise exception 'A gyakori kérdéseket csak a tulajdonos és a fejlesztő kezelheti.' using errcode = '42501';
  end if;
  if char_length(v_kerdes) < 3 then
    raise exception 'Írd be a kérdést (legalább 3 karakter).';
  end if;
  if char_length(v_kerdes) > 300 or char_length(coalesce(v_kerd_en, '')) > 300 then
    raise exception 'A kérdés legfeljebb 300 karakter lehet.';
  end if;
  if v_kat not in ('KULSO', 'BELSO', 'EGYEB') then
    raise exception 'Ismeretlen kategória.';
  end if;
  if v_val_en is not null and public.gyik_sima(v_val_en) = '' and v_val_en !~* '<img' then
    v_val_en := null;
  end if;
  if v_pub and public.gyik_sima(v_valasz) = '' and v_valasz !~* '<img' then
    raise exception 'Válasz nélkül a kérdés nem publikálható.';
  end if;

  if v_id is null then
    insert into public.gyik (kerdes, valasz, kerdes_en, valasz_en, kategoria, publikalt, kiemelt, sort_order, publikalva_at)
    values (v_kerdes, v_valasz, v_kerd_en, v_val_en, v_kat, v_pub, v_kiem,
            coalesce((select max(sort_order) + 1 from public.gyik), 0), case when v_pub then now() end)
    returning id into v_id;
    return v_id;
  end if;

  select * into v_regi from public.gyik where id = v_id for update;
  if not found then
    raise exception 'Ez a kérdés már nem létezik.';
  end if;
  update public.gyik set
    kerdes = v_kerdes, valasz = v_valasz, kerdes_en = v_kerd_en, valasz_en = v_val_en, kategoria = v_kat,
    publikalt = v_pub, kiemelt = v_kiem,
    publikalva_at = case when v_pub and not v_regi.publikalt then now() when v_pub then v_regi.publikalva_at end,
    updated_at = now()
  where id = v_id;
  return v_id;
end;
$$;

create or replace function public.gyik_torles(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'A gyakori kérdéseket csak a tulajdonos és a fejlesztő kezelheti.' using errcode = '42501';
  end if;
  delete from public.gyik where id = p_id;
end;
$$;

create or replace function public.gyik_sorrend(p_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'A gyakori kérdéseket csak a tulajdonos és a fejlesztő kezelheti.' using errcode = '42501';
  end if;
  update public.gyik g set sort_order = x.n - 1
    from unnest(p_ids) with ordinality as x(id, n)
   where g.id = x.id;
end;
$$;

create or replace function public.gyik_beallitas(p_mod text, p_max integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'A gyakori kérdéseket csak a tulajdonos és a fejlesztő kezelheti.' using errcode = '42501';
  end if;
  if p_mod not in ('VALOGATOTT', 'VELETLEN') then
    raise exception 'Ismeretlen megjelenítési mód.';
  end if;
  if p_max is null or p_max < 1 or p_max > 20 then
    raise exception 'A főoldalon 1 és 20 közötti számú kérdés jelenhet meg.';
  end if;
  insert into public.publikus_adatok (id) values (true) on conflict (id) do nothing;
  update public.publikus_adatok set gyik_mod = p_mod, gyik_max = p_max, updated_at = now();
end;
$$;

alter function public.publikus_oldal() rename to publikus_oldal_v105;
revoke all on function public.publikus_oldal_v105() from public, anon, authenticated;

create function public.publikus_oldal()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with a as (select public.publikus_oldal_v105() x)
  select jsonb_set(a.x, '{adatok}', coalesce(a.x->'adatok', '{}'::jsonb) - 'gyik_mod' - 'gyik_max') || jsonb_build_object(
    'gyik', jsonb_build_object(
      'mod', coalesce((select gyik_mod from public.publikus_adatok limit 1), 'VALOGATOTT'),
      'max', coalesce((select gyik_max from public.publikus_adatok limit 1), 5),
      'kerdesek', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', g.id, 'kerdes', g.kerdes, 'valasz', g.valasz, 'kerdes_en', g.kerdes_en, 'valasz_en', g.valasz_en,
                 'kategoria', g.kategoria, 'kiemelt', g.kiemelt)
               order by g.sort_order, g.created_at)
          from public.gyik g
         where g.publikalt), '[]'::jsonb)))
  from a;
$$;

revoke all on function public.publikus_oldal() from public;
grant execute on function public.publikus_oldal() to anon, authenticated;

revoke all on function public.gyik_lista() from public, anon;
revoke all on function public.gyik_mentes(jsonb) from public, anon;
revoke all on function public.gyik_torles(uuid) from public, anon;
revoke all on function public.gyik_sorrend(uuid[]) from public, anon;
revoke all on function public.gyik_beallitas(text, integer) from public, anon;
revoke all on function public.gyik_sor(public.gyik) from public, anon, authenticated;
revoke all on function public.gyik_html_ellenoriz(text, text) from public, anon, authenticated;
revoke all on function public.gyik_sima(text) from public, anon, authenticated;
grant execute on function public.gyik_lista() to authenticated;
grant execute on function public.gyik_mentes(jsonb) to authenticated;
grant execute on function public.gyik_torles(uuid) to authenticated;
grant execute on function public.gyik_sorrend(uuid[]) to authenticated;
grant execute on function public.gyik_beallitas(text, integer) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('gyik-kepek', 'gyik-kepek', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists gyik_kepek_feltoltes on storage.objects';
  execute 'drop policy if exists gyik_kepek_torles on storage.objects';
  execute $p$create policy gyik_kepek_feltoltes on storage.objects for insert to authenticated
    with check (bucket_id = 'gyik-kepek' and public.is_owner())$p$;
  execute $p$create policy gyik_kepek_torles on storage.objects for delete to authenticated
    using (bucket_id = 'gyik-kepek' and public.is_owner())$p$;
end;
$$;
