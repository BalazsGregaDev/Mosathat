import { chromium } from 'playwright'
const K = '/tmp/claude-0/-home-claude/a98973be-035b-5220-8d0c-96ad3bf9340d/scratchpad/k83'
const b = await chromium.launch()
const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
const hibak = []
p.on('pageerror', (e) => hibak.push(e.message))
await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu'); await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click(); await p.waitForTimeout(2500)
await p.locator('aside.oldalsav button').filter({ hasText: /^Tartalom$/ }).click()
await p.locator('.pub-sav').first().waitFor({ timeout: 20000 }); await p.waitForTimeout(2500)
for (const id of ['menu', 'hero', 'fogl-1', 'fogl-2', 'fogl-6', 'fogl-osszeg', 'fogl-siker', 'lab']) {
  const s = p.locator(`.pub-sav[data-sav="${id}"]`)
  await s.scrollIntoViewIfNeeded(); await p.waitForTimeout(400)
  await s.screenshot({ path: `${K}/tart-${id}.png` })
}
console.log('hibak', hibak)
await b.close()
