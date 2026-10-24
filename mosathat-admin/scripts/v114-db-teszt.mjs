import { join } from 'node:path'

import { adatbazis, tesztelo, GYOKER, TULAJ, ALK } from './_db.mjs'

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

const TOKEN = 'berletdemo2026kovacspeter'
const START = (await egy(`select id from packages where code = 'START'`)).id
const ELIT = (await egy(`select id from packages where code = 'ELIT'`)).id
const napok = (await q(`select d::date::text d from generate_series(public.budapest_ma() + 3, public.budapest_ma() + 50, interval '1 day') d
  where munkanap(d::date) and extract(isodow from d) < 6 order by d`)).map((r) => r.d)
const kov = (await egy(`select id, phone from customers where name = 'Kovács Péter'`))
const kerelem = (x = {}) => JSON.stringify({
  package_id: START, category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: napok[0],
  drop_off_time: '09:00', extras: [], customer_name: 'Kovács Péter', customer_phone: '+36 20 777 1234',
  customer_email: 'kovacs.uj@pelda.hu', plate_raw: 'KOV-901', ...x,
})

console.log('=== 1) A bérletes link oldala névtelenül ===\n')
await ki('')
const adat = (await szerepben('anon', () => egy(`select berlet_link_adat($1) x`, [TOKEN]))).x
t.ok('név és a bérlet tételei, maradék alkalmakkal', ['Kovács Péter', '10 alkalmas bérlet', [6, 2]],
  [adat.nev, adat.berletek[0].nev, adat.berletek[0].tetelek.map((x) => x.maradt)])
t.ok('a bérletből járó csomagok: Start és Premium', 2, adat.csomagok.length)
t.ok('ismeretlen kulcsra semmi', null, (await szerepben('anon', () => egy(`select berlet_link_adat($1) x`, ['x'.repeat(24)]))).x)

const aj = (await szerepben('anon', () => egy(`select berlet_ajanlat($1, $2::jsonb) x`, [TOKEN, kerelem()]))).x
t.ok('ajánlat: a Start bérletből, 0 Ft', [0, true], [aj.price_huf, Boolean(aj.berlet)])
t.ok('az ajánlatban nincs céges vagy szerződéses adat', [false, false], ['company_id' in aj, 'contract_prices' in aj])
const ajElit = (await szerepben('anon', () => egy(`select berlet_ajanlat($1, $2::jsonb) x`, [TOKEN, kerelem({ package_id: ELIT })]))).x
t.ok('a bérleten nem szereplő csomag listaáron', [true, null], [ajElit.price_huf > 0, ajElit.berlet])

console.log('\n=== 2) Foglalás a linkről ===\n')
const r = (await szerepben('anon', () => egy(`select berlet_foglalas($1, $2::jsonb) x`, [TOKEN, kerelem()]))).x
const f = await egy(`select b.customer_id, b.status::text, b.pass_item_id is not null fed, b.estimated_price_huf ar, b.berlet_link,
  b.request_email, b.internal_notes from bookings b where b.id = $1`, [r.id])
t.ok('a bérletes ügyfélhez kerül, akkor is, ha más telefonszámot írt', kov.id, f.customer_id)
t.ok('a bérletből megy, 0 Ft, linkről jelölve', [true, 0, true], [f.fed, f.ar, f.berlet_link])
t.ok('csendes napon azonnal visszaigazolt', [true, 'CONFIRMED'], [r.megerositve, f.status])
t.ok('a megadott telefonszám a belső jegyzetben', true, f.internal_notes.includes('+36 20 777 1234'))
t.ok('az ügyfél adatai nem íródtak felül', [kov.phone, 'Kovács Péter'],
  Object.values(await egy(`select phone, name from customers where id = $1`, [kov.id])))
t.ok('nem keletkezett új ügyfél a beírt számmal', 0, (await egy(`select count(*)::int n from customers where phone like '%777 1234%'`)).n)
t.ok('az e-mail a kéréshez kerül', 'kovacs.uj@pelda.hu', f.request_email)
t.ok('az új rendszám az ügyfél autója lett', kov.id, (await egy(`select customer_id from vehicles where plate_raw = 'KOV-901'`)).customer_id)
const utana = (await szerepben('anon', () => egy(`select berlet_link_adat($1) x`, [TOKEN]))).x
t.ok('a lefoglalt alkalom már nem látszik szabadnak', 5, utana.berletek[0].tetelek[0].maradt)

console.log('\n=== 3) E-mail és ügyféloldal: a csomag bérletből ===\n')
t.ok('a visszaigazoló levél adataiban jelölve', true, (await egy(`select foglalas_osszegzes($1) x`, [r.id])).x.berlet)
t.ok('az ügyféloldal képén jelölve', true, (await egy(`select foglalas_kep($1) x`, [r.id])).x.berlet)
t.ok('az ügyféloldal árában jelölve', true, (await egy(`select foglalasom_adat($1) x`, [r.id])).x.ar.berlet)
const sima = (await q(`select b.id from bookings b where b.pass_item_id is null and b.status = 'CONFIRMED' limit 1`))[0].id
t.ok('nem bérletes foglalásnál nincs jelölés', false, (await egy(`select foglalas_osszegzes($1) x`, [sima])).x.berlet)

console.log('\n=== 4) Korlátok és érvényesség ===\n')
for (let i = 1; i <= 5; i++) {
  await szerepben('anon', () => egy(`select berlet_foglalas($1, $2::jsonb) x`, [TOKEN, kerelem({
    service_date: napok[i], plate_raw: `KOV-91${i}`, package_id: ELIT })]))
}
await q(`update bookings set status = 'REQUESTED' where berlet_link and customer_id = $1`, [kov.id])
t.ok('24 órán belül legfeljebb öt függő kérés linkenként', true,
  /több kérés vár/.test(await hiba(() => szerepben('anon', () => egy(`select berlet_foglalas($1, $2::jsonb) x`, [TOKEN, kerelem({ service_date: napok[7], plate_raw: 'KOV-999' })]))) ?? ''))
await ki(TULAJ)
const pass = (await egy(`select id from passes where customer_id = $1`, [kov.id])).id
await q(`select deactivate_pass($1::uuid)`, [pass])
await ki('')
t.ok('kivezetett bérletnél a link érvénytelen', null, (await szerepben('anon', () => egy(`select berlet_link_adat($1) x`, [TOKEN]))).x)
t.ok('és foglalni sem enged', true,
  /nem érvényes/.test(await hiba(() => szerepben('anon', () => egy(`select berlet_foglalas($1, $2::jsonb) x`, [TOKEN, kerelem()]))) ?? ''))

console.log('\n=== 5) Link kezelése az adminban ===\n')
await ki(TULAJ)
await q(`select set_role_permission($1::jsonb)`, [JSON.stringify({ role: 'STAFF', can_edit_customers: false })])
await ki(ALK)
t.ok('ügyfél-jog nélkül nem készíthet linket', true,
  /jogosultság/.test(await hiba(() => szerepben('authenticated', () => q(`select berlet_link_uj($1::uuid)`, [kov.id]))) ?? ''))
await ki(TULAJ)
t.ok('érvényes bérlet nélkül nem készül link', true,
  /nincs érvényes bérlete/.test(await hiba(() => szerepben('authenticated', () => q(`select berlet_link_uj($1::uuid)`, [kov.id]))) ?? ''))
await q(`select create_pass($1::jsonb)`, [JSON.stringify({ customer_id: kov.id, name: 'Új bérlet', validity_kind: 'EV', validity_value: '1',
  items: [{ package_id: START, category: null, qty_total: 5 }] })])
const uj = (await szerepben('authenticated', () => egy(`select berlet_link_uj($1::uuid) k`, [kov.id]))).k
t.ok('új link: a régi megszűnik, az új él', [null, 'Kovács Péter'],
  [(await egy(`select berlet_link_adat($1) x`, [TOKEN])).x, (await egy(`select berlet_link_adat($1) x`, [uj])).x?.nev])
t.ok('a linkek listája', [kov.id], (await szerepben('authenticated', () => egy(`select berlet_linkek() x`))).x.map((x) => x.customer_id))

console.log('\n=== 6) Jogosultságok és a régi lemondó link ===\n')
t.ok('a belső függvények kívülről nem hívhatók', [false, false, false, false],
  Object.values(await egy(`select has_function_privilege('anon', 'public.berlet_link_ugyfel(text)', 'EXECUTE') a,
    has_function_privilege('authenticated', 'public.berlet_link_ugyfel(text)', 'EXECUTE') b,
    has_function_privilege('anon', 'public.berlet_aktiv(uuid)', 'EXECUTE') c,
    has_function_privilege('anon', 'public.berlet_linkek()', 'EXECUTE') d`)))
t.ok('a linkek táblája közvetlenül nem olvasható', [false, false],
  Object.values(await egy(`select has_table_privilege('anon', 'public.customer_booking_links', 'select') a,
    has_table_privilege('authenticated', 'public.customer_booking_links', 'select') b`)))
t.ok('a régi lemondó link táblája és függvényei törölve', [null, 0],
  Object.values(await egy(`select to_regclass('public.cancel_tokens')::text t,
    (select count(*)::int from pg_proc where proname in ('lemondas_allapot', 'lemondas_vegrehajt', 'lemondo_link_mentes', 'lemondo_token_hash')) n`)))
t.ok('az e-mail küldés sora továbbra is működik', null, await hiba(() => q(`select ertesitesek_atvetele(5)`)))

console.log('\n=== 7) Új ügyfél egyetlen adattal (Új bérletnél) ===\n')
await ki(TULAJ)
const uj1 = (await egy(`select add_customer($1::jsonb) id`, [JSON.stringify({ barmelyik: true, email: 'csak@email.hu' })])).id
t.ok('csak e-mail: Névtelen, telefon nélkül', ['Névtelen', '—', 'csak@email.hu'],
  Object.values(await egy(`select name, phone, email from customers where id = $1`, [uj1])))
const uj2 = (await egy(`select add_customer($1::jsonb) id`, [JSON.stringify({ barmelyik: true, company_name: 'Csak Cég Kft.' })])).id
t.ok('csak cég: a név a cég neve, céges ügyfél', ['Csak Cég Kft.', 'CEG'],
  Object.values(await egy(`select name, type::text from customers where id = $1`, [uj2])))
t.ok('semmi adat: hiba', true, /Legalább egy adatot/.test(await hiba(() => q(`select add_customer('{"barmelyik": true}'::jsonb)`)) ?? ''))
t.ok('foglalt rendszám: hiba a gazda nevével', true,
  /már Kovács Péter ügyfélhez tartozik/.test(await hiba(() => q(`select add_customer($1::jsonb)`, [JSON.stringify({ barmelyik: true, plate_raw: 'ABC-123' })])) ?? ''))
t.ok('a régi mód (Ügyfelek oldal) továbbra is kéri a nevet és a telefont', true,
  /név nem maradhat üresen/.test(await hiba(() => q(`select add_customer($1::jsonb)`, [JSON.stringify({ phone: '+36 1 999 0000' })])) ?? ''))

const keres = async (x) => (await q(`select name from list_customers($1)`, [x])).map((r) => r.name)
t.ok('ügyfélkeresés e-mail címre is', ['Névtelen'], await keres('csak@email'))
t.ok('ékezet nélkül és részletre is', true, (await keres('email.hu')).includes('Névtelen'))
t.ok('két betűre az e-mail még nem keres', false, (await keres('cs')).includes('Névtelen'))

console.log('\n=== 8) A levelek szövege ===\n')
{
  const { visszaigazolasLevel, keszLevel } = await import(join(GYOKER, 'supabase', 'functions', '_shared', 'sablon.ts'))
  const UZLET = { nev: 'Mosathat', telefon: '+36 1 506 0420', cim: '1138 Budapest, Váci út 140.' }
  const fog = (await egy(`select foglalas_osszegzes($1) x`, [r.id])).x
  const allapot = { allapot: 'LEMONDHATO', statusz: 'CONFIRMED', kezdes: '2030-01-01T08:00:00Z', hatarido: '2029-12-31T08:00:00Z',
    lemondas_ora: 24, lemondva: null, foglalas: fog }
  const l = visszaigazolasLevel('k@pelda.hu', allapot, 'https://x.hu/foglalas/a', UZLET, { most: new Date('2029-12-01T08:00:00Z') })
  t.ok('visszaigazolás: Becsült ár mellett, hogy bérletből megy', true, /Becsült ár: 0 Ft \(a csomag a bérletedből megy\)/.test(l.szoveg))
  const angol = visszaigazolasLevel('k@pelda.hu', allapot, 'https://x.hu/foglalas/a', UZLET, { most: new Date('2029-12-01T08:00:00Z'), nyelv: 'en' })
  t.ok('angolul is', true, angol.szoveg.includes('(the package is covered by your pass)'))
  const simaL = visszaigazolasLevel('k@pelda.hu', { ...allapot, foglalas: { ...fog, berlet: false, estimated_price_huf: 15600 } },
    'https://x.hu/foglalas/a', UZLET, { most: new Date('2029-12-01T08:00:00Z') })
  t.ok('nem bérletesnél nincs megjegyzés', false, simaL.szoveg.includes('bérlet'))
  const oldal = (await egy(`select foglalasom_adat($1) x`, [r.id])).x
  const kesz = keszLevel('k@pelda.hu', { ...oldal, most: { ...oldal.most, rendszam: 'KOV-901' },
    ar: { ...oldal.ar, vegleges: 0 } }, 'https://x.hu/foglalas/a', UZLET)
  t.ok('elkészült levél: Végösszeg mellett is', true, /Végösszeg: 0 Ft \(a csomag a bérletedből ment\)/.test(kesz.szoveg))
}

t.vege()
