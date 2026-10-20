import { adatbazis, tesztelo, ALK, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
const egy = async (s, p) => (await q(s, p))[0]
const ki = (id) => q(`select set_config('app.uid', $1, false)`, [id ?? ''])
const hiba = async (f) => { try { await f(); return null } catch (e) { return e.message } }

async function anonkent(f) {
  await ki('')
  await db.exec('set role anon')
  try { return await f() } finally { await db.exec('reset role') }
}

const ceg = (await egy(`select id, name from companies where name = 'Autó Trans Kft.'`))
const START = (await egy(`select id from packages where code = 'START'`)).id
const nap = (await egy(`select d::text d from generate_series(
    (now() at time zone 'Europe/Budapest')::date + 2,
    (now() at time zone 'Europe/Budapest')::date + 20, interval '1 day') d
  where munkanap(d::date) order by d limit 1`)).d

console.log('=== 1) Jogosultság ===\n')
const anonFv = (await q(`select p.proname from pg_proc p
  where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')
  order by 1`)).map((r) => r.proname)
t.ok('anon: a nyilvános öt + a céges link három függvénye',
  ['ceg_ajanlat', 'ceg_foglalas', 'ceg_link_adat', 'publikus_ajanlat', 'publikus_foglalas', 'publikus_jogi', 'publikus_nap', 'publikus_oldal'],
  anonFv)
t.ok('a link tábla kívülről nem olvasható', [false, false],
  [(await egy(`select has_table_privilege('anon', 'public.company_booking_links', 'select') a`)).a,
   (await egy(`select has_table_privilege('authenticated', 'public.company_booking_links', 'select') a`)).a])

await ki(ALK)
t.ok('alkalmazott nem listázhatja a linkeket', true, /jogosults/.test(await hiba(() => q(`select ceg_linkek()`)) ?? ''))
t.ok('alkalmazott nem készíthet linket', true, /jogosults/.test(await hiba(() => q(`select ceg_link_uj($1)`, [ceg.id])) ?? ''))
t.ok('alkalmazott nem írhat üzenetet', true, /jogosults/.test(await hiba(() => q(`select ceg_link_uzenet($1, 'x')`, [ceg.id])) ?? ''))

console.log('\n=== 2) Lista, első link, üzenet ===\n')
await ki(TULAJ)
let lista = (await egy(`select ceg_linkek() x`)).x
t.ok('a szerződéses cég a listában, a demó linkkel', [ceg.name, 'autotransdemo2026link'],
  [lista.find((x) => x.company_id === ceg.id)?.name, lista.find((x) => x.company_id === ceg.id)?.token ?? null])
t.ok('a demó link működik', ceg.name, (await anonkent(async () => (await egy(`select ceg_link_adat('autotransdemo2026link') x`)).x)).ceg)
await ki(TULAJ)
const elso = (await egy(`select ceg_link_uj($1) k`, [ceg.id])).k
t.ok('a link kódja 24 karakter, kisbetű és szám', true, /^[a-z0-9]{24}$/.test(elso))
await q(`select ceg_link_uzenet($1, $2)`, [ceg.id, '  Kérjük, a forgalmit hagyjátok az autóban.  '])
lista = (await egy(`select ceg_linkek() x`)).x
t.ok('a listában a link és a levágott üzenet', [elso, 'Kérjük, a forgalmit hagyjátok az autóban.'],
  [lista.find((x) => x.company_id === ceg.id).token, lista.find((x) => x.company_id === ceg.id).message])
t.ok('túl hosszú üzenet elutasítva', true, /1000/.test(await hiba(() => q(`select ceg_link_uzenet($1, $2)`, [ceg.id, 'x'.repeat(1001)])) ?? ''))

console.log('\n=== 3) A link adatai kívülről ===\n')
const adat = await anonkent(async () => (await egy(`select ceg_link_adat($1) x`, [elso])).x)
t.ok('cégnév és üzenet', [ceg.name, 'Kérjük, a forgalmit hagyjátok az autóban.'], [adat.ceg, adat.uzenet])
t.ok('a szerződés három csomagja, ár nélkül', [3, false], [adat.csomagok.length, 'arak' in adat])
t.ok('ismeretlen kód: nincs adat', null, await anonkent(async () => (await egy(`select ceg_link_adat('aaaaaaaaaaaaaaaaaaaaaaaa') x`)).x))
t.ok('rossz alakú kód: nincs adat', null, await anonkent(async () => (await egy(`select ceg_link_adat('x'' or 1=1') x`)).x))

console.log('\n=== 4) Ár a linken keresztül ===\n')
const ajanlat = (k, x = {}) => anonkent(async () => (await egy(`select ceg_ajanlat($1, $2) x`, [k, JSON.stringify({
  package_id: START, category: 'SZEMELYAUTO', scope: 'TELJES', full_service: false, extras: [],
  booking_type: 'LEADOS', service_date: nap, ...x })])).x)
t.ok('a céges ajánlat árat nem ad ki, csak munkaidőt', [0, true, 0], [(await ajanlat(elso)).price_huf, (await ajanlat(elso)).work_minutes > 0, (await ajanlat(elso)).lines.length])
t.ok('ugyanez a publikus oldalon listaáron', 12800,
  (await anonkent(async () => (await egy(`select publikus_ajanlat($1) x`, [JSON.stringify({
    package_id: START, category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: nap })])).x)).price_huf)
t.ok('érvénytelen kóddal hibaüzenet', true,
  /nem érvényes/.test(await hiba(() => ajanlat('aaaaaaaaaaaaaaaaaaaaaaaa')) ?? ''))

console.log('\n=== 5) Foglalási kérés a linken ===\n')
const kuld = (k, x = {}) => anonkent(async () => (await egy(`select ceg_foglalas($1, $2) id`, [k, JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', package_id: START, full_service: false, extras: [],
  booking_type: 'LEADOS', service_date: nap, drop_off_time: '09:00',
  customer_name: 'Sofőr Sándor', customer_phone: '+36 30 777 8899', customer_email: 'sofor@x.hu',
  plate_raw: 'cgl-101', brand: 'Skoda', model: 'Octavia', notes: 'Kulcs a portán', ...x })])).id)
const id = await kuld(elso)
await ki(TULAJ)
const b = await egy(`select b.status, b.source, b.ceg_link_company, b.public_request, b.estimated_price_huf, b.contract_kind,
    b.internal_notes, b.request_email, c.company_id, c.billing_kind, v.contract_kind as jarmu_kind
  from bookings b join customers c on c.id = b.customer_id join vehicles v on v.id = b.vehicle_id where b.id = $1`, [id])
t.ok('kérésként érkezik, online forrással, a céghez jelölve', ['REQUESTED', 'ONLINE', ceg.id, false], [b.status, b.source, b.ceg_link_company, b.public_request])
t.ok('az új ügyfél rögtön a céghez kötve, szerződéses számlázással', [ceg.id, 'SZERZODESES'], [b.company_id, b.billing_kind])
t.ok('szerződéses ár és flotta jelölés', [10500, 'FLOTTA', 'FLOTTA'], [b.estimated_price_huf, b.contract_kind, b.jarmu_kind])
t.ok('belső megjegyzés a cég nevével', true, b.internal_notes.includes(`Céges foglalási linkről érkezett (${ceg.name}).`))
t.ok('az e-mail a kérésen', 'sofor@x.hu', b.request_email)
const tetelek = await q(`select kind, price_huf from booking_items where booking_id = $1 order by sort_order`, [id])
t.ok('tételsor összege egyezik', 10500, tetelek.reduce((s, x) => s + x.price_huf, 0))
const keres = await egy(`select ceg_link_nev from v_online_kerelmek where id = $1`, [id])
t.ok('az online kérések között látszik, a cég nevével', ceg.name, keres.ceg_link_nev)

console.log('\n=== 5b) Meglévő magánügyfél: csak elfogadáskor kerül a céghez ===\n')
await ki(TULAJ)
const magan = await egy(`select c.id, c.phone, v.plate_raw from customers c join vehicles v on v.customer_id = c.id
  where c.company_id is null and c.billing_kind = 'NORMAL' order by c.created_at limit 1`)
const elutasitott = await kuld(elso, { customer_phone: magan.phone, plate_raw: magan.plate_raw, customer_name: 'Magán Mária' })
await ki(TULAJ)
t.ok('kérés közben még nincs a céghez kötve', [null, 10500],
  Object.values(await egy(`select c.company_id, b.estimated_price_huf from bookings b join customers c on c.id = b.customer_id where b.id = $1`, [elutasitott])))
t.ok('elutasítás', 'OK', (await egy(`select online_keres_dontes($1, false) x`, [elutasitott])).x)
t.ok('elutasítva sem kerül a céghez', null, (await egy(`select company_id from customers where id = $1`, [magan.id])).company_id)
const elfogadott = await kuld(elso, { customer_phone: magan.phone, plate_raw: magan.plate_raw, customer_name: 'Magán Mária' })
await ki(TULAJ)
t.ok('elfogadás', 'OK', (await egy(`select online_keres_dontes($1, true) x`, [elfogadott])).x)
t.ok('elfogadva a céghez kötve, flotta autóval', [ceg.id, 'SZERZODESES', 'FLOTTA'],
  Object.values(await egy(`select c.company_id, c.billing_kind, v.contract_kind from bookings b
    join customers c on c.id = b.customer_id join vehicles v on v.id = b.vehicle_id where b.id = $1`, [elfogadott])))
t.ok('a visszaigazoló levél sorba állt', 1,
  (await egy(`select count(*)::int n from notifications where booking_id = $1 and kind = 'BOOKING_CONFIRMED'`, [elfogadott])).n)

console.log('\n=== 6) Igazolólap az átadásnál ===\n')
const nb = (await q(`select x from day_bookings($1::date) x`, [nap])).map((r) => r.x).find((x) => x.id === id)
t.ok('a napi kártyán cég és szerződéses számlázás (ettől kéri az Átvette az igazolólapot)',
  [ceg.id, 'SZERZODESES'], [nb.company_id, nb.billing_kind])
const lap = (await egy(`select sheet_for_booking($1) x`, [id])).x
t.ok('az igazolólap sora előtöltve: rendszám, nettó ár, név', ['CGL-101', Math.round(10500 / 1.27), 'Sofőr Sándor', null],
  [lap.row.plate, lap.row.net_huf, lap.row.name, lap.row.id])

console.log('\n=== 7) Új link: a régi azonnal megszűnik ===\n')
const masodik = (await egy(`select ceg_link_uj($1) k`, [ceg.id])).k
t.ok('új kód keletkezett', true, masodik !== elso)
t.ok('a régi kód már nem ad adatot', null, await anonkent(async () => (await egy(`select ceg_link_adat($1) x`, [elso])).x))
t.ok('a régi kóddal nem lehet foglalni', true, /nem érvényes/.test(await hiba(() => kuld(elso, { plate_raw: 'cgl-102' })) ?? ''))
t.ok('az üzenet megmaradt', 'Kérjük, a forgalmit hagyjátok az autóban.',
  (await anonkent(async () => (await egy(`select ceg_link_adat($1) x`, [masodik])).x)).uzenet)
await ki(TULAJ)
t.ok('a naplóban a két csere', ['link_csereve', 'link_csereve'],
  (await q(`select action from audit_log where entity = 'company_booking_links' order by id`)).map((r) => r.action))

console.log('\n=== 8) Korlátok ===\n')
t.ok('rejtett mező kitöltve: elutasítva', true,
  /nem küldhető/.test(await hiba(() => kuld(masodik, { weboldal: 'x', plate_raw: 'cgl-103' })) ?? ''))
let utolso = null
for (let i = 0; i < 11; i++) {
  utolso = await hiba(() => kuld(masodik, { plate_raw: `cgk-${200 + i}`, customer_phone: '+36 30 111 0000' }))
}
t.ok('egy telefonszámról a 10 függő kérés után megáll', true, /több kérés vár/.test(utolso ?? ''))

console.log('\n=== 9) Lejárt szerződésnél a link nem működik ===\n')
await ki(TULAJ)
await q(`update contracts set valid_until = (now() at time zone 'Europe/Budapest')::date - 1 where company_id = $1`, [ceg.id])
t.ok('lejárt szerződés: nincs adat', null, await anonkent(async () => (await egy(`select ceg_link_adat($1) x`, [masodik])).x))
await ki(TULAJ)
t.ok('és a listából is kikerül', false, (await egy(`select ceg_linkek() x`)).x.some((x) => x.company_id === ceg.id))
t.ok('új link sem készíthető', true, /nincs érvényes szerződése/.test(await hiba(() => q(`select ceg_link_uj($1)`, [ceg.id])) ?? ''))

t.vege()
