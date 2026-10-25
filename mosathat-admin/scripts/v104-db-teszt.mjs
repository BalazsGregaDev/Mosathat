import { adatbazis, tesztelo, TULAJ, ALK } from './_db.mjs'

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

const oldal = (token) => anonkent(async () => (await egy(`select foglalasom($1) x`, [token])).x)
const modosit = (token, uzenet) => anonkent(async () => (await egy(`select foglalasom_modositas($1, $2) x`, [token, uzenet])).x)
const lemond = (token) => anonkent(async () => (await egy(`select foglalasom_lemondas($1) x`, [token])).x)
const tokenje = async (id) => (await egy(`select token from booking_links where booking_id = $1`, [id])).token
const START = (await egy(`select id from packages where code = 'START'`)).id
const PREMIUM = (await egy(`select id from packages where code = 'PREMIUM'`)).id
const napok = (await q(`select d::date::text d from generate_series(
    (now() at time zone 'Europe/Budapest')::date + 5,
    (now() at time zone 'Europe/Budapest')::date + 40, interval '1 day') d
  where munkanap(d::date) and extract(isodow from d) < 6 order by d limit 6`)).map((r) => r.d)

let sorszam = 0
async function publikus(x = {}) {
  sorszam++
  return anonkent(async () => (await egy(`select publikus_foglalas($1) id`, [JSON.stringify({
    category: 'SZEMELYAUTO', scope: 'TELJES', package_id: START, booking_type: 'LEADOS', service_date: napok[0],
    drop_off_time: '09:00', customer_name: `Oldal Olga ${sorszam}`, customer_phone: `+36 30 800 ${String(1000 + sorszam)}`,
    customer_email: `olga${sorszam}@pelda.hu`, plate_raw: `OLD-${100 + sorszam}`, ...x })])).id)
}

console.log('=== 1) Minden foglalásnak van saját oldala ===\n')
await ki(TULAJ)
t.ok('minden demó foglaláshoz van link', 0,
  (await egy(`select count(*)::int n from bookings b where not exists (select 1 from booking_links l where l.booking_id = b.id)`)).n)
t.ok('a kulcsok 32 jegyű véletlen hexák', 0,
  (await egy(`select count(*)::int n from booking_links where token !~ '^[a-f0-9]{32}$'`)).n)
t.ok('ismeretlen kulcs', 'ISMERETLEN', (await oldal('0'.repeat(32))).allapot)
t.ok('hibás formátumú kulcs', 'ISMERETLEN', (await oldal('nem-jo')).allapot)
t.ok('névtelenül a link tábla nem olvasható', true,
  /permission denied/.test(await hiba(() => anonkent(() => q(`select * from booking_links`))) ?? ''))
t.ok('névtelenül a kérések listája nem hívható', true,
  /permission denied/.test(await hiba(() => anonkent(() => q(`select modositasi_kerelmek()`))) ?? ''))

console.log('\n=== 2) Online foglalás: nyelv, eredeti adatok ===\n')
const id1 = await publikus({ nyelv: 'en' })
await ki(TULAJ)
t.ok('angolul foglalt: a foglalás nyelve angol', 'en', (await egy(`select nyelv from bookings where id = $1`, [id1])).nyelv)
const tok1 = await tokenje(id1)
const o1 = await oldal(tok1)
t.ok('jóváhagyásra vár, angolul', ['KERES', 'en'], [o1.allapot, o1.nyelv])
t.ok('az eredeti és a mostani adat egyezik', true, JSON.stringify(o1.eredeti) === JSON.stringify(o1.most))
t.ok('a pillanatkép tartalma', ['09:00', 'Start', 'OLD101', 'LEADOS'], [o1.most.hozas, o1.most.csomag, o1.most.rendszam.replace('-', ''), o1.most.tipus])
t.ok('magánügyfél: van ár', true, o1.ar !== null && o1.ar.becsult > 0)
await ki(TULAJ)
await q(`select online_keres_dontes($1, true)`, [id1])
t.ok('elfogadva: visszaigazolva', 'VISSZAIGAZOLVA', (await oldal(tok1)).allapot)
t.ok('a visszaigazoló levél sorban', 1,
  (await egy(`select count(*)::int n from notifications where booking_id = $1 and kind = 'BOOKING_CONFIRMED'`, [id1])).n)
const id2 = await publikus()
await ki(TULAJ)
t.ok('magyarul foglalt (alapból)', 'hu', (await egy(`select nyelv from bookings where id = $1`, [id2])).nyelv)

console.log('\n=== 3) Módosítás az adminban: eredeti és új ===\n')
await ki(TULAJ)
await q(`select patch_booking($1, '{"drop_off_time":"08:00","package_id":"${PREMIUM}"}'::jsonb)`, [id1])
const o2 = await oldal(tok1)
t.ok('az eredeti hozás 9:00, az új 8:00', ['09:00', '08:00'], [o2.eredeti.hozas, o2.most.hozas])
t.ok('az eredeti csomag Start, az új Premium', ['Start', 'Premium'], [o2.eredeti.csomag, o2.most.csomag])
t.ok('az ár is változott', true, o2.most.ar > o2.eredeti.ar)

console.log('\n=== 4) Módosítási kérés az ügyféltől ===\n')
t.ok('túl rövid üzenet', true, /röviden/.test(await hiba(() => modosit(tok1, 'ok')) ?? ''))
const o3 = await modosit(tok1, 'Egy órával korábban hoznám, 7:00 körül.')
t.ok('a kérés megjelenik az oldalon, még nincs elintézve', [1, null], [o3.kerelmek.length, o3.kerelmek[0].elintezve])
await ki(TULAJ)
const lista = (await egy(`select modositasi_kerelmek() x`)).x
t.ok('a munkatársnál a várakozó kérések között', true, lista.some((k) => k.booking_id === id1 && k.kerelmek.length === 1))
await ki(ALK)
t.ok('alkalmazott is elintézheti', 1, (await egy(`select modositas_elintezve($1) n`, [id1])).n)
const o4 = await oldal(tok1)
t.ok('az oldalon: elintézve', true, o4.kerelmek[0].elintezve !== null)
await ki(TULAJ)
t.ok('a várakozó listából eltűnt', false, (await egy(`select modositasi_kerelmek() x`)).x.some((k) => k.booking_id === id1))
for (let i = 0; i < 4; i++) await modosit(tok1, `Újabb kérés ${i}`)
t.ok('napi 5 kérés után telefonra küld', true, /Ma már több módosítási kérést/.test(await hiba(() => modosit(tok1, 'Hatodik kérés')) ?? ''))

console.log('\n=== 5) Lemondás az oldalon ===\n')
const id3 = await publikus({ service_date: napok[1] })
await ki(TULAJ)
await q(`select online_keres_dontes($1, true)`, [id3])
const tok3 = await tokenje(id3)
t.ok('határidőn belül lemondható', true, (await oldal(tok3)).lemondhato)
const o5 = await lemond(tok3)
t.ok('lemondva', 'LEMONDVA', o5.allapot)
await ki(TULAJ)
t.ok('az adminban ügyfél mondta le', 'CANCELLED_BY_CUSTOMER', (await egy(`select status::text s from bookings where id = $1`, [id3])).s)
t.ok('másodszor már nem', true, /már nem mondható le/.test(await hiba(() => lemond(tok3)) ?? ''))
t.ok('lemondott foglaláshoz nem kérhető módosítás', true, /már nem kérhető módosítás/.test(await hiba(() => modosit(tok3, 'Mégis jönnék')) ?? ''))

console.log('\n=== 6) Kész van: végösszeg, felár indoka, e-mail ===\n')
await ki(TULAJ)
const id4 = await publikus({ service_date: napok[2], pick_up_time: '16:30' })
await ki(TULAJ)
await q(`select online_keres_dontes($1, true)`, [id4])
const tok4 = await tokenje(id4)
const becsult = (await egy(`select estimated_price_huf p from bookings where id = $1`, [id4])).p
t.ok('drágább végösszeg indok nélkül: hiba', true,
  /Írd be röviden az okát/.test(await hiba(() => q(`select booking_finish($1, '{}', $2)`, [id4, becsult + 3000])) ?? ''))
const fin = (await egy(`select booking_finish($1, '{}', $2, 'Erősen kutyaszőrös belső', true) x`, [id4, becsult + 3000])).x
t.ok('a végösszeg és az e-mail jelzés', [becsult + 3000, true], [fin.vegosszeg, fin.email])
const o6 = await oldal(tok4)
t.ok('az oldalon kész, a végösszeggel és az indokkal', ['KESZ', becsult + 3000, 'Erősen kutyaszőrös belső'],
  [o6.allapot, o6.ar.vegleges, o6.ar.felar_indok])
t.ok('átvehető legkésőbb a megbeszélt elvitelig (16:30)', '16:30',
  new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' }).format(new Date(o6.kesz_ig)))
await ki(TULAJ)
t.ok('az elkészült levél sorban', 1, (await egy(`select count(*)::int n from notifications where booking_id = $1 and kind = 'CAR_READY'`, [id4])).n)
const atvett = await q(`select x from ertesitesek_atvetele(50) x`)
const kesz = atvett.map((r) => r.x).find((x) => x.kind === 'CAR_READY' && x.oldal.most.rendszam === o6.most.rendszam)
t.ok('a küldő megkapja a linket és az oldal adatait', [tok4, 'hu', 'KESZ'], [kesz?.link, kesz?.nyelv, kesz?.oldal.allapot])
await q(`select set_booking_status($1, 'CONFIRMED', null, true)`, [id4])
t.ok('visszanyitva: az indok törlődik, az ár visszaáll', [null, null],
  Object.values(await egy(`select felar_indok, final_price_huf from bookings where id = $1`, [id4])))
await q(`select booking_finish($1, '{}', $2)`, [id4, becsult - 2000])
t.ok('olcsóbb végösszeghez nem kell indok', [becsult - 2000, null],
  Object.values(await egy(`select final_price_huf, felar_indok from bookings where id = $1`, [id4])))
await q(`select booking_finish($1, '{}')`, [id2]).catch(() => null)

console.log('\n=== 7) Megbeszélt idő nélkül: a nap zárása ===\n')
await ki(TULAJ)
const id5 = await publikus({ service_date: napok[3] })
await ki(TULAJ)
await q(`select online_keres_dontes($1, true)`, [id5])
await q(`select booking_finish($1, '{}')`, [id5])
const zaras = (await egy(`select to_char(nap_zaras($1::date), 'HH24:MI') z`, [napok[3]])).z
const o7 = await oldal(await tokenje(id5))
t.ok('legkésőbb a nap zárásáig', zaras,
  new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' }).format(new Date(o7.kesz_ig)))

console.log('\n=== 8) Átvette: köszönő oldal 10 napig ===\n')
await ki(TULAJ)
await q(`select set_booking_status($1, 'COMPLETED', null, true)`, [id5])
const o8 = await oldal(await tokenje(id5))
t.ok('átvéve', 'ATVEVE', o8.allapot)
t.ok('lejárat: az átvétel után 10 nap', 10, Math.round((new Date(o8.lejar) - new Date(o8.atveve)) / 86400000))
t.ok('átvett foglaláshoz nem kérhető módosítás', false, o8.modosithato)
await q(`update bookings set atvetel_at = now() - interval '11 days' where id = $1`, [id5])
const o9 = await oldal(await tokenje(id5))
t.ok('11 nap után lejárt, adatok nélkül', ['LEJART', undefined], [o9.allapot, o9.most])
await q(`update bookings set atvetel_at = now() - interval '9 days' where id = $1`, [id5])
t.ok('9 nap után még él', 'ATVEVE', (await oldal(await tokenje(id5))).allapot)
await q(`select booking_reopen($1)`, [id5]).catch(() => null)

console.log('\n=== 9) Lemondott, régi foglalás lejár ===\n')
await ki(TULAJ)
await q(`update bookings set service_date = (now() at time zone 'Europe/Budapest')::date - 12 where id = $1`, [id3])
t.ok('az eredeti időpont után 10 nappal lejárt', 'LEJART', (await oldal(tok3)).allapot)

console.log('\n=== 10) Céges foglalás: ár nélkül ===\n')
const ceg = await anonkent(async () => (await egy(`select ceg_foglalas($1, $2) x`, ['autotransdemo2026link', JSON.stringify({
  package_id: START, booking_type: 'LEADOS', service_date: napok[4], drop_off_time: '09:00',
  customer_name: 'Céges Cecil', customer_email: 'teszt@pelda.hu', customer_phone: '+36 30 800 9999', plate_raw: 'CGO-001', nyelv: 'en' })])).x)
await ki(TULAJ)
t.ok('céges link: angolul foglalt', 'en', (await egy(`select nyelv from bookings where id = $1`, [ceg.id])).nyelv)
const oc = await oldal(await tokenje(ceg.id))
t.ok('céges: nincs ár sehol', [true, null, false, false], [oc.ceges, oc.ar, 'ar' in oc.most, 'ar' in oc.eredeti])

console.log('\n=== 11) Nem fért be ===\n')
await ki(TULAJ)
const id6 = await publikus({ service_date: napok[5] })
await ki(TULAJ)
await q(`select online_keres_dontes($1, true)`, [id6])
await q(`select set_tentative($1, true)`, [id6]).catch(() => null)
await q(`select not_fitted($1)`, [id6]).catch(async () => {
  await q(`update bookings set not_fitted = true where id = $1`, [id6])
  await q(`select set_booking_status($1, 'COMPLETED', null, false)`, [id6])
})
t.ok('nem fért be állapot', 'NEM_FERT_BE', (await oldal(await tokenje(id6))).allapot)

console.log('\n=== 12) Google-értékelés linkje ===\n')
await ki(TULAJ)
await q(`select publikus_tartalom_mentes($1)`, [JSON.stringify({ adatok: { google_ertekeles: 'https://g.page/r/pelda/review' } })])
t.ok('elmentve, a publikus adatokban is', 'https://g.page/r/pelda/review',
  (await egy(`select publikus_oldal()->'adatok'->>'google_ertekeles' g`)).g)
t.ok('csak https link', true,
  /https:\/\//.test(await hiba(() => q(`select publikus_tartalom_mentes($1)`, [JSON.stringify({ adatok: { google_ertekeles: 'g.page/x' } })])) ?? ''))
await ki(ALK)
t.ok('alkalmazott nem módosíthatja', true,
  /tulajdonos/.test(await hiba(() => q(`select publikus_tartalom_mentes($1)`, [JSON.stringify({ adatok: { google_ertekeles: 'https://x.hu' } })])) ?? ''))

console.log('\n=== 13) Munkatárs: link kérése ===\n')
await ki(ALK)
t.ok('a munkalapról ugyanaz a link jön', tok1, (await egy(`select foglalas_link($1) t`, [id1])).t)
t.ok('névtelenül nem kérhető link', true,
  /permission denied/.test(await hiba(() => anonkent(() => q(`select foglalas_link($1)`, [id1]))) ?? ''))

t.vege()
