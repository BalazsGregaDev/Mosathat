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
const ceg = await egy(`select id from companies where name = 'Autó Trans Kft.'`)
const START = (await egy(`select id from packages where code = 'START'`)).id
const nap = (await egy(`select d::text d from generate_series(
    (now() at time zone 'Europe/Budapest')::date + 2,
    (now() at time zone 'Europe/Budapest')::date + 20, interval '1 day') d
  where munkanap(d::date) order by d limit 1`)).d

const kuld = (x = {}) => anonkent(async () => (await egy(`select ceg_foglalas($1, $2) id`, [LINK, JSON.stringify({
  package_id: START, booking_type: 'HOZOMVISZEM', service_date: nap, drop_off_time: '08:00', pick_up_time: '16:00',
  customer_name: 'Hozom Hugó', customer_phone: '+36 30 555 0101', plate_raw: 'HV-001', ...x })])).id)

console.log('=== 1) Hozom-viszem a szerződés szerint ===\n')
t.ok('a link adataiban: van hozom-viszem', true, (await anonkent(async () => (await egy(`select ceg_link_adat($1) x`, [LINK])).x)).hozomviszem)

const id = await kuld()
await ki(TULAJ)
const b = await egy(`select booking_type::text, status::text, estimated_price_huf,
    to_char(drop_off_at at time zone 'Europe/Budapest', 'HH24:MI') erte,
    to_char(pick_up_at at time zone 'Europe/Budapest', 'HH24:MI') vissza
  from bookings where id = $1`, [id])
t.ok('hozom-viszem kérés: érte 8:00, vissza 16:00', ['HOZOMVISZEM', 'REQUESTED', '08:00', '16:00'], [b.booking_type, b.status, b.erte, b.vissza])
const sorok = await q(`select kind::text, price_huf from booking_items where booking_id = $1 order by sort_order`, [id])
t.ok('szerződéses csomagár + fuvardíj', [['PACKAGE', 10500], ['FUVAR', 4000]], sorok.map((s) => [s.kind, s.price_huf]))
t.ok('összesen', 14500, b.estimated_price_huf)
const nb = (await q(`select x from day_bookings($1::date) x`, [nap])).map((r) => r.x).find((x) => x.id === id)
t.ok('a napi nézetben hozom-viszem, fuvardíjjal', ['HOZOMVISZEM', 4000], [nb.booking_type, nb.pickup_fee_huf])

console.log('\n=== 2) Időkorlát és ár nélküli ajánlat ===\n')
t.ok('7:00-ra nem mehetünk érte', true, /7:30 és 17:00/.test(await hiba(() => kuld({ drop_off_time: '07:00', plate_raw: 'HV-002' })) ?? ''))
const aj = await anonkent(async () => (await egy(`select ceg_ajanlat($1, $2) x`, [LINK, JSON.stringify({
  package_id: START, booking_type: 'HOZOMVISZEM', service_date: nap })])).x)
t.ok('az ajánlat hozom-viszemnél sem mutat árat', [0, []], [aj.price_huf, aj.lines])

console.log('\n=== 3) Szerződés hozom-viszem nélkül ===\n')
await ki(TULAJ)
await q(`update contracts set pickup_delivery = false where company_id = $1 and active`, [ceg.id])
t.ok('a link adataiban: nincs hozom-viszem', false, (await anonkent(async () => (await egy(`select ceg_link_adat($1) x`, [LINK])).x)).hozomviszem)
t.ok('hozom-viszem kérés elutasítva', true, /nincs hozom-viszem/.test(await hiba(() => kuld({ plate_raw: 'HV-003', customer_phone: '+36 30 555 0103' })) ?? ''))
t.ok('itt hagyott autó továbbra is mehet', null, await hiba(() => kuld({ booking_type: 'LEADOS', plate_raw: 'HV-004', customer_phone: '+36 30 555 0104' })))

t.vege()
