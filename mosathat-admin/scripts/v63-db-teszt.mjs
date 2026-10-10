import { adatbazis, tesztelo, ALK, TULAJ } from './_db.mjs'

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
const db = await adatbazis({ elotte: SUPABASE_JOGOK })
const q = async (s, p = []) => (await db.query(s, p)).rows
const egy = async (s, p = []) => (await q(s, p))[0]
const belep = (id) => q(`select set_config('app.uid', $1, false)`, [id ?? ''])

async function szerepkorben(szerep, fn) {
  await db.exec(`set role ${szerep}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

async function hibaUzenet(fn) {
  try {
    await fn()
    return null
  } catch (e) {
    return e.message
  }
}

await belep(TULAJ)
const csomag = (await egy(`select id from packages where code = 'PREMIUM'`)).id
const szerda = (await egy(`select (date_trunc('week', current_date) + interval '9 days')::date::text d`)).d
const csutortok = (await egy(`select (date_trunc('week', current_date) + interval '10 days')::date::text d`)).d
const alap = {
  category: 'SZEMELYAUTO', scope: 'TELJES', package_id: csomag, full_service: false, extras: [],
  booking_type: 'LEADOS', service_date: szerda, start_time: null, drop_off_time: '08:30',
  customer_name: 'Kérő Kata', customer_phone: '+36 30 555 0063', customer_email: 'kata@pelda.hu',
  plate_raw: 'ker-063', brand: 'Skoda', model: 'Fabia', notes: null,
}
const kuld = async (x = {}) => (await egy(`select online_foglalas($1::jsonb) as id`, [JSON.stringify({ ...alap, ...x })])).id

console.log('=== 1) A függő kérések listája ===\n')
const elso = await kuld()
const masik = await kuld({ booking_type: 'VAROS', start_time: '10:00', drop_off_time: null,
  customer_name: 'Másik Márton', customer_phone: '+36 30 555 0064', customer_email: null, plate_raw: 'MAS-064' })
let lista = await q(`select * from v_online_kerelmek order by beerkezett`)
t.ok('mindkét kérés a listán, beérkezési sorrendben', [elso, masik], lista.map((r) => r.id))
t.ok('beérkezés ideje és e-mail', [true, 'kata@pelda.hu'], [lista[0].beerkezett !== null, lista[0].ugyfel_email])
t.ok('új ügyfél: nincs előzmény', [0, null, 0, 0],
  [lista[0].korabbi_db, lista[0].utolso_nap, lista[0].nem_jott_db, lista[0].lemondta_db])

console.log('\n=== 2) Visszatérő ügyfél előzményei ===\n')
const regi = await kuld({ service_date: csutortok, plate_raw: 'KER-063' })
await q(`update bookings set status = 'COMPLETED', service_date = current_date - 20, last_day = current_date - 20
          where id = $1`, [regi])
const nemJott = await kuld({ service_date: csutortok, plate_raw: 'KER-063' })
await q(`update bookings set status = 'NO_SHOW', service_date = current_date - 10, last_day = current_date - 10
          where id = $1`, [nemJott])
const elotte = await egy(`select korabbi_db, utolso_nap::text u, nem_jott_db from v_online_kerelmek where id = $1`, [elso])
const husz = (await egy(`select (current_date - 20)::text d`)).d
t.ok('egy elvégzett munka, utoljára 20 napja, egyszer nem jött el', [1, husz, 1],
  [elotte.korabbi_db, elotte.u, elotte.nem_jott_db])

console.log('\n=== 3) Elfogadás és elutasítás, egyszerre két eszközről ===\n')
t.ok('elfogadás', 'OK', (await egy(`select online_keres_dontes($1, true) as r`, [elso])).r)
t.ok('visszaigazolt foglalás lett', 'CONFIRMED', (await egy(`select status::text s from bookings where id = $1`, [elso])).s)
t.ok('a másik eszköz késve elutasítaná: nem írja felül, megmondja az állapotot', 'CONFIRMED',
  (await egy(`select online_keres_dontes($1, false) as r`, [elso])).r)
t.ok('az állapot maradt', 'CONFIRMED', (await egy(`select status::text s from bookings where id = $1`, [elso])).s)
t.ok('elutasítás', 'OK', (await egy(`select online_keres_dontes($1, false) as r`, [masik])).r)
t.ok('elutasítva', 'REJECTED', (await egy(`select status::text s from bookings where id = $1`, [masik])).s)
lista = await q(`select id from v_online_kerelmek`)
t.ok('a kezelt kérések lekerültek a listáról', [], lista.map((r) => r.id))

console.log('\n=== 4) A múltbeli kérés nem ugrik fel ===\n')
const multbeli = await kuld({ plate_raw: 'MLT-001' })
await q(`update bookings set service_date = current_date - 1, last_day = current_date - 1 where id = $1`, [multbeli])
t.ok('tegnapi kérés nincs a listán', 0, (await q(`select id from v_online_kerelmek where id = $1`, [multbeli])).length)

console.log('\n=== 5) Jogosultság ===\n')
const friss = await kuld({ plate_raw: 'JOG-001' })
await belep(ALK)
const dolgozo = await szerepkorben('authenticated', () => q(`select id from v_online_kerelmek`))
t.ok('alkalmazott látja', [friss], dolgozo.map((r) => r.id))
await belep(null)
const idegen = await szerepkorben('authenticated', () => q(`select id from v_online_kerelmek`))
t.ok('nem dolgozó bejelentkezett fiók nem lát semmit', 0, idegen.length)
const idegenDont = await szerepkorben('authenticated', () => hibaUzenet(() => q(`select online_keres_dontes($1, true)`, [friss])))
t.ok('és nem is dönthet', true, /Nincs ilyen foglalás/.test(idegenDont ?? ''))
const anonLista = await szerepkorben('anon', () => hibaUzenet(() => q(`select id from v_online_kerelmek`)))
const anonDont = await szerepkorben('anon', () => hibaUzenet(() => q(`select online_keres_dontes($1, true)`, [friss])))
t.ok('bejelentkezés nélkül sem a lista, sem a döntés', [true, true],
  [/permission denied/i.test(anonLista ?? ''), /permission denied/i.test(anonDont ?? '')])
await belep(TULAJ)
t.ok('a kérés érintetlen maradt', 'REQUESTED', (await egy(`select status::text s from bookings where id = $1`, [friss])).s)

await db.close()
t.vege()
