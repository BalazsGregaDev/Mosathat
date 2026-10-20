create sequence if not exists public.jogi_aktivalas_seq;

create table if not exists public.jogi_valtozatok (
  id             uuid primary key default gen_random_uuid(),
  dokumentum     text not null check (dokumentum in ('impresszum', 'adatvedelem')),
  nyelv          text not null check (nyelv in ('hu', 'en')),
  beepitett      boolean not null default false,
  fajlnev        text check (char_length(fajlnev) between 1 and 200),
  fajl           text check (char_length(fajl) <= 2800000),
  meret          integer,
  tartalom       jsonb,
  feltolto       uuid,
  feltolto_nev   text,
  letrehozva     timestamptz not null default now(),
  aktivalas      bigint not null default nextval('public.jogi_aktivalas_seq'),
  aktivalva      timestamptz not null default now(),
  aktivalta_nev  text,
  check (beepitett or (fajl is not null and fajlnev is not null and tartalom is not null))
);

create index if not exists jogi_valtozatok_sorrend on public.jogi_valtozatok (dokumentum, nyelv, aktivalas desc);

alter table public.jogi_valtozatok enable row level security;
revoke all on public.jogi_valtozatok from anon, authenticated;

create or replace function public.jogi_sajat_nev()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.full_name from public.staff s where s.id = auth.uid()
$$;

revoke all on function public.jogi_sajat_nev() from public, anon, authenticated;

create or replace function public.jogi_valtozatok()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'A jogi szövegeket csak a tulajdonos és a fejlesztő kezelheti.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', v.id,
             'dokumentum', v.dokumentum,
             'nyelv', v.nyelv,
             'beepitett', v.beepitett,
             'fajlnev', v.fajlnev,
             'meret', v.meret,
             'feltolto_nev', v.feltolto_nev,
             'letrehozva', v.letrehozva,
             'aktivalva', v.aktivalva,
             'aktivalta_nev', v.aktivalta_nev,
             'aktiv', v.sorszam = 1
           ) order by v.dokumentum, v.nyelv, v.sorszam)
      from (
        select j.*, row_number() over (partition by j.dokumentum, j.nyelv order by j.aktivalas desc) as sorszam
          from public.jogi_valtozatok j
      ) v
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.jogi_valtozatok() from public, anon;
grant execute on function public.jogi_valtozatok() to authenticated;

create or replace function public.jogi_valtozat_feltoltes(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_dok     text := p->>'dokumentum';
  v_nyelv   text := p->>'nyelv';
  v_nev     text := btrim(coalesce(p->>'fajlnev', ''));
  v_fajl    text := regexp_replace(coalesce(p->>'fajl', ''), '\s', '', 'g');
  v_tart    jsonb := p->'tartalom';
  v_meret   integer;
  v_ki      text;
  v_id      uuid;
begin
  if not public.is_owner() then
    raise exception 'A jogi szövegeket csak a tulajdonos és a fejlesztő kezelheti.' using errcode = '42501';
  end if;
  if v_dok is null or v_dok not in ('impresszum', 'adatvedelem') then
    raise exception 'Ismeretlen dokumentum.';
  end if;
  if v_nyelv is null or v_nyelv not in ('hu', 'en') then
    raise exception 'Ismeretlen nyelv.';
  end if;
  if v_nev = '' or char_length(v_nev) > 200 then
    raise exception 'A fájl neve hiányzik vagy túl hosszú.';
  end if;
  if v_fajl = '' or left(v_fajl, 4) <> 'UEsD' then
    raise exception 'Ez nem Word (.docx) fájl.';
  end if;
  if char_length(v_fajl) > 2800000 then
    raise exception 'A fájl túl nagy, legfeljebb 2 MB lehet.';
  end if;
  v_meret := octet_length(decode(v_fajl, 'base64'));
  if v_tart is null or jsonb_typeof(v_tart) <> 'array' or jsonb_array_length(v_tart) = 0 then
    raise exception 'A dokumentumban nincs szöveg.';
  end if;
  if octet_length(v_tart::text) > 1500000 then
    raise exception 'A dokumentum szövege túl hosszú.';
  end if;

  v_ki := public.jogi_sajat_nev();

  perform pg_advisory_xact_lock(hashtext('jogi_valtozatok:' || v_dok || ':' || v_nyelv));

  if not exists (select 1 from public.jogi_valtozatok j where j.dokumentum = v_dok and j.nyelv = v_nyelv) then
    insert into public.jogi_valtozatok (dokumentum, nyelv, beepitett)
    values (v_dok, v_nyelv, true);
  end if;

  insert into public.jogi_valtozatok (dokumentum, nyelv, fajlnev, fajl, meret, tartalom, feltolto, feltolto_nev, aktivalta_nev)
  values (v_dok, v_nyelv, v_nev, v_fajl, v_meret, v_tart, auth.uid(), v_ki, v_ki)
  returning id into v_id;

  delete from public.jogi_valtozatok j
   where j.dokumentum = v_dok and j.nyelv = v_nyelv
     and j.id not in (
       select k.id from public.jogi_valtozatok k
        where k.dokumentum = v_dok and k.nyelv = v_nyelv
        order by k.aktivalas desc
        limit 4
     );

  return v_id;
end;
$$;

revoke all on function public.jogi_valtozat_feltoltes(jsonb) from public, anon;
grant execute on function public.jogi_valtozat_feltoltes(jsonb) to authenticated;

create or replace function public.jogi_valtozat_fajl(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.jogi_valtozatok;
begin
  if not public.is_owner() then
    raise exception 'A jogi szövegeket csak a tulajdonos és a fejlesztő kezelheti.' using errcode = '42501';
  end if;
  select * into v from public.jogi_valtozatok j where j.id = p_id;
  if not found then
    raise exception 'Ez a változat már nincs meg.';
  end if;
  return jsonb_build_object('fajlnev', v.fajlnev, 'fajl', v.fajl, 'beepitett', v.beepitett);
end;
$$;

revoke all on function public.jogi_valtozat_fajl(uuid) from public, anon;
grant execute on function public.jogi_valtozat_fajl(uuid) to authenticated;

create or replace function public.jogi_valtozat_visszaallitas(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v public.jogi_valtozatok;
begin
  if not public.is_owner() then
    raise exception 'A jogi szövegeket csak a tulajdonos és a fejlesztő kezelheti.' using errcode = '42501';
  end if;
  select * into v from public.jogi_valtozatok j where j.id = p_id;
  if not found then
    raise exception 'Ez a változat már nincs meg.';
  end if;
  perform pg_advisory_xact_lock(hashtext('jogi_valtozatok:' || v.dokumentum || ':' || v.nyelv));
  update public.jogi_valtozatok
     set aktivalas = nextval('public.jogi_aktivalas_seq'),
         aktivalva = now(),
         aktivalta_nev = public.jogi_sajat_nev()
   where id = p_id;
end;
$$;

revoke all on function public.jogi_valtozat_visszaallitas(uuid) from public, anon;
grant execute on function public.jogi_valtozat_visszaallitas(uuid) to authenticated;

create or replace function public.publikus_jogi(p_dokumentum text, p_nyelv text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when v.beepitett then null else v.tartalom end
    from public.jogi_valtozatok v
   where v.dokumentum = p_dokumentum and v.nyelv = p_nyelv
   order by v.aktivalas desc
   limit 1
$$;

revoke all on function public.publikus_jogi(text, text) from public;
grant execute on function public.publikus_jogi(text, text) to anon, authenticated;
