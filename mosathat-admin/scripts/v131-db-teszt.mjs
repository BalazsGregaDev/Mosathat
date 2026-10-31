import { adatbazis, ALK, TULAJ, tesztelo } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p = []) => (await db.query(s, p)).rows
const hiba = async (s, p = []) => {
  try { await db.query(s, p); return null } catch (e) { return e.message }
}
const ip = (cim) => db.exec(`select set_config('request.headers', '${cim ? JSON.stringify({ 'x-forwarded-for': `${cim}, 10.0.0.1` }) : ''}', false)`)
const mint = (uid) => db.exec(`select set_config('app.uid', '${uid}', false)`)
const foglalasDb = async () => (await q(`select count(*)::int n from public.bookings where public_request`))[0].n

const [{ id: csomag }] = await q(`select id from public.packages where code = 'PREMIUM'`)
const [{ d: nap }] = await q(`select d::date::text d from generate_series(public.budapest_ma() + 1, public.budapest_ma() + 40, interval '1 day') d
  where public.munkanap(d::date) and extract(isodow from d) < 6
    and not exists (select 1 from public.bookings b where b.service_date = d::date) order by d limit 1`)
let n = 0
const adat = (x = {}) => {
  n++
  return {
    category: 'SZEMELYAUTO', scope: 'TELJES', package_id: csomag, booking_type: 'LEADOS', service_date: nap,
    drop_off_time: '09:00', customer_name: 'Próba Pál', customer_phone: `+36 30 555 ${String(1000 + n)}`,
    customer_email: `pal${n}@pelda.hu`, plate_raw: `VED-${String(100 + n)}`, brand: 'Skoda', model: 'Octavia', ...x,
  }
}
const foglal = (x) => q(`select public.publikus_foglalas($1::jsonb) id`, [JSON.stringify(adat(x))])

console.log('=== 1) Láthatatlan mező ===\n')
let elotte = await foglalasDb()
const [{ id: alId }] = await foglal({ weboldal: 'http://spam.example', ido: 9000 })
t.ok('kitöltött mezőre „sikeres” választ kap (azonosítót)', true, /^[0-9a-f-]{36}$/.test(alId))
t.ok('de foglalás nem jön létre', elotte, await foglalasDb())
t.ok('a foglalások között sincs ilyen azonosító', 0, (await q(`select count(*)::int n from public.bookings where id = $1`, [alId]))[0].n)
const [naplo] = await q(`select hol, bot from public.vedelem_naplo order by id desc limit 1`)
t.ok('naplózva botként', { hol: 'FOGLALAS', bot: 'MEZO' }, naplo)

console.log('\n=== 2) Időzár ===\n')
elotte = await foglalasDb()
await foglal({ ido: 1200 })
t.ok('3 másodpercen belül elküldve: nem jön létre', elotte, await foglalasDb())
t.ok('naplózva gyorsként', 'GYORS', (await q(`select bot from public.vedelem_naplo order by id desc limit 1`))[0].bot)
await foglal({ ido: 45000 })
t.ok('emberi tempóval elküldve: létrejön', elotte + 1, await foglalasDb())
await foglal({})
t.ok('régi, nyitva hagyott oldalról (idő nélkül) is létrejön', elotte + 2, await foglalasDb())
const [{ x: mezok }] = await q(`select to_jsonb(b) x from public.bookings b where b.public_request order by b.created_at desc limit 1`)
t.ok('a segédmezők nem kerülnek a foglalásba', false, JSON.stringify(mezok).includes('"ido"'))
t.ok('az eddigi ellenőrzések továbbra is működnek', true, /neved/.test(await hiba(`select public.publikus_foglalas($1::jsonb)`, [JSON.stringify(adat({ customer_name: '', ido: 9000 }))])))

console.log('\n=== 3) IP-cím szerinti korlát ===\n')
await ip('203.0.113.7')
const egyIp = []
for (let i = 0; i < 5; i++) egyIp.push(await hiba(`select public.publikus_foglalas($1::jsonb)`, [JSON.stringify(adat({ ido: 9000 }))]))
t.ok('egy címről óránként 5 foglalás mehet', [null, null, null, null, null], egyIp)
t.ok('a 6. már nem', true, /hálózatról most túl sok/.test(await hiba(`select public.publikus_foglalas($1::jsonb)`, [JSON.stringify(adat({ ido: 9000 }))])))
t.ok('a tiltott próbálkozás nem kerül a naplóba', 5, (await q(`select count(*)::int n from public.vedelem_naplo where ip is not null and hol = 'FOGLALAS'`))[0].n)
await ip('192.0.2.50')
for (let i = 0; i < 8; i++) await hiba(`select public.publikus_foglalas($1::jsonb)`, [JSON.stringify(adat({ customer_name: '', ido: 9000 }))])
const utana = []
for (let i = 0; i < 5; i++) utana.push(await hiba(`select public.publikus_foglalas($1::jsonb)`, [JSON.stringify(adat({ ido: 9000 }))]))
t.ok('hibás kitöltések nem fogyasztják a keretet (8 hibás után is mehet 5)', [null, null, null, null, null], utana)
await ip('198.51.100.20')
t.ok('másik címről mehet', null, await hiba(`select public.publikus_foglalas($1::jsonb)`, [JSON.stringify(adat({ ido: 9000 }))]))
const [{ x: tarolt }] = await q(`select string_agg(distinct ip, ',') x from public.vedelem_naplo where ip is not null`)
t.ok('az IP-cím nem olvasható formában tárolódik', false, tarolt.includes('203.0.113.7') || tarolt.includes('198.51.100.20'))
await q(`update public.vedelem_naplo set at = now() - interval '3 days' where ip is not null`)
await ip('203.0.113.7')
t.ok('régi próbálkozások után újra mehet', null, await hiba(`select public.publikus_foglalas($1::jsonb)`, [JSON.stringify(adat({ ido: 9000 }))]))
t.ok('2 napnál régebbi sorokból az IP törlődik', 0, (await q(`select count(*)::int n from public.vedelem_naplo where ip is not null and at < now() - interval '2 days'`))[0].n)
await ip(null)

console.log('\n=== 4) Céges, bérletes foglalás és foglaláskereső ===\n')
const [{ x: cegAl }] = await q(`select public.ceg_foglalas('rossz', $1::jsonb) x`, [JSON.stringify(adat({ weboldal: 'x' }))])
t.ok('céges: bot ál-sikert kap', [true, false], [/^[0-9a-f-]{36}$/.test(cegAl.id), cegAl.megerositve])
t.ok('céges: emberként továbbmegy a rendes ellenőrzésre', true, /nem érvényes/.test(await hiba(`select public.ceg_foglalas('rossz', $1::jsonb)`, [JSON.stringify(adat({ ido: 9000 }))])))
const [{ x: berletAl }] = await q(`select public.berlet_foglalas('rossz', $1::jsonb) x`, [JSON.stringify(adat({ ido: 500 }))])
t.ok('bérletes: gyors bot ál-sikert kap', false, berletAl.megerositve)
t.ok('bérletes: emberként továbbmegy', true, /nem érvényes/.test(await hiba(`select public.berlet_foglalas('rossz', $1::jsonb)`, [JSON.stringify(adat({ ido: 9000 }))])))
const [{ x: keresAl }] = await q(`select public.foglalas_kereses($1::jsonb) x`, [JSON.stringify({ rendszam: 'VED-101', telefon: '+36 30 555 1001', weboldal: 'x' })])
t.ok('kereső: bot üres találatot kap', [], keresAl)
t.ok('kereső: emberként a rendes ellenőrzés fut', true, /legalább két adatot/.test(await hiba(`select public.foglalas_kereses($1::jsonb)`, [JSON.stringify({ rendszam: 'X', ido: 5000 })])))

console.log('\n=== 5) Statisztika és jogosultság ===\n')
await mint(TULAJ)
const [{ x: stat }] = await q(`select public.vedelem_statisztika() x`)
t.ok('a tulajdonos látja a kiszűrt próbálkozások számát', true, stat.bot_7nap >= 5)
await mint(ALK)
t.ok('alkalmazott nem', true, /tulajdonos/.test(await hiba(`select public.vedelem_statisztika()`)))
await db.exec(`set role anon`)
t.ok('belépés nélkül a napló nem olvasható', true, /permission denied/.test(await hiba(`select * from public.vedelem_naplo`)))
t.ok('belépés nélkül a kapu közvetlenül nem hívható', true, /permission denied/.test(await hiba(`select public.vedelem_kapu('FOGLALAS', '{}', 0, 99, 99)`)))
t.ok('a régi függvény közvetlenül nem hívható (nem kerülhető meg a védelem)', true,
  /permission denied/.test(await hiba(`select public.publikus_foglalas_v130('{}')`)))
await db.exec(`reset role`)

t.vege()
