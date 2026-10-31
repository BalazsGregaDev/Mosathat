create table if not exists public.oldal_bejelentes (
  id                 boolean primary key default true check (id),
  felugro_aktiv      boolean not null default false,
  felugro_cim        text not null default '' check (char_length(felugro_cim) <= 120),
  felugro_szoveg     text not null default '' check (char_length(felugro_szoveg) <= 2000),
  felugro_cim_en     text not null default '' check (char_length(felugro_cim_en) <= 120),
  felugro_szoveg_en  text not null default '' check (char_length(felugro_szoveg_en) <= 2000),
  felugro_valtozat   timestamptz not null default now(),
  egyedi_aktiv       boolean not null default false,
  egyedi_szoveg      text not null default '' check (char_length(egyedi_szoveg) <= 3000),
  egyedi_szoveg_en   text not null default '' check (char_length(egyedi_szoveg_en) <= 3000),
  egyedi_kepek       jsonb not null default '[]'::jsonb
                     check (jsonb_typeof(egyedi_kepek) = 'array' and jsonb_array_length(egyedi_kepek) <= 3),
  egyedi_kep_hely    text not null default 'FELETT' check (egyedi_kep_hely in ('FELETT', 'ALATT')),
  egyedi_igazitas    text not null default 'KOZEP' check (egyedi_igazitas in ('BAL', 'KOZEP', 'JOBB')),
  egyedi_meret       text not null default 'KOZEPES' check (egyedi_meret in ('KICSI', 'KOZEPES', 'NAGY', 'TELJES')),
  updated_at         timestamptz not null default now()
);

insert into public.oldal_bejelentes (id) values (true) on conflict (id) do nothing;

alter table public.oldal_bejelentes enable row level security;
revoke all on public.oldal_bejelentes from anon, authenticated;

create or replace function public.bejelentes_felugro(b public.oldal_bejelentes)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'aktiv', b.felugro_aktiv, 'cim', b.felugro_cim, 'szoveg', b.felugro_szoveg,
    'cim_en', b.felugro_cim_en, 'szoveg_en', b.felugro_szoveg_en,
    'valtozat', to_char(b.felugro_valtozat at time zone 'UTC', 'YYYYMMDDHH24MISSUS'));
$$;

create or replace function public.bejelentes_egyedi(b public.oldal_bejelentes)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'aktiv', b.egyedi_aktiv, 'szoveg', b.egyedi_szoveg, 'szoveg_en', b.egyedi_szoveg_en,
    'kepek', b.egyedi_kepek, 'kep_hely', b.egyedi_kep_hely, 'igazitas', b.egyedi_igazitas, 'meret', b.egyedi_meret);
$$;

create or replace function public.bejelentes_adat()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v public.oldal_bejelentes;
begin
  if not public.is_owner() then
    raise exception 'Ezt csak a tulajdonos és a fejlesztő láthatja.' using errcode = '42501';
  end if;
  insert into public.oldal_bejelentes (id) values (true) on conflict (id) do nothing;
  select * into v from public.oldal_bejelentes limit 1;
  return jsonb_build_object('felugro', public.bejelentes_felugro(v), 'egyedi', public.bejelentes_egyedi(v));
end;
$$;

create or replace function public.felugro_mentes(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_regi    public.oldal_bejelentes;
  v_aktiv   boolean := coalesce((p->>'aktiv')::boolean, false);
  v_cim     text := btrim(coalesce(p->>'cim', ''));
  v_szoveg  text := btrim(coalesce(p->>'szoveg', ''));
  v_cim_en  text := btrim(coalesce(p->>'cim_en', ''));
  v_szov_en text := btrim(coalesce(p->>'szoveg_en', ''));
begin
  if not public.is_owner() then
    raise exception 'A felugró ablakot csak a tulajdonos és a fejlesztő módosíthatja.' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Hibás adat.';
  end if;
  if char_length(v_cim) > 120 or char_length(v_cim_en) > 120 then
    raise exception 'A cím legfeljebb 120 karakter lehet.';
  end if;
  if char_length(v_szoveg) > 2000 or char_length(v_szov_en) > 2000 then
    raise exception 'Az üzenet legfeljebb 2000 karakter lehet.';
  end if;
  if v_aktiv and v_szoveg = '' then
    raise exception 'A bekapcsolt felugró ablakhoz írd be az üzenetet.';
  end if;

  insert into public.oldal_bejelentes (id) values (true) on conflict (id) do nothing;
  select * into v_regi from public.oldal_bejelentes limit 1;

  update public.oldal_bejelentes
     set felugro_aktiv = v_aktiv,
         felugro_cim = v_cim,
         felugro_szoveg = v_szoveg,
         felugro_cim_en = v_cim_en,
         felugro_szoveg_en = v_szov_en,
         felugro_valtozat = case
           when v_aktiv and (not v_regi.felugro_aktiv
                             or v_regi.felugro_cim is distinct from v_cim
                             or v_regi.felugro_szoveg is distinct from v_szoveg
                             or v_regi.felugro_cim_en is distinct from v_cim_en
                             or v_regi.felugro_szoveg_en is distinct from v_szov_en)
           then clock_timestamp() else felugro_valtozat end,
         updated_at = now();
end;
$$;

create or replace function public.egyedi_mentes(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_aktiv   boolean := coalesce((p->>'aktiv')::boolean, false);
  v_szoveg  text := btrim(coalesce(p->>'szoveg', ''));
  v_szov_en text := btrim(coalesce(p->>'szoveg_en', ''));
  v_kepek   jsonb := coalesce(p->'kepek', '[]'::jsonb);
  v_hely    text := coalesce(p->>'kep_hely', 'FELETT');
  v_igaz    text := coalesce(p->>'igazitas', 'KOZEP');
  v_meret   text := coalesce(p->>'meret', 'KOZEPES');
  v_kep     jsonb;
begin
  if not public.is_owner() then
    raise exception 'Az egyedi szekciót csak a tulajdonos és a fejlesztő módosíthatja.' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'Hibás adat.';
  end if;
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
  if v_hely not in ('FELETT', 'ALATT') then
    raise exception 'Hibás képhely.';
  end if;
  if v_igaz not in ('BAL', 'KOZEP', 'JOBB') then
    raise exception 'Hibás igazítás.';
  end if;
  if v_meret not in ('KICSI', 'KOZEPES', 'NAGY', 'TELJES') then
    raise exception 'Hibás képméret.';
  end if;
  if v_aktiv and v_szoveg = '' and jsonb_array_length(v_kepek) = 0 then
    raise exception 'A bekapcsolt szekcióhoz írj szöveget vagy tölts fel képet.';
  end if;

  insert into public.oldal_bejelentes (id) values (true) on conflict (id) do nothing;
  update public.oldal_bejelentes
     set egyedi_aktiv = v_aktiv,
         egyedi_szoveg = v_szoveg,
         egyedi_szoveg_en = v_szov_en,
         egyedi_kepek = v_kepek,
         egyedi_kep_hely = v_hely,
         egyedi_igazitas = v_igaz,
         egyedi_meret = v_meret,
         updated_at = now();
end;
$$;

alter function public.publikus_oldal() rename to publikus_oldal_v129;
revoke all on function public.publikus_oldal_v129() from public, anon, authenticated;

create function public.publikus_oldal()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.publikus_oldal_v129() || jsonb_build_object(
    'felugro', (select public.bejelentes_felugro(b) from public.oldal_bejelentes b
                 where b.felugro_aktiv and b.felugro_szoveg <> '' limit 1),
    'egyedi', (select public.bejelentes_egyedi(b) from public.oldal_bejelentes b
                where b.egyedi_aktiv and (b.egyedi_szoveg <> '' or jsonb_array_length(b.egyedi_kepek) > 0) limit 1));
$$;

revoke all on function public.publikus_oldal() from public;
grant execute on function public.publikus_oldal() to anon, authenticated;

revoke all on function public.bejelentes_felugro(public.oldal_bejelentes) from public, anon, authenticated;
revoke all on function public.bejelentes_egyedi(public.oldal_bejelentes) from public, anon, authenticated;
revoke all on function public.bejelentes_adat() from public, anon;
revoke all on function public.felugro_mentes(jsonb) from public, anon;
revoke all on function public.egyedi_mentes(jsonb) from public, anon;
grant execute on function public.bejelentes_adat() to authenticated;
grant execute on function public.felugro_mentes(jsonb) to authenticated;
grant execute on function public.egyedi_mentes(jsonb) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('oldal-kepek', 'oldal-kepek', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists oldal_kepek_feltoltes on storage.objects';
  execute 'drop policy if exists oldal_kepek_torles on storage.objects';
  execute $p$create policy oldal_kepek_feltoltes on storage.objects for insert to authenticated
    with check (bucket_id = 'oldal-kepek' and public.is_owner())$p$;
  execute $p$create policy oldal_kepek_torles on storage.objects for delete to authenticated
    using (bucket_id = 'oldal-kepek' and public.is_owner())$p$;
end;
$$;
