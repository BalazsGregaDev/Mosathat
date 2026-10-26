import { adatbazis, tesztelo, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
const egy = async (s, p) => (await q(s, p))[0]
const hiba = async (f) => { try { await f(); return null } catch (e) { return e.message } }
await q(`select set_config('app.uid', $1, false)`, [TULAJ])

const START = (await egy(`select id from packages where active order by sort_order limit 1`)).id
const napok = (await q(`select d::date::text d from generate_series(public.budapest_ma() + 1, public.budapest_ma() + 40, interval '1 day') d
                         where public.munkanap(d::date) and extract(isodow from d) < 6 order by d limit 4`)).map((r) => r.d)
const foglal = (x) => egy(`select create_booking($1::jsonb) id`, [JSON.stringify({
  category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', drop_off_time: '09:00',
  package_id: START, service_date: napok[0], extras: [], ...x,
})]).then((r) => r.id)
const tarsai = async (id) => (await egy(`select foglalas_tarsai($1) x`, [id])).x
const levalaszt = async (id, ids) => (await egy(`select foglalas_levalaszt($1, $2::uuid[]) x`, [id, ids])).x
const cegValt = (id, nev) => q(`select patch_booking($1, $2::jsonb)`, [id, JSON.stringify({ company_id: null, company_name: nev })])
const cege = async (id) => (await egy(`select c.company_name from bookings b join customers c on c.id = b.customer_id where b.id = $1`, [id])).company_name
const ugyfele = async (id) => (await egy(`select customer_id from bookings where id = $1`, [id])).customer_id

console.log('=== 1) Két autó ugyanannál az ügyfélnél: a cégváltás csak a kiválasztottat érinti ===\n')
const b1 = await foglal({ customer_name: 'Céges Csaba', customer_phone: '+36 30 126 0001', company_name: 'Alfa Trans Kft.', plate_raw: 'AAA-126' })
const b2 = await foglal({ customer_name: 'Céges Csaba', customer_phone: '+36 30 126 0001', company_name: 'Alfa Trans Kft.', plate_raw: 'BBB-126', service_date: napok[1] })
const b3 = await foglal({ customer_name: 'Céges Csaba', customer_phone: '+36 30 126 0001', plate_raw: 'BBB-126', service_date: napok[2] })
await q(`update bookings set status = 'COMPLETED' where id = $1`, [b3])
const tars = await tarsai(b1)
t.ok('a társ foglalások: csak a másik aktív, rendszámmal, nem ugyanaz az autó', [[b2], ['BBB-126'], [false]],
  [tars.map((x) => x.id), tars.map((x) => x.plate_raw), tars.map((x) => x.ugyanaz_auto)])
const regi = await ugyfele(b1)
const uj = await levalaszt(b1, [])
t.ok('kiválasztás nélkül: új ügyfél csak ehhez a foglaláshoz, az autójával', [true, uj, regi, uj],
  [uj !== regi, await ugyfele(b1), await ugyfele(b2), (await egy(`select customer_id from vehicles where plate_raw = 'AAA-126'`)).customer_id])
await cegValt(b1, 'Béta Logisztika Kft.')
t.ok('a cég csak ennél a foglalásnál változott', ['Béta Logisztika Kft.', 'Alfa Trans Kft.'], [await cege(b1), await cege(b2)])
t.ok('az új ügyfél adatai megmaradtak', { name: 'Céges Csaba', phone: '+36 30 126 0001' },
  await egy(`select name, phone from customers where id = $1`, [uj]))
t.ok('a lezárt foglalás a régi ügyfélnél maradt', regi, await ugyfele(b3))

console.log('\n=== 2) Ha minden aktív foglalást kiválaszt, nincs szétválasztás ===\n')
const c1 = await foglal({ customer_name: 'Mindkettő Márk', customer_phone: '+36 30 126 0002', company_name: 'Gamma Kft.', plate_raw: 'CCC-126' })
const c2 = await foglal({ customer_name: 'Mindkettő Márk', customer_phone: '+36 30 126 0002', plate_raw: 'DDD-126', service_date: napok[1] })
const cr = await ugyfele(c1)
t.ok('ugyanaz az ügyfél marad', cr, await levalaszt(c1, [c2]))
await cegValt(c1, 'Delta Kft.')
t.ok('mindkettő az új cégnél', ['Delta Kft.', 'Delta Kft.'], [await cege(c1), await cege(c2)])

console.log('\n=== 3) Ugyanaz az autó: a többi aktív foglalása is vele megy ===\n')
const d1 = await foglal({ customer_name: 'Egyautós Edit', customer_phone: '+36 30 126 0003', company_name: 'Epszilon Kft.', plate_raw: 'EEE-126' })
const d2 = await foglal({ customer_name: 'Egyautós Edit', customer_phone: '+36 30 126 0003', plate_raw: 'EEE-126', service_date: napok[1] })
const d3 = await foglal({ customer_name: 'Egyautós Edit', customer_phone: '+36 30 126 0003', plate_raw: 'FFF-126', service_date: napok[2] })
t.ok('a társak között jelölve, melyik ugyanaz az autó', [[d2, true], [d3, false]], (await tarsai(d1)).map((x) => [x.id, x.ugyanaz_auto]))
const dr = await ugyfele(d1)
const du = await levalaszt(d1, [])
t.ok('az azonos autós foglalás is átkerül, a másik autó marad', [du, du, dr], [await ugyfele(d1), await ugyfele(d2), await ugyfele(d3)])

console.log('\n=== 4) Rendszám nélküli (közös névtelen) céges foglalások ===\n')
const ceg = (await egy(`select company_id from customers where id = (select customer_id from bookings where id = $1)`, [c1])).company_id
const e1 = await foglal({ company_id: ceg })
const e2 = await foglal({ company_id: ceg, service_date: napok[1] })
t.ok('ugyanaz a névtelen ügyfél, egymás társai', [true, [e2]], [(await ugyfele(e1)) === (await ugyfele(e2)), (await tarsai(e1)).map((x) => x.id)])
await levalaszt(e1, [])
await cegValt(e1, 'Zéta Kft.')
t.ok('csak az egyik került át', ['Zéta Kft.', 'Delta Kft.'], [await cege(e1), await cege(e2)])

console.log('\n=== 5) Hibák és jogok ===\n')
await q(`update bookings set status = 'COMPLETED' where id = $1`, [c2])
t.ok('lezárt foglalásnál nem', true, /le van zárva/.test(await hiba(() => levalaszt(c2, [])) ?? ''))
t.ok('kívülről nem hívható', [false, false],
  await Promise.all(['foglalas_tarsai(uuid)', 'foglalas_levalaszt(uuid, uuid[])'].map(async (f) =>
    (await egy(`select has_function_privilege('anon', 'public.${f}', 'EXECUTE') a`)).a)))

t.vege()
