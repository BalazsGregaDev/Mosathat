import { adatbazis, tesztelo, TULAJ, ALK } from './_db.mjs'

const SUPABASE_JOGOK = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  end $$;
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

const t = tesztelo()
const db = await adatbazis({ demo: true, elotte: SUPABASE_JOGOK })
const q = async (s, p) => (await db.query(s, p)).rows
const egy = async (s, p) => (await q(s, p))[0]
const hiba = async (f) => { try { await f(); return null } catch (e) { return e.message } }
const ki = (id) => q(`select set_config('app.uid', $1, false)`, [id])
const szerepben = async (szerep, f) => {
  await q(`set role ${szerep}`)
  try { return await f() } finally { await q('reset role') }
}

const csomag = async (kod) => (await egy(`select id from packages where code = $1`, [kod])).id
const START = await csomag('START')
const PREMIUM = await csomag('PREMIUM')
const FELNI = (await egy(`select id from extras where name like 'Felni és gumi%'`)).id
const napok = (await q(`select d::date::text d from generate_series(public.budapest_ma() + 3, public.budapest_ma() + 60, interval '1 day') d
  where munkanap(d::date) and extract(isodow from d) < 6 order by d`)).map((r) => r.d)
const ma = (await egy(`select public.budapest_ma()::text d`)).d

const foglal = (x) => egy(`select create_booking($1::jsonb) id`, [JSON.stringify({
  customer_name: 'Bérletes Bori', customer_phone: '+36 20 444 1001', plate_raw: 'BRT-001',
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', drop_off_time: '09:00',
  package_id: PREMIUM, extras: [], ...x,
})]).then((r) => r.id)
const foglalas = (id) => egy(`select b.pass_item_id, b.estimated_price_huf ar, b.status::text,
    (select bi.price_huf from booking_items bi where bi.booking_id = b.id and bi.kind = 'PACKAGE') csomag_ar,
    (select bi.name_snapshot from booking_items bi where bi.booking_id = b.id and bi.kind = 'PACKAGE') csomag_nev
  from bookings b where b.id = $1`, [id])
const tetel = (passId, kod) => egy(`select * from v_pass_balance where pass_id = $1 and package_code is not distinct from $2`, [passId, kod])
const hasznalat = async (bookingId) => (await egy(`select count(*)::int n from pass_usages where booking_id = $1`, [bookingId])).n

console.log('=== 1) Bérlet kiadása: a már visszaigazolt foglalásra magától rákerül ===\n')
await ki(ALK)
const b0 = await szerepben('authenticated', () => foglal({ service_date: napok[0], extras: [{ extra_id: FELNI, quantity: 1 }] }))
const lista0 = await foglalas(b0)
const ugyfel = (await egy(`select customer_id from bookings where id = $1`, [b0])).customer_id
const bMost = await foglal({ service_date: ma, booking_type: 'VAROS', start_time: '10:00', status: 'IN_PROGRESS', drop_off_time: null })
t.ok('bérlet nélkül a csomag listaáron', [null, true], [lista0.pass_item_id, lista0.csomag_ar > 0])

await ki(TULAJ)
const passId = (await egy(`select create_pass($1::jsonb) id`, [JSON.stringify({
  customer_id: ugyfel, name: '3 alkalmas teszt', price_huf: 40000, valid_from: ma, validity_kind: 'EV', validity_value: '1',
  items: [{ package_id: PREMIUM, category: 'SZEMELYAUTO', qty_total: 2 }, { package_id: null, category: null, qty_total: 1 }],
})])).id
const premItem = (await tetel(passId, 'PREMIUM')).pass_item_id
const barmiItem = (await tetel(passId, null)).pass_item_id
const f0 = await foglalas(b0)
t.ok('a visszaigazolt foglalás a Premium tételre került', premItem, f0.pass_item_id)
t.ok('a csomag sora 0 Ft, „(bérlet)" jelöléssel', [0, true], [f0.csomag_ar, / \(bérlet\)$/.test(f0.csomag_nev)])
t.ok('az extra ára megmarad, a csomagé lejön', lista0.ar - lista0.csomag_ar, f0.ar)
t.ok('a már folyamatban lévő autóhoz nem nyúl', null, (await foglalas(bMost)).pass_item_id)
await q(`select patch_booking($1::uuid, $2::jsonb)`, [bMost, JSON.stringify({ notes: 'telefonszám javítva' })])
t.ok('akkor sem, ha közben szerkesztik', null, (await foglalas(bMost)).pass_item_id)
const aMost = (await egy(`select quote_booking($1::jsonb) x`, [JSON.stringify({ package_id: PREMIUM, category: 'SZEMELYAUTO',
  scope: 'TELJES', booking_type: 'VAROS', service_date: ma, extras: [], customer_id: ugyfel, booking_id: bMost })])).x
t.ok('és a szerkesztő ablak sem ígér rá bérletet', [null, []], [aMost.berlet, aMost.berlet_csomagok])
t.ok('a Premium tételből 1 lefoglalva, 1 szabad', [0, 1, 1],
  Object.values(await egy(`select qty_used, qty_reserved, qty_left from v_pass_balance where pass_item_id = $1`, [premItem])))

console.log('\n=== 2) Új foglalások: előbb a pontos tétel, aztán a „bármelyik", utána listaár ===\n')
await ki(ALK)
const b1 = await szerepben('authenticated', () => foglal({ service_date: napok[1] }))
const b2 = await szerepben('authenticated', () => foglal({ service_date: napok[2] }))
const b3 = await szerepben('authenticated', () => foglal({ service_date: napok[3] }))
t.ok('2. foglalás: Premium tétel', premItem, (await foglalas(b1)).pass_item_id)
t.ok('3. foglalás: a „bármelyik csomag" tétel', barmiItem, (await foglalas(b2)).pass_item_id)
const f3 = await foglalas(b3)
t.ok('4. foglalás: elfogyott, listaáron', [null, true, false], [f3.pass_item_id, f3.csomag_ar > 0, / \(bérlet\)$/.test(f3.csomag_nev)])

const ajanlat = (x) => szerepben('authenticated', () => egy(`select quote_booking($1::jsonb) x`, [JSON.stringify({
  package_id: PREMIUM, category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: napok[5],
  extras: [], customer_id: ugyfel, ...x,
})]).then((r) => r.x))
const a1 = await ajanlat({})
t.ok('ajánlat: minden alkalom foglalt, nincs bérlet', [null, []], [a1.berlet, a1.berlet_csomagok])
const a2 = await ajanlat({ booking_id: b1 })
t.ok('ajánlat a saját foglalás szerkesztésekor: a saját alkalma számít', [premItem, 0, 0],
  [a2.berlet?.pass_item_id, a2.berlet?.maradt, a2.lines.find((l) => l.kind === 'PACKAGE').price_huf])
t.ok('ajánlat ára 0 (csak csomag)', 0, a2.price_huf)
const a3 = await ajanlat({ booking_id: b2, customer_id: null, vehicle_id: (await egy(`select vehicle_id from bookings where id = $1`, [b2])).vehicle_id })
t.ok('ajánlat rendszám alapján is: a „bármelyik" tétel minden csomagot fed', 3, a3.berlet_csomagok.length)
const pub = await egy(`select publikus_ajanlat($1::jsonb) x`, [JSON.stringify({
  package_id: PREMIUM, category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: napok[5],
  customer_id: ugyfel, vehicle_id: (await egy(`select vehicle_id from bookings where id = $1`, [b2])).vehicle_id })])
t.ok('a publikus ajánlat nem árulja el a bérletet', [null, []], [pub.x.berlet ?? null, pub.x.berlet_csomagok])

await szerepben('authenticated', () => q(`select patch_booking($1::uuid, $2::jsonb)`, [b1, JSON.stringify({ notes: 'átírva' })]))
t.ok('szerkesztés után is a bérleten marad, nem foglal le még egyet', [premItem, 0],
  [(await foglalas(b1)).pass_item_id, (await tetel(passId, 'PREMIUM')).qty_left])
await szerepben('authenticated', () => q(`select patch_booking($1::uuid, $2::jsonb)`, [b1, JSON.stringify({ scope: 'KULSO' })]))
const f1k = await foglalas(b1)
t.ok('csak külsőre írva lekerül a bérletről (listaár)', [null, true], [f1k.pass_item_id, f1k.csomag_ar > 0])
t.ok('… és a Premium alkalom újra szabad', 1, (await tetel(passId, 'PREMIUM')).qty_left)
await szerepben('authenticated', () => q(`select patch_booking($1::uuid, $2::jsonb)`, [b1, JSON.stringify({ scope: 'TELJES' })]))
t.ok('visszaírva teljesre újra bérletes', premItem, (await foglalas(b1)).pass_item_id)

console.log('\n=== 3) Lemondás és „nem fért be" felszabadítja az alkalmat ===\n')
await szerepben('authenticated', () => q(`select set_booking_status($1::uuid, 'CANCELLED_BY_CUSTOMER')`, [b1]))
t.ok('lemondás után a Premium alkalom szabad (1 lefoglalva, 1 szabad)', [1, 1],
  [(await tetel(passId, 'PREMIUM')).qty_reserved, (await tetel(passId, 'PREMIUM')).qty_left])
const allit = (id, st) => szerepben('authenticated', () => q(`select set_booking_status($1::uuid, $2::booking_status)`, [id, st]))
await allit(b1, 'CONFIRMED')
const f1v = await foglalas(b1)
t.ok('visszaállítva („Mégis jön") újra a bérletre kerül, ha van hely', [premItem, 0], [f1v.pass_item_id, f1v.csomag_ar])
await allit(b1, 'CANCELLED_BY_CUSTOMER')
const bx = await szerepben('authenticated', () => foglal({ service_date: napok[4] }))
t.ok('a felszabadult helyet egy új foglalás elviszi', premItem, (await foglalas(bx)).pass_item_id)
await allit(b1, 'CONFIRMED')
const f1t = await foglalas(b1)
t.ok('ha közben elfogyott, visszaállítva listaáron', [null, true, false],
  [f1t.pass_item_id, f1t.csomag_ar > 0, / \(bérlet\)$/.test(f1t.csomag_nev)])
await allit(b1, 'CANCELLED_BY_CUSTOMER')
await allit(bx, 'CANCELLED_BY_SHOP')
t.ok('a lemondásokkal újra 1 szabad Premium alkalom', 1, (await tetel(passId, 'PREMIUM')).qty_left)
await szerepben('authenticated', () => q(`select booking_not_fitted($1::uuid)`, [b2]))
t.ok('„nem fért be" után a „bármelyik" alkalom szabad', [0, 1],
  [(await tetel(passId, null)).qty_reserved, (await tetel(passId, null)).qty_left])

console.log('\n=== 4) Kész van: levonás, igazolólap sor, aláírás ===\n')
const extraFeladat = (await q(`select id from booking_tasks where booking_id = $1 and source = 'EXTRA'`, [b0])).map((r) => r.id)
const elo = await szerepben('authenticated', () => egy(`select booking_finish_preview($1::uuid, $2::uuid[]) x`, [b0, extraFeladat]))
t.ok('a kimaradt csomagmunka nem von le pénzt a bérletes foglalásból', 0, elo.x.skip_huf)
t.ok('lezárás előtt még nincs levonva', 0, await hasznalat(b0))
const lap0 = await szerepben('authenticated', () => egy(`select berlet_lap_foglalashoz($1::uuid) x`, [b0]))
t.ok('lap a foglaláshoz: előtöltve, még mentetlen', [passId, null, 'BRT-001', 'Bérletes Bori', 1, 'Premium'],
  [lap0.x.pass_id, lap0.x.row.id, lap0.x.row.plate, lap0.x.row.name, lap0.x.row.sorszam, lap0.x.row.package_name])
await szerepben('authenticated', () => q(`select booking_finish($1::uuid, $2::uuid[])`, [b0, extraFeladat]))
t.ok('Kész van után levonva (1 használat)', 1, await hasznalat(b0))
const lap1 = await szerepben('authenticated', () => egy(`select berlet_lap_foglalashoz($1::uuid) x`, [b0]))
t.ok('a sor létrejött, de még nincs kitöltve', [true, null], [Boolean(lap1.x.row.id), lap1.x.row.kitoltve_at])
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
await szerepben('authenticated', () => q(`select berlet_sor_mentes($1::jsonb)`, [JSON.stringify({
  booking_id: b0, day: napok[0], plate: 'BRT-001', name: 'Bori', signature: PNG })]))
const sor = await egy(`select name, signature is not null alairva, signed_at is not null alairas_ideje, kitoltve_at is not null kitoltve, used_by::text from pass_usages where booking_id = $1`, [b0])
t.ok('mentve: név, aláírás, kitöltés ideje, ki rögzítette', ['Bori', true, true, true, ALK], Object.values(sor))
await szerepben('authenticated', () => q(`select set_booking_status($1::uuid, 'COMPLETED')`, [b0]))
t.ok('Átvette után is 1 használat', 1, await hasznalat(b0))
const bVissza = await szerepben('authenticated', () => foglal({ service_date: napok[8], package_id: START }))
await szerepben('authenticated', () => q(`select booking_finish($1::uuid, '{}'::uuid[])`, [bVissza]))
t.ok('Kész van: levonva', 1, await hasznalat(bVissza))
await szerepben('authenticated', () => q(`select set_booking_status($1::uuid, 'IN_PROGRESS')`, [bVissza]))
t.ok('a Kész van visszavonásakor a kitöltetlen sor lekerül (újra csak lefoglalt)', [0, barmiItem],
  [await hasznalat(bVissza), (await foglalas(bVissza)).pass_item_id])
await szerepben('authenticated', () => q(`select set_booking_status($1::uuid, 'CANCELLED_BY_SHOP')`, [bVissza]))
t.ok('a Premium tétel: 1 felhasználva, 1 szabad', [1, 0, 1],
  Object.values(await egy(`select qty_used, qty_reserved, qty_left from v_pass_balance where pass_item_id = $1`, [premItem])))
t.ok('az aláírás nélkül is lezárható (a lap kinyomtatva aláírható)', null,
  await hiba(() => szerepben('authenticated', () => q(`select berlet_sor_mentes($1::jsonb)`, [JSON.stringify({
    booking_id: b0, day: napok[0], plate: 'BRT-001', name: 'Bori', signature: '' })]))))
t.ok('az aláírás törölhető', [false, false],
  Object.values(await egy(`select signature is not null a, signed_at is not null b from pass_usages where booking_id = $1`, [b0])))

console.log('\n=== 5) Korábbi (papíron vezetett) alkalom kézi sora ===\n')
const kezi = (x) => szerepben('authenticated', () => egy(`select berlet_sor_mentes($1::jsonb) id`, [JSON.stringify({
  day: ma, pass_item_id: barmiItem, plate: 'BRT-001', name: 'Bori', ...x })]))
t.ok('alkalmazott nem vehet fel kézi sort', true, /tulajdonos/.test(await hiba(() => kezi({})) ?? ''))
await ki(TULAJ)
const keziId = (await kezi({})).id
t.ok('a tulajdonos felveheti', true, Boolean(keziId))
t.ok('elfogyott tételre nem vehető fel több', true, /nincs több/.test(await hiba(() => kezi({})) ?? ''))
t.ok('foglaláshoz tartozó sor nem törölhető', true,
  /nem törölhető/.test(await hiba(() => szerepben('authenticated', async () => {
    const u = await egy(`select id from pass_usages where booking_id = $1`, [b0])
    return q(`select berlet_sor_torles($1::uuid)`, [u.id])
  })) ?? ''))
await ki(ALK)
t.ok('kézi sort alkalmazott nem töröl', true,
  /tulajdonos/.test(await hiba(() => szerepben('authenticated', () => q(`select berlet_sor_torles($1::uuid)`, [keziId]))) ?? ''))
await ki(TULAJ)
await szerepben('authenticated', () => q(`select berlet_sor_torles($1::uuid)`, [keziId]))
t.ok('a tulajdonos törli, az alkalom visszajár', 1, (await tetel(passId, null)).qty_left)

console.log('\n=== 6) A bérlet lapja és listája ===\n')
await ki(ALK)
const lap = (await szerepben('authenticated', () => egy(`select berlet_lap($1::uuid) x`, [passId]))).x
t.ok('lap: ügyfél, tételek, sorok', ['Bérletes Bori', 2, 1, 'Premium'],
  [lap.pass.customer_name, lap.items.length, lap.rows.length, lap.rows[0].package_name])
t.ok('lap: a lemondott és be nem fért nem szerepel, a listaáras sem', [],
  lap.reserved.map((r) => r.booking_id))
const lapok = (await szerepben('authenticated', () => egy(`select berlet_lapok() x`))).x
const sajat = lapok.find((l) => l.id === passId)
t.ok('lista: 3 alkalomból 1 felhasználva, 1 aláírás hiányzik', [3, 1, 1, 0],
  [sajat.total, sajat.used, sajat.unsigned, sajat.reserved])
t.ok('a demó bérleten a két korábbi alkalom', 2, lapok.find((l) => l.customer_name === 'Kovács Péter')?.used)

console.log('\n=== 7) Kivezetéskor a még le nem vont foglalások listaárra állnak ===\n')
const b4 = await szerepben('authenticated', () => foglal({ service_date: napok[6], package_id: START }))
t.ok('Start foglalás a „bármelyik" tételre', barmiItem, (await foglalas(b4)).pass_item_id)
await ki(TULAJ)
await szerepben('authenticated', () => q(`select deactivate_pass($1::uuid)`, [passId]))
const f4 = await foglalas(b4)
t.ok('kivezetés után listaáron, „(bérlet)" nélkül', [null, true, false], [f4.pass_item_id, f4.csomag_ar > 0, / \(bérlet\)$/.test(f4.csomag_nev)])
t.ok('a már levont alkalom megmarad', 1, await hasznalat(b0))

console.log('\n=== 8) Online kérés bérletes ügyféltől ===\n')
await ki('')
const kovStart = (await egy(`select i.id from pass_items i join passes p on p.id = i.pass_id
  join customers c on c.id = p.customer_id where c.name = 'Kovács Péter' and i.package_id = $1`, [START])).id
const online = await szerepben('anon', () => egy(`select publikus_foglalas($1::jsonb) id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', package_id: START, booking_type: 'LEADOS', service_date: napok[7],
  drop_off_time: '09:00', customer_name: 'Kovács Péter', customer_email: 'teszt@pelda.hu', customer_phone: '+36 30 111 2233', plate_raw: 'ABC-123' })]))
t.ok('a kérés a bérletre kerül (lefoglalja az alkalmat)', kovStart, (await foglalas(online.id)).pass_item_id)
await ki(TULAJ)
await szerepben('authenticated', () => q(`select online_keres_dontes($1::uuid, false)`, [online.id]))
t.ok('elutasítva felszabadul', 0, (await egy(`select qty_reserved from v_pass_balance where pass_item_id = $1`, [kovStart])).qty_reserved)

console.log('\n=== 9) Jogosultságok ===\n')
const fv = ['berlet_lap(uuid)', 'berlet_lapok()', 'berlet_lap_foglalashoz(uuid)', 'berlet_sor_mentes(jsonb)', 'berlet_sor_torles(uuid)',
  'berlet_szabad(uuid,uuid)', 'berlet_alkalmaz(uuid)', 'quote_booking(jsonb)', 'create_pass(jsonb)', 'deactivate_pass(uuid)']
t.ok('névtelenül egyik bérletfüggvény sem hívható', [], (await q(`select f from unnest($1::text[]) f
  where has_function_privilege('anon', 'public.' || f, 'EXECUTE')`, [fv])).map((r) => r.f))
t.ok('bejelentkezve mind hívható', [], (await q(`select f from unnest($1::text[]) f
  where not has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')`, [fv])).map((r) => r.f))
t.ok('a trigger függvénye kívülről nem hívható', false,
  (await egy(`select has_function_privilege('authenticated', 'public.berlet_hasznalat_trg()', 'EXECUTE') x`)).x)
await ki(ALK)
t.ok('a használatok táblája közvetlenül nem írható', true,
  /row-level security|permission denied/.test(await hiba(() => szerepben('authenticated', () => q(`insert into pass_usages (pass_item_id, day) values ($1, public.budapest_ma())`, [kovStart]))) ?? ''))
t.ok('és közvetlenül nem is törölhető (0 sor)', [0, 2],
  [(await szerepben('authenticated', () => db.query(`delete from pass_usages`))).affectedRows ?? 0,
   (await egy(`select count(*)::int n from pass_usages u join pass_items i on i.id = u.pass_item_id where i.id = $1`, [kovStart])).n])
t.ok('alkalmazott olvashatja', true, (await szerepben('authenticated', () => q(`select id from pass_usages`))).length > 0)
await ki('')
t.ok('belépés nélkül a lap nem kérhető le', true,
  /be kell jelentkezni/.test(await hiba(() => szerepben('authenticated', () => q(`select berlet_lapok()`))) ?? ''))
t.ok('a napi nézetben látszik a bérlettétel', true,
  (await q(`select 1 from information_schema.columns where table_name = 'v_day_bookings' and column_name = 'pass_item_id'`)).length === 1)

t.vege()
