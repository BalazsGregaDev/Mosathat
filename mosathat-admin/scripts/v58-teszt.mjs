import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
async function belep(email) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
  return p
}
const menu = async (p, n) => { await p.locator('aside.oldalsav button').filter({ hasText: n }).first().click(); await p.waitForTimeout(1500) }
const alkalmazottak = async (p) => Number((await p.locator('.kapacitas-lab').innerText()).match(/(\d+) alkalmazott/)?.[1] ?? 0)

const p = await belep('tulaj@mosathat.hu')
console.log('=== 1) közös fiók: nem számít a kapacitásba ===\n')
await menu(p, 'Időpontok')
const elotte = await alkalmazottak(p)
console.log(`         előtte: ${elotte} alkalmazott`)
await menu(p, 'Felhasználók')
const sor = p.locator('tr').filter({ hasText: 'Gábor' }).first()
ok('az alkalmazott sorában ott a kapcsoló', 1, await sor.locator('.kozos-fiok input').count())
ok('a tulajdonos sorában nincs', 0, await p.locator('tr').filter({ hasText: 'Tulaj Tamás' }).locator('.kozos-fiok input').count())
await sor.locator('.kozos-fiok input').check(); await p.waitForTimeout(1200)
ok('bekapcsolva marad', true, await sor.locator('.kozos-fiok input').isChecked())
await menu(p, 'Időpontok')
ok('a kapacitás-kártyán eggyel kevesebb alkalmazott', elotte - 1, await alkalmazottak(p))
await menu(p, 'Profilom')
ok('a Profilom „Kinek" listájában nincs ott (nem ember)', 0,
  await p.locator('#mv-kinek option').filter({ hasText: 'Gábor' }).count())

console.log('\n=== 2) Időpontfoglalás: a legkorábbi időpont 9:00 ===\n')
const f = await belep('demo@mosathat.hu')
await menu(f, 'Időpontfoglalás')
const m = f.locator('.fogl')
await m.locator('.fogl-csomag', { has: f.locator('.nev', { hasText: /^Start$/ }) }).click()
for (const tipus of ['Megvárom', 'Itt hagyom']) {
  await m.locator('.fogl-valaszto button').filter({ hasText: tipus }).click(); await f.waitForTimeout(3500)
  await m.locator('.fogl-nap[data-allapot="szabad"], .fogl-nap[data-allapot="keves"]').first().click(); await f.waitForTimeout(500)
  const idok = (await m.locator('.fogl-idok button').allTextContents()).map((x) => x.replace(/kész.*/, '').trim())
  ok(`${tipus}: az első időpont 9:00, előtte nincs`, ['9:00', false, false],
    [idok[0], idok.includes('8:00'), idok.includes('8:30')])
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
