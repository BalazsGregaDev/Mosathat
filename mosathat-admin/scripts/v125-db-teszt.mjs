import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
const egy = async (s, p) => (await q(s, p))[0]
await q(`select set_config('app.uid', $1, false)`, [TULAJ])

const START = (await egy(`select id from packages where active order by sort_order limit 1`)).id
const nap = (await egy(`select d::date::text d from generate_series(public.budapest_ma() + 1, public.budapest_ma() + 40, interval '1 day') d
                         where public.munkanap(d::date) and extract(isodow from d) < 6 order by d limit 1`)).d
const foglal = (x) => egy(`select create_booking($1::jsonb) id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', drop_off_time: '09:00',
  package_id: START, service_date: nap, extras: [], ...x,
})]).then((r) => r.id)
const ceg = async (nev) => {
  const id = (await egy(`select add_customer($1::jsonb) id`, [JSON.stringify({ name: `${nev} Sofőr`, phone: `+36 30 8${Math.floor(Math.random() * 900000 + 100000)}`, type: 'MAGAN', company_name: nev })])).id
  return (await egy(`select company_id from customers where id = $1`, [id])).company_id
}
const cegLista = async (id) => (await q(`select x from list_companies('', 500) x`)).map((r) => r.x).find((c) => c.id === id)
const helyettesek = async (cegId) => (await egy(`select count(*)::int n from customers where company_id is not distinct from $1 and helyettes_ugyfel(name, phone, email)`, [cegId])).n

console.log('=== 1) Adat nélküli céges foglalás: nem lesz belőle ügyfél és autó a cégnél ===\n')
const raiff = await ceg('Raiffeisen Teszt Bank')
const ures = []
for (let i = 0; i < 4; i++) ures.push(await foglal({ company_id: raiff }))
t.ok('a négy foglalás megvan, mind a céghez tartozik', 4,
  (await egy(`select count(*)::int n from bookings b join customers c on c.id = b.customer_id where b.id = any($1::uuid[]) and c.company_id = $2`, [ures, raiff])).n)
t.ok('nem jön létre négy névtelen ügyfél, csak egy közös', 1, await helyettesek(raiff))
const l1 = await cegLista(raiff)
t.ok('a Cég szerint listában csak a valódi ügyfél és autó látszik', [1, 0, 0, true],
  [l1.ugyfelek, l1.jarmuvek, l1.autok.length, l1.latogatas >= 0])
t.ok('az Ügyfél szerint listában nincs névtelen ügyfél', 0,
  (await q(`select * from list_customers('', 500)`)).filter((c) => (c.name === 'Névtelen' || !c.name) && ['—', ''].includes(c.phone ?? '') && !c.email && c.rendszamok.length === 0).length)
t.ok('a Jármű szerint listában nincs rendszám és név nélküli autó', 0,
  (await q(`select * from list_vehicles('', 500)`)).filter((v) => ['—', ''].includes(v.plate_raw.trim()) && ['Névtelen', ''].includes(v.customer_name) && ['—', ''].includes(v.customer_phone ?? '')).length)
t.ok('a foglaláskor cégnévre keresve sem jönnek elő', 0,
  (await q(`select * from search_customers('Raiffeisen Teszt', 50, 'MIND')`)).filter((v) => v.plate_raw === '—').length)
t.ok('a cég ügyfelei között (átnevezéskor) sincs', ['Raiffeisen Teszt Bank Sofőr'],
  (await egy(`select ceg_tagjai(null, $1::uuid) x`, [raiff])).x.tagok.map((x) => x.name))

console.log('\n=== 2) Ha van név, telefonszám vagy rendszám, elmenti ===\n')
const telefonos = await foglal({ company_id: raiff, customer_phone: '+36 30 811 2233' })
const neves = await foglal({ company_id: raiff, customer_name: 'Kiss Kata' })
const rendszamos = await foglal({ company_id: raiff, plate_raw: 'RAI-001' })
const l2 = await cegLista(raiff)
t.ok('telefonnal, névvel külön ügyfél lesz, a rendszámos autó is látszik (a névtelen ügyfélnél)', [4, 3, ['RAI-001', '—', '—']],
  [l2.ugyfelek, l2.jarmuvek, l2.autok.map((a) => a.plate_raw).sort()])
t.ok('a név szerint rögzített, rendszám nélküli ügyfél kereshető marad', ['—'],
  (await q(`select * from search_customers('Kiss Kata', 5, 'NEV')`)).map((v) => v.plate_raw))
t.ok('a telefonos és a neves ügyfél nem a névtelen', [false, false],
  await Promise.all([telefonos, neves].map(async (id) => (await egy(`select helyettes_ugyfel(c.name, c.phone, c.email) h from bookings b join customers c on c.id = b.customer_id where b.id = $1`, [id])).h)))
t.ok('a rendszámos foglalás is a céghez tartozik', raiff,
  (await egy(`select c.company_id from bookings b join customers c on c.id = b.customer_id where b.id = $1`, [rendszamos])).company_id)

console.log('\n=== 3) Flottás foglalás: a rendszám utólag beírva jelenik meg ===\n')
const csoport = (await egy(`select create_fleet_booking($1::jsonb, 3) g`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', package_id: START, service_date: nap, extras: [], company_id: raiff,
})])).g
t.ok('három flottás foglalás, továbbra is egy névtelen ügyfél', [3, 1],
  [(await egy(`select count(*)::int n from bookings where fleet_group = $1`, [csoport])).n, await helyettesek(raiff)])
const elso = (await egy(`select id from bookings where fleet_group = $1 order by fleet_index limit 1`, [csoport])).id
await q(`select fleet_set_plate($1, 'FLT-777')`, [elso])
t.ok('a beírt rendszámú autó megjelenik a cégnél', true, (await cegLista(raiff)).autok.some((a) => a.plate_raw === 'FLT-777'))

console.log('\n=== 4) Cég nélkül sem gyűlnek a névtelen ügyfelek ===\n')
const elotte = await helyettesek(null)
await foglal({})
await foglal({})
t.ok('legfeljebb egy közös névtelen ügyfél', true, (await helyettesek(null)) <= Math.max(elotte, 1))

console.log('\n=== 5) Összevonáskor a rendszám nélküli foglalások is átkerülnek ===\n')
const magan = await ceg('Raiffeisen Teszt Bank / Magán')
const m1 = await foglal({ company_id: magan })
const valodi = (await egy(`select ceg_tagjai(null, $1::uuid) x`, [magan])).x.tagok.map((x) => x.id)
t.ok('a Magán cégnél csak a valódi ügyfél van a listában', 1, valodi.length)
const r = (await egy(`select ceg_atnevez($1::uuid, 'Raiffeisen Teszt Bank', $2::uuid[]) x`, [magan, valodi])).x
t.ok('a Magán cég megszűnt, a rendszám nélküli foglalás is a fő cégnél', [true, raiff],
  [r.regi_torolve, (await egy(`select c.company_id from bookings b join customers c on c.id = b.customer_id where b.id = $1`, [m1])).company_id])

console.log('\n=== 6) Meglévő duplikált névtelen ügyfelek összevonása ===\n')
const masik = await ceg('Duplikált Teszt Kft.')
const dup = []
for (let i = 0; i < 3; i++) {
  const c = (await egy(`insert into customers (name, phone, type, company_id) values ('Névtelen', '—', 'MAGAN', $1) returning id`, [masik])).id
  dup.push(await foglal({ customer_id: c }))
}
const arva = (await egy(`insert into customers (name, phone, type, company_id) values ('Névtelen', '—', 'MAGAN', $1) returning id`, [masik])).id
const arvaAuto = (await egy(`insert into vehicles (customer_id, plate_raw, category) values ($1, '—', 'SZEMELYAUTO') returning id`, [arva])).id
t.ok('előtte négy névtelen ügyfél a cégnél', 4, await helyettesek(masik))
const torolt = (await egy(`select helyettes_takaritas() n`)).n
const maradt = await q(`select distinct b.customer_id from bookings b where b.id = any($1::uuid[])`, [dup])
t.ok('egy névtelen ügyfél marad, mindhárom foglalás hozzá kerül, a foglalás nélküli autó eltűnik', [true, 1, 1, 0],
  [torolt >= 3, await helyettesek(masik), maradt.length, (await egy(`select count(*)::int n from vehicles where id = $1`, [arvaAuto])).n])
t.ok('a rendszám nélküli foglalások mind megmaradnak', 4, (await egy(`select count(*)::int n from bookings where id = any($1::uuid[])`, [ures])).n)
t.ok('kívülről nem hívható a takarítás', [false, false],
  [(await egy(`select has_function_privilege('anon', 'public.helyettes_takaritas()', 'EXECUTE') a`)).a,
   (await egy(`select has_function_privilege('authenticated', 'public.helyettes_takaritas()', 'EXECUTE') a`)).a])

t.vege()
