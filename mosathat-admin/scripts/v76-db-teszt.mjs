import { randomUUID } from 'node:crypto'
import { adatbazis, tesztelo, ALK, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p = []) => (await db.query(s, p)).rows
const ki = async (uid) => q(`select set_config('app.uid', $1, false)`, [uid])
const hiba = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }
const betolt = async () => (await q(`select csomag_szerkeszto() x`))[0].x
const ment = async (a) => (await q(`select csomag_szerkeszto_mentes($1) x`, [JSON.stringify(a)]))[0].x

let a = await betolt()
const P = Object.fromEntries(a.csomagok.map((c) => [c.code, c.id]))
t.ok('a meglévő csomagok foglalásban vannak, ezért „használt”', [true, true, true], a.csomagok.map((c) => c.hasznalt))
t.ok('a Premium a Startra, az Elit a Premiumra épül', [null, P.START, P.PREMIUM], a.csomagok.map((c) => c.includes_package_id))

console.log('\n=== 1) Új oszlop ===\n')
const GOLD = randomUUID()
a.csomagok.push({ id: GOLD, code: null, name: 'Gold Plus', description: '', includes_package_id: P.ELIT, hasznalt: false })
for (const s of a.sorok) s.cellak[GOLD] = { ...(s.cellak[P.ELIT] ?? { name: s.name, active: false }) }
a.sorok.find((s) => s.name === 'Gyors viasz').cellak[GOLD] = { name: 'Kerámia gyorsbevonat', active: true }
a.sorok.push({ id: null, name: 'Motortér', area: 'KULSO', cellak: { [GOLD]: { name: 'Motortér', active: true } } })
await ki(ALK)
t.ok('alkalmazott nem vehet fel oszlopot', true, (await hiba(() => ment(a))) !== null)
t.ok('és nem is jött létre', 0, (await q(`select count(*)::int n from packages where id = $1`, [GOLD]))[0].n)
await ki(TULAJ)
await ment(a)
const g = (await q(`select code, name, sort_order, active, includes_package_id from packages where id = $1`, [GOLD]))[0]
t.ok('létrejött: saját kód, a végén, az Elitre épül', { code: 'GOLD_PLUS', name: 'Gold Plus', sort_order: 4, active: true, includes_package_id: P.ELIT }, g)
t.ok('üres árak mind a 9 kategória × terjedelem párosra, és 3 Full Service ár', [9, 0, 3],
  [(await q(`select count(*)::int n from package_pricing where package_id = $1`, [GOLD]))[0].n,
   (await q(`select count(*)::int n from package_pricing where package_id = $1 and price_huf is not null`, [GOLD]))[0].n,
   (await q(`select count(*)::int n from full_service_pricing where package_id = $1`, [GOLD]))[0].n])
const gm = (await q(`select name from v_package_matrix where package_id = $1 order by area, sort_order`, [GOLD])).map((r) => r.name)
t.ok('tartalom: az Elité + saját tételek', [true, true, true, false],
  [gm.includes('Alja kárpit mélytisztítás'), gm.includes('Kerámia gyorsbevonat'), gm.includes('Motortér'), gm.includes('Gyors viasz')])
t.ok('„Elit mindene, plusz:” csak a különbség', ['Kerámia gyorsbevonat', 'Motortér'],
  (await q(`select name from v_package_extra where package_id = $1 order by name`, [GOLD])).map((r) => r.name))
t.ok('a régi oszlopok tartalma nem változott', 14, (await q(`select count(*)::int n from v_package_matrix where package_code = 'ELIT'`))[0].n)

console.log('\n=== 2) Sorrend, alap, kódütközés ===\n')
a = await betolt()
const sorrend = ['GOLD_PLUS', 'START', 'PREMIUM', 'ELIT']
a.csomagok.sort((x, y) => sorrend.indexOf(x.code) - sorrend.indexOf(y.code))
a.csomagok.find((c) => c.code === 'GOLD_PLUS').includes_package_id = GOLD
const MASIK = randomUUID()
a.csomagok.push({ id: MASIK, code: null, name: 'Gold plus!', description: 'Teszt', includes_package_id: null, hasznalt: false })
await ment(a)
t.ok('az oszlopsorrend mentve', ['GOLD_PLUS', 'START', 'PREMIUM', 'ELIT', 'GOLD_PLUS_2'],
  (await q(`select code from packages where active order by sort_order`)).map((r) => r.code))
t.ok('önmagára nem épülhet: semmire épül', null, (await q(`select includes_package_id from packages where id = $1`, [GOLD]))[0].includes_package_id)

console.log('\n=== 3) Oszlop eltávolítása ===\n')
a = await betolt()
t.ok('az új, foglalás nélküli csomag nem „használt”', false, a.csomagok.find((c) => c.id === MASIK).hasznalt)
const startFoglalas = (await q(`select b.id from bookings b where package_id = $1 limit 1`, [P.START]))[0].id
a.csomagok = a.csomagok.filter((c) => c.id !== MASIK && c.code !== 'START')
const e = await ment(a)
t.ok('a foglalás nélküli törlődött, a Start (van foglalása) csak kivezetve', [1, ['Start']], [e.torolt, e.kivezetve])
t.ok('törölt csomag árai és cellái is mentek', [0, 0, 0],
  [(await q(`select count(*)::int n from packages where id = $1`, [MASIK]))[0].n,
   (await q(`select count(*)::int n from package_pricing where package_id = $1`, [MASIK]))[0].n,
   (await q(`select count(*)::int n from package_slot_cells where package_id = $1`, [MASIK]))[0].n])
t.ok('a Start eltűnt a szerkesztőből és a mátrixból', [false, 0],
  [(await betolt()).csomagok.some((c) => c.code === 'START'), (await q(`select count(*)::int n from v_package_matrix where package_code = 'START'`))[0].n])
t.ok('a régi Start foglalás megtartja a nevét', 'Start', (await q(`select package_name from v_day_bookings where id = $1`, [startFoglalas]))[0].package_name)
t.ok('ami a Startra épült, most önálló', null, (await q(`select includes_package_id from packages where code = 'PREMIUM'`))[0].includes_package_id)
t.ok('a Start tartalma megmaradt a régi foglalásokhoz', true, (await q(`select count(*)::int n from booking_task_plan($1)`, [startFoglalas]))[0].n > 0)

a = await betolt()
a.csomagok = []
t.ok('az utolsó csomag nem törölhető', true, /Legalább egy csomag/.test(await hiba(() => ment(a)) ?? ''))

await db.close()
t.vege()
