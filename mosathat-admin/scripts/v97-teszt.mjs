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
const DEMO = 'http://localhost:5180'

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
const hibak = []
p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await p.goto(DEMO + '/publikus')
await p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 90000 })
await p.locator('.kv-galeria-racs').evaluate((e) => scrollTo(0, e.getBoundingClientRect().top + scrollY - 260))
await p.waitForFunction(() => document.querySelectorAll('.kv-galeria-racs .kv-moso[data-kesz]').length === 4, null, { timeout: 30000 })
await p.waitForTimeout(400)
const cdp = await ctx.newCDPSession(p)
const huz = async (pontok) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pontok[0][0], y: pontok[0][1] }] })
  for (let i = 1; i < pontok.length; i++) {
    const [x0, y0] = pontok[i - 1]
    const [x1, y1] = pontok[i]
    for (let k = 1; k <= 10; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * k) / 10, y: y0 + ((y1 - y0) * k) / 10 }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await p.waitForTimeout(400)
}
const tegla = (i) => p.locator('.kv-galeria-racs .kv-moso').nth(i).boundingBox()
const alfa = (i, pontok) => p.locator('.kv-galeria-racs .kv-moso canvas').nth(i).evaluate((c, pp) => {
  const ctx2 = c.getContext('2d')
  return pp.map(([x, y]) => ctx2.getImageData(Math.round(x * (c.width - 1)), Math.round(y * (c.height - 1)), 1, 1).data[3])
}, pontok)

console.log('=== Telefonon a szivacs benyomása után egy húzással több kép is lemosható ===\n')
const [a, bb] = [await tegla(0), await tegla(1)]
await huz([[a.x + a.width * 0.2, a.y + a.height * 0.5], [bb.x + bb.width * 0.8, bb.y + bb.height * 0.5]])
ok('kikapcsolt szivaccsal az ujj nem mos', [255, 255], [...await alfa(0, [[0.5, 0.5]]), ...await alfa(1, [[0.5, 0.5]])])
await p.locator('.kv-galeria-racs').evaluate((e) => scrollTo(0, e.getBoundingClientRect().top + scrollY - 260))
await p.waitForTimeout(300)
await p.locator('.kv-szivacs-gomb').tap()
await p.waitForTimeout(300)
const [a2, b2, c2, d2] = [await tegla(0), await tegla(1), await tegla(2), await tegla(3)]
const y0 = await p.evaluate(() => scrollY)
await huz([[a2.x + a2.width * 0.15, a2.y + a2.height * 0.5], [b2.x + b2.width * 0.85, b2.y + b2.height * 0.5]])
ok('vízszintesen az első képről a másodikra húzva, felemelés nélkül: mindkettő lemosódik a csík mentén', [[0, 0, 0], [0, 0, 0]],
  [await alfa(0, [[0.3, 0.5], [0.6, 0.5], [0.95, 0.5]]), await alfa(1, [[0.05, 0.5], [0.4, 0.5], [0.7, 0.5]])])
await huz([[a2.x + a2.width * 0.5, a2.y + a2.height * 0.15], [c2.x + c2.width * 0.5, c2.y + c2.height * 0.85]])
ok('függőlegesen az elsőről a harmadikra húzva is folytatódik', [[0, 0], [0, 0]],
  [await alfa(0, [[0.5, 0.25], [0.5, 0.95]]), await alfa(2, [[0.5, 0.05], [0.5, 0.6]])])
await huz([[b2.x + b2.width * 0.3, b2.y + b2.height * 0.2], [c2.x + c2.width * 0.6, c2.y + c2.height * 0.8], [d2.x + d2.width * 0.7, d2.y + d2.height * 0.3]])
ok('átlósan és vissza, egy mozdulattal mind a négy képen át', [0, 0, 0],
  [...await alfa(3, [[0.4, 0.44]]), ...await alfa(2, [[0.75, 0.78]]), ...await alfa(1, [[0.3, 0.2]])])
ok('a köztes résen nem húz át: az érintetlen részek koszosak maradnak', [255, 255, 255, 255],
  [...await alfa(0, [[0.1, 0.1]]), ...await alfa(1, [[0.95, 0.95]]), ...await alfa(2, [[0.05, 0.05]]), ...await alfa(3, [[0.05, 0.95]])])
ok('közben az oldal nem görgetett el', y0, await p.evaluate(() => scrollY))
if (KEPEK) await p.locator('.kv-galeria-racs').screenshot({ path: join(KEPEK, '01-telefon-egy-huzassal.png') })
await p.locator('.kv-x').tap()
await p.waitForTimeout(300)
const [a3, b3] = [await tegla(0), await tegla(1)]
const elotte = await alfa(0, [[0.5, 0.15]])
await huz([[a3.x + a3.width * 0.2, a3.y + a3.height * 0.15], [b3.x + b3.width * 0.8, b3.y + b3.height * 0.15]])
ok('X után az ujj ismét nem mos', elotte, await alfa(0, [[0.5, 0.15]]))
ok('nincs futásidejű hiba', [], hibak)
await ctx.close()

console.log('\n=== Asztali gépen az egér ugyanúgy mos, mint eddig ===\n')
{
  const c2 = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const q = await c2.newPage()
  await q.goto(DEMO + '/publikus')
  await q.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 90000 })
  await q.locator('.kv-galeria-racs').evaluate((e) => scrollTo(0, e.getBoundingClientRect().top + scrollY - 90))
  await q.waitForFunction(() => document.querySelectorAll('.kv-galeria-racs .kv-moso[data-kesz]').length === 4, null, { timeout: 30000 })
  const r0 = await q.locator('.kv-galeria-racs .kv-moso').nth(0).boundingBox()
  const r1 = await q.locator('.kv-galeria-racs .kv-moso').nth(1).boundingBox()
  await q.mouse.move(r0.x + 10, r0.y + r0.height / 2)
  await q.mouse.move(r1.x + r1.width - 10, r1.y + r1.height / 2, { steps: 40 })
  await q.waitForTimeout(300)
  ok('egérrel áthúzva mindkét kép lemosódik', [0, 0], await q.evaluate(() => [...document.querySelectorAll('.kv-galeria-racs .kv-moso canvas')].slice(0, 2).map((c) => c.getContext('2d').getImageData(Math.round(c.width / 2), Math.round(c.height / 2), 1, 1).data[3])))
  await c2.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'MINDEN RENDBEN' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
