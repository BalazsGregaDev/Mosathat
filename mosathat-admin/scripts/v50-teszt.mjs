// v50: a heti nézet a napi sorrendet követi; a havi nézetben az aznapi
// autók száma nagyban („+ 8 autó"), a többnapos sávok alatt.
import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(2500)
await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).first().click()
await p.waitForTimeout(1500)
const nezet = async (n) => {
  await p.locator('.fejlec .nezetvalto button').filter({ hasText: n }).click()
  await p.waitForTimeout(1500)
}

// A napi lista egynapos autói (a többnaposak a heti nézetben sávok)
const napiSor = async () => p.evaluate(() => [...document.querySelectorAll('.napi-lista .kartya')]
  .filter((k) => !k.querySelector('.kartya-tobbnap'))
  .map((k) => k.querySelector('.rendszam').textContent.trim()))
const hetiMa = async () => p.evaluate(() => [...document.querySelectorAll('.naposzlop[data-ma] .oszloptorzs .minikartya .azon')]
  .map((e) => e.textContent.trim()))

console.log('=== 1) A heti nézet a napi sorrendben ===\n')
const elotte = await napiSor()
await nezet(/^Hét$/)
ok('ma: a heti oszlop = a napi lista', elotte, await hetiMa())

console.log('\n=== 2) Átrendezés a napiban → a heti követi ===\n')
await nezet(/^Nap$/)
// Billentyűvel: az utolsó egynapos autó kettővel feljebb
const utolso = elotte[elotte.length - 1]
await p.locator('.napi-lista .sor-elem').filter({ has: p.locator('.rendszam', { hasText: utolso }) })
  .locator('.fogo').first().focus()
await p.keyboard.press('ArrowUp'); await p.waitForTimeout(900)
await p.keyboard.press('ArrowUp'); await p.waitForTimeout(1200)
const utana = await napiSor()
ok('a napi sorrend megváltozott', false, JSON.stringify(utana) === JSON.stringify(elotte))
await nezet(/^Hét$/)
ok('a heti ugyanígy áll', utana, await hetiMa())

console.log('\n=== 3) Havi nézet: nagy szám az aznapi autókkal ===\n')
await nezet(/^Hónap$/)
const ma = p.locator('.honapnap[data-ma]')
const szam = Number(await ma.locator('.honap-autok .szam').innerText())
ok('ma: az egynapos autók száma', utana.length, szam)
ok('van fölötte többnapos sáv, ezért „+"', 1, await ma.locator('.honap-autok .plusz').count())
ok('nincsenek egyenkénti kártyák', 0, await p.locator('.honapnap .minikartya').count())
const meret = await ma.locator('.honap-autok .szam').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
ok('a szám nagy (30 px)', 30, meret)
const magas = await ma.evaluate((e) => e.getBoundingClientRect().height)
ok('a sor elég magas (legalább 104 px)', true, magas >= 104)
await p.screenshot({ path: '/tmp/claude-0/-home-claude/0da2f43f-f114-54e0-8861-a3d34165c4b9/scratchpad/v50-honap.png' })

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
