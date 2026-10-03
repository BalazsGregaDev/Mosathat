// 4. fázis, adatbázis: munkaidő-változások listája, új egyéb szolgáltatás,
// ügyfél- és jármű-összesítő, cég szerinti nézet, szerződés csomagonként.
import { adatbazis, tesztelo, TULAJ, ALK } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
const hiba = async (sql, p = []) => {
  try { await db.query(sql, p); return null } catch (e) { return String(e.message) }
}
const belep = (id) => db.exec(`select set_config('app.uid','${id}',false)`)
const csomag = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))

console.log('=== A) Munkaidő-változások ===\n')
await belep(ALK)
await q(`select set_absence($1::jsonb)`, [JSON.stringify({
  day: (await egy(`select (current_date + 1)::text d`)).d, kind: 'KESOBB_ERKEZIK', ends: '10:00',
  note: 'fogorvos helyett: csak késik' })])
await belep(TULAJ)
await q(`select set_absence($1::jsonb)`, [JSON.stringify({
  day: (await egy(`select (current_date + 2)::text d`)).d, kind: 'EGESZ_NAP' })])
await q(`select set_absence($1::jsonb)`, [JSON.stringify({
  staff_id: ALK, day: (await egy(`select (current_date + 3)::text d`)).d,
  kind: 'TAVOL', starts: '11:00', ends: '13:00' })])

await belep(ALK)
const alk = await q(`select * from absence_list()`)
t.ok('az alkalmazott csak a sajátját látja (2: amit ő írt, és amit a tulaj neki)', 2, alk.length)
t.ok('mind az övé', true, alk.every((r) => r.sajat))
await belep(TULAJ)
const tul = await q(`select * from absence_list()`)
t.ok('a tulaj mindenkiét látja', 3, tul.length)
t.ok('a név is benne van', true, tul.some((r) => r.staff_name === 'Gábor'))
await belep(ALK)
t.ok('az alkalmazott a tulajét nem törölheti', true,
  (await hiba(`select delete_absence($1::uuid)`, [tul.find((r) => r.staff_id === TULAJ).id]))?.includes('Nincs ilyen'))

console.log('\n=== B) Új egyéb szolgáltatás ===\n')
t.ok('alkalmazott nem vehet fel', true,
  (await hiba(`select create_extra('{"name":"Teszt"}'::jsonb)`))?.includes('tulajdonos'))
await belep(TULAJ)
const ujId = (await egy(`select create_extra($1::jsonb) as id`, [JSON.stringify({
  name: 'Fényszóró polírozás', price_huf: 9900, work_minutes: 45 })])).id
const uj = await egy(`select name, price_huf, work_minutes, active, sort_order,
  (select max(sort_order) from extras) as maxs from extras where id = $1`, [ujId])
t.ok('felvéve: név, ár, idő, aktív', ['Fényszóró polírozás', 9900, 45, true],
  [uj.name, uj.price_huf, uj.work_minutes, uj.active])
t.ok('a lista végére került', uj.maxs, uj.sort_order)
t.ok('ugyanaz a név (ékezet nélkül) még egyszer nem', true,
  (await hiba(`select create_extra('{"name":"fenyszoro polirozas"}'::jsonb)`))?.includes('már van'))

console.log('\n=== C) Ügyfelek: rendszámok, cég, cég szerinti nézet ===\n')
const foglal = async (adat) => (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS',
  service_date: (await egy(`select (current_date + 7)::text d`)).d,
  drop_off_time: '09:00', package_id: csomag.START, extras: [], ...adat,
})])).id
await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010', plate_raw: 'FLT-001', company_name: 'Flotta Kft.' })
await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010', plate_raw: 'FLT-002', company_name: 'Flotta Kft.' })
await foglal({ customer_name: 'Másik Misi', customer_phone: '+36301110011', plate_raw: 'FLT-003', company_name: 'FLOTTA kft' })

const sanyi = await egy(`select * from list_customers('Sofőr Sanyi')`)
t.ok('ügyfél szerint: a rendszámok, nem a darabszám', ['FLT-001', 'FLT-002'], sanyi.rendszamok)
const jarmu = await egy(`select * from list_vehicles('FLT-003')`)
t.ok('jármű szerint: a cég neve és azonosítója', ['Flotta Kft.', true],
  [jarmu.company_name, Boolean(jarmu.company_id)])

const cegek = (await q(`select list_companies('flotta') as c`)).map((r) => r.c)
t.ok('cég szerint: egy cég (a „FLOTTA kft" ugyanaz)', 1, cegek.length)
t.ok('mindhárom autója egy helyen, két sofőrrel', [['FLT-001', 'FLT-002', 'FLT-003'], 2],
  [cegek[0].autok.map((a) => a.plate_raw), cegek[0].ugyfelek])
t.ok('rendszámra keresve is a cég jön, minden autójával', 3,
  (await egy(`select list_companies('FLT-002') as c`)).c.autok.length)

console.log('\n=== D) Szerződés csomagonként, Céges és Magán áron ===\n')
await q(`select save_contract($1::jsonb)`, [JSON.stringify({
  company_name: 'Flotta Kft.', valid_until: (await egy(`select (current_date + 300)::text d`)).d,
  prices: [
    { package_id: csomag.ELIT, size: 'NORMAL', kind: 'FLOTTA', price_huf: 21000 },
    { package_id: csomag.ELIT, size: 'NAGY', kind: 'FLOTTA', price_huf: 26000 },
    { package_id: csomag.ELIT, size: 'NORMAL', kind: 'SAJAT', price_huf: 23000 },
  ] })])
const c = await egy(`select * from v_contracts where company_name = 'Flotta Kft.'`)
t.ok('az Elit Nagy ára is elmentve', 26000,
  c.prices.find((p) => p.package_code === 'ELIT' && p.size === 'NAGY' && p.kind === 'FLOTTA')?.price_huf)
t.ok('a Magán ár is', 23000,
  c.prices.find((p) => p.package_code === 'ELIT' && p.kind === 'SAJAT')?.price_huf)
t.ok('a cég nézetben szerződéses', true,
  (await egy(`select list_companies('flotta') as c`)).c.szerzodes)
t.ok('a jármű nézetben is', true, (await egy(`select * from list_vehicles('FLT-001')`)).szerzodes)

t.vege()
