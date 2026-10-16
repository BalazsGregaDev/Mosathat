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
const sima = (s) => s.replace(/\s+/g, ' ').trim()
const CIM = 'http://localhost:5180'

async function oldal(utvonal, viewport = { width: 1440, height: 900 }) {
  const ctx = await b.newContext({ viewport })
  const p = await ctx.newPage()
  const hibak = []
  p.on('pageerror', (e) => hibak.push(e.message.slice(0, 160)))
  await p.goto(CIM + utvonal)
  await p.locator('.kv-jogi h1').waitFor({ timeout: 60000 })
  await p.evaluate(() => document.fonts.ready)
  return { ctx, p, hibak }
}

console.log('=== 1) Adatvédelmi tájékoztató: fejezetek ===\n')
const a = await oldal('/adatvedelem')
const at = sima(await a.p.locator('.kv-jogi').innerText())
const cimek = (await a.p.locator('.kv-jogi-kezeles h3').allTextContents()).map(sima)
ok('az adatkezelések sorrendje és számozása', [
  '2.1 Online időpontfoglalás',
  '2.2 Visszaigazoló e-mail és lemondó link',
  '2.3 Telefonos és személyes foglalás, ügyfél- és járműnyilvántartás',
  '2.4 Kapcsolattartás e-mailben és telefonon',
  '2.5 Céges ügyfelek kapcsolattartói',
  '2.6 Számlázás',
  '2.7 Panaszkezelés',
  '2.8 Kamerás megfigyelés a telephelyen',
  '2.9 A weboldal technikai naplói',
  '2.10 Térkép (Google Térkép)',
], cimek)
ok('a sütiknél a térkép pontjára hivatkozik', true, /betöltöd \(lásd 2\.10 pont\)/.test(at))

console.log('\n=== 2) E-mail és telefon ===\n')
const kap = sima(await a.p.locator('.kv-jogi-kezeles').nth(3).innerText())
ok('hivatalos e-mail cím, hívásrögzítés nincs, kettős jogalap', [true, true, true, true],
  [/info@mosathat\.hu/, /telefonhívásokat nem rögzítjük/, /6\. cikk \(1\) b\)/, /6\. cikk \(1\) f\)/].map((r) => r.test(kap)))

console.log('\n=== 3) Számlázás ===\n')
const szla = sima(await a.p.locator('.kv-jogi-kezeles').nth(5).innerText())
ok('Billingo, NAV online számla, magánszemély neve és címe nem megy a NAV-hoz, Áfa tv.', [true, true, true, true],
  [/Billingo/, /NAV\) online számla rendszerébe/, /magánszemélyként kapod a számlát, a neved és a címed nem kerül/, /2007\. évi CXXVII\. törvény 10\. melléklete/].map((r) => r.test(szla)))

console.log('\n=== 4) Kamerás megfigyelés ===\n')
const kam = sima(await a.p.locator('.kv-jogi-kezeles').nth(7).innerText())
ok('jogos érdek, hang nincs, tiltott helyiségek, jelzés a bejáratnál', [true, true, true, true],
  [/6\. cikk \(1\) f\)/, /hangot nem rögzítünk/, /Mosdóban, öltözőben/, /bejáratnál figyelmeztető jelzés/].map((r) => r.test(kam)))
ok('betekintés, másolat, törlés megakadályozása, munkavállalók külön tájékoztatása', [true, true, true],
  [/GDPR 15\. és 18\. cikk/, /kitakarjuk/, /11\/A\. § \(1\)/].map((r) => r.test(kam)))
ok('hiányzó adat: megőrzési idő és kamerák helye helykitöltővel', [true, true],
  [/megőrzési időt a véglegesítéskor tüntetjük fel/.test(kam), /kamerák pontos helyét .* a véglegesítéskor tüntetjük fel/.test(kam)])
if (KEPEK) await a.p.locator('.kv-jogi-kezeles').nth(7).screenshot({ path: join(KEPEK, 'v79-kamera.png') })

console.log('\n=== 5) Címzettek és EGT-n kívüli továbbítás ===\n')
const sorok = (await a.p.locator('.kv-jogi-tabla tbody tr td:first-child').allTextContents()).map(sima)
ok('adatfeldolgozók', ['Supabase Pte. Ltd.', 'Vercel Inc.', 'Plus Five Five, Inc. (Resend)', 'Billingo Technologies Zrt.', 'WLA Interservice Szolgáltató Kft.', 'Könyvelő (a véglegesítéskor kerül feltüntetésre)'], sorok)
ok('címek', [true, true], [/1133 Budapest, Árbóc utca 6\./.test(at), /1163 Budapest, Kócs utca 7\./.test(at)])
ok('Frankfurt, Supabase, Inc. hozzáférés, SCC', [true, true, true],
  [/frankfurti \(Németország\) adatközpontjában/, /Supabase, Inc\. látja el/, /általános szerződési feltételek \(GDPR 46\. cikk\)/].map((r) => r.test(at)))
ok('NAV és kamerafelvétel átadása a címzetteknél', true, /NAV-hoz kerülnek \(lásd 2\.6 pont\), kamerafelvételt pedig csak a 2\.8 pontban/.test(at))
ok('nincs JS hiba', [], a.hibak)
if (KEPEK) await a.p.screenshot({ path: join(KEPEK, 'v79-adatvedelem.png'), fullPage: true })
await a.ctx.close()

console.log('\n=== 6) Impresszum ===\n')
const i = await oldal('/impresszum')
const it = sima(await i.p.locator('.kv-jogi').innerText())
ok('Supabase adatközpont: Frankfurt', true, /Supabase Pte\. Ltd\..*adatközpont: Frankfurt, Németország/.test(it))
if (KEPEK) await i.p.screenshot({ path: join(KEPEK, 'v79-impresszum.png'), fullPage: true })
await i.ctx.close()

console.log('\n=== 7) Telefonon ===\n')
const t = await oldal('/adatvedelem', { width: 390, height: 844 })
ok('a tájékoztató telefonon sem lóg ki', true, await t.p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
if (KEPEK) await t.p.locator('.kv-jogi-kezeles').nth(7).screenshot({ path: join(KEPEK, 'v79-kamera-telefon.png') })
await t.ctx.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
