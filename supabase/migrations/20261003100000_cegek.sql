create or replace function public.ceg_kulcs(p text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  s := public.ekezettelen(coalesce(p, ''));
  s := translate(s, 'àâäãåçèêëìîïñòôõøùûýÿß', 'aaaaaceeeiiinoooouuyys');

  s := ' ' || regexp_replace(s, '[^a-z0-9]+', ' ', 'g') || ' ';

  s := regexp_replace(s,
    ' (kft|zrt|nyrt|bt|kkt|rt|kht|nkft|ev|nonprofit|ltd|gmbh|kg|ag|sro|srl|inc|llc|co) ', ' ', 'g');
  s := regexp_replace(s,
    ' (kft|zrt|nyrt|bt|kkt|rt|kht|nkft|ev|nonprofit|ltd|gmbh|kg|ag|sro|srl|inc|llc|co) ', ' ', 'g');

  s := regexp_replace(s, '\s+', '', 'g');

  s := regexp_replace(s, '(.)\1+', '\1', 'g');

  return nullif(s, '');
end;
$$;

create or replace function public.ceg_tavolsag(a text, b text)
returns integer
language plpgsql
immutable
as $$
declare
  la integer := length(coalesce(a, ''));
  lb integer := length(coalesce(b, ''));
  elozo integer[];
  most  integer[];
  i integer;
  j integer;
  koltseg integer;
begin
  if la = 0 then return lb; end if;
  if lb = 0 then return la; end if;

  elozo := array(select generate_series(0, lb));
  for i in 1..la loop
    most := array[i];
    for j in 1..lb loop
      koltseg := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      most := most || least(elozo[j + 1] + 1, most[j] + 1, elozo[j] + koltseg);
    end loop;
    elozo := most;
  end loop;
  return elozo[lb + 1];
end;
$$;

create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_key    text not null unique,
  tax_number  text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.companies enable row level security;

drop policy if exists companies_olvas on public.companies;
create policy companies_olvas on public.companies
  for select to authenticated using (public.is_staff());

alter table public.customers
  add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists customers_company_idx on public.customers (company_id);

insert into public.companies (name, name_key, tax_number)
select distinct on (k.kulcs) k.nev, k.kulcs, k.adoszam
  from (
    select trim(coalesce(nullif(trim(c.company_name), ''),
                         case when c.type = 'CEG' then c.name end)) as nev,
           public.ceg_kulcs(coalesce(nullif(trim(c.company_name), ''),
                                     case when c.type = 'CEG' then c.name end)) as kulcs,
           c.tax_number as adoszam,
           c.created_at
      from public.customers c
  ) k
 where k.kulcs is not null
 order by k.kulcs, k.created_at
on conflict (name_key) do nothing;

update public.customers c
   set company_id   = co.id,
       company_name = co.name
  from public.companies co
 where co.name_key = public.ceg_kulcs(coalesce(nullif(trim(c.company_name), ''),
                                               case when c.type = 'CEG' then c.name end))
   and c.company_id is null;

create or replace function public.customers_ceg_szinkron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kulcs text;
  v_id    uuid;
  v_nev   text;
begin
  if new.company_id is not null
     and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    select name into new.company_name from public.companies where id = new.company_id;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.company_id is null and old.company_id is not null
     and new.company_name is not distinct from old.company_name then
    new.company_name := null;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.company_name is not distinct from old.company_name then
    return new;
  end if;

  v_kulcs := public.ceg_kulcs(new.company_name);
  if v_kulcs is null then
    new.company_id   := null;
    new.company_name := null;
    return new;
  end if;

  if new.company_id is not null then
    select id, name into v_id, v_nev
      from public.companies where id = new.company_id and name_key = v_kulcs;
    if v_id is not null then
      new.company_name := v_nev;
      return new;
    end if;
  end if;

  insert into public.companies (name, name_key)
  values (trim(new.company_name), v_kulcs)
  on conflict (name_key) do update set name = public.companies.name
  returning id, name into v_id, v_nev;

  new.company_id   := v_id;
  new.company_name := v_nev;
  return new;
end;
$$;

drop trigger if exists customers_ceg_szinkron on public.customers;
create trigger customers_ceg_szinkron
  before insert or update of company_name, company_id on public.customers
  for each row execute function public.customers_ceg_szinkron();

create or replace function public.companies_nev_atvezet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.customers set company_name = new.name where company_id = new.id;
  return new;
end;
$$;

drop trigger if exists companies_nev_atvezet on public.companies;
create trigger companies_nev_atvezet
  after update of name on public.companies
  for each row when (old.name is distinct from new.name)
  execute function public.companies_nev_atvezet();

create or replace function public.companies_kulcs()
returns trigger
language plpgsql
as $$
begin
  new.name_key   := coalesce(public.ceg_kulcs(new.name), new.name_key);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists companies_kulcs on public.companies;
create trigger companies_kulcs
  before insert or update of name on public.companies
  for each row execute function public.companies_kulcs();

create or replace function public.ceg_jeloltek(p_nev text)
returns table (id uuid, name text, egyezes text)
language plpgsql
stable
as $$
declare
  v_kulcs text := public.ceg_kulcs(p_nev);
  v_tures integer;
begin
  if v_kulcs is null then return; end if;
  v_tures := case when length(v_kulcs) >= 6 then 2 when length(v_kulcs) >= 4 then 1 else 0 end;

  return query
    select co.id, co.name,
           case when co.name_key = v_kulcs then 'AZONOS' else 'HASONLO' end
      from public.companies co
     where co.name_key = v_kulcs
        or (v_tures > 0 and abs(length(co.name_key) - length(v_kulcs)) <= v_tures
            and public.ceg_tavolsag(co.name_key, v_kulcs) <= v_tures)
        or (least(length(co.name_key), length(v_kulcs)) >= 4
            and (co.name_key like v_kulcs || '%' or v_kulcs like co.name_key || '%'))
     order by (co.name_key = v_kulcs) desc,
              public.ceg_tavolsag(co.name_key, v_kulcs),
              co.name
     limit 5;
end;
$$;

grant execute on function public.ceg_jeloltek(text) to authenticated;
grant execute on function public.ceg_kulcs(text) to authenticated, anon;
