import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p = []) => (await db.query(s, p)).rows
const egy = async (s, p = []) => (await q(s, p))[0]
const hibaUzenet = async (fn) => {
  try { await fn(); return null } catch (e) { return e.message }
}
await q(`select set_config('app.uid', $1, false)`, [TULAJ])

const PREMIUM = (await egy(`select id from packages where code = 'PREMIUM'`)).id
const nap = (await egy(
  `select d::date::text d from generate_series(public.budapest_ma() + 1, public.budapest_ma() + 50, interval '1 day') d
    where extract(isodow from d) = 3 and munkanap(d::date) limit 1`)).d
const alap = {
  category: 'SZEMELYAUTO', scope: 'TELJES', package_id: PREMIUM, full_service: false, extras: [],
  booking_type: 'LEADOS', service_date: nap, start_time: null, drop_off_time: '09:00',
  customer_name: 'Határidő Hanna', customer_phone: '+36 30 555 0660', customer_email: null,
  plate_raw: 'HAT-660', brand: null, model: null, notes: null,
  seat_material: null, next_day_pick_up: false, pick_up_time: '13:00',
}
const kuld = async (x = {}) => (await egy(`select online_foglalas($1::jsonb) as id`, [JSON.stringify({ ...alap, ...x })])).id
const helyi = async (id) => egy(
  `select to_char(pick_up_at at time zone 'Europe/Budapest', 'YYYY-MM-DD HH24:MI') viszi,
          deadline_at, last_day::text utolso, planned_duration_minutes perc
     from bookings where id = $1`, [id])

console.log('=== 1) Itt hagyja, választott határidővel ===\n')
const elso = await kuld()
const a = await helyi(elso)
t.ok('a határidő aznap 13:00, nem többnapos', [`${nap} 13:00`, null, nap], [a.viszi, a.deadline_at, a.utolso])
const lista = await egy(`select to_char(pick_up_at at time zone 'Europe/Budapest', 'HH24:MI') v from v_online_kerelmek where id = $1`, [elso])
t.ok('a kérések listájában is ott van', '13:00', lista.v)
t.ok('határidő nélkül zárásig', null, (await helyi(await kuld({ plate_raw: 'HAT-661', pick_up_time: null }))).viszi)

console.log('\n=== 2) Szabályok ===\n')
t.ok('17:00 után nem lehet', true,
  /legkésőbb 17:00/.test(await hibaUzenet(() => kuld({ plate_raw: 'HAT-662', pick_up_time: '17:30' })) ?? ''))
t.ok('a munkaidő vége előtt nem lehet (9:00 + 1 óra 30 perc)', true,
  /túl korai.+10:30/.test(await hibaUzenet(() => kuld({ plate_raw: 'HAT-663', pick_up_time: '10:00' })) ?? ''))
t.ok('a pontos munkaidő vége még jó', `${nap} 10:30`, (await helyi(await kuld({ plate_raw: 'HAT-664', pick_up_time: '10:30' }))).viszi)
t.ok('a sikertelen kérésből nem marad foglalás', 0,
  Number((await egy(`select count(*) c from vehicles v join bookings b on b.vehicle_id = v.id
                      where v.plate_normalized in ('HAT662', 'HAT663')`)).c))
const varos = await kuld({ plate_raw: 'HAT-665', booking_type: 'VAROS', start_time: '09:00', drop_off_time: null })
t.ok('megvárós foglalásnál nem számít', null, (await helyi(varos)).viszi)

console.log('\n=== 3) Full Service ===\n')
const fsAznap = await kuld({ plate_raw: 'HAT-666', full_service: true, seat_material: 'BOR', pick_up_time: '14:00' })
t.ok('aznapi elvitelnél választható', `${nap} 14:00`, (await helyi(fsAznap)).viszi)
const fsMasnap = await kuld({ plate_raw: 'HAT-667', full_service: true, seat_material: 'KARPIT', next_day_pick_up: true,
  pick_up_time: '15:00' })
const m = await helyi(fsMasnap)
t.ok('másnapinál a beküldött idő nem számít, reggeltől viheti', true, m.viszi > nap && m.viszi.endsWith('08:00'))

await db.close()
t.vege()
