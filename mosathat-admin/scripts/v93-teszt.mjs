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
const sima = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
const kep = async (p, nev, opts = {}) => { if (KEPEK) { await p.waitForTimeout(300); await p.screenshot({ path: join(KEPEK, nev), ...opts }) } }
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ma = new Date()
const kovHetfo = new Date(ma); kovHetfo.setDate(ma.getDate() + ((8 - ma.getDay()) % 7 || 7))
const kovNap = (n) => { const d = new Date(kovHetfo); d.setDate(kovHetfo.getDate() + n); return iso(d) }
const SZERDA = kovNap(2)
const CSUTORTOK = kovNap(3)
const SZOMBAT = kovNap(5)
const VASARNAP = kovNap(6)

const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
const hibak = []
p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(2500)
const menu = async (n) => { await p.locator('aside.oldalsav button').filter({ hasText: n }).first().click(); await p.waitForTimeout(1500) }
const nezet = async (n) => { await p.locator('.nezetvalto button:visible').filter({ hasText: new RegExp(`^${n}$`) }).first().click(); await p.waitForTimeout(1500) }

console.log('=== 1) Kivételnapok felvétele a Beállításokban ===\n')
await menu('Beállítások')
await p.locator('button').filter({ hasText: /^Kivételnapok$/ }).click()
await p.waitForTimeout(800)
const uj = p.locator('.panel').filter({ has: p.locator('h3', { hasText: 'Új kivételnap' }) })
async function felvesz(nap, mi, megj) {
  await uj.locator('input[type="date"]').fill(nap)
  await uj.locator('select').selectOption(mi)
  await uj.locator('label.mezo').filter({ hasText: 'Megjegyzés' }).locator('input').fill(megj)
  await uj.getByRole('button', { name: 'Felvétel' }).click()
  await p.waitForTimeout(900)
}
await felvesz(SZERDA, 'zarva', 'Nemzeti ünnep, a műhely zárva')
await felvesz(CSUTORTOK, 'nyitva', '')
await felvesz(SZOMBAT, 'nyitva', 'Ledolgozós szombat')
const lista = p.locator('.panel').filter({ has: p.locator('h3', { hasText: 'Mostantól érvényes kivételnapok' }) })
ok('három kivételnap a listában', 3, await lista.locator('tbody tr').filter({ hasText: /Zárva|Nyitva/ }).count())

console.log('\n=== 2) Heti nézet ===\n')
await menu('Időpontok')
await nezet('Hét')
await p.getByRole('button', { name: 'Előre' }).click()
await p.waitForTimeout(1500)
const oszlop = (i) => p.locator('.hetracs:not(.hetfejsor) .naposzlop').nth(i)
const fej = (i) => p.locator('.hetfejsor .oszlopfej').nth(i)
ok('szerdán piros jelzés: Zárva és a megjegyzés', ['zarva', 'zarva', 'Zárva', 'Nemzeti ünnep, a műhely zárva'],
  [await fej(2).getAttribute('data-kivetel'), await oszlop(2).locator('.kivetel-jel').getAttribute('data-kivetel'),
   sima(await oszlop(2).locator('.kivetel-jel strong').textContent()), sima(await oszlop(2).locator('.kivetel-megj').textContent())])
ok('csütörtökön zöld jelzés a nyitvatartással, megjegyzés nélkül', ['nyitva', 'Nyitva 09:00–17:00', 0],
  [await oszlop(3).locator('.kivetel-jel').getAttribute('data-kivetel'), sima(await oszlop(3).locator('.kivetel-jel strong').textContent()),
   await oszlop(3).locator('.kivetel-megj').count()])
ok('a többi napon nincs jelzés', [0, 0, 0, null], [await oszlop(0).locator('.kivetel-jel').count(), await oszlop(1).locator('.kivetel-jel').count(),
  await oszlop(4).locator('.kivetel-jel').count(), await fej(0).getAttribute('data-kivetel')])
const szinek = await p.evaluate(() => {
  const s = (e) => getComputedStyle(e).backgroundColor
  const j = [...document.querySelectorAll('.hetracs:not(.hetfejsor) .naposzlop .kivetel-jel')]
  const f = [...document.querySelectorAll('.hetfejsor .oszlopfej')]
  return { zarvaJel: s(j[0]), nyitvaJel: s(j[1]), zarvaFej: s(f[2]), nyitvaFej: s(f[3]), simaFej: s(f[0]) }
})
ok('piros a zárva, zöld a nyitva, a fejléc is színes', [true, true, true, true],
  [szinek.zarvaJel === 'rgb(247, 226, 222)', szinek.nyitvaJel === 'rgb(231, 243, 236)', szinek.zarvaFej === 'rgb(247, 226, 222)', szinek.nyitvaFej === 'rgb(231, 243, 236)'])
const hv = p.locator('.hetvegesor .hetvegenap')
ok('a hétvégi sorban is megjelenik a ledolgozós szombat, foglalás nélkül is, zölden, megjegyzéssel', [1, 'nyitva', true, true],
  [await hv.count(), await hv.first().getAttribute('data-kivetel'), sima(await hv.first().textContent()).startsWith('Szombat · 0 autó'),
   sima(await hv.first().textContent()).includes('Nyitva 09:00–17:00 · Ledolgozós szombat')])
ok('a hétvégi sor felirata „Hétvége”, mert még nincs munka', 'Hétvége', sima(await p.locator('.hetvegesor .cimke').textContent()))
await kep(p, '01-heti-nezet.png')
await hv.first().click()
await p.waitForTimeout(1200)
ok('a szombatra kattintva a napi nézet nyílik', true, (await p.locator('.fejlec .cim').innerText()).length > 0)

console.log('\n=== 3) Havi nézet ===\n')
await nezet('Hónap')
const cella = (d) => p.locator('.honapnap').filter({ has: p.locator('.napszam > span:first-child', { hasText: new RegExp(`^${Number(d.slice(8, 10))}$`) }) })
const cellaD = async (d) => {
  const idx = await p.locator('.honapnap').evaluateAll((l, dd) => l.findIndex((e) => (e.getAttribute('aria-label') ?? '').startsWith(dd)), d)
  return p.locator('.honapnap').nth(idx)
}
if (!(await p.locator('.honapnap').evaluateAll((l, dd) => l.some((e) => (e.getAttribute('aria-label') ?? '').startsWith(dd)), SZERDA))) {
  await p.getByRole('button', { name: 'Előre' }).click(); await p.waitForTimeout(1500)
}
const sz = await cellaD(SZERDA)
const cs = await cellaD(CSUTORTOK)
const szo = await cellaD(SZOMBAT)
const v = await cellaD(VASARNAP)
ok('szerda: piros cella, Zárva felirat és megjegyzés', ['zarva', 'Zárva', 'Nemzeti ünnep, a műhely zárva'],
  [await sz.getAttribute('data-kivetel'), sima(await sz.locator('.kivetel-jel strong').textContent()), sima(await sz.locator('.kivetel-megj').textContent())])
ok('csütörtök és szombat: zöld cella, nyitvatartás, a szombaton a megjegyzés', ['nyitva', 'Nyitva 09:00–17:00', 'nyitva', 'Ledolgozós szombat'],
  [await cs.getAttribute('data-kivetel'), sima(await cs.locator('.kivetel-jel strong').textContent()), await szo.getAttribute('data-kivetel'), sima(await szo.locator('.kivetel-megj').textContent())])
ok('vasárnap nincs jelzés', [null, 0], [await v.getAttribute('data-kivetel'), await v.locator('.kivetel-jel').count()])
ok('a képernyőolvasó is hallja', true, (await sz.getAttribute('aria-label')).includes('Kivételnap: Zárva · Nemzeti ünnep, a műhely zárva'))
ok('a cellák háttere színezett', ['rgb(253, 243, 241)', 'rgb(243, 250, 246)'], [await sz.evaluate((e) => getComputedStyle(e).backgroundColor), await cs.evaluate((e) => getComputedStyle(e).backgroundColor)])
await kep(p, '02-havi-nezet.png')
void cella

console.log('\n=== 4) Keskeny képernyőn (saját oszlopfejek) ===\n')
await p.setViewportSize({ width: 740, height: 1100 })
await nezet('Hét')
await p.waitForTimeout(800)
const sajat = p.locator('.naposzlop .oszlopfej-sajat')
ok('a saját oszlopfej is színes', ['zarva', 'nyitva'], [await sajat.nth(2).getAttribute('data-kivetel'), await sajat.nth(3).getAttribute('data-kivetel')])
await kep(p, '03-heti-keskeny.png')

console.log('\n=== 5) Takarítás: a kivételnapok törlése ===\n')
await p.setViewportSize({ width: 1440, height: 1000 })
await menu('Beállítások')
await p.locator('button').filter({ hasText: /^Kivételnapok$/ }).click()
await p.waitForTimeout(800)
for (let i = 0; i < 3; i++) {
  await lista.locator('tbody tr').filter({ hasText: /Zárva|Nyitva/ }).first().getByRole('button', { name: 'Törlés' }).click()
  await p.waitForTimeout(800)
}
ok('törölve', 0, await lista.locator('tbody tr').filter({ hasText: /Zárva|Nyitva/ }).count())
await menu('Időpontok')
await nezet('Hét')
if (await p.locator('.fejlec .napvalto button').filter({ hasText: 'Mára' }).count()) { await p.locator('.fejlec .napvalto button').filter({ hasText: 'Mára' }).click(); await p.waitForTimeout(800) }
await p.getByRole('button', { name: 'Előre' }).click()
await p.waitForTimeout(1500)
ok('törlés után a heti nézetben sincs jelzés', [0, 0], [await p.locator('.kivetel-jel').count(), await p.locator('[data-kivetel]').count()])
ok('nincs futásidejű hiba', [], hibak)

await b.close()
console.log(`\n${baj === 0 ? 'MINDEN RENDBEN' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
