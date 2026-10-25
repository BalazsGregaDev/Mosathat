import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { beir, bezar, blokk, ertek, nyit, varTartalom } from './_tszerk.mjs'
import { adatbazis, TULAJ } from './_db.mjs'

const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })
const b = await chromium.launch()
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const DEMO = 'http://localhost:5180'
const SB = 'http://localhost:5181'
const sima = (s) => (s ?? '').replace(new RegExp('\u2063[\uFE00-\uFE0F]{3}|\u2064', 'g'), '').replace(/\s+/g, ' ').trim()
const kep = async (p, nev, opts = {}) => { if (KEPEK) { await p.waitForTimeout(250); await p.screenshot({ path: join(KEPEK, nev), ...opts }) } }
const kepElem = async (l, nev) => { if (KEPEK) { await l.page().waitForTimeout(250); await l.screenshot({ path: join(KEPEK, nev) }) } }

async function publikus(ut, viewport, alap = DEMO) {
  const ctx = await b.newContext({ viewport })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 200)))
  await p.goto(alap + ut)
  await p.locator('.kv-lab').waitFor({ timeout: 60000 })
  if (ut.startsWith('/publikus')) await p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 30000 })
  await p.evaluate(() => document.fonts.ready)
  return { ctx, p, hibak }
}
const kapcsolo = (p) => p.locator('.kv-nyelv-sor .nyelv-kapcsolo')
const allapot = (p) => p.evaluate(() => ({
  lang: document.documentElement.lang,
  url: location.search,
  tar: localStorage.getItem('mosathat.nyelv'),
  be: document.querySelector('.kv-nyelv-sor .nyelv-kapcsolo')?.getAttribute('aria-checked'),
}))

console.log('=== 1) A csúszka helye: jobbra, a navbar alatt, ugyanakkora térközzel ===\n')
{
  const { ctx, p } = await publikus('/publikus', { width: 1440, height: 900 })
  const m = await p.evaluate(() => {
    const nav = document.querySelector('.kv-nav').getBoundingClientRect()
    const linkek = [...document.querySelectorAll('.kv-nav nav a')].map((a) => a.getBoundingClientRect())
    const k = document.querySelector('.kv-nyelv-sor .nyelv-kapcsolo').getBoundingClientRect()
    return {
      fent: nav.bottom - 1 - Math.max(...linkek.map((l) => l.bottom)),
      lent: k.top - nav.bottom,
      jobbLink: Math.round(Math.max(...linkek.map((l) => l.right))),
      jobbKapcsolo: Math.round(k.right),
      hero: Math.round(document.querySelector('.kv-hero').getBoundingClientRect().top - nav.bottom),
    }
  })
  ok('a menüpontok és a navbar vonala közti térköz = a vonal és a csúszka közti térköz (±1,5 px)', true, Math.abs(m.fent - m.lent) <= 1.5)
  ok('jobb széle egy vonalban a menüpontokéval', m.jobbLink, m.jobbKapcsolo)
  ok('asztali gépen nem tol le semmit (a nyitó rész a navbar alatt kezdődik)', 0, m.hero)
  ok('alapból magyar: HU aktív, nincs ?lang', { lang: 'hu', url: '', tar: 'hu', be: 'false' }, await allapot(p))
  const st = await p.evaluate(() => {
    const [hu, en] = document.querySelectorAll('.kv-nyelv-sor .nyelv-fel')
    const z = (e) => getComputedStyle(e.querySelector('.nyelv-zaszlo')).filter
    return { hu: [hu.hasAttribute('data-aktiv'), z(hu)], en: [en.hasAttribute('data-aktiv'), z(en)] }
  })
  ok('az aktív fél színes, a másik szürke', { hu: [true, 'none'], en: [false, 'grayscale(1) contrast(0.9)'] }, st)
  await kep(p, '01-publikus-hu.png', { clip: { x: 900, y: 0, width: 540, height: 160 } })
  await ctx.close()
}

console.log('\n=== 2) Angolra váltás: minden szöveg angolul ===\n')
const a = await publikus('/publikus', { width: 1440, height: 900 })
{
  const p = a.p
  await kapcsolo(p).click()
  await p.waitForTimeout(700)
  ok('EN aktív, ?lang=en az URL-ben, megjegyezve, html lang=en', { lang: 'en', url: '?lang=en', tar: 'en', be: 'true' }, await allapot(p))
  ok('menü', ['About us', 'Gallery', 'Packages', 'Booking', 'Contact'], (await p.locator('.kv-nav nav a').allTextContents()).map(sima))
  ok('nyitó rész', ['HAND CAR DETAILING — BUDAPEST, DISTRICT XIII', 'Your car isn’t just a thing. It’s with you for years.'],
    [sima(await p.locator('.kv-hero .kv-kicker').innerText()), sima(await p.locator('.kv-hero h1').innerText())])
  ok('böngészőfül', 'Mosathat — hand car detailing, 1138 Budapest, Váci út 140.', await p.title())
  ok('táblázat fejléce és árai', [['START', 'HUF 12,800'], ['PREMIUM', 'HUF 15,600'], ['ELITE', 'HUF 19,800']],
    await p.locator('.kv-tabla thead th:not(.kv-fej-bal)').evaluateAll((l) => l.map((e) => [e.querySelector('.kv-csomag-nev').innerText.trim(), e.querySelector('.kv-ar').innerText.trim()])))
  const sorok = await p.locator('.kv-tabla tbody tr:not(.kv-csoport) th').allTextContents()
  ok('a táblázat sorai angolul', ['Bug removal', 'Pre-wash (snow foam)', 'Door shut wipe-down', 'Floor carpet deep clean'],
    [sorok[0], sorok[1], sorok.find((x) => x.startsWith('Door')), sorok.at(-1)].map(sima))
  ok('eltérő cellák angolul', ['wipe-down', 'wipe-down', 'deep clean'],
    await p.locator('.kv-tabla tbody tr').filter({ hasText: 'Door shut' }).locator('.kv-mas').allTextContents())
  ok('sorcsoportok a csak mosás és csak takarítás árával, kategóriák', ['EXTERIOR Exterior only:', 'INTERIOR Interior only:', 'PASSENGER CAR — SALOON, ESTATE, HATCHBACK'],
    [...(await p.locator('.kv-csoport th').allInnerTexts()).map(sima), sima(await p.locator('.kv-alcim').innerText())])
  ok('foglalás: cím és első lépés', ['Online booking', 'What car are you bringing?'],
    [sima(await p.locator('.kv-foglalas > h2').textContent()), sima(await p.locator('[data-lepes="auto"] h2').innerText()).replace(/^1 /, '')])
  ok('csomagkártyák', ['Premium', 'from HUF 15,600', 'approx. 1 hr 30 min'],
    [sima(await p.locator('.fogl-csomag').nth(1).locator('.nev').textContent()), sima(await p.locator('.fogl-csomag').nth(1).locator('.ar').textContent()),
     sima(await p.locator('.fogl-csomag').nth(1).locator('.ido').textContent())])
  ok('automatikus csomagleírás angolul', true, /^Everything in Start, plus: Tyre dressing, Quick wax/.test(sima(await p.locator('.fogl-csomag').nth(1).locator('.leiras').textContent())))
  ok('lábléc és Hol vagyunk', ['Where we are', 'Monday–Friday 9:00–17:00, Saturday 8:00–14:00', 'Frequently asked questions', 'Legal notice', 'Privacy policy'],
    [sima(await p.locator('.kv-hely h2').textContent()), sima(await p.locator('.kv-hely .kv-info').nth(1).locator('.kv-ertek').textContent()),
     ...(await p.locator('.kv-lab-also nav a').allTextContents()).map(sima)])
  ok('a GYIK és a jogi linkek angol oldalra visznek', ['/gyik?lang=en', '/impresszum?lang=en', '/adatvedelem?lang=en'],
    await p.locator('.kv-lab-also nav a').evaluateAll((l) => l.map((x) => x.getAttribute('href'))))
  await kep(p, '02-publikus-en.png')
  await p.locator('.kv-nav nav a').filter({ hasText: 'Packages' }).click()
  await p.waitForTimeout(900)
  ok('a menüpont felvillantja az angol címet is', true, await p.locator('.kv-csomagok h2').evaluate((e) => e.hasAttribute('data-felvillan')))
  await kep(p, '03-publikus-en-csomagok.png')
}

console.log('\n=== 3) Foglalás angolul, végig ===\n')
{
  const p = a.p
  const m = p.locator('.kv-foglalas-elo')
  await m.locator('.fogl-csomag').nth(1).click()
  await p.waitForTimeout(500)
  ok('Full Service ár alatt', 'together with the Premium package', sima(await m.locator('.fogl-fs .ar small').textContent()))
  ok('3. lépés', ['What should we do?', 'Inside and out'], [sima(await m.locator('[data-lepes="mit"] h2').innerText()).replace(/^3 /, ''), sima(await m.locator('[data-lepes="mit"] button').first().innerText()).split(' HUF')[0]])
  ok('extrák angolul', true, (await m.locator('.fogl-extra .nev').allInnerTexts()).some((x) => x.startsWith('Wheel and tyre deep clean and dressing')))
  const kp = m.locator('.fogl-extra').filter({ hasText: 'Upholstery wet cleaning' })
  await kp.locator('input[type="checkbox"]').check()
  await p.waitForTimeout(300)
  ok('mértékegység angolul, többes számban', ['5 seats', true], [sima(await kp.locator('.db').textContent()), /\/ seat$/.test(sima(await kp.locator('.ar').textContent()))])
  await m.locator('[data-lepes="tipus"] button').nth(1).click()
  await p.waitForTimeout(1500)
  ok('naptár: angol napnevek és állapotok', [['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], true],
    [await m.locator('.fogl-napfej').allTextContents(), (await m.locator('.fogl-nap .allapot').allTextContents()).some((x) => ['Available', 'Few left', 'Full', 'Closed'].includes(x))])
  await m.locator('.fogl-nap[data-allapot="szabad"]').first().click()
  await p.waitForTimeout(500)
  ok('7. lépés címe angol dátummal', true, /^7 When will you bring it\? (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) \d{1,2} [A-Z][a-z]+ \d{4}$/.test(sima(await m.locator('h2.fogl-al').innerText()).replace(',', '')))
  await m.locator('.fogl-idok button').first().click()
  await p.waitForTimeout(500)
  const osszeg = sima(await m.locator('.fogl-osszeg .sorok').innerText())
  ok('összegzés angolul', [true, true, true], [/Premium · Passenger car · Inside and out/.test(osszeg), /Upholstery wet cleaning \(5 seats\)/.test(osszeg), /drop-off: \d{1,2}:\d{2}/.test(osszeg)])
  ok('ár és idő', [true, true], [/^HUF [\d,]+$/.test(sima(await m.locator('.fogl-osszeg .ar').textContent())), /^approx\. \d+ hr/.test(sima(await m.locator('.fogl-osszeg .osszeg .halk').first().textContent()))])
  await m.locator('#fo-nev').fill('X'.repeat(81))
  await m.locator('#fo-tel').fill('+36 30 111 2222')
  await m.locator('#fo-email').fill('teszt@pelda.hu')
  await m.locator('#fo-rsz').fill('ABC123')
  await m.locator('.fogl-feltetel input').check()
  ok('adatvédelmi link angolul', ['Privacy policy', '/adatvedelem?lang=en'], [sima(await m.locator('.fogl-adatvedelem a').textContent()), await m.locator('.fogl-adatvedelem a').getAttribute('href')])
  await m.locator('.fogl-osszeg .btn-fo').click()
  await m.locator('.fogl-osszeg .hibauzenet').waitFor({ timeout: 15000 })
  ok('a szerver hibaüzenete is angolul jelenik meg', 'The name can be at most 80 characters long.', sima(await m.locator('.fogl-osszeg .hibauzenet').textContent()))
  await m.locator('#fo-nev').fill('Test Customer')
  await m.locator('.fogl-osszeg .btn-fo').click()
  await m.locator('.fogl-siker').waitFor({ timeout: 15000 })
  ok('köszönő üzenet', true, /^Thank you, we’ve received your booking request!/.test(sima(await m.locator('.fogl-siker').innerText())))
  await kepElem(m.locator('.fogl-siker'), '04-foglalas-koszono-en.png')
  ok('nincs futásidejű hiba', [], a.hibak)
}

console.log('\n=== 4) Megjegyzi a nyelvet, jogi oldalak angolul ===\n')
{
  const p = a.p
  await p.goto(DEMO + '/adatvedelem')
  await p.locator('.kv-jogi h1').waitFor({ timeout: 60000 })
  ok('?lang nélkül is angolul nyílik (megjegyezte), és az URL-be is beírja', ['Privacy policy', '?lang=en'], [sima(await p.locator('.kv-jogi h1').textContent()), await p.evaluate(() => location.search)])
  ok('fordítási megjegyzés és hatály angolul', [true, 'Effective from: 17 October 2026'],
    [(await p.locator('.kv-jogi .kv-jogi-halk').first().textContent()).includes('Hungarian version prevails'), sima(await p.locator('.kv-jogi-hataly').textContent())])
  ok('fejezetek', ['1. The controller', '2. What data we process, and why', '8. Your rights'],
    [(await p.locator('.kv-jogi h2').allTextContents())[0], (await p.locator('.kv-jogi h2').allTextContents())[1], (await p.locator('.kv-jogi h2').allTextContents()).find((x) => x.startsWith('8.'))].map(sima))
  ok('adatfeldolgozók feladata angolul', true, (await p.locator('.kv-jogi-tabla td').allTextContents()).includes('delivering the confirmation e-mails'))
  ok('böngészőfül', 'Privacy policy — Mosathat', await p.title())
  await kep(p, '05-adatvedelem-en.png')
  await p.goto(DEMO + '/impresszum?lang=en')
  await p.locator('.kv-jogi h1').waitFor({ timeout: 60000 })
  ok('Impresszum angolul', ['Legal notice', 'Service provider', 'Complaints'],
    [sima(await p.locator('.kv-jogi h1').textContent()), ...(await p.locator('.kv-jogi h2').allTextContents()).filter((x) => ['Service provider', 'Complaints'].includes(x))])
  await kapcsolo(p).click()
  await p.waitForTimeout(500)
  ok('visszaváltva magyarul', ['Impresszum', 'A szolgáltató adatai', '', 'hu'],
    [sima(await p.locator('.kv-jogi h1').textContent()), sima(await p.locator('.kv-jogi h2').first().textContent()), await p.evaluate(() => location.search), await p.evaluate(() => document.documentElement.lang)])
  await a.ctx.close()
}

console.log('\n=== 5) Telefonon ===\n')
{
  const { ctx, p } = await publikus('/publikus?lang=en', { width: 390, height: 844 })
  ok('a nyelvválasztó a hamburger menüben van, nem a navbar alatt', [false, true],
    [await p.locator('.kv-nyelv-sor .nyelv-kapcsolo').isVisible(), await p.locator('.kv-menu-gomb').isVisible()])
  await p.locator('.kv-menu-gomb').click()
  await p.waitForTimeout(400)
  ok('a menüben angolul aktív, nincs vízszintes görgetés', ['true', false],
    [await p.locator('.kv-menu-panel .nyelv-kapcsolo').getAttribute('aria-checked'), await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)])
  await kep(p, '06-telefon-en.png')
  await ctx.close()
}

console.log('\n=== 6) Admin, Tartalom: HU-EN csúszka az előnézet fölött ===\n')
const ad = await b.newContext({ viewport: { width: 1500, height: 1000 } })
const q = await ad.newPage()
const adHibak = []
q.on('pageerror', (e) => adHibak.push(e.message.slice(0, 200)))
await q.goto(DEMO + '/')
await q.waitForSelector('input[type="email"]', { timeout: 60000 })
await q.fill('input[type="email"]', 'tulaj@mosathat.hu'); await q.fill('input[type="password"]', 'x')
await q.getByRole('button', { name: /Belépés/ }).click()
const menu = (n) => q.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${n}$`) })
await menu('Tartalom').waitFor({ timeout: 30000 })
await menu('Tartalom').click()
await varTartalom(q)
{
  const kapcs = q.locator('.tsz-eszkozok .nyelv-kapcsolo')
  ok('egy HU-EN csúszka az előnézet fölött, az egész oldalra', 1, await kapcs.count())
  await kapcs.click()
  await q.waitForTimeout(1200)
  const hero = blokk(q, 'hero')
  ok('angolra vált: szöveg, előnézet, EN jelölés a szerkesztőben', ['Hand car detailing — {kerulet}', 'Your car isn’t just a thing. It’s with you for years.', 1],
    [await ertek(q, 'hero.felcim'), sima(await hero.locator('.kv-hero h1').innerText()), await q.locator('.tsz-kartya .pub-nyelv-jel').count()])
  ok('a változó magyarázata angol értékkel', ['{kerulet} = kerület, most: Budapest, District XIII'],
    (await q.locator('.tsz-kartya .pub-valtozo-magyarazat li').allTextContents()).map(sima))
  ok('a többi blokk is angol', 'Packages', sima(await blokk(q, 'csomagok').locator('h2').first().innerText()))
  await beir(q, 'hero.cim', 'Cars deserve care.\n*Every* time.')
  await bezar(q)
  ok('az angol előnézet azonnal frissül', 'Cars deserve care. Every time.', sima(await hero.locator('.kv-hero h1').innerText()))
  await kapcs.click()
  await q.waitForTimeout(800)
  ok('visszaváltva a magyar szöveg ott van, az angol módosítás megmaradt', ['Az autó nem tárgy.\n*Évekig* veled van.', 'Nem mentett változás'],
    [await ertek(q, 'hero.cim'), sima(await q.locator('.pub-valtozott').textContent())])
  await bezar(q)
  await kapcs.click()
  await q.waitForTimeout(800)
  await hero.evaluate((h) => { const t = document.querySelector('.tartalom'); t.scrollTo(0, t.scrollTop + h.getBoundingClientRect().top - 150) })
  await q.waitForTimeout(300)
  await kep(q, '07-admin-tartalom-hero-en.png')
  const f6 = blokk(q, 'fogl-6')
  await q.waitForTimeout(800)
  ok('a naptár-előnézet is angolul', true, (await f6.locator('.fogl-napfej').allTextContents()).join(' ') === 'Mon Tue Wed Thu Fri Sat')
  await f6.evaluate((h) => { const t = document.querySelector('.tartalom'); t.scrollTo(0, t.scrollTop + h.getBoundingClientRect().top - 150) })
  await q.waitForTimeout(300)
  await kep(q, '08-admin-tartalom-naptar-en.png')
  await nyit(q, 'hely.bevezeto')
  await q.locator('.tsz-kartya [data-valtozo-link="bejarat"]').click()
  await q.waitForFunction(() => document.activeElement?.dataset?.mezo === 'bejarat_en', null, { timeout: 10000 })
  ok('angol {bejarat} az Elérhetőség angol mezőjére visz', ['en', 'bejarat_en', 'from Dagály utca'],
    [await q.locator('.pub-oldal .panel[data-nyelv]').getAttribute('data-nyelv'), await q.evaluate(() => document.activeElement.dataset.mezo),
     await q.evaluate(() => document.activeElement.value)])
  await kep(q, '09-admin-elerhetoseg-en.png')
}

console.log('\n=== 7) Admin, Csomagok: táblázat, csomagnevek, extrák angolul ===\n')
{
  await menu('Csomagok tartalma').click()
  await q.locator('.szerk-tabla').waitFor({ timeout: 20000 })
  ok('két szekció, mindkettő fejlécében csúszka', 2, await q.locator('.csomag-szerk .panel > h3 .nyelv-kapcsolo').count())
  const tabla = q.locator('.csomag-szerk .panel').first()
  await tabla.locator('h3 .nyelv-kapcsolo').click()
  await q.waitForTimeout(400)
  ok('angol táblázat: oszlopfejek, sornevek, cellák', [['Start', 'Premium', 'Elite'], 'Bug removal', 'Door shut deep clean'],
    [(await q.locator('.szerk-tabla thead th').allTextContents()).slice(1),
     await q.locator('.szerk-tabla tbody tr[data-sor="Bogároldó"] th input').inputValue(),
     await q.locator('.szerk-tabla tbody tr[data-sor="Falc áttörlés"] td').nth(2).locator('input.beviteli').inputValue()])
  ok('angol módban nincs új sor / új csomag gomb', [0, 0], [await q.getByRole('button', { name: /Új sor/ }).count(), await q.getByRole('button', { name: /Új csomag/ }).count()])
  await kepElem(tabla, '10-admin-csomagtabla-en.png')
  const nevek = q.locator('.csomag-szerk .panel').nth(1)
  await nevek.locator('h3 .nyelv-kapcsolo').click()
  await q.waitForTimeout(300)
  ok('csomagnevek angolul, automatikus angol leírással', ['Elite', true],
    [await nevek.locator('.szerk-csomag').nth(2).locator('input').inputValue(),
     (await nevek.locator('.szerk-csomag').nth(2).locator('textarea').getAttribute('placeholder')).startsWith('Üresen hagyva: Everything in Premium, plus:')])
  ok('az extrák itt már nincsenek, a Szolgáltatások menüben vannak', 0, await q.locator('.szerk-extra').count())
  await nevek.locator('h3').evaluate((h) => { const t = document.querySelector('.tartalom'); t.scrollTo(0, t.scrollTop + h.getBoundingClientRect().top - 150) })
  await q.waitForTimeout(300)
  await kep(q, '11-admin-csomagnevek-extrak-en.png')
  ok('nincs futásidejű hiba', [], adHibak)
  await ad.close()
}

console.log('\n=== 8) Mentés és megjelenés a publikus oldalon (adatbázissal) ===\n')
{
  const db = await adatbazis({ demo: true })
  const rpc = async (fn, body, uid) => {
    await db.query(`select set_config('app.uid', $1, false)`, [uid])
    const kulcsok = Object.keys(body ?? {})
    const args = kulcsok.map((k, i) => `${k} => $${i + 1}`).join(', ')
    const ertekek = kulcsok.map((k) => (body[k] !== null && typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]))
    return (await db.query(`select ${fn}(${args}) as x`, ertekek)).rows[0].x
  }
  const TABLAK = ['packages', 'package_pricing', 'full_service_pricing', 'extras', 'surcharges', 'v_package_matrix', 'v_package_extra']
  const json = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  async function kornyezet(viewport) {
    const ctx = await b.newContext({ viewport })
    await ctx.route('https://teszt.supabase.co/**', async (r) => {
      const ut = new URL(r.request().url()).pathname
      const belepve = (r.request().headers().authorization ?? '') === 'Bearer t'
      const user = { id: TULAJ, email: 'x@mosathat.hu', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
      if (ut.startsWith('/auth/v1/token')) {
        return json(r, { access_token: 't', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user })
      }
      if (ut.startsWith('/auth/v1/user')) return json(r, user)
      if (ut.startsWith('/auth/')) return json(r, {})
      if (ut === '/rest/v1/staff') return json(r, { id: TULAJ, full_name: 'Teszt', role: 'TULAJDONOS', active: true })
      const tabla = /^\/rest\/v1\/([a-z_]+)$/.exec(ut)?.[1]
      if (tabla && TABLAK.includes(tabla)) return json(r, (await db.query(`select * from ${tabla}`)).rows)
      const fn = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(ut)?.[1]
      if (fn && (fn.startsWith('publikus_') || fn.startsWith('csomag_szerkeszto') || fn === 'dashboard_summary')) {
        try {
          const body = r.request().postData() ? JSON.parse(r.request().postData()) : {}
          return json(r, await rpc(fn, body, belepve ? TULAJ : ''))
        } catch (e) {
          return json(r, { code: 'P0001', message: e.message, details: null, hint: null }, 400)
        }
      }
      if (fn === 'can_edit_customers') return json(r, true)
      return json(r, [])
    })
    const p = await ctx.newPage()
    const hibak = []
    p.on('pageerror', (e) => hibak.push((e.stack ?? e.message).slice(0, 300)))
    return { ctx, p, hibak }
  }
  const { ctx, p, hibak } = await kornyezet({ width: 1500, height: 1000 })
  await p.goto(SB + '/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'x@mosathat.hu'); await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  const m2 = (n) => p.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${n}$`) })
  await m2('Tartalom').waitFor({ timeout: 30000 })
  const ment = async () => {
    await p.locator('.pub-fej').getByRole('button', { name: 'Mentés' }).click()
    await p.locator('.pub-mentve, .pub-hiba').first().waitFor({ timeout: 10000 })
    return sima(await p.locator('.pub-mentve, .pub-hiba').first().textContent())
  }

  await m2('Tartalom').click()
  await varTartalom(p)
  await p.locator('.tsz-eszkozok .nyelv-kapcsolo').click()
  await p.waitForTimeout(800)
  await beir(p, 'hero.cim', 'Cars deserve care.\n*Every* time.')
  await bezar(p)
  ok('Tartalom: angol nagy cím mentve', 'Mentve, a publikus oldalon már látszik', await ment())
  ok('az adatbázisban külön angol sorként, a magyar érintetlen', [['hero.cim', 'en', 'Cars deserve care.\n*Every* time.']],
    (await db.query(`select kulcs, nyelv, ertek from publikus_szovegek order by nyelv`)).rows.map((r) => [r.kulcs, r.nyelv, r.ertek]))

  await m2('Elérhetőség').click()
  await p.locator('[data-mezo="telefon"]').waitFor({ timeout: 20000 })
  await p.locator('.pub-oldal .panel[data-nyelv] .nyelv-kapcsolo').click()
  await p.locator('[data-mezo="bejarat_en"]').fill('from Dagály utca (ramp on the left)')
  ok('Elérhetőség: angol bejárat mentve', 'Mentve, a publikus oldalon már látszik', await ment())

  await m2('Cégadatok').click()
  await p.locator('.pub-kamerak').waitFor({ timeout: 20000 })
  await p.locator('[data-mezo="kamera_megorzes"]').fill('3 munkanapig')
  await p.getByRole('button', { name: '+ Kamera' }).click()
  await p.getByLabel('1. kamera helye', { exact: true }).fill('Bejárat')
  await p.getByLabel('1. kamera látótere', { exact: true }).fill('a beálló autókat')
  await p.locator('.pub-kamerak .nyelv-kapcsolo').click()
  await p.locator('[data-mezo="kamera_megorzes_en"]').fill('3 working days')
  await p.getByLabel('1. kamera helye angolul').fill('Entrance')
  await p.getByLabel('1. kamera látótere angolul').fill('cars pulling in')
  ok('Cégadatok: angol kamera adatok mentve', 'Mentve, a publikus oldalon már látszik', await ment())
  await kepElem(p.locator('.pub-kamerak'), '12-admin-kamera-en.png')

  await m2('Csomagok tartalma').click()
  await p.locator('.szerk-tabla').waitFor({ timeout: 20000 })
  const panelek = p.locator('.csomag-szerk .panel')
  await panelek.nth(0).locator('h3 .nyelv-kapcsolo').click()
  await p.locator('.szerk-tabla tbody tr[data-sor="Bogároldó"] th input').fill('Bug and tar removal')
  await panelek.nth(1).locator('h3 .nyelv-kapcsolo').click()
  await panelek.nth(1).locator('.szerk-csomag').nth(2).locator('input').fill('Elite Plus')
  await p.locator('.szerk-lab .btn-fo').click()
  await p.waitForFunction(() => /^Mentve\./.test(document.querySelector('.szerk-allapot')?.textContent ?? ''), null, { timeout: 15000 })
  ok('Csomagok: angol nevek mentve, az extrák angol neve érintetlen', [['Elit', 'Elite Plus'], ['Bogároldó', 'Bug and tar removal'], ['Felni és gumi mélytisztítás és ápolás', 'Wheel and tyre deep clean and dressing']], [
    Object.values((await db.query(`select name, name_en from packages where code = 'ELIT'`)).rows[0]),
    Object.values((await db.query(`select name, name_en from package_slots where name = 'Bogároldó'`)).rows[0]),
    Object.values((await db.query(`select name, name_en from extras order by sort_order limit 1`)).rows[0]),
  ])
  ok('nincs futásidejű hiba az adminban', [], hibak)
  await ctx.close()

  const pub = await kornyezet({ width: 1440, height: 900 })
  await pub.p.goto(SB + '/publikus?lang=en')
  await pub.p.locator('.kv-foglalas-elo .fogl').waitFor({ timeout: 60000 })
  ok('publikus angol oldal: a mentett szövegek', ['Cars deserve care. Every time.', true, 'ELITE PLUS', 'Bug and tar removal'], [
    sima(await pub.p.locator('.kv-hero h1').innerText()),
    sima(await pub.p.locator('.kv-hero .kv-halk').innerText()).includes('The entrance is from Dagály utca (ramp on the left)'),
    sima(await pub.p.locator('.kv-tabla thead th').nth(3).locator('.kv-csomag-nev').innerText()),
    sima(await pub.p.locator('.kv-tabla tbody tr:not(.kv-csoport) th').first().textContent()),
  ])
  await pub.p.locator('.kv-foglalas-elo .fogl-csomag').nth(2).click()
  await pub.p.waitForTimeout(400)
  ok('foglalásban is: Elite Plus és az extra angol neve', ['Elite Plus', true], [
    sima(await pub.p.locator('.fogl-csomag').nth(2).locator('.nev').textContent()),
    (await pub.p.locator('.fogl-extra .nev').allInnerTexts()).some((x) => x.startsWith('Wheel and tyre deep clean')),
  ])
  await kapcsolo(pub.p).click()
  await pub.p.waitForTimeout(500)
  ok('magyarul minden változatlan', ['Az autó nem tárgy. Évekig veled van.', 'ELIT', 'Bogároldó'], [
    sima(await pub.p.locator('.kv-hero h1').innerText()),
    sima(await pub.p.locator('.kv-tabla thead th').nth(3).locator('.kv-csomag-nev').innerText()),
    sima(await pub.p.locator('.kv-tabla tbody tr:not(.kv-csoport) th').first().textContent()),
  ])
  await pub.p.goto(SB + '/adatvedelem?lang=en')
  await pub.p.locator('.kv-jogi h1').waitFor({ timeout: 60000 })
  const kamera = sima(await pub.p.locator('.kv-jogi-kezeles').filter({ hasText: '2.8 Camera surveillance' }).innerText())
  ok('angol adatvédelmi oldal: megőrzés és kamera angolul', [true, true],
    [kamera.includes('for 3 working days from the time of recording'), kamera.includes('Entrance: cars pulling in')])
  await pub.p.goto(SB + '/adatvedelem')
  await pub.p.locator('.kv-jogi h1').waitFor({ timeout: 60000 })
  await kapcsolo(pub.p).click()
  await pub.p.waitForTimeout(400)
  const kameraHu = sima(await pub.p.locator('.kv-jogi-kezeles').filter({ hasText: '2.8 Kamerás megfigyelés' }).innerText())
  ok('magyarul a magyar kamera adatok', [true, true], [kameraHu.includes('a rögzítéstől számított 3 munkanapig'), kameraHu.includes('Bejárat: a beálló autókat')])
  ok('nincs futásidejű hiba a publikus oldalon', [], pub.hibak)
  await pub.ctx.close()
}

console.log(`\n${baj ? `${baj} HIBA` : 'MINDEN RENDBEN'}`)
await b.close()
process.exit(baj ? 1 : 0)
