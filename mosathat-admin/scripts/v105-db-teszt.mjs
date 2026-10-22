import { adatbazis, tesztelo, TULAJ, ALK } from './_db.mjs'

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

const publikus = () => anonkent(async () => (await egy(`select publikus_oldal() x`)).x)
const ment = (l) => q(`select velemenyek_mentes($1::jsonb)`, [JSON.stringify(l)])

console.log('=== 1) A publikus oldal a 4-5 csillagos, bekapcsolt véleményeket kapja ===\n')
await ki(TULAJ)
const osszes = (await egy(`select velemenyek_lista() x`)).x
const p1 = await publikus()
t.ok('a demóban hat vélemény van', 6, osszes.length)
t.ok('a 3 csillagos nem kerül ki', osszes.filter((v) => v.aktiv && v.csillag >= 4).length, p1.velemenyek.length)
t.ok('a publikus listában nincs 4 alatti', true, p1.velemenyek.every((v) => v.csillag >= 4))
t.ok('a publikus listában nincs azonosító és kapcsoló', [['csillag', 'datum', 'nev', 'szoveg']],
  [...new Set(p1.velemenyek.map((v) => Object.keys(v).sort().join(',')))].map((x) => x.split(',')))
t.ok('a publikus oldal többi része is megvan', true,
  ['packages', 'packagePricing', 'szovegek', 'adatok', 'nyitvatartas'].every((k) => k in p1))
t.ok('névtelenül a tábla nem olvasható', true,
  /permission denied/.test(await hiba(() => anonkent(() => q(`select * from velemenyek`))) ?? ''))
t.ok('névtelenül a lista nem kérhető', true,
  /permission denied/.test(await hiba(() => anonkent(() => q(`select velemenyek_lista()`))) ?? ''))
t.ok('az alap függvény névtelenül nem hívható', true,
  /permission denied/.test(await hiba(() => anonkent(() => q(`select publikus_oldal_alap()`))) ?? ''))

console.log('\n=== 2) Mentés: sorrend, kikapcsolás, ellenőrzések ===\n')
await ki(TULAJ)
await ment([
  { nev: ' Első Ede ', csillag: 5, szoveg: ' Nagyon jó. ', datum: '2026-10-01', aktiv: true },
  { nev: 'Rejtett Rita', csillag: 5, szoveg: 'Kikapcsolva.', datum: null, aktiv: false },
  { nev: 'Hármas Hugó', csillag: 3, szoveg: 'Közepes.', datum: '', aktiv: true },
  { nev: 'Négyes Nóra', csillag: 4, szoveg: 'Jó.', aktiv: true },
])
await ki(TULAJ)
const l2 = (await egy(`select velemenyek_lista() x`)).x
t.ok('mind a négy megmaradt, a sorrend is', ['Első Ede', 'Rejtett Rita', 'Hármas Hugó', 'Négyes Nóra'], l2.map((v) => v.nev))
t.ok('a szöveg levágva, az üres dátum null', ['Nagyon jó.', null], [l2[0].szoveg, l2[2].datum])
t.ok('publikusan csak Ede és Nóra, sorrendben', ['Első Ede', 'Négyes Nóra'], (await publikus()).velemenyek.map((v) => v.nev))
await ki(TULAJ)
t.ok('név nélkül nem menthető', true, /nevet és a szöveget/.test(await hiba(() => ment([{ nev: ' ', csillag: 5, szoveg: 'x' }])) ?? ''))
t.ok('6 csillag nem menthető', true, /1 és 5/.test(await hiba(() => ment([{ nev: 'A', csillag: 6, szoveg: 'x' }])) ?? ''))
t.ok('csillag nélkül nem menthető', true, /1 és 5/.test(await hiba(() => ment([{ nev: 'A', szoveg: 'x' }])) ?? ''))
t.ok('túl hosszú szöveg nem menthető', true, /1500/.test(await hiba(() => ment([{ nev: 'A', csillag: 5, szoveg: 'x'.repeat(1501) }])) ?? ''))
t.ok('60-nál több nem menthető', true,
  /60/.test(await hiba(() => ment(Array.from({ length: 61 }, (_, i) => ({ nev: `N${i}`, csillag: 5, szoveg: 'x' })))) ?? ''))
await ki(TULAJ)
t.ok('hibás mentés után a régi lista megmaradt', 4, (await egy(`select velemenyek_lista() x`)).x.length)

console.log('\n=== 3) Jogosultság ===\n')
await ki(ALK)
t.ok('az alkalmazott látja a listát', 4, (await egy(`select velemenyek_lista() x`)).x.length)
t.ok('az alkalmazott nem menthet', true, /tulajdonos/.test(await hiba(() => ment([])) ?? ''))
await ki(TULAJ)
await ment([])
await ki(TULAJ)
t.ok('üres lista: nincs vélemény a publikus oldalon', [], (await publikus()).velemenyek)

t.vege()
