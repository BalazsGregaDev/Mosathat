import { adatbazis, tesztelo, ALK } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
const belep = (id) => db.exec(`select set_config('app.uid','${id}',false)`)
const csomag = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))
const ma = (await egy(`select current_date::text d`)).d

await belep(ALK)
const id = (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: ma, drop_off_time: '09:00',
  package_id: csomag.PREMIUM, extras: [], customer_name: 'Pipa Pál', customer_phone: '+36301232323',
  plate_raw: 'PIP-001' })])).id
const lista = async () => (await q(`select id, done from booking_tasks where booking_id = $1 order by sort_order, name`, [id]))
const kesz = async () => (await lista()).filter((x) => x.done).length
const osszes = (await lista()).length
const allapot = async () => (await egy(`select status from bookings where id = $1`, [id])).status

await q(`select set_booking_status($1, 'ARRIVED')`, [id])
const [e1, e2] = await lista()
await q(`update booking_tasks set done = true where id = any($1::uuid[])`, [[e1.id, e2.id]])

console.log('=== Kész van ===\n')
await q(`select set_booking_status($1, 'READY')`, [id])
t.ok('minden pont kipipálva', osszes, await kesz())
t.ok('megjegyezte az előző állapotot', 'ARRIVED', (await egy(`select pre_ready_status s from bookings where id = $1`, [id])).s)

console.log('\n=== Átvette, aztán visszanyitás ===\n')
await q(`select set_booking_status($1, 'COMPLETED')`, [id])
t.ok('Átvette után is mind kipipálva, az előző állapot marad', [osszes, 'ARRIVED'],
  [await kesz(), (await egy(`select pre_ready_status s from bookings where id = $1`, [id])).s])
const vissza = (await egy(`select booking_reopen($1) as s`, [id])).s
t.ok('visszanyitva a Kész van előtti állapotba', ['ARRIVED', 'ARRIVED'], [vissza, await allapot()])
t.ok('csak a kézzel kipipált kettő maradt kipipálva', 2, await kesz())
t.ok('éppen azok', [true, true], (await lista()).filter((x) => x.id === e1.id || x.id === e2.id).map((x) => x.done))
t.ok('a befejezés ideje törölve, az emlék is', [null, null],
  Object.values(await egy(`select actual_finished_at, pre_ready_status from bookings where id = $1`, [id])))

console.log('\n=== Kész van-ból visszanyitás, flottás léptető ===\n')
await q(`select set_booking_status($1, 'IN_PROGRESS')`, [id])
await q(`select set_booking_status($1, 'READY')`, [id])
t.ok('Kész van: mind kipipálva', osszes, await kesz())
await q(`select booking_reopen($1)`, [id])
t.ok('vissza Dolgozunk-ba, a kézzel kipipáltak maradnak', ['IN_PROGRESS', 2], [await allapot(), await kesz()])

const id2 = (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: ma, drop_off_time: '10:00',
  package_id: csomag.START, extras: [], customer_name: 'Pipa Pál', customer_phone: '+36301232323',
  plate_raw: 'PIP-002' })])).id
await q(`select set_booking_status($1, 'COMPLETED')`, [id2])
const k2 = async () => Number((await egy(`select count(*) filter (where done) k, count(*) n from booking_tasks where booking_id = $1`, [id2])).k)
const n2 = Number((await egy(`select count(*) n from booking_tasks where booking_id = $1`, [id2])).n)
t.ok('közvetlen lezárás: mind kipipálva', n2, await k2())
await q(`select set_booking_status($1, 'CONFIRMED')`, [id2])
t.ok('visszalépés (léptető −): a pipák le', 0, await k2())

console.log('\n=== Nem fért be: nincs pipálás ===\n')
const id3 = (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: ma, drop_off_time: '11:00',
  package_id: csomag.START, extras: [], customer_name: 'Pipa Pál', customer_phone: '+36301232323',
  plate_raw: 'PIP-003' })])).id
await q(`select set_booking_tentative($1, true)`, [id3])
await q(`select booking_not_fitted($1)`, [id3])
t.ok('nem fért be: egy pont sincs kipipálva', 0,
  Number((await egy(`select count(*) filter (where done) k from booking_tasks where booking_id = $1`, [id3])).k))

t.vege()
