import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'

import { adatbazis, TULAJ } from './_db.mjs'
import { adminOldal, foglalasOldal, onlineKeres, valtozas } from './_publikus.mjs'

const CIM = process.env.CIM ?? 'http://localhost:5181'
const KEPEK = process.env.KEPEK ?? null
if (KEPEK) await mkdir(KEPEK, { recursive: true })

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
const sima = (s) => s.replace(/\s+/g, ' ').trim()
const kep = async (p, nev) => { if (KEPEK) await p.screenshot({ path: join(KEPEK, nev), fullPage: true }) }

const db = await adatbazis({ demo: true })
const egy = async (s, p = []) => (await db.query(s, p)).rows[0]
await db.query(`select set_config('app.uid', $1, false)`, [TULAJ])
const PREMIUM = (await egy(`select id from packages where code = 'PREMIUM'`)).id
const nap = (await egy(
  `select d::date::text d from generate_series(public.budapest_ma() + 4, public.budapest_ma() + 50, interval '1 day') d
    where munkanap(d::date) order by d limit 1`)).d
console.log('\n=== Admin: beállítás és online kérés ===\n')
const adminHibak = []
const { ctx: admin, p, sql, belep } = await adminOldal(b, { hiba: (e) => adminHibak.push(e.message.slice(0, 160)) })
await belep('tulaj@mosathat.hu')
const menu = (szoveg) => p.locator('aside.oldalsav button').filter({ hasText: szoveg }).first()

await menu('Beállítások').click(); await p.waitForTimeout(800)
await p.locator('.fulek button').filter({ hasText: 'Általános' }).click(); await p.waitForTimeout(800)
const panel = p.locator('.panel').filter({ hasText: 'Online foglalás' })
const mezo = panel.locator('input[type="number"]')
ok('az Általános fülön ott az online lemondási határidő, alapból 24', '24', await mezo.inputValue())
await mezo.fill('48')
await p.locator('.fej-mentes button').filter({ hasText: 'Mentés' }).click(); await p.waitForTimeout(1200)
await menu('Időpontok').click(); await p.waitForTimeout(600)
await menu('Beállítások').click(); await p.waitForTimeout(800)
await p.locator('.fulek button').filter({ hasText: 'Általános' }).click(); await p.waitForTimeout(800)
ok('mentés után megmarad', '48', await mezo.inputValue())
await panel.scrollIntoViewIfNeeded()
await kep(p, '11-beallitas.png')
await mezo.fill('24')
await p.locator('.fej-mentes button').filter({ hasText: 'Mentés' }).click(); await p.waitForTimeout(1000)

{
  const pub = await foglalasOldal(b, { hiba: (e) => adminHibak.push(e.message.slice(0, 160)) })
  const m = pub.m
  const gomb = (szoveg) => m.locator('.fogl-valaszto button').filter({ hasText: szoveg })
  await gomb('Személyautó').click()
  await m.locator('.fogl-csomag', { has: pub.p.locator('.nev', { hasText: /^Premium$/ }) }).click(); await pub.p.waitForTimeout(900)
  await gomb('Itt hagyom').click(); await pub.p.waitForTimeout(3500)
  await m.locator('.fogl-nap[data-allapot="szabad"]').first().click(); await pub.p.waitForTimeout(1500)
  await m.locator('.fogl-idok button').first().click(); await pub.p.waitForTimeout(800)
  await pub.p.fill('#fo-nev', 'Email Emma')
  await pub.p.fill('#fo-tel', '+36 30 999 6701')
  await pub.p.fill('#fo-email', 'emma@pelda.hu')
  await pub.p.fill('#fo-rsz', 'eml-671')
  await m.locator('.fogl-feltetel input').check()
  await m.getByRole('button', { name: 'Foglalási kérés küldése' }).click(); await pub.p.waitForTimeout(2500)
  ok('a köszönő oldal ígéri az e-mailt a foglalás oldalával', true,
    (await m.locator('.fogl-siker p').innerText()).includes('e-mailt küldünk róla, benne a foglalásod oldalának linkjével'))
  ok('a kérésben az e-mail cím', [{ email: 'emma@pelda.hu' }],
    await pub.sql(`select ugyfel_email email from v_online_kerelmek k join vehicles v on v.id = k.vehicle_id where upper(v.plate_raw) = 'EML-671'`))
  await pub.ctx.close()
}
await onlineKeres(sql, { plate_raw: 'eml-671', customer_name: 'Email Emma', customer_phone: '+36 30 999 6701', customer_email: 'emma@pelda.hu' })
await valtozas(p)
const popup = p.locator('dialog[aria-label="Online foglalási kérés"]')
await popup.waitFor({ timeout: 10000 })
ok('a kérés ablaka szól, hogy élesben e-mail megy a foglalási oldal linkjével', true,
  (await popup.locator('.keres-tipp').first().innerText()).includes('visszaigazoló e-mailt kap, benne a foglalási oldala linkjével'))
await kep(p, '12-keres-ablak.png')
await popup.getByRole('button', { name: 'Elfogadom' }).click(); await p.waitForTimeout(2000)
ok('demóban elfogadás után bezárul', 0, await popup.count())

ok('az admin oldalon nincs JS hiba', [], adminHibak)

await admin.close()
await b.close()
await db.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
