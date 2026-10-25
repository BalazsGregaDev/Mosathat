import { adatbazis, tesztelo, ALK, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
const egy = async (s, p) => (await q(s, p))[0]
const hiba = async (f) => { try { await f(); return null } catch (e) { return e.message } }
const ki = (id) => q(`select set_config('app.uid', $1, false)`, [id ?? ''])
const tagjai = async (ugyfel, ceg = null) => (await egy(`select ceg_tagjai($1::uuid, $2::uuid) x`, [ugyfel, ceg])).x
const atnevez = async (ceg, nev, ugyfelek) => (await egy(`select ceg_atnevez($1::uuid, $2, $3::uuid[]) x`, [ceg, nev, ugyfelek])).x
const ugyfel = (id) => egy(`select name, company_name, company_id from customers where id = $1`, [id])

await ki(TULAJ)
const ceg = await egy(`select co.id, co.name from companies co where exists (select 1 from customers c where c.company_id = co.id)
                        order by (select count(*) from customers c where c.company_id = co.id) desc limit 1`)
const ujAuto = async (nev, rendszam) => {
  const id = (await egy(`select add_customer($1::jsonb) id`, [JSON.stringify({ name: nev, phone: '+36 30 555 ' + Math.floor(Math.random() * 9000 + 1000), type: 'MAGAN', company_name: ceg.name })])).id
  await q(`select add_vehicle($1::jsonb)`, [JSON.stringify({ customer_id: id, plate_raw: rendszam, category: 'SZEMELYAUTO' })])
  return id
}
const sofor = await ujAuto('Teszt Sofőr', 'TST-124')

console.log('=== 1) A cég ügyfelei és járművei ===\n')
const tg = await tagjai(sofor)
t.ok('ügyfél alapján megtalálja a céget, minden ügyféllel és rendszámmal', [ceg.id, ceg.name, true, true],
  [tg.ceg_id, tg.nev, tg.tagok.length >= 3, tg.tagok.some((x) => x.name === 'Teszt Sofőr' && x.rendszamok.includes('TST-124'))])
t.ok('cég alapján is', tg.tagok.length, (await tagjai(null, ceg.id)).tagok.length)
const cegTipusu = tg.tagok.find((x) => x.type === 'CEG')
t.ok('a cég típusú ügyfél áll elöl', 'CEG', tg.tagok[0].type)
const egyeni = await egy(`select id from customers where company_id is null limit 1`)
t.ok('cég nélküli ügyfélnél nincs mit átnevezni', null, await tagjai(egyeni.id))

console.log('\n=== 2) Elírás javítása (ugyanaz a cég) ===\n')
const mind = tg.tagok.map((x) => x.id)
const javitott = ceg.name.toUpperCase()
const r1 = await atnevez(ceg.id, javitott, mind)
t.ok('ugyanaz a cég marad, az új írásmóddal', [ceg.id, javitott, false], [r1.ceg_id, r1.nev, r1.osszevonva])
t.ok('minden ügyfélnél átírva', [javitott], [...new Set((await q(`select company_name from customers where company_id = $1`, [ceg.id])).map((x) => x.company_name))])
if (cegTipusu) t.ok('a cég típusú ügyfél neve is', javitott, (await ugyfel(cegTipusu.id)).name)

console.log('\n=== 3) Új név mindenkinek ===\n')
const r2 = await atnevez(ceg.id, 'Teszt Logisztika Kft.', mind)
t.ok('a cég maga kap új nevet, az azonosító marad', [ceg.id, 'Teszt Logisztika Kft.'], [r2.ceg_id, (await egy(`select name from companies where id = $1`, [ceg.id])).name])
t.ok('az ügyfeleknél is', ['Teszt Logisztika Kft.', ceg.id], [(await ugyfel(sofor)).company_name, (await ugyfel(sofor)).company_id])

console.log('\n=== 4) Csak a kijelöltek ===\n')
const masodik = await ujAuto('Második Sofőr', 'TST-125')
await q(`update customers set company_id = $1 where id = $2`, [ceg.id, masodik])
const r3 = await atnevez(ceg.id, 'Teszt Leányvállalat Kft.', [masodik])
const m = await ugyfel(masodik)
t.ok('a kijelölt új cégbe kerül, a többiek maradnak', [true, 'Teszt Leányvállalat Kft.', 'Teszt Logisztika Kft.'],
  [r3.ceg_id !== ceg.id && m.company_id === r3.ceg_id, m.company_name, (await ugyfel(sofor)).company_name])

console.log('\n=== 5) Már létező név: összevonás ===\n')
const r4 = await atnevez(r3.ceg_id, 'teszt logisztika kft', [masodik])
t.ok('a meglévő céghez kerül, a név az új írásmód', [ceg.id, true, 'teszt logisztika kft'], [r4.ceg_id, r4.osszevonva, (await ugyfel(masodik)).company_name])
t.ok('a régi cég többi tagja is az új írásmódot kapja', 'teszt logisztika kft', (await ugyfel(sofor)).company_name)

console.log('\n=== 6) Szerződéses cég nem vonható össze ===\n')
const szerzodeses = await egy(`select co.id, co.name from companies co where exists (select 1 from contracts ct where ct.company_id = co.id) limit 1`)
if (szerzodeses) {
  const tagok = (await tagjai(null, szerzodeses.id)).tagok.map((x) => x.id)
  if (tagok.length) {
    await q(`select add_customer($1::jsonb)`, [JSON.stringify({ name: 'Másik Ügyfél', phone: '+36 30 555 0124', type: 'MAGAN', company_name: 'Másik Cég Kft.' })])
    t.ok('hibát ad, és nem változik semmi', [true, szerzodeses.name], [
      /szerződése van/.test(await hiba(() => atnevez(szerzodeses.id, 'Másik Cég', tagok)) ?? ''),
      (await egy(`select name from companies where id = $1`, [szerzodeses.id])).name])
  }
}

console.log('\n=== 6b) Másik cég autóinak felvétele egy meglévő (szerződéses) céghez ===\n')
{
  const cel = szerzodeses ?? ceg
  const celNev = (await egy(`select name from companies where id = $1`, [cel.id])).name
  const ujCegben = async (nev, rendszam) => {
    const id = (await egy(`select add_customer($1::jsonb) id`, [JSON.stringify({ name: nev, phone: '+36 30 556 ' + Math.floor(Math.random() * 9000 + 1000), type: 'MAGAN', company_name: `${celNev} / Magán` })])).id
    await q(`select add_vehicle($1::jsonb)`, [JSON.stringify({ customer_id: id, plate_raw: rendszam, category: 'SZEMELYAUTO' })])
    return id
  }
  const b1 = await ujCegben('Magán Béla', 'MAG-001')
  const b2 = await ujCegben('Magán Bori', 'MAG-002')
  const magan = (await ugyfel(b1)).company_id
  t.ok('két külön cég van', true, magan !== cel.id)
  const elotte = (await egy(`select count(*)::int n from companies`)).n
  const c = await egy(`select ceg_cel($1::uuid, $2) x`, [magan, celNev])
  t.ok('a cél előnézete: létező cég, a szerződéssel', [true, cel.id, Boolean(szerzodeses)], [c.x.letezo, c.x.id, c.x.szerzodes])
  const r = await atnevez(magan, celNev, [b1, b2])
  t.ok('mindkét ügyfél és autója a meglévő céghez került, a régi üres cég megszűnt', [cel.id, true, true, cel.id, cel.id, elotte - 1],
    [r.ceg_id, r.osszevonva, r.regi_torolve, (await ugyfel(b1)).company_id, (await ugyfel(b2)).company_id, (await egy(`select count(*)::int n from companies`)).n])
  if (szerzodeses) {
    t.ok('az átvitt autók a cég szerződése alá tartoznak', [true, true],
      (await q(`select szerzodes from v_vehicle_summary where plate_raw in ('MAG-001', 'MAG-002') order by plate_raw`)).map((x) => x.szerzodes))
  }
}

console.log('\n=== 7) Hibák és jogok ===\n')
t.ok('üres név', true, /új nevét/.test(await hiba(() => atnevez(ceg.id, '  ', mind)) ?? ''))
t.ok('senki nincs kijelölve', true, /legalább egy/.test(await hiba(() => atnevez(ceg.id, 'Bármi', [])) ?? ''))
t.ok('más cég ügyfele', true, /nem ennél a cégnél/.test(await hiba(() => atnevez(ceg.id, 'Bármi', [egyeni.id])) ?? ''))
await ki(ALK)
t.ok('alkalmazott nem nevezhet át', true, /tulajdonos/.test(await hiba(() => atnevez(ceg.id, 'Bármi', mind)) ?? ''))
await ki(TULAJ)
t.ok('kívülről egyik sem hívható', [false, false, false],
  await Promise.all(['ceg_tagjai(uuid, uuid)', 'ceg_atnevez(uuid, text, uuid[])', 'ceg_cel(uuid, text)'].map(async (f) =>
    (await egy(`select has_function_privilege('anon', 'public.${f}', 'EXECUTE') a`)).a)))

t.vege()
