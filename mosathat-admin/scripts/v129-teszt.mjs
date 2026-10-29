import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adminOldal } from './_publikus.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const kep = async (el, nev) => { if (KEPEK) await el.screenshot({ path: join(KEPEK, `${nev}.png`) }) }
const jsHiba = (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ }

async function telefonNelkuli(sql) {
  const [f] = await sql(`select b.id, v.plate_raw rendszam, b.customer_id from public.bookings b join public.vehicles v on v.id = b.vehicle_id
    where b.service_date = public.budapest_ma() and b.status not in ('REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW')
      and b.fleet_group is null
    order by b.created_at limit 1`)
  await sql(`update public.customers set phone = '—' where id = $1`, [f.customer_id])
  return f
}

async function munkalapotNyit(p, rendszam) {
  await p.locator('.napi-lista .kartya').filter({ hasText: rendszam }).first().locator('.kartya-nyit').click()
  await p.waitForTimeout(1500)
  return p.locator('dialog[aria-label="Munkalap"]')
}

async function telefonSor(lap) {
  const sor = lap.locator('.szerk-sor').filter({ has: lap.page().locator('.szerk-cimke', { hasText: /^Telefon$/ }) })
  return sor.first()
}

console.log('=== 1) Munkalap: telefonszám nélküli foglalás ===\n')
{
  const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  const f = await telefonNelkuli(sql)
  await p.locator('aside.oldalsav .menu button').filter({ hasText: /^Időpontok$/ }).click()
  await p.waitForTimeout(1500)
  const lap = await munkalapotNyit(p, f.rendszam)
  const sor = await telefonSor(lap)
  const gomb = sor.locator('button.szerk-ertek')
  ok('zárva a vonal halványan látszik', ['—', true], [(await gomb.innerText()).trim(), await gomb.evaluate((e) => e.classList.contains('ures'))])
  ok('vonalra nincs Hívás gomb', 0, await sor.locator('a.hivas').count())
  await kep(lap, '01-munkalap-zarva')
  await gomb.click()
  await p.waitForTimeout(300)
  const mezo = sor.locator('input')
  ok('kattintásra a mező üres, a vonal csak placeholder', ['', '—'], [await mezo.inputValue(), await mezo.getAttribute('placeholder')])
  await kep(lap, '02-munkalap-nyitva-ures')
  await mezo.pressSequentially('+36 30 129 1290')
  ok('a beírt szám elején nincs vonal', '+36 30 129 1290', await mezo.inputValue())
  await kep(lap, '03-munkalap-beirva')
  await mezo.press('Enter')
  await p.waitForTimeout(1200)
  const [c] = await sql(`select phone from public.customers where id = $1`, [f.customer_id])
  ok('elmentve vonal nélkül', '+36 30 129 1290', c.phone)
  const sor2 = await telefonSor(lap)
  ok('mentés után megjelenik a Hívás gomb', 1, await sor2.locator('a.hivas').count())
  await kep(lap, '04-munkalap-mentve')
  await ctx.close()
}

console.log('\n=== 2) Üresen hagyva nem ment semmit ===\n')
{
  const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  const f = await telefonNelkuli(sql)
  await p.locator('aside.oldalsav .menu button').filter({ hasText: /^Időpontok$/ }).click()
  await p.waitForTimeout(1500)
  const lap = await munkalapotNyit(p, f.rendszam)
  const sor = await telefonSor(lap)
  await sor.locator('button.szerk-ertek').click()
  await p.waitForTimeout(300)
  await sor.locator('input').press('Enter')
  await p.waitForTimeout(800)
  const [c] = await sql(`select phone from public.customers where id = $1`, [f.customer_id])
  ok('az adatbázisban marad a vonal', '—', c.phone)
  ok('a mező bezárult, újra a halvány vonal látszik', '—', (await (await telefonSor(lap)).locator('button.szerk-ertek').innerText()).trim())
  await ctx.close()
}

console.log('\n=== 3) Valódi telefonszám szerkesztése változatlan ===\n')
{
  const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  const [f] = await sql(`select v.plate_raw rendszam, c.phone from public.bookings b join public.vehicles v on v.id = b.vehicle_id
    join public.customers c on c.id = b.customer_id
    where b.service_date = public.budapest_ma() and b.fleet_group is null and c.phone <> '—'
      and b.status not in ('REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW')
    order by b.created_at desc limit 1`)
  await p.locator('aside.oldalsav .menu button').filter({ hasText: /^Időpontok$/ }).click()
  await p.waitForTimeout(1500)
  const lap = await munkalapotNyit(p, f.rendszam)
  const sor = await telefonSor(lap)
  await sor.locator('button.szerk-ertek').click()
  await p.waitForTimeout(300)
  ok('a meglévő szám betöltődik a mezőbe', f.phone, await sor.locator('input').inputValue())
  await ctx.close()
}

console.log('\n=== 4) Telefonon (mobil nézet) ===\n')
{
  const { ctx, p, sql, belep } = await adminOldal(b, { viewport: { width: 390, height: 844 }, kontextus: { isMobile: true, hasTouch: true }, hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  const f = await telefonNelkuli(sql)
  await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
  await p.locator('.fiok .menu button').filter({ hasText: /^Időpontok$/ }).click(); await p.waitForTimeout(1500)
  const lap = await munkalapotNyit(p, f.rendszam)
  const sor = await telefonSor(lap)
  await sor.scrollIntoViewIfNeeded()
  await kep(p, '05-telefon-zarva')
  await sor.locator('button.szerk-ertek').click()
  await p.waitForTimeout(300)
  ok('mobilon is üres a mező, vonal csak placeholder', ['', '—'], [await sor.locator('input').inputValue(), await sor.locator('input').getAttribute('placeholder')])
  await kep(p, '06-telefon-nyitva')
  ok('nem lóg ki', true, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
