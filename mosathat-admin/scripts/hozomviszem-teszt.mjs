// A hozom-viszem díja: szerződésben tárolva, a munkalapon látszik.
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

const TULAJ = '00000000-0000-4000-8000-000000000002'
await db.exec(`
  insert into auth.users (id,email) values ('${TULAJ}','t@x.hu');
  insert into staff (id, full_name, role, active) values ('${TULAJ}','T','TULAJDONOS',true);
  select set_config('app.uid','${TULAJ}',false);
`)

let hiba = 0
function ok(mit, varjuk, kaptuk) {
  const jo = JSON.stringify(varjuk) === JSON.stringify(kaptuk)
  if (!jo) hiba++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(kaptuk)} (várt: ${JSON.stringify(varjuk)})`}`)
}
const q = async (sql, params = []) => (await db.query(sql, params)).rows

const [{ id: ceg }] = await q(`select add_customer('{"name":"Fuvar Kft","phone":"+36301112222","type":"CEG"}'::jsonb) as id`)
const [{ id: auto }] = await q(`select add_vehicle($1::jsonb) as id`,
  [JSON.stringify({ customer_id: ceg, plate_raw: 'FUV-001', category: 'SZEMELYAUTO' })])
const [{ id: pkg }] = await q(`select id from packages where code='PREMIUM'`)
const ma = new Date().toISOString().slice(0, 10)

console.log('=== 1) a díj mentése ===\n')
await q(`select save_contract($1::jsonb) as id`, [JSON.stringify({
  customer_id: ceg, pickup_delivery: true, pickup_delivery_fee_huf: 4500,
  prices: [{ tier: 'PREMIUM', size: 'NORMAL', price_huf: 20000 }],
})])
{
  const [r] = await q(`select pickup_delivery, pickup_delivery_fee_huf from v_contracts where customer_id=$1`, [ceg])
  ok('jár a hozom-viszem', true, r.pickup_delivery)
  ok('és a díja megvan', 4500, r.pickup_delivery_fee_huf)
}

console.log('\n=== 2) ha kikapcsolják, a díj is elszáll ===\n')
await q(`select save_contract($1::jsonb)`, [JSON.stringify({
  id: (await q(`select id from contracts where customer_id=$1`, [ceg]))[0].id,
  customer_id: ceg, pickup_delivery: false, pickup_delivery_fee_huf: 4500, prices: [],
})])
{
  const [r] = await q(`select pickup_delivery, pickup_delivery_fee_huf from v_contracts where customer_id=$1`, [ceg])
  ok('nem jár', false, r.pickup_delivery)
  ok('a díj sem maradt ott', null, r.pickup_delivery_fee_huf)
}

// vissza
await q(`select save_contract($1::jsonb)`, [JSON.stringify({
  id: (await q(`select id from contracts where customer_id=$1`, [ceg]))[0].id,
  customer_id: ceg, pickup_delivery: true, pickup_delivery_fee_huf: 4500, prices: [],
})])

console.log('\n=== 3) a munkalapon csak a hozom-viszem foglalásnál látszik ===\n')
const foglal = async (tipus, ido) => (await q(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  customer_id: ceg, vehicle_id: auto, category: 'SZEMELYAUTO', scope: 'TELJES',
  booking_type: tipus, service_date: ma, drop_off_time: ido, package_id: pkg, extras: [],
})]))[0].id
const hv = await foglal('HOZOMVISZEM', '09:00')
const le = await foglal('LEADOS', '13:00')
{
  const [a] = await q(`select pickup_fee_huf, estimated_price_huf from v_day_bookings where id=$1`, [hv])
  const [b] = await q(`select pickup_fee_huf, estimated_price_huf from v_day_bookings where id=$1`, [le])
  ok('hozom-viszem foglalásnál ott a díj', 4500, a.pickup_fee_huf)
  ok('a lehozott autónál nincs', null, b.pickup_fee_huf)
  // A 2026-10-03-i migráció óta a fuvar a foglalás ÁRÁBA is bekerül, külön
  // tételsorként — a két foglalás közti különbség pontosan a fuvardíj.
  ok('a fuvar benne van a hozom-viszem árában', 4500, a.estimated_price_huf - b.estimated_price_huf)
  console.log(`         ár fuvarral: ${a.estimated_price_huf} Ft, nélküle: ${b.estimated_price_huf} Ft`)
}

console.log('\n=== 4) lejárt szerződésnél nincs díj ===\n')
await q(`update contracts set valid_until = current_date - 1 where customer_id = $1`, [ceg])
{
  const [a] = await q(`select pickup_fee_huf from v_day_bookings where id=$1`, [hv])
  ok('lejárt szerződés: nincs fuvardíj', null, a.pickup_fee_huf)
}

console.log(`\n${hiba === 0 ? 'Minden rendben.' : `${hiba} hiba.`}`)
await db.close()
process.exit(hiba === 0 ? 0 : 1)
