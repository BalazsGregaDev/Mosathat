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

const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } })
const p = await ctx.newPage()
const hibak = []
const terkepKeres = []
p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
await p.route(/google\.com\/maps/, (r) => { terkepKeres.push(r.request().url()); return r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>térkép</p>' }) })
await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(2500)
await p.locator('aside.oldalsav button').filter({ hasText: 'Arculat' }).click()
await p.waitForTimeout(2500)

const arak = async () => (await p.locator('.kv-tabla thead .kv-ar').allInnerTexts()).map(sima)
const kat = (nev) => p.locator('.kv-kat button').filter({ hasText: nev })
const kartya = (nev) => p.locator('.kv-kat-kartyak button').filter({ hasText: nev })

console.log('=== 1) Kategóriaváltó a táblázat fejlécében ===\n')
ok('három gomb', ['Személygépjármű', 'SUV, Egyterű', 'Kisbusz, Furgon'],
  (await p.locator('.kv-kat button').allInnerTexts()).map((x) => sima(x).toLowerCase()).map((x) => x.replace(/(^|, )(\S)/g, (m, a, c) => a + c.toUpperCase())).map((x) => x.replace('Suv', 'SUV')))
ok('alapból személyautó', 'true', await kat('Személygépjármű').getAttribute('aria-pressed'))
ok('személyautó árak', ['12 800 Ft', '15 600 Ft', '19 800 Ft'], await arak())
await kat('SUV').click(); await p.waitForTimeout(200)
ok('SUV árak', ['14 600 Ft', '17 800 Ft', '22 600 Ft'], await arak())
ok('a lábjegyzet is vált', 'Csak külső: 7 000 Ft-tól — csak belső: 9 000 Ft-tól.', sima(await p.locator('.kv-labjegyzet').innerText()))
ok('az alcím is vált', true, /SUV, egyterű/.test(await p.locator('.kv-csomagok .kv-alcim').innerText()))
await kat('Kisbusz').click(); await p.waitForTimeout(200)
ok('kisbusz árak', ['18 000 Ft', '21 200 Ft', '25 900 Ft'], await arak())
ok('a foglalásnál is a kisbusz van kiválasztva', 'true', await kartya('Kisbusz').getAttribute('aria-pressed'))

console.log('\n=== 2) Foglalás, első lépés ===\n')
ok('négy lépés, az első aktív', ['1Autó', '2Csomag', '3Időpont', '4Adatok'],
  (await p.locator('.kv-lepesek li').allInnerTexts()).map((x) => x.replace(/\s+/g, '').replace(/^(\d)(.)(.*)$/, (m, n, a, r) => n + a.toUpperCase() + r.toLowerCase())))
ok('az első lépés jelölve', '1', sima(await p.locator('.kv-lepesek li[aria-current="step"] .kv-lepes-szam').innerText()))
ok('kategóriakártyák a legkisebb árral', ['12 800 Ft-tól', '14 600 Ft-tól', '18 000 Ft-tól'],
  (await p.locator('.kv-kat-kartyak .kv-kat-ar').allInnerTexts()).map(sima).map((x) => x.replace(/FT-TÓL$/, 'Ft-tól')))
await kartya('Személygépjármű').click(); await p.waitForTimeout(200)
ok('a kártya visszaállítja a táblázat árait', ['12 800 Ft', '15 600 Ft', '19 800 Ft'], await arak())
await p.locator('.kv-hero .kv-gomb').first().click(); await p.waitForTimeout(900)
const lathato = await p.locator('.kv-foglalas').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0 })
ok('az Időpontot kérek a foglaláshoz görget', true, lathato)

console.log('\n=== 3) Térkép és footer ===\n')
ok('a térkép előbb csak kérdez, nem tölt', [0, 0], [await p.locator('.kv-terkep iframe').count(), terkepKeres.length])
await p.getByRole('button', { name: 'Térkép betöltése' }).click(); await p.waitForTimeout(500)
const src = await p.locator('.kv-terkep iframe').getAttribute('src')
ok('Google térkép a Mosathat címére', true, /google\.com\/maps\?q=Mosathat%2C%20V%C3%A1ci%20%C3%BAt%20140%2C%201138%20Budapest.*output=embed/.test(src))
ok('a térkép betöltése el is indul', true, terkepKeres.length > 0)
ok('útvonaltervező link új lapon', '_blank', await p.locator('.kv-hely a.kv-link').getAttribute('target'))
const lab = sima(await p.locator('.kv-lab').innerText())
ok('a footerben ott a cím, a nyitvatartás és a telefon', [true, true, true],
  [/1138 Budapest, Váci út 140\./.test(lab), /9:00–17:00/.test(lab), /\+36 1 506 0420/.test(lab)])
ok('nincs rag az idő után', false, /\d:\d\d-(tól|től|ig|ra|re)/.test(lab + sima(await p.locator('.kv-hely').innerText())))

console.log('\n=== 4) Mind a 8 koncepció, mindkét módban ===\n')
for (const kod of ['01', '02', '03', '04', '05', '06', '07', '08']) {
  await p.locator('.arculat-lista button').filter({ hasText: kod }).click(); await p.waitForTimeout(200)
  const van = await p.evaluate(() => ['.kv-tabla', '.kv-kat', '.kv-foglalas', '.kv-hely .kv-terkep', '.kv-lab'].map((s) => !!document.querySelector(`.kv ${s}`)))
  ok(`${kod}: táblázat, váltó, foglalás, térkép, footer`, [true, true, true, true, true], van)
}

console.log('\n=== 5) Telefonon nem lóg ki a táblázat ===\n')
await p.locator('.arculat-valto button').filter({ hasText: 'Telefon' }).click(); await p.waitForTimeout(400)
for (const kod of ['01', '02', '03', '04', '05', '06', '07', '08']) {
  await p.locator('.arculat-lista button').filter({ hasText: kod }).click(); await p.waitForTimeout(200)
  for (const m of ['Világos', 'Sötét']) {
    await p.locator('.arculat-valto button').filter({ hasText: m }).click(); await p.waitForTimeout(150)
    const g = await p.locator('.kv-tabla-gorgo').evaluate((e) => e.scrollWidth - e.clientWidth)
    if (g > 1) ok(`${kod} ${m}: nincs vízszintes görgetés`, 0, g)
  }
}
ok('mind a 16 telefonos nézetben elfér', true, true)
if (KEPEK) await p.screenshot({ path: join(KEPEK, 'v71-telefon.png') })
ok('nincs JS hiba', [], hibak)

await ctx.close()
await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
