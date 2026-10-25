import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adminOldal } from './_publikus.mjs'
import { beir, bezar, blokk, kartya, kartyaMezo, kulcsok, lapra, nyit, rejtettKulcsok, tiszta, varTartalom } from './_tszerk.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const kep = async (el, nev) => { if (KEPEK) await el.screenshot({ path: join(KEPEK, `${nev}.png`) }) }
const sima = (s) => tiszta(s).replace(/\s+/g, ' ').trim()
const jsHiba = (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ }
const cimke = async (p) => sima(await kartya(p).locator('label').first().innerText())
const kozepre = async (p, loc, dx = 12) => {
  await loc.scrollIntoViewIfNeeded()
  await p.waitForTimeout(150)
  const r = await loc.boundingBox()
  return { x: r.x + Math.min(dx, r.width / 2), y: r.y + Math.min(r.height / 2, 20) }
}
const kattint = async (p, loc, dx) => { const h = await kozepre(p, loc, dx); await p.mouse.click(h.x, h.y); await p.waitForTimeout(400) }

console.log('=== 1) Almenü: Főoldal, Foglalás oldal, GYIK oldal ===\n')
const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
await belep('tulaj@mosathat.hu')
const almenu = p.locator('aside.oldalsav .menu button.almenu')
ok('más oldalon az almenü rejtve, a menü nem hosszabb', 0, await almenu.count())
await p.locator('aside.oldalsav .menu button').filter({ hasText: /^Tartalom$/ }).click()
await varTartalom(p)
ok('a Tartalom alatt három almenüpont, a Főoldal az alap', [['Főoldal', 'Foglalás oldal', 'GYIK oldal'], 'Tartalom: Főoldal'],
  [(await almenu.allInnerTexts()).map(sima), sima(await p.locator('.pub-fej h2').innerText())])
await almenu.filter({ hasText: 'GYIK oldal' }).click()
await varTartalom(p)
ok('az almenüpontra kattintva a Tartalom nyílik, a GYIK oldallal', ['Tartalom: GYIK oldal', 'GYIK oldal', 'true'],
  [sima(await p.locator('.pub-fej h2').innerText()), sima(await p.locator('.tsz-lapok [aria-selected="true"]').innerText()),
   await almenu.filter({ hasText: 'GYIK oldal' }).getAttribute('aria-current')])
ok('GYIK oldal: menü, a GYIK aloldal és a lábléc', ['menu', 'gyik-oldal', 'lab'], await p.locator('.tsz-blokk').evaluateAll((l) => l.map((e) => e.dataset.sav)))
await kep(p, '01-gyik-oldal')
await lapra(p, 'Foglalás oldal')
ok('a fülváltás az almenüt is követi', 'true', await almenu.filter({ hasText: 'Foglalás oldal' }).getAttribute('aria-current'))
ok('Foglalás oldal: az ügyfél foglalási oldalának állapotai', ['ugyfel-alap', 'ugyfel-kesz', 'ugyfel-atveve', 'ugyfel-egyeb'],
  await p.locator('.tsz-blokk').evaluateAll((l) => l.map((e) => e.dataset.sav)))
await kep(p, '02-foglalas-oldal')
await lapra(p, 'Főoldal')
ok('Főoldal: a publikus főoldal sorrendjében, a foglalás lépésenként',
  ['menu', 'hero', 'rolunk', 'galeria', 'csomagok', 'fogl-fej', 'fogl-1', 'fogl-2', 'fogl-3', 'fogl-4', 'fogl-5', 'fogl-5fs', 'fogl-6', 'fogl-8',
   'fogl-osszeg', 'fogl-siker', 'velemenyek', 'hely', 'gyik', 'lab'],
  await p.locator('.tsz-blokk').evaluateAll((l) => l.map((e) => e.dataset.sav)))

console.log('\n=== 2) Mezők nélkül: csak az előnézet, kattintásra a szöveg mezője ===\n')
ok('kezdetben nincs nyitott szerkesztő és nincs admin beviteli mező az előnézetek mellett', [0, 0],
  [await kartya(p).count(), await p.locator('.tsz-terulet > :not(.tsz-lap) .beviteli').count()])
const h1 = blokk(p, 'hero').locator('.kv-hero h1')
const h = await kozepre(p, h1, 40)
await p.mouse.move(h.x, h.y)
await p.waitForTimeout(300)
ok('fölé állva a szöveg körül szaggatott keret', true, (await p.locator('.tsz-hover').count()) > 0)
await kep(p, '03-hover')
await p.mouse.click(h.x, h.y)
await p.waitForTimeout(400)
ok('kattintásra megnyílik a Nagy cím szerkesztője, benne a mostani szöveggel', ['Nagy cím', 'Az autó nem tárgy.\n*Évekig* veled van.', true],
  [await cimke(p), await kartyaMezo(p).inputValue(), await kartyaMezo(p).evaluate((e) => e === document.activeElement)])
const kr = await kartya(p).boundingBox()
const hr = await h1.boundingBox()
ok('a szerkesztő közvetlenül a szöveg alatt nyílik', true, kr.y >= hr.y + hr.height - 2 && kr.y < hr.y + hr.height + 60)
await kartyaMezo(p).fill('Ragyogjon.\n*Minden* nap.')
await p.waitForTimeout(400)
ok('gépelés közben az előnézet azonnal változik', ['Ragyogjon. Minden nap.', 'Minden'],
  [sima(await h1.innerText()), sima(await h1.locator('em').innerText())])
ok('jelzi: nem mentett, eltér az eredetitől', [true, true, '1 szöveg eltér az eredetitől'],
  [await kartya(p).getByText('nem mentett').isVisible(), await p.locator('.pub-valtozott').isVisible(), sima(await p.locator('.tsz-szamlalo').innerText())])
await kep(p, '04-szerkesztes')
await kartya(p).getByRole('button', { name: 'Eredeti szöveg' }).click()
await p.waitForTimeout(300)
ok('Eredeti szöveg: visszaáll', ['Az autó nem tárgy. Évekig veled van.', 0], [sima(await h1.innerText()), await p.locator('.pub-valtozott').count()])
await p.keyboard.press('Escape')
await p.waitForTimeout(200)
ok('Esc bezárja', 0, await kartya(p).count())

console.log('\n=== 3) Gombok, linkek és halvány szövegek az előnézetben ===\n')
const url = p.url()
await kattint(p, blokk(p, 'menu').locator('.kv-nav nav a').first())
ok('menüpont: a felirata nyílik meg, nem navigál', ['menu.rolunk', url], [await kartya(p).getAttribute('data-kulcs'), p.url()])
await kattint(p, blokk(p, 'fogl-osszeg').locator('.btn-fo').first(), 40)
ok('küldés gomb: a felirata nyílik meg', 'foglalas.kuldes', await kartya(p).getAttribute('data-kulcs'))
const email = blokk(p, 'fogl-8').locator('input[type="email"]')
await kattint(p, email)
ok('üres mező halvány szövege: a placeholder szövege nyílik meg, a mező kiemelve', ['E-mail mező halvány szövege', 1],
  [await cimke(p), await p.locator('.tsz-aktiv').count()])
await kartyaMezo(p).fill('ide írd az e-mail címed')
await p.waitForTimeout(300)
ok('a halvány szöveg is élőben változik', 'ide írd az e-mail címed', tiszta(await email.getAttribute('placeholder')))
await kep(p, '05-placeholder')
await kartyaMezo(p).press('Enter')
await p.waitForTimeout(200)
ok('egysoros mezőnél az Enter bezárja', 0, await kartya(p).count())
await kartya(p).count()
const fogl5 = blokk(p, 'fogl-5').locator('button:visible').first()
const nyomva = await fogl5.getAttribute('aria-pressed')
await kattint(p, fogl5)
ok('választógomb: a felirata nyílik, az előnézet állapota nem változik', [true, nyomva],
  [(await kartya(p).getAttribute('data-kulcs')).startsWith('foglalas.'), await fogl5.getAttribute('aria-pressed')])
await bezar(p)

console.log('\n=== 4) Nem látható szövegek ===\n')
const rejtett = await rejtettKulcsok(p)
const lathato = await kulcsok(p)
ok('van lista, és csak olyan van benne, ami nem látszik', [true, []], [rejtett.length > 5, rejtett.filter((k) => lathato.includes(k))])
ok('például a képernyőolvasós feliratok', [true, true], [rejtett.includes('galeria.meret'), rejtett.includes('velemeny.csillag')])
await nyit(p, 'velemeny.csillag')
ok('a listából is megnyílik, magyarázattal', ['velemeny.csillag', true],
  [await kartya(p).getAttribute('data-kulcs'), (await kartya(p).locator('.pub-mikor').count()) === 1])
await kartyaMezo(p).fill('{db} csillagból 5')
await p.waitForTimeout(300)
await kep(p, '06-rejtett')
ok('a listában jelölve a módosítás', true, await p.locator('.tsz-rejtett [data-rejtett-kulcs="velemeny.csillag"]').evaluate((e) => e.matches('[data-valtozott]')))
await kartya(p).getByRole('button', { name: 'Eredeti szöveg' }).click()
await bezar(p)

console.log('\n=== 5) Angolul ===\n')
await p.locator('.tsz-eszkozok .nyelv-kapcsolo').click()
await p.waitForTimeout(1200)
await kattint(p, h1, 40)
ok('az előnézet és a szerkesztő is angol', ['Your car isn’t just a thing. It’s with you for years.', 'Nagy címEN', 'en'],
  [sima(await h1.innerText()), await cimke(p), await kartyaMezo(p).getAttribute('lang')])
await kep(p, '07-angol')
await bezar(p)
await p.locator('.tsz-eszkozok .nyelv-kapcsolo').click()
await p.waitForTimeout(800)

console.log('\n=== 6) Beírható adat: oda és vissza ===\n')
await beir(p, 'hero.felcim', 'Piszkozat {kerulet}')
await kartya(p).locator('[data-valtozo-link="kerulet"]').click()
await p.waitForFunction(() => document.activeElement?.dataset?.mezo === 'kerulet', null, { timeout: 10000 })
ok('az Elérhetőség kerület mezőjére visz', 'Elérhetőség', sima(await p.locator('.pub-fej h2').innerText()))
await p.locator('.ugras-vissza:visible').click()
await varTartalom(p)
await p.waitForTimeout(800)
ok('vissza: ugyanaz a szöveg nyitva, a piszkozattal, a gombon a fókusz', ['hero.felcim', 'Piszkozat {kerulet}', 'kerulet'],
  [await kartya(p).getAttribute('data-kulcs'), await kartyaMezo(p).inputValue(), await p.evaluate(() => document.activeElement?.dataset?.valtozoLink)])
await kep(p, '08-vissza')
await bezar(p)

console.log('\n=== 7) Mentés ===\n')
await beir(p, 'hero.felcim', 'Mosás, ahogy kell — {kerulet}')
await bezar(p)
await p.locator('.pub-fej').getByRole('button', { name: 'Mentés' }).click()
await p.locator('.pub-mentve').waitFor({ timeout: 10000 })
await p.waitForTimeout(1000)
const [r] = await sql(`select ertek from publikus_szovegek where kulcs = 'hero.felcim' and nyelv = 'hu'`)
ok('az adatbázisban', 'Mosás, ahogy kell — {kerulet}', r?.ertek)
ok('mentés után nincs nem mentett jelölés', [0, 0], [await p.locator('.pub-valtozott').count(), await p.locator('.tsz-valtozott').count()])
const [px] = await sql(`select publikus_oldal() x`)
ok('a publikus oldal adataiban is', 'Mosás, ahogy kell — {kerulet}', px.x.szovegek['hero.felcim'])
await ctx.close()

console.log('\n=== 8) Telefonon ===\n')
{
  const { ctx, p, belep } = await adminOldal(b, { viewport: { width: 390, height: 844 }, kontextus: { isMobile: true, hasTouch: true }, hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
  await p.locator('.fiok .menu button').filter({ hasText: /^Tartalom$/ }).click()
  await varTartalom(p)
  await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
  ok('a mobil menüben is ott az almenü', ['Főoldal', 'Foglalás oldal', 'GYIK oldal'], (await p.locator('.fiok button.almenu').allInnerTexts()).map(sima))
  await kep(p, '09-telefon-menu')
  await p.locator('.fiok button.almenu').filter({ hasText: 'GYIK oldal' }).click()
  await varTartalom(p)
  ok('almenüből lapot vált', 'Tartalom: GYIK oldal', sima(await p.locator('.mobil-fejlec .nap').innerText()))
  await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
  await p.locator('.fiok button.almenu').filter({ hasText: 'Főoldal' }).click()
  await varTartalom(p)
  ok('az előnézet telefonos szélességben, nincs kicsinyítve, nem lóg ki', [1, false],
    [await blokk(p, 'hero').locator('.pub-elonezet-lap').evaluate((e) => Number(getComputedStyle(e).zoom)), await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)])
  const ph = blokk(p, 'hero').locator('.kv-hero h1')
  const t = await kozepre(p, ph, 40)
  await p.touchscreen.tap(t.x, t.y)
  await p.waitForTimeout(600)
  const k = await kartya(p).boundingBox()
  const hr2 = await ph.boundingBox()
  ok('alulról felcsúszó szerkesztő, a szöveg fölötte látszik', ['Nagy cím', true, true],
    [await cimke(p), Math.abs(k.y + k.height - 844) < 2 && k.width > 380, hr2.y >= 0 && hr2.y + 20 < k.y])
  await kep(p, '10-telefon-szerkeszto')
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
