// v40, adatbázis: az Igazolólap menüpont céglistája (sheet_cegek).
import { adatbazis, tesztelo, TULAJ, ALK } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
const belep = (id) => db.exec(`select set_config('app.uid','${id}',false)`)
const csomag = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))
const most = (await egy(`select date_trunc('month', current_date)::date::text m`)).m
const elozo = (await egy(`select (date_trunc('month', current_date) - interval '1 month')::date::text m`)).m
const lista = async (h) => (await egy(`select sheet_cegek($1::date) as d`, [h])).d

await belep(TULAJ)
await q(`select save_contract($1::jsonb)`, [JSON.stringify({ company_name: 'Bbb Kft.',
  prices: [{ package_id: csomag.PREMIUM, size: 'NORMAL', kind: 'FLOTTA', price_huf: 12700 }] })])
const bbb = (await egy(`select id from companies where name = 'Bbb Kft.'`)).id
const regiId = (await egy(`select save_contract($1::jsonb) as id`, [JSON.stringify({ company_name: 'Aaa Régi Kft.',
  prices: [{ package_id: csomag.PREMIUM, size: 'NORMAL', kind: 'FLOTTA', price_huf: 12700 }] })])).id
const aaa = (await egy(`select id from companies where name = 'Aaa Régi Kft.'`)).id

await belep(ALK)
await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ company_id: aaa, day: elozo, plate: 'AAA-1' })])
await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ company_id: bbb, day: most, plate: 'B-1', signature: 'data:image/png;base64,iVBORw0KGgo=' })])
await q(`select sheet_row_save($1::jsonb)`, [JSON.stringify({ company_id: bbb, day: most, plate: 'B-2' })])
await belep(TULAJ)
await q(`select delete_contract($1)`, [regiId])

console.log('=== Céglista ===\n')
await belep(ALK)
const l = await lista(most)
t.ok('az alkalmazott is lekérheti; a lapos cég elöl, a már nem lapos hátul', ['Bbb Kft.', 'Aaa Régi Kft.'],
  l.map((c) => c.name))
const b = l[0]
t.ok('a hónap állása: 2 sor, 1 aláíratlan, nyitott', [2, 1, false], [b.rows, b.unsigned, b.closed])
const a = l[1]
t.ok('a lejárt szerződésű cég: már nem kell, de a régi lapja miatt listán van', [false, false], [a.kell, a.szerzodes])
t.ok('korábbi lezáratlan hónap jelezve', 1, a.open_before)
await belep(TULAJ)
await q(`select sheet_close($1, $2::date)`, [aaa, elozo])
t.ok('lezárás után nincs lezáratlan korábbi hónap', 0, (await lista(most)).find((c) => c.name === 'Aaa Régi Kft.').open_before)
t.ok('az előző hónapban lezárva', true, (await lista(elozo)).find((c) => c.name === 'Aaa Régi Kft.').closed)

t.vege()
