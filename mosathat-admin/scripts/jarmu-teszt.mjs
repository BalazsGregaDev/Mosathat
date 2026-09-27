// További jármű felvétele + az ügyféltörzs védelme.
import { PGlite } from '@electric-sql/pglite'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')
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
  try { await db.exec(await readFile(join(MIG, f), 'utf8')) }
  catch (e) { console.error('MIGRÁCIÓ HIBA', f, e.message); process.exit(1) }
}
const q = async (s, p = []) => (await db.query(s, p)).rows

await q(`insert into auth.users (id,email) values
  ('00000000-0000-4000-8000-000000000001','f@x.hu'),
  ('00000000-0000-4000-8000-000000000002','t@x.hu'),
  ('00000000-0000-4000-8000-000000000003','a@x.hu') on conflict do nothing`)
await q(`insert into staff (id, full_name, role, active) values
  ('00000000-0000-4000-8000-000000000001','Fejlesztő','SUPERADMIN',true),
  ('00000000-0000-4000-8000-000000000002','Tulaj','TULAJDONOS',true),
  ('00000000-0000-4000-8000-000000000003','János','STAFF',true) on conflict do nothing`)
const TULAJ = '00000000-0000-4000-8000-000000000002'
const ALK   = '00000000-0000-4000-8000-000000000003'
const belep = (id) => q(`select set_config('app.uid',$1,false)`, [id])

const [k1] = await q(`insert into customers (name, phone) values ('Kovács Anna','+36301112233') returning id`)
const [k2] = await q(`insert into customers (name, phone) values ('Nagy Béla','+36301112244') returning id`)
await q(`insert into vehicles (customer_id, plate_raw, category) values ($1,'AAA-111','SZEMELYAUTO')`, [k1.id])

const prob = async (cimke, ki, p) => {
  await belep(ki)
  try { const [r] = await q(`select add_vehicle($1::jsonb) as id`, [JSON.stringify(p)]); console.log(`   ${cimke.padEnd(40)} → felvéve`); return r.id }
  catch (e) { console.log(`   ${cimke.padEnd(40)} → ELUTASÍTVA: ${e.message}`); return null }
}

console.log('=== 1) további jármű felvétele ===')
await prob('tulaj: második autó ugyanannak', TULAJ, { customer_id: k1.id, plate_raw: 'BBB-222', brand: 'Skoda', model: 'Octavia', category: 'SUV' })
await prob('alkalmazott: nem veheti fel', ALK, { customer_id: k1.id, plate_raw: 'CCC-333' })
await prob('ugyanaz a rendszám ugyanannál', TULAJ, { customer_id: k1.id, plate_raw: 'aaa 111' })
await prob('ugyanaz a rendszám MÁS ügyfélnél', TULAJ, { customer_id: k2.id, plate_raw: 'AAA111' })
await prob('üres rendszám', TULAJ, { customer_id: k1.id, plate_raw: '  ' })
await prob('nem létező ügyfél', TULAJ, { customer_id: '00000000-0000-4000-8000-000000000099', plate_raw: 'DDD-444' })

const autok = await q(`select plate_raw, brand, category from vehicles where customer_id=$1 order by plate_raw`, [k1.id])
console.log('   Kovács Anna autói:', autok.map(a => `${a.plate_raw} (${a.brand ?? '—'}, ${a.category})`).join(' | '))

console.log('\n=== 2) az ügyféltörzs alkalmazottnak csak olvasható ===')
for (const [cimke, ki, fn, p] of [
  ['tulaj  → ügyfél átírása', TULAJ, 'save_customer', { id: k1.id, name: 'Kovács Anna Mária' }],
  ['alkalmazott → ügyfél átírása', ALK, 'save_customer', { id: k1.id, name: 'ÁTÍRTAM' }],
  ['tulaj  → jármű átírása', TULAJ, 'save_vehicle', { id: null, plate_raw: 'X' }],
  ['alkalmazott → jármű átírása', ALK, 'save_vehicle', { id: null, plate_raw: 'X' }],
]) {
  await belep(ki)
  const cel = fn === 'save_vehicle'
    ? { ...p, id: (await q(`select id from vehicles where customer_id=$1 limit 1`, [k1.id]))[0].id }
    : p
  try { await q(`select ${fn}($1::jsonb)`, [JSON.stringify(cel)]); console.log(`   ${cimke.padEnd(32)} → átment`) }
  catch (e) { console.log(`   ${cimke.padEnd(32)} → ELUTASÍTVA: ${e.message}`) }
}
const [nev] = await q(`select name from customers where id=$1`, [k1.id])
console.log('   a név most:', nev.name, '| az alkalmazott NEM írta át:', nev.name !== 'ÁTÍRTAM')

console.log('\n=== 3) lemondás: a foglalás marad, az ügyfél is ===')
await belep(ALK)
const [{ id: pkg }] = await q(`select id from packages where code='START'`)
const [{ create_booking: bid }] = await q(`select create_booking($1::jsonb)`, [JSON.stringify({
  customer_name: 'Először Jött', customer_phone: '+36309998877', plate_raw: 'ZZZ-999',
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS',
  service_date: new Date().toISOString().slice(0, 10), drop_off_time: '09:00',
  package_id: pkg, extras: [],
})])
const elozoKap = (await q(`select booked_minutes from day_capacity(current_date)`))[0]
await q(`select set_booking_status($1::uuid,'CANCELLED_BY_CUSTOMER','Telefonon lemondta')`, [bid])
const utanKap = (await q(`select booked_minutes from day_capacity(current_date)`))[0]
const [b] = await q(`select status from bookings where id=$1`, [bid])
const [ugy] = await q(`select count(*)::int n from customers where name='Először Jött'`)
const [jar] = await q(`select count(*)::int n from vehicles where plate_raw='ZZZ-999'`)
console.log('   foglalás állapota :', b.status)
console.log('   foglalás sora megmaradt:', !!b)
console.log('   az ügyfél megmaradt:', ugy.n === 1, '| a jármű megmaradt:', jar.n === 1)
console.log('   lekötött perc:', elozoKap.booked_minutes, '→', utanKap.booked_minutes,
            '| felszabadult:', Number(utanKap.booked_minutes) < Number(elozoKap.booked_minutes))
await q(`select set_booking_status($1::uuid,'CONFIRMED')`, [bid])
console.log('   visszavonható:', (await q(`select status from bookings where id=$1`, [bid]))[0].status)

await db.close()
