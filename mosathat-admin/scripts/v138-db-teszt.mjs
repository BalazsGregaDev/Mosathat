import { adatbazis, ALK, TULAJ, tesztelo } from './_db.mjs'

const SUPABASE_ALAPJOGOK = `
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  grant usage on schema auth, extensions to anon, authenticated;
  grant execute on all functions in schema auth, extensions to anon, authenticated;
`

const t = tesztelo()
const db = await adatbazis({ demo: true, elotte: SUPABASE_ALAPJOGOK })
const q = async (s, p = []) => (await db.query(s, p)).rows
await db.exec(`select set_config('app.uid', '${TULAJ}', false)`)

let szerep = null
const futtat = async (s, p = []) => {
  if (!szerep) return q(s, p)
  await db.exec('begin')
  try {
    await db.exec(`select set_config('app.uid', '${szerep}', true)`)
    await db.exec('set local role authenticated')
    const r = await q(s, p)
    await db.exec('commit')
    return r
  } catch (e) {
    await db.exec('rollback')
    throw e
  }
}

const [{ nap }] = await q(`select (public.budapest_ma() + 7)::text nap`)
const [{ start }] = await q(`select id start from packages where code = 'START'`)
const ALAP = {
  package_id: start, category: 'SZEMELYAUTO', scope: 'TELJES', full_service: false, extras: [], surcharge_pct: 0, surcharge_fix: 0,
  customer_id: null, customer_name: '', customer_phone: '', company_id: null, company_name: null, contract_kind: null, vehicle_id: null,
  plate_raw: '', brand: null, model: null, seats: null, booking_type: 'LEADOS', service_date: nap, start_time: null, drop_off_time: '08:00',
  pick_up_date: null, pick_up_time: '16:00', source: 'TELEFON', notes: null,
}
const uj = async (x) => (await futtat(`select public.create_booking($1::jsonb) id`, [JSON.stringify({ ...ALAP, ...x })]))[0].id
const javit = (id, x) => futtat(`select public.patch_booking($1::uuid, $2::jsonb)`, [id, JSON.stringify(x)])
const szerk = (id, x) => futtat(`select public.update_booking($1::uuid, public.booking_patch_alap($1::uuid) || $2::jsonb)`, [id, JSON.stringify(x)])
const adat = async (id) => {
  const [r] = await q(`select customer_id u, customer_name nev, customer_phone tel, company_name ceg, plate_raw rsz from v_day_bookings where id = $1`, [id])
  return r
}
const nt = async (id) => { const r = await adat(id); return [r.nev, r.tel] }
const ntc = async (id) => { const r = await adat(id); return [r.nev, r.tel, r.ceg] }
const ugyfele = async (id) => (await adat(id)).u
const talalat = async (rsz) => (await q(`select * from search_customers($1, 5, 'RENDSZAM')`, [rsz]))[0]
const DEMO = Object.fromEntries((await q(`select c.name, (array_agg(b.id order by b.service_date, b.created_at))[1] id
  from bookings b join customers c on c.id = b.customer_id
 where c.name in ('Kovács Péter', 'Nagy Anita', 'Tóth Gergő', 'Autó Trans Kft.') group by c.name`)).map((r) => [r.name, r.id]))
const regiFoglalas = async (nev) => DEMO[nev]
const NEVTELEN = ['Névtelen', '—']

for (const [cim, ki] of [['tulajdonosként', null], ['alkalmazottként, a valódi jogosultságokkal', ALK]]) {
  szerep = ki
  const x = ki ? 'B' : 'A'
  const tel = (n) => `+36 30 ${ki ? 238 : 138} ${n}`
  console.log(`\n######## ${cim} ########`)

  console.log('\n=== 1) Magán, név és telefon nélkül: utólag beírt telefon ===\n')
  {
    const a1 = await uj({ plate_raw: `${x}AA-101` })
    const a2 = await uj({ plate_raw: `${x}AA-102` })
    const a3 = await uj({ plate_raw: `${x}AA-103` })
    t.ok('a névtelen foglalások egy rejtett, közös ügyfélen vannak (mint eddig)', true, (await ugyfele(a1)) === (await ugyfele(a2)))
    await javit(a1, { customer_phone: tel('0001') })
    t.ok('munkalapon beírt telefon: csak annál a foglalásnál látszik', [['Névtelen', tel('0001')], NEVTELEN, NEVTELEN],
      [await nt(a1), await nt(a2), await nt(a3)])
    await javit(a2, { customer_name: 'Kis Ilona' })
    t.ok('munkalapon beírt név: csak annál', [['Kis Ilona', '—'], NEVTELEN], [await nt(a2), await nt(a3)])
    await szerk(a3, { customer_name: 'Vég Béla', customer_phone: tel('0003'), company_id: null, company_name: null })
    t.ok('szerkesztő űrlapon beírt név és telefon: csak annál', [['Névtelen', tel('0001')], ['Kis Ilona', '—'], ['Vég Béla', tel('0003')]],
      [await nt(a1), await nt(a2), await nt(a3)])
    const a4 = await uj({ plate_raw: `${x}AA-104` })
    const a5 = await uj({ plate_raw: `${x}AA-105` })
    t.ok('utána is minden új névtelen foglalás névtelen marad', [NEVTELEN, NEVTELEN], [await nt(a4), await nt(a5)])
    await javit(a4, { customer_phone: tel('0001') })
    t.ok('ismert számot beírva a szám gazdájához kerül, a többi névtelen marad', [true, NEVTELEN],
      [(await ugyfele(a4)) === (await ugyfele(a1)), await nt(a5)])
    await javit(a1, { customer_phone: '' })
    t.ok('a telefonszám ki is törölhető', '—', (await adat(a1)).tel)
  }

  console.log('\n=== 2) Új időpont: névtelen autó kiválasztása a találatok közül, majd telefon ===\n')
  {
    const b1 = await uj({ plate_raw: `${x}BB-201` })
    const b2 = await uj({ plate_raw: `${x}BB-202` })
    const h = await talalat(`${x}BB201`)
    t.ok('a névtelen autó megjelenik a találatok közt', [`${x}BB-201`, 'Névtelen'], [h.plate_raw, h.customer_name])
    const b3 = await uj({ customer_id: h.customer_id, vehicle_id: h.vehicle_id, plate_raw: h.plate_raw, customer_name: 'Új Ödön', customer_phone: tel('0201') })
    t.ok('az új foglalásnál az új ügyfél adatai', ['Új Ödön', tel('0201'), `${x}BB-201`], [(await adat(b3)).nev, (await adat(b3)).tel, (await adat(b3)).rsz])
    t.ok('a korábbi névtelen foglalások névtelenek maradnak', [NEVTELEN, NEVTELEN], [await nt(b1), await nt(b2)])
    const h2 = await talalat(`${x}BB201`)
    t.ok('ezután a rendszámra már az új ügyfél jön fel a telefonszámával', ['Új Ödön', tel('0201')], [h2.customer_name, h2.customer_phone])
  }

  console.log('\n=== 3) Új időpont: létező telefonszám, más névvel ===\n')
  {
    const kovacs = await regiFoglalas('Kovács Péter')
    const c1 = await uj({ plate_raw: `${x}CC-301`, customer_name: 'Szabó Éva', customer_phone: '+36 30 111 2233' })
    t.ok('Kovács Péter régi foglalása nem lesz Szabó Éváé', ['Kovács Péter', '+36 30 111 2233'], await nt(kovacs))
    t.ok('Szabó Éva külön ügyfél lett', [true, 'Szabó Éva'], [(await ugyfele(c1)) !== (await ugyfele(kovacs)), (await adat(c1)).nev])
    const c2 = await uj({ plate_raw: `${x}CC-302`, customer_name: 'kovacs  peter', customer_phone: '06301112233' })
    t.ok('ugyanaz a név más írással, ugyanaz a szám más írással: ugyanaz az ügyfél', true, (await ugyfele(c2)) === (await ugyfele(kovacs)))
    const c3 = await uj({ plate_raw: `${x}CC-303`, customer_name: '', customer_phone: '+36 20 555 8890' })
    t.ok('csak telefonszámmal: a szám gazdájához kerül', ['Nagy Anita', '+36 20 555 8890'], await nt(c3))
  }

  console.log('\n=== 4) Céggel, név és telefon nélkül ===\n')
  {
    const d1 = await uj({ plate_raw: `${x}LN-401`, company_name: 'Lenpower' })
    const d2 = await uj({ plate_raw: `${x}LN-402`, company_name: 'Len Power' })
    const d3 = await uj({ plate_raw: `${x}LN-403`, company_name: 'LENPOWER' })
    t.ok('a cég névtelen foglalásai egy közös, rejtett ügyfélen', true, (await ugyfele(d1)) === (await ugyfele(d3)))
    await javit(d1, { customer_name: 'Sofőr Sándor', customer_phone: tel('0401') })
    t.ok('az egyik autónál beírt sofőr és szám csak annál látszik', [['Sofőr Sándor', tel('0401')], NEVTELEN, NEVTELEN],
      [await nt(d1), await nt(d2), await nt(d3)])
    t.ok('a cég mindhárom foglalásnál megmarad', [true, true, true], [Boolean((await adat(d1)).ceg), Boolean((await adat(d2)).ceg), Boolean((await adat(d3)).ceg)])
    await szerk(d2, { customer_phone: tel('0402'), company_id: null, company_name: (await adat(d2)).ceg })
    t.ok('szerkesztő űrlapon a céges foglalásnál is csak annál', [['Névtelen', tel('0402')], NEVTELEN], [await nt(d2), await nt(d3)])
  }

  console.log('\n=== 5) Céges foglalás magánügyfél telefonjával, és fordítva ===\n')
  {
    const anita = await regiFoglalas('Nagy Anita')
    const e1 = await uj({ plate_raw: `${x}LN-501`, company_name: 'Lenpower', customer_name: 'Nagy Anita', customer_phone: '+36 20 555 8890' })
    t.ok('Nagy Anita magánfoglalása magán marad (nem kerül át a céghez)', ['Nagy Anita', '+36 20 555 8890', null], await ntc(anita))
    t.ok('a céges foglalás a cégnél van', true, Boolean((await adat(e1)).ceg))
    const ceges = await regiFoglalas('Autó Trans Kft.')
    const e2 = await uj({ plate_raw: `${x}KR-502`, customer_name: 'Sofőr Gábor', customer_phone: '+36 1 999 1234', company_name: 'Autó Trans Kft.' })
    t.ok('a cég saját számával felvett sofőr nem nevezi át a céget', ['Autó Trans Kft.', '+36 1 999 1234'], await nt(ceges))
    t.ok('a sofőr külön ügyfél a cégnél', ['Sofőr Gábor', '+36 1 999 1234', 'Autó Trans Kft.'], await ntc(e2))
    const e3 = await uj({ plate_raw: `${x}MG-503`, customer_name: 'Magán Margit', customer_phone: '+36 1 999 1234' })
    t.ok('magánfoglalás a cég számával: a cég adatai nem változnak', [['Autó Trans Kft.', '+36 1 999 1234'], ['Magán Margit', '+36 1 999 1234', null]],
      [await nt(ceges), await ntc(e3)])
  }

  console.log('\n=== 6) Kiválasztott ügyfél, de más cég vagy más rendszám ===\n')
  {
    const tg = await talalat('AABB123')
    const tothRegi = await regiFoglalas('Tóth Gergő')
    const f1 = await uj({ customer_id: tg.customer_id, vehicle_id: tg.vehicle_id, plate_raw: tg.plate_raw, customer_name: tg.customer_name, customer_phone: tg.customer_phone, company_name: 'Lenpower' })
    t.ok('ha cégre veszem fel, a magánügyfél korábbi foglalásai magánok maradnak', [null, true], [(await adat(tothRegi)).ceg, Boolean((await adat(f1)).ceg)])
    const f2 = await uj({ customer_id: tg.customer_id, vehicle_id: tg.vehicle_id, plate_raw: `${x}NEW-601`, customer_name: tg.customer_name, customer_phone: tg.customer_phone })
    t.ok('ha a rendszámot átírom, nem a régi autóra kerül', [`${x}NEW-601`, 'AABB-123'], [(await adat(f2)).rsz, (await adat(tothRegi)).rsz])
    t.ok('de ugyanaz az ügyfél marad', true, (await ugyfele(f2)) === (await ugyfele(tothRegi)))
    const f3 = await uj({ customer_id: tg.customer_id, vehicle_id: tg.vehicle_id, plate_raw: tg.plate_raw, customer_name: tg.customer_name, customer_phone: '+36 70 244 9999' })
    t.ok('ha ugyanaz az ügyfél és új számot ad (megerősítve), mindenhol frissül', ['+36 70 244 9999', '+36 70 244 9999'], [(await adat(f3)).tel, (await adat(tothRegi)).tel])
    await uj({ customer_id: tg.customer_id, vehicle_id: tg.vehicle_id, plate_raw: tg.plate_raw, customer_name: tg.customer_name, customer_phone: '+36 70 244 1100' })
  }

  console.log('\n=== 7) Flotta: a közös adat az egész flottára, de más foglalásra nem ===\n')
  {
    const [{ csoport }] = await futtat(`select public.create_fleet_booking($1::jsonb, 3) csoport`, [JSON.stringify({ ...ALAP, company_name: 'Lenpower', plate_raw: '' })])
    const masik = await uj({ plate_raw: `${x}LN-701`, company_name: 'Lenpower' })
    const autok = (await q(`select id from bookings where fleet_group = $1 order by fleet_index`, [csoport])).map((r) => r.id)
    await javit(autok[0], { customer_phone: tel('0701') })
    t.ok('a flotta közös telefonszáma mindhárom autónál', [tel('0701'), tel('0701'), tel('0701')],
      await Promise.all(autok.map(async (id) => (await adat(id)).tel)))
    t.ok('a cég másik névtelen foglalásához nem kerül oda', NEVTELEN, await nt(masik))
    const [{ uj: negyedik }] = await futtat(`select public.fleet_add_car($1::uuid) uj`, [csoport])
    t.ok('a flottához később hozzáadott autó is a flotta adataival', tel('0701'), (await adat(negyedik)).tel)
    const tarsak = (await futtat(`select public.foglalas_tarsai($1::uuid) x`, [autok[0]]))[0].x
    t.ok('rákérdezésnél a flotta többi autója kötelezően együtt mozog', [3, true], [tarsak.length, tarsak.every((x2) => x2.ugyanaz_flotta)])
  }

  console.log('\n=== 8) Cégváltás névtelen foglalásnál ===\n')
  {
    const g1 = await uj({ plate_raw: `${x}GG-801` })
    const g2 = await uj({ plate_raw: `${x}GG-802` })
    const tarsak = (await futtat(`select public.foglalas_tarsai($1::uuid) x`, [g1]))[0].x
    t.ok('névtelen foglalásnál nem kérdez rá idegen foglalásokra', 0, tarsak.length)
    await javit(g1, { company_id: null, company_name: 'Lenpower' })
    t.ok('csak az egyik foglalás kerül a céghez', [true, null], [Boolean((await adat(g1)).ceg), (await adat(g2)).ceg])
    const g3 = await uj({ plate_raw: `${x}GG-803` })
    const g4 = await uj({ plate_raw: `${x}GG-803` })
    const t2 = (await futtat(`select public.foglalas_tarsai($1::uuid) x`, [g3]))[0].x
    t.ok('ugyanannak az autónak a másik névtelen foglalása kötelezően együtt mozog', [1, true], [t2.length, t2[0]?.ugyanaz_auto])
    await futtat(`select public.foglalas_levalaszt($1::uuid, '{}'::uuid[])`, [g3])
    await javit(g3, { customer_phone: tel('0803') })
    t.ok('az autó másik foglalása is megkapja, a többi névtelen nem', [tel('0803'), NEVTELEN], [(await adat(g4)).tel, await nt(g2)])
  }

  console.log('\n=== 9) Valódi ügyfél több foglalással: csak ennél / mindegyiknél ===\n')
  {
    const h1 = await uj({ plate_raw: `${x}HH-901`, customer_name: 'Hármas Hanna', customer_phone: tel('0901') })
    const h2 = await uj({ plate_raw: `${x}HH-902`, customer_name: 'Hármas Hanna', customer_phone: tel('0901') })
    const h3 = await uj({ plate_raw: `${x}HH-903`, customer_name: 'Hármas Hanna', customer_phone: tel('0901') })
    const tarsak = (await futtat(`select public.foglalas_tarsai($1::uuid) x`, [h1]))[0].x
    t.ok('rákérdez a másik két foglalásra', 2, tarsak.length)
    await futtat(`select public.foglalas_levalaszt($1::uuid, '{}'::uuid[])`, [h1])
    await javit(h1, { customer_phone: tel('0911'), customer_name: 'Másik Mária' })
    t.ok('„Csak ennél": a másik kettő a régi adatokkal marad', [['Másik Mária', tel('0911')], ['Hármas Hanna', tel('0901')], ['Hármas Hanna', tel('0901')]],
      [await nt(h1), await nt(h2), await nt(h3)])
    await futtat(`select public.foglalas_levalaszt($1::uuid, $2::uuid[])`, [h2, [h3]])
    await javit(h2, { customer_phone: tel('0922') })
    t.ok('kijelölve mindkettőnél frissül', [tel('0922'), tel('0922')], [(await adat(h2)).tel, (await adat(h3)).tel])
  }
}
szerep = null

console.log('\n=== 10) Online kérés: marad a régi működés ===\n')
{
  const [{ prem }] = await q(`select id prem from packages where code = 'PREMIUM'`)
  const [{ szabad }] = await q(`select d::date::text szabad from generate_series(public.budapest_ma() + 2, public.budapest_ma() + 40, interval '1 day') d
     where public.munkanap(d::date) and extract(isodow from d) < 6 order by d limit 1`)
  const [{ id }] = await q(`select public.publikus_foglalas($1::jsonb) id`, [JSON.stringify({
    category: 'SZEMELYAUTO', scope: 'TELJES', package_id: prem, booking_type: 'LEADOS', service_date: szabad, drop_off_time: '09:00',
    customer_name: 'Más Név', customer_phone: '+36 30 777 4412', customer_email: 'mas@pelda.hu', plate_raw: 'ONL-138', brand: 'Skoda', model: 'Fabia',
  })])
  const [r] = await q(`select c.name, c.phone, b.internal_notes from bookings b join customers c on c.id = b.customer_id where b.id = $1`, [id])
  t.ok('az online kérés a szám gazdájához kerül, a neve nem íródik át', ['Szabó Márk', '+36 30 777 4412'], [r.name, r.phone])
}

console.log('\n=== 11) Ügyfélkártya: a névtelen gyűjtő ügyfélre nem írható telefonszám ===\n')
{
  const k1 = await uj({ plate_raw: 'KRT-001' })
  await uj({ plate_raw: 'KRT-002' })
  const u = await ugyfele(k1)
  let hibaUzenet = null
  try { await q(`select public.save_customer($1::jsonb)`, [JSON.stringify({ id: u, name: 'Névtelen', phone: '+36 30 138 1111' })]) } catch (e) { hibaUzenet = e.message }
  t.ok('a kártyán beírt telefonszámot elutasítja, mert több független foglalást fog össze', true, /több, egymástól független foglalást/.test(hibaUzenet ?? ''))
  t.ok('a foglalások névtelenek maradnak', NEVTELEN, await nt(k1))
  await q(`select public.save_customer($1::jsonb)`, [JSON.stringify({ id: u, name: 'Névtelen', phone: '—', internal_notes: 'gyűjtő' })])
  t.ok('a belső megjegyzés viszont menthető', 'gyűjtő', (await q(`select internal_notes from customers where id = $1`, [u]))[0].internal_notes)
}

await db.close()
t.vege()
