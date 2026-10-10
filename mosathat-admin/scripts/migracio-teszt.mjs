import { PGlite } from '@electric-sql/pglite'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')
const db = await PGlite.create()

await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key, email character varying(255), last_sign_in_at timestamptz);
  create or replace function auth.uid() returns uuid
    language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  create or replace function auth.role() returns text
    language sql stable as $$ select 'authenticated'::text $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  end $$;
`)

const fajlok = (await readdir(MIG)).filter(f => f.endsWith('.sql')).sort()
for (const f of fajlok) {
  try { await db.exec(await readFile(join(MIG, f), 'utf8')) }
  catch (e) { console.error(`HIBA ${f}:`, e.message); process.exit(1) }
}
console.log(`${fajlok.length} migráció lefutott.\n`)

const q = async (sql, p = []) => (await db.query(sql, p)).rows

console.log('=== 1) resolve_package_items (a munkalista ebből él) ===')
for (const kod of ['START', 'PREMIUM', 'ELIT']) {
  const r = await q(
    `select name from resolve_package_items((select id from packages where code=$1)) order by area, sort_order`,
    [kod])
  console.log(`   ${kod.padEnd(8)} ${r.length} tétel`)
  if (kod === 'ELIT') {
    const n = r.map(x => x.name)
    console.log('     tartalmaz „Falc mélytisztítás":', n.includes('Falc mélytisztítás'))
    console.log('     NEM tartalmaz „Falc áttörlés" :', !n.includes('Falc áttörlés'))
    console.log('     tartalmaz „Hosszantartó vax"  :', n.includes('Hosszantartó vax'))
    console.log('     NEM tartalmaz „Gyors viasz"   :', !n.includes('Gyors viasz'))
  }
}

console.log('\n=== 2) v_package_matrix — a táblázat ===')
const sorok = await q(`select * from v_package_matrix order by area, sort_order, package_sort`)
console.log('   összes sor:', sorok.length)

const csomagok = await q(`select code, name from packages where active order by sort_order`)
const slotok = []
for (const s of sorok) {
  let sl = slotok.find(x => x.id === s.slot_id)
  if (!sl) { sl = { id: s.slot_id, nev: s.slot_name, area: s.area, sort: s.sort_order, cella: {} }; slotok.push(sl) }
  sl.cella[s.package_code] = s.name
}
console.log('   táblázat sorai:', slotok.length, '(ennyi különböző munkalépés van)')

const fej = 'MUNKALÉPÉS'.padEnd(34) + csomagok.map(c => c.code.padEnd(22)).join('')
console.log('\n' + fej)
console.log('-'.repeat(fej.length))
let terulet = null
for (const s of slotok) {
  if (s.area !== terulet) { terulet = s.area; console.log(terulet === 'KULSO' ? 'KÍVÜL' : 'BELÜL') }
  const sorNev = '  ' + s.nev
  const cellak = csomagok.map(c => {
    const v = s.cella[c.code]
    if (!v) return 'nincs benne'.padEnd(22)
    return (v === s.nev ? 'van' : v).padEnd(22)
  })
  console.log(sorNev.padEnd(34) + cellak.join(''))
}

console.log('\n=== 3) ellenőrzések ===')
const falc = slotok.find(s => s.nev === 'Falc áttörlés')
const viasz = slotok.find(s => s.nev === 'Gyors viasz')
console.log('   „Falc áttörlés" EGY sor, és az Elit cellájában más név áll:',
  !!falc, falc && falc.cella.ELIT === 'Falc mélytisztítás')
console.log('   „Falc mélytisztítás" NEM külön sor:',
  !slotok.some(s => s.nev === 'Falc mélytisztítás'))
console.log('   „Gyors viasz" sor: Start nincs, Premium van, Elit = Hosszantartó vax:',
  !!viasz, viasz && !viasz.cella.START, viasz && viasz.cella.PREMIUM === 'Gyors viasz',
  viasz && viasz.cella.ELIT === 'Hosszantartó vax')
const elitDb = sorok.filter(s => s.package_code === 'ELIT').length
console.log('   Elit sorainak száma a mátrixban = 14:', elitDb === 14)
console.log('   minden sornak van slot_name:', slotok.every(s => !!s.nev))

console.log('\n=== 4) v_package_extra — az árlista fejlécébe ===')
let tobblet = []
try {
  tobblet = await q(`select * from v_package_extra order by package_code, area, sort_order`)
} catch (e) { console.error('   SQL HIBA:', e.message); process.exit(1) }
for (const c of csomagok) {
  const sajat = tobblet.filter(x => x.package_code === c.code)
  if (sajat.length === 0) { console.log(`   ${c.name.padEnd(9)} → (nincs extra szöveg)`); continue }
  console.log(`   ${c.name.padEnd(9)} → ${c.name} | ${sajat[0].parent_name} + ${sajat.map(x => x.name).join(', ')}`)
}

await db.close()
