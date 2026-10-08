// v55, adatbázis: a többnapos autók napi terhe (pipák szerint), a negyedórás
// helyek száma (day_lanes), a Start munkaideje, és a day_bookings új mezői.
import { adatbazis, tesztelo, ALK } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
await db.exec(`select set_config('app.uid','${ALK}',false)`)
const csomag = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))
const nap = async (n) => (await egy(`select (current_date + $1::int)::text d`, [n])).d
const munkanap = async (d) => (await egy(`select munkanap($1::date) m`, [d])).m
const terhe = async (id, d) => Number((await egy(
  `select foglalas_napi_terhe(b, $2::date) t from bookings b where b.id = $1`, [id, d])).t)
const kozel = (a, b) => Math.abs(a - b) < 0.01
// v57: a maradék a még elérhető munkaidő arányában oszlik el
const eler = async (id, d) => Number((await egy(
  `select elerheto_perc(b, $2::date) e from bookings b where b.id = $1`, [id, d])).e)

async function tobbnapos(tol, ig, rsz) {
  return (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
    category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: tol,
    drop_off_time: '08:00', pick_up_date: ig, pick_up_time: '17:00', package_id: csomag.PREMIUM,
    extras: [], customer_name: 'Több Napos', customer_phone: '+36301239876', plate_raw: rsz })])).id
}

console.log('=== 1) a munkapontok ideje ===\n')
const a = await tobbnapos(await nap(0), await nap(6), 'TOB-501')
const ossz = Number((await egy(`select planned_duration_minutes p from bookings where id=$1`, [a])).p)
const percek = await q(`select fp.task_id, fp.perc::float p, t.source::text s from feladat_percek($1) fp join booking_tasks t on t.id = fp.task_id`, [a])
t.ok('a pontok ideje összesen = a foglalás munkaideje', true,
  kozel(percek.reduce((s, x) => s + x.p, 0), ossz))

console.log('\n=== 2) pipa nélkül: a hátralévő munkaidő arányában (v57) ===\n')
const napok = []
for (let i = 0; i <= 6; i++) napok.push(await nap(i))
const mn = []
for (const d of napok) if (await munkanap(d)) mn.push(d)
{
  const w = await Promise.all(mn.map((d) => eler(a, d)))
  const sw = w.reduce((x, y) => x + y, 0)
  const t2 = await Promise.all(mn.map((d) => terhe(a, d)))
  t.ok('minden munkanapra az elérhető idő arányában', true,
    sw > 0 ? t2.every((x, i) => kozel(x, ossz * w[i] / sw)) : true)
  t.ok('összesen a teljes munka', true, sw > 0 ? kozel(t2.reduce((x, y) => x + y, 0), ossz) : true)
}
const zarva = napok.find((d) => !mn.includes(d))
if (zarva) t.ok('zárt napra nulla', 0, await terhe(a, zarva))

console.log('\n=== 3) ma pipálunk: ma a tényleges, a maradék a többi napon ===\n')
const [p1, p2] = percek.filter((x) => x.s === 'PACKAGE')
await q(`select set_booking_status($1, 'ARRIVED')`, [a])
await q(`update booking_tasks set done = true, done_at = now() where id = any($1::uuid[])`, [[p1.task_id, p2.task_id]])
const ma = p1.p + p2.p
if (await munkanap(napok[0])) {
  t.ok('ma: a kipipált pontok ideje', true, kozel(await terhe(a, napok[0]), ma))
  const tobbi = mn.filter((d) => d !== napok[0])
  const w = await Promise.all(tobbi.map((d) => eler(a, d)))
  const sw = w.reduce((x, y) => x + y, 0)
  t.ok('a többi munkanapon: a maradék az elérhető idő arányában', true,
    (await Promise.all(tobbi.map((d) => terhe(a, d)))).every((x, i) => kozel(x, (ossz - ma) * w[i] / sw)))
}

console.log('\n=== 4) elmúlt napok: csak ami aznap pipálva lett ===\n')
const b = await tobbnapos(await nap(-3), await nap(3), 'TOB-502')
const bp = await q(`select fp.task_id, fp.perc::float p from feladat_percek($1) fp`, [b])
await q(`select set_booking_status($1, 'ARRIVED')`, [b])
// egy pontot tegnapelőtt pipáltak
await q(`update booking_tasks set done = true, done_at = now() - interval '2 days' where id = $1`, [bp[0].task_id])
t.ok('tegnapelőtt: a kipipált pont ideje', true, kozel(await terhe(b, await nap(-2)), bp[0].p))
t.ok('három napja (nem pipáltak): nulla', 0, await terhe(b, await nap(-3)))
t.ok('tegnap (nem pipáltak): nulla', 0, await terhe(b, await nap(-1)))

console.log('\n=== 5) negyedórás helyek ===\n')
const sz = (await egy(`select (date_trunc('week', current_date) + interval '9 days')::date::text d`)).d  // jövő szerda
const sav = await q(`select starts::text s, ends::text e, lanes from day_lanes($1::date)`, [sz])
t.ok('negyedórák a munkaidőben', true, sav.length > 20 && sav.every((x) => x.lanes === 2))
await q(`select set_absence($1::jsonb)`, [JSON.stringify({ day: sz, kind: 'KORABBAN_TAVOZIK', starts: '14:00' })])
const sav2 = await q(`select starts::text s, lanes from day_lanes($1::date)`, [sz])
t.ok('14:00 után eggyel kevesebb hely (egy ember)', [2, 1],
  [sav2.find((x) => x.s === '13:45:00').lanes, sav2.find((x) => x.s === '14:00:00').lanes])

console.log('\n=== 6) Start munkaideje, day_bookings új mezői ===\n')
t.ok('Start (személyautó, teljes) munkaideje', true, (await egy(`select start_perc() p`)).p > 0)
const sor = (await q(`select x from day_bookings($1::date) x`, [napok[0]])).map((r) => r.x).find((x) => x.id === a)
t.ok('napi_perc, kezdve, befejezve', [true, true, true],
  [typeof sor.napi_perc === 'number', 'kezdve' in sor, 'befejezve' in sor])

t.vege()
