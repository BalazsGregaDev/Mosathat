import { adatbazis, tesztelo, ALK, TULAJ } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
const egy = async (s, p) => (await q(s, p))[0]
const hiba = async (f) => { try { await f(); return null } catch (e) { return e.message } }
const ki = (id) => q(`select set_config('app.uid', $1, false)`, [id ?? ''])
const ment = (id, p) => q(`select extra_mentes($1::uuid, $2::jsonb)`, [id, JSON.stringify(p)])
const extra = (nev) => egy(`select * from extras where name = $1`, [nev])
const publikus = async () => {
  const x = (await egy(`select publikus_oldal() x`)).x
  return (x.katalogus ?? x).extras
}

const motor = await extra('Motortér kozmetika')

console.log('=== 1) Módosítás egy helyről ===\n')
await ki(ALK)
t.ok('alkalmazott nem módosíthat', true, /tulajdonos/.test(await hiba(() => ment(motor.id, { price_huf: 1 })) ?? ''))
await ki(TULAJ)
await ment(motor.id, { name: '  Motortér mosás  ', name_en: 'Engine bay wash', description: 'Óvatos, kézi', description_en: 'Gentle, by hand',
  area: 'BELSO', price_huf: 9900, work_minutes: 40, rest_minutes: 15 })
const m2 = await extra('Motortér mosás')
t.ok('minden mező mentve, a név levágva', ['Engine bay wash', 'Óvatos, kézi', 'Gentle, by hand', 'BELSO', 9900, 40, 15],
  [m2.name_en, m2.description, m2.description_en, m2.area, m2.price_huf, m2.work_minutes, m2.rest_minutes])
t.ok('az üres angol mező kiürül', null, (await ment(motor.id, { name_en: '  ' }), (await extra('Motortér mosás')).name_en))
t.ok('üres név: hiba', true, /nem lehet üres/.test(await hiba(() => ment(motor.id, { name: ' ' })) ?? ''))
t.ok('foglalt név (ékezet nélkül is): hiba', true, /már van/.test(await hiba(() => ment(motor.id, { name: 'vizes karpittisztitas' })) ?? ''))
t.ok('rossz hely: hiba', true, /Külső vagy Belső/.test(await hiba(() => ment(motor.id, { area: 'TETO' })) ?? ''))
t.ok('negatív ár: hiba', true, /negatív/.test(await hiba(() => ment(motor.id, { price_huf: -5 })) ?? ''))
t.ok('az ár törölhető (nincs ára)', null, (await ment(motor.id, { price_huf: null }), (await extra('Motortér mosás')).price_huf))
const pub1 = await publikus()
t.ok('a publikus oldalon az új név és a belső oszlop', ['Motortér mosás', 'BELSO'],
  [pub1.find((e) => e.id === motor.id)?.name, pub1.find((e) => e.id === motor.id)?.area])

console.log('\n=== 2) Sorrend ===\n')
const minden = (await q(`select id from extras order by sort_order`)).map((r) => r.id)
const uj = [motor.id, ...minden.filter((x) => x !== motor.id)]
await q(`select extrak_sorrend($1::uuid[])`, [uj])
t.ok('a sorrend mentve', uj, (await q(`select id from extras order by sort_order`)).map((r) => r.id))
t.ok('a publikus oldal is ebben a sorrendben kapja', uj.slice(0, 3), (await publikus()).map((e) => e.id).slice(0, 3))
await ki(ALK)
t.ok('alkalmazott nem rendezhet', true, /tulajdonos/.test(await hiba(() => q(`select extrak_sorrend($1::uuid[])`, [minden])) ?? ''))

console.log('\n=== 3) Új szolgáltatás helye ===\n')
await ki(TULAJ)
const ujId = (await egy(`select create_extra($1::jsonb) id`, [JSON.stringify({ name: 'Plafon tisztítás', area: 'BELSO', price_huf: 5000, work_minutes: 30 })])).id
const u = await egy(`select area, sort_order = (select max(sort_order) from extras) utolso from extras where id = $1`, [ujId])
t.ok('belsőként, a lista végére', { area: 'BELSO', utolso: true }, u)
const kerek = (await egy(`select create_extra('{"name": "Kerék csere"}'::jsonb) id`)).id
t.ok('hely nélkül külső lesz', 'KULSO', (await egy(`select area from extras where id = $1`, [kerek])).area)
t.ok('rossz hely: hiba', true, /Külső vagy Belső/.test(await hiba(() => q(`select create_extra('{"name": "Valami", "area": "X"}'::jsonb)`)) ?? ''))

console.log('\n=== 4) Kikapcsolás és törlés ===\n')
await ment(ujId, { active: false })
t.ok('kikapcsolva: a publikus oldalon nincs, az adminban megvan', [false, true],
  [(await publikus()).some((e) => e.id === ujId), Boolean(await egy(`select 1 x from extras where id = $1`, [ujId]))])
await ki(ALK)
t.ok('alkalmazott nem törölhet', true, /tulajdonos/.test(await hiba(() => q(`select extra_torles($1)`, [ujId])) ?? ''))
await ki(TULAJ)
await q(`select extra_torles($1)`, [ujId])
t.ok('foglalásban nem szereplő törölhető', 0, (await q(`select 1 from extras where id = $1`, [ujId])).length)
const hasznalt = await egy(`select ref_id from booking_items where kind = 'EXTRA' and ref_id is not null limit 1`)
t.ok('foglalásban szereplő nem törölhető, a hiba a kikapcsolást javasolja', true,
  /szerepel foglalásban.*Aktív/.test(await hiba(() => q(`select extra_torles($1)`, [hasznalt.ref_id])) ?? ''))
t.ok('a jogok: kívülről egyik sem hívható', [false, false, false],
  await Promise.all(['extra_mentes(uuid, jsonb)', 'extra_torles(uuid)', 'extrak_sorrend(uuid[])'].map(async (f) =>
    (await egy(`select has_function_privilege('anon', 'public.${f}', 'EXECUTE') a`)).a)))

t.vege()
