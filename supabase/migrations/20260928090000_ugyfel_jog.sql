-- =============================================================================
--  20260928090000_ugyfel_jog.sql
--  Ügyfél felvétele, és fiókonként állítható szerkesztési jog
-- =============================================================================
--  Két dolgot old meg, és a második megoldja az elsőt is.
--
--  1. ÜGYFÉL FELVÉTELE
--     Eddig ügyfél csak foglalással együtt keletkezett. A régi papíros
--     adatok feltöltéséhez viszont az kell, hogy előbb az ügyfél legyen meg,
--     és csak utána jöjjön a foglalása — vagy hogy egyáltalán ne is legyen
--     még foglalása, csak a törzsadata.
--
--  2. A JOG NEM A SZEREPKÖRBE VAN BEÉGETVE
--     Eddig a szabály úgy szólt: „alkalmazott nem szerkeszthet ügyfelet".
--     Ez a legtöbb napra igaz, de a régi adatok feltöltésekor pont nem: ott
--     mindenki gépel, aki ráér. Eddig ilyenkor vagy kódot kellett volna
--     írni, vagy szerepkört adni valakinek — az utóbbi viszont sokkal
--     többet ad, mint amennyi kell.
--
--     Ezért a jog állítható lett, KÉT szinten:
--
--       SZEREPKÖRÖNKÉNT  a role_permissions táblában. Egy kapcsoló az
--                        összes alkalmazottra — a feltöltés idejére be, a
--                        végén ki. Nem kell fiókonként végigkattintani.
--
--       FIÓKONKÉNT       a staff.can_edit_customers mezőben. Ez NULL, amíg
--                        a fiók a szerepkörét követi; true/false csak akkor
--                        kerül bele, ha valakinél kifejezetten másképp kell.
--
--     A kettő így nem üti egymást: a fiók szintjén csak az van eltárolva,
--     ami kivétel. Ha a szerepkör kapcsolóját átbillenti, azzal mindenki
--     mozdul, akinél nincs külön döntés — ez az, amit ilyenkor akarni
--     szokás.
--
--     Ez az elv később is használható: ha egy jog nem esik egybe a
--     szerepkörrel, nem kell hozzá új szerepkört kitalálni, és nem kell
--     hozzá kódot írni sem.
--
--  A jog EGY kapcsoló, két menüpontra: Ügyfelek, valamint Cégek és
--  bérletesek. Azért egy, mert a kettő ugyanazt az adatot írja — egy
--  céges ügyfél mindkét képernyőn ott van.
--
--  3. ÉS EGY HIBA, AMI MOST DERÜLT KI
--     Az ügyfelet a telefonszáma azonosítja, de a szám négyféleképpen kerül
--     be: +36 30…, 06 30…, 0036…, 30/…. Eddig csak a nem-számjegyeket
--     dobtuk el, így a „+36 30 111 2233" és a „06 30 111 2233" KÉT ügyfél
--     lett. A régi adatok feltöltésénél ez azonnal látszana, élesben pedig
--     csendben kettéhasítaná a törzsvendégek előzményét.
--
--     Ezért bekerül egy phone_norm függvény, és mostantól az dönti el az
--     egyezést — a felvételnél, a foglalásfelvételnél és a keresőben is.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1. A két új hely, ahol a jog lakik
-- -----------------------------------------------------------------------------

create table if not exists public.role_permissions (
  role               staff_role primary key,
  can_edit_customers boolean not null default false,
  updated_at         timestamptz not null default now()
);

comment on table public.role_permissions is
  'Szerepkör szintű jogok. Egy fiók ezt követi, amíg nincs rá külön beállítás.';

-- A fejlesztő és a tulajdonos eddig is szerkeszthetett; az alkalmazott nem.
-- Ez marad a kiindulás, hogy a migráció után semmi ne változzon magától.
insert into public.role_permissions (role, can_edit_customers) values
  ('SUPERADMIN',  true),
  ('TULAJDONOS',  true),
  ('STAFF',       false)
on conflict (role) do nothing;

alter table public.role_permissions enable row level security;

drop policy if exists role_permissions_olvas on public.role_permissions;
create policy role_permissions_olvas on public.role_permissions
  for select to authenticated using (true);
-- Írni csak a set_role_permission függvényen keresztül lehet (security definer),
-- ezért írási policy szándékosan nincs.

alter table public.staff
  add column if not exists can_edit_customers boolean;

comment on column public.staff.can_edit_customers is
  'Szerkesztheti-e az ügyfeleket, járműveket, bérleteket és szerződéseket. '
  'NULL = a szerepkör beállítását követi; true/false = erre a fiókra külön döntés.';


-- -----------------------------------------------------------------------------
--  2. Az őrszem függvény
-- -----------------------------------------------------------------------------
--  Egy helyen mondja meg a választ, és mindenki innen kérdezi: a felület, a
--  mentő függvények és az RLS is. Ha a szabály változik, itt változik.

create or replace function public.can_edit_customers()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(s.can_edit_customers, rp.can_edit_customers)
       from public.staff s
       left join public.role_permissions rp on rp.role = s.role
      where s.id = auth.uid() and s.active),
    false);
$$;

grant execute on function public.can_edit_customers() to authenticated;


-- -----------------------------------------------------------------------------
--  3. A telefonszám egy alakra hozva
-- -----------------------------------------------------------------------------
--  Ugyanaz a szám négyféleképpen kerül be, attól függően, ki gépeli:
--
--      +36 30 111 2233      06 30 111 2233      0036301112233      30/111-2233
--
--  Eddig a keresés csak a nem-számjegyeket dobta el, így a „+36…" és a „06…"
--  alak két KÜLÖN ügyfél lett. Az előzmény ezzel kettéhasad: a törzsvendég
--  fele az egyik soron, fele a másikon — és pont az az adat megy veszte, ami
--  miatt az egész rendszer épül.
--
--  Ez a függvény a belföldi alakra vág: elhagyja a nemzetközi (0036, +36) és
--  a belföldi (06) előhívót, és a maradékot adja vissza. Külföldi számhoz nem
--  nyúl — csak a 36-os országhívó számít magyarnak, és csak akkor, ha a hossz
--  is stimmel (mobil 9, budapesti vezetékes 8 jegy).
--
--  Nem tárolt mező, hanem függvény: a c.phone marad abban az alakban, ahogy
--  beírták (azt hívja fel az ügyintéző), az egyezést pedig ez dönti el.

create or replace function public.phone_norm(p text)
returns text
language sql
immutable
as $$
  with d as (
    select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as x
  )
  select nullif(
    case
      when x like '0036%'                        then substring(x from 5)
      when x like '06%'                          then substring(x from 3)
      when x like '36%' and length(x) in (10, 11) then substring(x from 3)
      else x
    end, '')
  from d;
$$;

comment on function public.phone_norm(text) is
  'Telefonszám összehasonlítható alakja: a belföldi és nemzetközi előhívó '
  'nélkül, csak számjegyek. A +36 30 111 2233 és a 06 30 111 2233 ugyanaz.';

grant execute on function public.phone_norm(text) to authenticated, anon;


-- -----------------------------------------------------------------------------
--  4. Ügyfél felvétele
-- -----------------------------------------------------------------------------
--  Név és telefonszám kell hozzá — ezen a kettőn talál rá bárki később.
--  A telefonszámot nem formázzuk át: külföldi szám is jöhet, és a
--  keresés úgyis mindkét alakra illeszkedik.

create or replace function public.add_customer(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nev  text := trim(coalesce(p->>'name',''));
  v_tel  text := trim(coalesce(p->>'phone',''));
  v_id   uuid;
  v_regi text;
begin
  if not public.can_edit_customers() then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.' using errcode = '42501';
  end if;

  if v_nev = '' then raise exception 'A név nem maradhat üresen.'; end if;
  if v_tel = '' then raise exception 'A telefonszám nem maradhat üresen.'; end if;

  -- Ugyanaz a szám kétszer szinte mindig elgépelés vagy duplikátum. Nem
  -- tiltjuk (egy családban közös szám is előfordul), de megmondjuk, kinél
  -- van már — így a felvevő dönt, nem a rendszer.
  select c.name into v_regi
    from public.customers c
   where public.phone_norm(c.phone) = public.phone_norm(v_tel)
   limit 1;

  if v_regi is not null and coalesce((p->>'megis')::boolean, false) is not true then
    raise exception 'Ezzel a telefonszámmal már van ügyfél: %', v_regi
      using hint = 'Ha tényleg két külön ügyfélről van szó, vedd fel mégis.';
  end if;

  insert into public.customers (name, phone, email, type, company_name, tax_number,
                                notes, internal_notes)
  values (v_nev, v_tel,
          nullif(trim(p->>'email'),''),
          coalesce(nullif(p->>'type','')::customer_type, 'MAGAN'),
          nullif(trim(p->>'company_name'),''),
          nullif(trim(p->>'tax_number'),''),
          nullif(trim(p->>'notes'),''),
          nullif(trim(p->>'internal_notes'),''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.add_customer(jsonb) to authenticated;


-- -----------------------------------------------------------------------------
--  5. A meglévő függvények az új jogot nézik
-- -----------------------------------------------------------------------------
--  Eddig a szerepkört vizsgálták („nem STAFF"). Most a kapcsolót — így
--  ugyanaz a szabály él a felületen és az adatbázisban, és a feltöltés
--  idejére elég a kapcsolót átbillenteni.

create or replace function public.add_vehicle(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_customer uuid := (p->>'customer_id')::uuid;
  v_plate    text := trim(coalesce(p->>'plate_raw',''));
  v_norm     text := upper(regexp_replace(v_plate, '[^A-Za-z0-9]', '', 'g'));
  v_letezo   uuid;
  v_gazda    text;
  v_id       uuid;
begin
  if not public.can_edit_customers() then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.customers c where c.id = v_customer) then
    raise exception 'Nincs ilyen ügyfél.';
  end if;

  if v_plate = '' then
    raise exception 'A rendszám nem maradhat üresen.';
  end if;

  select v.id, c.name into v_letezo, v_gazda
    from public.vehicles v
    join public.customers c on c.id = v.customer_id
   where v.plate_normalized = v_norm
   limit 1;

  if v_letezo is not null then
    if (select customer_id from public.vehicles where id = v_letezo) = v_customer then
      raise exception 'Ez a rendszám már szerepel nála.';
    end if;
    raise exception 'Ez a rendszám már % ügyfélhez tartozik.', v_gazda
      using hint = 'Ha az autó gazdát cserélt, a régi ügyfélnél kell átírni — '
                || 'így az előzménye is vele marad.';
  end if;

  insert into public.vehicles (customer_id, plate_raw, plate_country, brand, model,
                               category, seats, notes)
  values (v_customer,
          v_plate,
          coalesce(nullif(p->>'plate_country',''), 'HU'),
          nullif(trim(p->>'brand'),''),
          nullif(trim(p->>'model'),''),
          coalesce(nullif(p->>'category','')::vehicle_category, 'SZEMELYAUTO'),
          nullif(p->>'seats','')::integer,
          nullif(trim(p->>'notes'),''))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.add_vehicle(jsonb) to authenticated;


-- -----------------------------------------------------------------------------
--  6. Ügyfél és jármű szerkesztése: a kapcsoló dönt
-- -----------------------------------------------------------------------------
--  A törzs változatlan, csak az őrszem lett más: a szerepkör helyett a
--  can_edit_customers kapcsolót nézi.

create or replace function public.save_customer(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := (p->>'id')::uuid;
begin
  if not public.can_edit_customers() then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.'
      using errcode = '42501',
            hint = 'A foglaláshoz tartozó adatokat a foglalási ablakban tudod átírni.';
  end if;

  if v_id is null then
    raise exception 'Hiányzik az ügyfél azonosítója.';
  end if;

  -- A név és a telefonszám kötelező az adatbázisban. Üresre állítani nem
  -- lehet — de aki csak az e-mailt írja át, annak nem kell újra beírnia.
  update public.customers
     set name           = coalesce(nullif(trim(p->>'name'),''), name),
         phone          = coalesce(nullif(trim(p->>'phone'),''), phone),
         email          = case when p ? 'email'
                               then nullif(trim(p->>'email'),'') else email end,
         type           = coalesce(nullif(p->>'type','')::customer_type, type),
         company_name   = case when p ? 'company_name'
                               then nullif(trim(p->>'company_name'),'') else company_name end,
         tax_number     = case when p ? 'tax_number'
                               then nullif(trim(p->>'tax_number'),'') else tax_number end,
         default_travel_minutes = case when p ? 'default_travel_minutes'
                               then nullif(p->>'default_travel_minutes','')::integer
                               else default_travel_minutes end,
         notes          = case when p ? 'notes'
                               then nullif(trim(p->>'notes'),'') else notes end,
         internal_notes = case when p ? 'internal_notes'
                               then nullif(trim(p->>'internal_notes'),'') else internal_notes end,
         updated_at     = now()
   where id = v_id;

  if not found then
    raise exception 'Nincs ilyen ügyfél.';
  end if;
  return v_id;
end;
$$;


create or replace function public.save_vehicle(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid := (p->>'id')::uuid;
begin
  if not public.can_edit_customers() then
    raise exception 'A járműadatokat a tulajdonos kezeli.'
      using errcode = '42501',
            hint = 'A foglaláshoz tartozó adatokat a foglalási ablakban tudod átírni.';
  end if;

  if v_id is null then
    raise exception 'Hiányzik a jármű azonosítója.';
  end if;

  update public.vehicles
     set plate_raw = coalesce(nullif(trim(p->>'plate_raw'),''), plate_raw),
         brand     = case when p ? 'brand' then nullif(trim(p->>'brand'),'') else brand end,
         model     = case when p ? 'model' then nullif(trim(p->>'model'),'') else model end,
         year      = case when p ? 'year' then nullif(p->>'year','')::integer else year end,
         category  = coalesce(nullif(p->>'category','')::vehicle_category, category),
         seats     = case when p ? 'seats' then nullif(p->>'seats','')::integer else seats end,
         notes     = case when p ? 'notes' then nullif(trim(p->>'notes'),'') else notes end,
         updated_at = now()
   where id = v_id;

  if not found then
    raise exception 'Nincs ilyen jármű.';
  end if;

  -- A jármű kategóriája a foglalás árát is meghatározza. A MÁR FELVETT,
  -- még le nem zárt foglalásokat ezért újraszámoljuk — különben a lista
  -- egy SUV-ot mutatna személyautó áron, és csak a fizetésnél derülne ki.
  if nullif(p->>'category','') is not null then
    perform public.patch_booking(b.id, jsonb_build_object('category', p->>'category'))
      from public.bookings b
     where b.vehicle_id = v_id
       and b.status not in ('COMPLETED','CANCELLED_BY_CUSTOMER','CANCELLED_BY_SHOP',
                            'NO_SHOW','REJECTED');
  end if;

  return v_id;
end;
$$;


grant execute on function public.save_customer(jsonb) to authenticated;
grant execute on function public.save_vehicle(jsonb)  to authenticated;


-- -----------------------------------------------------------------------------
--  7. A felhasználólista és a mentés ismerje az új mezőt
-- -----------------------------------------------------------------------------

drop function if exists public.list_staff();

create or replace function public.list_staff()
returns table (
  id            uuid,
  full_name     text,
  role          staff_role,
  active        boolean,
  email         text,
  belepett_mar  boolean,
  meghivo       boolean,      -- még nincs fiókja, csak meghívva
  created_at    timestamptz,
  -- Amit a fiók MOST tud: a saját beállítása, ha van, egyébként a szerepköré.
  can_edit_customers boolean,
  -- Igaz, ha ez a fiók külön döntés, nem a szerepkörét követi. A felület
  -- ebből tudja felajánlani a „szerepkör szerint" visszaállítást.
  can_edit_customers_sajat boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.my_role() is null or public.my_role() = 'STAFF' then
    raise exception 'A felhasználók listájához nincs jogosultságod.'
      using errcode = '42501';
  end if;

  return query
  select s.id, s.full_name, s.role, s.active,
         u.email::text,
         -- Belépett-e már valaha. Egy felvett, de soha be nem lépett
         -- dolgozónál ez az első kérdés, amikor azt mondja, "nem enged be".
         (u.last_sign_in_at is not null),
         false,
         s.created_at,
         coalesce(s.can_edit_customers, rp.can_edit_customers, false),
         (s.can_edit_customers is not null)
    from public.staff s
    left join auth.users u on u.id = s.id
    left join public.role_permissions rp on rp.role = s.role

  union all

  -- A meghívók, amikhez még nem tartozik fiók. Enélkül a lista hazudna arról,
  -- hány embert vettek fel: a tulaj felvette, de a dolgozó még nem regisztrált.
  -- A meghívottnál még nincs mit állítani: amíg nincs fiókja, a szerepköre
  -- beállítását fogja követni.
  select null::uuid, i.full_name, i.role, true,
         i.email::text, false, true, i.created_at,
         coalesce(rp.can_edit_customers, false), false
    from public.staff_invites i
    left join public.role_permissions rp on rp.role = i.role
   where i.used_at is null

  order by 7, 3, 2;   -- előbb a meglévők, szerepkör, majd név szerint
end;
$$;

grant execute on function public.list_staff() to authenticated;


create or replace function public.set_staff(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id      uuid := (p->>'id')::uuid;
  v_sajat   staff_role := public.my_role();
  v_cel     staff_role;
  v_uj_role staff_role := nullif(p->>'role','')::staff_role;
begin
  select role into v_cel from public.staff where id = v_id;
  if not found then
    raise exception 'Nincs ilyen felhasználó.';
  end if;

  if v_sajat is null or v_sajat = 'STAFF' then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;

  if v_id = auth.uid() and (p ? 'active' or v_uj_role is not null) then
    raise exception 'A saját hozzáférésedet nem tudod elvenni.';
  end if;

  if v_sajat::text = 'TULAJDONOS' then
    if v_cel <> 'STAFF' then
      raise exception 'A fejlesztői és tulajdonosi hozzáférést a fejlesztő kezeli.'
        using errcode = '42501';
    end if;
    if v_uj_role is not null and v_uj_role <> 'STAFF' then
      raise exception 'Tulajdonosként alkalmazotti szerepkört tudsz adni.'
        using errcode = '42501';
    end if;
  end if;

  update public.staff
     set full_name = coalesce(nullif(trim(p->>'full_name'),''), full_name),
         role      = coalesce(v_uj_role, role),
         active    = coalesce((p->>'active')::boolean, active),
         -- A szerkesztési jog fiókonként is állítható. A kulcs jelenléte a
         -- döntés: érték = erre a fiókra külön szabály, json null = vissza a
         -- szerepköréhez. Szerepkörváltásnál a külön szabály elesik — azt egy
         -- másik szerepkörről hozták, és így egy alkalmazottból lett
         -- tulajdonos nem marad jog nélkül.
         can_edit_customers = case
           when p ? 'can_edit_customers' then (p->>'can_edit_customers')::boolean
           when v_uj_role is not null    then null
           else can_edit_customers end,
         updated_at = now()
   where id = v_id;
end;
$$;

grant execute on function public.set_staff(jsonb) to authenticated;


-- -----------------------------------------------------------------------------
--  8. A szerepkör szintű kapcsoló
-- -----------------------------------------------------------------------------
--  Ugyanaz a jogosultsági lépcső, mint a set_staff-ban: a tulajdonos az
--  alkalmazottakról dönt, a saját és a fejlesztői szintről nem. Enélkül egy
--  tulajdonos a szerepkör-kapcsolón keresztül megkerülhetné azt a szabályt,
--  hogy a fejlesztői hozzáférést nem ő kezeli.

create or replace function public.set_role_permission(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sajat staff_role := public.my_role();
  v_cel   staff_role := nullif(p->>'role','')::staff_role;
begin
  if v_sajat is null or v_sajat = 'STAFF' then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  if v_cel is null then
    raise exception 'Hiányzik a szerepkör.';
  end if;
  if v_sajat::text = 'TULAJDONOS' and v_cel <> 'STAFF' then
    raise exception 'A fejlesztői és tulajdonosi jogokat a fejlesztő kezeli.'
      using errcode = '42501';
  end if;
  if not (p ? 'can_edit_customers') then
    raise exception 'Nincs megadva, mit kell átállítani.';
  end if;

  insert into public.role_permissions (role, can_edit_customers)
  values (v_cel, (p->>'can_edit_customers')::boolean)
  on conflict (role) do update
     set can_edit_customers = excluded.can_edit_customers,
         updated_at         = now();
end;
$$;

grant execute on function public.set_role_permission(jsonb) to authenticated;


create or replace function public.list_role_permissions()
returns table (role staff_role, can_edit_customers boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.my_role() is null or public.my_role() = 'STAFF' then
    raise exception 'Ehhez nincs jogosultságod.' using errcode = '42501';
  end if;
  return query
    select rp.role, rp.can_edit_customers
      from public.role_permissions rp
     order by rp.role;
end;
$$;

grant execute on function public.list_role_permissions() to authenticated;


-- -----------------------------------------------------------------------------
--  9. A foglalásfelvétel is egy alakra hozva keres
-- -----------------------------------------------------------------------------
--  A create_booking eddig a nyers számjegyeken egyezett, tehát a „+36…" alakban
--  felvett ügyfélhez a „06…" alakkal érkező hívás új sort csinált. A törzs
--  változatlan, csak ez a keresés lett más — és a name/phone frissítés miatt
--  ez az egyetlen hely, ahol a duplikátum keletkezni tudott.

create or replace function public.create_booking(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_customer_id uuid;
  v_vehicle_id  uuid;
  v_booking_id  uuid;
  v_category    vehicle_category;
  v_scope       booking_scope;
  v_type        booking_type;
  v_date        date;
  v_package_id  uuid;
  v_full        boolean;
  v_extras      jsonb;
  v_pct         numeric;
  v_fix         integer;
  v_calc        record;
  v_start       timestamptz;
  v_drop        timestamptz;
  v_pick        timestamptz;
  v_deadline    timestamptz;
  v_staff       uuid;
  v_items_sum   integer := 0;
  v_sort        integer := 0;
  v_pp          record;
  v_fs          record;
  r             record;
  v_qty         numeric;
  v_line        integer;
begin
  v_category   := (p->>'category')::vehicle_category;
  v_scope      := coalesce((p->>'scope')::booking_scope, 'TELJES');
  v_type       := (p->>'booking_type')::booking_type;
  v_date       := (p->>'service_date')::date;
  v_package_id := nullif(p->>'package_id','')::uuid;
  v_full       := coalesce((p->>'full_service')::boolean, false);
  v_extras     := coalesce(p->'extras', '[]'::jsonb);
  v_pct        := coalesce((p->>'surcharge_pct')::numeric, 0);
  v_fix        := coalesce((p->>'surcharge_fix')::integer, 0);
  v_staff      := (select s.id from public.staff s where s.id = auth.uid());

  if v_category is null then raise exception 'Hiányzik a járműkategória.'; end if;
  if v_type     is null then raise exception 'Hiányzik a foglalás típusa.';  end if;
  if v_date     is null then raise exception 'Hiányzik a dátum.';            end if;

  -- ---------- 1. ÜGYFÉL ----------
  v_customer_id := nullif(p->>'customer_id','')::uuid;

  if v_customer_id is null then
    -- Ugyanazt a telefonszámot nem visszük fel kétszer: ha már ismerjük,
    -- ahhoz kötjük az autót. A telefonszám a gyakorlatban az azonosító.
    select c.id into v_customer_id
      from public.customers c
     where public.phone_norm(c.phone) = public.phone_norm(p->>'customer_phone')
       and public.phone_norm(p->>'customer_phone') is not null
     limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (name, phone, type)
    values (coalesce(nullif(p->>'customer_name',''), 'Névtelen'),
            coalesce(nullif(p->>'customer_phone',''), '—'),
            'MAGAN')
    returning id into v_customer_id;
  else
    -- amit most mondott, azt elmentjük, de nem törlünk felül meglévőt üressel
    update public.customers
       set name  = coalesce(nullif(p->>'customer_name',''),  name),
           phone = coalesce(nullif(p->>'customer_phone',''), phone),
           updated_at = now()
     where id = v_customer_id;
  end if;

  -- ---------- 2. JÁRMŰ ----------
  v_vehicle_id := nullif(p->>'vehicle_id','')::uuid;

  if v_vehicle_id is null and coalesce(p->>'plate_raw','') <> '' then
    select v.id into v_vehicle_id
      from public.vehicles v
     where v.plate_normalized = upper(regexp_replace(p->>'plate_raw', '[^A-Za-z0-9]', '', 'g'))
     limit 1;
  end if;

  if v_vehicle_id is null then
    insert into public.vehicles (customer_id, plate_raw, plate_country, brand, model, category, seats)
    values (v_customer_id,
            coalesce(nullif(p->>'plate_raw',''), '—'),
            coalesce(nullif(p->>'plate_country',''), 'HU'),
            nullif(p->>'brand',''),
            nullif(p->>'model',''),
            v_category,
            nullif(p->>'seats','')::integer)
    returning id into v_vehicle_id;
  else
    update public.vehicles
       set brand    = coalesce(nullif(p->>'brand',''),  brand),
           model    = coalesce(nullif(p->>'model',''),  model),
           category = v_category,      -- a felvevő most látja az autót
           seats    = coalesce(nullif(p->>'seats','')::integer, seats),
           updated_at = now()
     where id = v_vehicle_id;
  end if;

  -- ---------- 3. ÁR ÉS IDŐ ----------
  select * into v_calc
    from public.calc_service(v_package_id, v_category, v_scope, v_full, v_extras, v_pct, v_fix);

  -- ---------- időpontok ----------
  if nullif(p->>'start_time','') is not null then
    v_start := (v_date + (p->>'start_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'drop_off_time','') is not null then
    v_drop := (v_date + (p->>'drop_off_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'pick_up_time','') is not null then
    v_pick := (v_date + (p->>'pick_up_time')::time) at time zone 'Europe/Budapest';
  end if;
  if nullif(p->>'deadline_date','') is not null then
    v_deadline := ((p->>'deadline_date')::date
                   + coalesce(nullif(p->>'deadline_time','')::time, time '17:00'))
                  at time zone 'Europe/Budapest';
  end if;

  -- ---------- 4. FOGLALÁS ----------
  insert into public.bookings (
    customer_id, vehicle_id, booking_type, status, source, service_date,
    start_at, drop_off_at, pick_up_at, deadline_at,
    package_id, scope, full_service,
    planned_duration_minutes, rest_minutes, estimated_price_huf,
    notes, internal_notes, created_by)
  values (
    v_customer_id, v_vehicle_id, v_type,
    coalesce((p->>'status')::booking_status, 'CONFIRMED'),
    coalesce((p->>'source')::booking_source, 'TELEFON'),
    v_date,
    v_start, v_drop, v_pick, v_deadline,
    v_package_id, v_scope, v_full,
    coalesce(v_calc.work_minutes, 0),   -- ha nem ismert, 0 kerül be, és a
                                        -- felület jelzi, hogy pótolni kell
    coalesce(v_calc.rest_minutes, 0),
    coalesce(v_calc.price_huf, 0),
    nullif(p->>'notes',''),
    nullif(p->>'internal_notes',''),
    v_staff)
  returning id into v_booking_id;

  -- ---------- 5. TÉTELEK ----------
  -- Pillanatfelvétel: a név és az ár ide bemásolódik. Ha jövő januárban
  -- emelünk árat, a tavalyi foglalás akkor is a tavalyi árat mutatja.

  if v_package_id is not null then
    select pp.price_huf, pp.duration_minutes into v_pp
      from public.package_pricing pp
     where pp.package_id = v_package_id and pp.category = v_category and pp.scope = v_scope;

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    select v_booking_id, 'PACKAGE', v_package_id,
           pk.name || case when v_scope = 'TELJES' then '' else ' — ' || v_scope::text end,
           1, coalesce(v_pp.price_huf,0), coalesce(v_pp.price_huf,0),
           coalesce(v_pp.duration_minutes,0), v_sort
      from public.packages pk where pk.id = v_package_id;

    v_items_sum := v_items_sum + coalesce(v_pp.price_huf, 0);
    v_sort := v_sort + 1;
  end if;

  if v_full then
    select fp.price_huf into v_fs
      from public.full_service_pricing fp
     where fp.package_id = v_package_id and fp.category = v_category;

    -- A Full Service SAJÁT ártáblából megy, nem csomag + extra összegként.
    -- A tételsoron a különbözet jelenik meg, hogy a sorok összege stimmeljen.
    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (v_booking_id, 'FULL_SERVICE', null, 'Full Service (Csomag+Kárpit/Bőrtisztítás)',
            1, coalesce(v_fs.price_huf,0) - v_items_sum, coalesce(v_fs.price_huf,0) - v_items_sum,
            coalesce((select extra_work_minutes from public.full_service_pricing
                       where package_id = v_package_id and category = v_category), 45),
            v_sort);

    v_items_sum := coalesce(v_fs.price_huf, v_items_sum);
    v_sort := v_sort + 1;
  end if;

  for r in
    select e.*, coalesce((x->>'quantity')::numeric, 1) as qty
      from jsonb_array_elements(v_extras) as x
      join public.extras e on e.id = (x->>'extra_id')::uuid
     order by e.sort_order
  loop
    v_qty  := greatest(r.qty, 1);
    v_line := case
                when r.requires_quote or r.price_huf is null then 0
                when r.price_unit = 'ALKALOM' then r.price_huf
                else (r.price_huf * v_qty)::integer
              end;

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (v_booking_id, 'EXTRA', r.id, r.name,
            v_qty, coalesce(r.price_huf, 0), v_line,
            coalesce(r.work_minutes,0) * case when r.duration_unit = 'ALKALOM' then 1 else v_qty end,
            v_sort);

    v_items_sum := v_items_sum + v_line;
    v_sort := v_sort + 1;
  end loop;

  -- A felár sora pontosan a maradékot viszi. Így a tételsorok összege
  -- mindig egyezik a foglalás végösszegével, kerekítéssel együtt.
  if coalesce(v_calc.price_huf,0) <> v_items_sum then
    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (v_booking_id, 'SURCHARGE', null,
            case when v_pct <> 0 and v_fix <> 0 then 'Felár (' || v_pct || '% + fix)'
                 when v_pct <> 0                then 'Felár (' || v_pct || '%)'
                 else 'Felár' end,
            1,
            coalesce(v_calc.price_huf,0) - v_items_sum,
            coalesce(v_calc.price_huf,0) - v_items_sum,
            0, v_sort);
  end if;

  -- ---------- 6. MUNKALISTA ----------
  perform public.rebuild_booking_tasks(v_booking_id);

  return v_booking_id;
end;
$$;


-- A keresőbe is: „111 2233"-ra találja meg a „+36 30 111 2233"-at. A név és a
-- rendszám szerinti keresés változatlan.

create or replace function public.list_customers(p_q text default '', p_limit integer default 100)
returns setof public.v_customer_summary
language sql
stable
as $$
  select s.* from public.v_customer_summary s
   where coalesce(trim(p_q), '') = ''
      or public.ekezettelen(s.name)         like '%' || public.ekezettelen(p_q) || '%'
      or public.ekezettelen(s.company_name) like '%' || public.ekezettelen(p_q) || '%'
      or (public.phone_norm(p_q) is not null
          and public.phone_norm(s.phone) like '%' || public.phone_norm(p_q) || '%')
      or exists (
        select 1 from public.vehicles v
         where v.customer_id = s.id
           and v.plate_normalized like
               '%' || upper(regexp_replace(p_q, '[^A-Za-z0-9]', '', 'g')) || '%')
   order by s.utolso desc nulls last, s.name
   limit greatest(coalesce(p_limit, 100), 1);
$$;


-- -----------------------------------------------------------------------------
--  10. A bérlet és a szerződés ugyanez a jog
-- -----------------------------------------------------------------------------
--  A Cégek és bérletesek képernyő eddig SENKINEK nem volt letiltva: sem a
--  felületen, sem az adatbázisban. A bérletek és szerződések táblájára az
--  RLS az is_staff() szabályt kapta, ami minden aktív dolgozót beenged —
--  vagyis az alkalmazott bérletet adhatott ki és szerződéses árat írhatott,
--  pedig a szándék nem ez volt.
--
--  A három írási művelet ezért ugyanazt a kapcsolót kérdezi meg, mint az
--  ügyféltörzs. Ami SZÁNDÉKOSAN kimarad: a use_pass és a release_pass. Az
--  alkalom levonása a foglalás lezárásának a része, tehát napi munka — ha azt
--  is tiltanánk, egy bérletes autót nem tudna kiadni.

create or replace function public.create_pass(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_id    uuid;
  v_from  date := coalesce(nullif(p->>'valid_from','')::date, current_date);
  v_until date;
  r       jsonb;
  v_sort  integer := 0;
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;

  -- A lejárat vagy kész dátumként jön, vagy módból + értékből számoljuk.
  v_until := coalesce(
    nullif(p->>'valid_until','')::date,
    public.berlet_lejarat(
      coalesce(nullif(p->>'validity_kind','')::validity_kind, 'EV'),
      coalesce(nullif(p->>'validity_value',''), '1'),
      v_from));

  insert into public.passes (customer_id, name, price_huf, valid_from, valid_until, notes, created_by)
  values (
    (p->>'customer_id')::uuid,
    coalesce(nullif(p->>'name',''), 'Bérlet'),
    coalesce((p->>'price_huf')::integer, 0),
    v_from, v_until,
    nullif(p->>'notes',''),
    (select s.id from public.staff s where s.id = auth.uid()))
  returning id into v_id;

  for r in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb))
  loop
    insert into public.pass_items (pass_id, package_id, category, qty_total, sort_order)
    values (
      v_id,
      nullif(r->>'package_id','')::uuid,
      nullif(r->>'category','')::vehicle_category,
      greatest(coalesce((r->>'qty_total')::integer, 1), 1),
      v_sort);
    v_sort := v_sort + 1;
  end loop;

  if v_sort = 0 then
    raise exception 'A bérletnek legalább egy tételt tartalmaznia kell.';
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_pass(jsonb) to authenticated;


create or replace function public.save_contract(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_id uuid := nullif(p->>'id','')::uuid;
  r    jsonb;
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.contracts (customer_id, tax_number, pickup_delivery, valid_until, notes)
    values ((p->>'customer_id')::uuid,
            nullif(p->>'tax_number',''),
            coalesce((p->>'pickup_delivery')::boolean, false),
            nullif(p->>'valid_until','')::date,
            nullif(p->>'notes',''))
    returning id into v_id;
  else
    update public.contracts
       set tax_number      = nullif(p->>'tax_number',''),
           pickup_delivery = coalesce((p->>'pickup_delivery')::boolean, false),
           valid_until     = nullif(p->>'valid_until','')::date,
           notes           = nullif(p->>'notes',''),
           updated_at      = now()
     where id = v_id;
  end if;

  delete from public.contract_prices where contract_id = v_id;

  for r in select * from jsonb_array_elements(coalesce(p->'prices', '[]'::jsonb))
  loop
    -- Az üres mezőt nem mentjük árként: az azt jelenti, nincs rá megállapodás.
    if nullif(r->>'price_huf','') is not null and (r->>'price_huf')::integer > 0 then
      insert into public.contract_prices (contract_id, tier, size, price_huf)
      values (v_id, (r->>'tier')::contract_tier, (r->>'size')::contract_size,
              (r->>'price_huf')::integer);
    end if;
  end loop;

  return v_id;
end;
$$;

grant execute on function public.save_contract(jsonb) to authenticated;


create or replace function public.deactivate_pass(p_pass_id uuid)
returns void
language plpgsql
volatile
as $$
begin
  if not public.can_edit_customers() then
    raise exception 'A bérleteket és szerződéseket a tulajdonos kezeli.'
      using errcode = '42501';
  end if;

  update public.passes set active = false, updated_at = now() where id = p_pass_id;
end;
$$;

grant execute on function public.deactivate_pass(uuid) to authenticated;


-- A jármű szerinti lista keresője eddig a telefonszámot EGYÁLTALÁN nem
-- kereste, pedig a mező alatt az áll, hogy lehet. Ez a nézet a kezdőképernyő
-- az Ügyfeleknél, tehát a legtöbb keresés itt történik.

create or replace function public.list_vehicles(p_q text default '', p_limit integer default 100)
returns setof public.v_vehicle_summary
language sql
stable
as $$
  select s.* from public.v_vehicle_summary s
   where coalesce(trim(p_q), '') = ''
      or s.plate_normalized like
         '%' || upper(regexp_replace(p_q, '[^A-Za-z0-9]', '', 'g')) || '%'
      or public.ekezettelen(s.customer_name) like '%' || public.ekezettelen(p_q) || '%'
      or public.ekezettelen(s.company_name)  like '%' || public.ekezettelen(p_q) || '%'
      or public.ekezettelen(coalesce(s.brand,'') || ' ' || coalesce(s.model,''))
         like '%' || public.ekezettelen(p_q) || '%'
      or (public.phone_norm(p_q) is not null
          and public.phone_norm(s.customer_phone) like '%' || public.phone_norm(p_q) || '%')
   order by s.utolso desc nulls last, s.plate_raw
   limit greatest(coalesce(p_limit, 100), 1);
$$;
