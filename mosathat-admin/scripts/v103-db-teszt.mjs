import { adatbazis, tesztelo, TULAJ } from './_db.mjs'
import { terhel } from './_terheles.mjs'

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
const napok = (await q(`select d::date::text d from generate_series(
    (now() at time zone 'Europe/Budapest')::date + 4,
    (now() at time zone 'Europe/Budapest')::date + 40, interval '1 day') d
  where munkanap(d::date) order by d limit 4`)).map((r) => r.d)
let szam = 0
const kuld = (nap, x = {}) => {
  szam++
  return anonkent(async () => (await egy(`select ceg_foglalas($1, $2) x`, [LINK, JSON.stringify({
    package_id: START, booking_type: 'LEADOS', service_date: nap, drop_off_time: '09:00',
    customer_name: `Céges ${szam}`, customer_email: 'teszt@pelda.hu', customer_phone: `+36 30 700 ${String(1000 + szam)}`, plate_raw: `LIM-${100 + szam}`, ...x })])).x)
}
const allapot = async (id) => { await ki(TULAJ); return (await egy(`select status::text s from bookings where id = $1`, [id])).s }
const teli = async (tol, ig) => anonkent(async () => (await egy(`select ceg_teli_napok($1, $2::date, $3::date) x`, [LINK, tol, ig])).x)

console.log('=== 1) Kapacitás: 35% alatt automatikusan bekerül ===\n')
const ures = napok[0]
await ki(TULAJ)
t.ok('az első nap üres (35% alatt)', true, Number((await egy(`select load_pct from day_capacity($1::date)`, [ures])).load_pct ?? 0) <= 35)
const a1 = await kuld(ures)
t.ok('megerősítve jön vissza', true, a1.megerositve)
t.ok('a foglalás azonnal visszaigazolt', 'CONFIRMED', await allapot(a1.id))
t.ok('a visszaigazoló levél nem kell, mert nincs e-mail; a kérés nem vár döntésre', 0,
  (await egy(`select count(*)::int n from v_online_kerelmek where id = $1`, [a1.id])).n)
const a1e = await kuld(ures, { customer_email: 'sofor@x.hu' })
await ki(TULAJ)
t.ok('e-mail címmel: visszaigazoló levél sorba állt', 1,
  (await egy(`select count(*)::int n from notifications where booking_id = $1 and kind = 'BOOKING_CONFIRMED'`, [a1e.id])).n)

console.log('\n=== 2) 35% és 70% között: jóváhagyásra vár ===\n')
const kozepes = napok[1]
await ki(TULAJ)
const t2 = await terhel(q, kozepes, 50)
t.ok('a nap terhelése ~50%', true, t2 > 35 && t2 < 70)
const a2 = await kuld(kozepes)
t.ok('nem automatikus', false, a2.megerositve)
t.ok('jóváhagyásra vár', 'REQUESTED', await allapot(a2.id))

console.log('\n=== 3) 70%-tól a nap tele céges foglalásra ===\n')
const tele = napok[2]
await ki(TULAJ)
const t3 = await terhel(q, tele, 75)
t.ok('a nap terhelése 70% fölött', true, t3 >= 70)
t.ok('a teli napok között szerepel', true, (await teli(napok[0], napok[3])).includes(tele))
t.ok('a félig teli nap nem tele', false, (await teli(napok[0], napok[3])).includes(kozepes))
t.ok('kérés elutasítva', true, /nincs szabad hely céges foglalásra/.test(await hiba(() => kuld(tele)) ?? ''))

console.log('\n=== 4) Napi limit a szerződésben ===\n')
await ki(TULAJ)
const sz = await egy(`select * from v_contracts where company_id = $1 and active`, [ceg.id])
t.ok('alapból nincs limit', null, sz.napi_limit)
const mentes = (limit) => q(`select save_contract($1)`, [JSON.stringify({
  id: sz.id, company_id: ceg.id, tax_number: sz.tax_number, pickup_delivery: sz.pickup_delivery,
  pickup_delivery_fee_huf: sz.pickup_delivery_fee_huf, valid_until: sz.valid_until, notes: sz.notes,
  cycle_day: sz.cycle_day, napi_limit: limit,
  prices: sz.prices.map((p) => ({ package_id: p.package_id, size: p.size, kind: p.kind, price_huf: p.price_huf })) })])
await mentes(2)
t.ok('a limit elmentve, az árak megmaradtak', [2, sz.prices.length],
  Object.values(await egy(`select napi_limit, jsonb_array_length(prices) n from v_contracts where id = $1`, [sz.id])))
t.ok('érvénytelen limit elutasítva', true, /1 és 200/.test(await hiba(() => mentes(0)) ?? ''))
const limitNap = napok[3]
await kuld(limitNap)
t.ok('1 foglalás után még nem tele', false, (await teli(limitNap, limitNap)).includes(limitNap))
await kuld(limitNap)
t.ok('2 foglalás után a nap tele a cégnek', true, (await teli(limitNap, limitNap)).includes(limitNap))
t.ok('a harmadik elutasítva', true, /már nem foglalhat több autót/.test(await hiba(() => kuld(limitNap)) ?? ''))
await ki(TULAJ)
await q(`update bookings set status = 'CANCELLED_BY_SHOP' where id = (select id from bookings b where b.service_date = $1::date and b.ceg_link_company = $2 order by created_at limit 1)`, [limitNap, ceg.id])
t.ok('lemondott foglalás nem számít bele', false, (await teli(limitNap, limitNap)).includes(limitNap))
await ki(TULAJ)
await mentes(null)
t.ok('limit levéve', null, (await egy(`select napi_limit from v_contracts where id = $1`, [sz.id])).napi_limit)

console.log('\n=== 5) Típusváltás a munkalapon: Itt hagyja → Megvárja ===\n')
await ki(TULAJ)
const ids = []
for (const [tipus, ora] of [['VAROS', '09:00'], ['LEADOS', '09:30'], ['VAROS', '10:00']]) {
  ids.push((await egy(`select create_booking($1) id`, [JSON.stringify({
    category: 'SZEMELYAUTO', scope: 'TELJES', package_id: START, booking_type: tipus, service_date: ures,
    start_time: tipus === 'VAROS' ? ora : null, drop_off_time: tipus === 'LEADOS' ? ora : null,
    customer_name: 'Próba', customer_phone: '+36 30 123 0000', plate_raw: 'AZO-123' })])).id)
}
t.ok('a középső (itt hagyott) Megvárósra állítható, a hozás ideje lesz a kezdés', [null, '09:30'],
  [await hiba(() => q(`select patch_booking($1, '{"booking_type":"VAROS"}'::jsonb)`, [ids[1]])),
   (await egy(`select to_char(start_at at time zone 'Europe/Budapest', 'HH24:MI') k from bookings where id = $1`, [ids[1]])).k])
const ures2 = (await egy(`select create_booking($1) id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', package_id: START, booking_type: 'LEADOS', service_date: ures,
  customer_name: 'Próba', customer_phone: '+36 30 123 0000', plate_raw: 'AZO-123' })])).id
t.ok('idő nélkül érthető hibaüzenet', true,
  /Megvárós foglaláshoz meg kell adni, mikor kezdjük/.test(await hiba(() => q(`select patch_booking($1, '{"booking_type":"VAROS"}'::jsonb)`, [ures2])) ?? ''))
t.ok('vissza Itt hagyjára: a kezdés lesz a hozás ideje', [null, '09:00'],
  [await hiba(() => q(`select patch_booking($1, '{"booking_type":"LEADOS"}'::jsonb)`, [ids[0]])),
   (await egy(`select to_char(drop_off_at at time zone 'Europe/Budapest', 'HH24:MI') k from bookings where id = $1`, [ids[0]])).k])

t.vege()
