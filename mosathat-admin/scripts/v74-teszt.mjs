import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}

const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
const hibak = []
p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(2500)
await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).click(); await p.waitForTimeout(2000)
await p.locator('.napi-lista .kartya[data-allapot="CONFIRMED"]').first().locator('.kartya-nyit').click()
const m = p.locator('dialog[aria-label="Munkalap"]')
await m.locator('#pct').waitFor({ timeout: 10000 })

await m.locator('#pct').scrollIntoViewIfNeeded()
const javasolt = async () => (await m.locator('#veg').getAttribute('placeholder')).replace(/\D/g, '')
const alap = Number(await javasolt())
if (KEPEK) await m.screenshot({ path: join(KEPEK, 'v74-ures.png') })
console.log('=== Erősen szennyezett és Fix felár ===\n')
for (const [id, nev, beir] of [['#pct', 'Erősen szennyezett', '15'], ['#fix', 'Fix felár', '2500']]) {
  const mezo = m.locator(id)
  ok(`${nev}: alapból üres, a 0 csak halvány placeholder`, ['', '0'], [await mezo.inputValue(), await mezo.getAttribute('placeholder')])
  await mezo.click()
  ok(`${nev}: belekattintva üres`, '', await mezo.inputValue())
  await p.keyboard.type(beir)
  ok(`${nev}: rögtön az írt szám áll benne, nem 0${beir}`, beir, await mezo.inputValue())
  await mezo.press('Control+a'); await mezo.press('Backspace')
  ok(`${nev}: kitörölhető, utána újra üres`, '', await mezo.inputValue())
  await p.keyboard.type(beir)
}
ok(`a felárak beszámítanak a javasolt árba (${alap} × 1,15 + 2 500)`, String(Math.round(alap * 1.15) + 2500), await javasolt())
if (KEPEK) await m.screenshot({ path: join(KEPEK, 'v74-felarak.png') })
await m.locator('#pct').fill(''); await m.locator('#fix').fill('')
ok('üresen hagyva 0-nak számít: vissza az eredeti árra', String(alap), await javasolt())
ok('sehol nincs NaN', false, /NaN/.test(await m.innerText()))
ok('nincs JS hiba', [], hibak)
await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
