-- =============================================================================
--  0005_admin_api.sql — amit a felület hív
-- =============================================================================
--  Az admin felület NEM rakja össze a foglalást hat külön hívásból. Egy
--  foglalás felvitele hat dolgot jelent: ügyfél, jármű, árszámítás, foglalás,
--  tételek, munkalista. Ha ez hat külön kérés a böngészőből, akkor a harmadik
--  után megszakadó net félkész adatot hagy maga után, és nincs mit
--  visszavonni.
--
--  Ezért minden művelet EGY függvény, ami egy tranzakcióban fut le. Ugyanezt
--  hívja majd a publikus online foglalás is — más belépési ponttal, de
--  ugyanazzal a logikával.
--
--  Sorrend: 0001 → 0002 → 0003 → 0004 → 0005
-- =============================================================================


-- -----------------------------------------------------------------------------
--  Rendszám-keresés
-- -----------------------------------------------------------------------------
--  A telefonos foglalás első kérdése: "mi a rendszám?". Ha megvan, a nevet,
--  a telefonszámot és a méretet nem kell újra elkérni — és látszik, mit
--  szokott kérni.
--
--  A keresés a plate_normalized-en megy: a "ABC-123", "abc 123" és "ABC123"
--  ugyanaz az autó. Külföldi rendszámnál is működik, mert nincs beégetett
--  formátum.

create or replace function public.lookup_plate(p_plate text)
returns jsonb
language sql
stable
as $$
  with v as (
    select * from public.vehicles
     where plate_normalized = upper(regexp_replace(coalesce(p_plate,''), '[^A-Za-z0-9]', '', 'g'))
     limit 1
  )
  select case when not exists (select 1 from v) then null else
    jsonb_build_object(
      'vehicle',  (select to_jsonb(v) from v),
      'customer', (select to_jsonb(c) from public.customers c
                    where c.id = (select customer_id from v)),
      'history',  coalesce((
                    select jsonb_agg(to_jsonb(h) order by h.service_date desc)
                      from public.v_customer_history h
                     where h.vehicle_id = (select id from v)
                  ), '[]'::jsonb)
    )
  end;
$$;

comment on function public.lookup_plate is
  'Rendszám → jármű + ügyfél + korábbi munkák. Ékezet- és kötőjel-független.';


-- -----------------------------------------------------------------------------
--  Foglalás létrehozása
-- -----------------------------------------------------------------------------
--  Bemenet egyetlen jsonb. Azért nem húsz paraméter, mert a felület
--  űrlapja úgyis egy objektum, és mert így bővíthető anélkül, hogy minden
--  hívót át kellene írni.
--
--  Amit elvégez:
--    1. ügyfél — meglévőt használ, vagy újat hoz létre
--    2. jármű  — meglévőt frissít, vagy újat hoz létre
--    3. ár és idő — calc_service(), ugyanaz, amit az árkalkulátor is hív
--    4. foglalás sor
--    5. tételsorok, pillanatfelvétellel (egy későbbi áremelés nem írja át)
--    6. munkalista — rebuild_booking_tasks()

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
     where regexp_replace(c.phone, '[^0-9]', '', 'g')
         = regexp_replace(coalesce(p->>'customer_phone',''), '[^0-9]', '', 'g')
       and regexp_replace(coalesce(p->>'customer_phone',''), '[^0-9]', '', 'g') <> ''
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
    values (v_booking_id, 'FULL_SERVICE', null, 'Full Service (mélytisztítás)',
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

comment on function public.create_booking is
  'Egy foglalás felvitele egy tranzakcióban: ügyfél, jármű, ár, tételek, munkalista.';


-- -----------------------------------------------------------------------------
--  Állapotváltás
-- -----------------------------------------------------------------------------
--  A dolgozó egy gombot nyom. Az időbélyegeket a rendszer írja — ezekből
--  derül ki később, mennyi ideig tartott valójában a munka, és hogy
--  nyitvatartási időn kívül készült-e.

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
         arrived_at = case when p_status = 'ARRIVED'      and arrived_at is null
                           then now() else arrived_at end,
         actual_started_at = case when p_status = 'IN_PROGRESS' and actual_started_at is null
                           then now() else actual_started_at end,
         actual_finished_at = case when p_status in ('READY','COMPLETED') and actual_finished_at is null
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

comment on function public.set_booking_status is
  'Állapotváltás + időbélyegek + előzmény. A felület csak a célállapotot adja meg.';


-- -----------------------------------------------------------------------------
--  Munkalista pipálás
-- -----------------------------------------------------------------------------

create or replace function public.toggle_task(p_task_id uuid, p_done boolean)
returns void
language sql
volatile
as $$
  update public.booking_tasks
     set done    = p_done,
         done_at = case when p_done then now() else null end,
         done_by = case when p_done then (select s.id from public.staff s where s.id = auth.uid()) end
   where id = p_task_id;
$$;


-- -----------------------------------------------------------------------------
--  Végleges ár
-- -----------------------------------------------------------------------------
--  A becsült ár a foglaláskor készül. A végleges az, amit az ügyfél fizetett.
--  A kettő eltérhet — és pont az eltérés az érdekes adat: abból derül ki,
--  hol becsül rosszul a rendszer.

create or replace function public.set_final_price(
  p_booking_id uuid,
  p_price      integer,
  p_reason     text default null)
returns void
language sql
volatile
as $$
  update public.bookings
     set final_price_huf = p_price,
         price_adjustment_reason = p_reason,
         updated_at = now()
   where id = p_booking_id;
$$;


-- -----------------------------------------------------------------------------
--  Jogosultság
-- -----------------------------------------------------------------------------
--  A függvények security invoker módban futnak, tehát a hívó jogaival —
--  az RLS ugyanúgy érvényes rájuk, mint a közvetlen táblaműveletekre.

revoke all on function public.create_booking(jsonb)                       from public, anon;
revoke all on function public.set_booking_status(uuid, booking_status, text) from public, anon;
revoke all on function public.toggle_task(uuid, boolean)                  from public, anon;
revoke all on function public.set_final_price(uuid, integer, text)        from public, anon;

grant execute on function public.create_booking(jsonb)                       to authenticated;
grant execute on function public.set_booking_status(uuid, booking_status, text) to authenticated;
grant execute on function public.toggle_task(uuid, boolean)                  to authenticated;
grant execute on function public.set_final_price(uuid, integer, text)        to authenticated;
grant execute on function public.lookup_plate(text)                          to authenticated;
