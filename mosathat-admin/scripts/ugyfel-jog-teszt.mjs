import { PGlite } from '@electric-sql/pglite'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const GYOKER = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIG = join(GYOKER, 'supabase', 'migrations')
const db = await PGlite.create()

await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email character varying(255),
    last_sign_in_at timestamptz, encrypted_password text, updated_at timestamptz);
  create or replace function auth.uid() returns uuid
    language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  create or replace function auth.role() returns text
    language sql stable as $$ select 'authenticated'::text $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  end $$;
  create schema if not exists extensions;
  create or replace function extensions.gen_salt(a text, b int) returns text
    language sql immutable as $$ select '$2a$' || b || '$t' $$;
  create or replace function extensions.crypt(pw text, salt text) returns text
    language sql immutable as $$ select salt || md5(pw) $$;
`)
for (const f of (await readdir(MIG)).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(await readFile(join(MIG, f), 'utf8'))
}

const FEJL = '00000000-0000-4000-8000-000000000001'
const TULAJ = '00000000-0000-4000-8000-000000000002'
const ALK = '00000000-0000-4000-8000-000000000003'

await db.exec(`
  insert into auth.users (id,email) values
    ('${FEJL}','fejleszto@x.hu'), ('${TULAJ}','tulaj@x.hu'), ('${ALK}','alkalmazott@x.hu');
  insert into staff (id, full_name, role, active) values
    ('${FEJL}','Fejlesztő','SUPERADMIN',true),
    ('${TULAJ}','Tulajdonos','TULAJDONOS',true),
    ('${ALK}','Alkalmazott','STAFF',true);
`)

let hiba = 0
const belep = (id) => db.exec(`select set_config('app.uid','${id}',false);`)

function ok(mit, varjuk, kaptuk) {
  const jo = JSON.stringify(varjuk) === JSON.stringify(kaptuk)
  if (!jo) hiba++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(kaptuk)} (várt: ${JSON.stringify(varjuk)})`}`)
}

async function futtat(sql, params = []) {
  try {
    const { rows } = await db.query(sql, params)
    return { rows }
  } catch (e) {
    return { hiba: String(e.message ?? e) }
  }
}

const ujUgyfel = (nev, tel, extra = {}) =>
  futtat(`select add_customer($1::jsonb) as id`, [JSON.stringify({ name: nev, phone: tel, ...extra })])

const jogaVan = async () => (await db.query(`select can_edit_customers() as v`)).rows[0].v

console.log('=== 0) telefonszám: a négy írásmód egy alak ===\n')
{
  const { rows } = await db.query(`
    select phone_norm('+36 30 111 2233')  as a,
           phone_norm('06 30 111 2233')   as b,
           phone_norm('0036301112233')    as c,
           phone_norm('30/111-2233')      as d,
           phone_norm('+36 36 512 000')   as eger_nk,
           phone_norm('06 36 512 000')    as eger_bf,
           phone_norm('+49 30 1234567')   as nemet,
           phone_norm('—')                as jeltelen,
           phone_norm(null)               as ures`)
  const r = rows[0]
  ok('a mobil négy írásmódja egyezik', ['301112233', '301112233', '301112233', '301112233'],
    [r.a, r.b, r.c, r.d])
  ok('egri vezetékes: +36 és 06 alak egyezik', true, r.eger_nk === r.eger_bf)
  ok('külföldi számhoz nem nyúl', '49301234567', r.nemet)
  ok('a „—" és az üres: null', [null, null], [r.jeltelen, r.ures])
}

console.log('\n=== 1) alapállapot: a szerepkörök beállítása ===\n')
await belep(FEJL)
{
  const { rows } = await db.query(`select * from list_role_permissions()`)
  ok('a három szerepkör benne van', 3, rows.length)
  ok('fejlesztő: igen', true, rows.find((r) => r.role === 'SUPERADMIN').can_edit_customers)
  ok('tulajdonos: igen', true, rows.find((r) => r.role === 'TULAJDONOS').can_edit_customers)
  ok('alkalmazott: nem', false, rows.find((r) => r.role === 'STAFF').can_edit_customers)
}

console.log('\n=== 2) alkalmazottként nem megy ===\n')
await belep(ALK)
ok('can_edit_customers() = false', false, await jogaVan())
{
  const r = await ujUgyfel('Teszt Elek', '+36 30 111 2233')
  ok('ügyfél felvétele elutasítva', true, /tulajdonos kezeli/.test(r.hiba ?? ''))
}
{
  const r = await futtat(`select list_role_permissions()`)
  ok('a szerepkörök listája sem látszik', true, /nincs jogosultságod/.test(r.hiba ?? ''))
}

console.log('\n=== 3) tulajdonosként megy, és figyel az ismétlődésre ===\n')
await belep(TULAJ)
ok('can_edit_customers() = true', true, await jogaVan())
let ugyfel
{
  const r = await ujUgyfel('Teszt Elek', '+36 30 111 2233')
  ugyfel = r.rows?.[0]?.id
  ok('felvétel sikerült', true, !!ugyfel)
}
{
  const r = await ujUgyfel('Elek Testvére', '06301112233')
  ok('ugyanaz a szám más írásmóddal: szól', true, /már van ügyfél: Teszt Elek/.test(r.hiba ?? ''))
}
{
  const r = await ujUgyfel('Elek Testvére', '06301112233', { megis: true })
  ok('„mégis" hatására felveszi', true, !!r.rows?.[0]?.id)
}
{
  const r = await ujUgyfel('', '+36301234567')
  ok('név nélkül nem megy', true, /név nem maradhat/.test(r.hiba ?? ''))
}
{
  const r = await futtat(`select add_vehicle($1::jsonb) as id`,
    [JSON.stringify({ customer_id: ugyfel, plate_raw: 'ABC-123', category: 'SZEMELYAUTO' })])
  ok('járművet is tud felvenni', true, !!r.rows?.[0]?.id)
}

console.log('\n=== 4) a szerepkör kapcsolója: egy kattintás, mindenki ===\n')
await db.query(`select set_role_permission($1::jsonb)`,
  [JSON.stringify({ role: 'STAFF', can_edit_customers: true })])
await belep(ALK)
ok('az alkalmazott most már tud', true, await jogaVan())
{
  const r = await ujUgyfel('Régi Ügyfél', '+36 20 999 8877')
  ok('fel is vesz egy ügyfelet', true, !!r.rows?.[0]?.id)
}
{
  const r = await futtat(`select save_customer($1::jsonb)`,
    [JSON.stringify({ id: ugyfel, notes: 'régi papírról' })])
  ok('meglévőt is átír', true, !r.hiba)
}

console.log('\n=== 5) egy fiókra külön döntés ===\n')
await belep(TULAJ)
await db.query(`select set_staff($1::jsonb)`,
  [JSON.stringify({ id: ALK, can_edit_customers: false })])
{
  const { rows } = await db.query(`select * from list_staff() where id = $1`, [ALK])
  ok('a listában: nem szerkeszthet', false, rows[0].can_edit_customers)
  ok('a listában: ez külön döntés', true, rows[0].can_edit_customers_sajat)
}
{
  const { rows } = await db.query(`select * from list_role_permissions() where role = 'STAFF'`)
  ok('a szerepkör kapcsolója maradt bekapcsolva', true, rows[0].can_edit_customers)
}
await belep(ALK)
ok('a fiók döntése erősebb', false, await jogaVan())
{
  const r = await ujUgyfel('Nem Megy', '+36 20 111 0000')
  ok('felvétel újra elutasítva', true, /tulajdonos kezeli/.test(r.hiba ?? ''))
}

console.log('\n=== 6) a külön döntés visszavonható ===\n')
await belep(TULAJ)
await db.query(`select set_staff($1::jsonb)`,
  [JSON.stringify({ id: ALK, can_edit_customers: null })])
{
  const { rows } = await db.query(`select * from list_staff() where id = $1`, [ALK])
  ok('újra a szerepkörét követi', false, rows[0].can_edit_customers_sajat)
  ok('és így megint tud szerkeszteni', true, rows[0].can_edit_customers)
}

console.log('\n=== 7) szerepkörváltásnál a külön döntés elesik ===\n')
await belep(TULAJ)
await db.query(`select set_role_permission($1::jsonb)`,
  [JSON.stringify({ role: 'STAFF', can_edit_customers: false })])
await db.query(`select set_staff($1::jsonb)`,
  [JSON.stringify({ id: ALK, can_edit_customers: true })])
await belep(FEJL)
await db.query(`select set_staff($1::jsonb)`,
  [JSON.stringify({ id: ALK, role: 'TULAJDONOS' })])
{
  const { rows } = await db.query(`select * from list_staff() where id = $1`, [ALK])
  ok('tulajdonos lett', 'TULAJDONOS', rows[0].role)
  ok('nincs rajta külön döntés', false, rows[0].can_edit_customers_sajat)
  ok('a tulajdonosi alapérték szerint szerkeszthet', true, rows[0].can_edit_customers)
}

console.log('\n=== 8) a tulajdonos nem nyúlhat a fejlesztői szinthez ===\n')
await belep(TULAJ)
{
  const r = await futtat(`select set_role_permission($1::jsonb)`,
    [JSON.stringify({ role: 'SUPERADMIN', can_edit_customers: false })])
  ok('fejlesztői szerepkör: elutasítva', true, /fejlesztő kezeli/.test(r.hiba ?? ''))
}
{
  const r = await futtat(`select set_role_permission($1::jsonb)`,
    [JSON.stringify({ role: 'TULAJDONOS', can_edit_customers: false })])
  ok('tulajdonosi szerepkör: elutasítva', true, /fejlesztő kezeli/.test(r.hiba ?? ''))
}
await belep(FEJL)
{
  const r = await futtat(`select set_role_permission($1::jsonb)`,
    [JSON.stringify({ role: 'TULAJDONOS', can_edit_customers: false })])
  ok('a fejlesztőnek megy', true, !r.hiba)
}
await db.query(`select set_role_permission($1::jsonb)`,
  [JSON.stringify({ role: 'TULAJDONOS', can_edit_customers: true })])

console.log('\n=== 9) az ügyféladat a helyén van ===\n')
{
  const { rows } = await db.query(`
    select c.name, c.notes, count(v.id)::int as jarmu
      from customers c left join vehicles v on v.customer_id = c.id
     where c.id = $1 group by 1,2`, [ugyfel])
  ok('a jegyzet mentve', 'régi papírról', rows[0].notes)
  ok('a jármű a helyén', 1, rows[0].jarmu)
}

console.log('\n=== 10) foglalásfelvétel: a két írásmód UGYANAZ az ügyfél ===\n')
await belep(TULAJ)
{
  const [{ id: pkg }] = (await db.query(`select id from packages where code='START'`)).rows
  const ma = new Date().toISOString().slice(0, 10)
  const foglal = (tel, rendszam) => futtat(`select create_booking($1::jsonb) as id`, [JSON.stringify({
    customer_name: 'Kettéhasadt Károly', customer_phone: tel, plate_raw: rendszam,
    category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS',
    service_date: ma, drop_off_time: '09:00', package_id: pkg, extras: [],
  })])
  const a = await foglal('+36 30 555 4433', 'AAA-111')
  const b = await foglal('06 30 555 4433', 'BBB-222')
  ok('mindkét foglalás létrejött', true, !!a.rows?.[0]?.id && !!b.rows?.[0]?.id)
  const { rows } = await db.query(
    `select count(*)::int as n from customers where name = 'Kettéhasadt Károly'`)
  ok('egyetlen ügyfél lett belőle', 1, rows[0].n)
  const { rows: j } = await db.query(`
    select count(*)::int as n from vehicles v
     join customers c on c.id = v.customer_id
    where c.name = 'Kettéhasadt Károly'`)
  ok('a két autó ugyanahhoz az ügyfélhez került', 2, j[0].n)
  const { rows: k } = await db.query(
    `select count(*)::int as n from list_customers('555 4433')`)
  ok('a keresőben tagoltan beírt számra is megtalálható', 1, k[0].n)
}

console.log('\n=== 11) bérlet és szerződés: ugyanez a jog ===\n')
{
  await belep(TULAJ)
  const [{ id: pkg }] = (await db.query(`select id from packages where code='PREMIUM'`)).rows
  const bUgyfel = (await ujUgyfel('Bérletes Bea', '+36 20 300 4001')).rows[0].id
  const szUgyfel = (await ujUgyfel('Szerződéses Kft', '+36 20 300 4002')).rows[0].id
  const bAuto = (await futtat(`select add_vehicle($1::jsonb) as id`, [JSON.stringify({
    customer_id: bUgyfel, plate_raw: 'BER-001', category: 'SZEMELYAUTO' })])).rows[0].id

  const berlet = () => futtat(`select create_pass($1::jsonb) as id`, [JSON.stringify({
    customer_id: bUgyfel, name: 'Teszt bérlet', validity_kind: 'EV', validity_value: '1',
    items: [{ package_id: pkg, category: 'SZEMELYAUTO', total: 10 }],
  })])
  const szerzodes = () => futtat(`select save_contract($1::jsonb) as id`, [JSON.stringify({
    customer_id: szUgyfel, name: 'Teszt szerződés', prices: [],
  })])

  await belep(FEJL)
  await db.query(`select set_staff($1::jsonb)`,
    [JSON.stringify({ id: ALK, role: 'STAFF', can_edit_customers: null })])
  await belep(TULAJ)
  await db.query(`select set_role_permission($1::jsonb)`,
    [JSON.stringify({ role: 'STAFF', can_edit_customers: false })])

  await belep(ALK)
  ok('alkalmazott nem ad ki bérletet', true, /tulajdonos kezeli/.test((await berlet()).hiba ?? ''))
  ok('alkalmazott nem ír szerződést', true, /tulajdonos kezeli/.test((await szerzodes()).hiba ?? ''))

  await belep(TULAJ)
  const b = await berlet()
  ok('a tulajdonosnak megy a bérlet', true, !!b.rows?.[0]?.id)
  ok('és a szerződés is', true, !!(await szerzodes()).rows?.[0]?.id)

  await belep(ALK)
  const fogl = await futtat(`select create_booking($1::jsonb) as id`, [JSON.stringify({
    customer_id: bUgyfel, vehicle_id: bAuto, category: 'SZEMELYAUTO',
    scope: 'TELJES', booking_type: 'LEADOS',
    service_date: new Date().toISOString().slice(0, 10), drop_off_time: '13:00',
    package_id: pkg, extras: [],
  })])
  ok('bérletes autóra tud foglalni', true, !!fogl.rows?.[0]?.id)
  const hasznal = await futtat(`select use_pass($1::uuid) as item`, [fogl.rows?.[0]?.id])
  ok('és le tudja vonni az alkalmat', true, !!hasznal.rows?.[0]?.item)
  if (hasznal.hiba) console.log('         ', hasznal.hiba)
  ok('de nem tudja kikapcsolni a bérletet', true,
    /tulajdonos kezeli/.test((await futtat(`select deactivate_pass($1::uuid)`, [b.rows[0].id])).hiba ?? ''))
}

console.log(`\n${hiba === 0 ? 'Minden rendben.' : `${hiba} hiba.`}`)
await db.close()
process.exit(hiba === 0 ? 0 : 1)
