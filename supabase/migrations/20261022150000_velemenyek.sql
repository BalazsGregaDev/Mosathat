create table if not exists public.velemenyek (
  id          uuid primary key default gen_random_uuid(),
  nev         text not null check (char_length(nev) between 1 and 80),
  csillag     smallint not null check (csillag between 1 and 5),
  szoveg      text not null check (char_length(szoveg) between 1 and 1500),
  datum       date,
  aktiv       boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.velemenyek enable row level security;
revoke all on public.velemenyek from anon, authenticated;

create or replace function public.velemenyek_lista()
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
    select jsonb_agg(jsonb_build_object(
             'id', v.id, 'nev', v.nev, 'csillag', v.csillag, 'szoveg', v.szoveg,
             'datum', v.datum, 'aktiv', v.aktiv)
           order by v.sort_order, v.created_at)
      from public.velemenyek v), '[]'::jsonb);
end;
$$;

create or replace function public.velemenyek_mentes(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sor   jsonb;
  v_n     integer := 0;
  v_nev   text;
  v_szov  text;
  v_cs    integer;
begin
  if not public.is_owner() then
    raise exception 'A véleményeket csak a tulajdonos és a fejlesztő módosíthatja.' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'array' then
    raise exception 'Hibás adat.';
  end if;
  if jsonb_array_length(p) > 60 then
    raise exception 'Legfeljebb 60 vélemény vehető fel.';
  end if;
  for v_sor in select * from jsonb_array_elements(p) loop
    v_nev := btrim(coalesce(v_sor->>'nev', ''));
    v_szov := btrim(coalesce(v_sor->>'szoveg', ''));
    v_cs := nullif(v_sor->>'csillag', '')::integer;
    if v_nev = '' or v_szov = '' then
      raise exception 'Minden véleménynél add meg a nevet és a szöveget.';
    end if;
    if char_length(v_nev) > 80 then
      raise exception 'A név legfeljebb 80 karakter lehet.';
    end if;
    if char_length(v_szov) > 1500 then
      raise exception 'Egy vélemény legfeljebb 1500 karakter lehet.';
    end if;
    if v_cs is null or v_cs < 1 or v_cs > 5 then
      raise exception 'A csillagok száma 1 és 5 között lehet.';
    end if;
  end loop;

  delete from public.velemenyek where true;
  for v_sor in select * from jsonb_array_elements(p) loop
    insert into public.velemenyek (nev, csillag, szoveg, datum, aktiv, sort_order)
    values (btrim(v_sor->>'nev'), (v_sor->>'csillag')::smallint, btrim(v_sor->>'szoveg'),
            nullif(v_sor->>'datum', '')::date, coalesce((v_sor->>'aktiv')::boolean, true), v_n);
    v_n := v_n + 1;
  end loop;
end;
$$;

alter function public.publikus_oldal() rename to publikus_oldal_alap;
revoke all on function public.publikus_oldal_alap() from public, anon, authenticated;

create function public.publikus_oldal()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.publikus_oldal_alap() || jsonb_build_object(
    'velemenyek', coalesce((
      select jsonb_agg(jsonb_build_object('nev', v.nev, 'csillag', v.csillag, 'szoveg', v.szoveg, 'datum', v.datum)
             order by v.sort_order, v.created_at)
        from public.velemenyek v
       where v.aktiv and v.csillag >= 4), '[]'::jsonb));
$$;

revoke all on function public.publikus_oldal() from public;
grant execute on function public.publikus_oldal() to anon, authenticated;

revoke all on function public.velemenyek_lista() from public, anon;
revoke all on function public.velemenyek_mentes(jsonb) from public, anon;
grant execute on function public.velemenyek_lista() to authenticated;
grant execute on function public.velemenyek_mentes(jsonb) to authenticated;
