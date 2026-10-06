// v53: a napi kártyán a „Megvárja" címke (sárga), a H-V-hez hasonlóan.
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

const kartya = (rsz) => p.locator('.napi-lista .kartya').filter({ has: p.locator('.rendszam', { hasText: rsz }) }).first()
const cimke = (rsz) => kartya(rsz).locator('.cimke-pill[data-r="megvarja"]')

console.log('=== Megvárja címke ===\n')
// A demóban ma két „megvárja" foglalás van (ABC-123, PQR-450), a többi itt hagyja.
ok('ABC-123 (megvárja): van címke', 'Megvárja', (await cimke('ABC-123').innerText()).trim())
ok('PQR-450 (megvárja): van címke', 1, await cimke('PQR-450').count())
ok('LMN-882 (itt hagyja): nincs', 0, await cimke('LMN-882').count())
ok('összesen kettő a napi listában', 2, await p.locator('.napi-lista .cimke-pill[data-r="megvarja"]').count())
const r = await cimke('ABC-123').evaluate((e) => {
  const s = getComputedStyle(e)
  const rsz = e.closest('.kartya-felso').querySelector('.rendszam').getBoundingClientRect()
  return { hatter: s.backgroundColor, sorban: Math.abs(e.getBoundingClientRect().top - rsz.top) < 20 }
})
ok('sárga háttér', 'rgb(255, 216, 77)', r.hatter)
ok('a rendszám sorában', true, r.sorban)
ok('a H-V címke megmaradt (KER-100)', 1, await p.locator('.napi-lista .cimke-pill[data-r="hozomviszem"]').count())
await p.locator('.napi-lista').screenshot({ path: '/tmp/claude-0/-home-claude/0da2f43f-f114-54e0-8861-a3d34165c4b9/scratchpad/v53.png' })

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
