// 1. fázis: cégek, szerződéses árak, Hozza/Viszi, kapacitás, sorrend.
//
// Igazi PostgreSQL-en (PGlite) fut, az összes migrációval. Minden üzleti
// szabályt egyszer kipróbál, és megmondja, ha valami nem úgy viselkedik,
// ahogy a migrációk fejlécében le van írva.
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

// Egy jövőbeli kedd: munkanap, és nincs rajta semmi más.
const { kedd } = await egy(`
  select (current_date + ((9 - extract(isodow from current_date)::int) % 7) + 14)::text as kedd`)
const szerda = (await egy(`select ($1::date + 1)::text as d`, [kedd])).d
const csutortok = (await egy(`select ($1::date + 2)::text as d`, [kedd])).d

const foglal = async (adat) => (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: kedd,
  drop_off_time: '09:00', package_id: csomag.START, extras: [], ...adat,
})])).id

await belep(TULAJ)

// =============================================================================
console.log('=== A) Cégek: ugyanaz a cég nem jön létre kétszer ===\n')

t.ok('Raiffeisen Bank Zrt. → raifeisenbank', 'raifeisenbank',
  (await egy(`select ceg_kulcs('Raiffeisen Bank Zrt.') k`)).k)
t.ok('kisbetű, ékezet, írásjel: „AUTÓ-trans kft." → autotrans', 'autotrans',
  (await egy(`select ceg_kulcs('AUTÓ-trans kft.') k`)).k)
t.ok('csak cégforma: nincs kulcs', null, (await egy(`select ceg_kulcs('Kft.') k`)).k)

const b1 = await foglal({ customer_name: 'Kiss Ádám', customer_phone: '+36301110001',
  plate_raw: 'RAI-001', company_name: 'Raiffeisen Bank Zrt.' })
{
  const r = await egy(`select c.company_name, c.company_id from bookings b
                        join customers c on c.id = b.customer_id where b.id = $1`, [b1])
  t.ok('az ÚJ foglalás elsőre elmenti a céget (ez volt a hiba)', 'Raiffeisen Bank Zrt.', r.company_name)
  t.ok('és céghez köti', true, !!r.company_id)
}

await foglal({ customer_name: 'Nagy Éva', customer_phone: '+36301110002',
  plate_raw: 'RAI-002', company_name: 'raiffeisen bank' })
{
  const r = await q(`select name from companies where name_key = 'raifeisenbank'`)
  t.ok('„raiffeisen bank" ugyanaz a cég: nincs második', 1, r.length)
  const n = await q(`select company_name from customers where company_name is not null order by name`)
  t.ok('a második ügyfélnél is az első írásmód áll', ['Raiffeisen Bank Zrt.', 'Raiffeisen Bank Zrt.'],
    n.map((x) => x.company_name))
}

{
  const r = await q(`select name, egyezes from ceg_jeloltek('Raifaisen Bank')`)
  t.ok('elírás („Raifaisen") → rákérdez: hasonló', 'HASONLO', r[0]?.egyezes)
  const r2 = await q(`select egyezes from ceg_jeloltek('RAIFFEISEN BANK ZRT')`)
  t.ok('ugyanaz más írással → azonos', 'AZONOS', r2[0]?.egyezes)
  const r3 = await q(`select egyezes from ceg_jeloltek('Raiffeisen')`)
  t.ok('a név eleje („Raiffeisen") → hasonló', 'HASONLO', r3[0]?.egyezes)
  const r4 = await q(`select egyezes from ceg_jeloltek('Magyar Telekom')`)
  t.ok('teljesen más cég → nincs jelölt', 0, r4.length)
}

{
  const r = await q(`select name, ugyfelek from search_companies('raif')`)
  t.ok('a Cég mező kereső az első betűktől talál', 'Raiffeisen Bank Zrt.', r[0]?.name)
  t.ok('és tudja, hány ügyfele van', 2, r[0]?.ugyfelek)
}

// A cég levehető a foglalásról, ha a felület kifejezetten üreset küld
await db.query(`select update_booking($1::uuid, $2::jsonb)`, [b1, JSON.stringify({
  category: 'SZEMELYAUTO', package_id: csomag.START, service_date: kedd, drop_off_time: '09:00',
  company_id: null, company_name: '' })])
t.ok('a cég le is vehető', null,
  (await egy(`select c.company_id from bookings b join customers c on c.id=b.customer_id where b.id=$1`, [b1])).company_id)

// Átnevezés
await db.query(`update companies set name = 'Raiffeisen Bank' where name_key = 'raifeisenbank'`)
t.ok('a cég átnevezése minden ügyfelén átvezetődik', 'Raiffeisen Bank',
  (await egy(`select company_name from customers where name = 'Nagy Éva'`)).company_name)


// =============================================================================
console.log('\n=== B) Szerződés csomagonként, Flotta / Saját ===\n')

const PRICES = [
  // FLOTTA (céges autó)
  ['START', 'NORMAL', 'FLOTTA', 9000], ['START', 'NAGY', 'FLOTTA', 11000],
  ['PREMIUM', 'NORMAL', 'FLOTTA', 13000], ['PREMIUM', 'NAGY', 'FLOTTA', 16000],
  ['ELIT', 'NORMAL', 'FLOTTA', 21000], ['ELIT', 'NAGY', 'FLOTTA', 26000],
  // SAJÁT (a dolgozó saját autója)
  ['START', 'NORMAL', 'SAJAT', 10000], ['PREMIUM', 'NORMAL', 'SAJAT', 14500],
  ['ELIT', 'NORMAL', 'SAJAT', 23000],
].map(([package_code, size, kind, price_huf]) => ({ package_code, size, kind, price_huf }))

await q(`select save_contract($1::jsonb)`, [JSON.stringify({
  company_name: 'Flotta Kft.', pickup_delivery: true, pickup_delivery_fee_huf: 4000, prices: PRICES })])
const { ceg } = await egy(`select id as ceg from companies where name_key = 'flota'`)
t.ok('a szerződés a cégé', true, !!(await egy(`select 1 as x from contracts where company_id = $1`, [ceg])))
t.ok('mind a 9 ár elmentve', 9, (await q(`select 1 from contract_prices cp join contracts ct on ct.id = cp.contract_id where ct.company_id = $1`, [ceg])).length)

const ar = async (id) => (await egy(`select estimated_price_huf p, contract_kind k from bookings where id=$1`, [id]))
const sorok = async (id) => (await q(`select kind, name_snapshot, price_huf from booking_items where booking_id=$1 order by sort_order`, [id]))

const f1 = await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010',
  plate_raw: 'FLT-001', company_id: ceg, package_id: csomag.PREMIUM, contract_kind: 'FLOTTA' })
t.ok('Premium, normál, flotta → céges ár', { p: 13000, k: 'FLOTTA' }, await ar(f1))

const f2 = await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010',
  plate_raw: 'SAJ-001', package_id: csomag.PREMIUM, contract_kind: 'SAJAT' })
t.ok('ugyanő a saját autójával → magán ár', { p: 14500, k: 'SAJAT' }, await ar(f2))

const f3 = await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010',
  plate_raw: 'FLT-SUV', category: 'SUV', package_id: csomag.PREMIUM, contract_kind: 'FLOTTA' })
t.ok('SUV → nagy méret ára', 16000, (await ar(f3)).p)

const f4 = await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010',
  plate_raw: 'FLT-001', package_id: csomag.ELIT })
t.ok('Elit: saját ára van; a Flotta/Saját az autóról jön', { p: 21000, k: 'FLOTTA' }, await ar(f4))

const f5 = await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010',
  plate_raw: 'SAJ-001', package_id: csomag.START })
t.ok('az autó megjegyezte, hogy saját', { p: 10000, k: 'SAJAT' }, await ar(f5))

const lista = async (pkg, cat, scope = 'TELJES') => (await egy(
  `select price_huf from package_pricing where package_id=$1 and category=$2 and scope=$3`, [pkg, cat, scope])).price_huf

const f6 = await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010',
  plate_raw: 'FLT-SUV', category: 'SUV', package_id: csomag.START, contract_kind: 'SAJAT' })
// A jelölés megmarad (a cégnek van szerződése), csak az ár a listaár: így
// a munkalapon vissza lehet váltani Flottára.
t.ok('nincs megállapodott ár (Start, nagy, saját) → listaár, a jelölés marad',
  { p: await lista(csomag.START, 'SUV'), k: 'SAJAT' }, await ar(f6))

const kivulAr = await lista(csomag.PREMIUM, 'SZEMELYAUTO', 'KULSO')
if (kivulAr != null) {
  const f7 = await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010',
    plate_raw: 'FLT-001', scope: 'KULSO', package_id: csomag.PREMIUM, contract_kind: 'FLOTTA' })
  t.ok('csak kívül → listaár (a szerződés teljes csomagra szól)', kivulAr, (await ar(f7)).p)
}

const f8 = await foglal({ customer_name: 'Sofőr Sanyi', customer_phone: '+36301110010',
  plate_raw: 'FLT-001', booking_type: 'HOZOMVISZEM', package_id: csomag.PREMIUM, contract_kind: 'FLOTTA' })
{
  const s = await sorok(f8)
  t.ok('hozom-viszem: külön fuvar sor', ['PACKAGE', 'FUVAR'], s.map((x) => x.kind))
  t.ok('és benne van a végösszegben', 13000 + 4000, (await ar(f8)).p)
}

{
  const qb = await egy(`select quote_booking($1::jsonb) as r`, [JSON.stringify({
    customer_id: (await egy(`select customer_id from bookings where id=$1`, [f8])).customer_id,
    category: 'SZEMELYAUTO', booking_type: 'HOZOMVISZEM', package_id: csomag.PREMIUM,
    contract_kind: 'FLOTTA', service_date: kedd })])
  t.ok('az űrlap élő ára ugyanaz, mint a mentetté', 17000, qb.r.price_huf)
  t.ok('és tudja, hogy van szerződés', true, !!qb.r.contract_id)
  // A csomagválasztó minden kártyájára: a cég ára ugyanerre a méretre/fajtára
  const ck = qb.r.contract_prices
  t.ok('minden csomag szerződéses ára (normál, flotta)', PRICES
    .filter((x) => x.size === 'NORMAL' && (x.kind ?? 'FLOTTA') === 'FLOTTA')
    .map((x) => [x.package_code, x.price_huf]).sort(),
    Object.entries(ck).map(([id, ar]) => [Object.keys(csomag).find((k) => csomag[k] === id), ar]).sort())
}

// A munkalapi egymezős módosítás nem duplázza a fuvart és nem veszíti el a szerződéses árat
await q(`select patch_booking($1::uuid, $2::jsonb)`, [f8, JSON.stringify({ notes: 'kapuban hagyja' })])
t.ok('módosítás után is: szerződéses ár + egyszer a fuvar', 17000, (await ar(f8)).p)

// Felár a szerződéses alapra
await q(`select patch_booking($1::uuid, $2::jsonb)`, [f1, JSON.stringify({ surcharge_pct: 20, surcharge_fix: 0 })])
t.ok('+20% felár a szerződéses árra számol (13 000 → 15 600)', 15600, (await ar(f1)).p)

// Régi alakú mentés (szint): a prémium a Premiumra és az Elitre is
await q(`select save_contract($1::jsonb)`, [JSON.stringify({
  company_name: 'Régi Formátum Bt.', prices: [{ tier: 'PREMIUM', size: 'NORMAL', price_huf: 15000 }] })])
{
  const r = await q(`select pk.code from contract_prices cp join contracts ct on ct.id=cp.contract_id
                       join companies co on co.id = ct.company_id join packages pk on pk.id = cp.package_id
                      where co.name_key = 'regiformatum' order by pk.sort_order`)
  t.ok('régi „prémium" ár → Premium és Elit', ['PREMIUM', 'ELIT'], r.map((x) => x.code))
}

{
  const r = await egy(`select billing_kind from customers where name = 'Sofőr Sanyi'`)
  t.ok('a cég ügyfele „szerződéses" lett', 'SZERZODESES', r.billing_kind)
  await q(`update customers set company_id = null where name = 'Sofőr Sanyi'`)
  t.ok('ha kikerül a cégből, már nem az', 'NORMAL',
    (await egy(`select billing_kind from customers where name = 'Sofőr Sanyi'`)).billing_kind)
}

await belep(ALK)
t.ok('alkalmazott nem köthet szerződést', true,
  /tulajdonos kezeli/.test(await hiba(`select save_contract($1::jsonb)`,
    [JSON.stringify({ company_name: 'X Kft', prices: [] })]) ?? ''))
await belep(TULAJ)


// =============================================================================
console.log('\n=== C) Hozza / Viszi, többnapos a dátumból, csomag kötelező ===\n')

t.ok('csomag nélkül nem menthető', true,
  /Válassz csomagot/.test(await hiba(`select create_booking($1::jsonb)`, [JSON.stringify({
    category: 'SZEMELYAUTO', booking_type: 'LEADOS', service_date: kedd, plate_raw: 'NOP-001' })]) ?? ''))

const t1 = await foglal({ customer_name: 'Hétvége Henrik', customer_phone: '+36301110020',
  plate_raw: 'TOB-001', drop_off_time: '16:00', pick_up_date: csutortok, pick_up_time: '10:00' })
{
  const r = await egy(`select last_day::text, booking_type, deadline_at is not null as hatarido
                         from bookings where id=$1`, [t1])
  t.ok('Viszi két nappal később → a foglalás csütörtökig tart', csutortok, r.last_day)
  t.ok('a típus marad „Itt hagyja"', 'LEADOS', r.booking_type)
  t.ok('a határidő is kitöltődik (Nálunk álló autók)', true, r.hatarido)

  const napok = []
  for (const d of [kedd, szerda, csutortok]) {
    const sor = (await q(`select * from day_bookings($1::date)`, [d]))
      .map((x) => x.day_bookings).find((x) => x.id === t1)
    napok.push(sor ? `${sor.nap_szama}/${sor.napok_szama}` : 'nincs')
  }
  t.ok('mindhárom napon megjelenik, sorszámmal', ['1/3', '2/3', '3/3'], napok)
}

t.ok('a Viszi nem lehet a Hozza előtt', true,
  /nem lehet korábban/.test(await hiba(`select create_booking($1::jsonb)`, [JSON.stringify({
    category: 'SZEMELYAUTO', booking_type: 'LEADOS', service_date: szerda, package_id: csomag.START,
    plate_raw: 'ROS-001', pick_up_date: kedd })]) ?? ''))

const e1 = await foglal({ customer_name: 'Egynapos Edit', customer_phone: '+36301110021',
  plate_raw: 'EGY-001', drop_off_time: '08:00', pick_up_time: '16:30' })
await q(`select patch_booking($1::uuid, $2::jsonb)`, [e1, JSON.stringify({ service_date: szerda })])
{
  const r = await egy(`select service_date::text s, last_day::text l,
                        to_char(pick_up_at at time zone 'Europe/Budapest','HH24:MI') o from bookings where id=$1`, [e1])
  t.ok('egynapos foglalás áthelyezése: a Viszi vele megy, egynapos marad',
    { s: szerda, l: szerda, o: '16:30' }, r)
}

t.ok('a csomag nem vehető le', true,
  /nem lehet levenni/.test(await hiba(`select patch_booking($1::uuid, $2::jsonb)`,
    [e1, JSON.stringify({ package_id: null })]) ?? ''))

t.ok('„Gumiápolás (külön kérve)" → „Gumiápolás"', 1,
  (await q(`select 1 from extras where name = 'Gumiápolás'`)).length)


// =============================================================================
console.log('\n=== D) Kapacitás: egy forrás, +20%, jelenlét szerint ===\n')

// Három alkalmazott, ahogy a műhelyben: Gábor (már van), Péter, Laci.
const P = '00000000-0000-4000-8000-000000000004'
const L = '00000000-0000-4000-8000-000000000005'
await db.exec(`
  insert into auth.users (id,email) values ('${P}','p@x.hu'), ('${L}','l@x.hu');
  insert into staff (id, full_name, role, active) values
    ('${P}','Péter','STAFF',true), ('${L}','Laci','STAFF',true);`)

const kap = async (d) => egy(`select * from day_capacity($1::date)`, [d])
const pentek = (await egy(`select ($1::date + 3)::text as d`, [kedd])).d
const ures = await kap(pentek)
t.ok('alap = munkaidő × párhuzamos autók × 1,2',
  Math.round(ures.open_minutes * ures.parallel_slots * 1.2), ures.capacity_minutes)
t.ok('három alkalmazott számít', 3, ures.staff_total)

const hv = await foglal({ customer_name: 'Hozom Hanna', customer_phone: '+36301110030',
  plate_raw: 'HOZ-001', service_date: pentek, booking_type: 'HOZOMVISZEM', package_id: csomag.PREMIUM })
{
  const r = await kap(pentek)
  const perc = (await egy(`select planned_duration_minutes m from bookings where id=$1`, [hv])).m
  t.ok('a hozom-viszem autó munkája is terheli a napot (eddig kimaradt)', perc, r.booked_minutes)
}

await belep(ALK)
await q(`select set_absence($1::jsonb)`, [JSON.stringify({ day: pentek, kind: 'EGESZ_NAP', note: 'szabadság' })])
await belep(TULAJ)
t.ok('1 ember hiányzik egész nap → 80%', Math.round(ures.capacity_minutes * 0.8), (await kap(pentek)).capacity_minutes)

await q(`select set_absence($1::jsonb)`, [JSON.stringify({ staff_id: P, day: pentek, kind: 'EGESZ_NAP' })])
t.ok('2 ember hiányzik → 40%', Math.round(ures.capacity_minutes * 0.4), (await kap(pentek)).capacity_minutes)

await q(`select set_absence($1::jsonb)`, [JSON.stringify({ staff_id: L, day: pentek, kind: 'EGESZ_NAP' })])
t.ok('3 ember hiányzik → 0', 0, (await kap(pentek)).capacity_minutes)

// Részleges: csak Gábor megy el két órával zárás előtt (egy másik napon)
const hetfo = (await egy(`select ($1::date + 6)::text as d`, [kedd])).d
const alap = await kap(hetfo)
const zaras = (await egy(`select max(ends)::text e from work_windows($1::date)`, [hetfo])).e
const ketOraval = (await egy(`select ($1::time - interval '2 hours')::text t`, [zaras])).t
await belep(ALK)
await q(`select set_absence($1::jsonb)`, [JSON.stringify({
  day: hetfo, kind: 'KORABBAN_TAVOZIK', starts: ketOraval, note: 'orvos' })])
await belep(TULAJ)
{
  const r = await kap(hetfo)
  const vart = Math.round((alap.open_minutes - 120 + 120 * 0.8) * alap.parallel_slots * 1.2)
  t.ok('Gábor 2 órával korábban megy → csak arra a 2 órára 80%', vart, r.capacity_minutes)
  const dn = (await q(`select staff_name, kind from day_absences($1::date)`, [hetfo]))
  t.ok('a Nap kártyára: ki, mi', [{ staff_name: 'Gábor', kind: 'KORABBAN_TAVOZIK' }], dn)
}

await belep(ALK)
t.ok('alkalmazott más munkaidejét nem állíthatja', true,
  /tulajdonos állítja/.test(await hiba(`select set_absence($1::jsonb)`,
    [JSON.stringify({ staff_id: P, day: hetfo, kind: 'EGESZ_NAP' })]) ?? ''))
await belep(TULAJ)

// Többnapos: v57 óta a még elérhető munkaidő arányában (kedd 16:00-tól,
// csütörtök 10:00-ig — azokra a napokra kevesebb jut)
{
  const perc = (await egy(`select planned_duration_minutes m from bookings where id=$1`, [t1])).m
  const terhek = []
  const eler = []
  for (const d of [kedd, szerda, csutortok]) {
    terhek.push(Number((await egy(`select foglalas_napi_terhe(b, $2::date) t from bookings b where id=$1`, [t1, d])).t))
    eler.push(Number((await egy(`select elerheto_perc(b, $2::date) e from bookings b where id=$1`, [t1, d])).e))
  }
  const ossz = eler.reduce((a, b) => a + b, 0)
  t.ok('háromnapos munka: az elérhető idő arányában', eler.map((e) => Math.round(perc * e / ossz)), terhek.map(Math.round))
}

{
  const r = await kap(kedd)
  const kezzel = (await q(`select foglalas_napi_terhe(b, $1::date) t from bookings b
                            where service_date <= $1::date and last_day >= $1::date`, [kedd]))
    .reduce((s, x) => s + Number(x.t), 0)
  t.ok('a lekötött munka = a foglalások napi terhének összege', Math.round(kezzel), r.booked_minutes)
  const autok = (await q(`select * from day_bookings($1::date)`, [kedd]))
    .filter((x) => !['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW', 'REJECTED'].includes(x.day_bookings.status)).length
  t.ok('az autók száma = a napi listán élő foglalások', autok, r.cars)
}


// =============================================================================
console.log('\n=== E) Saját sorrend, ami nem mozdul ===\n')

const rend = async (d) => (await q(`select * from day_bookings($1::date)`, [d])).map((x) => x.day_bookings.id)
const eredeti = await rend(kedd)
const forditott = [...eredeti].reverse()
await q(`select set_day_order($1::date, $2::uuid[])`, [kedd, forditott])
t.ok('áthúzás után a nap az új sorrendben jön', forditott, await rend(kedd))

await q(`select set_booking_status($1::uuid, 'ARRIVED')`, [b1])
await q(`select set_booking_status($1::uuid, 'READY')`, [b1])
t.ok('állapotváltás (Megérkezett, Kész van) után sem mozdul semmi', forditott, await rend(kedd))

const uj = await foglal({ customer_name: 'Új Ubul', customer_phone: '+36301110040',
  plate_raw: 'UJ-0001', drop_off_time: '23:00' })
{
  const r = await rend(kedd)
  t.ok('az új foglalás bekerül, és a többiek sorrendje nem változik', forditott,
    r.filter((id) => id !== uj))
  t.ok('az új foglalás ott van', true, r.includes(uj))
}

t.vege()
