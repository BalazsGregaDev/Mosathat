// Az „éles indulás előtti ellenőrzés" lekérdezés kipróbálása.
//
// Lefuttatja a migrációkat, betölti a demó adatokat, kiüríti őket a törlő
// paranccsal, és megnézi, mit jelent az ellenőrzés egy friss adatbázison.
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
await db.exec(`
  insert into auth.users (id,email) values ('00000000-0000-4000-8000-000000000001','f@x.hu');
  insert into staff (id, full_name, role, active)
    values ('00000000-0000-4000-8000-000000000001','Fejlesztő','SUPERADMIN',true);
  select set_config('app.uid','00000000-0000-4000-8000-000000000001',false);
`)
await db.exec(await readFile(join(GYOKER, 'supabase', 'demo', 'demo_adatok.sql'), 'utf8'))

// a törlő parancs
await db.exec(`
  begin;
  update public.bookings set moved_to_booking_id = null;
  delete from public.bookings;
  delete from public.customers;
  delete from public.audit_log;
  commit;
`)

const ELLENORZES = `
select 'ügyfél maradt'              as mi, count(*)::int as ennyi, 0 as kell from public.customers
union all
select 'foglalás maradt',            count(*)::int, 0 from public.bookings
union all
select 'csomag',                     count(*)::int, 3 from public.packages
union all
select 'hiányzó Kívül/Belül időtartam',
       count(*)::int, 0
  from public.package_pricing where scope <> 'TELJES' and duration_minutes is null
union all
select 'hiányzó ár a csomagoknál',   count(*)::int, 0
  from public.package_pricing where price_huf is null and not requires_quote
union all
select 'hiányzó ár az egyéb szolgáltatásoknál', count(*)::int, 0
  from public.extras where active and price_huf is null and not requires_quote
union all
select 'belépni tudó felhasználó',   count(*)::int, -1
  from public.staff s join auth.users u on u.id = s.id where s.active
union all
select 'nyitvatartási nap',          count(*)::int, 7 from public.business_hours
union all
select 'párhuzamosan mosott autó',   default_parallel_slots::int, -1 from public.shop_settings
order by 1;
`
const { rows } = await db.query(ELLENORZES)
console.log('=== Éles indulás előtti ellenőrzés (törlés után) ===\n')
for (const r of rows) {
  const jel = r.kell === -1 ? ' ' : (r.ennyi === r.kell ? ' ' : '←')
  console.log(`   ${String(r.mi).padEnd(38)} ${String(r.ennyi).padStart(4)}  ${jel}`)
}
await db.close()
