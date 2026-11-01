create table if not exists public.oldal_bejelentesek (
  id          uuid primary key default gen_random_uuid(),
  tipus       text not null check (tipus in ('FELUGRO', 'EGYEDI')),
  aktiv       boolean not null default true,
  kezdes      timestamptz,
  zaras       timestamptz,
  cim         text not null default '' check (char_length(cim) <= 120),
  szoveg      text not null default '' check (char_length(szoveg) <= 3000),
  cim_en      text not null default '' check (char_length(cim_en) <= 120),
  szoveg_en   text not null default '' check (char_length(szoveg_en) <= 3000),
  kepek       jsonb not null default '[]'::jsonb check (jsonb_typeof(kepek) = 'array' and jsonb_array_length(kepek) <= 3),
  kep_hely    text not null default 'FELETT' check (kep_hely in ('FELETT', 'ALATT')),
  igazitas    text not null default 'KOZEP' check (igazitas in ('BAL', 'KOZEP', 'JOBB')),
  meret       text not null default 'KOZEPES' check (meret in ('KICSI', 'KOZEPES', 'NAGY', 'TELJES')),
  valtozat    timestamptz not null default clock_timestamp(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (kezdes is null or zaras is null or zaras > kezdes)
);

create index if not exists oldal_bejelentesek_tipus_idx on public.oldal_bejelentesek (tipus, kezdes);

alter table public.oldal_bejelentesek enable row level security;
revoke all on public.oldal_bejelentesek from public, anon, authenticated;

insert into public.oldal_bejelentesek (tipus, aktiv, cim, szoveg, cim_en, szoveg_en, valtozat, updated_at)
select 'FELUGRO', b.felugro_aktiv, b.felugro_cim, b.felugro_szoveg, b.felugro_cim_en, b.felugro_szoveg_en, b.felugro_valtozat, b.updated_at
  from public.oldal_bejelentes b
 where b.felugro_szoveg <> '';

insert into public.oldal_bejelentesek (tipus, aktiv, szoveg, szoveg_en, kepek, kep_hely, igazitas, meret, updated_at)
select 'EGYEDI', b.egyedi_aktiv, b.egyedi_szoveg, b.egyedi_szoveg_en, b.egyedi_kepek, b.egyedi_kep_hely, b.egyedi_igazitas, b.egyedi_meret, b.updated_at
  from public.oldal_bejelentes b
 where b.egyedi_szoveg <> '' or jsonb_array_length(b.egyedi_kepek) > 0;

create or replace function public.bejelentes_sor(b public.oldal_bejelentesek)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'id', b.id, 'tipus', b.tipus, 'aktiv', b.aktiv, 'kezdes', b.kezdes, 'zaras', b.zaras,
    'cim', b.cim, 'szoveg', b.szoveg, 'cim_en', b.cim_en, 'szoveg_en', b.szoveg_en,
    'kepek', b.kepek, 'kep_hely', b.kep_hely, 'igazitas', b.igazitas, 'meret', b.meret,
    'valtozat', b.id::text || ':' || to_char(b.valtozat at time zone 'UTC', 'YYYYMMDDHH24MISSUS'),
    'updated_at', b.updated_at);
$$;

create or replace function public.bejelentes_most(b public.oldal_bejelentesek)
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select b.aktiv
     and (b.kezdes is null or b.kezdes <= now())
     and (b.zaras is null or b.zaras > now())
     and (b.szoveg <> '' or (b.tipus = 'EGYEDI' and jsonb_array_length(b.kepek) > 0));
$$;

create or replace function public.bejelentes_ido(p timestamptz)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select to_char(p at time zone 'Europe/Budapest', 'YYYY.MM.DD. HH24:MI');
$$;

create or replace function public.bejelentesek_lista(p_tipus text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_owner() then
    raise exception 'Ezt csak a tulajdonos és a fejlesztő láthatja.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.bejelentes_sor(b) order by b.kezdes nulls first, b.created_at)
      from public.oldal_bejelentesek b
     where b.tipus = p_tipus), '[]'::jsonb);
end;
$$;

create or replace function public.bejelentes_mentes(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_id      uuid := nullif(p->>'id', '')::uuid;
  v_tipus   text := p->>'tipus';
  v_aktiv   boolean := coalesce((p->>'aktiv')::boolean, true);
  v_kezdes  timestamptz := nullif(p->>'kezdes', '')::timestamptz;
  v_zaras   timestamptz := nullif(p->>'zaras', '')::timestamptz;
  v_cim     text := btrim(coalesce(p->>'cim', ''));
  v_szoveg  text := btrim(coalesce(p->>'szoveg', ''));
  v_cim_en  text := btrim(coalesce(p->>'cim_en', ''));
  v_szov_en text := btrim(coalesce(p->>'szoveg_en', ''));
  v_kepek   jsonb := coalesce(p->'kepek', '[]'::jsonb);
  v_hely    text := coalesce(p->>'kep_hely', 'FELETT');
  v_igaz    text := coalesce(p->>'igazitas', 'KOZEP');
  v_meret   text := coalesce(p->>'meret', 'KOZEPES');
  v_kep     jsonb;
  v_regi    public.oldal_bejelentesek;
  v_utk     public.oldal_bejelentesek;
  v_nev     text;
begin
  if not public.is_owner() then
    raise exception 'A bejelentéseket csak a tulajdonos és a fejlesztő módosíthatja.' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or v_tipus is null or v_tipus not in ('FELUGRO', 'EGYEDI') then
    raise exception 'Hibás adat.';
  end if;
  if v_kezdes is not null and v_zaras is not null and v_zaras <= v_kezdes then
    raise exception 'A zárásnak a kezdés után kell lennie.';
  end if;
  if char_length(v_cim) > 120 or char_length(v_cim_en) > 120 then
    raise exception 'A cím legfeljebb 120 karakter lehet.';
  end if;

  if v_tipus = 'FELUGRO' then
    if char_length(v_szoveg) > 2000 or char_length(v_szov_en) > 2000 then
      raise exception 'Az üzenet legfeljebb 2000 karakter lehet.';
    end if;
    if v_szoveg = '' then
      raise exception 'Írd be az üzenetet.';
    end if;
    v_kepek := '[]'::jsonb;
  else
    if char_length(v_szoveg) > 3000 or char_length(v_szov_en) > 3000 then
      raise exception 'A szöveg legfeljebb 3000 karakter lehet.';
    end if;
    if jsonb_typeof(v_kepek) <> 'array' then
      raise exception 'Hibás képlista.';
    end if;
    if jsonb_array_length(v_kepek) > 3 then
      raise exception 'Legfeljebb 3 kép tölthető fel.';
    end if;
    for v_kep in select * from jsonb_array_elements(v_kepek) loop
      if jsonb_typeof(v_kep) <> 'string'
         or not ((v_kep #>> '{}') ~ '^https://[^\s"''<>]+$' or (v_kep #>> '{}') ~ '^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$')
         or char_length(v_kep #>> '{}') > 3000000 then
        raise exception 'Hibás kép.';
      end if;
    end loop;
    if v_hely not in ('FELETT', 'ALATT') then raise exception 'Hibás képhely.'; end if;
    if v_igaz not in ('BAL', 'KOZEP', 'JOBB') then raise exception 'Hibás igazítás.'; end if;
    if v_meret not in ('KICSI', 'KOZEPES', 'NAGY', 'TELJES') then raise exception 'Hibás képméret.'; end if;
    if v_szoveg = '' and jsonb_array_length(v_kepek) = 0 then
      raise exception 'Írj szöveget vagy tölts fel képet.';
    end if;
    v_cim := '';
    v_cim_en := '';
  end if;

  if v_id is not null then
    select * into v_regi from public.oldal_bejelentesek where id = v_id and tipus = v_tipus;
    if not found then
      raise exception 'Ez az elem már nem létezik.';
    end if;
  elsif (select count(*) from public.oldal_bejelentesek where tipus = v_tipus) >= 100 then
    raise exception 'Legfeljebb 100 időzítés lehet.';
  end if;

  if v_aktiv then
    select * into v_utk
      from public.oldal_bejelentesek o
     where o.tipus = v_tipus and o.aktiv and o.id is distinct from v_id
       and tstzrange(coalesce(o.kezdes, '-infinity'), coalesce(o.zaras, 'infinity'), '[)')
        && tstzrange(coalesce(v_kezdes, '-infinity'), coalesce(v_zaras, 'infinity'), '[)')
     order by o.kezdes nulls first
     limit 1;
    if found then
      v_nev := coalesce(nullif(v_utk.cim, ''), nullif(left(split_part(v_utk.szoveg, E'\n', 1), 40), ''), 'képes szekció');
      raise exception 'Ütközik egy másik bekapcsolt időzítéssel: „%” (% – %). Egyszerre csak egy látszhat.',
        v_nev,
        coalesce(public.bejelentes_ido(v_utk.kezdes), 'azonnal'),
        coalesce(public.bejelentes_ido(v_utk.zaras), 'visszavonásig');
    end if;
  end if;

  if v_id is null then
    insert into public.oldal_bejelentesek (tipus, aktiv, kezdes, zaras, cim, szoveg, cim_en, szoveg_en, kepek, kep_hely, igazitas, meret)
    values (v_tipus, v_aktiv, v_kezdes, v_zaras, v_cim, v_szoveg, v_cim_en, v_szov_en, v_kepek, v_hely, v_igaz, v_meret)
    returning id into v_id;
  else
    update public.oldal_bejelentesek
       set aktiv = v_aktiv, kezdes = v_kezdes, zaras = v_zaras,
           cim = v_cim, szoveg = v_szoveg, cim_en = v_cim_en, szoveg_en = v_szov_en,
           kepek = v_kepek, kep_hely = v_hely, igazitas = v_igaz, meret = v_meret,
           valtozat = case
             when v_aktiv and (not v_regi.aktiv or v_regi.cim is distinct from v_cim or v_regi.szoveg is distinct from v_szoveg
                               or v_regi.cim_en is distinct from v_cim_en or v_regi.szoveg_en is distinct from v_szov_en)
             then clock_timestamp() else valtozat end,
           updated_at = now()
     where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.bejelentes_torles(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_owner() then
    raise exception 'A bejelentéseket csak a tulajdonos és a fejlesztő módosíthatja.' using errcode = '42501';
  end if;
  delete from public.oldal_bejelentesek where id = p_id;
end;
$$;

create or replace function public.publikus_oldal()
returns jsonb
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.publikus_oldal_v129() || jsonb_build_object(
    'felugro', (select public.bejelentes_sor(b) from public.oldal_bejelentesek b
                 where b.tipus = 'FELUGRO' and public.bejelentes_most(b)
                 order by b.kezdes desc nulls last limit 1),
    'egyedi', (select public.bejelentes_sor(b) from public.oldal_bejelentesek b
                where b.tipus = 'EGYEDI' and public.bejelentes_most(b)
                order by b.kezdes desc nulls last limit 1));
$$;

drop function if exists public.bejelentes_adat();
drop function if exists public.felugro_mentes(jsonb);
drop function if exists public.egyedi_mentes(jsonb);
drop function if exists public.bejelentes_felugro(public.oldal_bejelentes);
drop function if exists public.bejelentes_egyedi(public.oldal_bejelentes);
drop table if exists public.oldal_bejelentes;

revoke all on function public.bejelentes_sor(public.oldal_bejelentesek) from public, anon, authenticated;
revoke all on function public.bejelentes_most(public.oldal_bejelentesek) from public, anon, authenticated;
revoke all on function public.bejelentes_ido(timestamptz) from public, anon, authenticated;
revoke all on function public.bejelentesek_lista(text) from public, anon;
revoke all on function public.bejelentes_mentes(jsonb) from public, anon;
revoke all on function public.bejelentes_torles(uuid) from public, anon;
grant execute on function public.bejelentesek_lista(text) to authenticated;
grant execute on function public.bejelentes_mentes(jsonb) to authenticated;
grant execute on function public.bejelentes_torles(uuid) to authenticated;
revoke all on function public.publikus_oldal() from public;
grant execute on function public.publikus_oldal() to anon, authenticated;
