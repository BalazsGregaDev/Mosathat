// v54: többnapos (vagy napon átnyúló) autó a napi kártyán:
//   „Tegnap – Holnap 11:00", „Csütörtök – Ma 17:00", „Ma 16:00 – Péntek 11:00"
// 1. a relativNap() szabályai (gyors, böngésző nélkül)
// 2. a napi kártyák a böngészőben
import { build } from 'esbuild'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}

console.log('=== 1) relativNap ===\n')
const dir = await mkdtemp(join(tmpdir(), 'v54-'))
await build({ entryPoints: ['src/lib/format.ts'], outfile: join(dir, 'format.mjs'), format: 'esm', bundle: true, logLevel: 'error' })
const { relativNap } = await import(join(dir, 'format.mjs'))
const ma = '2026-10-07'   // szerda
ok('ma', 'Ma', relativNap('2026-10-07', ma))
ok('tegnap', 'Tegnap', relativNap('2026-10-06', ma))
ok('holnap', 'Holnap', relativNap('2026-10-08', ma))
ok('két napja: a nap neve', 'Hétfő', relativNap('2026-10-05', ma))
ok('múlt csütörtök (6 napja)', 'Csütörtök', relativNap('2026-10-01', ma))
ok('péntek (2 nap múlva)', 'Péntek', relativNap('2026-10-09', ma))
ok('egy héten túl: dátum', 'okt. 15.', relativNap('2026-10-15', ma))

console.log('\n=== 2) a napi kártyák ===\n')
const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'x')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(2500)
await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).first().click()
await p.waitForTimeout(1500)

const ido = async (rsz) => (await p.locator('.napi-lista .kartya')
  .filter({ has: p.locator('.rendszam', { hasText: rsz }) }).first().locator('.ido').innerText()).trim()
const NAP = '(Tegnap|Ma|Holnap|Hétfő|Kedd|Szerda|Csütörtök|Péntek|Szombat|Vasárnap)'
// A demóban: KER-214 tegnap jött, két nap múlva megy; KER-100 három napja jött, holnap megy
ok('KER-214: „Tegnap – <nap> 17:00"', true, new RegExp(`^Tegnap – ${NAP} \\d\\d:\\d\\d$`).test(await ido('KER-214')))
ok('KER-100: „<nap> – Holnap 17:00"', true, new RegExp(`^${NAP} – Holnap \\d\\d:\\d\\d$`).test(await ido('KER-100')))
ok('egynapos marad: „08:00 – 10:00"', true, /^\d\d:\d\d – \d\d:\d\d$/.test(await ido('ABC-123')))
console.log(`         KER-214: ${await ido('KER-214')} · KER-100: ${await ido('KER-100')}`)

// v57: a nézett naphoz képest. Holnap (a KER-100 utolsó napja) nézve: „… – Ma 17:00"
await p.locator('.napvalto .nyil').last().click(); await p.waitForTimeout(1500)
ok('holnapot nézve: a holnap a „Ma"', true, /– Ma \d\d:\d\d$/.test(await ido('KER-100')))

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
