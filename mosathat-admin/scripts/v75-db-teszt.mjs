import { adatbazis, tesztelo, ALK, TULAJ, FEJL } from './_db.mjs'

const t = tesztelo()
const regi = await adatbazis({ demo: true, meddig: '20261016090000' })
const db = await adatbazis({ demo: true })
const q = async (d, s, p = []) => (await d.query(s, p)).rows
const ki = async (uid) => q(db, `select set_config('app.uid', $1, false)`, [uid])
const hiba = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }

const MATRIX = `select package_code, slot_name, name, area::text, sort_order from v_package_matrix
                order by package_code, area, sort_order, name`
const TOBBLET = `select package_code, parent_name, name from v_package_extra order by 1, 3`
const FELADAT = `select v.plate_raw || ' ' || b.service_date::text k, t.name, t.area::text, t.sort_order, t.source::text
                   from booking_tasks t join bookings b on b.id = t.booking_id join vehicles v on v.id = b.vehicle_id
                  order by 1, 2, 3, 4`

console.log('=== 1) Az átállás semmit nem változtat ===\n')
t.ok('ugyanaz a csomagtartalom mindhárom csomagban', await q(regi, MATRIX), await q(db, MATRIX))
t.ok('ugyanaz a „Start mindene, plusz:” lista', await q(regi, TOBBLET), await q(db, TOBBLET))
const fr = await q(regi, FELADAT)
t.ok('a foglalások munkalap-feladatai is ugyanazok', [true, fr], [fr.length > 0, await q(db, FELADAT)])
await regi.close()

const sz = (await q(db, `select csomag_szerkeszto() x`))[0].x
t.ok('a szerkesztő 3 csomagot és 14 sort ad', [3, 14], [sz.csomagok.length, sz.sorok.length])
const P = Object.fromEntries(sz.csomagok.map((c) => [c.code, c.id]))
const sor = (nev) => sz.sorok.find((s) => s.name === nev)
t.ok('a Falc sor cellái: áttörlés, áttörlés, mélytisztítás', ['Falc áttörlés', 'Falc áttörlés', 'Falc mélytisztítás'],
  ['START', 'PREMIUM', 'ELIT'].map((c) => sor('Falc áttörlés').cellak[P[c]].name))
t.ok('a Gumiápolás Startban kikapcsolva, a többiben be', [false, true, true],
  ['START', 'PREMIUM', 'ELIT'].map((c) => sor('Gumiápolás').cellak[P[c]].active))

console.log('\n=== 2) Mentés ===\n')
const nyitott = (await q(db, `select b.id from bookings b join packages p on p.id = b.package_id
  where p.code = 'PREMIUM' and b.scope = 'TELJES' and b.status in ('CONFIRMED','ARRIVED','IN_PROGRESS') limit 1`))[0].id
const lezart = (await q(db, `select b.id from bookings b join packages p on p.id = b.package_id
  where p.code = 'PREMIUM' and b.status = 'COMPLETED' limit 1`))[0]?.id
const feladatok = async (id) => (await q(db, `select name from booking_tasks where booking_id = $1 and source = 'PACKAGE' order by sort_order, name`, [id])).map((r) => r.name)
const lezartElotte = lezart ? await feladatok(lezart) : null

const uj = structuredClone(sz)
uj.csomagok.find((c) => c.code === 'PREMIUM').name = 'Prémium'
uj.csomagok.find((c) => c.code === 'PREMIUM').description = 'Részletesebb tisztítás'
uj.sorok = uj.sorok.filter((s) => s.name !== 'Illatosítás')
uj.sorok.find((s) => s.name === 'Gyors viasz').cellak[P.PREMIUM].active = false
uj.sorok.find((s) => s.name === 'Falc áttörlés').cellak[P.ELIT].name = 'Falc mély'
uj.sorok.find((s) => s.name === 'Porszívózás').name = 'Porszívózás (ülések is)'
uj.sorok.push({ id: null, name: 'Kerékjárati dobok', area: 'KULSO',
  cellak: { [P.START]: { name: 'Kerékjárati dobok', active: false }, [P.PREMIUM]: { name: 'Kerékjárati dobok', active: false }, [P.ELIT]: { name: 'Kerékjárati dobok', active: true } } })

await ki(ALK)
t.ok('az alkalmazott nem menthet', true, /tulajdonos vagy a fejlesztő/.test(await hiba(() => q(db, `select csomag_szerkeszto_mentes($1)`, [JSON.stringify(uj)])) ?? ''))
await ki(TULAJ)
const rossz = structuredClone(uj); rossz.sorok[0].name = '  '
t.ok('üres sornév: hiba, és semmi nem változik', [true, 'Premium'],
  [(await hiba(() => q(db, `select csomag_szerkeszto_mentes($1)`, [JSON.stringify(rossz)]))) !== null,
   (await q(db, `select name from packages where code = 'PREMIUM'`))[0].name])
const db_ = (await q(db, `select csomag_szerkeszto_mentes($1) x`, [JSON.stringify(uj)]))[0].x.frissitett
t.ok('a tulajdonos ment, a nyitott foglalások frissülnek', true, db_ > 0)

console.log('\n=== 3) Mindenhol átvezetve ===\n')
t.ok('a csomag neve és leírása', { name: 'Prémium', description: 'Részletesebb tisztítás' },
  (await q(db, `select name, description from packages where code = 'PREMIUM'`))[0])
const m = await q(db, `select package_code, name from v_package_matrix order by 1, 2`)
const benne = (c, n) => m.some((r) => r.package_code === c && r.name === n)
t.ok('Gyors viasz: Premiumból kikerült, Startban továbbra sincs', [false, false], [benne('PREMIUM', 'Gyors viasz'), benne('START', 'Gyors viasz')])
t.ok('az Elitben a cella saját neve', [true, false], [benne('ELIT', 'Falc mély'), benne('ELIT', 'Falc mélytisztítás')])
t.ok('törölt sor sehol', false, m.some((r) => r.name === 'Illatosítás'))
t.ok('átnevezett sor mindhárom csomagban', [true, true, true], ['START', 'PREMIUM', 'ELIT'].map((c) => benne(c, 'Porszívózás (ülések is)')))
t.ok('új sor csak az Elitben', [false, false, true], ['START', 'PREMIUM', 'ELIT'].map((c) => benne(c, 'Kerékjárati dobok')))
t.ok('a „plusz” lista is követi', true,
  (await q(db, TOBBLET)).some((r) => r.package_code === 'ELIT' && r.name === 'Kerékjárati dobok'))
const nf = await feladatok(nyitott)
t.ok('nyitott Premium foglalás munkalapja: nincs viasz, nincs illatosítás, új porszívó-név', [false, false, true],
  [nf.includes('Gyors viasz'), nf.includes('Illatosítás'), nf.includes('Porszívózás (ülések is)')])
t.ok('a feladatok sorrendje a sorok új sorrendje', (await q(db, `select name from booking_task_plan($1) where source = 'PACKAGE' order by sort_order`, [nyitott])).map((r) => r.name), nf)
if (lezart) t.ok('lezárt foglalás munkalapja érintetlen', lezartElotte, await feladatok(lezart))
t.ok('a napi nézet az új nevet mutatja', 'Prémium',
  (await q(db, `select package_name from v_day_bookings where id = $1`, [nyitott]))[0].package_name)
t.ok('a foglalás tételsora is', 'Prémium',
  (await q(db, `select name_snapshot from booking_items where booking_id = $1 and kind = 'PACKAGE'`, [nyitott]))[0].name_snapshot)

console.log('\n=== 4) Jogok ===\n')
await ki(FEJL)
t.ok('a fejlesztő is menthet', true, (await hiba(() => q(db, `select csomag_szerkeszto_mentes($1)`, [JSON.stringify(uj)]))) === null)
await ki(ALK)
t.ok('az alkalmazott olvashatja (munkalaphoz kell)', true, (await q(db, `select count(*)::int n from v_package_matrix`))[0].n > 0)
t.ok('de közvetlenül sem írhat a táblába', true,
  (await hiba(() => q(db, `update package_slots set name = 'x'`))) !== null)
const jog = (await q(db, `select has_function_privilege('anon', 'public.csomag_szerkeszto_mentes(jsonb)', 'execute') a`))[0]
t.ok('kívülről nem hívható', false, jog.a)

await db.close()
t.vege()
