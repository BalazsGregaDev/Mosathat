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
const lapja = async (ceg, h) => (await egy(`select sheet_detail($1, $2::date) as d`, [ceg, h])).d
const ar = [{ package_id: csomag.PREMIUM, size: 'NORMAL', kind: 'FLOTTA', price_huf: 12700 }]

await belep(TULAJ)
console.log('=== A) A fordulónap mentése ===\n')
const id = (await egy(`select save_contract($1::jsonb) as id`, [JSON.stringify({
  company_name: 'Tizenötös Kft.', cycle_day: 15, prices: ar })])).id
const ceg = (await egy(`select id from companies where name = 'Tizenötös Kft.'`)).id
t.ok('a fordulónap 15', 15, (await egy(`select cycle_day from v_contracts where id = $1`, [id])).cycle_day)
const masik = (await egy(`select save_contract($1::jsonb) as id`, [JSON.stringify({
  company_name: 'Elsejés Kft.', prices: ar })])).id
t.ok('megadás nélkül 1 (naptári hónap)', 1, (await egy(`select cycle_day from contracts where id = $1`, [masik])).cycle_day)
t.ok('29 nem lehet', true, (await hiba(`select save_contract($1::jsonb)`, [JSON.stringify({
  id, company_id: ceg, cycle_day: 29, prices: ar })]))?.includes('1 és 28'))
await q(`select save_contract($1::jsonb)`, [JSON.stringify({ id, company_id: ceg, prices: ar })])
t.ok('szerkesztés fordulónap nélkül: marad a 15', 15, (await egy(`select cycle_day from contracts where id = $1`, [id])).cycle_day)

console.log('\n=== B) A sor az időszak lapjára kerül ===\n')
await belep(ALK)
await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ company_id: ceg, day: '2026-10-20', plate: 'T-1' })])
await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ company_id: ceg, day: '2026-11-14', plate: 'T-2' })])
await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ company_id: ceg, day: '2026-10-03', plate: 'T-0' })])
let okt = await lapja(ceg, '2026-10-01')
t.ok('október lapja: okt. 15. – nov. 14.', ['2026-10-15', '2026-11-14'], [okt.period_start, okt.period_end])
t.ok('okt. 20. és nov. 14. ezen a lapon', ['T-1', 'T-2'], okt.rows.map((r) => r.plate))
const szept = await lapja(ceg, '2026-09-01')
t.ok('okt. 3. a szeptemberi (szept. 15. – okt. 14.) lapon', ['2026-09-15', ['T-0']],
  [szept.period_start, szept.rows.map((r) => r.plate)])
t.ok('egy nap (nem elseje): az időszak, amelyikbe esik (okt. 3. → szept. 15.)', '2026-09-15',
  (await lapja(ceg, '2026-10-03')).period_start)
t.ok('…és ugyanaz az időszak választó-hónapja: szeptember', '2026-09-01', (await lapja(ceg, '2026-10-03')).month)
t.ok('a lapok listája az időszak kezdetével', ['2026-10-15', '2026-09-15'], okt.months.map((m) => m.start))
t.ok('…és a választó hónapjával', '2026-10-01', okt.months[0].month)

console.log('\n=== C) Lezárás, céglista, napi gomb ===\n')
await belep(TULAJ)
await q(`select sheet_close($1, $2::date)`, [ceg, '2026-09-01'])
t.ok('a szeptemberi időszak lezárva', true, Boolean((await lapja(ceg, '2026-09-01')).sheet.closed_at))
await belep(ALK)
t.ok('okt. 10. (lezárt időszak) már nem írható', true, (await hiba(`select sheet_row_save($1::jsonb)`, [JSON.stringify({
  company_id: ceg, day: '2026-10-10', plate: 'T-9' })]))?.includes('2026.09.15.–10.14.'))
const lista = (await egy(`select sheet_cegek('2026-10-01'::date) as d`)).d.find((c) => c.name === 'Tizenötös Kft.')
t.ok('céglista: a cég időszaka és sorai', ['2026-10-15', 2], [lista.period_start, lista.rows])
await belep(TULAJ)
const fId = (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: '2026-10-12',
  drop_off_time: '09:00', package_id: csomag.PREMIUM, extras: [],
  customer_name: 'Tizenöt Tibor', customer_phone: '+36301231515', plate_raw: 'T-10',
  company_id: ceg, contract_kind: 'FLOTTA' })])).id
t.ok('napi gomb: okt. 12. a lezárt (szeptemberi) időszakba esik', true,
  (await egy(`select sheet_for_booking($1) as r`, [fId])).r.closed)

console.log('\n=== D) Fordulónap váltása ===\n')
t.ok('nyitott, sorokkal teli lap mellett nem váltható', true,
  (await hiba(`select save_contract($1::jsonb)`, [JSON.stringify({ id, company_id: ceg, cycle_day: 1, prices: ar })]))
    ?.includes('le vannak zárva'))
await q(`select sheet_close($1, $2::date)`, [ceg, '2026-10-01'])
await q(`insert into company_sheets (company_id, month) values ($1, '2026-12-15')`, [ceg])
t.ok('lezárás után váltható', null,
  await hiba(`select save_contract($1::jsonb)`, [JSON.stringify({ id, company_id: ceg, cycle_day: 1, prices: ar })]))
t.ok('az üres nyitott lap törlődött', 0,
  Number((await egy(`select count(*) n from company_sheets where company_id = $1 and month = '2026-12-15'`, [ceg])).n))
await belep(ALK)
await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ company_id: ceg, day: '2026-12-20', plate: 'U-1' })])
const dec = await lapja(ceg, '2026-12-01')
t.ok('ezután naptári hónap: december lapja dec. 1. – 31.', ['2026-12-01', '2026-12-31', ['U-1']],
  [dec.period_start, dec.period_end, dec.rows.map((r) => r.plate)])
t.ok('a régi, 15-i lezárt lap megmaradt', 2, (await lapja(ceg, '2026-10-15')).rows.length)

t.vege()
