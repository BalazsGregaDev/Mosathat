import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const szam = (s) => Number(String(s).replace(/[^0-9]/g, ''))
async function menu(p, nev) {
  await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  await p.waitForTimeout(1500)
}

const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(2500)

console.log('=== 1) Szerződés: Flottás autók ===\n')
await menu(p, 'Cégek és bérletesek')
{
  const kartya = p.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).first()
  await kartya.locator('.kartya-nyito').click(); await p.waitForTimeout(300)
  await kartya.getByRole('button', { name: 'Szerkesztés' }).click(); await p.waitForTimeout(800)
  const urlap = p.locator('[aria-label="Szerződés"]')
  const cs = urlap.getByRole('switch', { name: 'Flottás autók' })
  ok('a csúszka alapból ki', 'false', await cs.getAttribute('aria-checked'))
  await cs.click()
  await urlap.getByRole('button', { name: 'Mentés' }).click(); await p.waitForTimeout(1500)
  if ((await kartya.getAttribute('data-nyitva')) !== 'true') {
    await kartya.locator('.kartya-nyito').click(); await p.waitForTimeout(300)
  }
  ok('a kártyán: Flottás autók igen', true,
    (await kartya.locator('.adatsor').filter({ hasText: 'Flottás autók' }).innerText()).includes('igen'))
}

console.log('\n=== 2) Új időpont: Autó hozzáadása ===\n')
await menu(p, 'Időpontok')
await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click()
await p.waitForTimeout(1500)
{
  const lap = p.locator('.lap[aria-label="Új időpont"]')
  await p.locator('#nev').fill('Flotta Feri')
  await p.locator('#tel').fill('+36301239876')
  await p.locator('#ceg').fill('Autó Tr'); await p.waitForTimeout(700)
  await p.locator('.ceg-kereso .talalatsor').first().click(); await p.waitForTimeout(1200)
  const gomb = lap.getByRole('button', { name: '+ Autó hozzáadása' })
  ok('flottás cégnél ott a gomb', 1, await gomb.count())
  const egy = szam(await lap.locator('.lap-lab .osszeg .ertek').innerText())
  await gomb.click(); await gomb.click(); await gomb.click()
  await p.waitForTimeout(800)
  ok('3 nyomás: 3 darab', '3 darab', (await lap.locator('.flotta-hozzaad .flotta-db').innerText()).trim())
  ok('a rendszám mező tiltva', true, await p.locator('#rendszam').isDisabled())
  ok('a Mikor: nap + végső idő (Kész legyen), nincs Hozza/Viszi', [1, 0],
    [await lap.locator('label[for="vegso"]').count(), await lap.locator('#leadas').count()])
  await lap.locator('#vegso').fill('17:00')
  ok('az ár 3 × egy autó', egy * 3, szam(await lap.locator('.lap-lab .osszeg .ertek').innerText()))
  await lap.getByRole('button', { name: 'Eggyel kevesebb autó' }).click()
  await gomb.click()
  ok('a gomb felirata: 3 autó rögzítése', 1, await lap.getByRole('button', { name: '3 autó rögzítése' }).count())
  await lap.getByRole('button', { name: '3 autó rögzítése' }).click()
  await p.waitForTimeout(2500)
  ok('elment, az ablak bezárult', 0, await p.locator('.lap[aria-label="Új időpont"]').count())
}

console.log('\n=== 3) Napi nézet: egy kártya ===\n')
const fk = p.locator('.napi-lista .flotta-kartya').first()
{
  ok('egy csoportkártya', 1, await p.locator('.napi-lista .flotta-kartya').count())
  ok('a cég neve és a darabszám', true, /autó trans kft\./i.test(await fk.locator('.flotta-nev').innerText())
    && (await fk.locator('.flotta-db').innerText()).includes('3 darab'))
  ok('a végső idő', '17:00-ig', (await fk.locator('.ido').innerText()).trim())
  ok('a nap elején (első kártya)', true, await p.evaluate(() =>
    document.querySelector('.napi-lista .kartya').classList.contains('flotta-kartya')))
  ok('autónként címke: 1–3. autó', ['1. autó', '2. autó', '3. autó'], await fk.locator('.flotta-auto').allInnerTexts())
  await fk.screenshot({ path: '/tmp/v46-kartya.png' })
}

console.log('\n=== 4) A csoport munkalapja ===\n')
await fk.getByRole('button', { name: 'Autók' }).click()
await p.waitForTimeout(1500)
const ml = p.locator('[aria-label="Flottás csoport"]')
{
  ok('a munkalap nyílt, 3 autósor', 3, await ml.locator('.flotta-sor').count())
  ok('közös: a végső idő egyszer', 1, await ml.getByRole('button', { name: 'Végső időpont' }).count()
    || await ml.locator('input[aria-label="Végső időpont"]').count())
  const r1 = ml.getByLabel('1. autó rendszáma')
  await r1.fill('rai-101'); await r1.press('Enter')
  await p.waitForTimeout(1500)
  ok('a rendszám mentve, nagybetűvel', 'RAI-101', await ml.getByLabel('1. autó rendszáma').inputValue())
  await ml.getByLabel('2. autó mérete').selectOption('SUV')
  await p.waitForTimeout(1500)
  ok('a 2. autó SUV, az 1. marad', ['SUV', 'SZEMELYAUTO'],
    [await ml.getByLabel('2. autó mérete').inputValue(), await ml.getByLabel('1. autó mérete').inputValue()])
  ok('autósorokon nincs Megérkezett gomb', 0, await ml.locator('.flotta-sor').getByRole('button', { name: 'Megérkezett' }).count())
  ok('a léptető: 0 / 3 kész, most az 1. autó', true,
    (await ml.locator('.flotta-lepteto').innerText()).includes('0 / 3') && (await ml.locator('.flotta-lepteto').innerText()).includes('RAI-101'))
  await ml.locator('.flotta-lepteto').getByRole('button', { name: 'Kész, jöhet a következő' }).click()
  await p.waitForTimeout(1500)
  ok('kész autóhoz megnyílt az igazolólap sora', 1, await p.locator('[aria-label="Igazolólap sora"]').count())
  await p.locator('[aria-label="Igazolólap sora"]').getByRole('button', { name: 'Mégse' }).click()
  await p.waitForTimeout(1200)
  ok('1 / 3 kész, most a 2. autó', true, (await ml.locator('.flotta-lepteto').innerText()).includes('1 / 3')
    && (await ml.locator('.flotta-lepteto').innerText()).includes('2. autó'))
  ok('az 1. autó sora: kész, a 2. most ez', ['kész', 'most ez'], [
    (await ml.locator('.flotta-sor').nth(0).locator('.flotta-allapot').innerText()).trim(),
    (await ml.locator('.flotta-sor').nth(1).locator('.flotta-allapot').innerText()).trim()])
  await ml.locator('.flotta-lepteto').getByRole('button', { name: 'Vissza egy autót' }).click()
  await p.waitForTimeout(1200)
  ok('−: vissza 0 / 3-ra', true, (await ml.locator('.flotta-lepteto').innerText()).includes('0 / 3'))
  await ml.getByRole('button', { name: '+ Autó hozzáadása' }).click()
  await p.waitForTimeout(1500)
  ok('+ autó: 4 sor', 4, await ml.locator('.flotta-sor').count())
  ok('a fejlécben 4 darab', true, (await ml.locator('.lap-fej').innerText()).includes('4 darab'))
  await ml.locator('.flotta-sor').first().getByRole('button', { name: 'Részletek' }).click()
  await p.waitForTimeout(1500)
  ok('egy autó munkalapja nyílik (a rendszámával)', true,
    (await p.locator('.lap[aria-label="Munkalap"] .lap-fej h2').innerText().catch(() => '')).includes('RAI-101'))
  await p.keyboard.press('Escape'); await p.waitForTimeout(600)
  ok('Escape: csak az egy autóé zárul, a csoporté marad', 1, await ml.count())
  await p.screenshot({ path: '/tmp/v46-munkalap.png' })
  await ml.locator('.lap-fej .bezar').click(); await p.waitForTimeout(1500)
}
ok('a kártyán a rendszám már látszik', true, (await fk.locator('.flotta-autok').innerText()).includes('RAI-101'))
ok('a kártyán 4 darab', true, (await fk.locator('.flotta-db').innerText()).includes('4 darab'))

console.log('\n=== 5) Léptető a napi kártyán ===\n')
{
  const lep = fk.locator('.flotta-lepteto')
  ok('a kártyán is ott a léptető: 0 / 4', true, (await lep.innerText()).includes('0 / 4'))
  await lep.getByRole('button', { name: 'Kész, jöhet a következő' }).click()
  await p.waitForTimeout(1500)
  if (await p.locator('[aria-label="Igazolólap sora"]').count()) {
    await p.locator('[aria-label="Igazolólap sora"]').getByRole('button', { name: 'Mégse' }).click()
    await p.waitForTimeout(1200)
  }
  ok('1 / 4 kész, a kártya „dolgozunk" színű', [true, 'IN_PROGRESS'],
    [(await fk.locator('.flotta-lepteto').innerText()).includes('1 / 4'), await fk.getAttribute('data-allapot')])
  await fk.screenshot({ path: '/tmp/v47-kartya.png' })
}

await ctx.close()
await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
