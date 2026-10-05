// v43 ellenőrzése Playwrighttal.
//
// Futtatás:  npm run dev -- --port 5180   (másik ablakban)
//            node scripts/v43-teszt.mjs
//
// Amit néz:
//   1. Új időpont: „Kérdőjeles (???)" gomb a Mikor részben; kisbetűs rendszám
//      nagybetűvel jelenik meg; a napi, heti és havi nézetben „???" a rendszám
//      mellett.
//   2. Napi kártya: „Nem fért be" gomb (csak kérdőjelesnél) → lezárva 0 Ft-tal,
//      „nem fért be" címke.
//   3. Munkalap: Kérdőjeles kapcsoló, „Nem fért be" gomb a lábban.
//   4. Érintőképernyő: a gyári időválasztó helyett saját gombos panel.
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
async function ujNyit(p) {
  if (await p.locator('.fab').isVisible()) await p.locator('.fab').click()
  else await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click()
  await p.waitForTimeout(1500)
}
async function ujFoglalas(p, rsz, nev, tel, kerdojeles, datum) {
  await ujNyit(p)
  if (datum) await p.locator('#datum').fill(datum)
  await p.locator('#rendszam').fill(rsz)
  await p.locator('#nev').fill(nev)
  await p.locator('#tel').fill(tel)
  await p.locator('.lap-torzs').click({ position: { x: 5, y: 5 } })
  if (kerdojeles) await p.locator('.kerdojel-gomb').click()
  await p.waitForTimeout(400)
  await p.getByRole('button', { name: 'Foglalás rögzítése' }).click()
  await p.waitForTimeout(2000)
}

// =============================================================================
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(p)
await menu(p, 'Időpontok')

console.log('=== 1) Kérdőjeles új időpont, nagybetűs rendszám ===\n')
await ujNyit(p)
ok('a Mikor részben ott a Kérdőjeles gomb', 1, await p.locator('.kerdojel-gomb').count())
await p.locator('.lap-fej .bezar').click(); await p.waitForTimeout(500)
await ujFoglalas(p, 'kq-001', 'Kérdő Kálmán', '+36301110043', true)
await ujFoglalas(p, 'kq-002', 'Kérdő Klára', '+36301110044', true)
// Egy kérdőjeles egy hét múlva is: a havi nézet zsúfolt mai cellája helyett
// azon a csendes napon nézzük meg.
const hetMulva = await p.evaluate(() => {
  const d = new Date(); d.setDate(d.getDate() + 7)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(d)
})
await ujFoglalas(p, 'kq-003', 'Kérdő Kornél', '+36301110045', true, hetMulva)
{
  const k = p.locator('.napi-lista .kartya').filter({ hasText: 'KQ-001' })
  ok('a rendszám nagybetűvel', 'KQ-001', (await k.locator('.rendszam').innerText()).trim())
  ok('napi nézet: „???" a rendszám mellett', '???', (await k.locator('.cimke-pill.kerdojel').innerText()).trim())
  ok('a „???" közvetlenül a rendszám után', true, await k.evaluate((el) =>
    el.querySelector('.rendszam').nextElementSibling?.classList.contains('kerdojel')))
  ok('nem kérdőjelesen nincs „Nem fért be" gomb', 0,
    await p.locator('.napi-lista .kartya').filter({ hasText: 'ABC-123' })
      .getByRole('button', { name: 'Nem fért be' }).count())
}
await p.locator('.fejlec .nezetvalto button').filter({ hasText: /^Hét$/ }).click()
await p.waitForTimeout(1500)
ok('heti nézet: „???"', true, (await p.locator('.minikartya, .hetsav').filter({ hasText: 'KQ-001' }).first().innerText()).includes('???'))
await p.locator('.fejlec .nezetvalto button').filter({ hasText: 'Hónap' }).click()
await p.waitForTimeout(1500)
ok('havi nézet: „???"', true, (await p.locator('.minikartya, .honap-sav').filter({ hasText: 'KQ-003' }).first().innerText()).includes('???'))
await p.locator('.fejlec .nezetvalto button').filter({ hasText: /^Nap$/ }).click()
await p.waitForTimeout(1500)

console.log('\n=== 2) Nem fért be a kártyán ===\n')
{
  const k = p.locator('.napi-lista .kartya').filter({ hasText: 'KQ-001' })
  await k.getByRole('button', { name: 'Nem fért be' }).click()
  await p.waitForTimeout(300)
  ok('rákérdez', true, (await p.locator('.kerdes-ablak h2').innerText()).startsWith('Nem fért be?'))
  await p.locator('.kerdes-gombok button').filter({ hasText: 'Nem fért be' }).click()
  await p.waitForTimeout(1500)
  ok('lezárva', 'COMPLETED', await k.getAttribute('data-allapot'))
  ok('0 Ft', true, (await k.locator('.ar-kiemelt').innerText()).replace(/\s/g, '') === '0Ft')
  ok('„nem fért be" címke', 1, await k.locator('.cimke-pill.nem-fert-be').count())
  ok('nincs már „Nem fért be" gomb', 0, await k.getByRole('button', { name: 'Nem fért be', exact: true }).count())
}

console.log('\n=== 3) Munkalap ===\n')
{
  await p.locator('.napi-lista .kartya').filter({ hasText: 'KQ-002' }).locator('.kartya-nyit').click()
  await p.waitForTimeout(1200)
  const kap = p.getByRole('switch', { name: 'Kérdőjeles (feltételesen vállalt)' })
  ok('a Kérdőjeles kapcsoló be van kapcsolva', 'true', await kap.getAttribute('aria-checked'))
  ok('a fejlécben „???"', true, (await p.locator('.lap-fej h2').innerText()).includes('???'))
  ok('a lábban „Nem fért be"', 1, await p.locator('.munkalap-lab').getByRole('button', { name: 'Nem fért be' }).count())
  await kap.click(); await p.waitForTimeout(800)
  ok('kikapcsolva: eltűnik a gomb', 0, await p.locator('.munkalap-lab').getByRole('button', { name: 'Nem fért be' }).count())
  await kap.click(); await p.waitForTimeout(800)
  await p.locator('.munkalap-lab').getByRole('button', { name: 'Nem fért be' }).click()
  await p.waitForTimeout(300)
  await p.locator('.kerdes-gombok button').filter({ hasText: 'Nem fért be' }).click()
  await p.waitForTimeout(1500)
  ok('lezárva, a fejlécben „nem fért be"', true, (await p.locator('.lap-fej h2').innerText()).includes('nem fért be'))
  // Visszanyitás: a jelölés eltűnik
  await p.locator('.munkalap-lab').getByRole('button', { name: 'Visszanyit' }).click()
  await p.waitForTimeout(1500)
  ok('visszanyitva: újra „???"', true, (await p.locator('.lap-fej h2').innerText()).includes('???'))
  await p.keyboard.press('Escape'); await p.waitForTimeout(500)
}
await p.screenshot({ path: '/tmp/v43-nap.png' })
await ctx.close()

// =============================================================================
console.log('\n=== 4) Tablet: saját időválasztó ===\n')
const ctx2 = await b.newContext({ viewport: { width: 800, height: 1280 }, isMobile: true, hasTouch: true })
const t = await ctx2.newPage()
t.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(t)
await menu(t, 'Időpontok')
{
  await ujNyit(t)
  ok('az óra mező nem gyári időmező, hanem gomb', ['BUTTON', 0],
    [await t.locator('#leadas').evaluate((e) => e.tagName), await t.locator('input[type="time"]').count()])
  await t.locator('#leadas').click()
  await t.waitForTimeout(300)
  ok('megnyílt a panel', 1, await t.locator('.ido-ablak').count())
  const gomb = await t.locator('.ido-ablak .ido-orak button').first().boundingBox()
  ok('a gombok ujjal is eltalálhatók (legalább 44 px magasak)', true, gomb.height >= 44)
  await t.screenshot({ path: '/tmp/v43-idovalaszto.png' })
  await t.locator('.ido-ablak .ido-orak button').filter({ hasText: /^10$/ }).click()
  ok('óra után még nyitva', 1, await t.locator('.ido-ablak').count())
  await t.locator('.ido-ablak .ido-percek button').filter({ hasText: ':30' }).click()
  await t.waitForTimeout(300)
  ok('perc után bezárul', 0, await t.locator('.ido-ablak').count())
  ok('a mezőben 10:30', '10:30', (await t.locator('#leadas').innerText()).trim())
  // Escape csak a panelt zárja, az űrlapot nem
  await t.locator('#atvetel').click(); await t.waitForTimeout(300)
  await t.keyboard.press('Escape'); await t.waitForTimeout(300)
  ok('Escape: a panel bezárul, az űrlap marad', [0, 1],
    [await t.locator('.ido-ablak').count(), await t.locator('.lap[aria-label="Új időpont"]').count()])
}
await ctx2.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
