import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { foglalasOldal, urestNapotValaszt } from './_publikus.mjs'

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
const sima = (s) => s.replace(/\s+/g, ' ').trim()
const jsHiba = (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ }

console.log('=== 1) Főoldal: foglalás megkeresése ===\n')
{
  const { ctx, p, sql } = await foglalasOldal(b, { hiba: jsHiba })
  const ker = p.locator('.kv-kereso')
  await ker.scrollIntoViewIfNeeded()
  ok('a foglalás részben, csukva: kérdés és gomb', [true, 'Foglalásom megkeresése'],
    [(await ker.innerText()).includes('nem találod a visszaigazolást'), sima(await ker.locator('button').innerText())])
  await kep(p.locator('.kv-foglalas-elo'), '1-csukva')
  await ker.getByRole('button', { name: 'Foglalásom megkeresése' }).click()
  ok('kinyitva három mező, a rendszámban a kurzor', [3, 'fk-rendszam'],
    [await ker.locator('input').count(), await p.evaluate(() => document.activeElement?.id)])
  const gomb = ker.getByRole('button', { name: 'Megkeresem' })
  ok('üresen tiltott gomb, alatta a tipp', [true, 'Legalább két adat kell.'], [await gomb.isDisabled(), sima(await ker.locator('.kv-kereso-tipp').innerText())])
  await p.fill('#fk-rendszam', 'aabb 123')
  ok('egy adattal még tiltott, a rendszám nagybetűs', [true, 'AABB 123'], [await gomb.isDisabled(), await p.inputValue('#fk-rendszam')])
  await p.fill('#fk-telefon', '06 70 244 1100')
  ok('két adattal már mehet', false, await gomb.isDisabled())
  await kep(ker, '1-kitoltve')
  const [vart] = await sql(`select l.token from bookings b join booking_links l on l.booking_id = b.id join vehicles v on v.id = b.vehicle_id
    where v.plate_raw = 'AABB-123' and b.status = 'CONFIRMED' order by b.service_date limit 1`)
  await Promise.all([p.waitForURL(/\/foglalas\//, { timeout: 30000 }), gomb.click()])
  ok('egy találat: rögtön a foglalás oldala nyílik', `/foglalas/${vart.token}`, new URL(p.url()).pathname)
  await p.locator('.ugy-sav').waitFor({ timeout: 90000 })
  ok('a foglalás adataival', true, (await p.locator('body').innerText()).includes('AABB-123'))
  await kep(p, '1-foglalas-oldal')
  await ctx.close()
}

console.log('\n=== 2) Nincs találat, több találat ===\n')
{
  const { ctx, p, sql } = await foglalasOldal(b, { ut: '/publikus#foglalasom', hiba: jsHiba })
  const ker = p.locator('.kv-kereso')
  ok('#foglalasom címmel nyitva érkezik', 3, await ker.locator('input').count())
  await p.fill('#fk-rendszam', 'AABB-123')
  await p.fill('#fk-email', 'valaki@mas.hu')
  await ker.getByRole('button', { name: 'Megkeresem' }).click(); await p.waitForTimeout(800)
  ok('nincs találat: magyarázat a telefonszámmal', [true, true],
    [(await ker.locator('.kv-kereso-nincs').innerText()).includes('nem találtunk aktív foglalást'),
      await ker.locator('.kv-kereso-nincs a[href^="tel:"]').count() === 1])
  await kep(ker, '2-nincs')
  await p.fill('#fk-email', '')
  ok('mezőbe írva eltűnik az üzenet', 0, await ker.locator('.kv-kereso-nincs').count())

  const [cs] = await sql(`select id from packages where code = 'PREMIUM'`)
  const napok = (await sql(`select d::date::text d from generate_series(budapest_ma() + 3, budapest_ma() + 40, interval '1 day') d
    where munkanap(d::date) and extract(isodow from d) < 6 order by d limit 2`)).map((r) => r.d)
  for (const nap of napok.reverse()) {
    await sql(`select publikus_foglalas($1::jsonb)`, [JSON.stringify({
      package_id: cs.id, category: 'SZEMELYAUTO', scope: 'TELJES', booking_type: 'LEADOS', service_date: nap, drop_off_time: '09:00',
      extras: [], customer_name: 'Több Tamás', customer_phone: '+36 30 444 5566', customer_email: 'tamas@pelda.hu', plate_raw: 'TOB-202' })])
  }
  await p.fill('#fk-rendszam', 'TOB-202')
  await p.fill('#fk-email', 'TAMAS@pelda.hu')
  await ker.getByRole('button', { name: 'Megkeresem' }).click(); await p.waitForTimeout(800)
  const sorok = ker.locator('.kv-kereso-talalat li')
  ok('két foglalás: lista, a korábbi elöl', [2, true],
    [await sorok.count(), (await sorok.first().innerText()).includes('Premium')])
  const tokenek = (await sql(`select l.token from bookings b join booking_links l on l.booking_id = b.id join vehicles v on v.id = b.vehicle_id
    where v.plate_raw = 'TOB-202' order by b.service_date`)).map((r) => `/foglalas/${r.token}`)
  ok('a sorok a foglalások oldalára mutatnak', tokenek, await sorok.locator('a').evaluateAll((l) => l.map((a) => new URL(a.href).pathname)))
  ok('a keresés után a gomb újra használható', false, await ker.getByRole('button', { name: 'Megkeresem' }).isDisabled())
  ok('állapot a sor végén', 'visszaigazolásra vár', sima(await sorok.first().locator('.kv-kereso-allapot').innerText()))
  await kep(ker, '2-tobb')
  await ker.getByRole('button', { name: 'Bezárás' }).click()
  ok('bezárva újra csak a sor', 0, await ker.locator('input').count())
  await ctx.close()
}

console.log('\n=== 3) Angolul és telefonon ===\n')
{
  const { ctx, p } = await foglalasOldal(b, { ut: '/publikus?lang=en#foglalasom', viewport: { width: 390, height: 844 },
    kontextus: { isMobile: true, hasTouch: true }, hiba: jsHiba })
  const ker = p.locator('.kv-kereso')
  ok('angol szöveg', ['Find my booking', 'Find it'],
    [sima(await ker.locator('h3').innerText()), sima(await ker.locator('button[type="submit"]').innerText())])
  await p.fill('#fk-telefon', '+36 70 000 0000')
  await p.fill('#fk-email', 'nobody@example.com')
  await ker.locator('button[type="submit"]').click(); await p.waitForTimeout(800)
  ok('angol üzenet, ha nincs találat', true, (await ker.locator('.kv-kereso-nincs').innerText()).includes('could not find an active booking'))
  ok('telefonon nem lóg ki', true, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  await ker.scrollIntoViewIfNeeded()
  await kep(ker, '3-telefon-angol')
  await ctx.close()
}

console.log('\n=== 4) Foglaláskor az e-mail is kötelező ===\n')
{
  const { ctx, p, m, sql } = await foglalasOldal(b, { hiba: jsHiba })
  await m.locator('.fogl-valaszto button').filter({ hasText: 'Személyautó' }).click()
  await m.locator('.fogl-csomag', { has: p.locator('.nev', { hasText: /^Start$/ }) }).click(); await p.waitForTimeout(900)
  await m.locator('.fogl-valaszto button').filter({ hasText: 'Itt hagyom' }).click(); await p.waitForTimeout(3000)
  await urestNapotValaszt(m, sql)
  await m.locator('.fogl-idok button').first().click(); await p.waitForTimeout(500)
  ok('az e-mail mező is csillagos', 'E-mail *', sima(await p.locator('label[for="fo-email"]').textContent()))
  await p.fill('#fo-nev', 'Email Elemér')
  await p.fill('#fo-tel', '+36 30 123 9876')
  await p.fill('#fo-rsz', 'eml-101')
  await m.locator('.fogl-feltetel input').check()
  const kuld = m.getByRole('button', { name: 'Foglalási kérés küldése' })
  ok('e-mail nélkül nem küldhető', true, await kuld.isDisabled())
  await p.fill('#fo-email', 'elemer')
  ok('gépelés közben még nincs figyelmeztetés', 0, await m.locator('.fogl-mezo-hiba').count())
  await p.locator('#fo-email').blur()
  ok('kilépve: figyelmeztetés, továbbra sem küldhető', ['Ellenőrizd az e-mail címet, valami hiányzik belőle.', true],
    [sima(await m.locator('.fogl-mezo-hiba').innerText()), await kuld.isDisabled()])
  await kep(m.locator('[data-lepes="adatok"]'), '4-email-hibas')
  await p.fill('#fo-email', 'elemer@pelda.hu')
  ok('jó címmel küldhető', [false, 0], [await kuld.isDisabled(), await m.locator('.fogl-mezo-hiba').count()])
  await kuld.click(); await p.waitForTimeout(2500)
  ok('beküldve', true, (await m.locator('.fogl-siker').count()) === 1)
  const [x] = await sql(`select b.request_email, b.request_phone from bookings b join vehicles v on v.id = b.vehicle_id where v.plate_raw = 'EML-101'`)
  ok('a foglaláson az e-mail és a telefonszám', { request_email: 'elemer@pelda.hu', request_phone: '301239876' }, x)
  await ctx.close()
}

console.log('\n=== 5) Ismeretlen link: út a kereséshez ===\n')
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  p.on('pageerror', jsHiba)
  await p.goto(`http://localhost:5180/foglalas/${'0'.repeat(32)}`)
  await p.locator('.ugy-tovabb').waitFor({ timeout: 90000 })
  const link = p.locator('.ugy-tovabb a').filter({ hasText: 'Foglalásom megkeresése' })
  ok('a hibás link oldalán ott a kereső linkje', ['/publikus', '#foglalasom'],
    [new URL(await link.evaluate((a) => a.href)).pathname, new URL(await link.evaluate((a) => a.href)).hash])
  await kep(p.locator('.ugy-tovabb'), '5-ismeretlen')
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
