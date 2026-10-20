import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { hetkoznapra } from './_munkanap.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const kep = async (p, nev, teljes = false) => { if (KEPEK) await p.screenshot({ path: join(KEPEK, `${nev}.png`), fullPage: teljes }) }
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const DEMO = 'http://localhost:5180'
const LINK = 'autotransdemo2026link'
const hibak = []
const perc = (s) => { const [o, p] = s.trim().split(':').map(Number); return o * 60 + p }

async function cegesOldal(ctx) {
  const c = await ctx.newPage()
  c.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  await hetkoznapra(c)
  await c.goto(`${DEMO}/ceg/${LINK}`)
  await c.locator('.kv-ceg-foglalas .fogl').waitFor({ timeout: 90000 })
  await c.waitForTimeout(500)
  return c
}

console.log('=== 1) Céges oldal: felépítés (telefon) ===\n')
const tel = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const c = await cegesOldal(tel)
ok('zöld sáv a cégnévvel és a címmel', [true, true, true],
  [await c.locator('.kv-ceg-sav[data-csillan]').isVisible(), (await c.locator('.kv-ceg-sav-ceg').textContent()) === 'Autó Trans Kft.',
   (await c.locator('.kv-ceg-sav h1').innerText()) === 'Céges időpontfoglalás'])
const sav = await c.locator('.kv-ceg-sav-belso').evaluate((e) => {
  const gyerek = [...e.children]
  const h = parseFloat(getComputedStyle(e.querySelector('h1')).fontSize)
  const ceg = parseFloat(getComputedStyle(e.querySelector('.kv-ceg-sav-ceg')).fontSize)
  return { utolso: gyerek[gyerek.length - 1].classList.contains('kv-ceg-sav-ceg'), kisebb: ceg < h, nagy: ceg >= h * 0.75 }
})
ok('a cégnév a sáv utolsó sora, egy fokkal kisebb a címnél', { utolso: true, kisebb: true, nagy: true }, sav)
ok('nincs méretválasztó, terjedelem, extra és Full Service', [0, 0, 0, 0],
  [await c.locator('[data-lepes="auto"]').count(), await c.locator('[data-lepes="mit"]').count(),
   await c.locator('[data-lepes="extrak"]').count(), await c.locator('.fogl-fs').count()])
ok('a csomagoknál nincs ár', [3, 0], [await c.locator('.fogl-csomag').count(), await c.locator('.fogl-csomag .ar').count()])
ok('a csomag az 1. lépés', '1', await c.locator('[data-lepes="csomag"] .lepes').innerText())
ok('telefonon nincs vízszintes görgetés', true, await c.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
await kep(c, '01-ceg-teteje-telefon')

await c.locator('.fogl-csomag').filter({ has: c.locator('.nev', { hasText: /^Premium$/ }) }).click()
await c.waitForTimeout(800)
ok('lépésszámok: 2 típus', '2', await c.locator('[data-lepes="tipus"] .lepes').innerText())
await c.locator('[data-lepes="tipus"] button').nth(1).click()
await c.waitForTimeout(2500)
ok('lépésszámok: 3 nap', '3', await c.locator('[data-lepes="nap"] .lepes').innerText())
await c.locator('.fogl-nap[data-allapot="szabad"]').first().click()
await c.waitForTimeout(1200)
const idok = await c.locator('.fogl-idok button').evaluateAll((g) => g.map((x) => x.childNodes[0].textContent))
ok('itt hagyott autónál 7:30 a legkorábbi', '7:30', idok[0]?.trim())
ok('egyik időpont sem 7:30 előtt vagy 17:00 után', true, idok.every((x) => perc(x) >= 450 && perc(x) <= 1020))
ok('várható elkészülés megmaradt', true, (await c.locator('.fogl-idok button small').first().innerText()).includes('kész kb.'))
const sarga = await c.locator('[data-lepes="nap"] .fogl-erkezes').innerText()
ok('sárga felhívás a telefonszámmal', true, sarga.startsWith('Ha bármi változás van, ezen a telefonszámon elérsz:') && /\+36/.test(sarga))
ok('a sárga felhívás háttere sárga', 'rgb(255, 246, 214)', await c.locator('[data-lepes="nap"] .fogl-erkezes').evaluate((e) => getComputedStyle(e).backgroundColor))
await c.locator('.fogl-idok button').first().click()
await c.waitForTimeout(800)
await c.locator('[data-lepes="nap"]').scrollIntoViewIfNeeded()
await kep(c, '02-ceg-idopontok-telefon')

ok('lépésszámok: 5 adatok', '5', await c.locator('[data-lepes="adatok"] .lepes').innerText())
await c.fill('#fo-nev', 'Sofőr Sándor')
await c.fill('#fo-tel', '+36 30 777 8899')
await c.fill('#fo-rsz', 'CGL-101')
await c.locator('.fogl-feltetel input').check()
ok('az összegzésben nincs ár', [0, true], [await c.locator('.fogl-osszeg .ar').count(), !/Ft/.test(await c.locator('.fogl-osszeg').innerText())])
ok('a küldés gomb csillanó lakk gomb', [true, true],
  [await c.locator('.fogl-osszeg .kuld button.kv-gomb-lakk[data-csillan]').count() === 1,
   (await c.locator('.fogl-osszeg .kuld button').evaluate((e) => getComputedStyle(e).backgroundImage)).includes('gradient')])
const vonal = await c.locator('[data-lepes="tipus"]').evaluate((e) => getComputedStyle(e, '::before').height)
ok('a szakaszok között vékony elválasztó vonal', '1px', vonal)
await c.locator('#fo-megj').scrollIntoViewIfNeeded()
await kep(c, '03-ceg-adatok-telefon')
await c.locator('.fogl-osszeg .kuld button').click()
await c.locator('.fogl-siker').waitFor({ timeout: 15000 })
ok('a kérés elküldve', true, await c.locator('.fogl-siker').isVisible())

console.log('\n=== 2) Céges oldal: asztali, középre igazítva ===\n')
const asztal = await b.newContext({ viewport: { width: 1440, height: 900 } })
const d = await cegesOldal(asztal)
const doboz = await d.locator('.kv-ceg-foglalas .fogl').boundingBox()
ok('az űrlap vízszintesen középen', true, Math.abs((doboz.x + doboz.width / 2) - 720) < 12)
await kep(d, '04-ceg-asztali-teteje')
await d.locator('.fogl-csomag').filter({ has: d.locator('.nev', { hasText: /^Start$/ }) }).click()
await d.waitForTimeout(600)
await d.locator('[data-lepes="tipus"] button').nth(1).click()
await d.waitForTimeout(2500)
await d.locator('.fogl-nap[data-allapot="szabad"]').first().click()
await d.waitForTimeout(1200)
await d.locator('.fogl-idok button').first().click()
await d.waitForTimeout(800)
await d.locator('[data-lepes="nap"]').scrollIntoViewIfNeeded()
await kep(d, '05-ceg-asztali-idopontok')
const gomb = d.locator('.fogl-osszeg .kuld button')
await d.fill('#fo-nev', 'Sofőr Sándor')
await d.fill('#fo-tel', '+36 30 777 8899')
await d.fill('#fo-rsz', 'CGL-102')
await d.locator('.fogl-feltetel input').check()
await d.locator('#fo-megj').scrollIntoViewIfNeeded()
const gd = await gomb.boundingBox()
await d.mouse.move(gd.x + gd.width * 0.3, gd.y + gd.height / 2)
await d.mouse.move(gd.x + gd.width * 0.4, gd.y + gd.height / 2, { steps: 5 })
await d.waitForTimeout(400)
ok('egér fölötte: csillanás bekapcsol', true, await gomb.evaluate((e) => e.hasAttribute('data-eger')))
await kep(d, '06-ceg-asztali-gomb-csillan')

console.log('\n=== 3) Munkalap: Normál / Nagy ===\n')
const adm = await asztal.newPage()
adm.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await hetkoznapra(adm)
await adm.goto(DEMO + '/')
await adm.waitForSelector('input[type="email"]', { timeout: 90000 })
await adm.fill('input[type="email"]', 'tulaj@mosathat.hu')
await adm.fill('input[type="password"]', 'x')
await adm.getByRole('button', { name: /Belépés/ }).click()
await adm.waitForTimeout(2500)
await adm.locator('.oldalsav .menu button').filter({ hasText: 'Időpontok' }).click()
await adm.waitForTimeout(1500)
let kartya = adm.locator('.kartya').filter({ hasText: 'CEG-001' })
for (let i = 0; i < 25 && (await kartya.count()) === 0; i++) {
  await adm.locator('button[aria-label="Előre"]:visible').first().click()
  await adm.waitForTimeout(700)
  kartya = adm.locator('.kartya').filter({ hasText: 'CEG-001' })
}
ok('a céges linkes demó foglalás megtalálható', 1, await kartya.count())
await kartya.locator('.kartya-nyit').click()
await adm.waitForTimeout(1500)
const meret = adm.locator('.adatsor').filter({ hasText: 'Méret' }).first()
const kivalasztott = async () => (await adm.locator('.adatsor').filter({ hasText: 'Méret' }).first()
  .locator('button[aria-pressed="true"]').allInnerTexts()).map((x) => x.trim())
ok('a Méret sorban csak Normál és Nagy', ['Normál', 'Nagy'], (await meret.locator('button').allInnerTexts()).map((x) => x.trim()))
ok('kiinduláskor Normál', ['Normál'], await kivalasztott())
await kep(adm, '07-munkalap-meret')
await meret.locator('button').filter({ hasText: /^Nagy$/ }).click()
await adm.waitForTimeout(1500)
ok('Nagyra állítva, a Premium Nagy szerződéses ára', [['Nagy'], true], [await kivalasztott(), (await adm.locator('.lap-lab .osszeg .ertek, .lap-lab .osszeg').first().innerText()).replace(/\s/g, '').includes('18000')])
await kep(adm, '08-munkalap-nagy')

ok('nincs JS hiba', [], hibak)
await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
