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
const menu = async (n) => {
  await p.locator('aside.oldalsav button').filter({ hasText: n }).first().click()
  await p.waitForTimeout(1500)
}
const nap = (n) => {
  const d = new Date(); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

console.log('=== 1) A napi kártyán: a következő hónap szabadságai ===\n')
await menu('Időpontok')
const blokk = p.locator('.kapacitas .szabadsag-blokk')
ok('van Szabadság blokk', 1, await blokk.count())
ok('Péter (a demó) benne', true, /Péter:/.test(await blokk.innerText()))

console.log('\n=== 2) Profilom → Szabadság ===\n')
await menu('Profilom')
const panel = p.locator('#szabadsag-urlap')
ok('van Szabadság szekció', 1, await panel.count())
await panel.locator('#sz-kinek').selectOption({ label: 'Gábor' })
await panel.locator('#sz-tol').fill(nap(7))
await panel.locator('#sz-ig').fill(nap(9))
ok('az időszak röviden kiírva', true, /–\d+\.|\. – /.test(await panel.locator('.halk').nth(1).innerText()))
await panel.getByRole('button', { name: 'Szabadság rögzítése' }).click()
await p.waitForTimeout(1200)
ok('a listában: Gábor', true, (await panel.locator('.valtozas-lista').innerText()).includes('Gábor'))
await panel.locator('#sz-tol').fill(nap(20))
await panel.getByRole('button', { name: 'Szabadság rögzítése' }).click()
await p.waitForTimeout(1200)
ok('egynapos is rögzíthető (három sor a listában)', 3, await panel.locator('.valtozas-lista li').count())

console.log('\n=== 3) A napi kártyán összesítve ===\n')
await menu('Időpontok')
const szoveg = await p.locator('.kapacitas .szabadsag-blokk').innerText()
ok('Gábor sora', true, /Gábor:/.test(szoveg))
ok('a saját (Tulaj) egynapos is ott', true, /Tulaj Tamás:/.test(szoveg))

console.log('\n=== 4) Havi naptár: rózsaszín sáv ===\n')
await p.locator('.fejlec .nezetvalto button').filter({ hasText: 'Hónap' }).click()
await p.waitForTimeout(1500)
const savok = p.locator('.honap-sav.szabadsag-sav')
ok('van szabadság-sáv', true, (await savok.count()) >= 1)
ok('felirata: Szabadság: …', true, (await savok.first().innerText()).startsWith('Szabadság:'))
const szin = await savok.first().evaluate((e) => getComputedStyle(e).backgroundColor)
ok('rózsaszín háttér (nem a többnapos lila)', 'rgb(251, 232, 240)', szin)
const takar = await p.evaluate(() => [...document.querySelectorAll('.honapsor')].some((sor) => {
  const s = [...sor.querySelectorAll('.honap-sav')].map((x) => x.getBoundingClientRect())
  return s.some((a, i) => s.some((c, j) => i !== j && a.top < c.bottom - 1 && a.bottom > c.top + 1
    && a.left < c.right - 1 && a.right > c.left + 1))
}))
ok('a sávok nem fedik egymást', false, takar)
await p.screenshot({ path: '/tmp/claude-0/-home-claude/0da2f43f-f114-54e0-8861-a3d34165c4b9/scratchpad/v51-honap.png' })

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
