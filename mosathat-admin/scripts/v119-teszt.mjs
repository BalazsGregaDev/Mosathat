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

const doboz = (l) => l.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } })

console.log('=== 1) Asztali nézet: a két gomb a nyitó rész jobb alsó sarkában ===\n')
{
  const { ctx, p } = await foglalasOldal(b, { hiba: jsHiba })
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400)
  const gombok = p.locator('.kv-hero .kv-hero-gombok')
  ok('két gomb: Időpontfoglalás, Foglalásom megkeresése', ['IDŐPONTFOGLALÁS', 'FOGLALÁSOM MEGKERESÉSE'],
    (await gombok.locator('> *').allInnerTexts()).map(sima))
  const [g1, g2] = await Promise.all([doboz(gombok.locator('> *').first()), doboz(gombok.locator('> *').last())])
  const hero = await doboz(p.locator('.kv-hero'))
  const vonal = await doboz(p.locator('.kv-hero .kv-hasabok'))
  const h1 = await doboz(p.locator('.kv-hero h1'))
  const nyelv = await doboz(p.locator('.kv-nyelv-sor .nyelv-kapcsolo'))
  ok('egymás alatt, egyforma szélesen', [true, true], [g2.t >= g1.b, Math.abs((g1.r - g1.l) - (g2.r - g2.l)) < 1])
  ok('jobbra igazítva, a nyelvválasztóval egy vonalban', true, Math.abs(g1.r - nyelv.r) <= 2 && hero.r - g1.r < 40)
  ok('a vonal fölött, közvetlenül', true, g2.b <= vonal.t && vonal.t - g2.b < 40)
  ok('a nyelvválasztó alatt, a címmel egy magasságban végződik', [true, true], [g1.t > nyelv.b, Math.abs(g2.b - h1.b) < 12])
  await kep(p.locator('.kv-hero'), '1-hero')
  await gombok.getByRole('button', { name: 'Foglalásom megkeresése' }).click()
  const ablak = p.locator('dialog.kv-kereso-fedo[open]')
  await ablak.waitFor()
  ok('felugró ablak nyílik, a rendszámban a kurzor', [3, 'fk-rendszam'],
    [await ablak.locator('input').count(), await p.evaluate(() => document.activeElement?.id)])
  ok('a foglalás részben nincs lenyíló mező', 0, await p.locator('.kv-foglalas-elo .kv-kereso input').count())
  await kep(p, '1-ablak')
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  ok('Esc: bezárul', 0, await ablak.count())
  await gombok.getByRole('link', { name: 'Időpontfoglalás' }).click(); await p.waitForTimeout(1500)
  ok('az Időpontfoglalás a foglalás részhez görget', true, await p.evaluate(() => {
    const r = document.querySelector('.kv-foglalas-elo')?.getBoundingClientRect()
    return Boolean(r && r.top < window.innerHeight / 2)
  }))
  await ctx.close()
}

console.log('\n=== 2) A foglalás részből is felugró ablak, egy találat ===\n')
{
  const { ctx, p, sql } = await foglalasOldal(b, { hiba: jsHiba })
  const sor = p.locator('.kv-foglalas-elo .kv-kereso')
  await sor.scrollIntoViewIfNeeded()
  ok('a foglalás részben a kérdés és a gomb', [true, 'Foglalásom megkeresése'],
    [(await sor.innerText()).includes('nem találod a visszaigazolást'), sima(await sor.locator('button').innerText())])
  await kep(p.locator('.kv-foglalas-elo'), '2-sor')
  await sor.getByRole('button', { name: 'Foglalásom megkeresése' }).click()
  const ablak = p.locator('dialog.kv-kereso-fedo[open]')
  await ablak.waitFor()
  const gomb = ablak.getByRole('button', { name: 'Megkeresem' })
  ok('üresen tiltott gomb, alatta a tipp', [true, 'Legalább két adat kell.'], [await gomb.isDisabled(), sima(await ablak.locator('.kv-kereso-tipp').innerText())])
  await p.fill('#fk-rendszam', 'aabb 123')
  ok('egy adattal még tiltott, a rendszám nagybetűs', [true, 'AABB 123'], [await gomb.isDisabled(), await p.inputValue('#fk-rendszam')])
  await p.fill('#fk-telefon', '06 70 244 1100')
  ok('két adattal már mehet', false, await gomb.isDisabled())
  await kep(p, '2-kitoltve')
  const [vart] = await sql(`select l.token from bookings b join booking_links l on l.booking_id = b.id join vehicles v on v.id = b.vehicle_id
    where v.plate_raw = 'AABB-123' and b.status = 'CONFIRMED' order by b.service_date limit 1`)
  await Promise.all([p.waitForURL(/\/foglalas\//, { timeout: 30000 }), gomb.click()])
  ok('egy találat: rögtön a foglalás oldala nyílik', `/foglalas/${vart.token}`, new URL(p.url()).pathname)
  await p.locator('.ugy-sav').waitFor({ timeout: 90000 })
  ok('a foglalás adataival', true, (await p.locator('body').innerText()).includes('AABB-123'))
  await kep(p, '2-foglalas-oldal')
  await ctx.close()
}

console.log('\n=== 3) Nincs találat, több találat ===\n')
{
  const { ctx, p, sql } = await foglalasOldal(b, { ut: '/publikus#foglalasom', hiba: jsHiba })
  const ablak = p.locator('dialog.kv-kereso-fedo[open]')
  await ablak.waitFor()
  ok('#foglalasom címmel nyitott ablakkal érkezik', 3, await ablak.locator('input').count())
  await p.fill('#fk-rendszam', 'AABB-123')
  await p.fill('#fk-email', 'valaki@mas.hu')
  await ablak.getByRole('button', { name: 'Megkeresem' }).click(); await p.waitForTimeout(800)
  ok('nincs találat: magyarázat a telefonszámmal', [true, true],
    [(await ablak.locator('.kv-kereso-nincs').innerText()).includes('nem találtunk aktív foglalást'),
      await ablak.locator('.kv-kereso-nincs a[href^="tel:"]').count() === 1])
  await kep(p, '3-nincs')
  await p.fill('#fk-email', '')
  ok('mezőbe írva eltűnik az üzenet', 0, await ablak.locator('.kv-kereso-nincs').count())

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
  await ablak.getByRole('button', { name: 'Megkeresem' }).click(); await p.waitForTimeout(800)
  const sorok = ablak.locator('.kv-kereso-talalat li')
  ok('két foglalás: lista, a korábbi elöl', [2, true],
    [await sorok.count(), (await sorok.first().innerText()).includes('Premium')])
  const tokenek = (await sql(`select l.token from bookings b join booking_links l on l.booking_id = b.id join vehicles v on v.id = b.vehicle_id
    where v.plate_raw = 'TOB-202' order by b.service_date`)).map((r) => `/foglalas/${r.token}`)
  ok('a sorok a foglalások oldalára mutatnak', tokenek, await sorok.locator('a').evaluateAll((l) => l.map((a) => new URL(a.href).pathname)))
  ok('a keresés után a gomb újra használható', false, await ablak.getByRole('button', { name: 'Megkeresem' }).isDisabled())
  ok('állapot a sor végén', 'visszaigazolásra vár', sima(await sorok.first().locator('.kv-kereso-allapot').innerText()))
  await kep(p, '3-tobb')
  await ablak.getByRole('button', { name: 'Bezárás' }).click(); await p.waitForTimeout(200)
  ok('a × bezárja, a címből is eltűnik a #foglalasom', [0, ''], [await ablak.count(), new URL(p.url()).hash])
  await p.locator('.kv-foglalas-elo .kv-kereso button').click()
  ok('újranyitva üres mezőkkel', '', await p.inputValue('#fk-rendszam'))
  await p.mouse.click(5, 5); await p.waitForTimeout(200)
  ok('a háttérre kattintva bezárul', 0, await ablak.count())
  await ctx.close()
}

console.log('\n=== 4) Angolul és telefonon ===\n')
{
  const { ctx, p } = await foglalasOldal(b, { ut: '/publikus?lang=en', viewport: { width: 390, height: 844 },
    kontextus: { isMobile: true, hasTouch: true }, hiba: jsHiba })
  ok('telefonon a nyitó részben nincs meg a két gomb', false, await p.locator('.kv-hero-gombok').isVisible())
  const sor = p.locator('.kv-foglalas-elo .kv-kereso')
  await sor.scrollIntoViewIfNeeded()
  await sor.getByRole('button', { name: 'Find my booking' }).click()
  const ablak = p.locator('dialog.kv-kereso-fedo[open]')
  await ablak.waitFor()
  ok('angol szöveg', ['Find my booking', 'Find it'],
    [sima(await ablak.locator('h3').innerText()), sima(await ablak.locator('button[type="submit"]').innerText())])
  await p.fill('#fk-telefon', '+36 70 000 0000')
  await p.fill('#fk-email', 'nobody@example.com')
  await ablak.locator('button[type="submit"]').click(); await p.waitForTimeout(800)
  ok('angol üzenet, ha nincs találat', true, (await ablak.locator('.kv-kereso-nincs').innerText()).includes('could not find an active booking'))
  const ab = await doboz(ablak.locator('.kv-kereso-ablak'))
  ok('az ablak kifér a képernyőre', true, ab.l >= 0 && ab.r <= 390 && ab.t >= 0 && ab.b <= 844)
  await kep(p, '4-telefon-angol')
  await ctx.close()
}

console.log('\n=== 5) Foglaláskor az e-mail is kötelező ===\n')
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
  await kep(m.locator('[data-lepes="adatok"]'), '5-email-hibas')
  await p.fill('#fo-email', 'elemer@pelda.hu')
  ok('jó címmel küldhető', [false, 0], [await kuld.isDisabled(), await m.locator('.fogl-mezo-hiba').count()])
  await kuld.click(); await p.waitForTimeout(2500)
  ok('beküldve', true, (await m.locator('.fogl-siker').count()) === 1)
  const [x] = await sql(`select b.request_email, b.request_phone from bookings b join vehicles v on v.id = b.vehicle_id where v.plate_raw = 'EML-101'`)
  ok('a foglaláson az e-mail és a telefonszám', { request_email: 'elemer@pelda.hu', request_phone: '301239876' }, x)
  const tipp = m.locator('.fogl-siker .fogl-siker-tipp')
  ok('a visszaigazoló üzenet alatt a kereső ajánlása', true, sima(await tipp.innerText()).startsWith('Ha később nem találnád a visszaigazolást, a főoldalon a Foglalásom megkeresése gombbal'))
  await kep(m.locator('.fogl-siker'), '5-siker')
  await tipp.getByRole('link', { name: 'Foglalásom megkeresése' }).click()
  await p.locator('dialog.kv-kereso-fedo[open]').waitFor({ timeout: 5000 })
  ok('a linkre a kereső ablak nyílik', 1, await p.locator('dialog.kv-kereso-fedo[open]').count())
  await ctx.close()
}

console.log('\n=== 6) Ismeretlen link: út a kereséshez ===\n')
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  p.on('pageerror', jsHiba)
  await p.goto(`http://localhost:5180/foglalas/${'0'.repeat(32)}`)
  await p.locator('.ugy-tovabb').waitFor({ timeout: 90000 })
  const link = p.locator('.ugy-tovabb a').filter({ hasText: 'Foglalásom megkeresése' })
  ok('a hibás link oldalán ott a kereső linkje', ['/publikus', '#foglalasom'],
    [new URL(await link.evaluate((a) => a.href)).pathname, new URL(await link.evaluate((a) => a.href)).hash])
  await kep(p.locator('.ugy-tovabb'), '6-ismeretlen')
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
