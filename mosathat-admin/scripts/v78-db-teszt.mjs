import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p = []) => (await db.query(s, p)).rows
const egy = async (s, p = []) => (await q(s, p))[0]
const hiba = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }
const anon = async () => q(`select set_config('app.uid', '', false)`)
const tulaj = async () => q(`select set_config('app.uid', $1, false)`, [TULAJ])

const holnap = (await egy(`select ((now() at time zone 'Europe/Budapest')::date + 1)::text d`)).d
let nap = holnap
while (!(await egy(`select public.munkanap($1::date) m`, [nap])).m) nap = (await egy(`select ($1::date + 1)::text d`, [nap])).d
const P = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))

console.log('=== 1) Jogosultságok ===\n')
for (const f of ['publikus_nap(date)', 'publikus_ajanlat(jsonb)', 'publikus_foglalas(jsonb)', 'publikus_oldal()']) {
  t.ok(`${f}: belépés nélkül hívható`, true, (await egy(`select has_function_privilege('anon', 'public.${f}', 'execute') a`)).a)
}
for (const f of ['online_foglalas(jsonb)', 'day_bookings(date)', 'quote_booking(jsonb)']) {
  t.ok(`${f}: továbbra is csak belépve`, false, (await egy(`select has_function_privilege('anon', 'public.${f}', 'execute') a`)).a)
}

console.log('\n=== 2) Napi foglaltság: csak időadat ===\n')
await anon()
const ma = (await egy(`select ((now() at time zone 'Europe/Budapest')::date + case when extract(isodow from now() at time zone 'Europe/Budapest') = 7 then 1 else 0 end)::text d`)).d
const n = (await egy(`select publikus_nap($1::date) x`, [ma])).x
t.ok('van foglalás és sáv a mai (vasárnap a holnapi) napra', [true, true], [n.foglalasok.length > 0, n.savok.length > 0])
const kulcsok = [...new Set(n.foglalasok.flatMap((f) => Object.keys(f)))].sort()
t.ok('csak a beosztáshoz kellő mezők, nincs név, telefon, rendszám, ár', [
  'befejezve', 'booking_type', 'deadline_at', 'drop_off_at', 'id', 'kezdve', 'last_day', 'napi_perc', 'not_fitted',
  'pick_up_at', 'planned_duration_minutes', 'rest_minutes', 'service_date', 'start_at', 'status', 'tentative'], kulcsok)
const valodi = (await q(`select id::text from bookings`)).map((r) => r.id)
t.ok('az azonosító sem a valódi foglalás-azonosító', false, n.foglalasok.some((f) => valodi.includes(f.id)))
t.ok('múltbeli nap: üres', 0, (await egy(`select jsonb_array_length(publikus_nap(current_date - 1)->'foglalasok') n`)).n)
t.ok('túl távoli nap: üres', 0, (await egy(`select jsonb_array_length(publikus_nap(current_date + 100)->'savok') n`)).n)

console.log('\n=== 3) Árajánlat ===\n')
const aj = (await egy(`select publikus_ajanlat($1) x`, [JSON.stringify({
  package_id: P.PREMIUM, category: 'SUV', scope: 'TELJES', booking_type: 'LEADOS', service_date: nap, extras: [] })])).x
t.ok('SUV Premium teljes: 17 800 Ft', 17800, Number(aj.price_huf))
const aj2 = (await egy(`select publikus_ajanlat($1) x`, [JSON.stringify({
  package_id: P.PREMIUM, category: 'SUV', scope: 'TELJES', booking_type: 'LEADOS', service_date: nap, extras: [],
  surcharge_pct: 50, surcharge_fix: 99999, company_id: '00000000-0000-0000-0000-000000000000' })])).x
t.ok('felár, cég, szerződés kívülről nem állítható', 17800, Number(aj2.price_huf))

console.log('\n=== 4) Foglalási kérés ===\n')
const alap = {
  category: 'SZEMELYAUTO', scope: 'TELJES', package_id: P.START, full_service: false, extras: [],
  booking_type: 'LEADOS', service_date: nap, drop_off_time: '09:00',
  customer_name: 'Teszt Elek', customer_phone: '+36 30 987 6543', customer_email: 'teszt@pelda.hu',
  plate_raw: 'TST-001', brand: 'Skoda', model: 'Octavia', notes: null,
}
const id = (await egy(`select publikus_foglalas($1) id`, [JSON.stringify(alap)])).id
const b = await egy(`select b.status::text, b.source::text, b.request_email, c.email, c.name
  from bookings b join customers c on c.id = b.customer_id where b.id = $1`, [id])
t.ok('új ügyfél: kérés REQUESTED állapotban, online, az e-mail a kérésen és az új ügyfélen', 
  { status: 'REQUESTED', source: 'ONLINE', request_email: 'teszt@pelda.hu', email: 'teszt@pelda.hu', name: 'Teszt Elek' },
  { status: b.status, source: b.source, request_email: b.request_email, email: b.email, name: b.name })

await tulaj()
const aldozat = await egy(`select c.id, c.name, c.phone, c.email from customers c where c.phone is not null and c.phone <> '—' order by c.created_at limit 1`)
await q(`update customers set email = 'eredeti@ugyfel.hu' where id = $1`, [aldozat.id])
const auto = await egy(`select v.id, v.plate_raw, v.brand, v.model, v.category::text from vehicles v where v.plate_raw <> '—' order by v.created_at limit 1`)
await anon()
const tamado = { ...alap, customer_name: 'Valaki Más', customer_phone: aldozat.phone, customer_email: 'tamado@rossz.hu',
  plate_raw: auto.plate_raw, brand: 'Lada', model: 'Niva', category: auto.category === 'KISBUSZ' ? 'SUV' : 'KISBUSZ' }
const id2 = (await egy(`select publikus_foglalas($1) id`, [JSON.stringify(tamado)])).id
const u = await egy(`select name, phone, email from customers where id = $1`, [aldozat.id])
t.ok('meglévő ügyfél neve, telefonja, e-mailje NEM íródik felül', { name: aldozat.name, phone: aldozat.phone, email: 'eredeti@ugyfel.hu' }, u)
const j = await egy(`select brand, model, category::text from vehicles where id = $1`, [auto.id])
t.ok('meglévő jármű adatai NEM íródnak felül', { brand: auto.brand, model: auto.model, category: auto.category }, j)
const b2 = await egy(`select request_email, internal_notes from bookings where id = $1`, [id2])
t.ok('a visszaigazolás a kérésben megadott címre menne', 'tamado@rossz.hu', b2.request_email)
t.ok('az eltérő név és jármű a belső megjegyzésbe kerül', [true, true],
  [/megadott név: Valaki Más/.test(b2.internal_notes ?? ''), /megadott jármű: Lada Niva/.test(b2.internal_notes ?? '')])

await tulaj()
await q(`select online_keres_dontes($1, true)`, [id2])
const ert = await egy(`select to_address from notifications where booking_id = $1`, [id2])
t.ok('elfogadáskor az értesítés a kérés e-mailjére megy, nem az ügyfélkártyára', 'tamado@rossz.hu', ert?.to_address)
const kerelem = await egy(`select ugyfel_email from v_online_kerelmek where id = $1`, [id])
t.ok('a kérések listájában a megadott e-mail látszik', 'teszt@pelda.hu', kerelem?.ugyfel_email)

console.log('\n=== 5) Visszaélés elleni védelem ===\n')
await anon()
t.ok('kitöltött rejtett mező (robot): elutasítva', true,
  /nem küldhető/.test(await hiba(() => q(`select publikus_foglalas($1)`, [JSON.stringify({ ...alap, weboldal: 'http://spam' })])) ?? ''))
t.ok('túl hosszú megjegyzés: elutasítva', true,
  /1000 karakter/.test(await hiba(() => q(`select publikus_foglalas($1)`, [JSON.stringify({ ...alap, notes: 'x'.repeat(1001) })])) ?? ''))
const tobb = { ...alap, customer_phone: '+36 70 999 8877', plate_raw: 'SPM-001' }
for (let i = 0; i < 3; i++) await q(`select publikus_foglalas($1)`, [JSON.stringify({ ...tobb, plate_raw: `SPM-00${i}` })])
t.ok('egy telefonszámról 24 órán belül legfeljebb 3 függő kérés', true,
  /több kérés vár/.test(await hiba(() => q(`select publikus_foglalas($1)`, [JSON.stringify(tobb)])) ?? ''))
const kintrol = { ...alap, status: 'CONFIRMED', source: 'ADMIN', surcharge_pct: 50, final_price_huf: 1, internal_notes: 'x' }
const id3 = (await egy(`select publikus_foglalas($1) id`, [JSON.stringify({ ...kintrol, customer_phone: '+36 20 555 4444', plate_raw: 'KIV-001' })])).id
await tulaj()
const b3 = await egy(`select b.status::text, b.source::text, b.final_price_huf,
  (select coalesce(sum(price_huf), 0)::int from booking_items where booking_id = b.id and kind = 'SURCHARGE') felar
  from bookings b where b.id = $1`, [id3])
t.ok('állapot, forrás, felár, végleges ár kívülről nem állítható', { status: 'REQUESTED', source: 'ONLINE', final_price_huf: null, felar: 0 }, b3)

await tulaj()
await q(`update bookings set created_at = now() - interval '2 hours' where public_request`)
await anon()
for (let i = 0; i < 30; i++) {
  await q(`select publikus_foglalas($1)`, [JSON.stringify({ ...alap, customer_phone: `+36 30 700 ${String(1000 + i)}`, plate_raw: `TOM-${100 + i}` })])
}
t.ok('óránként legfeljebb 30 nyilvános kérés összesen', true,
  /túl sok kérés/.test(await hiba(() => q(`select publikus_foglalas($1)`, [JSON.stringify({ ...alap, customer_phone: '+36 30 700 9999', plate_raw: 'TOM-999' })])) ?? ''))
await tulaj()
const belso = await hiba(() => q(`select online_foglalas($1)`, [JSON.stringify({ ...alap, customer_phone: '+36 30 700 8888', plate_raw: 'BEL-001', customer_email: null })]))
t.ok('a belépett dolgozó előnézete ettől függetlenül működik', null, belso)

await db.close()
t.vege()
