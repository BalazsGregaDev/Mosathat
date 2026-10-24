import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

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
const egy = async (s, p) => (await q(s, p))[0]
const hiba = async (f) => { try { await f(); return null } catch (e) { return e.message } }

console.log('=== 1) A "mai nap" mindenhol budapesti idő szerint ===\n')
t.ok('budapest_ma() a budapesti dátum', true,
  (await egy(`select public.budapest_ma() = (now() at time zone 'Europe/Budapest')::date x`)).x)
const ccd = await q(`select 'fv:' || p.proname n from pg_proc p where p.pronamespace = 'public'::regnamespace
   and (p.prosrc ~* '\\mcurrent_date\\M' or pg_get_function_arguments(p.oid) ~* '\\mcurrent_date\\M')
  union all select 'nezet:' || viewname from pg_views where schemaname = 'public' and definition ~* '\\mcurrent_date\\M'
  union all select 'alap:' || c.relname || '.' || a.attname from pg_attrdef d join pg_class c on c.oid = d.adrelid
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where c.relnamespace = 'public'::regnamespace and pg_get_expr(d.adbin, d.adrelid) ~* '\\mcurrent_date\\M'`)
t.ok('nincs current_date (UTC) függvényben, nézetben, alapértékben', [], ccd.map((r) => r.n))
const nezetek = await q(`select viewname n, definition d from pg_views where schemaname = 'public'`)
const ts = nezetek.filter((v) => /\b\w+_at\)?::date\b/.test(v.d.replace(/\(\w+\.\w+_at AT TIME ZONE '[^']+'::text\)::date/g, ''))).map((v) => v.n)
t.ok('nézetben nincs időzóna nélküli időbélyeg → dátum átalakítás', [], ts)
t.ok('az álló autók nézete budapesti dátummal számol', true,
  /AT TIME ZONE 'Europe\/Budapest'/.test(nezetek.find((v) => v.n === 'v_standing_cars').d))

console.log('\n=== 2) Jogosultságok ===\n')
t.ok('budapest_ma névtelenül nem hívható, bejelentkezve igen', [false, true],
  Object.values(await egy(`select has_function_privilege('anon', 'public.budapest_ma()', 'EXECUTE') a,
    has_function_privilege('authenticated', 'public.budapest_ma()', 'EXECUTE') b`)))
t.ok('a céges számlázás frissítése csak belső függvényként', [false, false],
  Object.values(await egy(`select has_function_privilege('anon', 'public.ceg_szamlazas_frissit(uuid)', 'EXECUTE') a,
    has_function_privilege('authenticated', 'public.ceg_szamlazas_frissit(uuid)', 'EXECUTE') b`)))
await q(`select set_config('app.uid', $1, false)`, [TULAJ])
const ceg = (await egy(`insert into companies (name) values ('Belső Függvény Teszt Kft.') returning id`)).id
t.ok('a szerződés mentése (ami belül meghívja) továbbra is működik', null,
  await hiba(() => q(`select save_contract($1::jsonb)`, [JSON.stringify({
    company_id: ceg, active: true, valid_until: null, pickup_delivery: false, prices: [],
  })])))

t.ok('az online kérés belső függvénye kívülről nem hívható, a publikus foglalás igen', [false, false, true],
  Object.values(await egy(`select has_function_privilege('anon', 'public.online_foglalas(jsonb)', 'EXECUTE') a,
    has_function_privilege('authenticated', 'public.online_foglalas(jsonb)', 'EXECUTE') b,
    has_function_privilege('anon', 'public.publikus_foglalas(jsonb)', 'EXECUTE') c`)))
const premium = (await egy(`select id from packages where code = 'PREMIUM'`)).id
const nap = (await egy(`select d::date::text d from generate_series(public.budapest_ma() + 3, public.budapest_ma() + 30, interval '1 day') d
  where munkanap(d::date) and extract(isodow from d) < 6 order by d limit 1`)).d
const keres = (n) => JSON.stringify({ category: 'SZEMELYAUTO', scope: 'TELJES', package_id: premium, booking_type: 'LEADOS', service_date: nap,
  drop_off_time: '09:00', customer_name: 'Jog Teszt', customer_phone: `+36 30 111 22${n}`, plate_raw: `JOG-0${n}` })
const szerepben = async (szerep, f) => { await q(`set role ${szerep}`); try { return await hiba(f) } finally { await q('reset role') } }
await q(`select set_config('app.uid', '', false)`)
t.ok('névtelenül a publikus foglalás működik (belül az online kérés függvényét hívja)', null,
  await szerepben('anon', () => q(`select publikus_foglalas($1::jsonb)`, [keres(11)])))
await q(`select set_config('app.uid', $1, false)`, [TULAJ])
t.ok('bejelentkezve sem hívható közvetlenül', true,
  /permission denied/.test(await szerepben('authenticated', () => q(`select online_foglalas($1::jsonb)`, [keres(12)])) ?? ''))

console.log('\n=== 3) A bérletek és szerződések alap kezdőnapja ===\n')
t.ok('passes.valid_from és contracts.valid_from alapja a budapesti nap', [true, true],
  (await q(`select pg_get_expr(d.adbin, d.adrelid) ~ 'budapest_ma' x from pg_attrdef d join pg_class c on c.oid = d.adrelid
    join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where (c.relname, a.attname) in (('passes', 'valid_from'), ('contracts', 'valid_from')) order by c.relname desc`)).map((r) => r.x))

t.vege()
