import { chromium } from 'playwright'

import { adminOldal, foglalasOldal, onlineKeres } from './_publikus.mjs'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const sima = (s) => s.replace(/\s+/g, ' ').trim()
const perc = (s) => { const [o, p] = s.split(':').map(Number); return o * 60 + p }

async function oldal(beall = { viewport: { width: 1440, height: 900 } }) {
  const hibak = []
  const { viewport, ...kontextus } = beall
  const o = await foglalasOldal(b, { viewport, kontextus, hiba: (e) => hibak.push(`pageerror: ${e.message.slice(0, 160)}`) })
  o.p.on('console', (m) => { if (m.type() === 'error') hibak.push(`console: ${m.text().slice(0, 160)}`) })
  return { ...o, hibak }
}

const { ctx, p, m, sql, hibak } = await oldal()
const gomb = (szoveg) => m.locator('.fogl-valaszto button').filter({ hasText: szoveg })
const hataridok = m.locator('.fogl-hataridok button')
const kijelolt = async () => sima(await m.locator('.fogl-hataridok button[aria-pressed="true"]').innerText())

console.log('=== 1) Itt hagyom: választható határidő ===\n')
await gomb('Személyautó').click()
await m.locator('.fogl-csomag', { has: p.locator('.nev', { hasText: /^Premium$/ }) }).click(); await p.waitForTimeout(900)
await gomb('Itt hagyom').click(); await p.waitForTimeout(3500)
await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await p.waitForTimeout(1500)
ok('hozási idő előtt nincs határidő választó', 0, await m.locator('.fogl-hatarido').count())
const elsoIdo = m.locator('.fogl-idok button').first()
const hozasIdo = sima(await elsoIdo.innerText()).split(' ')[0]
const hozas = perc(hozasIdo)
await elsoIdo.click(); await p.waitForTimeout(800)
const idok = (await hataridok.allInnerTexts()).map(sima)
ok('legkorábban a munka vége, legkésőbb 17:00', [true, '17:00'], [perc(idok[0]) >= hozas + 90, idok.at(-1)])
ok('alapból zárásig (17:00) van kijelölve', '17:00', await kijelolt())
ok('a magyarázat is kiírja', `Legkorábban ${idok[0]}, legkésőbb 17:00.`,
  sima(await m.locator('.fogl-hatarido .fogl-al-szoveg').innerText()))
const valasztott = idok[2]
await hataridok.filter({ hasText: new RegExp(`^${valasztott}$`) }).click(); await p.waitForTimeout(300)
ok('választható korábbi határidő', valasztott, await kijelolt())
ok('az összegzésben a határidő', true, sima(await m.locator('.fogl-osszeg').innerText()).includes(`határidő: ${valasztott}`))
const erkezes = sima(await m.locator('.fogl-erkezes').innerText())
ok('a végleges ár figyelmeztetése az érkezési sorban, a gomb alatt nincs', [true, 0],
  [erkezes.includes('A végleges ár az autó állapotától'), await m.locator('.fogl-osszeg .kuld small').count()])

console.log('\n=== 2) Beküldve ===\n')
await p.fill('#fo-nev', 'Határidő Hanna')
await p.fill('#fo-tel', '+36 30 999 6601')
await p.fill('#fo-rsz', 'hat-661')
await m.locator('.fogl-feltetel input').check()
await m.getByRole('button', { name: 'Foglalási kérés küldése' }).click(); await p.waitForTimeout(2500)
ok('a köszönő oldal mondja a határidőt', true, (await m.locator('.fogl-siker p').innerText()).includes(`határidő: ${valasztott}`))
const varOra = valasztott.padStart(5, '0')
ok('a kérésben a választott határidő', [{ hozza: hozasIdo.padStart(5, '0'), viszi: varOra }],
  await sql(`select to_char(b.drop_off_at at time zone 'Europe/Budapest', 'HH24:MI') hozza, to_char(b.pick_up_at at time zone 'Europe/Budapest', 'HH24:MI') viszi
    from bookings b join vehicles v on v.id = b.vehicle_id where upper(v.plate_raw) = 'HAT-661'`))
{
  const a = await adminOldal(b)
  await onlineKeres(a.sql, { drop_off_time: hozasIdo.padStart(5, '0'), pick_up_time: varOra, plate_raw: 'hat-661',
    customer_name: 'Határidő Hanna', customer_phone: '+36 30 999 6601', customer_email: null })
  await a.belep('tulaj@mosathat.hu')
  const popup = a.p.locator('dialog[aria-label="Online foglalási kérés"]')
  const mikor = sima(await popup.locator('.keres-adatok').innerText())
  ok('a kérés ablakában: viszi a választott időben', true, mikor.includes(`viszi ${varOra}`))
  ok('befér a határidőre', 'true', await popup.locator('.keres-itelet').getAttribute('data-befer'))
  await popup.getByRole('button', { name: 'Elfogadom' }).click(); await a.p.waitForTimeout(1500)
  await a.ctx.close()
}

console.log('\n=== 3) Hol nincs határidő választó ===\n')
await m.getByRole('button', { name: 'Új foglalás' }).click(); await p.waitForTimeout(800)
await gomb('Megvárom').click(); await p.waitForTimeout(3500)
await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await p.waitForTimeout(1200)
await m.locator('.fogl-idok button').first().click(); await p.waitForTimeout(500)
ok('megvárásnál nincs', 0, await m.locator('.fogl-hatarido').count())
await m.locator('.fogl-fs input').check(); await p.waitForTimeout(800)
await m.locator('.fogl-ules button').filter({ hasText: /^Kárpit$/ }).click()
await gomb('Másnap').click(); await p.waitForTimeout(3500)
await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await p.waitForTimeout(1200)
await m.locator('.fogl-idok button').first().click(); await p.waitForTimeout(500)
ok('Full Service másnapi elvitelnél nincs, ott az elviteli sor', [0, 1],
  [await m.locator('.fogl-hatarido').count(), await m.locator('.fogl-elvitel').count()])
await gomb('Aznap').click(); await p.waitForTimeout(1500)
await m.locator('.fogl-idok button').first().click(); await p.waitForTimeout(800)
ok('Full Service aznapi elvitelnél van, 17:00-ig', [1, '17:00'],
  [await m.locator('.fogl-hatarido').count(), sima((await hataridok.allInnerTexts()).at(-1))])
ok('nincs JS vagy konzol hiba', [], hibak)
await ctx.close()

console.log('\n=== 4) Telefonon ===\n')
{
  const t = await oldal({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await t.m.locator('.fogl-valaszto button').filter({ hasText: 'Személyautó' }).click()
  await t.m.locator('.fogl-csomag', { has: t.p.locator('.nev', { hasText: /^Start$/ }) }).click(); await t.p.waitForTimeout(800)
  await t.m.locator('.fogl-valaszto button').filter({ hasText: 'Itt hagyom' }).click(); await t.p.waitForTimeout(3500)
  await t.m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await t.p.waitForTimeout(1200)
  await t.m.locator('.fogl-idok button').first().click(); await t.p.waitForTimeout(800)
  await t.m.locator('.fogl-hatarido').scrollIntoViewIfNeeded()
  ok('nem lóg ki oldalra', true, await t.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
  ok('nincs JS vagy konzol hiba', [], t.hibak)
  await t.ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
