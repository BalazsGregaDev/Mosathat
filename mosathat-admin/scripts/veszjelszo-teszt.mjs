// A vészhelyzeti jelszó-visszaállítás ellenőrzése.
//
// Két dolgot kell bizonyítani, és a második a fontosabb:
//   1. a gazdaként futtatva működik
//   2. a FELÜLETRŐL nem hívható — se alkalmazottként, se tulajként
import { PGlite } from '@electric-sql/pglite'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')
const db = await PGlite.create()

await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key, email character varying(255),
    last_sign_in_at timestamptz, encrypted_password text, updated_at timestamptz);
  create or replace function auth.uid() returns uuid
    language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  create or replace function auth.role() returns text
    language sql stable as $$ select 'authenticated'::text $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  end $$;
  -- A PGlite-ban nincs pgcrypto; csak a teszt kedvéért utánozzuk.
  create schema if not exists extensions;
  create or replace function extensions.gen_salt(a text, b int) returns text
    language sql immutable as $$ select '$2a$' || b || '$teszt' $$;
  create or replace function extensions.crypt(pw text, salt text) returns text
    language sql immutable as $$ select salt || md5(pw) $$;
`)

for (const f of (await readdir(MIG)).filter((f) => f.endsWith('.sql')).sort()) {
  try { await db.exec(await readFile(join(MIG, f), 'utf8')) }
  catch (e) { console.error('MIGRÁCIÓ HIBA', f, e.message); process.exit(1) }
}
const q = async (s, p = []) => (await db.query(s, p)).rows

// három fiók
await q(`insert into auth.users (id,email) values
   ('00000000-0000-4000-8000-000000000001','fejlesztő@mosathat.hu'),
   ('00000000-0000-4000-8000-000000000002','tulaj@mosathat.hu'),
   ('00000000-0000-4000-8000-000000000003','janos@mosathat.hu')
   on conflict (id) do nothing`)
await q(`insert into staff (id, full_name, role, active) values
   ('00000000-0000-4000-8000-000000000001','Fejlesztő','SUPERADMIN',true),
   ('00000000-0000-4000-8000-000000000002','Tulaj Tamás','TULAJDONOS',true),
   ('00000000-0000-4000-8000-000000000003','Kis János','STAFF',true)
   on conflict (id) do nothing`)

console.log('=== 1) gazdaként (Supabase SQL Editor) ===')
for (const [email, jelszo] of [
  ['tulaj@mosathat.hu', 'ideiglenes123'],
  ['FEJLESZTŐ@mosathat.hu', 'masikjelszo1'],   // nagybetűvel is megtalálja
]) {
  const [r] = await q(`select public.jelszo_visszaallitas($1,$2) as v`, [email, jelszo])
  console.log('   ' + r.v)
}
const [h] = await q(`select encrypted_password from auth.users where email='tulaj@mosathat.hu'`)
console.log('   a lenyomat bcrypt, költség 10:', String(h.encrypted_password).startsWith('$2a$10$'))
console.log('   a jelszó nem nyers szövegként áll ott:',
  !String(h.encrypted_password).includes('ideiglenes123'))

console.log('\n=== 2) hibás hívások ===')
for (const [cimke, email, jelszo] of [
  ['nem létező cím', 'nincsilyen@mosathat.hu', 'ideiglenes123'],
  ['rövid jelszó', 'tulaj@mosathat.hu', 'rovid'],
]) {
  try { await q(`select public.jelszo_visszaallitas($1,$2)`, [email, jelszo]); console.log(`   ${cimke.padEnd(16)} → átment (BAJ)`) }
  catch (e) { console.log(`   ${cimke.padEnd(16)} → ${e.message}`) }
}

console.log('\n=== 3) kikapcsolt hozzáférésnél figyelmeztet ===')
await q(`update staff set active=false where id='00000000-0000-4000-8000-000000000003'`)
const [k] = await q(`select public.jelszo_visszaallitas('janos@mosathat.hu','ideiglenes123') as v`)
console.log('   ' + k.v)
await q(`update staff set active=true where id='00000000-0000-4000-8000-000000000003'`)

console.log('\n=== 4) a felületről NEM hívható ===')
for (const szerep of ['authenticated', 'anon']) {
  await q(`set role ${szerep}`)
  try {
    await q(`select public.jelszo_visszaallitas('tulaj@mosathat.hu','sajatjelszo1')`)
    console.log(`   ${szerep.padEnd(14)} → LEFUTOTT — ez biztonsági hiba volna!`)
  } catch (e) {
    console.log(`   ${szerep.padEnd(14)} → elutasítva: ${e.message}`)
  }
  await q(`reset role`)
}

// és a felületi függvény továbbra is a helyén van
console.log('\n=== 5) a felületi „Új jelszó" gomb útja változatlan ===')
await q(`select set_config('app.uid','00000000-0000-4000-8000-000000000002',false)`)
try {
  await q(`select set_staff_password('00000000-0000-4000-8000-000000000003','ujjelszo123')`)
  console.log('   tulaj → alkalmazott: átment')
} catch (e) { console.log('   tulaj → alkalmazott: ELUTASÍTVA —', e.message) }
try {
  await q(`select set_staff_password('00000000-0000-4000-8000-000000000001','ujjelszo123')`)
  console.log('   tulaj → fejlesztő: átment (BAJ)')
} catch (e) { console.log('   tulaj → fejlesztő: elutasítva —', e.message) }

await db.close()
