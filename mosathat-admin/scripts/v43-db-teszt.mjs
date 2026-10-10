import { adatbazis, tesztelo, ALK } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
const hiba = async (sql, p = []) => {
  try { await db.query(sql, p); return null } catch (e) { return String(e.message) }
}
const belep = (id) => db.exec(`select set_config('app.uid','${id}',false)`)
const csomag = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))

await belep(ALK)
const foglal = async (rsz) => (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS',
  service_date: (await egy(`select current_date::text d`)).d, drop_off_time: '09:00',
  package_id: csomag.PREMIUM, extras: [], customer_name: 'Kérdő Kati',
  customer_phone: '+3630' + String(Math.floor(Math.random() * 1e7)).padStart(7, '0'), plate_raw: rsz })])).id

console.log('=== A) Nagybetűs rendszám ===\n')
const f1 = await foglal('abc-987')
const nap = async (id) => (await egy(`select * from v_day_bookings where id = $1`, [id]))
t.ok('kisbetűvel beírva nagybetűvel tárolva', 'ABC-987', (await nap(f1)).plate_raw)

console.log('\n=== B) Kérdőjeles ===\n')
t.ok('alapból nem kérdőjeles', false, (await nap(f1)).tentative)
await q(`select set_booking_tentative($1, true)`, [f1])
t.ok('bekapcsolva', true, (await nap(f1)).tentative)
const nem = await foglal('NEM-001')
t.ok('nem kérdőjelest is lehet „nem fért be"-vel zárni (v57)', null,
  await hiba(`select booking_not_fitted($1)`, [nem]))

console.log('\n=== C) Nem fért be ===\n')
await q(`select booking_not_fitted($1)`, [f1])
let b = await nap(f1)
t.ok('lezárva, 0 Ft, megjelölve', ['COMPLETED', 0, true], [b.status, b.final_price_huf, b.not_fitted])
t.ok('másodszor nem', true, (await hiba(`select booking_not_fitted($1)`, [f1]))?.includes('már le van zárva'))
await q(`select set_booking_status($1, 'READY')`, [f1])
b = await nap(f1)
t.ok('visszanyitva: a jelölés és a 0 Ft törlődik', ['READY', null, false], [b.status, b.final_price_huf, b.not_fitted])
t.ok('a kérdőjel megmarad', true, b.tentative)

t.vege()
