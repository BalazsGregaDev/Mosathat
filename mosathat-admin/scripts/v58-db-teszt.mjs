import { adatbazis, tesztelo, TULAJ, ALK } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
const belep = (id) => db.exec(`select set_config('app.uid','${id}',false)`)
const sz = (await egy(`select (date_trunc('week', current_date) + interval '9 days')::date::text d`)).d
const TABLET = '00000000-0000-4000-8000-0000000000aa'
const MASIK = '00000000-0000-4000-8000-0000000000ab'

await q(`insert into auth.users (id, email) values ($1, 'tablet@x.hu'), ($2, 'masik@x.hu')`, [TABLET, MASIK])
await q(`insert into staff (id, full_name, role) values ($1, 'tablet', 'STAFF'), ($2, 'Második', 'STAFF')`, [TABLET, MASIK])
await belep(TULAJ)
const kap = async () => egy(`select staff_total from day_capacity($1::date)`, [sz])

console.log('=== közös fiók ===\n')
t.ok('kapcsoló nélkül mindhárom alkalmazott számít', 3, (await kap()).staff_total)
await q(`select set_staff($1::jsonb)`, [JSON.stringify({ id: TABLET, kozos: true })])
t.ok('a tulajdonos közösnek jelölheti', true, (await egy(`select kozos from staff where id = $1`, [TABLET])).kozos)
t.ok('a kapacitásban már csak kettő', 2, (await kap()).staff_total)
t.ok('a felhasználók listájában látszik', true,
  (await q(`select * from list_staff()`)).find((s) => s.id === TABLET).kozos)

console.log('\n=== hány helyen dolgozunk ===\n')
await q(`select set_absence($1::jsonb)`, [JSON.stringify({ staff_id: ALK, day: sz, kind: 'EGESZ_NAP' })])
t.ok('egy ember hiányzik → egy hely (a tablet nem számít embernek)', 1,
  (await egy(`select max(lanes) n from day_lanes($1::date)`, [sz])).n)
t.ok('a hiányzás a közös fiókénál nem számítana (day_absences szamit)', true,
  (await q(`select * from day_absences($1::date)`, [sz])).every((a) => a.szamit))

t.vege()
