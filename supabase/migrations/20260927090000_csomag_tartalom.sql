create or replace function public.resolve_package_slots(p_package_id uuid)
returns table (
  slot_id    uuid,
  slot_name  text,
  item_id    uuid,
  name       text,
  area       service_area,
  sort_order integer)
language sql
stable
as $$
  with recursive
  chain as (
    select p.id, p.includes_package_id
      from public.packages p
     where p.id = p_package_id
    union all
    select p.id, p.includes_package_id
      from public.packages p
      join chain c on p.id = c.includes_package_id
  ),
  items as (
    select pi.*
      from public.package_items pi
      join chain c on c.id = pi.package_id
     where pi.active
  ),
  hatasos as (
    select i.*
      from items i
     where not exists (select 1 from items o where o.overrides_item_id = i.id)
  ),
  lanc as (
    select h.id as item_id, h.id as lepcso, h.overrides_item_id
      from hatasos h
    union all
    select l.item_id, pi.id, pi.overrides_item_id
      from lanc l
      join public.package_items pi on pi.id = l.overrides_item_id
  ),
  gyoker as (
    select l.item_id, l.lepcso as slot_id
      from lanc l
     where l.overrides_item_id is null
  )
  select
    g.slot_id,
    (select pi.name from public.package_items pi where pi.id = g.slot_id) as slot_name,
    h.id,
    h.name,
    h.area,
    (select pi.sort_order from public.package_items pi where pi.id = g.slot_id) as sort_order
  from hatasos h
  join gyoker g on g.item_id = h.id
  order by h.area, 6;
$$;

create or replace function public.resolve_package_items(p_package_id uuid)
returns table (name text, area service_area, sort_order integer)
language sql
stable
as $$
  select s.name, s.area, s.sort_order
    from public.resolve_package_slots(p_package_id) s
   order by s.area, s.sort_order;
$$;

create or replace view public.v_package_matrix
with (security_invoker = on) as
select
  p.id           as package_id,
  p.code         as package_code,
  p.name         as package_name,
  p.sort_order   as package_sort,
  s.slot_id,
  s.slot_name,
  s.name,
  s.area,
  s.sort_order
from public.packages p
join lateral public.resolve_package_slots(p.id) s on true
where p.active;

create or replace view public.v_package_extra
with (security_invoker = on) as
select
  p.id    as package_id,
  p.code  as package_code,
  e.name  as parent_name,
  s.name,
  s.area,
  s.sort_order
from public.packages p
join public.packages e on e.id = p.includes_package_id
join lateral public.resolve_package_slots(p.id) s on true
where p.active
  and not exists (
    select 1
      from public.resolve_package_slots(p.includes_package_id) sz
     where sz.slot_id = s.slot_id
       and sz.name    = s.name
  );

grant execute on function public.resolve_package_slots(uuid) to authenticated;
grant select on public.v_package_matrix to authenticated;
grant select on public.v_package_extra  to authenticated;
