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
  const google = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
  p.on('request', (r) => { if (/google\./.test(r.url())) google.push(r.url()) })
  await p.route(/google\.com\/maps/, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>térkép</p>' }))
  await p.goto(CIM + utvonal)
  await p.locator('.kv').waitFor({ timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
  return { ctx, p, hibak, google }
}

console.log('=== 1) Élő foglalás a /publikus oldalon, belépés nélkül ===\n')
const o = await oldal('/publikus')
const m = o.p.locator('.kv-foglalas-elo .fogl')
await m.waitFor({ timeout: 20000 })
ok('nincs belépés, nincs „Előnézet” sáv és fejlesztői rész', [0, 0, 0],
  [await o.p.locator('input[type="email"][autocomplete="username"]').count(), await m.locator('.fogl-proba').count(), await m.locator('.fogl-fejleszto').count()])
const gomb = (szoveg) => m.locator('.fogl-valaszto button').filter({ hasText: szoveg })
await gomb('Személyautó').click()
await m.locator('.fogl-csomag', { has: o.p.locator('.nev', { hasText: /^Premium$/ }) }).click(); await o.p.waitForTimeout(900)
ok('az ár a nyilvános árajánlatból jön', true, /15 600 Ft/.test(sima(await m.locator('.fogl-osszeg').innerText())))
await gomb('Itt hagyom').click(); await o.p.waitForTimeout(3500)
const szabad = m.locator('.fogl-nap[data-allapot="szabad"]')
ok('a naptár a nyilvános foglaltsági adatból számol, van szabad nap', true, (await szabad.count()) > 0)
await szabad.first().click(); await o.p.waitForTimeout(1500)
await m.locator('.fogl-idok button').first().click(); await o.p.waitForTimeout(800)
await o.p.fill('#fo-nev', 'Nyilvános Nóra')
await o.p.fill('#fo-tel', '+36 30 765 4321')
await o.p.fill('#fo-email', 'nora@pelda.hu')
await o.p.fill('#fo-rsz', 'pub-778')
const adatv = m.locator('.fogl-adatvedelem a')
ok('link az Adatvédelmi tájékoztatóra, új lapon', ['/adatvedelem', '_blank'], [await adatv.getAttribute('href'), await adatv.getAttribute('target')])
ok('a feltétel a lemondási határidőt is kiírja', true, /legalább 24 órával/.test(await m.locator('.fogl-feltetel').innerText()))
ok('a robotcsapda mező nem látható', true, await o.p.locator('#fo-weboldal').evaluate((e) => e.getBoundingClientRect().right < 0))
if (KEPEK) await m.screenshot({ path: join(KEPEK, 'v78-foglalas-kitoltve.png') })
await m.locator('.fogl-feltetel input').check()
await m.getByRole('button', { name: 'Foglalási kérés küldése' }).click(); await o.p.waitForTimeout(2500)
const siker = sima(await m.locator('.fogl-siker').innerText())
ok('beküldve: köszönő üzenet, e-mailes visszaigazolás ígérete', [true, true], [/Köszönjük/.test(siker), /e-mailt küldünk/.test(siker)])
ok('a köszönő oldalon sincs admin gomb', 0, await m.getByRole('button', { name: /napi nézetben/ }).count())
if (KEPEK) await m.screenshot({ path: join(KEPEK, 'v78-foglalas-siker.png') })

console.log('\n=== 2) Robot (kitöltött rejtett mező) ===\n')
await m.getByRole('button', { name: 'Új foglalás' }).click(); await o.p.waitForTimeout(800)
await m.locator('.fogl-csomag', { has: o.p.locator('.nev', { hasText: /^Start$/ }) }).click(); await o.p.waitForTimeout(700)
await gomb('Megvárom').click(); await o.p.waitForTimeout(3500)
await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await o.p.waitForTimeout(1500)
await m.locator('.fogl-idok button').first().click(); await o.p.waitForTimeout(800)
await o.p.fill('#fo-nev', 'Robot Róbert')
await o.p.fill('#fo-tel', '+36 30 111 0000')
await o.p.fill('#fo-rsz', 'BOT-001')
await o.p.locator('#fo-weboldal').fill('http://spam.example', { force: true })
await m.locator('.fogl-feltetel input').check()
await m.getByRole('button', { name: 'Foglalási kérés küldése' }).click(); await o.p.waitForTimeout(2000)
ok('a szerver elutasítja', true, /nem küldhető/.test(await m.locator('.hibauzenet').innerText()))

console.log('\n=== 3) Térkép csak kattintásra ===\n')
ok('betöltéskor a Google-hez nem megy kérés', [], o.google)
ok('nincs iframe, van magyarázat és gomb', [0, true],
  [await o.p.locator('.kv-terkep iframe').count(), /Google megkapja az IP-címedet/.test(await o.p.locator('.kv-terkep-kerdes').innerText())])
await o.p.getByRole('button', { name: 'Térkép betöltése' }).click(); await o.p.waitForTimeout(600)
ok('kattintás után betölt', [1, true], [await o.p.locator('.kv-terkep iframe').count(), o.google.some((u) => /google\.com\/maps/.test(u))])
ok('nincs JS hiba', [], o.hibak)
await o.ctx.close()

console.log('\n=== 4) Impresszum ===\n')
const i = await oldal('/impresszum')
const it = sima(await i.p.locator('.kv-jogi').innerText())
ok('cím, tervezet jelzés', [true, true], [/Impresszum/.test(it), /Tervezet/.test(it)])
ok('Ekertv. 4. § adatai: név, székhely, e-mail, cégjegyzékszám, bíróság, adószám, tárhely', [true, true, true, true, true, true, true],
  [/MOSATHAT Autóápolási Korlátolt Felelősségű Társaság/, /1138 Budapest, Váci út 140\./, /info@mosathat\.hu/, /01-09-861782/,
   /Fővárosi Törvényszék Cégbírósága/, /13562496-2-41/, /Vercel Inc\..*Supabase Pte\. Ltd\./].map((r) => r.test(it)))
ok('panaszkezelés és békéltető testület (Fgytv. 17/A. §)', [true, true, true],
  [/30 napon belül/.test(it), /Budapesti Békéltető Testület/.test(it), /bekelteto\.testulet@bkik\.hu/.test(it)])
ok('nincs már ODR-hivatkozás', false, /ec\.europa\.eu\/consumers\/odr|ODR/.test(it))
if (KEPEK) await i.p.screenshot({ path: join(KEPEK, 'v78-impresszum.png'), fullPage: true })
await i.p.locator('.kv-lab-also a').filter({ hasText: 'Adatvédelmi tájékoztató' }).click()
await i.p.waitForURL('**/adatvedelem'); await i.p.locator('.kv-jogi h1').waitFor()
ok('a footer linkje az Adatvédelmi tájékoztatóra visz', 'Adatvédelmi tájékoztató', sima(await i.p.locator('.kv-jogi h1').innerText()))
await i.ctx.close()

console.log('\n=== 5) Adatvédelmi tájékoztató ===\n')
const a = await oldal('/adatvedelem')
const at = sima(await a.p.locator('.kv-jogi').innerText())
ok('GDPR 13. cikk elemei', [true, true, true, true, true, true, true, true],
  [/1\. Az adatkezelő/, /Jogalap/, /Megőrzés/, /Adatfeldolgozó/, /Európai Gazdasági Térségen kívülre/, /A jogaid/, /Jogorvoslat/, /önkéntes/].map((r) => r.test(at)))
ok('NAIH aktuális elérhetőségei', [true, true, true], [/1055 Budapest, Falk Miksa utca 9-11\./.test(at), /1363 Budapest, Pf\. 9\./.test(at), /ugyfelszolgalat@naih\.hu/.test(at)])
ok('az adatfeldolgozók között a Resend jogi neve', true, /Plus Five Five, Inc\./.test(at))
ok('jogalapok: szerződés, jogi kötelezettség, jogos érdek, hozzájárulás', [true, true, true, true],
  [/6\. cikk \(1\) b\)/, /6\. cikk \(1\) c\)/, /6\. cikk \(1\) f\)/, /6\. cikk \(1\) a\)/].map((r) => r.test(at)))
await a.p.locator('.kv-nav nav a').filter({ hasText: 'Csomagok' }).click()
await a.p.waitForURL('**/publikus#csomagok'); await a.p.locator('.kv-csomagok').waitFor(); await a.p.waitForTimeout(800)
ok('a menü a főoldal megfelelő részére visz', true, await a.p.locator('.kv-csomagok').evaluate((e) => Math.abs(e.getBoundingClientRect().top) < 200))
await a.ctx.close()

console.log('\n=== 6) Telefonon ===\n')
const t = await oldal('/publikus', { width: 390, height: 844 })
await t.p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 20000 })
ok('a foglalás telefonon sem lóg ki', true, await t.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
if (KEPEK) { await t.p.locator('.kv-foglalas-elo').screenshot({ path: join(KEPEK, 'v78-foglalas-telefon.png') }) }
await t.ctx.close()
const tj = await oldal('/adatvedelem', { width: 390, height: 844 })
ok('a tájékoztató telefonon sem lóg ki', true, await tj.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
await tj.ctx.close()

console.log('\n=== 7) Az admin előnézet változatlan ===\n')
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } })
const p = await ctx.newPage()
await p.goto(CIM + '/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu'); await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click(); await p.waitForTimeout(2500)
await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontfoglalás' }).first().click(); await p.waitForTimeout(1500)
ok('belépve: előnézet sáv és fejlesztői részletek megvannak, robotcsapda nincs', [1, 1, 0],
  [await p.locator('.fogl-proba').count(), await p.locator('.fogl-fejleszto').count(), await p.locator('#fo-weboldal').count()])
await ctx.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
