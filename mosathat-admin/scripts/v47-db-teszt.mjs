import { adatbazis, tesztelo, TULAJ, ALK } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
const belep = (id) => db.exec(`select set_config('app.uid','${id}',false)`)
const csomag = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))
const ma = (await egy(`select current_date::text d`)).d

await belep(TULAJ)
await q(`select save_contract($1::jsonb)`, [JSON.stringify({ company_name: 'Lépő Kft.',
  prices: [{ package_id: csomag.START, size: 'NORMAL', kind: 'FLOTTA', price_huf: 10000 }] })])
const ceg = (await egy(`select id from companies where name = 'Lépő Kft.'`)).id
await belep(ALK)
const g = (await egy(`select create_fleet_booking($1::jsonb, 3) as g`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: ma,
  package_id: csomag.START, extras: [], customer_name: 'Lépő Lili', customer_phone: '+36301231111',
  company_id: ceg, contract_kind: 'FLOTTA', pick_up_time: '17:00' })])).g
const allapot = async () => (await q(`select status from bookings where fleet_group = $1 order by fleet_index`, [g])).map((r) => r.status)

console.log('=== Léptető ===\n')
const a1 = (await egy(`select fleet_step($1, 1) as id`, [g])).id
t.ok('+1: az 1. autó kész (lezárva)', ['COMPLETED', 'CONFIRMED', 'CONFIRMED'], await allapot())
t.ok('a lépés az 1. autót adja vissza', 1, (await egy(`select fleet_index from bookings where id = $1`, [a1])).fleet_index)
t.ok('a kész autó lezárási ideje beíródik', true, Boolean((await egy(
  `select actual_finished_at from bookings where id = $1`, [a1])).actual_finished_at))
const masodik = (await egy(`select id from bookings where fleet_group = $1 and fleet_index = 2`, [g])).id
await q(`select set_booking_status($1, 'CANCELLED_BY_CUSTOMER')`, [masodik])
await q(`select fleet_step($1, 1)`, [g])
t.ok('+1: a törölt 2. kimarad, a 3. kész', ['COMPLETED', 'CANCELLED_BY_CUSTOMER', 'COMPLETED'], await allapot())
t.ok('+1 ha mind kész: nincs mit léptetni (null)', null, (await egy(`select fleet_step($1, 1) as id`, [g])).id)
await q(`select fleet_step($1, -1)`, [g])
t.ok('−1: az utolsó kész (3.) visszanyílik', ['COMPLETED', 'CANCELLED_BY_CUSTOMER', 'CONFIRMED'], await allapot())
await q(`select fleet_step($1, -1)`, [g])
await q(`select fleet_step($1, -1)`, [g])
t.ok('−1 többször: mind visszanyílik, többet nem lép', ['CONFIRMED', 'CANCELLED_BY_CUSTOMER', 'CONFIRMED'], await allapot())
t.ok('visszalépve a befejezés ideje törölve', null, (await egy(
  `select actual_finished_at from bookings where id = $1`, [a1])).actual_finished_at)

t.vege()
