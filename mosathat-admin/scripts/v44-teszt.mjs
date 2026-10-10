import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
async function belep(p) {
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'alkalmazott@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(3500)
}
for (const [nev, vp, mob] of [['asztal', { width: 1440, height: 1000 }, false], ['telefon', { width: 390, height: 844 }, true]]) {
  console.log(`=== ${nev} ===\n`)
  const ctx = await b.newContext({ viewport: vp, isMobile: mob, hasTouch: mob })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
  await belep(p)
  const ceges = p.locator('.napi-lista .kartya').filter({ hasText: 'KER-214' }).first()
  ok('céges autó: a cég neve a kártyán', 'Autó Trans Kft.', (await ceges.locator('.kartya-ceg').innerText()).trim())
  ok('a rendszám sorában (felső sor)', 1, await ceges.locator('.kartya-felso .kartya-ceg').count())
  const magan = p.locator('.napi-lista .kartya').filter({ hasText: 'ABC-123' }).first()
  ok('magánautón nincs cég', 0, await magan.locator('.kartya-ceg').count())
  const r = await p.evaluate(() => {
    const t = document.querySelector('.tartalom')
    return { sw: t.scrollWidth, cw: t.clientWidth }
  })
  ok('nem lóg ki oldalra', true, r.sw <= r.cw + 1)
  await ceges.screenshot({ path: `/tmp/v44-${nev}.png` })
  await ctx.close()
}
await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
