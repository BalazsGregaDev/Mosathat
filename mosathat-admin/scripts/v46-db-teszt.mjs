// v46, adatbázis: flottás autók.
//
// Amit néz: szerződés kapcsolója; csoport felvétele rendszám nélkül (N
// foglalás, egy ügyfél, nap eleji sorrend, végső időpont, darabszám szerinti
// ár és munkaidő); még egy autó; közös adatok módosítása; rendszám utólag
// (új és már ismert autó); méret autónként; állapot autónként; igazolólap sor
// helyőrző rendszám nélkül.
import { adatbazis, tesztelo, TULAJ, ALK } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
const hiba = async (sql, p = []) => {
  try { await db.query(sql, p); return null } catch (e) { return String(e.message) }
}
const belep = (id) => db.exec(`select set_config('app.uid','${id}',false)`)
const csomag = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))
const ma = (await egy(`select current_date::text d`)).d

await belep(TULAJ)
const szerz = (await egy(`select save_contract($1::jsonb) as id`, [JSON.stringify({
  company_name: 'Raiffeisen Bank', prices: [
    { package_id: csomag.PREMIUM, size: 'NORMAL', kind: 'FLOTTA', price_huf: 12700 },
    { package_id: csomag.PREMIUM, size: 'NAGY', kind: 'FLOTTA', price_huf: 15240 }] })])).id
const ceg = (await egy(`select id from companies where name = 'Raiffeisen Bank'`)).id

console.log('=== A) A szerződés: Flottás autók ===\n')
t.ok('alapból nem flottás', false, (await egy(`select szerzodes_flottas($1) f`, [szerz])).f)
await belep(ALK)
t.ok('alkalmazott nem kapcsolhatja', true, (await hiba(`select set_contract_fleet($1, true)`, [szerz]))?.includes('tulajdonos'))
await belep(TULAJ)
await q(`select set_contract_fleet($1, true)`, [szerz])
t.ok('bekapcsolva (a nézetben is)', [true, true],
  [(await egy(`select szerzodes_flottas($1) f`, [szerz])).f, (await egy(`select fleet_cars from v_contracts where id = $1`, [szerz])).fleet_cars])

console.log('\n=== B) Csoport felvétele: Raiffeisen 3 darab ===\n')
await belep(ALK)
const csop = (await egy(`select create_fleet_booking($1::jsonb, 3) as g`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: ma,
  package_id: csomag.PREMIUM, extras: [], customer_name: 'Flotta Feri', customer_phone: '+36301239876',
  company_id: ceg, contract_kind: 'FLOTTA', pick_up_time: '17:00', drop_off_time: '08:00' })])).g
const tagok = async () => q(`select * from v_day_bookings where fleet_group = $1 order by fleet_index`, [csop])
let tg = await tagok()
t.ok('3 foglalás, 1–3 sorszámmal', [1, 2, 3], tg.map((x) => x.fleet_index))
t.ok('egy ügyfél', 1, new Set(tg.map((x) => x.customer_id)).size)
t.ok('rendszám nélkül (helyőrző)', ['—', '—', '—'], tg.map((x) => x.plate_raw))
t.ok('3 különböző helyőrző autó', 3, new Set(tg.map((x) => x.vehicle_id)).size)
t.ok('Hozza óra nincs (a nap elején áll), a végső idő 17:00', [null, '17:00'],
  [tg[0].drop_off_at, (await egy(`select to_char(pick_up_at at time zone 'Europe/Budapest','HH24:MI') o from bookings where id = $1`, [tg[0].id])).o])
t.ok('autónként a szerződéses ár (3 × 12 700)', [12700, 12700, 12700], tg.map((x) => x.estimated_price_huf))
t.ok('a munkaidő is autónként', true, tg.every((x) => x.planned_duration_minutes > 0))
const nap = (await q(`select day_bookings($1::date) as d`, [ma])).map((r) => r.d)
t.ok('a nap listájában elöl', csop, nap[0].fleet_group)

console.log('\n=== C) Még egy autó, közös módosítás ===\n')
await q(`select fleet_add_car($1)`, [csop])
tg = await tagok()
t.ok('4. autó, ugyanannál az ügyfélnél, ugyanazzal az idővel', [4, 1, true], [tg.length, new Set(tg.map((x) => x.customer_id)).size,
  String(tg[3].pick_up_at) === String(tg[0].pick_up_at)])
await q(`select fleet_patch($1, $2::jsonb)`, [csop, JSON.stringify({ pick_up_time: '16:00' })])
tg = await tagok()
t.ok('a végső idő mind a 4-en átírva', 1, new Set(tg.map((x) => String(x.pick_up_at))).size)
t.ok('…16:00-ra', '16:00', (await egy(`select to_char(pick_up_at at time zone 'Europe/Budapest','HH24:MI') o from bookings where id = $1`, [tg[2].id])).o)

console.log('\n=== D) Rendszám utólag, méret autónként ===\n')
await q(`select fleet_set_plate($1, 'rai-001')`, [tg[0].id])
tg = await tagok()
t.ok('új rendszám: a helyőrző kapja, nagybetűvel', 'RAI-001', tg[0].plate_raw)
// Ismert autó: már járt itt, SUV
await belep(TULAJ)
const ismert = (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SUV', scope: 'TELJES', booking_type: 'LEADOS', service_date: ma, drop_off_time: '09:00',
  package_id: csomag.START, extras: [], customer_name: 'Régi Rezső', customer_phone: '+36301230000',
  plate_raw: 'OLD-777' })])).id
const regiAuto = (await egy(`select vehicle_id from bookings where id = $1`, [ismert])).vehicle_id
await belep(ALK)
const helyorzo = tg[1].vehicle_id
await q(`select fleet_set_plate($1, 'OLD 777')`, [tg[1].id])
tg = await tagok()
t.ok('ismert rendszám: a foglalás a régi autóhoz kerül', regiAuto, tg[1].vehicle_id)
t.ok('a helyőrző autó törölve', 0, Number((await egy(`select count(*) n from vehicles where id = $1`, [helyorzo])).n))
t.ok('az ár a valódi méretből (SUV → nagy: 15 240)', 15240, tg[1].estimated_price_huf)
await q(`select patch_booking($1, '{"category":"KISBUSZ"}'::jsonb)`, [tg[2].id])
tg = await tagok()
t.ok('méret autónként: a 3. kisbusz, a többi marad', ['SZEMELYAUTO', 'KISBUSZ'], [tg[0].category, tg[2].category])

console.log('\n=== E) Állapot autónként, igazolólap ===\n')
await q(`select set_booking_status($1, 'ARRIVED')`, [tg[0].id])
tg = await tagok()
t.ok('csak az első érkezett meg', ['ARRIVED', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED'], tg.map((x) => x.status))
const sor = (await egy(`select sheet_for_booking($1) as r`, [tg[3].id])).r
t.ok('rendszám nélküli autó: az igazolólap sorában üres a rendszám (nem „—")', null, sor.row.plate)
await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ ...sor.row, company_id: sor.company_id, km: 1000 })])
await q(`select fleet_set_plate($1, 'NEW-444')`, [tg[3].id])
t.ok('a rendszám utólag a meglévő igazolólap sorba is bekerül', 'NEW-444',
  (await egy(`select plate from company_sheet_rows where booking_id = $1`, [tg[3].id])).plate)

t.ok('1 és 40 közötti darabszám', true, (await hiba(`select create_fleet_booking('{}'::jsonb, 0)`))?.includes('1 és 40'))

t.vege()
