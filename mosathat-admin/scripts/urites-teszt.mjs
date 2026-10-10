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
  try { await db.exec(await readFile(join(MIG, f), 'utf8')) }
  catch (e) { console.error('MIGRÁCIÓ HIBA', f, e.message); process.exit(1) }
}

await db.exec(`
  insert into auth.users (id,email) values ('00000000-0000-4000-8000-000000000001','f@x.hu');
  insert into staff (id, full_name, role, active)
    values ('00000000-0000-4000-8000-000000000001','Fejlesztő','SUPERADMIN',true);
  select set_config('app.uid','00000000-0000-4000-8000-000000000001',false);
`)
await db.exec(await readFile(join(GYOKER, 'supabase', 'demo', 'demo_adatok.sql'), 'utf8'))

await db.exec(`
  update bookings set moved_to_booking_id = (select id from bookings offset 1 limit 1)
   where id = (select id from bookings limit 1);
`)

const q = async (s, p = []) => (await db.query(s, p)).rows
const TABLAK = ['customers', 'vehicles', 'bookings', 'booking_items', 'booking_tasks',
  'multiday_allocations', 'passes', 'pass_items', 'pass_usages', 'contracts',
  'contract_prices', 'audit_log', 'companies', 'day_order',
  'company_sheets', 'company_sheet_rows', 'company_sheet_settings']
const MARAD = ['packages', 'package_items', 'package_pricing', 'full_service_pricing',
  'extras', 'surcharges', 'business_hours', 'working_hours', 'break_windows',
  'shop_settings', 'day_overrides', 'staff']

const szamol = async (lista) => {
  const ki = {}
  for (const t of lista) ki[t] = (await q(`select count(*)::int n from ${t}`))[0].n
  return ki
}

const elotte = await szamol(TABLAK)
const torzsElotte = await szamol(MARAD)
console.log('=== ELŐTTE ===')
console.log('   ' + Object.entries(elotte).map(([t, n]) => `${t}:${n}`).join('  '))

const PARANCS = `
begin;

update public.bookings set moved_to_booking_id = null;

delete from public.bookings;

delete from public.customers;

delete from public.companies;

delete from public.audit_log;

commit;
`
await db.exec(PARANCS)

const utana = await szamol(TABLAK)
const torzsUtana = await szamol(MARAD)
console.log('\n=== UTÁNA ===')
console.log('   ' + Object.entries(utana).map(([t, n]) => `${t}:${n}`).join('  '))
console.log('\n   minden ügyféladat eltűnt:', Object.values(utana).every((n) => n === 0))

console.log('\n=== AMI MEGMARADT (ennek maradnia KELL) ===')
let baj = 0
for (const t of MARAD) {
  const ok = torzsUtana[t] === torzsElotte[t]
  if (!ok) baj++
  console.log(`   ${t.padEnd(22)} ${torzsElotte[t]} → ${torzsUtana[t]} ${ok ? '' : '  ← BAJ'}`)
}

console.log('\n=== A TÖRLÉS UTÁN IS MŰKÖDIK ===')
const [{ id: pkg }] = await q(`select id from packages where code='PREMIUM'`)
const [{ create_booking: uj }] = await q(`select create_booking($1::jsonb)`, [JSON.stringify({
  customer_name: 'Első Éles Ügyfél', customer_phone: '+36301234567', plate_raw: 'ABC-001',
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS',
  service_date: new Date().toISOString().slice(0, 10), drop_off_time: '08:00',
  package_id: pkg, extras: [],
})])
console.log('   új foglalás felvehető:', !!uj)
console.log('   ügyfél:', (await q(`select count(*)::int n from customers`))[0].n,
            '| jármű:', (await q(`select count(*)::int n from vehicles`))[0].n,
            '| munkalépés:', (await q(`select count(*)::int n from booking_tasks`))[0].n)
const [hetkoznap] = await q(
  `select d::date as nap from generate_series(current_date, current_date + 7, '1 day') d
    where extract(isodow from d) = 3 limit 1`)
const [kap] = await q(`select load_pct from day_capacity($1::date)`, [hetkoznap.nap])
console.log('   kapacitás számol (szerdára):', kap.load_pct !== null, '→', kap.load_pct + '%')

console.log(baj === 0 ? '\nRENDBEN.' : `\n${baj} BAJ VAN.`)
await db.close()
