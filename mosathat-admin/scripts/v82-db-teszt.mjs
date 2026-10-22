import { adatbazis, tesztelo, TULAJ, FEJL, ALK } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p = []) => (await db.query(s, p)).rows
const egy = async (s, p = []) => (await q(s, p))[0]
const hiba = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }
const ki = async (uid) => q(`select set_config('app.uid', $1, false)`, [uid])
const ment = (p) => q(`select publikus_tartalom_mentes($1)`, [JSON.stringify(p)])
const oldal = async () => (await egy(`select publikus_oldal() x`)).x

console.log('=== 1) Jogosultság ===\n')
t.ok('a mentés belépés nélkül nem hívható', false,
  (await egy(`select has_function_privilege('anon', 'public.publikus_tartalom_mentes(jsonb)', 'execute') a`)).a)
t.ok('a táblák közvetlenül nem olvashatók belépés nélkül', [false, false, false],
  [(await egy(`select has_table_privilege('anon', 'public.publikus_adatok', 'select') a`)).a,
   (await egy(`select has_table_privilege('anon', 'public.publikus_szovegek', 'select') a`)).a,
   (await egy(`select has_table_privilege('anon', 'public.publikus_kamerak', 'select') a`)).a])
await ki(ALK)
t.ok('alkalmazott nem módosíthat', true, /csak a tulajdonos és a fejlesztő/.test(await hiba(() => ment({ szovegek: { 'hero.felcim': 'X' } })) ?? ''))
await ki('')
t.ok('bejelentkezés nélkül sem', true, /csak a tulajdonos és a fejlesztő/.test(await hiba(() => ment({ szovegek: { 'hero.felcim': 'X' } })) ?? ''))

console.log('\n=== 2) Kiinduló állapot ===\n')
await ki('')
const o0 = await oldal()
t.ok('a publikus_oldal() új kulcsai', ['adatok', 'kamerak', 'leadas', 'nyitvatartas', 'szovegek'].map((k) => k in o0), [true, true, true, true, true])
t.ok('kezdetben nincs saját szöveg és kamera', [{}, []], [o0.szovegek, o0.kamerak])
t.ok('az adatok mezői üresek (az oldal az alapértékeket mutatja)', true, Object.values(o0.adatok).every((v) => v === null))
t.ok('a legkorábbi leadás a Beállításokból jön', '07:15', o0.leadas)
const h0 = o0.nyitvatartas[0]
t.ok('a nyitvatartás a Beállításokból jön, hétfő 09:00–17:00', [1, false, '09:00', '17:00'], [h0.weekday, h0.closed, h0.opens, h0.closes])

console.log('\n=== 3) Mentés tulajdonosként és fejlesztőként ===\n')
await ki(TULAJ)
await ment({
  adatok: { telefon: ' +36 1 999 0000 ', email: 'hello@pelda.hu', bejarat: 'Dagály utca felől', ceg_adoszam: '', jogi_tervezet: false, kamera_megorzes: '3 munkanapig' },
  szovegek: { 'hero.felcim': 'Új felcím', 'hero.cim': 'Első sor\n*Kiemelt* második' },
  kamerak: [{ hely: 'Bejárat', terulet: 'a beálló autók' }, { hely: 'Mosótér', terulet: 'a két mosóhely' }],
})
await ki('')
const o1 = await oldal()
t.ok('az adatok mentve, levágott szóközzel; üres szöveg = alapérték (null)',
  ['+36 1 999 0000', 'hello@pelda.hu', null, false, '3 munkanapig'],
  [o1.adatok.telefon, o1.adatok.email, o1.adatok.ceg_adoszam, o1.adatok.jogi_tervezet, o1.adatok.kamera_megorzes])
t.ok('a szövegek mentve, sortöréssel együtt', { 'hero.cim': 'Első sor\n*Kiemelt* második', 'hero.felcim': 'Új felcím' }, o1.szovegek)
t.ok('a kamerák sorrendben', [{ hely: 'Bejárat', hely_en: null, terulet: 'a beálló autók', terulet_en: null }, { hely: 'Mosótér', hely_en: null, terulet: 'a két mosóhely', terulet_en: null }], o1.kamerak)

await ki(FEJL)
await ment({ szovegek: { 'hero.felcim': '', 'menu.csomagok': 'Árak' }, adatok: { nev: 'Mosathat' } })
await ki('')
const o2 = await oldal()
t.ok('fejlesztő is menthet; üresre állítva visszaáll az alapra', { 'hero.cim': 'Első sor\n*Kiemelt* második', 'menu.csomagok': 'Árak' }, o2.szovegek)
t.ok('csak a küldött mezők változnak, a többi megmarad', ['Mosathat', '+36 1 999 0000'], [o2.adatok.nev, o2.adatok.telefon])
t.ok('a kamerák megmaradnak, ha a mentés nem küldi őket', 2, o2.kamerak.length)

console.log('\n=== 4) Ellenőrzések ===\n')
await ki(TULAJ)
t.ok('hibás e-mail cím', true, /formátuma/.test(await hiba(() => ment({ adatok: { email: 'nem-email' } })) ?? ''))
t.ok('érvénytelen kulcs', true, /Érvénytelen szövegkulcs/.test(await hiba(() => ment({ szovegek: { 'Rossz Kulcs!': 'x' } })) ?? ''))
t.ok('túl hosszú szöveg', true, /4000/.test(await hiba(() => ment({ szovegek: { 'hero.cim': 'x'.repeat(4001) } })) ?? ''))
t.ok('kamera hely nélkül', true, /helyét/.test(await hiba(() => ment({ kamerak: [{ hely: '', terulet: 'x' }] })) ?? ''))
t.ok('túl hosszú telefonszám', true, (await hiba(() => ment({ adatok: { telefon: '1'.repeat(41) } }))) !== null)
await ment({ kamerak: [] })
await ki('')
t.ok('a kameralista üríthető', [], (await oldal()).kamerak)

console.log('\n=== 5) A foglalási hibaüzenet a mentett telefonszámot mondja ===\n')
await ki(TULAJ)
await ment({ adatok: { telefon: '+36 1 222 3333' } })
await ki('')
const nap = (await egy(`select d::date::text d from generate_series((now() at time zone 'Europe/Budapest')::date + 3,
  (now() at time zone 'Europe/Budapest')::date + 20, interval '1 day') d where munkanap(d::date) and extract(isodow from d) < 6 order by d limit 1`)).d
const P = (await egy(`select id from packages where code = 'START'`)).id
const alap = {
  category: 'SZEMELYAUTO', scope: 'TELJES', package_id: P, full_service: false, extras: [],
  booking_type: 'LEADOS', service_date: nap, drop_off_time: '09:00',
  customer_name: 'Sok Kérés', customer_phone: '+36 30 444 5566', plate_raw: 'SOK-001',
}
for (let i = 0; i < 3; i++) await hiba(() => q(`select publikus_foglalas($1)`, [JSON.stringify(alap)]))
const uz = await hiba(() => q(`select publikus_foglalas($1)`, [JSON.stringify(alap)]))
t.ok('a korlát üzenete az új számot írja ki', true, /\+36 1 222 3333/.test(uz ?? ''))

t.vege()
