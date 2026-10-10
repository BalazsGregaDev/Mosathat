import { adatbazis, tesztelo, ALK } from './_db.mjs'

const db = await adatbazis()
const t = tesztelo()
const q = async (sql, p = []) => (await db.query(sql, p)).rows
const egy = async (sql, p = []) => (await q(sql, p))[0]
const belep = (id) => db.exec(`select set_config('app.uid','${id}',false)`)
const csomag = Object.fromEntries((await q(`select code, id from packages`)).map((r) => [r.code, r.id]))
const extra = Object.fromEntries((await q(`select name, id from extras`)).map((r) => [r.name, r.id]))
const ma = (await egy(`select current_date::text d`)).d

await belep(ALK)
async function uj(rendszam, extras = [], scope = 'TELJES') {
  return (await egy(`select create_booking($1::jsonb) as id`, [JSON.stringify({
    category: 'SZEMELYAUTO', scope, booking_type: 'LEADOS', service_date: ma, drop_off_time: '09:00',
    package_id: csomag.PREMIUM, extras, customer_name: 'Kész Károly', customer_phone: '+36301239999',
    plate_raw: rendszam })])).id
}
const pontok = async (id) => q(`select id, name, area, source::text, done from booking_tasks where booking_id = $1 order by sort_order, name`, [id])
const ar = async (id) => (await egy(`select final_price_huf f, estimated_price_huf e from bookings where id = $1`, [id]))
const listaAr = async (scope) => Number((await egy(
  `select sum(price_huf) s from foglalas_tetelek($1, 'SZEMELYAUTO', $2, false, '[]'::jsonb, 0, 0, null, null, 'LEADOS', $3::date) where kind = 'PACKAGE'`,
  [csomag.PREMIUM, scope, ma])).s)

console.log('=== Minden kész: nincs változás ===\n')
const a = await uj('KSZ-001', [{ extra_id: extra['Vizes kárpittisztítás'], quantity: 1 }])
await q(`select set_booking_status($1, 'ARRIVED')`, [a])
const pa = await pontok(a)
const elo = await egy(`select booking_finish_preview($1, $2::uuid[]) p`, [a, pa.map((x) => x.id)])
t.ok('előnézet: nincs kimaradt', [0, null], [elo.p.skip_huf, elo.p.skip_note])
const eredeti = (await ar(a)).e
await q(`select booking_finish($1, $2::uuid[])`, [a, pa.map((x) => x.id)])
t.ok('kész, minden kipipálva, ár változatlan', ['READY', pa.length, null],
  [(await egy(`select status from bookings where id=$1`, [a])).status,
   (await pontok(a)).filter((x) => x.done).length, (await ar(a)).f])

console.log('\n=== Extra kimarad: a saját árával esik ki ===\n')
const b = await uj('KSZ-002', [{ extra_id: extra['Vizes kárpittisztítás'], quantity: 1 }])
await q(`select set_booking_status($1, 'ARRIVED')`, [b])
const pb = await pontok(b)
const extraPont = pb.find((x) => x.source === 'EXTRA')
t.ok('van extra pont', true, !!extraPont)
const pipalt = pb.filter((x) => x.source !== 'EXTRA').map((x) => x.id)
const eb = (await egy(`select booking_finish($1, $2::uuid[]) p`, [b, pipalt])).p
t.ok('az extra ára jön le', 6500, eb.skip_huf)
t.ok('végleges ár = becsült − extra', (await ar(b)).e - 6500, (await ar(b)).f)
t.ok('a foglalás tételei nem változtak', true,
  (await q(`select 1 from booking_items where booking_id=$1 and kind='EXTRA'`, [b])).length === 1)
t.ok('a kimaradt pont üresen maradt', false, (await pontok(b)).find((x) => x.id === extraPont.id).done)
t.ok('a nap nézetben látszik', ['Vizes kárpittisztítás', 6500],
  Object.values(await egy(`select skip_note, skip_huf from v_day_bookings where id=$1`, [b])))

console.log('\n=== Belső terület egészében kimarad: Csak kívül ár ===\n')
const c = await uj('KSZ-003')
await q(`select set_booking_status($1, 'ARRIVED')`, [c])
const pc = await pontok(c)
const kulso = pc.filter((x) => x.area === 'KULSO').map((x) => x.id)
const ec = (await egy(`select booking_finish($1, $2::uuid[]) p`, [c, kulso])).p
t.ok('különbség = teljes − csak kívül', (await listaAr('TELJES')) - (await listaAr('KULSO')), ec.skip_huf)
t.ok('megjegyzés', 'Belső terület', ec.skip_note)
t.ok('a foglalás terjedelme nem változott', 'TELJES', (await egy(`select scope from bookings where id=$1`, [c])).scope)

console.log('\n=== Csak néhány belső pont marad ki: az ár marad ===\n')
const d = await uj('KSZ-004')
await q(`select set_booking_status($1, 'ARRIVED')`, [d])
const pd = await pontok(d)
const egyBelsoKi = pd.filter((x) => x.area === 'BELSO')[0].id
const ed = (await egy(`select booking_finish($1, $2::uuid[]) p`, [d, pd.filter((x) => x.id !== egyBelsoKi).map((x) => x.id)])).p
t.ok('nincs árcsökkenés', 0, ed.skip_huf)
t.ok('végleges ár nem íródott át', null, (await ar(d)).f)

console.log('\n=== Mindkét terület kimarad: a csomag ára kiesik ===\n')
const e = await uj('KSZ-005', [{ extra_id: extra['Külső műanyagápolás'], quantity: 1 }])
await q(`select set_booking_status($1, 'ARRIVED')`, [e])
const pe = await pontok(e)
const ee = (await egy(`select booking_finish($1, $2::uuid[]) p`, [e, pe.filter((x) => x.source === 'EXTRA').map((x) => x.id)])).p
t.ok('csak az extra marad', 3000, ee.adjusted)

console.log('\n=== Visszanyitás: ár és pipák vissza ===\n')
await q(`select set_booking_status($1, 'COMPLETED')`, [c])
const cElotte = (await ar(c)).f
t.ok('lezárás után az ár a csökkentett', (await ar(c)).e - ec.skip_huf, cElotte)
await q(`select booking_reopen($1)`, [c])
t.ok('visszanyitva: ár visszaállt, megjegyzés törölve', [null, null, null],
  Object.values(await egy(`select final_price_huf, skip_note, skip_huf from bookings where id=$1`, [c])))
t.ok('a most kipipált pontok pipája le', 0, (await pontok(c)).filter((x) => x.done).length)
t.ok('állapot: Megérkezett', 'ARRIVED', (await egy(`select status from bookings where id=$1`, [c])).status)

console.log('\n=== Kézzel adott végleges ár: abból vonunk le ===\n')
const f = await uj('KSZ-006', [{ extra_id: extra['Vizes kárpittisztítás'], quantity: 1 }])
await q(`select set_booking_status($1, 'ARRIVED')`, [f])
await q(`update bookings set final_price_huf = 50000 where id = $1`, [f])
const pf = await pontok(f)
await q(`select booking_finish($1, $2::uuid[])`, [f, pf.filter((x) => x.source !== 'EXTRA').map((x) => x.id)])
t.ok('50 000 − 6 500', 43500, (await ar(f)).f)
await q(`select booking_reopen($1)`, [f])
t.ok('visszanyitva: 50 000 újra', 50000, (await ar(f)).f)

console.log('\n=== A régi út (Átvette, léptető) továbbra is mindent pipál ===\n')
const g = await uj('KSZ-007')
await q(`select set_booking_status($1, 'COMPLETED')`, [g])
t.ok('mind kipipálva', true, (await pontok(g)).every((x) => x.done))
t.ok('eredeti ár (minden kész esetén) változatlan', eredeti, (await ar(a)).e)

t.vege()
