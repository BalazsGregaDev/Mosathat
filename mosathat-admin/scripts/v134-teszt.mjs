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
const BP = { timezoneId: 'Europe/Budapest', locale: 'hu-HU' }

async function mintaKepek() {
  const ctx = await b.newContext({ viewport: { width: 600, height: 400 } })
  const p = await ctx.newPage()
  const ki = []
  for (const [a, c] of [['#1f4d35', '#a6d9b6'], ['#2b2f3a', '#d9c6a6']]) {
    await p.setContent(`<body style="margin:0"><div style="width:600px;height:400px;background:linear-gradient(135deg,${a},${c});display:grid;place-items:center;font:700 64px sans-serif;color:#fff">MOSATHAT</div></body>`)
    ki.push(await p.screenshot({ type: 'png' }))
  }
  await ctx.close()
  return ki
}

const helyi = (p, napok, ora = 8) => p.evaluate(([n, o]) => {
  const d = new Date(Date.now() + n * 864e5)
  d.setHours(o, 0, 0, 0)
  const k = (x) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${k(d.getMonth() + 1)}-${k(d.getDate())}T${k(d.getHours())}:${k(d.getMinutes())}`
}, [napok, ora])

async function idopont(p, mezo, napok, ora) {
  const [nap, ido] = (await helyi(p, napok, ora)).split('T')
  await p.locator(`[data-mezo="${mezo}-nap"]`).fill(nap)
  await p.locator(`[data-mezo="${mezo}-ora"]`).click()
  const panel = p.locator('.ido-ablak')
  await panel.getByRole('button', { name: ido.slice(0, 2), exact: true }).click()
  await panel.getByRole('button', { name: `:${ido.slice(3, 5)}`, exact: true }).click()
  await p.waitForTimeout(200)
}

async function menube(p, cimke) {
  await p.locator('aside.oldalsav .menu button').filter({ hasText: new RegExp(`^${cimke}$`) }).click()
  await p.waitForTimeout(1500)
}

const sorok = (p) => p.locator('.bej-idozites').evaluateAll((l) => l.map((d) => ({
  nev: d.querySelector('.bej-idozites-nev')?.textContent?.trim(),
  allapot: d.querySelector('.bej-allapot')?.textContent?.trim(),
  nyitva: d.open,
})))
const nyitottDb = (p) => p.locator('details.bej-idozites[open]').count()
const mentes = (p) => p.locator('.bej-idozites[open] .bej-idozites-gombok .btn-fo')

console.log('=== 1) Felugró ablakok időzítése ===\n')
{
  const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba, kontextus: BP })
  await belep('tulaj@mosathat.hu')
  await menube(p, 'Felugró ablak')
  ok('üres lista, és jelzi, hogy most semmi nem látszik', [0, true],
    [await p.locator('.bej-idozites').count(), await p.getByText('Most egyik sem látszik a publikus oldalon.').isVisible()])

  await p.getByRole('button', { name: '+ Új felugró ablak' }).click()
  await p.waitForTimeout(300)
  ok('új elem nyílik, előnézettel', [1, 1], [await nyitottDb(p), await p.locator('.bej-elonezet .kv-felugro-doboz').count()])
  await p.locator('[data-mezo="kezdes-ora"]').click()
  await p.waitForTimeout(300)
  const panel = p.locator('.ido-ablak')
  ok('saját időválasztó nyílik (nem a gyári), 0 és 23 óra között, csak negyedórás percekkel', [['00', '23', 24], [':00', ':15', ':30', ':45'], 0],
    [[(await panel.locator('.ido-orak button').first().innerText()).trim(), (await panel.locator('.ido-orak button').last().innerText()).trim(), await panel.locator('.ido-orak button').count()], (await panel.locator('.ido-percek button').allInnerTexts()).map((x) => x.trim()),
      await p.locator('.bej-idozites input[type="time"], .bej-idozites input[type="datetime-local"]').count()])
  await kep(p, '01a-sajat-idovalaszto')
  await panel.getByRole('button', { name: 'Kész' }).click()
  await p.locator('[data-mezo="zaras-nap"]').fill((await helyi(p, 3, 8)).slice(0, 10))
  await p.waitForTimeout(200)
  ok('csak dátumot választva a zárás 23:45-re áll', '23:45', (await p.locator('[data-mezo="zaras-ora"]').innerText()).trim())
  await p.locator('.bej-idozites[open]').getByRole('button', { name: 'Visszavonásig' }).click()
  ok('a Visszavonásig gomb törli a zárást', 'óra', (await p.locator('[data-mezo="zaras-ora"]').innerText()).trim())
  await p.locator('[data-mezo="cim"]').fill('Karácsonyi nyitvatartás')
  await p.locator('[data-mezo="szoveg"]').fill('December 24–26. között zárva tartunk.')
  await idopont(p, 'kezdes', 10, 8)
  await idopont(p, 'zaras', 14, 18)
  await p.waitForTimeout(300)
  ok('az előnézet a nyitott elemet mutatja', 'Karácsonyi nyitvatartás', (await p.locator('.bej-elonezet .kv-felugro-doboz h2').innerText()).trim())
  await kep(p, '01-uj-idozitett-felugro')
  await mentes(p).click()
  await p.waitForTimeout(1200)
  ok('elmentve, „Időzítve” állapotban', [{ nev: 'Karácsonyi nyitvatartás', allapot: 'Időzítve', nyitva: true }], await sorok(p))

  await p.getByRole('button', { name: '+ Új felugró ablak' }).click()
  await p.waitForTimeout(300)
  ok('egyszerre csak egy elem van nyitva', 1, await nyitottDb(p))
  await p.locator('[data-mezo="cim"]').fill('Szilveszter')
  await p.locator('[data-mezo="szoveg"]').fill('Dec. 31-én csak délelőtt vagyunk nyitva.')
  await idopont(p, 'kezdes', 12, 8)
  await idopont(p, 'zaras', 20, 18)
  await p.waitForTimeout(300)
  ok('átfedő időszaknál figyelmeztet, és nem menthető', [true, true],
    [(await p.locator('.bej-utkozes').innerText()).includes('Karácsonyi nyitvatartás'), await mentes(p).isDisabled()])
  await kep(p, '02-utkozes')
  await idopont(p, 'kezdes', 14, 18)
  await p.waitForTimeout(300)
  ok('ha pont a másik zárásakor indul, mehet', [0, false], [await p.locator('.bej-utkozes').count(), await mentes(p).isDisabled()])
  await mentes(p).click()
  await p.waitForTimeout(1200)

  await p.getByRole('button', { name: '+ Új felugró ablak' }).click()
  await p.locator('[data-mezo="cim"]').fill('Új szolgáltatás')
  await p.locator('[data-mezo="szoveg"]').fill('Mostantól kerámia bevonatot is vállalunk.')
  await idopont(p, 'zaras', 9, 18)
  await mentes(p).click()
  await p.waitForTimeout(1200)
  ok('a lista állapot és idő szerint rendezett, a mostani elöl', [
    { nev: 'Új szolgáltatás', allapot: 'Most látszik', nyitva: true },
    { nev: 'Karácsonyi nyitvatartás', allapot: 'Időzítve', nyitva: false },
    { nev: 'Szilveszter', allapot: 'Időzítve', nyitva: false },
  ], await sorok(p))
  ok('felül kiírja, mi látszik most', true, (await p.locator('.bej-most').innerText()).includes('Most látszik: Új szolgáltatás'))
  await kep(p, '03-harom-idozites')

  await p.locator('.bej-idozites summary').filter({ hasText: 'Karácsonyi' }).click()
  await p.waitForTimeout(300)
  ok('másikat megnyitva az előző bezárul', [1, 'Karácsonyi nyitvatartás'],
    [await nyitottDb(p), (await p.locator('details.bej-idozites[open] .bej-idozites-nev').innerText()).trim()])
  await p.locator('[data-mezo="szoveg"]').fill('Módosított, nem mentett szöveg')
  await p.locator('.bej-idozites summary').filter({ hasText: 'Szilveszter' }).click()
  await p.waitForTimeout(300)
  ok('nem mentett módosításnál rákérdez', 1, await p.locator('.kerdes-ablak').count())
  await kep(p, '04-nem-mentett-kerdes')
  await p.locator('.kerdes-ablak').getByRole('button', { name: 'Maradok' }).click()
  await p.waitForTimeout(200)
  ok('„Maradok”: a módosítás megmarad', 'Módosított, nem mentett szöveg', await p.locator('[data-mezo="szoveg"]').inputValue())
  await p.locator('.bej-idozites summary').filter({ hasText: 'Szilveszter' }).click()
  await p.locator('.kerdes-ablak').getByRole('button', { name: 'Elvetem' }).click()
  await p.waitForTimeout(300)
  ok('„Elvetem”: átvált a másikra', 'Szilveszter', (await p.locator('details.bej-idozites[open] .bej-idozites-nev').innerText()).trim())
  const [{ x }] = await sql(`select string_agg(szoveg, '|' order by kezdes nulls first) x from public.oldal_bejelentesek where tipus = 'FELUGRO'`)
  ok('az elvetett szöveg nem került az adatbázisba', false, x.includes('Módosított'))

  await p.locator('.bej-idozites[open]').getByRole('button', { name: 'Törlés' }).click()
  await p.locator('.kerdes-ablak').getByRole('button', { name: 'Törlés' }).click()
  await p.waitForTimeout(1200)
  ok('törlés után két elem marad, és mind zárva', [2, 0], [await p.locator('.bej-idozites').count(), await nyitottDb(p)])
  await ctx.close()
}

console.log('\n=== 2) Egyedi szekciók időzítése ===\n')
{
  const kepek = await mintaKepek()
  const { ctx, p, sql, belep } = await adminOldal(b, { hiba: jsHiba, kontextus: BP })
  await belep('tulaj@mosathat.hu')
  await menube(p, 'Egyedi szekció')
  await p.getByRole('button', { name: '+ Új egyedi szekció' }).click()
  await p.locator('[data-mezo="szoveg"]').fill('Novemberi akció: *20% kedvezmény* a belső takarításra.')
  await p.locator('[data-mezo="kep-fajl"]').setInputFiles(kepek.map((buffer, i) => ({ name: `k${i}.png`, mimeType: 'image/png', buffer })))
  await p.waitForTimeout(2500)
  await p.locator('[data-mezo="igazitas"] button').filter({ hasText: 'Balra' }).click()
  await idopont(p, 'zaras', 5, 18)
  await p.waitForTimeout(300)
  ok('két kép, az előnézetben is, balra igazítva', [2, 2, 'bal'],
    [await p.locator('.bej-kep img').count(), await p.locator('.bej-elonezet .kv-egyedi img').count(), await p.locator('.bej-elonezet .kv-egyedi').getAttribute('data-igazitas')])
  await kep(p, '05-egyedi-uj')
  await mentes(p).click()
  await p.waitForTimeout(1500)
  await p.getByRole('button', { name: '+ Új egyedi szekció' }).click()
  await p.locator('[data-mezo="szoveg"]').fill('Decemberben ajándékutalvány is kapható.')
  await idopont(p, 'kezdes', 5, 18)
  await mentes(p).click()
  await p.waitForTimeout(1500)
  ok('két szekció: a mostani és az utána induló', [
    { nev: 'Novemberi akció: 20% kedvezmény a belső takarításra.', allapot: 'Most látszik', nyitva: false },
    { nev: 'Decemberben ajándékutalvány is kapható.', allapot: 'Időzítve', nyitva: true },
  ], await sorok(p))
  await p.locator('.bej-elonezet').getByRole('button', { name: 'Telefon' }).click()
  await p.waitForTimeout(600)
  await kep(p, '06-egyedi-ket-idozites')
  const [{ n }] = await sql(`select count(*)::int n from public.oldal_bejelentesek where tipus = 'EGYEDI'`)
  ok('mindkettő az adatbázisban', 2, n)
  await ctx.close()
}

console.log('\n=== 3) A publikus oldal mindig az aktuálisat mutatja ===\n')
const beallit = `
  insert into public.oldal_bejelentesek (tipus, aktiv, kezdes, zaras, cim, szoveg) values
    ('FELUGRO', true, null, now() + interval '2 days', 'Most érvényes', 'Ez látszik most.'),
    ('FELUGRO', true, now() + interval '3 days', now() + interval '6 days', 'Később', 'Ez majd később.'),
    ('FELUGRO', true, now() - interval '9 days', now() - interval '4 days', 'Régi', 'Ez már lejárt.'),
    ('EGYEDI', true, now() + interval '1 day', null, '', 'Jövőbeli szekció'),
    ('EGYEDI', true, now() - interval '1 day', now() + interval '1 day', '', 'Mai szekció');
`
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, ...BP })
  await ctx.route(/demo_adatok\.sql/, async (r) => {
    const v = await r.fetch()
    const body = await v.text()
    await r.fulfill({ response: v, body: body.replace('export default "', `export default ${JSON.stringify(beallit)} + "`) })
  })
  const p = await ctx.newPage()
  p.on('pageerror', jsHiba)
  await hetkoznapra(p)
  await p.route(/google\.com\/maps/, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<p>térkép</p>' }))
  await p.goto(CIM + '/publikus')
  await p.locator('.kv-hero').first().waitFor({ timeout: 90000 })
  await p.waitForTimeout(1500)
  ok('az éppen érvényes felugró jelenik meg', 'Most érvényes', (await p.locator('dialog.kv-felugro h2').innerText()).trim())
  await kep(p, '07-publikus-aktualis-felugro')
  await p.locator('dialog.kv-felugro .kv-felugro-ok').click()
  ok('az éppen érvényes egyedi szekció jelenik meg', 'Mai szekció', (await p.locator('.kv-egyedi-szoveg').innerText()).trim())
  await ctx.close()
}

await b.close()
console.log(baj ? `\n${baj} HIBA` : '\nMinden rendben.')
process.exit(baj ? 1 : 0)
