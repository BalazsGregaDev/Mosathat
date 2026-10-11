import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p = []) => (await db.query(s, p)).rows
const egy = async (s, p = []) => (await q(s, p))[0]
const hibaUzenet = async (fn) => {
  try { await fn(); return null } catch (e) { return e.message }
}
await q(`select set_config('app.uid', $1, false)`, [TULAJ])

const csomag = async (kod) => (await egy(`select id from packages where code = $1`, [kod])).id
const START = await csomag('START')
const PREMIUM = await csomag('PREMIUM')
const ELIT = await csomag('ELIT')

const elsoNap = async (napja) => (await egy(
  `select d::date::text d from generate_series(current_date + 1, current_date + 50, interval '1 day') d
    where extract(isodow from d) = $1 and munkanap(d::date) limit 1`, [napja])).d
const kovetkezoNyitott = async (nap) => (await egy(
  `select min(d)::date::text d from generate_series($1::date + 1, $1::date + 14, interval '1 day') d
    where munkanap(d::date)`, [nap])).d
const helyi = async (id) => egy(
  `select to_char(pick_up_at at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI') viszi,
          to_char(deadline_at at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI') hatarido,
          last_day::text utolso, scope::text, full_service, seat_material, status::text,
          estimated_price_huf ar, planned_duration_minutes perc, rest_minutes szarad
     from bookings where id = $1`, [id])
const fsTetel = async (id) => (await egy(
  `select name_snapshot n from booking_items where booking_id = $1 and kind = 'FULL_SERVICE'`, [id]))?.n ?? null
const fsFeladatok = async (id) => (await q(
  `select name from booking_tasks where booking_id = $1 and name like 'Full Service%' order by name`, [id])).map((r) => r.name)
const terhe = async (id, nap) => Number((await egy(
  `select foglalas_napi_terhe(b, $2::date) p from bookings b where b.id = $1`, [id, nap])).p)

const szerda = await elsoNap(3)
const pentek = await elsoNap(5)
const alap = {
  category: 'SZEMELYAUTO', scope: 'TELJES', package_id: PREMIUM, full_service: true, extras: [],
  booking_type: 'LEADOS', service_date: szerda, start_time: null, drop_off_time: '09:00',
  customer_name: 'Full Ferenc', customer_phone: '+36 30 555 0650', customer_email: null,
  plate_raw: 'FSV-650', brand: 'Skoda', model: 'Octavia', notes: null,
  seat_material: 'KARPIT', next_day_pick_up: true,
}
const kuld = async (x = {}) => (await egy(`select online_foglalas($1::jsonb) as id`, [JSON.stringify({ ...alap, ...x })])).id

console.log('=== 1) Csomag része: a mostani tartalomból feltöltve ===\n')
const extrak = await q(`select name, included_in_packages::text[] csomagok, included_in_full_service fs from extras order by sort_order`)
const nev = (n) => extrak.find((e) => e.name === n)
t.ok('a gumiápolás a Premium és az Elit része', [ELIT, PREMIUM].sort(), [...nev('Gumiápolás').csomagok].sort())
t.ok('más extra egyik csomagnak sem része', [],
  extrak.filter((e) => e.name !== 'Gumiápolás' && e.csomagok.length > 0).map((e) => e.name))
t.ok('a Full Service része: vizes kárpit és bőr', ['Vizes kárpittisztítás', 'Bőrtisztítás és ápolás'],
  extrak.filter((e) => e.fs).map((e) => e.name))
t.ok('a Start mellé semmi nincs bejelölve', false, extrak.some((e) => e.csomagok.includes(START)))

console.log('\n=== 2) Full Service kárpittal, másnapi elvitellel ===\n')
const elso = await kuld({ scope: 'KULSO' })
const csut = await kovetkezoNyitott(szerda)
const a = await helyi(elso)
t.ok('online kérés, Full Service, kárpit', ['REQUESTED', true, 'KARPIT'], [a.status, a.full_service, a.seat_material])
t.ok('a terjedelem mindig teljes', 'TELJES', a.scope)
t.ok('másnap 8:00-tól viheti, ez a határidő is', [`${csut} 08:00`, `${csut} 08:00`, csut], [a.viszi, a.hatarido, a.utolso])
t.ok('ár a Full Service ára, munka csomag + 45 perc, száradás 24 óra', [40000, 135, 1440], [a.ar, a.perc, a.szarad])
t.ok('a tétel neve az ülést is mondja', 'Full Service (Csomag+Kárpittisztítás)', await fsTetel(elso))
t.ok('a munkalapon is így szerepel', ['Full Service (Csomag+Kárpittisztítás)'], await fsFeladatok(elso))
t.ok('a munka a hozás napjára esik, másnap csak szárad', [135, 0], [await terhe(elso, szerda), await terhe(elso, csut)])
const keres = await egy(`select seat_material, full_service from v_online_kerelmek where id = $1`, [elso])
t.ok('a kérések listájában is látszik az ülés', ['KARPIT', true], [keres.seat_material, keres.full_service])

console.log('\n=== 3) Zárva tartó nap után a következő nyitvatartási napon viheti ===\n')
const zarasElott = (await egy(
  `select d::date::text d from generate_series(current_date + 1, current_date + 50, interval '1 day') d
    where munkanap(d::date) and not munkanap(d::date + 1) limit 1`)).d
const utana = await kovetkezoNyitott(zarasElott)
const zarasId = await kuld({ service_date: zarasElott, plate_raw: 'FSV-651', seat_material: 'KARPIT_BOR' })
const z = await helyi(zarasId)
t.ok('a zárva tartó napot átugorja', [`${utana} 08:00`, true],
  [z.viszi, utana > (await egy(`select ($1::date + 1)::text d`, [zarasElott])).d])
t.ok('kárpit-bőr tétel név', 'Full Service (Csomag+Kárpit- és bőrtisztítás)', await fsTetel(zarasId))
const kesoNyit = await kovetkezoNyitott(pentek)
await q(`select save_day_override($1::jsonb)`, [JSON.stringify({ day: kesoNyit, work_starts: '10:00', work_ends: '17:00' })])
const kesoId = await kuld({ service_date: pentek, plate_raw: 'FSV-659' })
t.ok('ha másnap később kezdünk, akkortól viheti', `${kesoNyit} 10:00`, (await helyi(kesoId)).viszi)
await q(`select delete_day_override($1::date)`, [kesoNyit])

console.log('\n=== 4) Bőr ülés, aznapi elvitel ===\n')
const bor = await kuld({ plate_raw: 'FSV-652', seat_material: 'BOR', next_day_pick_up: false })
const b = await helyi(bor)
t.ok('aznap viszi: nincs másnapi határidő', [null, null, szerda], [b.viszi, b.hatarido, b.utolso])
t.ok('bőr tétel név és munkalap', ['Full Service (Csomag+Bőrtisztítás)', ['Full Service (Csomag+Bőrtisztítás)']],
  [await fsTetel(bor), await fsFeladatok(bor)])
t.ok('az aznapi munka teljes egészében aznap', 135, await terhe(bor, szerda))

console.log('\n=== 5) Szabályok ===\n')
t.ok('Full Service-nél nem lehet megvárni', true, /itt kell hagyni/.test(await hibaUzenet(() =>
  kuld({ plate_raw: 'FSV-653', booking_type: 'VAROS', start_time: '09:00', drop_off_time: null })) ?? ''))
t.ok('az ülést meg kell adni', [true, true], [
  /milyen az ülés/.test(await hibaUzenet(() => kuld({ plate_raw: 'FSV-654', seat_material: null })) ?? ''),
  /milyen az ülés/.test(await hibaUzenet(() => kuld({ plate_raw: 'FSV-655', seat_material: 'SZOVET' })) ?? '')])
t.ok('kisbusznál a Full Service ára egyeztetés', true, /egyeztetni kell/.test(await hibaUzenet(() =>
  kuld({ plate_raw: 'FSV-656', category: 'KISBUSZ' })) ?? ''))
const sima = await kuld({ plate_raw: 'SIM-657', full_service: false, seat_material: 'BOR', next_day_pick_up: true,
  pick_up_date: csut, pick_up_time: '15:00' })
const s = await helyi(sima)
t.ok('Full Service nélkül a másnapi elvitel és az ülés nem számít, csak az aznapi határidő', [`${szerda} 15:00`, szerda, null, false],
  [s.viszi, s.utolso, s.seat_material, s.full_service])

console.log('\n=== 6) Szerkesztés és elfogadás után is megmarad ===\n')
await q(`select patch_booking($1, '{"notes": "Hátsó ülésen folt"}'::jsonb)`, [elso])
t.ok('admin módosítás után is kárpitos a tétel', ['Full Service (Csomag+Kárpittisztítás)', ['Full Service (Csomag+Kárpittisztítás)']],
  [await fsTetel(elso), await fsFeladatok(elso)])
t.ok('és a másnapi határidő is', `${csut} 08:00`, (await helyi(elso)).viszi)
t.ok('elfogadás', 'OK', (await egy(`select online_keres_dontes($1, true) as r`, [elso])).r)
t.ok('visszaigazolva, az ülés megmaradt', ['CONFIRMED', 'KARPIT'], [(await helyi(elso)).status, (await helyi(elso)).seat_material])

console.log('\n=== 7) A nyitvatartási nap ugyanaz a felületnek és az adatbázisnak ===\n')
const elteres = await q(
  `select d::date::text d from generate_series(current_date, current_date + 60, interval '1 day') d
    where munkanap(d::date) <> exists (select 1 from day_lanes(d::date))`)
t.ok('ahol munkanap, ott van sáv, és fordítva', [], elteres.map((r) => r.d))

await db.close()
t.vege()
