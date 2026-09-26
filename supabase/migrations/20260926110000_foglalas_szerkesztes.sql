-- =============================================================================
--  20260926110000_foglalas_szerkesztes.sql — a felvett foglalás módosítása
-- =============================================================================
--  Az ügyfél meggondolja magát: mégis Elitet kér, mégis marad kárpittisztításra,
--  mégis holnap jön. Eddig ilyenkor törölni és újra felvenni lehetett volna —
--  ami elveszítené a már kipipált munkalépéseket és az előzményt.
--
--  Ez a függvény a create_booking() párja: ugyanazt a bemenetet fogadja, de
--  meglévő foglalást ír át. Amit újraszámol: ár, időtartam, tételsorok,
--  munkalista. Amit MEGTART: a már kipipált lépéseket (a rebuild_booking_tasks
--  eleve így működik), a foglalás azonosítóját, az előzményt és az állapotot.
--
--  A lezárt foglalást nem engedi módosítani — azt a bookings_zarolas_trg
--  trigger amúgy is megállítaná, de itt érthetőbb hibaüzenetet adunk.
-- =============================================================================

create or replace function public.update_booking(p_booking_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
as $$
declare
  v_regi        record;
  v_customer_id uuid;
  v_vehicle_id  uuid;
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
  v_items_sum   integer := 0;
  v_sort        integer := 0;
  v_pp          record;
  v_fs          record;
  r             record;
  v_qty         numeric;
  v_line        integer;
begin
  select * into v_regi from public.bookings where id = p_booking_id;
  if v_regi is null then
    raise exception 'Nincs ilyen foglalás: %', p_booking_id;
  end if;
  if v_regi.status = 'COMPLETED' then
    raise exception 'A foglalás le van zárva. Módosításhoz előbb vissza kell nyitni.';
  end if;

  -- A kategória a JÁRMŰRŐL jön, ha az űrlap nem adja meg.
  v_category := coalesce(
    nullif(p->>'category','')::vehicle_category,
    (select v.category from public.vehicles v where v.id = v_regi.vehicle_id));
  v_scope      := coalesce((p->>'scope')::booking_scope, v_regi.scope);
  v_type       := coalesce((p->>'booking_type')::booking_type, v_regi.booking_type);
  v_date       := coalesce((p->>'service_date')::date, v_regi.service_date);
  v_package_id := nullif(p->>'package_id','')::uuid;
  v_full       := coalesce((p->>'full_service')::boolean, false);
  v_extras     := coalesce(p->'extras', '[]'::jsonb);
  v_pct        := coalesce((p->>'surcharge_pct')::numeric, 0);
  v_fix        := coalesce((p->>'surcharge_fix')::integer, 0);

  v_customer_id := v_regi.customer_id;
  v_vehicle_id  := v_regi.vehicle_id;

  -- ---------- ügyfél és jármű frissítése ----------
  -- Üres értékkel nem írunk felül meglévőt: ha a felvevő nem tudja a nevet,
  -- attól még nem kell elveszíteni, amit korábban tudtunk.
  update public.customers
     set name  = coalesce(nullif(p->>'customer_name',''),  name),
         phone = coalesce(nullif(p->>'customer_phone',''), phone),
         company_name = coalesce(nullif(p->>'company_name',''), company_name),
         updated_at = now()
   where id = v_customer_id;

  update public.vehicles
     set plate_raw = coalesce(nullif(p->>'plate_raw',''), plate_raw),
         brand     = coalesce(nullif(p->>'brand',''), brand),
         model     = coalesce(nullif(p->>'model',''), model),
         category  = v_category,
         seats     = coalesce(nullif(p->>'seats','')::integer, seats),
         updated_at = now()
   where id = v_vehicle_id;

  -- ---------- ár és idő újraszámolása ----------
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

  -- ---------- a foglalás ----------
  update public.bookings
     set booking_type = v_type,
         service_date = v_date,
         start_at     = v_start,
         drop_off_at  = v_drop,
         pick_up_at   = v_pick,
         deadline_at  = v_deadline,
         package_id   = v_package_id,
         scope        = v_scope,
         full_service = v_full,
         planned_duration_minutes = coalesce(v_calc.work_minutes, 0),
         rest_minutes             = coalesce(v_calc.rest_minutes, 0),
         estimated_price_huf      = coalesce(v_calc.price_huf, 0),
         notes                    = nullif(trim(coalesce(p->>'notes','')), ''),
         updated_at = now()
   where id = p_booking_id;

  -- ---------- tételsorok újraírása ----------
  -- A tételek a MOSTANI állapotot tükrözik, ezért teljesen újraépülnek.
  delete from public.booking_items where booking_id = p_booking_id;

  if v_package_id is not null then
    select pp.price_huf, pp.duration_minutes into v_pp
      from public.package_pricing pp
     where pp.package_id = v_package_id and pp.category = v_category and pp.scope = v_scope;

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    select p_booking_id, 'PACKAGE', v_package_id,
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

    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (p_booking_id, 'FULL_SERVICE', null, 'Full Service (mélytisztítás)',
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
    values (p_booking_id, 'EXTRA', r.id, r.name,
            v_qty, coalesce(r.price_huf, 0), v_line,
            coalesce(r.work_minutes,0) * case when r.duration_unit = 'ALKALOM' then 1 else v_qty end,
            v_sort);

    v_items_sum := v_items_sum + v_line;
    v_sort := v_sort + 1;
  end loop;

  if coalesce(v_calc.price_huf,0) <> v_items_sum then
    insert into public.booking_items (booking_id, kind, ref_id, name_snapshot,
                                      quantity, unit_price_huf, price_huf, work_minutes, sort_order)
    values (p_booking_id, 'SURCHARGE', null, 'Felár',
            1,
            coalesce(v_calc.price_huf,0) - v_items_sum,
            coalesce(v_calc.price_huf,0) - v_items_sum,
            0, v_sort);
  end if;

  -- ---------- munkalista ----------
  -- A rebuild megtartja a már kipipált lépéseket, és csak a különbséget
  -- vezeti át. Ha az ügyfél Premiumról Elitre vált, a kimosott karosszéria
  -- pipája nem vész el.
  perform public.rebuild_booking_tasks(p_booking_id);

  return p_booking_id;
end;
$$;

comment on function public.update_booking is
  'Felvett foglalás módosítása: ár, idő, tételek, munkalista újraszámolva, '
  'a kipipált lépések megtartva. Lezárt foglaláson nem fut le.';

revoke all on function public.update_booking(uuid, jsonb) from public, anon;
grant execute on function public.update_booking(uuid, jsonb) to authenticated;


-- -----------------------------------------------------------------------------
--  Egy foglalás teljes tartalma — hogy a szerkesztő űrlap fel tudja tölteni magát
-- -----------------------------------------------------------------------------

create or replace function public.booking_form_data(p_booking_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'booking',  (select to_jsonb(b) from public.bookings b where b.id = p_booking_id),
    'customer', (select to_jsonb(c) from public.customers c
                  where c.id = (select customer_id from public.bookings where id = p_booking_id)),
    'vehicle',  (select to_jsonb(v) from public.vehicles v
                  where v.id = (select vehicle_id from public.bookings where id = p_booking_id)),
    -- a kiválasztott extrák, mennyiséggel — ezekkel töltjük vissza a jelölőket
    'extras',   coalesce((
                  select jsonb_agg(jsonb_build_object('extra_id', bi.ref_id, 'quantity', bi.quantity))
                    from public.booking_items bi
                   where bi.booking_id = p_booking_id
                     and bi.kind = 'EXTRA'
                     and bi.ref_id is not null
                ), '[]'::jsonb)
  );
$$;

grant execute on function public.booking_form_data(uuid) to authenticated;
