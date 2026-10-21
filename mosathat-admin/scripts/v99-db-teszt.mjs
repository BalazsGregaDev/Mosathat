import { terhel } from './_terheles.mjs'
import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
const egy = async (s, p) => (await q(s, p))[0]
const ki = (id) => q(`select set_config('app.uid', $1, false)`, [id ?? ''])
const hiba = async (f) => { try { await f(); return null } catch (e) { return e.message } }

async function anonkent(f) {
  await ki('')
  await db.exec('set role anon')
  try { return await f() } finally { await db.exec('reset role') }
}

const LINK = 'autotransdemo2026link'
const ceg = await egy(`select id, name from companies where name = 'Autó Trans Kft.'`)
const csomag = async (kod) => (await egy(`select id from packages where code = $1`, [kod])).id
const START = await csomag('START')
const PREMIUM = await csomag('PREMIUM')
const ELIT = await csomag('ELIT')
const nap = (await egy(`select d::text d from generate_series(
    (now() at time zone 'Europe/Budapest')::date + 2,
    (now() at time zone 'Europe/Budapest')::date + 20, interval '1 day') d
  where munkanap(d::date) order by d limit 1`)).d
await ki(TULAJ)
await terhel(q, nap, 50)

await ki(TULAJ)
await q(`delete from contract_prices cp using contracts ct
  where ct.id = cp.contract_id and ct.company_id = $1 and cp.package_id = $2`, [ceg.id, ELIT])

console.log('=== 1) Csak a szerződésben szereplő csomagok ===\n')
const adat = await anonkent(async () => (await egy(`select ceg_link_adat($1) x`, [LINK])).x)
t.ok('Elit nélküli szerződés: két csomag', [START, PREMIUM].sort(), [...adat.csomagok].sort())
const ajanlat = (x = {}) => anonkent(async () => (await egy(`select ceg_ajanlat($1, $2) x`, [LINK, JSON.stringify({
  package_id: START, category: 'SZEMELYAUTO', booking_type: 'LEADOS', service_date: nap, ...x })])).x)
t.ok('Elitre nincs ajánlat', true, /nem szerepel a cég szerződésében/.test(await hiba(() => ajanlat({ package_id: ELIT })) ?? ''))

const kuld = (x = {}) => anonkent(async () => (await egy(`select ceg_foglalas($1, $2)->>'id' id`, [LINK, JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', package_id: START, full_service: false, extras: [],
  booking_type: 'LEADOS', service_date: nap, drop_off_time: '09:00',
  customer_name: 'Céges Csaba', customer_phone: '+36 30 555 0001', plate_raw: 'CEG-001', ...x })])).id)
t.ok('Elitre nem lehet kérni', true, /nem szerepel a cég szerződésében/.test(await hiba(() => kuld({ package_id: ELIT })) ?? ''))

console.log('\n=== 2) Terjedelem, Full Service és extrák nélkül ===\n')
const extra = (await egy(`select id from extras where active order by sort_order limit 1`)).id
const id1 = await kuld({ scope: 'KULSO', full_service: true, seat_material: 'BOR', extras: [{ extra_id: extra, quantity: 1 }] })
await ki(TULAJ)
const b1 = await egy(`select b.scope, b.full_service, b.estimated_price_huf, v.category,
    (select count(*)::int from booking_items bi where bi.booking_id = b.id and bi.kind <> 'PACKAGE') as egyeb
  from bookings b join vehicles v on v.id = b.vehicle_id where b.id = $1`, [id1])
t.ok('mindig teljes, Full Service és extra nélkül, Normál szerződéses áron',
  ['TELJES', false, 0, 10500, 'SZEMELYAUTO'], [b1.scope, b1.full_service, b1.egyeb, b1.estimated_price_huf, b1.category])

console.log('\n=== 3) Ismert autó: a nyilvántartott méretével ===\n')
await q(`insert into customers (name, phone, type) values ('Nagy Autós', '+36 30 555 0002', 'MAGAN')`)
await q(`insert into vehicles (customer_id, plate_raw, category)
  select id, 'NGY-002', 'SUV' from customers where phone = '+36 30 555 0002'`)
const id2 = await kuld({ customer_name: 'Nagy Autós', customer_phone: '+36 30 555 0002', plate_raw: 'NGY-002', category: 'SZEMELYAUTO' })
await ki(TULAJ)
t.ok('SUV marad, Nagy szerződéses ár', ['SUV', 13500],
  Object.values(await egy(`select v.category, b.estimated_price_huf from bookings b join vehicles v on v.id = b.vehicle_id where b.id = $1`, [id2])))

console.log('\n=== 4) Időpont 7:30 és 17:00 között ===\n')
t.ok('7:00 elutasítva', true, /7:30 és 17:00/.test(await hiba(() => kuld({ drop_off_time: '07:00', plate_raw: 'CEG-003' })) ?? ''))
t.ok('17:30 elutasítva', true, /7:30 és 17:00/.test(await hiba(() => kuld({ drop_off_time: '17:30', plate_raw: 'CEG-004' })) ?? ''))
t.ok('7:30 elfogadva', null, await hiba(() => kuld({ drop_off_time: '07:30', plate_raw: 'CEG-005', customer_phone: '+36 30 555 0005' })))
t.ok('megvárós 8:00 elfogadva', null, await hiba(() => kuld({ booking_type: 'VAROS', drop_off_time: null, start_time: '08:00', plate_raw: 'CEG-006', customer_phone: '+36 30 555 0006' })))

console.log('\n=== 5) Munkalap: a méret átírása az árat is átírja ===\n')
await ki(TULAJ)
await q(`select patch_booking($1, '{"category":"SUV"}'::jsonb)`, [id1])
t.ok('Nagyra állítva: Nagy szerződéses ár', ['SUV', 13500],
  Object.values(await egy(`select v.category, b.estimated_price_huf from bookings b join vehicles v on v.id = b.vehicle_id where b.id = $1`, [id1])))
await q(`select patch_booking($1, '{"category":"SZEMELYAUTO"}'::jsonb)`, [id1])
t.ok('vissza Normálra', 10500, (await egy(`select estimated_price_huf from bookings where id = $1`, [id1])).estimated_price_huf)

console.log('\n=== 6) Nézetek ===\n')
const nb = (await q(`select x from day_bookings($1::date) x`, [nap])).map((r) => r.x).find((x) => x.id === id1)
t.ok('a napi adatban ott a céges link jelölése', ceg.id, nb.ceg_link_company)
const k = await egy(`select ceg_link_company, ceg_link_nev from v_online_kerelmek where id = $1`, [id2])
t.ok('az online kérésben a cég neve', [ceg.id, ceg.name], [k.ceg_link_company, k.ceg_link_nev])
const pub = await anonkent(async () => (await egy(`select publikus_nap($1::date) x`, [nap])).x)
t.ok('a publikus napi adatba nem szivárog ki', false, pub.foglalasok.some((f) => 'ceg_link_company' in f))

t.vege()
