// v56: fejlesztői fiók — „Időpontfoglalás" menüpont (a publikus foglalási
// modul próbája) és a „Befér-e?" sor az Új időpont űrlapon.
import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}
async function belep(email) {
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
  return p
}
const menu = (p) => p.locator('aside.oldalsav button')

console.log('=== 1) menüpont: csak a fejlesztőnek ===\n')
const tulaj = await belep('tulaj@mosathat.hu')
ok('a tulajdonosnál nincs Időpontfoglalás', 0, await menu(tulaj).filter({ hasText: 'Időpontfoglalás' }).count())
await menu(tulaj).filter({ hasText: 'Időpontok' }).first().click(); await tulaj.waitForTimeout(1200)
await tulaj.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click()
await tulaj.waitForTimeout(1500)
ok('a tulajdonosnál nincs Befér-e sor', 0, await tulaj.locator('.befer-sor').count())
await tulaj.context().close()

const p = await belep('demo@mosathat.hu')
ok('a fejlesztőnél ott a menüpont', 1, await menu(p).filter({ hasText: 'Időpontfoglalás' }).count())

console.log('\n=== 2) Befér-e az Új időpont űrlapon ===\n')
await menu(p).filter({ hasText: 'Időpontok' }).first().click(); await p.waitForTimeout(1200)
await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click()
await p.waitForTimeout(2500)
const sor = p.locator('.befer-sor')
ok('van Befér-e sor', 1, await sor.count())
ok('befér vagy nem fér be — kiírja', true, /Befér|Nem fér be|zárva/.test(await sor.innerText()))
// egy biztosan szabad nap: a jövő hét szerdája
const szerda = new Date(); szerda.setDate(szerda.getDate() + ((10 - szerda.getDay()) % 7 || 7) + 0)
const sz = `${szerda.getFullYear()}-${String(szerda.getMonth() + 1).padStart(2, '0')}-${String(szerda.getDate()).padStart(2, '0')}`
await p.locator('#datum').fill(sz)
await p.waitForFunction(() => /kész kb\./.test(document.querySelector('.befer-sor')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {})
const fej = (await sor.locator('.befer-fej').textContent()).replace(/\s+/g, ' ').trim()
console.log(`         ${sz}: ${fej}`)
ok(`üres napon (${sz}): Befér, kész kb.`, true, /^Befér — kész kb\. \d+:\d\d/.test(fej))
await p.keyboard.press('Escape'); await p.waitForTimeout(800)

console.log('\n=== 3) Időpontfoglalás modul ===\n')
await menu(p).filter({ hasText: 'Időpontfoglalás' }).click(); await p.waitForTimeout(1500)
const m = p.locator('.fogl')
ok('a próba jelzése', true, (await m.locator('.fogl-proba').innerText()).includes('Előnézet'))
await m.locator('.fogl-valaszto button').filter({ hasText: 'Személyautó' }).click()
await m.locator('.fogl-csomag', { has: p.locator('.nev', { hasText: /^Premium$/ }) }).click(); await p.waitForTimeout(800)
ok('az összegzésben ár', true, /\d Ft/.test(await m.locator('.fogl-osszeg .ar').innerText()))
await m.locator('.fogl-valaszto button').filter({ hasText: 'Itt hagyom' }).click()
await p.waitForTimeout(3500)
const napok = m.locator('.fogl-nap')
const allapotok = await napok.evaluateAll((l) => l.map((e) => e.dataset.allapot))
ok('a naptárban vannak szabad napok', true, allapotok.includes('szabad'))
ok('a vasárnap nincs a naptárban, a zárt nap nem választható', true,
  allapotok.every((a) => ['szabad', 'keves', 'tele', 'zarva', 'korai'].includes(a)))
await napok.and(p.locator('[data-allapot="szabad"]')).first().click(); await p.waitForTimeout(600)
const idok = m.locator('.fogl-idok button')
ok('vannak választható hozási időpontok, „kész kb." idővel', true,
  (await idok.count()) > 0 && /kész kb\./.test(await idok.first().innerText()))
await idok.first().click(); await p.waitForTimeout(300)
ok('a küldés gomb még tiltva (nincsenek adatok)', true, await m.getByRole('button', { name: 'Foglalási kérés küldése' }).isDisabled())
await p.fill('#fo-nev', 'Próba Pál')
await p.fill('#fo-tel', '+36 30 999 8877')
await p.fill('#fo-email', 'pal@pelda.hu')
await p.fill('#fo-rsz', 'prb-123')
ok('a rendszám nagybetűre', 'PRB-123', await p.inputValue('#fo-rsz'))
await m.locator('.fogl-feltetel input').check()
await m.getByRole('button', { name: 'Foglalási kérés küldése' }).click()
await p.waitForTimeout(2000)
ok('köszönő üzenet', true, (await m.locator('.fogl-siker').innerText()).includes('megkaptuk'))

console.log('\n=== 4) a napi nézetben: Online kérés → Visszaigazol ===\n')
await m.getByRole('button', { name: 'Megnézem a napi nézetben' }).click(); await p.waitForTimeout(2500)
const k = p.locator('.napi-lista .kartya').filter({ hasText: 'PRB-123' }).first()
ok('a kártya: Online kérés címke', 1, await k.locator('.cimke-pill[data-r="keres"]').count())
ok('az idővonalon szaggatottan, a helyet foglalja', 1, await p.locator('.iv-darab[data-keres]').filter({ hasText: 'PRB-123' }).count())
ok('gombok: Elutasít és Visszaigazol', [1, 1], [
  await k.getByRole('button', { name: 'Elutasít' }).count(),
  await k.getByRole('button', { name: 'Visszaigazol' }).count()])
await k.getByRole('button', { name: 'Visszaigazol' }).click(); await p.waitForTimeout(1500)
ok('visszaigazolva: rendes foglalás (Megérkezett a következő lépés)', ['CONFIRMED', 0, 1], [
  await k.getAttribute('data-allapot'),
  await k.locator('.cimke-pill[data-r="keres"]').count(),
  await k.getByRole('button', { name: 'Megérkezett' }).count()])

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
