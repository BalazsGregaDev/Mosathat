import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { CIM } from './_publikus.mjs'
import { hetkoznapra } from './_munkanap.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}

async function oldal(vp = { width: 1440, height: 1000 }) {
  const ctx = await b.newContext({ viewport: vp })
  await ctx.addInitScript(() => {
    window.__csp = []
    document.addEventListener('securitypolicyviolation', (e) => { window.__csp.push(`${e.effectiveDirective} ${e.blockedURI}`) })
  })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
  await hetkoznapra(p)
  return { ctx, p, hibak, sertes: () => p.evaluate(() => window.__csp ?? []) }
}

console.log('=== 1) A fejlécek megérkeznek ===\n')
{
  const { ctx, p } = await oldal()
  for (const ut of ['/', '/publikus', '/foglalas/abc']) {
    const v = await p.goto(CIM + ut)
    const f = v.headers()
    ok(`${ut}: CSP, HSTS, kattintásos csalás elleni védelem`, [true, true, true, 'nosniff'],
      [Boolean(f['content-security-policy']?.includes("frame-ancestors 'self'")), Boolean(f['strict-transport-security']), f['x-frame-options'] === 'SAMEORIGIN', f['x-content-type-options']])
  }
  await ctx.close()
}

console.log('\n=== 2) Publikus oldal a szigorú szabállyal ===\n')
{
  const { ctx, p, hibak, sertes } = await oldal()
  await p.route(/google\.com\/maps/, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>térkép</p>' }))
  await p.goto(CIM + '/publikus')
  await p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 90000 })
  await p.waitForTimeout(2500)
  ok('betölt: nyitó rész, csomagok, foglalás', [1, true], [await p.locator('.kv-hero').count(), (await p.locator('.fogl-csomag').count()) > 0])
  await p.locator('.fogl-csomag').first().click()
  await p.waitForTimeout(800)
  await p.locator('.kv-hasabok, .kv-hero').first().scrollIntoViewIfNeeded()
  await p.locator('.kv-terkep-gomb').scrollIntoViewIfNeeded()
  await p.locator('.kv-terkep-gomb').click()
  await p.waitForTimeout(1200)
  ok('a térkép beágyazása engedélyezett', 1, await p.locator('.kv-hely iframe').count())
  await p.locator('.kv-hero .kv-gomb-masod').first().click()
  await p.waitForTimeout(500)
  ok('a foglaláskereső megnyílik', 1, await p.locator('#fk-rendszam').count())
  ok('nincs letiltott elem', [], await sertes())
  ok('nincs JavaScript hiba', [], hibak)
  if (KEPEK) await p.screenshot({ path: join(KEPEK, '04-eles-build-publikus.png') })
  await p.goto(CIM + '/gyik')
  await p.waitForTimeout(3000)
  ok('GYIK oldal: nincs letiltott elem', [], await sertes())
  await ctx.close()
}

console.log('\n=== 3) Admin a szigorú szabállyal ===\n')
{
  const { ctx, p, hibak, sertes } = await oldal()
  await p.goto(CIM + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 90000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(3000)
  const menupontok = ['Időpontok', 'Ügyfelek', 'Áttekintés', 'Tartalom', 'Felugró ablak', 'Egyedi szekció', 'GYIK', 'Jogi szövegek', 'Arculat']
  for (const m of menupontok) {
    await p.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${m}$`) }).first().click()
    await p.waitForTimeout(2200)
  }
  ok(`${menupontok.length} admin oldal bejárva, nincs letiltott elem`, [], await sertes())
  await p.locator('aside.oldalsav .menu button').filter({ hasText: /^Egyedi szekció$/ }).click()
  await p.waitForTimeout(1500)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
  await p.locator('[data-mezo="kep-fajl"]').setInputFiles({ name: 'k.png', mimeType: 'image/png', buffer: png })
  await p.waitForTimeout(2000)
  ok('képfeltöltés és előnézet működik', [1, 1], [await p.locator('.bej-kep img').count(), await p.locator('.bej-elonezet .kv-egyedi img').count()])
  ok('a képfeltöltésnél sincs letiltott elem', [], await sertes())
  ok('nincs JavaScript hiba', [], hibak)
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
