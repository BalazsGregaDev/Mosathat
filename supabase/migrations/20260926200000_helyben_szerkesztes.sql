-- =============================================================================
--  20260926200000_helyben_szerkesztes.sql
--  Egy adatra kattintok, átírom, kész.
-- =============================================================================
--  A telefon közben ez történik: „úgy alakult, a férjem tud érte jönni, őt
--  ezen a másik számon érem el." Ehhez eddig meg kellett nyitni a teljes
--  szerkesztő űrlapot, végigmenni rajta, és a végén menteni. Nyolc kattintás
--  egy telefonszám miatt.
--
--  Mostantól egy mezőt lehet átírni. A nehézség nem a felületen van, hanem
--  itt: ha csak egy mezőt küldünk be, a többinek NEM szabad elveszni.
--
--  Az update_booking() teljes állapotot vár — ha hiányzik az extrák listája,
--  törli az extrákat; ha hiányzik a megjegyzés, kiüríti. Ezért a patch_booking()
--  előbb összeszedi a foglalás MOSTANI állapotát ugyanabban az alakban, arra
--  ráteszi a módosítást, és csak az eredményt adja tovább.
--
--  Miért nem írjuk egyszerűen az egy mezőt közvetlenül? Mert ha a csomag vagy
--  a terjedelem változik, az árat és az időt újra kell számolni, a munkalistát
--  pedig hozzáigazítani. Két út (egy „gyors" és egy „rendes") előbb-utóbb
--  eltérne egymástól. Egy út van, és az mindig végigszámol.
-- =============================================================================


-- A foglalás mostani állapota abban az alakban, ahogy az update_booking() várja.
create or replace function public.booking_patch_alap(p_booking_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'category',      v.category,
    'scope',         b.scope,
    'booking_type',  b.booking_type,
    'service_date',  b.service_date::text,
    'package_id',    b.package_id,
    'full_service',  b.full_service,
    'notes',         coalesce(b.notes, ''),

    -- Idők budapesti időben, ahogy a felületen is látszanak.
    'start_time',    to_char(b.start_at    at time zone 'Europe/Budapest', 'HH24:MI'),
    'drop_off_time', to_char(b.drop_off_at at time zone 'Europe/Budapest', 'HH24:MI'),
    'pick_up_time',  to_char(b.pick_up_at  at time zone 'Europe/Budapest', 'HH24:MI'),
    'deadline_date', to_char(b.deadline_at at time zone 'Europe/Budapest', 'YYYY-MM-DD'),
    'deadline_time', to_char(b.deadline_at at time zone 'Europe/Budapest', 'HH24:MI'),

    'extras', coalesce((
      select jsonb_agg(jsonb_build_object('extra_id', bi.ref_id, 'quantity', bi.quantity))
        from public.booking_items bi
       where bi.booking_id = b.id and bi.kind = 'EXTRA' and bi.ref_id is not null
    ), '[]'::jsonb),

    -- A felárat nem százalékban és fix összegben tároljuk, hanem egyetlen
    -- tételsorként. Visszafelé ezért fix összegként adjuk vissza: az
    -- update_booking ugyanezt az összeget fogja újra a végére írni, tehát a
    -- végösszeg forintra ugyanaz marad.
    'surcharge_pct', 0,
    'surcharge_fix', coalesce((
      select bi.price_huf from public.booking_items bi
       where bi.booking_id = b.id and bi.kind = 'SURCHARGE' limit 1), 0)
  )
  from public.bookings b
  join public.vehicles v on v.id = b.vehicle_id
  where b.id = p_booking_id;
$$;


create or replace function public.patch_booking(p_booking_id uuid, p_patch jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_status booking_status;
begin
  select status into v_status from public.bookings where id = p_booking_id;
  if v_status is null then
    raise exception 'Nincs ilyen foglalás.';
  end if;
  if v_status = 'COMPLETED' then
    raise exception 'Ez a foglalás le van zárva, már nem szerkeszthető.'
      using hint = 'Ha mégis módosítani kell, előbb vissza kell nyitni.';
  end if;

  -- A || jobb oldala nyer: ami a módosításban benne van, az írja felül az
  -- eddigit, a többi változatlanul megy tovább.
  return public.update_booking(p_booking_id, public.booking_patch_alap(p_booking_id) || p_patch);
end;
$$;

grant execute on function public.booking_patch_alap(uuid)  to authenticated;
grant execute on function public.patch_booking(uuid, jsonb) to authenticated;


-- =============================================================================
--  A „kezdjük" lépés kivétele a folyamatból
-- =============================================================================
--  Eddig négy lépés volt: megérkezett → kezdjük → kész van → átvette. A
--  „kezdjük" gombot a gyakorlatban vagy elfelejtették megnyomni, vagy
--  utólag nyomták meg — vagyis nem mondott igazat.
--
--  Három lépés marad: megérkezett → kész van → átvette.
--
--  A tényleges munkaidő mérése viszont nem veszhet el: ha nincs külön
--  „kezdjük", akkor a munka kezdete az érkezés. Ez nem pontosabb annál,
--  mint amit egy elfelejtett gombnyomás adott volna, viszont mindig megvan.
create or replace function public.set_booking_status(
  p_booking_id uuid,
  p_status     booking_status,
  p_note       text default null)
returns void
language plpgsql
volatile
as $$
declare
  v_old booking_status;
begin
  select status into v_old from public.bookings where id = p_booking_id;
  if v_old is null then
    raise exception 'Nincs ilyen foglalás: %', p_booking_id;
  end if;
  if v_old = p_status then return; end if;

  update public.bookings
     set status = p_status,
         arrived_at = case when p_status = 'ARRIVED' and arrived_at is null
                           then now() else arrived_at end,

         -- A munka kezdete: ha volt külön „kezdjük", az. Ha nem volt, akkor
         -- az érkezés ideje. Így a valós munkaidő akkor is számolható, ha a
         -- folyamatban nincs külön indítólépés.
         actual_started_at = case
           when p_status = 'IN_PROGRESS' and actual_started_at is null then now()
           when p_status in ('READY','COMPLETED') and actual_started_at is null
             then coalesce(arrived_at, now())
           else actual_started_at end,

         actual_finished_at = case when p_status in ('READY','COMPLETED')
                                    and actual_finished_at is null
                           then now() else actual_finished_at end,
         internal_notes = case when p_note is null then internal_notes
                           else coalesce(internal_notes || E'\n', '') || p_note end,
         updated_at = now()
   where id = p_booking_id;

  insert into public.audit_log (staff_id, entity, entity_id, action, before, after)
  values ((select s.id from public.staff s where s.id = auth.uid()),
          'bookings', p_booking_id, 'status_change',
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;


-- =============================================================================
--  Ügyfél és jármű szerkesztése
-- =============================================================================
--  Az Ügyfelek képernyőn eddig csak nézni lehetett az adatot. Márpedig
--  telefonszám, e-mail, cégnév és rendszám folyamatosan változik, és ha nincs
--  hol átírni, akkor az adat lassan elavul — a rendszer pedig pont attól lesz
--  használhatatlan.
--
--  Ezek a függvények szándékosan NEM security definer: a jogosultságot az RLS
--  dönti el, ugyanúgy, mint bárhol máshol.

create or replace function public.save_customer(p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_id uuid := (p->>'id')::uuid;
begin
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
as $$
declare
  v_id uuid := (p->>'id')::uuid;
begin
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
