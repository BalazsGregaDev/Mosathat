import { adatbazis, tesztelo, TULAJ, ALK, FEJL } from './_db.mjs'

const t = tesztelo()
const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
const egy = async (s, p) => (await q(s, p))[0]
const ki = (id) => q(`select set_config('app.uid', $1, false)`, [id ?? ''])
const hiba = async (f) => { try { await f(); return null } catch (e) { return e.message } }

async function anonkent(f) {
  await ki('')
  await db.exec('set role anon')
  try { return await f() } finally { await db.exec('reset role') }
}

const publikus = async () => { const x = await anonkent(async () => (await egy(`select publikus_oldal() x`)).x); await ki(TULAJ); return x }
const lista = async () => (await egy(`select gyik_lista() x`)).x
const ment = async (p) => (await egy(`select gyik_mentes($1::jsonb) id`, [JSON.stringify(p)])).id

console.log('=== 1) Publikus oldal: csak a publikált kérdések, beállításokkal ===\n')
await ki(TULAJ)
const l1 = await lista()
const p1 = await publikus()
t.ok('a demóban 9 kérdés, ebből 8 publikált', [9, 8], [l1.kerdesek.length, p1.gyik.kerdesek.length])
t.ok('alapbeállítás: kiválasztott, legfeljebb 5', ['VALOGATOTT', 5], [p1.gyik.mod, p1.gyik.max])
t.ok('a piszkozat nincs kint', false, p1.gyik.kerdesek.some((k) => k.kerdes.startsWith('Piszkozat')))
t.ok('publikusan nincs állapot és dátum', [['id', 'kategoria', 'kerdes', 'kerdes_en', 'kiemelt', 'valasz', 'valasz_en']],
  [...new Set(p1.gyik.kerdesek.map((k) => Object.keys(k).sort().join(',')))].map((x) => x.split(',')))
t.ok('a publikus oldal többi része is megvan, a vélemények is', true,
  ['packages', 'szovegek', 'adatok', 'velemenyek'].every((k) => k in p1))
t.ok('névtelenül a tábla nem olvasható', true, /permission denied/.test(await hiba(() => anonkent(() => q(`select * from gyik`))) ?? ''))
t.ok('névtelenül a lista nem kérhető', true, /permission denied/.test(await hiba(() => anonkent(() => q(`select gyik_lista()`))) ?? ''))
t.ok('az előző publikus függvény névtelenül nem hívható', true,
  /permission denied/.test(await hiba(() => anonkent(() => q(`select publikus_oldal_v105()`))) ?? ''))
await ki(TULAJ)

console.log('\n=== 2) Mentés, publikálás, visszavonás ===\n')
const uj = await ment({ kerdes: '  Mosnak motorteret?  ', valasz: '<p>Igen, <strong>extraként</strong>.</p>', kategoria: 'KULSO' })
let s = (await lista()).kerdesek.find((k) => k.id === uj)
t.ok('új kérdés piszkozatként, a lista végén, levágott kérdéssel', ['Mosnak motorteret?', false, null, 9],
  [s.kerdes, s.publikalt, s.publikalva_at, (await lista()).kerdesek.findIndex((k) => k.id === uj)])
await ment({ id: uj, kerdes: 'Mosnak motorteret?', valasz: s.valasz, kategoria: 'KULSO', publikalt: true, kiemelt: true })
s = (await lista()).kerdesek.find((k) => k.id === uj)
t.ok('publikálva, dátummal, kiemelve', [true, true, true], [s.publikalt, s.publikalva_at !== null, s.kiemelt])
t.ok('kint van a publikus oldalon', true, (await publikus()).gyik.kerdesek.some((k) => k.id === uj))
const elso = s.publikalva_at
await ment({ id: uj, kerdes: 'Mosnak motorteret is?', valasz: s.valasz, kategoria: 'KULSO', publikalt: true })
s = (await lista()).kerdesek.find((k) => k.id === uj)
t.ok('publikált módosítása: a publikálás dátuma marad', [elso, 'Mosnak motorteret is?'], [s.publikalva_at, s.kerdes])
await ment({ id: uj, kerdes: s.kerdes, valasz: s.valasz, kategoria: 'KULSO', publikalt: false })
t.ok('visszavonva: eltűnik a publikus oldalról', false, (await publikus()).gyik.kerdesek.some((k) => k.id === uj))
t.ok('válasz nélkül nem publikálható', true,
  /nem publikálható/.test(await hiba(() => ment({ kerdes: 'Üres válasz?', valasz: '<p> </p>', publikalt: true })) ?? ''))
t.ok('csak képpel publikálható', true,
  typeof await ment({ kerdes: 'Csak kép?', valasz: '<p><img src="https://x.supabase.co/storage/v1/object/public/gyik-kepek/a.webp" alt="a"></p>', publikalt: true }) === 'string')
t.ok('rövid kérdés nem menthető', true, /legalább 3/.test(await hiba(() => ment({ kerdes: 'ab', valasz: '' })) ?? ''))
t.ok('ismeretlen kategória nem menthető', true, /kategória/.test(await hiba(() => ment({ kerdes: 'Mi ez?', kategoria: 'X' })) ?? ''))
t.ok('script nem menthető', true, /nem megengedett elem/.test(await hiba(() => ment({ kerdes: 'Mi ez?', valasz: '<p>x</p><script>alert(1)</script>' })) ?? ''))
t.ok('eseménykezelő nem menthető', true, /attribútum/.test(await hiba(() => ment({ kerdes: 'Mi ez?', valasz: '<img src="x" onerror="alert(1)">' })) ?? ''))
t.ok('javascript link nem menthető', true, /link/.test(await hiba(() => ment({ kerdes: 'Mi ez?', valasz: '<a href="javascript:alert(1)">x</a>' })) ?? ''))
t.ok('angol változat is ellenőrizve', true, /Angol válasz/.test(await hiba(() => ment({ kerdes: 'Mi ez?', valasz_en: '<iframe src="x">' })) ?? ''))
const ures = await ment({ kerdes: 'Angol üres?', valasz: '<p>x</p>', valasz_en: '<p></p>' })
t.ok('üres angol válasz nullként tárolva', null, (await lista()).kerdesek.find((k) => k.id === ures).valasz_en)

console.log('\n=== 3) Sorrend, törlés, beállítás ===\n')
const ids = (await lista()).kerdesek.map((k) => k.id)
const forditva = [...ids].reverse()
await q(`select gyik_sorrend($1::uuid[])`, [forditva])
t.ok('fordított sorrend', forditva, (await lista()).kerdesek.map((k) => k.id))
t.ok('a publikus oldalon is az új sorrend', forditva.filter((id) => p1.gyik.kerdesek.some((k) => k.id === id)),
  (await publikus()).gyik.kerdesek.map((k) => k.id).filter((id) => p1.gyik.kerdesek.some((k) => k.id === id)))
await q(`select gyik_torles($1)`, [uj])
t.ok('törölve', false, (await lista()).kerdesek.some((k) => k.id === uj))
await q(`select gyik_beallitas('VELETLEN', 3)`)
t.ok('beállítás mentve, a publikus oldal is látja', ['VELETLEN', 3], [(await publikus()).gyik.mod, (await publikus()).gyik.max])
t.ok('rossz mód nem menthető', true, /mód/.test(await hiba(() => q(`select gyik_beallitas('X', 3)`)) ?? ''))
t.ok('21 nem menthető', true, /1 és 20/.test(await hiba(() => q(`select gyik_beallitas('VELETLEN', 21)`)) ?? ''))

console.log('\n=== 4) Jogosultság ===\n')
await ki(ALK)
t.ok('az alkalmazott nem látja a listát', true, /tulajdonos/.test(await hiba(() => lista()) ?? ''))
t.ok('az alkalmazott nem ment', true, /tulajdonos/.test(await hiba(() => ment({ kerdes: 'Mi ez?' })) ?? ''))
t.ok('az alkalmazott nem töröl', true, /tulajdonos/.test(await hiba(() => q(`select gyik_torles($1)`, [ids[0]])) ?? ''))
t.ok('az alkalmazott nem állít sorrendet', true, /tulajdonos/.test(await hiba(() => q(`select gyik_sorrend($1::uuid[])`, [ids])) ?? ''))
t.ok('az alkalmazott nem állítja a főoldalt', true, /tulajdonos/.test(await hiba(() => q(`select gyik_beallitas('VALOGATOTT', 5)`)) ?? ''))
await ki(FEJL)
t.ok('a fejlesztő látja és kezeli', true, (await lista()).kerdesek.length > 0)

t.vege()
