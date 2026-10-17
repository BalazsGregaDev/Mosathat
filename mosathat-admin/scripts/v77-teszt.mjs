import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch()
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const sima = (s) => s.replace(/\s+/g, ' ').trim()
const CIM = 'http://localhost:5180'

async function oldal(utvonal, viewport = { width: 1440, height: 900 }) {
  const ctx = await b.newContext({ viewport })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
  await p.route(/google\.com\/maps/, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>térkép</p>' }))
  await p.goto(CIM + utvonal)
  await p.locator('.kv').waitFor({ timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
  return { ctx, p, hibak }
}

console.log('=== 1) /publikus belépés nélkül ===\n')
const o = await oldal('/publikus')
ok('nincs belépő képernyő', 0, await o.p.locator('input[type="email"]').count())
ok('mindig a Magazin (03), alapból világos', ['03', 'vilagos'], [await o.p.locator('.kv').getAttribute('data-k'), await o.p.locator('.kv').getAttribute('data-mod')])
ok('a valódi árak', ['12 800 Ft', '15 600 Ft', '19 800 Ft'], (await o.p.locator('.kv-tabla thead .kv-ar').allInnerTexts()).map(sima))
await o.p.locator('.kv-kat button').filter({ hasText: 'SUV' }).click()
ok('a kategóriaváltó itt is működik', ['14 600 Ft', '17 800 Ft', '22 600 Ft'], (await o.p.locator('.kv-tabla thead .kv-ar').allInnerTexts()).map(sima))
ok('foglalás, térkép, footer', [1, 1, 1],
  [await o.p.locator('.kv-foglalas').count(), await o.p.locator('.kv-hely .kv-terkep').count(), await o.p.locator('.kv-lab').count()])
ok('saját címsor a böngészőfülön', true, /^Mosathat — kézi autókozmetika/.test(await o.p.title()))
ok('a teljes szélességet kitölti, nincs admin keret', true,
  await o.p.locator('.kv').evaluate((e) => Math.abs(e.getBoundingClientRect().width - innerWidth) < 2))
if (KEPEK) await o.p.screenshot({ path: join(KEPEK, 'v77-publikus-asztali.png'), fullPage: true })
await o.p.locator('.kv-nav a').filter({ hasText: 'Kapcsolat' }).click(); await o.p.waitForTimeout(1500)
ok('a menü a szekcióhoz görget', true, await o.p.locator('.kv-lab').evaluate((e) => { const r = e.getBoundingClientRect(); return scrollY > 500 && r.top >= 0 && r.top < innerHeight }))
ok('nincs JS hiba', [], o.hibak)
await o.ctx.close()

console.log('\n=== 2) Telefonon ===\n')
const e = await oldal('/publikus', { width: 390, height: 844 })
ok('Magazin', '03', await e.p.locator('.kv').getAttribute('data-k'))
ok('telefonon a telefonos elrendezés: név és hamburger egy sorban', ['row', true], [await e.p.locator('.kv-nav').evaluate((x) => getComputedStyle(x).flexDirection), await e.p.locator('.kv-menu-gomb').isVisible()])
ok('a dokumentum a tartalommal együtt nyúlik (normál görgetés)', true, await e.p.evaluate(() => document.documentElement.scrollHeight > innerHeight * 2))
ok('nincs vízszintes görgetés', true, await e.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
if (KEPEK) await e.p.screenshot({ path: join(KEPEK, 'v77-publikus-telefon.png'), fullPage: true })
await e.ctx.close()
const r = await oldal('/publikus?arculat=05&mod=sotet')
ok('URL-paraméterrel sem vált másik koncepcióra', ['03', 'vilagos'],
  [await r.p.locator('.kv').getAttribute('data-k'), await r.p.locator('.kv').getAttribute('data-mod')])
await r.ctx.close()

console.log('\n=== 3) Link az Arculat menüből ===\n')
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } })
const p = await ctx.newPage()
await p.goto(CIM + '/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu'); await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click(); await p.waitForTimeout(2500)
await p.locator('aside.oldalsav button').filter({ hasText: 'Arculat' }).click(); await p.waitForTimeout(2000)
const link = p.getByRole('link', { name: 'Megnyitás külön oldalon' })
ok('más koncepciónál nincs link', 0, await link.count())
await p.locator('.arculat-lista button').filter({ hasText: '03' }).click()
ok('a Magazinnál van, a /publikus oldalra', '/publikus', await link.getAttribute('href'))
ok('új lapon nyílik', '_blank', await link.getAttribute('target'))
if (KEPEK) await p.locator('.arculat-eszkozok').screenshot({ path: join(KEPEK, 'v77-arculat-gomb.png') })
await ctx.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
