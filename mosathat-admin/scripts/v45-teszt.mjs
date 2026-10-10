import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } })
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
await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click()
await p.waitForTimeout(1500)
const fejek = await p.evaluate(() => [...document.querySelectorAll('dialog[aria-label="Új időpont"] .szakasz > .fej')]
  .map((e) => e.textContent.trim().split('\n')[0].trim()))
console.log(`         ${JSON.stringify(fejek)}`)
ok('a Mikor a második szakasz (az ügyfél után)', 'Mikor', fejek[1])
ok('utána a Jármű', 'Jármű', fejek[2])
const r = await p.evaluate(() => {
  const tel = document.querySelector('#tel').getBoundingClientRect()
  const mikor = [...document.querySelectorAll('.szakasz > .fej')].find((e) => e.textContent.trim() === 'Mikor').getBoundingClientRect()
  return mikor.top > tel.bottom
})
ok('a Mikor a telefonszám sora alatt van', true, r)
await p.screenshot({ path: '/tmp/v45.png' })
await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
