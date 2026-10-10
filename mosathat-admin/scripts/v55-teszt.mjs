import { chromium } from 'playwright'

import { helyiIdo, munkanap } from './_munkanap.mjs'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const ma = munkanap().nap
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
await p.clock.install({ time: helyiIdo(ma, '09:40') })
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(2500)
await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).first().click()
await p.waitForTimeout(2000)

const iv = p.locator('.idovonal')
console.log('=== 1) hely és szerkezet ===\n')
ok('van idővonal', 1, await iv.count())
ok('az első kártya helyén (a lista fölött)', true, await p.evaluate(() => {
  const i = document.querySelector('.idovonal').getBoundingClientRect()
  const k = document.querySelector('.napi-lista .kartya').getBoundingClientRect()
  return i.bottom <= k.top
}))
ok('két hely (sor)', ['1. hely', '2. hely'], await iv.locator('.iv-sornev').allTextContents())
ok('negyedórás bontás (munkaidő 8–17: 36 negyedóra soronként)', 72, await iv.locator('.iv-negyed').count())
ok('az ebédszünet sraffozva', true, (await iv.locator('.iv-negyed[data-allapot="szunet"]').count()) > 0)
ok('a most-vonal', 1, await iv.locator('.iv-most').count())

console.log('\n=== 2) színek ===\n')
const szin = async (rsz) => iv.locator('.iv-darab').filter({ hasText: rsz }).first()
  .evaluate((e) => [e.dataset.fajta, getComputedStyle(e).backgroundColor])
ok('ABC-123 (megvárja): sárga, fix', ['FIX', 'rgb(255, 216, 77)'], await szin('ABC-123'))
ok('LMN-882 (itt hagyja): türkiz, rugalmas', ['RUGALMAS', 'rgb(205, 234, 230)'], await szin('LMN-882'))
ok('van többnapos darab (lila)', true, (await iv.locator('.iv-darab[data-fajta="TOBBNAPOS"]').count()) > 0)
const abc = await iv.locator('.iv-darab').filter({ hasText: 'ABC-123' }).first().evaluate((e) => {
  const t = e.parentElement.getBoundingClientRect(); const r = e.getBoundingClientRect()
  return [Math.round((r.left - t.left) / t.width * 9 * 60), Math.round(r.width / t.width * 9 * 60)]
})
ok('ABC-123 8:00-tól 2 órán át (a sávon)', true, Math.abs(abc[0]) <= 5 && Math.abs(abc[1] - 120) <= 6)

console.log('\n=== 3) a sor végén: hány Start fér még be ===\n')
const befer = iv.locator('.iv-befer')
ok('ott van', 1, await befer.count())
ok('szám és „Start autó fér még be"', true,
  /^(\+\d+|0)$/.test((await befer.locator('.szam').innerText()).trim())
  && /Start autó/.test(await befer.innerText()))
ok('a sor végén (a sávoktól jobbra)', true, await p.evaluate(() =>
  document.querySelector('.iv-befer').getBoundingClientRect().left
  >= document.querySelector('.iv-gorget').getBoundingClientRect().right - 1))

console.log('\n=== 4) kattintás: munkalap ===\n')
await iv.locator('.iv-darab').filter({ hasText: 'ABC-123' }).first().click()
await p.waitForTimeout(1200)
ok('megnyílt az ABC-123 munkalapja', true, (await p.locator('[aria-label="Munkalap"]').innerText()).includes('ABC-123'))
await p.keyboard.press('Escape'); await p.waitForTimeout(600)

console.log('\n=== 5) holnap: nincs most-vonal, a befér szám a teljes napra ===\n')
await p.locator('.napvalto .nyil').last().click(); await p.waitForTimeout(1800)
ok('nincs most-vonal', 0, await iv.locator('.iv-most').count())

console.log('\n=== 6) telefonon: vízszintesen görgethető, nem lóg ki ===\n')
const m = await (await b.newContext({ viewport: { width: 400, height: 900 }, hasTouch: true })).newPage()
await m.goto('http://localhost:5180/')
await m.waitForSelector('input[type="email"]', { timeout: 60000 })
await m.fill('input[type="email"]', 'tulaj@mosathat.hu'); await m.fill('input[type="password"]', 'x')
await m.getByRole('button', { name: /Belépés/ }).click(); await m.waitForTimeout(2500)
await m.locator('.mobil-fejlec .hamburger').click(); await m.waitForTimeout(400)
await m.locator('.fiok button').filter({ hasText: 'Időpontok' }).first().click(); await m.waitForTimeout(2000)
ok('az oldal nem lóg ki oldalra', true, await m.evaluate(() =>
  document.querySelector('.tartalom').scrollWidth <= document.querySelector('.tartalom').clientWidth + 1))
ok('az idővonal magában görgethető', true, await m.evaluate(() => {
  const g = document.querySelector('.iv-gorget'); return g.scrollWidth > g.clientWidth
}))

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
