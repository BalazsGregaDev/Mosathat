import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
const egy = async (s, p) => (await q(s, p))[0]
const hiba = async (f) => { try { await f(); return null } catch (e) { return e.message } }
const ki = (id) => q(`select set_config('app.uid', $1, false)`, [id ?? ''])
async function anonkent(f) {
  await ki('')
  await db.exec('set role anon')
  try { return await f() } finally { await db.exec('reset role') }
}
const keres = (x) => anonkent(async () => (await egy(`select foglalas_kereses($1::jsonb) x`, [JSON.stringify(x)])).x)
const torolNaplo = () => q(`delete from foglalas_kereses_naplo`)

const START = (await egy(`select id from packages where code = 'START'`)).id
const napok = (await q(`select d::date::text d from generate_series(public.budapest_ma() + 3, public.budapest_ma() + 50, interval '1 day') d
  where munkanap(d::date) and extract(isodow from d) < 6 order by d`)).map((r) => r.d)
const kerelem = (x = {}) => JSON.stringify({
  package_id: START, category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: napok[0],
  drop_off_time: '09:00', extras: [], customer_name: 'Kereső Klára', customer_phone: '+36 30 555 1212',
  customer_email: 'klara@pelda.hu', plate_raw: 'KER-101', ...x,
})
const tg = await egy(`select b.id, l.token from bookings b join booking_links l on l.booking_id = b.id
  join vehicles v on v.id = b.vehicle_id where v.plate_raw = 'AABB-123' and b.status = 'CONFIRMED' order by b.service_date limit 1`)

console.log('=== 1) Kötelező e-mail az online foglalásnál ===\n')
await ki(TULAJ)
t.ok('e-mail nélkül: hiba', 'Add meg az e-mail címed.', await hiba(() => q(`select publikus_foglalas($1::jsonb)`, [kerelem({ customer_email: '' })])))
t.ok('rossz e-mail: hiba', 'Az e-mail cím formátuma nem jó.', await hiba(() => q(`select publikus_foglalas($1::jsonb)`, [kerelem({ customer_email: 'klara' })])))
t.ok('név nélkül előbb a név hiányzik', 'Add meg a neved.', await hiba(() => q(`select publikus_foglalas($1::jsonb)`, [kerelem({ customer_name: '', customer_email: '' })])))
t.ok('céges linken is kell', 'Add meg az e-mail címed.',
  await hiba(() => q(`select ceg_foglalas('autotransdemo2026link', $1::jsonb)`, [kerelem({ customer_email: null })])))
t.ok('bérletes linken is kell', 'Add meg az e-mail címed.',
  await hiba(() => q(`select berlet_foglalas('berletdemo2026kovacspeter', $1::jsonb)`, [kerelem({ customer_email: '  ' })])))
t.ok('érvénytelen céges linknél a link hibája jön', true,
  /link már nem érvényes/.test(await hiba(() => q(`select ceg_foglalas('nincs-ilyen-link', $1::jsonb)`, [kerelem({ customer_email: '' })])) ?? ''))
const uj1 = (await egy(`select publikus_foglalas($1::jsonb) id`, [kerelem()])).id
t.ok('e-maillel megy, a telefonszám a foglaláson is megmarad', '305551212',
  (await egy(`select request_phone from bookings where id = $1`, [uj1])).request_phone)

console.log('\n=== 2) Keresés két adattal ===\n')
t.ok('egy adat kevés', true, /legalább két adatot/.test(await hiba(() => keres({ rendszam: 'AABB-123' })) ?? ''))
const r1 = await keres({ rendszam: 'aabb 123', telefon: '06 70 244 1100' })
t.ok('rendszám + telefon, más írásmóddal: megvan, a link kódjával', [1, tg.token, 'VISSZAIGAZOLVA', 'AABB-123'],
  [r1.length, r1[0]?.token, r1[0]?.allapot, r1[0]?.rendszam])
t.ok('telefon + e-mail (nagybetűvel)', tg.token, (await keres({ telefon: '+36702441100', email: 'Toth.Gergo@Example.com' }))[0]?.token)
t.ok('rendszám + e-mail', tg.token, (await keres({ rendszam: 'AABB123', email: 'toth.gergo@example.com' }))[0]?.token)
t.ok('mindhárom adattal is', 1, (await keres({ rendszam: 'AABB-123', telefon: '+36 70 244 1100', email: 'toth.gergo@example.com' })).length)
t.ok('ha az egyik nem stimmel: nincs találat', [], await keres({ rendszam: 'AABB-123', telefon: '+36 70 244 1100', email: 'mas@pelda.hu' }))
t.ok('a foglaláskor megadott e-mail is jó (request_email)', 1, (await keres({ rendszam: 'KER-101', email: 'KLARA@pelda.hu' })).length)

console.log('\n=== 3) Több foglalás: előbb a jövőbeliek, időrendben ===\n')
await torolNaplo()
await ki(TULAJ)
const uj2 = (await egy(`select publikus_foglalas($1::jsonb) id`, [kerelem({ service_date: napok[3] })])).id
const uj3 = (await egy(`select publikus_foglalas($1::jsonb) id`, [kerelem({ service_date: napok[1] })])).id
const tok = async (id) => (await egy(`select token from booking_links where booking_id = $1`, [id])).token
const lista = await keres({ rendszam: 'KER-101', telefon: '+36 30 555 1212' })
t.ok('három foglalás, a legközelebbi elöl', [await tok(uj1), await tok(uj3), await tok(uj2)], lista.map((x) => x.token))
t.ok('csomag és dátum is jön', ['Start', napok[0]], [lista[0].csomag, lista[0].nap])
await ki(TULAJ)
await q(`update bookings set status = 'COMPLETED' where id = $1`, [uj2])
await q(`update bookings set atvetel_at = now() - interval '11 days' where id = $1`, [uj2])
t.ok('a lejárt oldalú foglalás nem jön', 2, (await keres({ rendszam: 'KER-101', telefon: '+36 30 555 1212' })).length)

console.log('\n=== 4) Bérletes foglalás a megadott telefonszámmal ===\n')
await ki(TULAJ)
const be = await egy(`select berlet_foglalas('berletdemo2026kovacspeter', $1::jsonb) x`,
  [kerelem({ customer_name: 'Kovács Péter', customer_phone: '+36 20 111 9999', customer_email: 'kp@pelda.hu', plate_raw: 'BRL-777', service_date: napok[2] })])
const bTok = await tok(be.x.id)
t.ok('a kártyán más a telefonszám, mégis megtalálja a megadottal', bTok,
  (await keres({ rendszam: 'BRL-777', telefon: '06 20 111 9999' }))[0]?.token)
t.ok('és a kártyán lévővel is', bTok,
  (await keres({ rendszam: 'BRL-777', telefon: (await egy(`select phone from customers where name = 'Kovács Péter'`)).phone }))[0]?.token)

console.log('\n=== 5) Védelem a találgatás ellen ===\n')
await torolNaplo()
for (let i = 0; i < 5; i++) await keres({ rendszam: 'AABB-123', telefon: `+36 70 000 00${10 + i}` })
t.ok('öt rossz próba után ezzel a rendszámmal a jó adat sem megy', true,
  /Túl sok sikertelen próbálkozás/.test(await hiba(() => keres({ rendszam: 'AABB-123', telefon: '+36 70 244 1100' })) ?? ''))
t.ok('más rendszám és telefon közben működik', 2, (await keres({ rendszam: 'KER-101', email: 'klara@pelda.hu' })).length)
const naplo = await q(`select kulcsok from foglalas_kereses_naplo`)
t.ok('a napló nem tárol olvasható adatot', false, JSON.stringify(naplo).includes('AABB'))
await torolNaplo()
for (let i = 0; i < 5; i++) await keres({ email: `x${i}@pelda.hu`, telefon: '+36 70 244 1100' })
t.ok('a telefonszámra is él a korlát', true,
  /Túl sok/.test(await hiba(() => keres({ rendszam: 'AABB-123', telefon: '+36 70 244 1100' })) ?? ''))
await torolNaplo()
t.ok('a sikeres keresés nem számít', 1, ((await Promise.all([1, 2, 3, 4, 5, 6].map(() => keres({ rendszam: 'AABB-123', telefon: '+36 70 244 1100' })))).at(-1)).length)

console.log('\n=== 6) Jogosultság ===\n')
t.ok('anon hívhatja a keresést, a naplót nem látja', [true, false],
  [(await egy(`select has_function_privilege('anon', 'public.foglalas_kereses(jsonb)', 'EXECUTE') a`)).a,
   (await egy(`select has_table_privilege('anon', 'public.foglalas_kereses_naplo', 'select') a`)).a])
t.ok('a belső függvények kívülről nem hívhatók', [false, false],
  [(await egy(`select has_function_privilege('anon', 'public.online_email_ellenor(jsonb)', 'EXECUTE') a`)).a,
   (await egy(`select has_function_privilege('anon', 'public.berlet_foglalas_alap(text, jsonb)', 'EXECUTE') a`)).a])
t.ok('túl hosszú adat: hiba', true, /túl hosszú/.test(await hiba(() => keres({ rendszam: 'A'.repeat(20), telefon: '1' })) ?? ''))

t.vege()
