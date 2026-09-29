// Mezőnkénti keresés: a rendszám mező rendszámot, a név mező nevet keres.
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

// Két ügyfél: az egyik NEVE kezdődik úgy, ahogy a másik RENDSZÁMA.
const [{ id: a }] = await q(`select add_customer('{"name":"Abonyi Péter","phone":"+36301110001"}'::jsonb) as id`)
const [{ id: b }] = await q(`select add_customer('{"name":"Kiss Tamás","phone":"+36301110002"}'::jsonb) as id`)
const [{ id: c }] = await q(
  `select add_customer('{"name":"Nagy Béla","phone":"+36301110003","type":"CEG","company_name":"Autó Trans Kft"}'::jsonb) as id`)
await q(`select add_vehicle($1::jsonb)`, [JSON.stringify({ customer_id: a, plate_raw: 'XYZ-100', category: 'SZEMELYAUTO' })])
await q(`select add_vehicle($1::jsonb)`, [JSON.stringify({ customer_id: b, plate_raw: 'ABC-200', category: 'SZEMELYAUTO' })])
await q(`select add_vehicle($1::jsonb)`, [JSON.stringify({ customer_id: c, plate_raw: 'TRA-300', category: 'KISBUSZ' })])

const nevek = async (s, mezo) =>
  (await q(`select customer_name, plate_raw from search_customers($1, 10, $2)`, [s, mezo]))
    .map((r) => `${r.plate_raw}/${r.customer_name}`)

console.log('=== 1) rendszám mező: csak rendszámot keres ===\n')
ok('„AB" a rendszám mezőben csak az ABC-200-at hozza', ['ABC-200/Kiss Tamás'],
  await nevek('AB', 'RENDSZAM'))
ok('egy karakterre is keres', ['XYZ-100/Abonyi Péter'], await nevek('X', 'RENDSZAM'))
ok('a végéről bemondott rendszám is megvan', ['ABC-200/Kiss Tamás'], await nevek('200', 'RENDSZAM'))
ok('kötőjellel is', ['ABC-200/Kiss Tamás'], await nevek('abc-2', 'RENDSZAM'))

console.log('\n=== 2) név mező: nevet és cégnevet keres ===\n')
ok('„AB" a név mezőben Abonyit hozza, az ABC-200-at nem', ['XYZ-100/Abonyi Péter'],
  await nevek('AB', 'NEV'))
ok('ékezet nélkül is megvan', ['XYZ-100/Abonyi Péter'], await nevek('abonyi', 'NEV'))
ok('cégnévre is talál', ['TRA-300/Nagy Béla'], await nevek('autó trans', 'NEV'))
ok('rendszámra a név mezőben nincs találat', [], await nevek('XYZ', 'NEV'))

console.log('\n=== 3) a régi, kétparaméteres hívás változatlan ===\n')
{
  const r = await q(`select customer_name from search_customers('AB', 10)`)
  ok('mindkettőt hozza', 2, r.length)
}

console.log('\n=== 4) a találat minden alapadatot hoz ===\n')
{
  const [r] = await q(`select * from search_customers('TRA', 5, 'RENDSZAM')`)
  ok('név', 'Nagy Béla', r.customer_name)
  ok('telefonszám', '+36301110003', r.customer_phone)
  ok('cégnév', 'Autó Trans Kft', r.company_name)
  ok('méret', 'KISBUSZ', r.category)
  ok('jármű azonosító megvan', true, !!r.vehicle_id)
  ok('ügyfél azonosító megvan', true, !!r.customer_id)
}

console.log(`\n${hiba === 0 ? 'Minden rendben.' : `${hiba} hiba.`}`)
await db.close()
process.exit(hiba === 0 ? 0 : 1)
