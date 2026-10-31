import { adatbazis, tesztelo } from './_db.mjs'

const SUPABASE_ALAPJOGOK = `
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`

const NYILVANOS_FUGGVENYEK = [
  'berlet_ajanlat(text,jsonb)', 'berlet_foglalas(text,jsonb)', 'berlet_link_adat(text)',
  'ceg_ajanlat(text,jsonb)', 'ceg_foglalas(text,jsonb)', 'ceg_link_adat(text)', 'ceg_teli_napok(text,date,date)',
  'foglalas_kereses(jsonb)', 'foglalasom(text)', 'foglalasom_lemondas(text)', 'foglalasom_modositas(text,text)',
  'publikus_ajanlat(jsonb)', 'publikus_foglalas(jsonb)', 'publikus_jogi(text,text)', 'publikus_nap(date)', 'publikus_oldal()',
]

const NYILVANOS_ADAT = ['v_opening']

const t = tesztelo()
const db = await adatbazis({ demo: true, elotte: SUPABASE_ALAPJOGOK })
const q = async (s, p = []) => (await db.query(s, p)).rows

console.log('=== 1) Kívülről (belépés nélkül) hívható, emelt jogú függvények ===\n')
const definer = await q(`
  select p.oid::regprocedure::text nev
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
   order by 1`)
const kint = definer.map((r) => r.nev.replace(/^public\./, ''))
const varatlan = kint.filter((f) => !NYILVANOS_FUGGVENYEK.includes(f))
t.ok('csak a nyilvános oldal függvényei hívhatók belépés nélkül', [], varatlan)
for (const f of kint) console.log(`        ${NYILVANOS_FUGGVENYEK.includes(f) ? 'engedélyezett' : 'NEM VÁRT    '}  ${f}`)

console.log('\n=== 2) Táblák ===\n')
const rlsNelkul = await q(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`)
t.ok('minden táblán be van kapcsolva a sorszintű védelem (RLS)', [], rlsNelkul.map((r) => r.relname))
const nezetek = await q(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm')
     and not coalesce((select bool_or(o in ('security_invoker=on', 'security_invoker=true')) from unnest(c.reloptions) o), false)
   order by 1`)
t.ok('minden nézet a hívó jogaival fut (nem kerüli meg az RLS-t)', [], nezetek.map((r) => r.relname))
const mind = await q(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') order by 1`)
const kiolvashato = []
for (const { relname } of mind) {
  await db.exec(`set role anon`)
  try {
    const [r] = (await db.query(`select count(*)::int n from public.${relname}`)).rows
    if (r.n > 0) kiolvashato.push(relname)
  } catch {
    kiolvashato.length += 0
  } finally {
    await db.exec(`reset role`)
  }
}
t.ok(`belépés nélkül egyik táblából és nézetből sem olvasható adat (${mind.length} ellenőrizve, a nyitvatartás nyilvános)`, NYILVANOS_ADAT, kiolvashato)

console.log('\n=== 3) Emelt jogú függvények beállítása ===\n')
const utNelkul = await q(`
  select p.oid::regprocedure::text nev from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
   order by 1`)
t.ok('minden emelt jogú függvénynek rögzített a keresési útvonala (search_path)', [], utNelkul.map((r) => r.nev))
const minden = await q(`
  select p.oid::regprocedure::text nev from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f', 'p')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
   order by 1`)
t.ok('minden függvénynek rögzített a keresési útvonala (a Supabase Security Advisor szerint is)', [], minden.map((r) => r.nev))
const triggerKint = await q(`
  select p.oid::regprocedure::text nev from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
   order by 1`)
t.ok('belső automatikus ellenőrzések (triggerek) kívülről nem hívhatók', [], triggerKint.map((r) => r.nev))

console.log('\n=== 4) Belépés nélkül tényleg nem megy ===\n')
const hiba = async (s) => { try { await db.query(s); return null } catch (e) { return e.message } }
const allapot = async () => (await q(`select (select count(*) from public.bookings)::int f, (select coalesce(sum(price_huf), 0) from public.package_pricing)::bigint::text a`))[0]
const elotte = await allapot()
await db.exec(`set role anon`)
for (const [mit, s] of [['ügyfelek', 'customers'], ['foglalások', 'bookings'], ['munkatársak', 'staff']]) {
  let n = 0
  try { n = (await db.query(`select count(*)::int n from public.${s}`)).rows[0].n } catch { n = 0 }
  t.ok(`${mit} kiolvasása: semmit nem ad vissza`, 0, n)
}
await hiba('delete from public.bookings')
await hiba('update public.package_pricing set price_huf = 1')
const ugyfelDb = await hiba('select public.list_customers()')
await db.exec(`reset role`)
t.ok('foglalások törlése és árak átírása hatástalan', elotte, await allapot())
t.ok('belső függvény (ügyféllista) belépés nélkül tiltva', true, Boolean(ugyfelDb))

console.log('\n=== 5) Belépett, de nem munkatárs felhasználó (ha nyitva maradna a regisztráció) ===\n')
const IDEGEN = '00000000-0000-4000-8000-0000000000ff'
await db.exec(`insert into auth.users (id, email) values ('${IDEGEN}', 'idegen@pelda.hu')`)
const belso = await q(`
  select p.oid::regprocedure::text nev, p.proname, p.prorettype = 'trigger'::regtype trigger,
         array(select format_type(x, null) from unnest(p.proargtypes::oid[]) x) tipusok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
   order by 1`)
const ARTALMATLAN = ['publikus_telefon()']
const ures = (x) => x === undefined || x === null || x === false || (Array.isArray(x) && x.length === 0)
  || (typeof x === 'object' && Object.keys(x).length === 0)
const kiadott = []
let probalt = 0
for (const f of belso) {
  const nev = f.nev.replace(/^public\./, '')
  if (f.trigger || NYILVANOS_FUGGVENYEK.includes(nev) || ARTALMATLAN.includes(nev)) continue
  probalt++
  const args = f.tipusok.map((tp) => (tp === 'date' ? '(public.budapest_ma() - 60)' : tp === 'jsonb' ? `'{}'::jsonb` : `null::${tp}`)).join(', ')
  await db.exec('begin')
  await db.exec(`select set_config('app.uid', '${IDEGEN}', true)`)
  await db.exec('set local role authenticated')
  try {
    const sorok = (await db.query(`select * from public.${f.proname}(${args}) x`)).rows
    const ertek = sorok.length === 0 ? undefined : sorok.length === 1 && 'x' in sorok[0] ? sorok[0].x : sorok
    if (!ures(ertek)) kiadott.push(`${nev} => ${JSON.stringify(ertek).slice(0, 60)}`)
  } catch {
    probalt += 0
  } finally {
    await db.exec('rollback')
  }
}
t.ok(`egyetlen belső függvény sem ad ki adatot idegennek (${probalt} kipróbálva)`, [], kiadott)
for (const [mit, s] of [['ügyfelek', 'customers'], ['foglalások', 'bookings'], ['munkatársak', 'staff'], ['járművek', 'vehicles']]) {
  await db.exec('begin')
  await db.exec(`select set_config('app.uid', '${IDEGEN}', true)`)
  await db.exec('set local role authenticated')
  let n = 0
  try { n = (await db.query(`select count(*)::int n from public.${s}`)).rows[0].n } catch { n = 0 }
  await db.exec('rollback')
  t.ok(`${mit} táblája idegennek üres`, 0, n)
}

t.vege()
