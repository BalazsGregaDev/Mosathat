alter table public.company_booking_links drop constraint if exists company_booking_links_token_check;
alter table public.company_booking_links add constraint company_booking_links_token_check
  check (token is null or (token ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' and char_length(token) between 3 and 64));

alter table public.customer_booking_links drop constraint if exists customer_booking_links_token_check;
alter table public.customer_booking_links add constraint customer_booking_links_token_check
  check (token ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' and char_length(token) between 3 and 64);

create or replace function public.link_cim_norm(p text)
returns text
language sql
immutable
as $$
  select left(btrim(regexp_replace(regexp_replace(public.ekezettelen(btrim(coalesce(p, ''))), '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g'), '-'), 64);
$$;

revoke all on function public.link_cim_norm(text) from public, anon;
grant execute on function public.link_cim_norm(text) to authenticated;

create or replace function public.ceg_link_ceg(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.company_id
    from public.company_booking_links l
   where lower(coalesce(p_token, '')) ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
     and l.token = lower(p_token)
     and public.ceg_szerzodes_aktiv(l.company_id, (now() at time zone 'Europe/Budapest')::date) is not null;
$$;

revoke all on function public.ceg_link_ceg(text) from public, anon, authenticated;

create or replace function public.berlet_link_ugyfel(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.customer_id
    from public.customer_booking_links l
   where lower(coalesce(p_token, '')) ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
     and l.token = lower(p_token)
     and public.berlet_aktiv(l.customer_id);
$$;

revoke all on function public.berlet_link_ugyfel(text) from public, anon, authenticated;

create or replace function public.ceg_link_cim(p_company uuid, p_cim text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_regi text;
  v_cim  text := public.link_cim_norm(p_cim);
begin
  if not public.is_owner() then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  if public.ceg_szerzodes_aktiv(p_company, (now() at time zone 'Europe/Budapest')::date) is null then
    raise exception 'Ennek a cégnek nincs érvényes szerződése, ezért foglalási link sem készíthető.';
  end if;
  if char_length(v_cim) < 3 then
    raise exception 'A link címe legalább 3 karakter legyen: kisbetű, szám vagy kötőjel.';
  end if;

  select l.token into v_regi from public.company_booking_links l where l.company_id = p_company;
  if v_regi = v_cim then
    return v_cim;
  end if;
  if exists (select 1 from public.company_booking_links l where l.token = v_cim and l.company_id <> p_company) then
    raise exception 'Ez a cím már egy másik cég linkje, válassz másikat.';
  end if;

  insert into public.company_booking_links (company_id, token, created_at, created_by, updated_at)
  values (p_company, v_cim, now(), auth.uid(), now())
  on conflict (company_id) do update
    set token = excluded.token, created_at = now(), created_by = auth.uid(), updated_at = now();

  insert into public.audit_log (staff_id, entity, entity_id, action, before, after)
  values ((select s.id from public.staff s where s.id = auth.uid()), 'company_booking_links', p_company,
          case when v_regi is null then 'link_letrehozva' else 'link_atirva' end,
          case when v_regi is null then null else jsonb_build_object('token', v_regi) end,
          jsonb_build_object('token', v_cim));

  return v_cim;
end;
$$;

revoke all on function public.ceg_link_cim(uuid, text) from public, anon;
grant execute on function public.ceg_link_cim(uuid, text) to authenticated;

create or replace function public.berlet_link_cim(p_customer uuid, p_cim text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_regi text;
  v_cim  text := public.link_cim_norm(p_cim);
begin
  if not public.can_edit_customers() then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  if not public.berlet_aktiv(p_customer) then
    raise exception 'Ennek az ügyfélnek nincs érvényes bérlete, ezért foglalási link sem készíthető.';
  end if;
  if char_length(v_cim) < 3 then
    raise exception 'A link címe legalább 3 karakter legyen: kisbetű, szám vagy kötőjel.';
  end if;

  select l.token into v_regi from public.customer_booking_links l where l.customer_id = p_customer;
  if v_regi = v_cim then
    return v_cim;
  end if;
  if exists (select 1 from public.customer_booking_links l where l.token = v_cim and l.customer_id <> p_customer) then
    raise exception 'Ez a cím már egy másik bérletes linkje, válassz másikat.';
  end if;

  insert into public.customer_booking_links (customer_id, token, created_at, created_by)
  values (p_customer, v_cim, now(), (select s.id from public.staff s where s.id = auth.uid()))
  on conflict (customer_id) do update
    set token = excluded.token, created_at = now(), created_by = excluded.created_by;

  insert into public.audit_log (staff_id, entity, entity_id, action, before, after)
  values ((select s.id from public.staff s where s.id = auth.uid()), 'customer_booking_links', p_customer,
          case when v_regi is null then 'link_letrehozva' else 'link_atirva' end,
          case when v_regi is null then null else jsonb_build_object('token', v_regi) end,
          jsonb_build_object('token', v_cim));

  return v_cim;
end;
$$;

revoke all on function public.berlet_link_cim(uuid, text) from public, anon;
grant execute on function public.berlet_link_cim(uuid, text) to authenticated;
