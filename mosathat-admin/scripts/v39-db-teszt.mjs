// v39, adatbázis: a lezárt igazolólap végleg rögzül.
//
// Igazi PostgreSQL-en (PGlite), az összes migrációval.
//
// Amit néz:
//   - lezáráskor az oszlopok, a lábléc szövege és a szerződés árai rögzülnek;
//   - ha UTÁNA átírják a beállítást vagy az árakat, a lezárt hónap a régit
//     mutatja, a nyitott hónap az újat;
//   - a szerződés törlése után is megmaradnak a lezárt hónap árai;
//   - újranyitáskor a rögzítés törlődik (a mostani beállítás jön);
//   - a napi nézet gombja (sheet_for_booking) lezárt hónapnál a rögzített
//     oszlopokat adja;
//   - régi hónap: korlát nélkül megnyitható és írható (ha nincs lezárva).
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
const lapja = async (ceg, honap) => (await egy(`select sheet_detail($1, $2::date) as d`, [ceg, honap])).d

await belep(TULAJ)
const szerzId = (await egy(`select save_contract($1::jsonb) as id`, [JSON.stringify({
  company_name: 'Rögzítő Kft.',
  prices: [{ package_id: csomag.PREMIUM, size: 'NORMAL', kind: 'FLOTTA', price_huf: 12700 }] })])).id
const ceg = (await egy(`select id from companies where name = 'Rögzítő Kft.'`)).id
const alap = (await egy(`select sheet_alap_oszlopok() o`)).o
await q(`select sheet_settings_save($1, $2::jsonb)`, [ceg, JSON.stringify({
  columns: alap, footer_text: 'Régi szöveg' })])

// Egy sor egy régi hónapba (két éve) és egy a mostaniba
const regi = (await egy(`select (date_trunc('month', current_date) - interval '24 months')::date::text m`)).m
const most = (await egy(`select date_trunc('month', current_date)::date::text m`)).m
await belep(ALK)
await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({
  company_id: ceg, day: regi, plate: 'REG-001', net_huf: 10000, name: 'Régi Rudi' })])
await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({
  company_id: ceg, day: most, plate: 'MOS-001', net_huf: 10000, name: 'Mai Mari' })])

console.log('=== A) Régi hónap korlát nélkül ===\n')
t.ok('két éve is nyitható, írható lap', 1, (await lapja(ceg, regi)).rows.length)
t.ok('a lapok listájában minden hónap ott van', 2, (await lapja(ceg, most)).months.length)

console.log('\n=== B) Lezárás: rögzül ===\n')
await belep(TULAJ)
await q(`select sheet_close($1, $2::date)`, [ceg, regi])
t.ok('a lezárt lapon a rögzítés megvan', true,
  (await egy(`select frozen is not null f from company_sheets where company_id = $1 and month = $2::date`,
    [ceg, regi])).f)

// Utána mindent átírunk: oszlopnév, lábléc, ár
await q(`select sheet_settings_save($1, $2::jsonb)`, [ceg, JSON.stringify({
  columns: alap.map((o) => (o.key === 'KM' ? { ...o, label: 'Kilométer' } : o)),
  footer_text: 'Új szöveg' })])
await q(`select save_contract($1::jsonb)`, [JSON.stringify({
  id: szerzId, company_id: ceg,
  prices: [{ package_id: csomag.PREMIUM, size: 'NORMAL', kind: 'FLOTTA', price_huf: 25400 }] })])

let r = await lapja(ceg, regi)
t.ok('lezárt hónap: a régi oszlopnév', 'Km óra állás', r.columns.find((o) => o.key === 'KM').label)
t.ok('lezárt hónap: a régi lábléc szöveg', 'Régi szöveg', r.footer_text)
t.ok('lezárt hónap: a régi ár', 12700, r.prices[0].price_huf)
let n = await lapja(ceg, most)
t.ok('nyitott hónap: az új oszlopnév', 'Kilométer', n.columns.find((o) => o.key === 'KM').label)
t.ok('nyitott hónap: az új lábléc és ár', ['Új szöveg', 25400], [n.footer_text, n.prices[0].price_huf])

console.log('\n=== C) Szerződés törlése után ===\n')
await q(`select delete_contract($1)`, [szerzId])
r = await lapja(ceg, regi)
t.ok('a lezárt hónap árai megmaradtak', 12700, r.prices[0]?.price_huf)
n = await lapja(ceg, most)
t.ok('a nyitott hónapnak már nincs ára', 0, n.prices.length)

console.log('\n=== D) A napi nézet gombja ===\n')
// Egy foglalás a régi (lezárt) hónapban: az oszlopok a rögzítettek.
await q(`select save_contract($1::jsonb)`, [JSON.stringify({
  company_id: ceg,
  prices: [{ package_id: csomag.PREMIUM, size: 'NORMAL', kind: 'FLOTTA', price_huf: 12700 }] })])
const fId = (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: regi,
  drop_off_time: '09:00', package_id: csomag.PREMIUM, extras: [],
  customer_name: 'Régi Rudi', customer_phone: '+36301239999', plate_raw: 'REG-002',
  company_id: ceg, contract_kind: 'FLOTTA' })])).id
const fb = (await egy(`select sheet_for_booking($1) as r`, [fId])).r
t.ok('lezárt hónap foglalása: zárva, a régi oszlopnévvel', [true, 'Km óra állás'],
  [fb.closed, fb.columns.find((o) => o.key === 'KM').label])

console.log('\n=== E) Újranyitás: a rögzítés törlődik ===\n')
await q(`select sheet_reopen($1, $2::date)`, [ceg, regi])
r = await lapja(ceg, regi)
t.ok('újranyitva: a mostani oszlopnév és szöveg', ['Kilométer', 'Új szöveg'],
  [r.columns.find((o) => o.key === 'KM').label, r.footer_text])
t.ok('a rögzítés törölve', null,
  (await egy(`select frozen from company_sheets where company_id = $1 and month = $2::date`, [ceg, regi])).frozen)
await belep(ALK)
t.ok('újranyitva írható', null, await hiba(`select sheet_row_save($1::jsonb)`, [JSON.stringify({
  company_id: ceg, day: regi, plate: 'REG-003', net_huf: 10000 })]))

t.vege()
