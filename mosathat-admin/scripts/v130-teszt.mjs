import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { adminOldal, CIM } from './_publikus.mjs'
import { hetkoznapra } from './_munkanap.mjs'

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

async function mintaKepek() {
  const ctx = await b.newContext({ viewport: { width: 600, height: 400 } })
  const p = await ctx.newPage()
  const ki = []
  for (const [a, c] of [['#1f4d35', '#a6d9b6'], ['#2b2f3a', '#d9c6a6'], ['#4a1f2b', '#f0b8a0']]) {
    await p.setContent(`<body style="margin:0"><div style="width:600px;height:400px;background:linear-gradient(135deg,${a},${c});display:grid;place-items:center;font:700 64px sans-serif;color:#fff">MOSATHAT</div></body>`)
    ki.push(await p.screenshot({ type: 'png' }))
  }
  await ctx.close()
  return ki
}

const egyEgyedi = (sql) => sql(`select x from (select public.bejelentes_adat() x) a`)

async function menube(p, cimke) {
  await p.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${cimke}$`) }).click()
  await p.waitForTimeout(1500)
}

console.log('=== 1) Menü és jogosultság ===\n')
{
  const { ctx, p, belep } = await adminOldal(b, { hiba: jsHiba })
  await belep('alkalmazott@mosathat.hu')
  ok('alkalmazottnak nincs Felugró ablak és Egyedi szekció menü', 0,
    await p.locator('aside.oldalsav .menu button').filter({ hasText: /^(Felugró ablak|Egyedi szekció)$/ }).count())
  await ctx.close()
}

const kepek = await mintaKepek()

console.log('\n=== 2) Felugró ablak beállítása ===\n')
{
  const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  ok('tulajdonosnak megvan a két menüpont', 2,
    await p.locator('aside.oldalsav .menu button').filter({ hasText: /^(Felugró ablak|Egyedi szekció)$/ }).count())
  await menube(p, 'Felugró ablak')
  const minta = p.locator('.bej-elonezet')
  ok('kikapcsolt állapotban jelzi, hogy most nem látszik', true, await p.getByText('Most nem jelenik meg a publikus oldalon.').isVisible())
  ok('az előnézetben ott az X és a Rendben gomb', [1, 'RENDBEN'],
    [await minta.locator('.kv-felugro-x').count(), (await minta.locator('.kv-felugro-ok').innerText()).trim().toUpperCase()])
  await kep(p, '01-felugro-ures')
  await p.locator('[data-mezo="aktiv"]').check()
  ok('üzenet nélkül nem menthető', true, await p.getByRole('button', { name: 'Mentés' }).isDisabled())
  await p.locator('[data-mezo="cim"]').fill('Ünnepi nyitvatartás')
  await p.locator('[data-mezo="szoveg"]').fill('December 24. és 26. között zárva tartunk.\nJanuár 2-tól a megszokott rendben várunk!')
  await p.waitForTimeout(300)
  ok('az előnézet folyamatosan frissül', ['Ünnepi nyitvatartás', true],
    [(await minta.locator('.kv-felugro-doboz h2').innerText()).trim(), (await minta.locator('.kv-felugro-szoveg').innerText()).includes('Január 2-tól')])
  const hatter = await minta.locator('.kv-felugro-ok').evaluate((e) => getComputedStyle(e).backgroundImage)
  ok('a Rendben gomb a zöld lakk gomb kinézetét kapja', true, hatter.includes('gradient'))
  await kep(p, '02-felugro-kitoltve')
  await p.locator('.bej-angol summary').click()
  await p.locator('[data-mezo="cim_en"]').fill('Holiday opening hours')
  await p.locator('[data-mezo="szoveg_en"]').fill('We are closed from 24 to 26 December.')
  await minta.locator('.nyelv-kapcsolo').click()
  await p.waitForTimeout(300)
  ok('angolul Confirm gomb és angol szöveg', ['CONFIRM', 'Holiday opening hours'],
    [(await minta.locator('.kv-felugro-ok').innerText()).trim().toUpperCase(), (await minta.locator('.kv-felugro-doboz h2').innerText()).trim()])
  await kep(p, '03-felugro-angol')
  await p.getByRole('button', { name: 'Mentés' }).click()
  await p.waitForTimeout(1200)
  const [{ x }] = await egyEgyedi(sql)
  ok('elmentve', [true, 'Ünnepi nyitvatartás', 'We are closed from 24 to 26 December.'], [x.felugro.aktiv, x.felugro.cim, x.felugro.szoveg_en])
  ok('mentés után nincs nem mentett változás', false, await p.getByText('Nem mentett változás').isVisible())
  await ctx.close()
}

console.log('\n=== 3) Egyedi szekció beállítása ===\n')
{
  const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba })
  await belep('tulaj@mosathat.hu')
  await menube(p, 'Egyedi szekció')
  const minta = p.locator('.bej-elonezet')
  const szekcio = minta.locator('.kv-egyedi')
  ok('üresen is látszik a minta helye az előnézetben', 1, await szekcio.count())
  const sorrend = () => minta.locator('.kv-hero, .kv-egyedi, .kv-foto').evaluateAll((l) => l.map((e) => e.className.split(' ')[0]))
  ok('helye: nyitó rész után, borítókép előtt', ['kv-hero', 'kv-egyedi', 'kv-foto'], await sorrend())
  await p.locator('[data-mezo="szoveg"]').fill('Új szolgáltatás: *kerámia bevonat*, akár 3 év védelem.')
  await p.locator('[data-mezo="kep-fajl"]').setInputFiles(kepek.map((buffer, i) => ({ name: `kep${i + 1}.png`, mimeType: 'image/png', buffer })))
  await p.waitForTimeout(2500)
  ok('3 kép feltöltve, több nem adható hozzá', [3, 0], [await p.locator('.bej-kep img').count(), await p.locator('.bej-kep-uj').count()])
  ok('az előnézetben 3 kép és a szöveg', [3, true],
    [await szekcio.locator('img').count(), (await szekcio.locator('.kv-egyedi-szoveg').innerText()).includes('kerámia bevonat')])
  const elemek = () => szekcio.locator(':scope > *').evaluateAll((l) => l.map((e) => e.className))
  ok('alapból a képek a szöveg felett, középre', [['kv-egyedi-kepek', 'kv-egyedi-szoveg'], 'kozep'], [await elemek(), await szekcio.getAttribute('data-igazitas')])
  await kep(p, '04-egyedi-felett-kozep')
  await p.locator('[data-mezo="kep_hely"] button').filter({ hasText: 'Szöveg alatt' }).click()
  await p.locator('[data-mezo="igazitas"] button').filter({ hasText: 'Balra' }).click()
  await p.locator('[data-mezo="meret"] button').filter({ hasText: 'Kicsi' }).click()
  await p.waitForTimeout(300)
  ok('alatt + balra + kicsi', [['kv-egyedi-szoveg', 'kv-egyedi-kepek'], 'bal', 'kicsi'],
    [await elemek(), await szekcio.getAttribute('data-igazitas'), await szekcio.getAttribute('data-meret')])
  const szel = await szekcio.locator('img').first().evaluate((e) => Math.round(e.getBoundingClientRect().width / (parseFloat(getComputedStyle(e.closest('.pub-elonezet-lap')).zoom) || 1)))
  ok('kicsi kép kb. 200 px széles', true, szel <= 202 && szel >= 150)
  await kep(p, '05-egyedi-alatt-balra-kicsi')
  await p.locator('[data-mezo="igazitas"] button').filter({ hasText: 'Jobbra' }).click()
  await p.locator('[data-mezo="meret"] button').filter({ hasText: 'Teljes szélesség' }).click()
  await p.locator('[data-mezo="kep_hely"] button').filter({ hasText: 'Szöveg felett' }).click()
  await p.waitForTimeout(300)
  await kep(p, '06-egyedi-felett-jobbra-teljes')
  await p.locator('.bej-kep').nth(2).getByRole('button', { name: '3. kép balra' }).click()
  await p.locator('.bej-kep').nth(0).getByRole('button', { name: '1. kép törlése' }).click()
  await p.waitForTimeout(300)
  ok('törlés után 2 kép, újra adható hozzá', [2, 1, 2], [await p.locator('.bej-kep img').count(), await p.locator('.bej-kep-uj').count(), await szekcio.locator('img').count()])
  await p.locator('[data-mezo="meret"] button').filter({ hasText: 'Közepes' }).click()
  await p.locator('[data-mezo="igazitas"] button').filter({ hasText: 'Középre' }).click()
  await minta.getByRole('button', { name: 'Telefon' }).click()
  await p.waitForTimeout(800)
  ok('telefonos előnézet nem lóg ki', true, await minta.locator('.pub-elonezet-hely').evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
  await kep(p, '07-egyedi-telefon-elonezet')
  await p.locator('[data-mezo="aktiv"]').check()
  await p.getByRole('button', { name: 'Mentés' }).click()
  await p.waitForTimeout(1500)
  const [{ x }] = await egyEgyedi(sql)
  ok('elmentve', [true, 2, 'FELETT', 'KOZEP', 'KOZEPES'], [x.egyedi.aktiv, x.egyedi.kepek.length, x.egyedi.kep_hely, x.egyedi.igazitas, x.egyedi.meret])
  ok('a képek demóban adatként tárolva', true, x.egyedi.kepek.every((k) => k.startsWith('data:image/webp;base64,')))
  await ctx.close()
}

const KEP = `data:image/png;base64,${kepek[0].toString('base64')}`
const KEP2 = `data:image/png;base64,${kepek[1].toString('base64')}`
const beallit = (valtozat, egyedi = true) => `update public.oldal_bejelentes set
  felugro_aktiv = true, felugro_cim = 'Ünnepi nyitvatartás', felugro_szoveg = 'December 24. és 26. között zárva tartunk.',
  felugro_cim_en = 'Holiday opening hours', felugro_szoveg_en = 'We are closed from 24 to 26 December.',
  felugro_valtozat = '${valtozat}'::timestamptz,
  egyedi_aktiv = ${egyedi}, egyedi_szoveg = 'Új szolgáltatás: *kerámia bevonat*, akár 3 év védelem.', egyedi_szoveg_en = 'New: ceramic coating.',
  egyedi_kepek = '${JSON.stringify([KEP, KEP2])}'::jsonb, egyedi_kep_hely = 'FELETT', egyedi_igazitas = 'KOZEP', egyedi_meret = 'KOZEPES';\n`

async function publikus({ viewport = { width: 1440, height: 1000 }, kontextus = {}, ut = '/publikus' } = {}) {
  const ctx = await b.newContext({ viewport, ...kontextus })
  let seed = beallit('2026-11-01 10:00:00+00')
  await ctx.route(/demo_adatok\.sql/, async (r) => {
    const v = await r.fetch()
    const body = await v.text()
    await r.fulfill({ response: v, body: body.replace('export default "', `export default ${JSON.stringify(seed)} + "`) })
  })
  const p = await ctx.newPage()
  p.on('pageerror', jsHiba)
  await hetkoznapra(p)
  await p.route(/google\.com\/maps/, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>térkép</p>' }))
  const nyit = async () => {
    await p.goto(CIM + ut)
    await p.locator('.kv-hero').first().waitFor({ timeout: 90000 })
    await p.waitForTimeout(1200)
  }
  await nyit()
  return { ctx, p, nyit, ujSeed: (s) => { seed = s } }
}

console.log('\n=== 4) Publikus oldal: felugró ablak ===\n')
{
  const { ctx, p, nyit, ujSeed } = await publikus()
  const ablak = p.locator('dialog.kv-felugro')
  ok('megnyitáskor felugrik', true, await ablak.evaluate((d) => d.open))
  ok('van X és Rendben gomb', [1, 'RENDBEN'], [await ablak.locator('.kv-felugro-x').count(), (await ablak.locator('.kv-felugro-ok').innerText()).trim().toUpperCase()])
  ok('a mögötte lévő oldal le van takarva (modális)', true, await p.evaluate(() => document.querySelector('dialog.kv-felugro')?.matches(':modal')))
  await kep(p, '08-publikus-felugro')
  await ablak.locator('.kv-felugro-ok').click()
  await p.waitForTimeout(300)
  ok('Rendbennel bezárul', 0, await p.locator('dialog.kv-felugro').count())
  await nyit()
  ok('újratöltés után nem ugrik fel újra', 0, await p.locator('dialog.kv-felugro').count())
  ujSeed(beallit('2026-11-02 10:00:00+00'))
  await nyit()
  ok('módosított szöveg után újra felugrik', 1, await p.locator('dialog.kv-felugro').count())
  await p.locator('dialog.kv-felugro .kv-felugro-x').click()
  await p.waitForTimeout(300)
  ok('az X is bezárja', 0, await p.locator('dialog.kv-felugro').count())
  ujSeed(beallit('2026-11-03 10:00:00+00'))
  await nyit()
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  ok('az Esc is bezárja', 0, await p.locator('dialog.kv-felugro').count())
  await ctx.close()
}
{
  const { ctx, p } = await publikus({ ut: '/publikus?lang=en' })
  const ablak = p.locator('dialog.kv-felugro')
  ok('angolul Confirm és angol szöveg', ['CONFIRM', 'Holiday opening hours'],
    [(await ablak.locator('.kv-felugro-ok').innerText()).trim().toUpperCase(), (await ablak.locator('h2').innerText()).trim()])
  await kep(p, '09-publikus-felugro-angol')
  await ctx.close()
}

console.log('\n=== 5) Publikus oldal: egyedi szekció ===\n')
{
  const { ctx, p } = await publikus()
  await p.locator('dialog.kv-felugro .kv-felugro-ok').click()
  const sorrend = await p.locator('.kv-hero, .kv-egyedi, .kv-foto').evaluateAll((l) => l.map((e) => e.className.split(' ')[0]))
  ok('a nyitó rész alatt, a borítókép felett', ['kv-hero', 'kv-egyedi', 'kv-foto'], sorrend)
  ok('2 kép és a szöveg (dőlt kiemeléssel)', [2, 'kerámia bevonat'],
    [await p.locator('.kv-egyedi img').count(), (await p.locator('.kv-egyedi-szoveg em').innerText()).trim()])
  await p.locator('.kv-egyedi').scrollIntoViewIfNeeded()
  await kep(p, '10-publikus-egyedi')
  await ctx.close()
}
{
  const { ctx, p } = await publikus({ viewport: { width: 390, height: 844 }, kontextus: { isMobile: true, hasTouch: true } })
  await kep(p, '11-telefon-felugro')
  await p.locator('dialog.kv-felugro .kv-felugro-ok').click()
  await p.locator('.kv-egyedi').scrollIntoViewIfNeeded()
  await p.waitForTimeout(300)
  await kep(p, '12-telefon-egyedi')
  ok('telefonon nem lóg ki', true, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
