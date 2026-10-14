import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const sima = (s) => s.replace(/\s+/g, ' ').trim()

async function belep(email, viewport = { width: 1600, height: 1000 }) {
  const ctx = await b.newContext({ viewport })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
  return { ctx, p, hibak }
}

console.log('=== 1) Arculat menüpont ===\n')
const { ctx, p, hibak } = await belep('tulaj@mosathat.hu')
const menu = p.locator('aside.oldalsav button').filter({ hasText: 'Arculat' })
ok('a tulaj látja', 1, await menu.count())
await menu.click(); await p.waitForTimeout(2500)
const lista = p.locator('.arculat-lista button')
ok('mind a 8 koncepció a listában', 8, await lista.count())
ok('alapból az első', '01', await p.locator('.kv').getAttribute('data-k'))
const fej = (await p.locator('.kv-tabla thead th:not(.kv-fej-bal)').allInnerTexts()).map(sima)
ok('a táblázat fejléce a valódi csomagokkal és árakkal', ['Start 12 800 Ft', 'Premium 15 600 Ft', 'Elit 19 800 Ft'],
  fej.map((x) => x.replace(/START|PREMIUM|ELIT/, (m) => m.charAt(0) + m.slice(1).toLowerCase())))
ok('benne van a takarítás is', true, (await p.locator('.kv-csoport').allInnerTexts()).map(sima).some((x) => /takarítás/i.test(x)))
const falc = (await p.locator('.kv-tabla tbody tr').filter({ hasText: 'Falc áttörlés' }).locator('td').allInnerTexts()).map(sima)
ok('különböző szintű tétel szöveggel', ['áttörlés', 'áttörlés', 'mélytisztítás'], falc)
ok('a jobb változat kiemelve', 'true',
  await p.locator('.kv-tabla tbody tr').filter({ hasText: 'Falc áttörlés' }).locator('.kv-mas').nth(2).getAttribute('data-kiemelt'))

console.log('\n=== 2) Váltás ===\n')
for (const kod of ['02', '03', '04', '05', '06', '07', '08']) {
  await lista.filter({ hasText: kod }).click(); await p.waitForTimeout(300)
  ok(`${kod}: megjelenik`, kod, await p.locator('.kv').getAttribute('data-k'))
}
await p.locator('.arculat-valto button').filter({ hasText: 'Sötét' }).click(); await p.waitForTimeout(300)
ok('sötét mód', 'sotet', await p.locator('.kv').getAttribute('data-mod'))
await p.locator('.arculat-valto button').filter({ hasText: 'Telefon' }).click(); await p.waitForTimeout(500)
ok('telefon szélesség', 390, await p.locator('.arculat-keret').evaluate((e) => e.offsetWidth))
ok('telefonon a menü a logó alá kerül', 'column', await p.locator('.kv-nav').evaluate((e) => getComputedStyle(e).flexDirection))
await p.locator('.arculat-valto button').filter({ hasText: 'Asztali' }).click(); await p.waitForTimeout(500)
ok('asztalin egy sorban', 'row', await p.locator('.kv-nav').evaluate((e) => getComputedStyle(e).flexDirection))
const betuk = await p.evaluate(async () => {
  await document.fonts.ready
  return ['Barlow Condensed', 'Spectral', 'Archivo Variable', 'Jost Variable', 'Courier Prime', 'Bodoni Moda Variable', 'IBM Plex Mono']
    .filter((f) => !document.fonts.check(`16px "${f}"`))
})
ok('a betűk helyben vannak, Google nélkül', [], betuk)

console.log('\n=== 3) Kiválasztás ===\n')
await lista.filter({ hasText: '05' }).click(); await p.waitForTimeout(300)
await p.getByRole('button', { name: 'Ezt választom' }).click(); await p.waitForTimeout(800)
ok('a gomb jelzi', 1, await p.getByRole('button', { name: 'Ez a kiválasztott' }).count())
ok('a listában is jelölve', 'kiválasztva, sötét', sima(await lista.filter({ hasText: '05' }).locator('.cimke-pill').innerText()))
if (KEPEK) await p.screenshot({ path: join(KEPEK, 'arculat-kivalasztva.png') })
await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).click(); await p.waitForTimeout(800)
await menu.click(); await p.waitForTimeout(2000)
ok('visszatérve a kiválasztottat mutatja', ['05', 'sotet'],
  [await p.locator('.kv').getAttribute('data-k'), await p.locator('.kv').getAttribute('data-mod')])
ok('nincs JS hiba', [], hibak)
await ctx.close()

console.log('\n=== 4) Alkalmazott ===\n')
const alk = await belep('alkalmazott@mosathat.hu')
ok('az alkalmazott nem látja', 0, await alk.p.locator('aside.oldalsav button').filter({ hasText: 'Arculat' }).count())
await alk.ctx.close()

console.log('\n=== 5) Tablet: kicsinyítve fér ki ===\n')
const tab = await belep('tulaj@mosathat.hu', { width: 1280, height: 800 })
await tab.p.locator('aside.oldalsav button').filter({ hasText: 'Arculat' }).click(); await tab.p.waitForTimeout(2500)
const terulet = await tab.p.locator('.arculat-terulet').evaluate((e) => ({ w: e.clientWidth, sw: e.scrollWidth }))
ok('az asztali előnézet kicsinyítve, vízszintes görgetés nélkül', true, terulet.sw <= terulet.w + 1)
if (KEPEK) await tab.p.screenshot({ path: join(KEPEK, 'arculat-tablet.png') })
await tab.ctx.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
