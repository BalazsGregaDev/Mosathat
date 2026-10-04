// v40 ellenőrzése Playwrighttal.
//
// Futtatás:  npm run dev -- --port 5180   (másik ablakban)
//            node scripts/v40-teszt.mjs
//
// Amit néz:
//   1. Új menüpont: Igazolólap — minden szerepkörnek. A cégek listája a hónap
//      állásával; „+ Sor" rögtön új sorral nyitja a lapot; a hónapválasztón
//      az év fel-le nyíllal is léptethető.
//   2. Alkalmazott: kitölt, aláírat — de oszlopot nem állít, nem zár le.
//      Tulajdonos: a teljes szerkesztés (Oszlopok és lábléc, lezárás).
//   3. Kész van → megnyílik az aláírás; Átvette csak kitöltött sor után;
//      lezárt (átvett) időpontnál is aláírható.
import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
async function belep(p, email = 'tulaj@mosathat.hu') {
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
}
async function menu(p, nev) {
  if (await p.locator('.mobil-fejlec .hamburger').isVisible()) {
    await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
    await p.locator('.fiok button').filter({ hasText: nev }).first().click()
  } else {
    await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  }
  await p.waitForTimeout(1500)
}
async function rajzol(p, vaszon) {
  const v = await vaszon.boundingBox()
  await p.mouse.move(v.x + 30, v.y + 70)
  await p.mouse.down()
  for (let i = 1; i <= 8; i++) await p.mouse.move(v.x + 30 + i * 25, v.y + 70 + (i % 2 ? -25 : 25))
  await p.mouse.up()
}

// =============================================================================
console.log('=== 1-2) Alkalmazott: Igazolólap menüpont ===\n')
const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } })
const a = await ctx.newPage()
a.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(a, 'alkalmazott@mosathat.hu')
const ma = await a.evaluate(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(new Date()))
ok('az alkalmazottnak is van Igazolólap menüpont', 1,
  await a.locator('aside.oldalsav button').filter({ hasText: /^Igazolólap$/ }).count())
await menu(a, 'Igazolólap')
{
  const sor = a.locator('.igazolo-ceg').filter({ hasText: 'Autó Trans' })
  ok('a listában a szerződéses cég', 1, await sor.count())
  ok('a hónap állása: még nincs sora', true, (await sor.innerText()).includes('nincs sora'))

  // Év fel-le nyíllal
  const ev = Number(ma.slice(0, 4))
  await a.getByRole('button', { name: 'Következő év' }).click()
  await a.waitForTimeout(600)
  ok('▲: egy évvel később', true, (await a.locator('.igazolo-oldal-fej .honap-nev').innerText()).startsWith(String(ev + 1)))
  ok('az év mező is követi', String(ev + 1), await a.locator('.honap-ugras input[aria-label="Év"]').inputValue())
  await a.getByRole('button', { name: 'Előző év' }).click()
  await a.getByRole('button', { name: 'Előző év' }).click()
  await a.waitForTimeout(600)
  ok('▼▼: egy évvel korábban', true, (await a.locator('.igazolo-oldal-fej .honap-nev').innerText()).startsWith(String(ev - 1)))
  await a.getByRole('button', { name: 'Következő év' }).click()
  await a.waitForTimeout(800)

  // + Sor: rögtön új sorral nyílik
  await sor.getByRole('button', { name: '+ Sor' }).click()
  const urlap = a.locator('[aria-label="Igazolólap sora"]')
  await urlap.waitFor()
  ok('„+ Sor": rögtön az új sor nyílik, a mai nappal', ma, await urlap.locator('#ig-nap').inputValue())
  await urlap.locator('#ig-rsz').fill('LST-001')
  await urlap.locator('#ig-km').fill('55000')
  await urlap.getByRole('button', { name: 'Mentés' }).click()
  await a.waitForTimeout(1200)
  const lap = a.locator('.lap-igazolo')
  ok('a sor a lapon', 1, await lap.locator('.igazolo-tabla tbody tr').count())
  ok('alkalmazott: nincs Oszlopok és lábléc', 0, await lap.getByRole('button', { name: 'Oszlopok és lábléc' }).count())
  ok('alkalmazott: nincs Hónap lezárása', 0, await lap.getByRole('button', { name: 'Hónap lezárása' }).count())
  // Aláíratás utólag: a sorra kattintva
  await lap.locator('.igazolo-tabla tbody tr').first().click()
  await urlap.waitFor()
  await rajzol(a, urlap.locator('.alairas-vaszon'))
  await urlap.getByRole('button', { name: 'Mentés' }).click()
  await a.waitForTimeout(1200)
  ok('aláíratva', 1, await lap.locator('.alairas-mini').count())
  await lap.locator('.lap-lab button').filter({ hasText: 'Bezárás' }).click()
  await a.waitForTimeout(1200)
  ok('a lista frissült: 1 autó, nincs hiányzó aláírás', [true, false],
    [(await sor.innerText()).includes('1 autó'), (await sor.innerText()).includes('aláírás hiányzik')])
  await a.screenshot({ path: '/tmp/v40-lista.png' })
}
await ctx.close()

// =============================================================================
console.log('\n=== 2) Tulajdonos: teljes szerkesztés a menüpontból ===\n')
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 950 } })
const t = await ctx2.newPage()
t.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(t)
await menu(t, 'Igazolólap')
{
  await t.locator('.igazolo-ceg').filter({ hasText: 'Autó Trans' }).getByRole('button', { name: 'Megnyitás' }).click()
  await t.waitForSelector('.lap-igazolo')
  await t.waitForTimeout(800)
  const lap = t.locator('.lap-igazolo')
  ok('tulajdonos: Oszlopok és lábléc', 1, await lap.getByRole('button', { name: 'Oszlopok és lábléc' }).count())
  ok('tulajdonos: Word letöltés', 1, await lap.getByRole('button', { name: 'Word letöltés' }).count())
  await lap.locator('.lap-lab button').filter({ hasText: 'Bezárás' }).click()
  await t.waitForTimeout(500)
}

console.log('\n=== 3) Kész van → aláírás; Átvette csak kitöltött sor után ===\n')
await menu(t, 'Időpontok')
{
  // Az Autó Trans mai hozom-viszem autója: még „Megérkezett" a következő lépés.
  const kartya = t.locator('.napi-lista .kartya')
    .filter({ has: t.locator('button', { hasText: /^Igazolólap$/ }) })
    .filter({ has: t.locator('button', { hasText: /^Megérkezett$/ }) }).first()
  const rendszam = (await kartya.locator('.rendszam').innerText()).trim()
  const ez = t.locator('.napi-lista .kartya').filter({ has: t.locator('.rendszam', { hasText: rendszam }) }).first()
  await ez.getByRole('button', { name: 'Megérkezett' }).click()
  await t.waitForTimeout(1200)
  ok('Megérkezett után nem nyílik lap', 0, await t.locator('[aria-label="Igazolólap sora"]').count())

  await ez.getByRole('button', { name: 'Kész van' }).click()
  await t.waitForTimeout(300)
  await t.locator('.kerdes-gombok .btn-fo').click()        // „Biztosan elkészült?" — Igen
  await t.waitForTimeout(1500)
  const urlap = t.locator('[aria-label="Igazolólap sora"]')
  ok('Kész van után megnyílik az aláírás', 1, await urlap.count())
  ok('felül a magyarázó mondat', true, (await urlap.locator('.igazolo-uzenet').innerText()).includes('elkészült'))
  ok('a foglalás közben Kész állapotba került', 'READY', await ez.getAttribute('data-allapot'))
  await urlap.getByRole('button', { name: 'Mégse' }).click()
  await t.waitForTimeout(400)

  // Átvette: a sor még nincs kitöltve → előbb a sor
  await ez.getByRole('button', { name: 'Átvette' }).click()
  await t.waitForTimeout(1200)
  ok('Átvette: előbb a sor nyílik', 1, await urlap.count())
  ok('a mondat: átadás előtt töltsd ki', true, (await urlap.locator('.igazolo-uzenet').innerText()).includes('Átadás előtt'))
  await urlap.getByRole('button', { name: 'Mégse' }).click()
  await t.waitForTimeout(600)
  ok('Mégse: nem zárult le', 'READY', await ez.getAttribute('data-allapot'))

  await ez.getByRole('button', { name: 'Átvette' }).click()
  await urlap.waitFor()
  await urlap.locator('#ig-km').fill('77000')
  await urlap.getByRole('button', { name: 'Mentés' }).click()
  await t.waitForTimeout(600)
  ok('mentés után jön a lezárás kérdése', true,
    (await t.locator('.kerdes-ablak').innerText()).includes('Biztosan átvette'))
  await t.locator('.kerdes-gombok .btn-fo').click()
  await t.waitForTimeout(1500)
  ok('lezárva (átvette)', 'COMPLETED', await ez.getAttribute('data-allapot'))

  // Lezárt időpontnál is aláírható
  await ez.getByRole('button', { name: 'Igazolólap' }).click()
  await urlap.waitFor()
  ok('lezárt időpontnál is nyílik, a km megvan', '77000', await urlap.locator('#ig-km').inputValue())
  ok('és szerkeszthető', false, await urlap.locator('#ig-km').isDisabled())
  await rajzol(t, urlap.locator('.alairas-vaszon'))
  await urlap.getByRole('button', { name: 'Mentés' }).click()
  await t.waitForTimeout(1000)
  await ez.getByRole('button', { name: 'Igazolólap' }).click()
  await urlap.waitFor()
  ok('az aláírás elmentve lezárt időpontnál is', 1, await urlap.locator('.alairas-kep img').count())
  await urlap.getByRole('button', { name: 'Mégse' }).click()
}
await ctx2.close()

// =============================================================================
console.log('\n=== 4) Telefon: a lista nem lóg ki ===\n')
const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const m = await ctx3.newPage()
await belep(m, 'alkalmazott@mosathat.hu')
await menu(m, 'Igazolólap')
{
  const r = await m.evaluate(() => {
    const t = document.querySelector('.tartalom')
    return { sw: t.scrollWidth, cw: t.clientWidth }
  })
  ok('nem lóg ki oldalra', true, r.sw <= r.cw + 1)
  await m.screenshot({ path: '/tmp/v40-mobil.png' })
}
await ctx3.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
