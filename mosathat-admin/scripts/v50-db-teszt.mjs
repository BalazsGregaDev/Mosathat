// v50, adatbázis: range_order() — a heti nézet a napi sorrendet kapja.
import { adatbazis, tesztelo, ALK } from './_db.mjs'

const db = await adatbazis({ demo: true })
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
await db.exec(`select set_config('app.uid','${ALK}',false)`)
const ma = (await egy(`select current_date::text d`)).d
const het = (await egy(`select (date_trunc('week', current_date))::date::text d`)).d

// A napi sorrend a day_bookings() szerint
const napi = async (d) => (await q(`select (x->>'id') id from day_bookings($1::date) x`, [d])).map((r) => r.id)
const heti = async (d) => (await q(
  `select booking_id::text id from range_order($1::date, ($1::date + 6)) where day = $2::date order by sorrend`,
  [het, d])).map((r) => r.id)

console.log('=== a hét minden napján ugyanaz a sorrend ===\n')
for (let i = 0; i < 7; i++) {
  const d = (await egy(`select ($1::date + $2::int)::text d`, [het, i])).d
  t.ok(`${d}: napi = heti`, await napi(d), await heti(d))
}

console.log('\n=== kézi átrendezés után is ===\n')
const elotte = await napi(ma)
t.ok('ma van legalább három foglalás', true, elotte.length >= 3)
const uj = [elotte[2], elotte[0], elotte[1], ...elotte.slice(3)]
await q(`select set_day_order($1::date, $2::uuid[])`, [ma, uj])
t.ok('a napi az új sorrendben', uj, await napi(ma))
t.ok('a heti is', uj, await heti(ma))

console.log('\n=== túl nagy kérés: üres ===\n')
t.ok('43 napnál hosszabb: nincs sor', 0,
  (await q(`select * from range_order(current_date, current_date + 60)`)).length)

t.vege()
