import { chromium } from 'playwright'

import { hetkoznapra } from './_munkanap.mjs'
import { napra, onlineKeres, szabadNap, valtozas } from './_publikus.mjs'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}

async function oldal(email, beall = { viewport: { width: 1440, height: 900 } }) {
  const ctx = await b.newContext(beall)
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(`pageerror: ${e.message.slice(0, 160)}`))
  p.on('console', (m) => { if (m.type() === 'error') hibak.push(`console: ${m.text().slice(0, 160)}`) })
  await hetkoznapra(p)
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await belep(p, email)
  return { ctx, p, hibak }
}

async function belep(p, email) {
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
}

async function menu(p, nev) {
  const hamburger = p.locator('.hamburger:visible')
  if (await hamburger.count()) {
    await hamburger.first().click(); await p.waitForTimeout(400)
    await p.locator('.fiok button').filter({ hasText: nev }).first().click()
  } else {
    await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  }
  await p.waitForTimeout(1500)
}

let kerNap = null
async function kuldes(p, rsz, nev, tel, ido = '09:00') {
  const sql = (q, par = []) => p.evaluate(([q2, p2]) => window.mosathatDemoSql(q2, p2), [q, par])
  if (!kerNap) kerNap = await szabadNap(sql)
  await onlineKeres(sql, { booking_type: 'VAROS', start_time: ido, drop_off_time: null, service_date: kerNap,
    plate_raw: rsz, customer_name: nev, customer_phone: tel, customer_email: null })
  await valtozas(p)
  await p.waitForTimeout(1500)
}

const POPUP = 'dialog[aria-label="Online foglalási kérés"]'
const nyitottak = (p) => p.evaluate(() => [...document.querySelectorAll('dialog')]
  .filter((d) => d.open && d.matches(':modal')).map((d) => d.getAttribute('aria-label')))

const { ctx, p, hibak } = await oldal('tulaj@mosathat.hu')

console.log('=== 1) Beérkezéskor azonnal felugrik ===\n')
await kuldes(p, 'krs-631', 'Kérő Kata', '+36 30 999 6301')
const popup = p.locator(POPUP)
ok('megjelent a kérés ablaka', [1, true], [await popup.count(), (await nyitottak(p)).includes('Online foglalási kérés')])
ok('rendszám, új ügyfél', ['KRS-631', 1], [
  (await popup.locator('.keres-auto .rendszam').innerText()).trim(),
  await popup.locator('.cimke-pill[data-r="uj"]').count()])
ok('a beérkezés ideje', true, (await popup.locator('.lap-fej').innerText()).includes('épp most'))
ok('ítélet: befér, melyik helyen', ['true', true], [
  await popup.locator('.keres-itelet').getAttribute('data-befer'),
  /\d\. hely \d{1,2}:\d{2}–\d{1,2}:\d{2}/.test(await popup.locator('.keres-itelet').innerText())])
ok('foglaltság nélküle és vele', true,
  /\d+% → \d+%/.test(await popup.locator('.keres-foglaltsag').innerText()))
ok('a nap kapacitása', 1, await popup.locator('.kapacitas').count())
ok('a beosztásban kiemelve a kérés', 'KRS-631',
  (await popup.locator('.iv-darab[data-kiemelt]').first().innerText()).trim())

console.log('\n=== 2) Később, jelző, Esc ===\n')
await popup.getByRole('button', { name: 'Később' }).click(); await p.waitForTimeout(400)
const jelzo = p.locator('.keres-jelzo')
ok('Később: bezárul, alul jelző marad', [0, '1 online foglalási kérés vár'],
  [await popup.count(), (await jelzo.innerText()).replace(/\s+/g, ' ').trim()])
await jelzo.click(); await p.waitForTimeout(800)
ok('a jelzőre újra megnyílik', 1, await popup.count())
await p.keyboard.press('Escape'); await p.waitForTimeout(400)
ok('Esc = később', [0, 1], [await popup.count(), await jelzo.count()])
await jelzo.click(); await p.waitForTimeout(800)

console.log('\n=== 3) Munkalap a kérés fölött ===\n')
await popup.getByRole('button', { name: 'Munkalap' }).click(); await p.waitForTimeout(1500)
ok('a munkalap a kérés fölé nyílik', ['Online foglalási kérés', 'Munkalap'], await nyitottak(p))
await p.keyboard.press('Escape'); await p.waitForTimeout(600)
ok('bezárva a munkalapot a kérés marad', ['Online foglalási kérés'], await nyitottak(p))

console.log('\n=== 4) Elfogadás ===\n')
await popup.getByRole('button', { name: 'Elfogadom' }).click(); await p.waitForTimeout(1500)
ok('elfogadva: nincs ablak, nincs jelző', [0, 0], [await popup.count(), await jelzo.count()])
await menu(p, 'Időpontok')
await napra(p, kerNap)
ok('a napi nézetben visszaigazolt foglalás', 'CONFIRMED',
  await p.locator('.napi-lista .kartya').filter({ hasText: 'KRS-631' }).first().getAttribute('data-allapot'))

console.log('\n=== 5) Több kérés: lapozás, elutasítás ===\n')
await kuldes(p, 'krs-632', 'Első Elek', '+36 30 999 6302', '10:00')
await popup.getByRole('button', { name: 'Később' }).click(); await p.waitForTimeout(400)
await kuldes(p, 'krs-633', 'Második Mária', '+36 30 999 6303', '13:00')
ok('az új kérés a halasztott után is felugrik', 'KRS-633',
  (await popup.locator('.keres-auto .rendszam').innerText()).trim())
await popup.getByRole('button', { name: 'Később' }).click(); await p.waitForTimeout(400)
ok('a jelző mindkettőt számolja', '2 online foglalási kérés vár', (await jelzo.innerText()).replace(/\s+/g, ' ').trim())
await jelzo.click(); await p.waitForTimeout(800)
ok('lapozó: 1 / 2', '1 / 2', (await popup.locator('.keres-lapozo span').innerText()).trim())
ok('jelzi, hogy ugyanarra a napra másik kérés is vár', true,
  (await popup.innerText()).includes('Erre a napra még 1 másik kérés vár'))
const elsoRsz = (await popup.locator('.keres-auto .rendszam').innerText()).trim()
await popup.getByRole('button', { name: 'Következő kérés' }).click(); await p.waitForTimeout(800)
const masodikRsz = (await popup.locator('.keres-auto .rendszam').innerText()).trim()
ok('a nyíl a másik kérésre lapoz', true, elsoRsz !== masodikRsz && ['KRS-632', 'KRS-633'].includes(masodikRsz))
await popup.getByRole('button', { name: 'Elutasítom' }).click(); await p.waitForTimeout(400)
ok('elutasítás előtt rákérdez', true, (await p.locator('.kerdes-ablak h2').innerText()).startsWith('Elutasítod?'))
await p.locator('.kerdes-gombok button').filter({ hasText: 'Elutasít' }).click(); await p.waitForTimeout(1500)
ok('a megmaradt kérés jön, lapozó nélkül', [elsoRsz, 0], [
  (await popup.locator('.keres-auto .rendszam').innerText()).trim(),
  await popup.locator('.keres-lapozo').count()])
await popup.getByRole('button', { name: 'Elfogadom' }).click(); await p.waitForTimeout(1500)
ok('mindkettő kezelve', [0, 0], [await popup.count(), await jelzo.count()])

console.log('\n=== 6) Megnyitáskor is felugrik a függő kérés ===\n')
await kuldes(p, 'krs-634', 'Később Kálmán', '+36 30 999 6304', '14:00')
await popup.getByRole('button', { name: 'Később' }).click(); await p.waitForTimeout(400)
await p.locator('.ki').filter({ hasText: 'Kilépés' }).click(); await p.waitForTimeout(1200)
await belep(p, 'alkalmazott@mosathat.hu')
ok('belépés után azonnal ott van (alkalmazottnak is)', ['KRS-634'],
  [(await popup.locator('.keres-auto .rendszam').innerText()).trim()])
ok('nincs JS vagy konzol hiba', [], hibak)
await ctx.close()

console.log('\n=== 7) Telefonon ===\n')
{
  const t = await oldal('tulaj@mosathat.hu', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  kerNap = null
  await kuldes(t.p, 'tel-635', 'Telefon Tamás', '+36 30 999 6305')
  const tp = t.p.locator(POPUP)
  ok('felugrik', 1, await tp.count())
  ok('nem lóg ki oldalra', true, await t.p.evaluate(() => {
    const l = document.querySelector('dialog[aria-label="Online foglalási kérés"] .lap').getBoundingClientRect()
    return l.left >= 0 && l.right <= window.innerWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1
  }))
  ok('a döntés gombjai a képernyőn', true, await tp.getByRole('button', { name: 'Elfogadom' }).evaluate((g) => {
    const r = g.getBoundingClientRect()
    return r.bottom <= window.innerHeight && r.top >= 0
  }))
  ok('nincs JS vagy konzol hiba', [], t.hibak)
  await t.ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
