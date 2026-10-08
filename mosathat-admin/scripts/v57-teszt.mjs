// v57: heti nézet (többnaposak legfelül), idővonal rendszám pontok nélkül,
// „Nem fért be" minden autónál, „Mindennel elkészültünk", és a tulajdonos /
// fejlesztő bárkinek beírhatja, módosíthatja, törölheti a munkaidejét és a
// szabadságát.
import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
async function belep(email) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
  return p
}
const menu = async (p, n) => { await p.locator('aside.oldalsav button').filter({ hasText: n }).first().click(); await p.waitForTimeout(1500) }
const nap = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const p = await belep('tulaj@mosathat.hu')
await menu(p, 'Időpontok')

console.log('=== 1) heti nézet: a többnaposak legfelül, alattuk a napnevek ===\n')
await p.locator('.fejlec .nezetvalto button').filter({ hasText: /^Hét$/ }).click(); await p.waitForTimeout(1500)
const r = await p.evaluate(() => ({
  sav: document.querySelector('.hetsavok')?.getBoundingClientRect().bottom,
  fej: document.querySelector('.hetfejsor')?.getBoundingClientRect().top,
  oszlop: document.querySelector('.hetracs:not(.hetfejsor)')?.getBoundingClientRect().top,
}))
ok('sávok → napnevek → aznapi foglalások', true, r.sav <= r.fej && r.fej < r.oszlop)
await p.locator('.fejlec .nezetvalto button').filter({ hasText: /^Nap$/ }).click(); await p.waitForTimeout(1500)

console.log('\n=== 2) idővonal: a rendszám pontok nélkül ===\n')
ok('text-overflow: clip', 'clip', await p.locator('.iv-darab span').first().evaluate((e) => getComputedStyle(e).textOverflow))

console.log('\n=== 3) „Nem fért be" nem kérdőjeles autónál ===\n')
const k = p.locator('.napi-lista .kartya').filter({ hasText: 'LMN-882' }).first()
ok('nem kérdőjeles', 0, await k.locator('.kerdojel, [data-kerdojel]').count())
ok('van „Nem fért be" gomb', 1, await k.getByRole('button', { name: 'Nem fért be' }).count())
await k.getByRole('button', { name: 'Nem fért be' }).click(); await p.waitForTimeout(300)
await p.locator('.kerdes-gombok .btn-veszelyes-teli, .kerdes-gombok .btn-fo').last().click(); await p.waitForTimeout(1500)
ok('lezárva (Átvette állapot), 0 Ft', ['COMPLETED', '0 Ft'], [await k.getAttribute('data-allapot'), (await k.locator('.ar-kiemelt').innerText()).trim()])

console.log('\n=== 4) Kész van: „Mindennel elkészültünk" ===\n')
const a = p.locator('.napi-lista .kartya').filter({ hasText: 'ABC-123' }).first()
await a.getByRole('button', { name: 'Kész van' }).click(); await p.waitForTimeout(1000)
const ablak = p.locator('.kesz-ablak')
ok('három gomb: Mégse, Mindennel elkészültünk, Kész van, a többi kimaradt',
  ['Mégse', 'Mindennel elkészültünk', 'Kész van, a többi kimaradt'],
  (await ablak.locator('.kerdes-gombok button').allTextContents()).map((x) => x.trim()))
await ablak.getByRole('button', { name: 'Mindennel elkészültünk' }).click(); await p.waitForTimeout(1800)
const [d, o] = (await a.locator('.lista-jelzo').innerText()).trim().split('/').map(Number)
ok('minden pont kipipálva, Kész állapot', [true, 'READY'], [d === o && o > 0, await a.getAttribute('data-allapot')])

console.log('\n=== 5) tulajdonos: más munkaideje ===\n')
await menu(p, 'Profilom')
await p.selectOption('#mv-kinek', { label: 'Gábor' })
await p.fill('#mv-nap', nap(3))
await p.locator('#munkaido-urlap .valaszto button').filter({ hasText: 'Egész nap nincs bent' }).click()
await p.fill('#mv-megj', 'teszt-tulaj')
await p.getByRole('button', { name: 'Bejelentés' }).click(); await p.waitForTimeout(1200)
const sorM = p.locator('.valtozas-lista').first().locator('li').filter({ hasText: 'teszt-tulaj' })
ok('Gábor változása a listában', true, (await sorM.innerText()).includes('Gábor'))
await sorM.getByRole('button', { name: 'Módosítás' }).click(); await p.waitForTimeout(300)
ok('módosításnál a Kinek: Gábor', 'Gábor', await p.locator('#mv-kinek option:checked').innerText())
await p.fill('#mv-megj', 'teszt-tulaj-2')
await p.getByRole('button', { name: 'Módosítás mentése' }).click(); await p.waitForTimeout(1200)
const sorM2 = p.locator('.valtozas-lista').first().locator('li').filter({ hasText: 'teszt-tulaj-2' })
ok('módosítva', 1, await sorM2.count())
await sorM2.getByRole('button', { name: 'Törlés' }).click(); await p.waitForTimeout(300)
await p.locator('.kerdes-gombok .btn-veszelyes-teli').click(); await p.waitForTimeout(1200)
ok('törölve', 0, await p.locator('.valtozas-lista li').filter({ hasText: 'teszt-tulaj' }).count())

console.log('\n=== 6) tulajdonos: más szabadsága ===\n')
const sz = p.locator('#szabadsag-urlap')
await sz.locator('#sz-kinek').selectOption({ label: 'Péter' })
await sz.locator('#sz-tol').fill(nap(20)); await sz.locator('#sz-ig').fill(nap(21))
await sz.locator('#sz-megj').fill('szabi-teszt')
await sz.getByRole('button', { name: 'Szabadság rögzítése' }).click(); await p.waitForTimeout(1200)
const sorS = sz.locator('.valtozas-lista li').filter({ hasText: 'szabi-teszt' })
ok('Péter szabadsága a listában', true, (await sorS.innerText()).includes('Péter'))
await sorS.getByRole('button', { name: 'Módosítás' }).click(); await p.waitForTimeout(300)
await sz.locator('#sz-ig').fill(nap(22))
await sz.getByRole('button', { name: 'Módosítás mentése' }).click(); await p.waitForTimeout(1200)
ok('módosítva (három nap)', true, /–\d+\.|\. – /.test(await sz.locator('.valtozas-lista li').filter({ hasText: 'szabi-teszt' }).innerText()))
await sz.locator('.valtozas-lista li').filter({ hasText: 'szabi-teszt' }).getByRole('button', { name: 'Törlés' }).click()
await p.waitForTimeout(300)
await p.locator('.kerdes-gombok .btn-veszelyes-teli').click(); await p.waitForTimeout(1200)
ok('törölve', 0, await sz.locator('.valtozas-lista li').filter({ hasText: 'szabi-teszt' }).count())

console.log('\n=== 7) fejlesztő: ugyanez ===\n')
const f = await belep('demo@mosathat.hu')
await menu(f, 'Profilom')
const fsz = f.locator('#szabadsag-urlap')
ok('a fejlesztőnél is van Kinek választó (munkaidő és szabadság)', [1, 1],
  [await f.locator('#mv-kinek').count(), await fsz.locator('#sz-kinek').count()])
await fsz.locator('#sz-kinek').selectOption({ label: 'Gábor' })
await fsz.locator('#sz-tol').fill(nap(25))
await fsz.getByRole('button', { name: 'Szabadság rögzítése' }).click(); await f.waitForTimeout(1200)
ok('Gábor szabadsága rögzítve a fejlesztőtől', true, (await fsz.locator('.valtozas-lista').innerText()).includes('Gábor'))

console.log('\n=== 8) Időpontfoglalás: ebédszünetben nincs ajánlott időpont ===\n')
await menu(f, 'Időpontfoglalás')
const m = f.locator('.fogl')
await m.locator('.fogl-csomag', { has: f.locator('.nev', { hasText: /^Start$/ }) }).click()
await m.locator('.fogl-valaszto button').filter({ hasText: 'Megvárom' }).click(); await f.waitForTimeout(3500)
await m.locator('.fogl-nap[data-allapot="szabad"], .fogl-nap[data-allapot="keves"]').first().click(); await f.waitForTimeout(500)
const idok = (await m.locator('.fogl-idok button').allTextContents()).map((x) => x.split('–')[0].trim())
console.log(`         kezdések: ${idok.join(', ')}`)
ok('nincs 11:30, 12:00, 12:30', [false, false, false], ['11:30', '12:00', '12:30'].map((t) => idok.includes(t)))

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
