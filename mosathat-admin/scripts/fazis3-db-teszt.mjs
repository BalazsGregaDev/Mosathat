import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
await db.exec(`select set_config('app.uid','${TULAJ}',false)`)

const csomag = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))
const { ma } = await egy(`select current_date::text as ma`)
const { holnap } = await egy(`select (current_date + 1)::text as holnap`)
const { tegnap } = await egy(`select (current_date - 2)::text as tegnap`)

const foglal = async (adat) => (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: ma,
  drop_off_time: '09:00', package_id: csomag.START, extras: [], ...adat,
})])).id

const f1 = await foglal({ customer_name: 'Telefonos Tamás', customer_phone: '+36301112233', plate_raw: 'TEL-001' })
const f2 = await foglal({ customer_name: 'Szám Nélkül', plate_raw: 'NOT-001' })
const f3 = await foglal({ customer_name: 'Hozom Viszem', customer_phone: '+36301112234',
  plate_raw: 'HV-0001', booking_type: 'HOZOMVISZEM', service_date: tegnap,
  pick_up_date: holnap, pick_up_time: '16:00' })
const f4 = await foglal({ customer_name: 'Lejárt Lajos', customer_phone: '+36301112235',
  plate_raw: 'LEJ-001', service_date: tegnap, pick_up_date: (await egy(`select (current_date - 1)::text d`)).d })

const d = (await egy(`select dashboard_summary(current_date) as d`)).d
const k = await egy(`select * from day_capacity(current_date)`)

console.log('=== A) A „Ma" számai a day_capacity-ből ===\n')
t.ok('autók száma = a kapacitás-kártya autószáma', k.cars, d.ma.db)
t.ok('a többnapos is benne van (3 autó ma: 2 mai + 1 többnapos)', 3, d.ma.db)
t.ok('lekötött munka = a kapacitás-kártyáé', k.booked_minutes, d.ma.percek)
t.ok('várható bevétel = a kapacitás-kártyáé', k.revenue_huf, d.ma.bevetel)

console.log('\n=== B) Kattintható figyelmeztetések ===\n')
const tel = d.gondok.find((g) => g.cimke === 'Elérhetőség')
t.ok('telefon nélkül: a cél a telefon mező', 'telefon', tel?.cel)
t.ok('és benne van a foglalás azonosítója', [f2], (tel?.foglalasok ?? []).map((x) => x.id))
t.ok('a rendszámmal együtt', 'NOT-001', tel?.foglalasok?.[0]?.plate_raw)

const hat = d.gondok.filter((g) => g.cimke === 'Határidő')
t.ok('határidő: a holnap lejáró hozom-viszem és a lejárt is', ['HV-0001', 'LEJ-001'],
  hat.map((g) => g.foglalasok[0].plate_raw).sort())
t.ok('soronként egy foglalás, munkalapot nyit', true,
  hat.every((g) => g.cel === 'munkalap' && g.foglalasok.length === 1))
t.ok('a lejárt súlyosabb', 3, hat.find((g) => g.foglalasok[0].id === f4)?.suly)

await db.query(`update bookings set status = 'READY' where id = $1`, [f3])
const d2 = (await egy(`select dashboard_summary(current_date) as d`)).d
t.ok('a kész autó határideje nem figyelmeztet', ['LEJ-001'],
  d2.gondok.filter((g) => g.cimke === 'Határidő').map((g) => g.foglalasok[0].plate_raw))

void f1
t.vege()
