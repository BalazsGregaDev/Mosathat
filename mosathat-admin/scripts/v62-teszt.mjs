import { chromium } from 'playwright'

import { hetkoznapra } from './_munkanap.mjs'

const URL = 'http://localhost:5180/'
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}

async function oldal(beall = { viewport: { width: 1440, height: 900 } }) {
  const ctx = await b.newContext(beall)
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(`pageerror: ${e.message.slice(0, 160)}`))
  p.on('console', (m) => { if (m.type() === 'error') hibak.push(`console: ${m.text().slice(0, 160)}`) })
  await hetkoznapra(p)
  await p.goto(URL)
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
  return { ctx, p, hibak }
}

async function menu(p, nev) {
  const hamburger = p.locator('.hamburger:visible')
  if (await hamburger.count()) {
    await hamburger.first().click(); await p.waitForTimeout(400)
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

const ablakok = (p) => p.evaluate(() => [...document.querySelectorAll('dialog')]
  .filter((d) => d.open)
  .map((d) => ({ cimke: d.getAttribute('aria-label') ?? d.getAttribute('aria-labelledby'), modal: d.matches(':modal') })))

const fokuszHol = (p) => p.evaluate(() => {
  const a = document.activeElement
  if (!a || a === document.body) return 'body'
  const d = a.closest('dialog')
  return d ? (d.getAttribute('aria-label') ?? d.getAttribute('aria-labelledby') ?? 'névtelen ablak') : `kint: ${a.tagName}.${a.className}`
})

const { ctx, p, hibak } = await oldal()
await menu(p, 'Időpontok')

console.log('=== 1) Új időpont: natív, modális ablak ===\n')
const ujGomb = p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' })
await ujGomb.click(); await p.waitForTimeout(1500)
ok('egy nyitott, modális dialog', [{ cimke: 'Új időpont', modal: true }], await ablakok(p))
ok('a fókusz a rendszám mezőn', 'rendszam', await p.evaluate(() => document.activeElement?.id))
{
  const kint = []
  for (let i = 0; i < 60; i++) {
    await p.keyboard.press('Tab')
    const h = await fokuszHol(p)
    if (h.startsWith('kint')) kint.push(h)
  }
  ok('Tabbal sem jut ki a fókusz az ablakból (60 lépés)', [], kint)
}
ok('a háttér gombja nem kaphat fókuszt (inert)', false, await p.evaluate(() => {
  const g = document.querySelector('aside.oldalsav button')
  g.focus()
  return document.activeElement === g
}))
await p.locator('#rendszam').focus()
await p.keyboard.press('Escape'); await p.waitForTimeout(500)
ok('Esc: bezárul', [], await ablakok(p))
ok('a fókusz visszakerül a megnyitó gombra', true,
  await p.evaluate(() => (document.activeElement?.textContent ?? '').includes('Új időpont')))

console.log('\n=== 2) Android vissza gomb / bezárási kérés ===\n')
await ujGomb.click(); await p.waitForTimeout(1200)
const tamogatott = await p.evaluate(() => typeof HTMLDialogElement.prototype.requestClose === 'function')
if (tamogatott) {
  await p.evaluate(() => document.querySelector('dialog[aria-label="Új időpont"]').requestClose())
  await p.waitForTimeout(500)
  ok('a böngésző bezárási kérésére (pl. Android vissza) bezárul', [], await ablakok(p))
  await ujGomb.click(); await p.waitForTimeout(1200)
}
await p.evaluate(() => document.querySelector('dialog[aria-label="Új időpont"]').close())
await p.waitForTimeout(600)
ok('ha a böngésző magától zárja be, az alkalmazás is lezárja (nem marad láthatatlan ablak)', [], await ablakok(p))

console.log('\n=== 3) Munkalap: egymásba nyíló ablakok ===\n')
const kartya = p.locator('.napi-lista .kartya[data-allapot="CONFIRMED"]').first()
await kartya.locator('.kartya-nyit').click(); await p.waitForTimeout(1500)
const munkalap = p.locator('dialog[aria-label="Munkalap"]')
ok('megnyílt a munkalap', 1, await munkalap.count())
await munkalap.locator('.szerk-ertek').first().click(); await p.waitForTimeout(400)
ok('helyben szerkesztés nyílt', 1, await munkalap.locator('.szerk-nyitva').count())
await p.keyboard.press('Escape'); await p.waitForTimeout(400)
ok('Esc a szerkesztésben: csak a szerkesztés zárul', [0, 1],
  [await munkalap.locator('.szerk-nyitva').count(), await munkalap.count()])
await munkalap.locator('.munkalap-lab').getByRole('button', { name: 'Törlés' }).click(); await p.waitForTimeout(500)
ok('a kérdés a munkalap fölött nyílt', ['Munkalap', 'kerdes-cim'], (await ablakok(p)).map((a) => a.cimke))
ok('a kérdésnél az Igen gombon a fókusz', 'Törlés', await p.evaluate(() => document.activeElement?.textContent?.trim()))
ok('a munkalap gombja most nem kattintható (inert)', false, await p.evaluate(() => {
  const g = document.querySelector('dialog[aria-label="Munkalap"] .lap-fej .bezar')
  g.focus()
  return document.activeElement === g
}))
await p.keyboard.press('Escape'); await p.waitForTimeout(500)
ok('Esc: csak a kérdés zárul, a munkalap marad', ['Munkalap'], (await ablakok(p)).map((a) => a.cimke))
ok('a foglalás nem törlődött', 'CONFIRMED', await kartya.getAttribute('data-allapot'))

console.log('\n=== 4) Árlista a munkalap mellett ===\n')
await munkalap.locator('.lap-fej .arlista-gombok button').filter({ hasText: 'Csomagok' }).click()
await p.waitForTimeout(1200)
ok('az árlista a munkalap ablakán belül van', true,
  await p.evaluate(() => Boolean(document.querySelector('.arpanel')?.closest('dialog[aria-label="Munkalap"]'))))
await p.locator('.arpanel .arpanel-fej .fulek button').filter({ hasText: 'Egyéb' }).click(); await p.waitForTimeout(500)
ok('az árlista kezelhető (fülváltás)', true,
  await p.locator('.arpanel .arpanel-fej .fulek button').filter({ hasText: 'Egyéb' }).evaluate((e) => e.classList.contains('aktiv')))
await munkalap.locator('.szerk-ertek').first().click(); await p.waitForTimeout(400)
ok('közben a munkalap is kezelhető', 1, await munkalap.locator('.szerk-nyitva').count())
await p.keyboard.press('Escape'); await p.waitForTimeout(300)
await p.keyboard.press('Escape'); await p.waitForTimeout(600)
ok('a munkalap bezárult, az árlista nyitva maradt', [0, 1], [await munkalap.count(), await p.locator('.arpanel').count()])
ok('az árlista visszakerült a napi nézet fölé (nem ablakban)', false,
  await p.evaluate(() => Boolean(document.querySelector('.arpanel')?.closest('dialog.fedo'))))
await p.locator('.arpanel .arpanel-fej .bezar').click(); await p.waitForTimeout(300)

console.log('\n=== 5) Ügyfél hozzáadása: Esc is bezárja ===\n')
await menu(p, 'Ügyfelek')
await p.getByRole('button', { name: '+ Ügyfél hozzáadása' }).click(); await p.waitForTimeout(800)
ok('megnyílt', ['Ügyfél hozzáadása'], (await ablakok(p)).map((a) => a.cimke))
await p.keyboard.press('Escape'); await p.waitForTimeout(500)
ok('Esc: bezárult', [], await ablakok(p))

ok('nincs JS vagy konzol hiba', [], hibak)
await ctx.close()

console.log('\n=== 6) Tablet: időválasztó az űrlap fölött ===\n')
{
  const t = await oldal({ viewport: { width: 800, height: 1280 }, isMobile: true, hasTouch: true })
  await menu(t.p, 'Időpontok')
  await ujNyit(t.p)
  await t.p.locator('#leadas').click(); await t.p.waitForTimeout(400)
  ok('két ablak: űrlap, fölötte az időválasztó', ['Új időpont', 'Hozza — óra'],
    (await ablakok(t.p)).map((a) => a.cimke))
  await t.p.keyboard.press('Escape'); await t.p.waitForTimeout(400)
  ok('Esc: csak az időválasztó zárul', ['Új időpont'], (await ablakok(t.p)).map((a) => a.cimke))
  ok('nincs JS vagy konzol hiba', [], t.hibak)
  await t.ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
