import { adatbazis, tesztelo, ALK } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
await db.exec(`select set_config('app.uid','${ALK}',false)`)
const csomag = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))
const kozel = (a, b) => Math.abs(a - b) < 0.5
const het = (n) => egy(`select (date_trunc('week', current_date) + ($1::int || ' days')::interval)::date::text d`, [7 + n])
const [h, k, sz] = [(await het(0)).d, (await het(1)).d, (await het(2)).d]
const terhe = async (id, d) => Number((await egy(`select foglalas_napi_terhe(b, $2::date) t from bookings b where b.id = $1`, [id, d])).t)
const eler = async (id, d) => Number((await egy(`select elerheto_perc(b, $2::date) e from bookings b where b.id = $1`, [id, d])).e)
const ablak = async (d) => (await q(`select starts::text s, ends::text e from work_windows($1::date) order by starts`, [d]))
const perc = (x) => { const [o, p] = x.split(':').map(Number); return o * 60 + p }

console.log('=== 1) hétfő 16:00 → szerda 12:00 ===\n')
const id = (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: h, drop_off_time: '16:00',
  pick_up_date: sz, pick_up_time: '12:00', package_id: csomag.ELIT, extras: [],
  customer_name: 'Több Tamás', customer_phone: '+36301112299', plate_raw: 'TOB-777' })])).id
const ossz = Number((await egy(`select planned_duration_minutes p from bookings where id = $1`, [id])).p)
const zar = perc((await ablak(h)).at(-1).e.slice(0, 5))
t.ok('hétfő: csak 16:00-tól zárásig elérhető', zar - 16 * 60, await eler(id, h))
const kedd = (await ablak(k)).reduce((s, w) => s + perc(w.e.slice(0, 5)) - perc(w.s.slice(0, 5)), 0)
t.ok('kedd: a teljes munkaidő', kedd, await eler(id, k))
const szerdaEl = (await ablak(sz)).reduce((s, w) => s + Math.max(0, Math.min(perc(w.e.slice(0, 5)), 720) - perc(w.s.slice(0, 5))), 0)
t.ok('szerda: csak 12:00-ig', szerdaEl, await eler(id, sz))
const w = [await eler(id, h), await eler(id, k), await eler(id, sz)]
const sw = w[0] + w[1] + w[2]
const tr = [await terhe(id, h), await terhe(id, k), await terhe(id, sz)]
t.ok('a munka az elérhető idő arányában oszlik el', true, tr.every((x, i) => kozel(x, ossz * w[i] / sw)))
t.ok('hétfőre kevés jut (csak egy óra van hátra)', true, tr[0] < tr[1])

console.log('\n=== 2) „Nem fért be" nem kérdőjeles autónál is ===\n')
const e = (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: k, drop_off_time: '08:00',
  package_id: csomag.START, extras: [], customer_name: 'Flotta Feri', customer_phone: '+36301112298', plate_raw: 'FLT-001' })])).id
t.ok('nem kérdőjeles', false, (await egy(`select tentative from bookings where id = $1`, [e])).tentative)
const elotte = Number((await egy(`select booked_minutes b from day_capacity($1::date)`, [k])).b)
await q(`select booking_not_fitted($1)`, [e])
const b = await egy(`select status::text s, not_fitted, final_price_huf f from bookings where id = $1`, [e])
t.ok('lezárva 0 Ft-tal, „nem fért be"', ['COMPLETED', true, 0], [b.s, b.not_fitted, b.f])
const utana = Number((await egy(`select booked_minutes b from day_capacity($1::date)`, [k])).b)
const start = Number((await egy(`select planned_duration_minutes p from bookings where id = $1`, [e])).p)
t.ok('a nap terhéből kikerült a munkaideje', elotte - start, utana)

t.vege()
