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
const nap = async (d) => (await egy(`select (current_date + $1::int)::text d`, [d])).d

await belep(TULAJ)
const foglal = async (adat) => (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: await nap(1),
  drop_off_time: '09:00', package_id: csomag.PREMIUM, extras: [], ...adat,
})])).id

const szerzId = (await egy(`select save_contract($1::jsonb) as id`, [JSON.stringify({
  company_name: 'Flotta Kft.', valid_until: await nap(300),
  prices: [
    { package_id: csomag.PREMIUM, size: 'NORMAL', kind: 'FLOTTA', price_huf: 12700 },
    { package_id: csomag.PREMIUM, size: 'NAGY', kind: 'FLOTTA', price_huf: 15240 },
  ] })])).id
const ceg = (await egy(`select id from companies where name = 'Flotta Kft.'`)).id
const f1 = await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010',
  plate_raw: 'FLT-001', company_id: ceg, contract_kind: 'FLOTTA' })
const f2 = await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010',
  plate_raw: 'FLT-002', company_id: ceg, contract_kind: 'FLOTTA',
  service_date: await nap(2), pick_up_date: await nap(4), pick_up_time: '16:00' })

console.log('=== A) Igazolólap: a sor előre kitöltve ===\n')
await belep(ALK)
const elo = (await egy(`select sheet_for_booking($1) as r`, [f1])).r
t.ok('a cégnek kell igazolólap (szerződéses)', true, elo.kell)
t.ok('előre kitöltve: dátum, rendszám, név', [await nap(1), 'FLT-001', 'Sofőr Sanyi'],
  [elo.row.day, elo.row.plate, elo.row.name])
t.ok('a nettó ár a bruttóból (12 700 / 1,27)', 10000, elo.row.net_huf)
t.ok('még nincs sora', null, elo.row.id)
const elo2 = (await egy(`select sheet_for_booking($1) as r`, [f2])).r
t.ok('többnaposnál a dátum az átadás napja (Viszi)', await nap(4), elo2.row.day)

console.log('\n=== B) Mentés, aláírás, a hónap lapja magától nyílik ===\n')
const alairas = 'data:image/png;base64,iVBORw0KGgo='
const sor1 = (await egy(`select sheet_row_save($1::jsonb) as id`, [JSON.stringify({
  ...elo.row, company_id: elo.company_id, km: 123456, signature: alairas,
  extra: { E_munkaszam: 'MSZ-1' } })])).id
const honap = (await egy(`select date_trunc('month', $1::date)::date::text m`, [await nap(1)])).m
let lap = (await egy(`select sheet_detail($1, $2::date) as d`, [ceg, honap])).d
t.ok('a lap megnyílt, egy sorral', 1, lap.rows.length)
t.ok('km, aláírás, saját oszlop elmentve', [123456, true, 'MSZ-1'],
  [lap.rows[0].km, lap.rows[0].signature === alairas, lap.rows[0].extra.E_munkaszam])
t.ok('a lábléc árai a szerződésből', 2, lap.prices.length)

const ujra = (await egy(`select sheet_for_booking($1) as r`, [f1])).r
t.ok('a gomb másodszorra a meglévő sort nyitja', sor1, ujra.row.id)
{
  const { signature: _nem, ...kepNelkul } = ujra.row
  void _nem
  await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ ...kepNelkul, km: 123460 })])
}
lap = (await egy(`select sheet_detail($1, $2::date) as d`, [ceg, honap])).d
t.ok('módosítás: a km átírva, az aláírás megmaradt (nem küldtük)', [123460, true],
  [lap.rows[0].km, lap.rows[0].signature === alairas])
await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ ...ujra.row, km: 123460, signature: '' })])
lap = (await egy(`select sheet_detail($1, $2::date) as d`, [ceg, honap])).d
t.ok('az aláírás kifejezetten törölhető (üres)', null, lap.rows[0].signature)
t.ok('egy foglalásnak egy sora van', 1,
  Number((await egy(`select count(*) n from company_sheet_rows where booking_id = $1`, [f1])).n))

console.log('\n=== C) Lezárás ===\n')
t.ok('az alkalmazott nem zárhat le', true,
  (await hiba(`select sheet_close($1, $2::date)`, [ceg, honap]))?.includes('tulajdonos'))
await belep(TULAJ)
await q(`select sheet_close($1, $2::date)`, [ceg, honap])
await belep(ALK)
t.ok('lezárt lapra nem lehet írni', true,
  (await hiba(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ ...ujra.row, km: 1 })]))?.includes('le van zárva'))
t.ok('lezárt lapról nem lehet törölni', true,
  (await hiba(`select sheet_row_delete($1)`, [sor1]))?.includes('le van zárva'))
const kov = (await egy(`select (date_trunc('month', $1::date) + interval '1 month')::date::text m`, [honap])).m
const sor2 = (await egy(`select sheet_row_save($1::jsonb) as id`, [JSON.stringify({
  company_id: ceg, day: kov, plate: 'FLT-009', net_huf: 10000, name: 'Kézi Kati' })])).id
t.ok('a következő hónap lapja az első sorral magától nyílik', true, Boolean(sor2))
await belep(TULAJ)
await q(`select sheet_reopen($1, $2::date)`, [ceg, honap])
await belep(ALK)
t.ok('újranyitás után újra írható', null,
  await hiba(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ ...ujra.row, km: 2 })]))

console.log('\n=== D) Oszlopok beállítása ===\n')
const alap = (await egy(`select sheet_alap_oszlopok() o`)).o
await belep(TULAJ)
await q(`select sheet_settings_save($1, $2::jsonb)`, [ceg, JSON.stringify({
  columns: [...alap.map((o) => o.key === 'KM' ? { ...o, label: 'Kilométer' } : o),
            { key: 'E_munkaszam', label: 'Munkaszám', visible: true }],
  footer_text: 'Fizetés havonta, átutalással.' })])
lap = (await egy(`select sheet_detail($1, $2::date) as d`, [ceg, honap])).d
t.ok('átnevezve és új oszlop', ['Kilométer', 'Munkaszám'],
  [lap.columns.find((o) => o.key === 'KM').label, lap.columns.at(-1).label])
t.ok('saját lábléc szöveg', 'Fizetés havonta, átutalással.', lap.footer_text)
t.ok('alap oszlop nem törölhető', true,
  (await hiba(`select sheet_settings_save($1, $2::jsonb)`, [ceg, JSON.stringify({
    columns: alap.filter((o) => o.key !== 'NEV') })]))?.includes('nem törölhető'))
t.ok('üres oszlopnév nem lehet', true,
  (await hiba(`select sheet_settings_save($1, $2::jsonb)`, [ceg, JSON.stringify({
    columns: [...alap, { key: 'E_x', label: ' ', visible: true }] })]))?.includes('neve'))

console.log('\n=== E) Cég szerinti nézet: a lapos cégek elöl ===\n')
await foglal({ customer_name: 'Aaa Bt. sofőr', customer_phone: '+36301110099',
  plate_raw: 'AAA-001', company_name: 'Aaa Bt.' })
const cegek = (await q(`select list_companies('', 50) as c`)).map((r) => r.c)
t.ok('a szerződéses cég van elöl (az „Aaa Bt." előtt)', 'Flotta Kft.', cegek[0].name)
t.ok('és jelezve, hogy kell neki lap', [true, false], [cegek[0].lapos, cegek[1].lapos])

console.log('\n=== F) Szerződés törlése ===\n')
await belep(ALK)
t.ok('alkalmazott nem törölhet', true,
  (await hiba(`select delete_contract($1)`, [szerzId]))?.includes('tulajdonos'))
await belep(TULAJ)
await q(`select delete_contract($1)`, [szerzId])
t.ok('a szerződés és az árai törölve', [0, 0], [
  Number((await egy(`select count(*) n from contracts where id = $1`, [szerzId])).n),
  Number((await egy(`select count(*) n from contract_prices where contract_id = $1`, [szerzId])).n)])
t.ok('a cég ügyfelei visszakerültek listaárra', 'NORMAL',
  (await egy(`select billing_kind from customers where name = 'Sofőr Sanyi'`)).billing_kind)
t.ok('a foglalás ára nem változott', 12700,
  (await egy(`select estimated_price_huf p from bookings where id = $1`, [f1])).p)
t.ok('a meglévő igazolólap megmaradt', 1,
  (await egy(`select sheet_detail($1, $2::date) as d`, [ceg, honap])).d.rows.length)

t.vege()
