import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import QRCode from 'qrcode'
import { hetkoznapra } from './_munkanap.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const kep = async (p, nev) => { if (KEPEK) await p.screenshot({ path: join(KEPEK, `${nev}.png`) }) }
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const DEMO = 'http://localhost:5180'
const hibak = []

async function megnyit(opts, nev) {
  const ctx = await b.newContext(opts)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  await hetkoznapra(p)
  await p.goto(DEMO + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 90000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
  if (opts.isMobile) {
    await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(500)
    await p.locator('.fiok button').filter({ hasText: 'Cégek és bérletesek' }).first().click()
  } else {
    await p.locator('.oldalsav .menu button').filter({ hasText: 'Cégek és bérletesek' }).click()
  }
  await p.locator('.cegtabla .ceglink-cim').first().waitFor({ timeout: 30000 })
  const sor = p.locator('.cegtabla-sor[data-ceg="Autó Trans Kft."]')
  const link = await sor.locator('.ceglink-cim').innerText()
  await sor.getByRole('button', { name: 'QR-kód' }).click()
  await p.locator('.qr-kep img').waitFor({ timeout: 15000 })
  await p.waitForTimeout(400)
  await kep(p, nev)
  return { p, sor, link }
}

console.log('=== 1) QR-kód a linkhez (asztali) ===\n')
const { p, link } = await megnyit({ viewport: { width: 1440, height: 900 } }, '01-qr-asztali')
const minta = QRCode.create(link, { errorCorrectionLevel: 'M' }).modules
const varat = Array.from(minta.data, (x) => (x ? 1 : 0)).join('')
const kapott = await p.locator('.qr-kep img').evaluate(async (img, meret) => {
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = img.naturalHeight
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  const cella = img.naturalWidth / (meret + 4)
  let ki = ''
  for (let y = 0; y < meret; y++) {
    for (let x = 0; x < meret; x++) {
      const d = g.getImageData(Math.floor((x + 2.5) * cella), Math.floor((y + 2.5) * cella), 1, 1).data
      ki += d[0] < 128 ? '1' : '0'
    }
  }
  return ki
}, minta.size)
ok('a QR-kód pontosan a működő linket tartalmazza (modulonként ellenőrizve)', varat, kapott)
ok('cégnév és link az ablakban', [true, true],
  [(await p.locator('.qr-ablak .qr-ceg').innerText()) === 'Autó Trans Kft.', (await p.locator('.qr-ablak .qr-link').innerText()) === link])
const letolt = p.locator('.qr-ablak a', { hasText: 'Letöltés (PNG)' })
ok('PNG letöltés fájlnévvel', 'foglalas-qr-auto-trans-kft.png', await letolt.getAttribute('download'))
const [dl] = await Promise.all([p.waitForEvent('download'), letolt.click()])
ok('a letöltés elindul', 'foglalas-qr-auto-trans-kft.png', dl.suggestedFilename())
await p.keyboard.press('Escape')
await p.waitForTimeout(300)
ok('Escape bezárja', 0, await p.locator('.qr-ablak').count())

console.log('\n=== 2) Telefonon / tableten ===\n')
const t = await megnyit({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, '02-qr-telefon')
const r = await t.p.locator('.qr-kep').boundingBox()
ok('a kód nagy és kifér a képernyőre', true, r.width >= 300 && r.x >= 0 && r.x + r.width <= 390)
await t.p.getByRole('button', { name: 'Bezárás' }).click()
await t.p.waitForTimeout(300)
ok('Bezárás gomb bezárja', 0, await t.p.locator('.qr-ablak').count())

ok('nincs JS hiba', [], hibak)
await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
