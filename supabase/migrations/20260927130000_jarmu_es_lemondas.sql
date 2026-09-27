-- =============================================================================
--  20260927130000_jarmu_es_lemondas.sql
--  További jármű egy ügyfélhez, és az ügyféladat védelme
-- =============================================================================
--  Két dolgot rendez el, és a kettő ugyanarról szól: ki nyúlhat az
--  ügyféltörzshöz.
--
--  1. ÚJ JÁRMŰ FELVÉTELE
--     Egy ügyfélnek több autója lehet — a feleségé, a céges kisbusz, a
--     gyerek első kocsija. Eddig új autó csak foglaláskor keletkezett. Ha
--     valaki telefonon annyit mond, hogy „jövő héten a másik autóval
--     jönnék", nem volt hova felvenni.
--
--  2. AZ ÜGYFÉLTÖRZS AZ ALKALMAZOTTNAK CSAK OLVASHATÓ
--     Ez eddig csak a képernyőn volt így gondolva, de az adatbázis nem
--     tartotta be: a save_customer és a save_vehicle bárkinek engedte. Aki
--     a böngésző fejlesztői eszközeit megnyitja, át tudta írni. A szabály
--     ott ér valamit, ahol az adat van.
--
--     FONTOS, hogy mit NEM érint ez: a foglalás felvételét és szerkesztését.
--     Az továbbra is az alkalmazott napi munkája, és az a saját útján megy
--     (create_booking / patch_booking). Ha telefonál egy ügyfél, hogy a
--     férje jön az autóért egy másik számon, azt az alkalmazott a foglalási
--     ablakban változtatja meg — az működik. Amit nem tud: az Ügyfelek
--     képernyőn átírni a törzsadatot.
--
--  A LEMONDÁSHOZ nem kell új függvény: a set_booking_status már ismeri a
--  CANCELLED_BY_CUSTOMER állapotot, a kapacitás és a bevétel pedig eddig is
--  kihagyta a lemondott foglalásokat. Csak gomb nem volt hozzá.
--
--  A lemondás SZÁNDÉKOSAN nem sorlemez: a foglalás sora megmarad. Egyrészt
--  mert a lemondások száma üzleti adat (ki mond le rendszeresen), másrészt
--  mert egy véletlen lemondás így visszavonható. Az ügyfél és a jármű
--  pedig eleve külön sor: az akkor is megmarad, ha az első foglalását
--  mondja le — a következő hívásnál már nem kell újra felvenni.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  1. További jármű egy meglévő ügyfélhez
-- -----------------------------------------------------------------------------

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
  if public.my_role() is null or public.my_role() = 'STAFF' then
    raise exception 'Az ügyféladatokat a tulajdonos kezeli.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.customers c where c.id = v_customer) then
    raise exception 'Nincs ilyen ügyfél.';
  end if;

  if v_plate = '' then
    raise exception 'A rendszám nem maradhat üresen.';
  end if;

  -- Egy rendszám egy autó. Ha már van ilyen, meg kell mondani, kinél —
  -- különben két sor élne ugyanarról a kocsiról, külön előzménnyel, és
  -- félévente az egyik, félévente a másik jönne elő.
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
--  2. Az ügyféltörzs írása: csak tulajdonos és fejlesztő
-- -----------------------------------------------------------------------------
--  A két függvény törzse változatlan, csak egy őrszem kerül a legelejére.
--  Az eredeti a 20260926200000_helyben_szerkesztes.sql-ben van; itt csak az
--  ellenőrzés az új.

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
  if public.my_role() is null or public.my_role() = 'STAFF' then
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
  if public.my_role() is null or public.my_role() = 'STAFF' then
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
