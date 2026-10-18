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
const CIM = 'http://localhost:5180'

async function oldal(viewport, kep) {
  const ctx = await b.newContext({ viewport })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
  await p.route('**/kepek/borito.jpg', (r) => (kep ? r.fulfill({ contentType: 'image/png', body: kep }) : r.fulfill({ status: 404, body: '' })))
  await p.goto(CIM + '/publikus')
  await p.locator('.kv-foto').waitFor({ timeout: 60000 })
  await p.waitForFunction(() => document.querySelector('.kv-foto')?.dataset.kep !== 'tolt', null, { timeout: 15000 })
  return { ctx, p, hibak }
}

const minta = await (async () => {
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage()
  await p.setContent('<body style="margin:0;height:900px;background:linear-gradient(120deg,#0f2a1d,#3d6b52 55%,#c9b98f)"></body>')
  return p.screenshot({ type: 'png' })
})()

console.log('=== 1) Kép nélkül: marad a helykitöltő ===\n')
const u = await oldal({ width: 1440, height: 900 })
ok('nincs kép: helykitöltő felirat látszik, törött kép nincs', ['nincs', true, 'none'], [
  await u.p.locator('.kv-foto').getAttribute('data-kep'),
  await u.p.locator('.kv-foto span').isVisible(),
  await u.p.locator('.kv-foto img').evaluate((e) => getComputedStyle(e).display),
])
ok('a sáv magassága változatlan', 170, Math.round((await u.p.locator('.kv-foto').boundingBox()).height))
await u.ctx.close()

console.log('\n=== 2) A /kepek/borito.jpg fájllal, asztali gépen: ablak a fix háttérre ===\n')
const v = await oldal({ width: 1440, height: 900 }, minta)
const doboz = await v.p.locator('.kv-foto').boundingBox()
const stilus = await v.p.locator('.kv-foto').evaluate((e) => {
  const s = getComputedStyle(e)
  return { csatolas: s.backgroundAttachment, kep: /\/kepek\/borito\.jpg/.test(s.backgroundImage), meret: s.backgroundSize }
})
ok('a kép megjelenik, a felirat eltűnik', ['van', false], [
  await v.p.locator('.kv-foto').getAttribute('data-kep'),
  await v.p.locator('.kv-foto span').isVisible(),
])
ok('a kép fix háttérként áll mögötte, a sáv csak ablak', { csatolas: 'fixed', kep: true, meret: 'cover' }, stilus)
ok('asztali gépen magasabb ablak (a szélesség 40%-a, legfeljebb 600 px)', 576, Math.round(doboz.height))
await v.p.evaluate(() => scrollTo(0, 0)); await v.p.waitForTimeout(200)
const y = Math.round(doboz.y + 100)
const pont = () => v.p.screenshot({ clip: { x: 720, y, width: 1, height: 1 } })
const elotte = await pont()
await v.p.evaluate(() => scrollTo(0, 120)); await v.p.waitForTimeout(250)
const utana = await pont()
ok('görgetéskor a kép nem mozdul, csak az ablak csúszik rajta', true, Buffer.compare(elotte, utana) === 0)
ok('a képleírás megmarad a képernyőolvasónak', true, /Mosathat/.test(await v.p.locator('.kv-foto img').getAttribute('alt')))
ok('nincs JS hiba', [], v.hibak)
if (KEPEK) {
  await v.p.evaluate(() => scrollTo(0, 0)); await v.p.waitForTimeout(200)
  await v.p.screenshot({ path: join(KEPEK, 'v81-borito.png') })
  await v.p.evaluate(() => scrollTo(0, 330)); await v.p.waitForTimeout(250)
  await v.p.screenshot({ path: join(KEPEK, 'v81-borito-gorgetve.png') })
}
await v.ctx.close()

console.log('\n=== 3) Telefonon: álló kép, mint eddig ===\n')
const t = await oldal({ width: 390, height: 844 }, minta)
await t.p.waitForFunction(() => getComputedStyle(document.querySelector('.kv-foto img')).opacity === '1', null, { timeout: 5000 }).catch(() => {})
ok('telefonon 200 px magas, sima kép (nem fix háttér), nem lóg ki', [200, '1', 'scroll', true], [
  Math.round((await t.p.locator('.kv-foto').boundingBox()).height),
  await t.p.locator('.kv-foto img').evaluate((e) => getComputedStyle(e).opacity),
  await t.p.locator('.kv-foto').evaluate((e) => getComputedStyle(e).backgroundAttachment),
  await t.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
])
if (KEPEK) await t.p.screenshot({ path: join(KEPEK, 'v81-borito-telefon.png') })
await t.ctx.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
