import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { adatbazis, tesztelo, ALK, GYOKER, TULAJ } from './_db.mjs'

const SUPABASE_JOGOK = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

const t = tesztelo()
const db = await adatbazis({ demo: true, elotte: SUPABASE_JOGOK })
const q = async (s, p) => (await db.query(s, p)).rows
const belep = (id) => q(`select set_config('app.uid', $1, false)`, [id ?? ''])

async function szerepkorben(szerep, fn) {
  await db.exec(`set role ${szerep}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

async function hibaUzenet(fn) {
  try {
    await fn()
    return null
  } catch (e) {
    return e.message
  }
}

console.log('=== 1) Névtelen (anon) felhasználó egyetlen függvényt sem hívhat ===\n')
const anonHivhat = await q(`select count(*)::int n from pg_proc p
  where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')`)
t.ok('anon által hívható függvény', 0, anonHivhat[0].n)
const authHivhat = await q(`select
  has_function_privilege('authenticated', 'public.day_absences(date)', 'EXECUTE') as tavollet,
  has_function_privilege('authenticated', 'public.create_booking(jsonb)', 'EXECUTE') as foglalas,
  has_function_privilege('authenticated', 'public.jelszo_visszaallitas(text, text)', 'EXECUTE') as veszjelszo,
  has_function_privilege('service_role', 'public.create_booking(jsonb)', 'EXECUTE') as szerviz`)
t.ok('bejelentkezve hívható: távollét, foglalás; a vészjelszó nem; a szerver kulcs megmarad',
  { tavollet: true, foglalas: true, veszjelszo: false, szerviz: true }, authHivhat[0])
const anonHiba = await szerepkorben('anon', () => hibaUzenet(() => q(`select * from day_absences(current_date)`)))
t.ok('anonként a távollét-lista elutasítva', true, /permission denied/i.test(anonHiba ?? ''))

console.log('\n=== 2) Sorszintű jogok: a policyk egyszer számolják a jogot ===\n')
const pol = await q(`select pg_get_expr(polqual, polrelid) as e from pg_policy where polname = 'bookings_staff_all'`)
t.ok('a bookings policy SELECT-be csomagolva', true, /\(\s*SELECT\s+is_staff\(\)/i.test(pol[0].e))
await belep(TULAJ)
const tulajLat = await szerepkorben('authenticated', () => q(`select count(*)::int n from bookings`))
t.ok('a tulajdonos látja a foglalásokat', true, tulajLat[0].n > 0)
await belep(null)
const idegenLat = await szerepkorben('authenticated', () => q(`select count(*)::int n from bookings`))
t.ok('nem dolgozó bejelentkezett felhasználó semmit nem lát', 0, idegenLat[0].n)
const anonLat = await szerepkorben('anon', () => hibaUzenet(() => q(`select count(*)::int n from bookings`)))
t.ok('anonként a táblához nincs hozzáférés', true, anonLat !== null)

console.log('\n=== 3) Távollét-lista csak dolgozónak ===\n')
await belep(TULAJ)
await q(`insert into staff_absences (staff_id, day, kind, starts) values ($1, current_date, 'KORABBAN_TAVOZIK', '15:00')`, [ALK])
const dolgozo = await szerepkorben('authenticated', () => q(`select * from day_absences(current_date)`))
t.ok('dolgozóként látszik', 1, dolgozo.length)
await belep(null)
const idegen = await szerepkorben('authenticated', () => q(`select * from day_absences(current_date)`))
t.ok('idegenként üres', 0, idegen.length)

console.log('\n=== 4) Bérlet: az ügyfél-jogú alkalmazott is felveheti ===\n')
await belep(TULAJ)
await q(`update staff set can_edit_customers = true where id = $1`, [ALK])
const [ugyfel] = await q(`select add_customer($1::jsonb) as id`,
  [JSON.stringify({ name: 'Bérletes Teszt', phone: '+36 20 555 0001' })])
const [ceges] = await q(`select add_customer($1::jsonb) as id`,
  [JSON.stringify({ name: 'Szerződéses Teszt Kft', phone: '+36 20 555 0002' })])
const berlet = JSON.stringify({
  customer_id: ugyfel.id, name: 'Teszt bérlet', price_huf: 50000,
  validity_kind: 'EV', validity_value: '1',
  items: [{ package_id: null, category: null, qty_total: 5 }],
})
await belep(ALK)
const ujBerlet = await szerepkorben('authenticated', () => hibaUzenet(() => q(`select create_pass($1::jsonb) as id`, [berlet])))
t.ok('jogosult alkalmazott: létrejön', null, ujBerlet)
const [b] = await q(`select id from passes where name = 'Teszt bérlet'`)
const kivezet = await szerepkorben('authenticated', () => hibaUzenet(() => q(`select deactivate_pass($1::uuid)`, [b.id])))
t.ok('jogosult alkalmazott: kivezethető', null, kivezet)
const szerzodes = JSON.stringify({ customer_id: ceges.id, name: 'Teszt szerződés', prices: [] })
const ujSzerzodes = await szerepkorben('authenticated', () => hibaUzenet(() => q(`select save_contract($1::jsonb) as id`, [szerzodes])))
t.ok('jogosult alkalmazott: szerződést is írhat', null, ujSzerzodes)
await belep(TULAJ)
await q(`update staff set can_edit_customers = false where id = $1`, [ALK])
await belep(ALK)
const tiltott = await szerepkorben('authenticated', () => hibaUzenet(() => q(`select create_pass($1::jsonb) as id`, [berlet])))
t.ok('jog nélkül elutasítva', true, /tulajdonos kezeli/.test(tiltott ?? ''))
const tablaIras = await szerepkorben('authenticated', () =>
  q(`with u as (update passes set notes = 'x' returning 1) select count(*)::int n from u`).catch(() => [{ n: 0 }]))
t.ok('jog nélkül közvetlenül a táblába sem írhat', 0, tablaIras[0].n)

console.log('\n=== 5) Halott függvények törölve ===\n')
const halott = await q(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('my_absences', 'sheet_honap_nev', 'lookup_plate')`)
t.ok('my_absences, sheet_honap_nev, lookup_plate', 0, halott[0].n)

console.log('\n=== 6) Az adatbázis-leírások (régi kommentek) törlődnek ===\n')
await belep(TULAJ)
await q(`comment on table public.bookings is 'régi leírás'`)
await q(`comment on column public.bookings.notes is 'régi leírás'`)
await q(`comment on view public.v_day_bookings is 'régi leírás'`)
await q(`comment on function public.calc_service is 'régi leírás'`)
await db.exec(await readFile(join(GYOKER, 'supabase', 'migrations', '20261010090000_biztonsag_takaritas.sql'), 'utf8'))
const leiras = await q(`select count(*)::int n from pg_description d
  where (d.classoid = 'pg_class'::regclass and exists (select 1 from pg_class c where c.oid = d.objoid and c.relnamespace = 'public'::regnamespace))
     or (d.classoid = 'pg_proc'::regclass and exists (select 1 from pg_proc p where p.oid = d.objoid and p.pronamespace = 'public'::regnamespace))`)
t.ok('a migráció újrafuttatva is hibátlan, és nem marad leírás', 0, leiras[0].n)

await db.close()
t.vege()
