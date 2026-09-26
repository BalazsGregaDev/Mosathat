-- =============================================================================
--  20260926090000_munkalap.sql — a munkalap használhatóvá tétele
-- =============================================================================
--  Egy Elit csomagnál 14 lépés van a listán. Ezeket a mosóállásban vizes
--  kézzel egyenként kipipálni értelmetlen: ami a csomag része, az úgyis
--  elkészül. Amit KÜLÖN kértek, az az érdekes.
--
--  Ezért a listát kétfelé bontjuk (kívül / belül), és csoportosan lehet
--  pipálni azt, ami a csomaghoz tartozik. A csomagon kívüli tételek —
--  kárpittisztítás, motortér, ózon — külön maradnak.
--
--  Ehhez tudni kell egy lépésről, hogy a csomagból jön-e vagy extrából.
--  Eddig ez nem látszott: a booking_tasks csak a nevet tárolta.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1. Honnan jön a lépés
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_source') then
    create type task_source as enum ('PACKAGE', 'EXTRA');
  end if;
end $$;

alter table public.booking_tasks
  add column if not exists source task_source not null default 'PACKAGE';

comment on column public.booking_tasks.source is
  'PACKAGE: a csomag része, csoportosan pipálható. EXTRA: külön kérték, külön pipa.';


-- -----------------------------------------------------------------------------
--  2. A terv is adja vissza a forrást
-- -----------------------------------------------------------------------------

drop function if exists public.booking_task_plan(uuid);

create function public.booking_task_plan(p_booking_id uuid)
returns table (name text, area service_area, sort_order integer, source task_source)
language sql
stable
as $$
  -- a csomag tételei, a terjedelem szerint szűrve
  -- (egy "csak kívül" foglalás listájára nem kerülhet fel a porszívózás)
  select r.name, r.area, r.sort_order, 'PACKAGE'::task_source
    from public.bookings b
    join lateral public.resolve_package_items(b.package_id) r on true
   where b.id = p_booking_id
     and b.package_id is not null
     and (b.scope = 'TELJES' or r.area::text = b.scope::text)

  union all

  -- a választott extrák, a csomag lépései után
  select bi.name_snapshot, e.area, 900 + bi.sort_order, 'EXTRA'::task_source
    from public.booking_items bi
    left join public.extras e on e.id = bi.ref_id
   where bi.booking_id = p_booking_id
     and bi.kind in ('EXTRA', 'FULL_SERVICE');
$$;


create or replace function public.rebuild_booking_tasks(p_booking_id uuid)
returns integer
language plpgsql
volatile
as $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.bookings where id = p_booking_id) then
    raise exception 'Nincs ilyen foglalás: %', p_booking_id;
  end if;

  -- Kivesszük azt, ami már nem kell — de csak ha NINCS kipipálva.
  delete from public.booking_tasks t
   where t.booking_id = p_booking_id
     and not t.done
     and not exists (
       select 1 from public.booking_task_plan(p_booking_id) k where k.name = t.name);

  -- Betesszük, ami hiányzik.
  insert into public.booking_tasks (booking_id, name, area, sort_order, source)
  select p_booking_id, k.name, k.area, min(k.sort_order), min(k.source::text)::task_source
    from public.booking_task_plan(p_booking_id) k
   where not exists (
     select 1 from public.booking_tasks t
      where t.booking_id = p_booking_id and t.name = k.name)
   group by k.name, k.area;

  select count(*) into v_count from public.booking_tasks where booking_id = p_booking_id;
  return v_count;
end;
$$;

-- A már meglévő foglalások lépéseit is megjelöljük: ami extrából jött, azt
-- a booking_items alapján találjuk meg.
update public.booking_tasks t
   set source = 'EXTRA'
  from public.booking_items bi
 where bi.booking_id = t.booking_id
   and bi.kind in ('EXTRA', 'FULL_SERVICE')
   and bi.name_snapshot = t.name;


-- -----------------------------------------------------------------------------
--  3. Csoportos pipálás
-- -----------------------------------------------------------------------------
--  Egy gomb, egy kérés. Nem 12 külön hívás a böngészőből.
--
--  Csak a csomaghoz tartozó lépéseket érinti: a külön kért szolgáltatásokat
--  szándékosan kihagyja, mert azoknál számít, hogy tényleg megcsinálták-e.

create or replace function public.toggle_task_group(
  p_booking_id uuid,
  p_area       service_area,
  p_done       boolean)
returns integer      -- hány lépést érintett
language plpgsql
volatile
as $$
declare
  v_n integer;
begin
  update public.booking_tasks
     set done    = p_done,
         done_at = case when p_done then now() else null end,
         done_by = case when p_done then (select s.id from public.staff s where s.id = auth.uid()) end
   where booking_id = p_booking_id
     and area = p_area
     and source = 'PACKAGE'
     and done <> p_done;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.toggle_task_group is
  'A csomaghoz tartozó kívüli vagy belüli lépések egyben. Az extrák érintetlenek.';


-- -----------------------------------------------------------------------------
--  4. Megjegyzés szerkesztése a már felvett foglaláson
-- -----------------------------------------------------------------------------
--  Menet közben derül ki a legtöbb fontos dolog: "a kulcs a kesztyűtartóban",
--  "a hátsó lökhárító már így jött". Ezt akkor kell tudni leírni, amikor
--  elhangzik, nem a foglaláskor.

create or replace function public.set_booking_notes(
  p_booking_id uuid,
  p_notes      text)
returns void
language sql
volatile
as $$
  update public.bookings
     set notes = nullif(trim(coalesce(p_notes, '')), ''),
         updated_at = now()
   where id = p_booking_id;
$$;


-- -----------------------------------------------------------------------------
--  5. Lezárt foglalás zárolása
-- -----------------------------------------------------------------------------
--  A lezárt időpont végleges munkalap. Attól kezdve nem lehet hozzányúlni —
--  se a listához, se az árhoz. Ezt nem a felületen kell megakadályozni,
--  hanem itt: a felület elromolhat, a szabály nem.

create or replace function public.lezart_e(p_booking_id uuid)
returns boolean
language sql
stable
as $$
  select status = 'COMPLETED' from public.bookings where id = p_booking_id;
$$;

create or replace function public.booking_tasks_zarolas()
returns trigger
language plpgsql
as $$
begin
  if public.lezart_e(coalesce(new.booking_id, old.booking_id)) then
    raise exception 'A foglalás le van zárva, a munkalista nem módosítható.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists booking_tasks_zarolas_trg on public.booking_tasks;
create trigger booking_tasks_zarolas_trg
  before insert or update or delete on public.booking_tasks
  for each row execute function public.booking_tasks_zarolas();


-- A lezárt foglalás árát és adatait sem lehet átírni. A státuszt viszont
-- igen: egy téves lezárást vissza kell tudni vonni.
create or replace function public.bookings_zarolas()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'COMPLETED' and new.status = 'COMPLETED' then
    if new.final_price_huf     is distinct from old.final_price_huf
    or new.estimated_price_huf is distinct from old.estimated_price_huf
    or new.package_id          is distinct from old.package_id
    or new.scope               is distinct from old.scope
    or new.full_service        is distinct from old.full_service
    or new.notes               is distinct from old.notes then
      raise exception 'A foglalás le van zárva. Ha javítani kell, előbb vissza kell nyitni.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_zarolas_trg on public.bookings;
create trigger bookings_zarolas_trg
  before update on public.bookings
  for each row execute function public.bookings_zarolas();


grant execute on function public.toggle_task_group(uuid, service_area, boolean) to authenticated;
grant execute on function public.set_booking_notes(uuid, text)                  to authenticated;
