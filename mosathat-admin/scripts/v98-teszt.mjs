import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { hetkoznapra } from './_munkanap.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const kep = async (p, nev) => { if (KEPEK) await p.screenshot({ path: join(KEPEK, `${nev}.png`), fullPage: false }) }
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const DEMO = 'http://localhost:5180'
const DEMO_LINK = 'autotransdemo2026link'

async function belep(p, email = 'tulaj@mosathat.hu') {
  await p.goto(DEMO + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 90000 })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
}

console.log('=== 1) Admin: Céges linkek oldal (asztali) ===\n')
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: DEMO })
const p = await ctx.newPage()
const hibak = []
p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await hetkoznapra(p)
await belep(p)
await p.locator('.oldalsav .menu button').filter({ hasText: 'Céges linkek' }).click()
await p.locator('.ceglink-lista').waitFor({ timeout: 30000 })
const sor = p.locator('.ceglink-sor[data-ceg="Autó Trans Kft."]')
ok('a szerződéses cég sora látszik', 1, await sor.count())
ok('a demó link látszik', true, (await sor.locator('.ceglink-cim').innerText()).endsWith(`/ceg/${DEMO_LINK}`))
ok('a demó üzenet a mezőben', true, (await sor.locator('textarea').inputValue()).startsWith('DEMO — Kérjük'))
await kep(p, '01-admin-lista')

await sor.locator('.ceglink-masol').click()
await p.waitForTimeout(300)
const vagolap1 = await p.evaluate(() => navigator.clipboard.readText())
ok('másolás: a levél a vágólapon', [
  'Kedves Autó Trans Kft.!', '',
  'Ezúton küldöm az időpontfoglaláshoz használható linket, adjátok tovább az erre jogosultaknak:',
  `${DEMO}/ceg/${DEMO_LINK}`, '', 'Köszönettel,', 'Mosathat autóápolási kft.'].join('\n'), vagolap1)
ok('visszajelzés a másolásról', 'A levél a vágólapon', await sor.locator('.ceglink-jelzes').innerText())
await kep(p, '02-admin-masolva')

await sor.locator('textarea').fill('Kérjük, a forgalmit hagyjátok az autóban.\nA kulcs a portán.')
ok('változáskor Mentés gomb', 1, await sor.getByRole('button', { name: 'Mentés' }).count())
await kep(p, '03-admin-uzenet-szerkesztes')
await sor.getByRole('button', { name: 'Mentés' }).click()
await p.waitForTimeout(500)
ok('üzenet mentve', ['Üzenet mentve', 0], [await sor.locator('.ceglink-jelzes').innerText(), await sor.getByRole('button', { name: 'Mentés' }).count()])

await sor.getByRole('button', { name: 'Új link' }).click()
await p.locator('.kerdes-ablak').waitFor()
ok('új link előtt rákérdez', true, (await p.locator('.kerdes-ablak').innerText()).includes('azonnal megszűnik'))
await kep(p, '04-admin-uj-link-kerdes')
await p.locator('.kerdes-ablak').getByRole('button', { name: 'Új link' }).click()
await p.waitForTimeout(800)
const ujLink = await sor.locator('.ceglink-cim').innerText()
const ujKod = ujLink.split('/ceg/')[1]
ok('új, 24 karakteres kód', [true, true], [ujKod !== DEMO_LINK, /^[a-z0-9]{24}$/.test(ujKod)])
const vagolap2 = await p.evaluate(() => navigator.clipboard.readText())
ok('csere: a levél a kiszivárgásról szól és az új linket tartalmazza', [true, true, true],
  [vagolap2.includes('A korábbi link kiszivárgott'), vagolap2.includes('hívjátok fel erre a kollégáitok figyelmét'), vagolap2.includes(ujLink)])
ok('visszajelzés az új linkről', 'Új link kész, a levél a vágólapon', await sor.locator('.ceglink-jelzes').innerText())
await kep(p, '05-admin-uj-link-kesz')

console.log('\n=== 2) Admin: telefonon ===\n')
const tel = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const pt = await tel.newPage()
pt.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await hetkoznapra(pt)
await belep(pt)
await pt.locator('.mobil-fejlec .hamburger').click(); await pt.waitForTimeout(500)
await pt.locator('.fiok button').filter({ hasText: 'Céges linkek' }).first().click()
await pt.locator('.ceglink-lista').waitFor({ timeout: 30000 })
await pt.waitForTimeout(500)
ok('telefonon nincs vízszintes görgetés', true, await pt.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
await kep(pt, '06-admin-telefon')

console.log('\n=== 3) Alkalmazott nem látja ===\n')
const alk = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await hetkoznapra(alk)
await belep(alk, 'alkalmazott@mosathat.hu')
ok('az alkalmazott menüjében nincs Céges linkek', 0, await alk.locator('.oldalsav .menu button').filter({ hasText: 'Céges linkek' }).count())

console.log('\n=== 4) Céges foglalási oldal (telefon) ===\n')
const c = await tel.newPage()
c.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await hetkoznapra(c)
await c.goto(`${DEMO}/ceg/${DEMO_LINK}`)
await c.locator('.kv-ceg-foglalas .fogl').waitFor({ timeout: 90000 })
ok('fejléc: céges foglalás, cégnév', [true, true],
  [(await c.locator('.kv-ceg-foglalas > h2').innerText()).includes('Céges időpontfoglalás'), (await c.locator('.kv-ceg-foglalas .kv-bevezeto').innerText()).includes('Autó Trans Kft.')])
const startAr = await c.locator('.fogl-csomag').filter({ has: c.locator('.nev', { hasText: /^Start$/ }) }).locator('.ar').innerText()
ok('a Start csomag a szerződéses áron (10 500)', true, startAr.replace(/\s/g, '').includes('10500'))
ok('a címsor a cég nevét mutatja', true, (await c.title()).includes('Autó Trans Kft.'))
await kep(c, '07-ceg-oldal-teteje')

await c.locator('.fogl-csomag').filter({ has: c.locator('.nev', { hasText: /^Start$/ }) }).click()
await c.waitForTimeout(800)
await c.locator('[data-lepes="tipus"] button').last().click()
await c.waitForTimeout(2000)
await c.locator('.fogl-nap[data-allapot="szabad"]').first().click()
await c.waitForTimeout(1000)
await c.locator('.fogl-idok button').first().click()
await c.waitForTimeout(800)
await c.locator('[data-lepes="adatok"]').waitFor({ timeout: 15000 })
const uzenet = c.locator('.fogl-ceg-uzenet')
ok('az egyedi üzenet a Megjegyzés fölött (a demó új lapon a kiinduló adatból indul)', ['DEMO — Kérjük, a forgalmi engedélyt és a kulcsot a portán hagyjátok.', true],
  [await uzenet.innerText(), await c.evaluate(() => {
    const u = document.querySelector('.fogl-ceg-uzenet')
    const m = document.getElementById('fo-megj')
    return Boolean(u && m && (u.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING))
  })])
await c.fill('#fo-nev', 'Sofőr Sándor')
await c.fill('#fo-tel', '+36 30 777 8899')
await c.fill('#fo-rsz', 'CGL-101')
await c.locator('.fogl-feltetel input').check()
await uzenet.scrollIntoViewIfNeeded()
await kep(c, '08-ceg-oldal-uzenet')
ok('az összegzésben a szerződéses ár', true, (await c.locator('.fogl-osszeg .ar').innerText()).replace(/\s/g, '').includes('10500'))
await c.locator('.fogl-osszeg .kuld button').click()
await c.locator('.fogl-siker').waitFor({ timeout: 15000 })
ok('a kérés elküldve', true, await c.locator('.fogl-siker').isVisible())
await kep(c, '09-ceg-oldal-elkuldve')

console.log('\n=== 5) Érvénytelen link ===\n')
await c.goto(`${DEMO}/ceg/ervenytelenlink000000000`)
await c.locator('.kv-ceg-ervenytelen').waitFor({ timeout: 90000 })
ok('érvénytelen link: hibaoldal telefonszámmal', [true, true],
  [(await c.locator('.kv-ceg-ervenytelen h2').innerText()).includes('nem érvényes'), (await c.locator('.kv-ceg-ervenytelen a').count()) === 1])
await kep(c, '10-ervenytelen-link')

ok('nincs JS hiba', [], hibak)
await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
