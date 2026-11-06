import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const KEP = process.env.KEP ?? '/tmp'
const NEVEK = ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat']
const ma = new Date()
const maStr = `${ma.getFullYear()}-${String(ma.getMonth() + 1).padStart(2, '0')}-${String(ma.getDate()).padStart(2, '0')}`

async function belep(viewport, opciok = {}) {
  const p = await (await b.newContext({ viewport, ...opciok })).newPage()
  p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
  return p
}

console.log('=== 1) Havi nézet: munkaidő-változás és szabadság pirossal ===\n')
const p = await belep({ width: 1440, height: 1000 })
await p.evaluate(async (nap) => {
  const sql = window.mosathatDemoSql
  await sql(`insert into public.staff_absences (staff_id, day, kind, starts, ends, note) values
    ('00000000-0000-4000-8000-000000000005', $1::date + 1, 'KESOBB_ERKEZIK', null, '10:00', null),
    ('00000000-0000-4000-8000-000000000005', $1::date + 2, 'EGESZ_NAP', null, null, 'betegszabadság'),
    ('00000000-0000-4000-8000-000000000004', $1::date + 2, 'TAVOL', '11:00', '12:30', null)`, [nap])
  window.mosathatDemoValtozas()
}, maStr)
await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).first().click()
await p.waitForTimeout(1500)
await p.locator('.fejlec .nezetvalto button').filter({ hasText: 'Hónap' }).click()
await p.waitForTimeout(2000)
const savok = p.locator('.honap-sav.tavollet-sav')
const szovegek = await savok.allInnerTexts()
console.log(`         ${szovegek.join(' | ')}`)
ok('a mai korábban távozás látszik', true, szovegek.some((s) => s === 'Gábor · elmegy 16:00'))
ok('később érkezés', true, szovegek.some((s) => s === 'Péter · érkezik 10:00'))
ok('egész nap: a megjegyzés (betegszabadság)', true, szovegek.some((s) => s === 'Péter · betegszabadság'))
ok('napközben távol', true, szovegek.some((s) => s === 'Gábor · távol 11:00–12:30'))
ok('a szabadság is piros sáv', true, szovegek.some((s) => s.startsWith('Péter · ') && /DEMO/.test(s)))
const szin = await savok.first().evaluate((e) => getComputedStyle(e).backgroundColor)
ok('piros háttér', 'rgb(247, 226, 222)', szin)
const cim = await savok.filter({ hasText: 'elmegy 16:00' }).first().getAttribute('title')
ok('a buborékban a teljes leírás', 'Gábor: Korábban megy el 16:00 · DEMO — korábban megy', cim)
const takar = await p.evaluate(() => [...document.querySelectorAll('.honapsor')].some((sor) => {
  const s = [...sor.querySelectorAll('.honap-sav')].map((x) => x.getBoundingClientRect())
  return s.some((a, i) => s.some((c, j) => i !== j && a.top < c.bottom - 1 && a.bottom > c.top + 1
    && a.left < c.right - 1 && a.right > c.left + 1))
}))
ok('a sávok nem fedik egymást', false, takar)
await p.screenshot({ path: `${KEP}/v139-honap.png` })

console.log('\n=== 2) Telefon: a fejlécben a nap neve is ===\n')
const t = await belep({ width: 390, height: 844 }, { hasTouch: true, isMobile: true })
await t.locator('.mobil-fejlec .hamburger').click()
await t.waitForTimeout(500)
await t.locator('.fiok button').filter({ hasText: 'Időpontok' }).first().click()
await t.waitForTimeout(1500)
const fej = (await t.locator('.mobil-fejlec .nap').innerText()).trim()
console.log(`         ${fej}`)
ok('ma: „Ma, <nap neve> · <dátum>"', true, fej.startsWith(`Ma, ${NEVEK[ma.getDay()].toLowerCase()} · `))
await t.screenshot({ path: `${KEP}/v139-telefon-ma.png` })
await t.locator('.mobil-fejlec .lep').last().click()
await t.waitForTimeout(1500)
const holnap = new Date(); holnap.setDate(holnap.getDate() + 1)
const fej2 = (await t.locator('.mobil-fejlec .nap').innerText()).trim()
console.log(`         ${fej2}`)
ok('holnap: „<nap neve> · <dátum>"', true, fej2.startsWith(`${NEVEK[holnap.getDay()]} · `))
await t.screenshot({ path: `${KEP}/v139-telefon-holnap.png` })

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
