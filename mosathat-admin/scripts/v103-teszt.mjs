import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adatbazis, TULAJ } from './_db.mjs'
import { terhel } from './_terheles.mjs'
import { hetkoznapra } from './_munkanap.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const kep = async (p, nev) => { if (KEPEK) { await p.waitForTimeout(300); await p.screenshot({ path: join(KEPEK, `${nev}.png`) }) } }
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const DEMO = 'http://localhost:5180'
const SB = 'http://localhost:5181'
const LINK = 'autotransdemo2026link'

const db = await adatbazis({ demo: true })
const q = async (s, p) => (await db.query(s, p)).rows
await q(`select set_config('app.uid', $1, false)`, [TULAJ])
const ceg = (await q(`select id from companies where name = 'Autó Trans Kft.'`))[0].id
const [limitNap, teliNap, uresNap] = (await q(`select d::date::text d from generate_series(
    (now() at time zone 'Europe/Budapest')::date + 5,
    (now() at time zone 'Europe/Budapest')::date + 30, interval '1 day') d
  where munkanap(d::date) order by d limit 3`)).map((r) => r.d)
await q(`update contracts set napi_limit = 1 where company_id = $1 and active`, [ceg])
await q(`select ceg_foglalas($1, $2)`, [LINK, JSON.stringify({
  package_id: (await q(`select id from packages where code = 'START'`))[0].id, booking_type: 'LEADOS', service_date: limitNap,
  drop_off_time: '09:00', customer_name: 'Céges Elso', customer_email: 'teszt@pelda.hu', customer_phone: '+36 30 700 0001', plate_raw: 'LIM-001' })])
await terhel(q, teliNap, 75)

const hibak = []
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.route('https://teszt.supabase.co/**', async (r) => {
  const ut = new URL(r.request().url()).pathname
  const fn = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(ut)?.[1]
  if (fn && (fn.startsWith('publikus_') || fn.startsWith('ceg_'))) {
    const body = r.request().postData() ? JSON.parse(r.request().postData()) : {}
    const k = Object.keys(body)
    try {
      const x = (await db.query(`select ${fn}(${k.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as x`,
        k.map((n) => (body[n] !== null && typeof body[n] === 'object' ? JSON.stringify(body[n]) : body[n])))).rows[0].x
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(x) })
    } catch (e) {
      return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) })
    }
  }
  return r.fulfill({ contentType: 'application/json', body: '[]' })
})
const c = await ctx.newPage()
c.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
await hetkoznapra(c)
await c.goto(`${SB}/ceg/${LINK}`)
await c.locator('.kv-ceg-foglalas .fogl').waitFor({ timeout: 90000 })

console.log('=== 1) Céges oldal: teli napok ===\n')
await c.locator('.fogl-csomag').filter({ has: c.locator('.nev', { hasText: /^Premium$/ }) }).click()
await c.waitForTimeout(400)
await c.locator('[data-lepes="tipus"] button').nth(1).click()
await c.waitForTimeout(3000)
const napGomb = (d) => c.locator('.fogl-nap').filter({ has: c.locator('.szam', { hasText: new RegExp(`^${Number(d.slice(8, 10))}$`) }) }).last()
ok('a napi limitet elért nap tele, nem választható', ['tele', true],
  [await napGomb(limitNap).getAttribute('data-allapot'), await napGomb(limitNap).isDisabled()])
ok('a 70% fölötti nap tele, nem választható', ['tele', true],
  [await napGomb(teliNap).getAttribute('data-allapot'), await napGomb(teliNap).isDisabled()])
ok('az üres nap szabad', 'szabad', await napGomb(uresNap).getAttribute('data-allapot'))
await c.locator('[data-lepes="nap"]').scrollIntoViewIfNeeded()
await kep(c, '01-ceges-teli-napok')

console.log('\n=== 2) Üres napra: azonnal visszaigazolt ===\n')
await napGomb(uresNap).click()
await c.waitForTimeout(1500)
await c.locator('.fogl-idok button').first().click()
await c.waitForTimeout(1500)
const hat = c.locator('.fogl-hataridok button')
if (await hat.count()) { await hat.first().click(); await c.waitForTimeout(500) }
await c.fill('#fo-nev', 'Céges Második')
await c.fill('#fo-tel', '+36 30 700 0002')
await c.fill('#fo-email', 'teszt@pelda.hu')
await c.fill('#fo-rsz', 'AUT-002')
await c.locator('.fogl-feltetel input').check()
await c.locator('.fogl-osszeg .kuld button').click()
await c.locator('.fogl-siker').waitFor({ timeout: 15000 })
const siker = await c.locator('.fogl-siker').innerText()
ok('a visszaigazolás: rögzítettük, várunk', true, /Az időpontodat rögzítettük, várunk!/.test(siker))
ok('az adatbázisban azonnal CONFIRMED', 'CONFIRMED',
  (await q(`select b.status::text s from bookings b join vehicles v on v.id = b.vehicle_id where v.plate_raw = 'AUT-002'`))[0]?.s)
await c.waitForTimeout(2200)
await kep(c, '02-ceges-megerositve')
ok('nincs JS hiba (céges oldal)', [], hibak)
await ctx.close()

console.log('\n=== 3) Szerződés: napi limit mező ===\n')
const ctx2 = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx2.newPage()
const hibak2 = []
p.on('pageerror', (e) => hibak2.push(e.message.slice(0, 200)))
await hetkoznapra(p)
await p.goto(DEMO + '/')
await p.waitForSelector('input[type="email"]', { timeout: 90000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(2500)
await p.locator('aside.oldalsav button').filter({ hasText: 'Cégek és bérletesek' }).first().click()
await p.waitForTimeout(1500)
const sor = p.locator('.cegtabla-sor').filter({ hasText: 'Autó Trans' }).first()
const limitSzoveg = () => sor.locator('.cegtabla-adatok dt').filter({ hasText: 'Napi limit' })
  .evaluate((dt) => dt.nextElementSibling.textContent.trim())
ok('alapból nincs limit', 'nincs', await limitSzoveg())
await sor.getByRole('button', { name: 'Szerkesztés' }).click()
await p.waitForTimeout(800)
const urlap = p.locator('[aria-label="Szerződés"]')
await urlap.locator('#napi-limit').fill('3')
await urlap.locator('#napi-limit').scrollIntoViewIfNeeded()
await kep(p, '03-szerzodes-napi-limit')
await urlap.getByRole('button', { name: 'Mentés' }).click()
await p.waitForTimeout(1500)
ok('a táblázatban: 3 autó / nap', '3 autó / nap', await limitSzoveg())
await sor.scrollIntoViewIfNeeded()
await kep(p, '04-cegtabla-napi-limit')
ok('nincs JS hiba (admin)', [], hibak2)

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
