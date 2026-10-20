import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
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

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const c = await ctx.newPage()
c.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await hetkoznapra(c)
await c.goto(`${DEMO}/ceg/autotransdemo2026link`)
await c.locator('.kv-ceg-foglalas .fogl').waitFor({ timeout: 90000 })

console.log('=== 1) Előbújó szakaszok ===\n')
const anim = await c.locator('[data-lepes="csomag"]').evaluate((e) => {
  const s = getComputedStyle(e)
  return [s.animationName, s.animationDuration]
})
ok('a szakasz 2 mp alatt bújik elő', ['fogl-elobujik', '2s'], anim)
await c.locator('.fogl-csomag').filter({ has: c.locator('.nev', { hasText: /^Premium$/ }) }).click()
await c.waitForTimeout(350)
ok('csomag kiválasztása után sincs Full Service', 0, await c.locator('.fogl-fs').count())
const kozben = await c.locator('[data-lepes="tipus"]').evaluate((e) => Number(getComputedStyle(e).opacity))
ok('a következő szakasz kiválasztás után még áttetsző (előbújik, nem ugrik oda)', true, kozben > 0 && kozben < 0.9)
await c.locator('[data-lepes="tipus"]').scrollIntoViewIfNeeded()
await kep(c, '01-szakasz-elobujik-kozben')
await c.waitForTimeout(2200)
ok('2 mp után teljesen látszik', 1, Number(await c.locator('[data-lepes="tipus"]').evaluate((e) => getComputedStyle(e).opacity)))

console.log('\n=== 2) Hozom-viszem ===\n')
const tipusok = (await c.locator('[data-lepes="tipus"] button').allInnerTexts()).map((x) => x.split('\n')[0].trim())
ok('három választás: megvárom, itt hagyom, hozom-viszem', 3, tipusok.length)
ok('a harmadik a Hozom-viszem', 'Hozom-viszem', tipusok[2])
await c.locator('[data-lepes="tipus"] button').filter({ hasText: 'Hozom-viszem' }).click()
await c.waitForTimeout(2500)
await c.locator('[data-lepes="tipus"]').scrollIntoViewIfNeeded()
await kep(c, '02-hozomviszem-valasztva')
await c.locator('.fogl-nap[data-allapot="szabad"]').first().click()
await c.waitForTimeout(1500)
ok('időpont kérdése', true, (await c.locator('[data-lepes="nap"] .fogl-al').innerText()).includes('Hány órára mehetünk érte?'))
ok('7:30-tól', '7:30', (await c.locator('.fogl-idok button').first().evaluate((e) => e.childNodes[0].textContent)).trim())
await c.locator('.fogl-idok button').first().click()
await c.waitForTimeout(2500)
ok('visszaszállítás kérdése', 'HÁNY ÓRÁRA VIGYÜK VISSZA?', (await c.locator('.fogl-hatarido .cimke').innerText()).trim().toUpperCase())
await c.locator('.fogl-hatarido').scrollIntoViewIfNeeded()
await kep(c, '03-hozomviszem-idopontok')

console.log('\n=== 3) Összesítő: sticky, görgetéskor jön ===\n')
await c.fill('#fo-nev', 'Hozom Hugó')
await c.fill('#fo-tel', '+36 30 555 0101')
await c.fill('#fo-rsz', 'HV-001')
await c.locator('.fogl-feltetel input').check()
ok('összesítő: érte megyünk / visszavisszük', true, /érte megyünk: 7:30 · visszavisszük: \d{1,2}:\d{2}/.test(await c.locator('.fogl-osszeg').textContent()))
ok('az összesítő sticky', 'sticky', await c.locator('.fogl-osszeg').evaluate((e) => getComputedStyle(e).position))
for (const [nev, hova] of [['közepén', '[data-lepes="tipus"]'], ['a csomagoknál', '[data-lepes="csomag"]']]) {
  await c.locator(hova).evaluate((e) => scrollTo(0, e.getBoundingClientRect().top + scrollY - 100))
  await c.waitForTimeout(400)
  const r = await c.locator('.fogl-osszeg').boundingBox()
  ok(`visszagörgetve (${nev}) az összesítő a képernyő alján látszik`, true, r.y > 500 && r.y + r.height <= 844 + 1)
}
await kep(c, '04-osszesito-visszagorgetve')
await c.locator('.fogl-osszeg .kuld button').click()
await c.locator('.fogl-siker').waitFor({ timeout: 15000 })
ok('elküldve, a visszaigazolás az érte/vissza időt mondja', true, /érte megyünk: 7:30, visszavisszük: \d{1,2}:\d{2}/.test(await c.locator('.fogl-siker').innerText()))
await kep(c, '05-elkuldve')

ok('nincs JS hiba', [], hibak)
await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
