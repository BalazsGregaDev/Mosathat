// v56, adatbázis: online foglalási kérés (online_foglalas).
import { adatbazis, tesztelo, FEJL } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
const hiba = async (sql, p = []) => { try { await q(sql, p); return null } catch (e) { return e.message } }
await db.exec(`select set_config('app.uid','${FEJL}',false)`)
const csomag = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))
// a jövő hét szerdája: biztosan munkanap, és holnapnál később
const szerda = (await egy(`select (date_trunc('week', current_date) + interval '9 days')::date::text d`)).d
const ma = (await egy(`select current_date::text d`)).d

const alap = {
  category: 'SZEMELYAUTO', scope: 'TELJES', package_id: csomag.PREMIUM, full_service: false, extras: [],
  booking_type: 'LEADOS', service_date: szerda, start_time: null, drop_off_time: '08:30',
  customer_name: 'Online Olga', customer_phone: '+36 30 555 1234', customer_email: 'olga@pelda.hu',
  plate_raw: 'onl-001', brand: 'Skoda', model: 'Octavia', notes: 'kutyaszőr',
}
const kuld = (x) => q(`select online_foglalas($1::jsonb) as id`, [JSON.stringify({ ...alap, ...x })])

console.log('=== rendben ===\n')
const id = (await kuld({}))[0].id
const b = await egy(`select status::text, source::text, booking_type::text, service_date::text d,
  to_char(drop_off_at at time zone 'Europe/Budapest', 'HH24:MI') hozza, estimated_price_huf > 0 as ar,
  planned_duration_minutes > 0 as ido from bookings where id = $1`, [id])
t.ok('KÉRÉS állapot, Online forrás', ['REQUESTED', 'ONLINE'], [b.status, b.source])
t.ok('itt hagyja, a kért napon és órában', ['LEADOS', szerda, '08:30'], [b.booking_type, b.d, b.hozza])
t.ok('ár és munkaidő kiszámolva', [true, true], [b.ar, b.ido])
t.ok('az ügyfél e-mailje mentve', 'olga@pelda.hu',
  (await egy(`select c.email from bookings b join customers c on c.id = b.customer_id where b.id = $1`, [id])).email)
t.ok('a rendszám nagybetűvel', 'ONL-001',
  (await egy(`select v.plate_raw from bookings b join vehicles v on v.id = b.vehicle_id where b.id = $1`, [id])).plate_raw)
const v = (await kuld({ booking_type: 'VAROS', start_time: '10:00', drop_off_time: null, plate_raw: 'ONL-002' }))[0].id
t.ok('megvárja: kezdés 10:00', '10:00', (await egy(
  `select to_char(start_at at time zone 'Europe/Budapest', 'HH24:MI') k from bookings where id = $1`, [v])).k)

console.log('\n=== hibák ===\n')
t.ok('név nélkül', true, /neved/.test(await hiba(`select online_foglalas($1::jsonb)`, [JSON.stringify({ ...alap, customer_name: '' })])))
t.ok('telefon nélkül', true, /telefonszám/.test(await hiba(`select online_foglalas($1::jsonb)`, [JSON.stringify({ ...alap, customer_phone: '' })])))
t.ok('rendszám nélkül', true, /rendszám/.test(await hiba(`select online_foglalas($1::jsonb)`, [JSON.stringify({ ...alap, plate_raw: ' ' })])))
t.ok('rossz e-mail', true, /e-mail/.test(await hiba(`select online_foglalas($1::jsonb)`, [JSON.stringify({ ...alap, customer_email: 'nem-email' })])))
t.ok('mára nem', true, /holnapra/.test(await hiba(`select online_foglalas($1::jsonb)`, [JSON.stringify({ ...alap, service_date: ma })])))
t.ok('8 hétnél messzebb nem', true, /8 hét/.test(await hiba(`select online_foglalas($1::jsonb)`,
  [JSON.stringify({ ...alap, service_date: (await egy(`select (current_date + 70)::text d`)).d })])))
t.ok('hozom-viszem online nem', true, /Megvárja/.test(await hiba(`select online_foglalas($1::jsonb)`, [JSON.stringify({ ...alap, booking_type: 'HOZOMVISZEM' })])))
const vasarnap = (await egy(`select (date_trunc('week', current_date) + interval '13 days')::date::text d`)).d
t.ok('zárt napra nem', true, /zárva/.test(await hiba(`select online_foglalas($1::jsonb)`, [JSON.stringify({ ...alap, service_date: vasarnap })])))

console.log('\n=== visszaigazolás ===\n')
await q(`select set_booking_status($1, 'CONFIRMED')`, [id])
t.ok('visszaigazolva: rendes foglalás', 'CONFIRMED', (await egy(`select status::text s from bookings where id = $1`, [id])).s)

t.vege()
