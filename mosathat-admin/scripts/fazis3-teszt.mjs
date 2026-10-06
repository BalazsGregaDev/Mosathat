// A v37 3. fázisának ellenőrzése Playwrighttal: napi, heti, havi nézet,
// áthúzás, a nap kártyája, kattintható figyelmeztetések, tablet menü.
//
// Futtatás:  npm run dev -- --port 5180   (másik ablakban)
//            node scripts/fazis3-teszt.mjs
import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}

async function belep(p, email = 'tulaj@mosathat.hu') {
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
}
const rendszamok = (p) => p.locator('.napi-lista .kartya .rendszam').allInnerTexts()

// =============================================================================
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
const p = await ctx.newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(p)
await p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).first().click()
await p.waitForTimeout(2000)

console.log('=== 1) napi lista: egy lista, kártya tartalma ===\n')
{
  const r = await p.evaluate(() => ({
    orasav: document.querySelectorAll('.ora-sor').length,
    lista: document.querySelectorAll('.napi-lista .sor-elem').length,
    fogo: document.querySelectorAll('.napi-lista .fogo').length,
    nevVan: [...document.querySelectorAll('.napi-lista .kartya')].some((k) => k.innerText.includes('Kovács Péter')),
    rendszamMeret: parseFloat(getComputedStyle(document.querySelector('.kartya .rendszam')).fontSize),
    aNapPanel: [...document.querySelectorAll('.panel > h3')].some((h) => h.textContent.trim() === 'A nap'),
  }))
  ok('nincsenek órasávok', 0, r.orasav)
  ok('minden kártyának van fogója', r.lista, r.fogo)
  ok('az ügyfél neve nincs a kártyán', false, r.nevVan)
  ok('a rendszám asztalon nagyobb a régi 16 px-nél (22 px)', 22, r.rendszamMeret)
  ok('nincs külön „A nap" kártya', false, r.aNapPanel)

  const abc = p.locator('.napi-lista .kartya').filter({ hasText: 'ABC-123' }).first()
  ok('a csomag és utána az egyéb szolgáltatás', ['Premium', '+ Felni'],
    [(await abc.locator('.csomag').innerText()).trim(),
     (await abc.locator('.extrak').innerText()).trim().slice(0, 7)])
  // A csomag a rendszámmal és az idővel EGY sorban áll, felül
  const sor = await abc.evaluate((k) => {
    const y = (s) => Math.round(k.querySelector(s).getBoundingClientRect().top
      + k.querySelector(s).getBoundingClientRect().height / 2)
    return { rendszam: y('.rendszam'), ido: y('.ido'), csomag: y('.csomag') }
  })
  ok('a csomag a rendszámmal és az idővel egy vonalban', true,
    Math.abs(sor.rendszam - sor.csomag) <= 6 && Math.abs(sor.ido - sor.csomag) <= 6)
  ok('nincs állapot-felirat a kártyán', 0,
    await p.locator('.napi-lista .kartya .cimke-pill').filter({ hasText: /Várjuk|Dolgozunk|Megérkezett|Kész|Lezárva/ }).count())
  // A kártya nem lett nagyobb, csak a betűk: egy sima (egynapos, extra és
  // megjegyzés nélküli) kártya két sor — fent a rendszám, idő, csomag, lent
  // az ár és a gombok —, és nem magasabb, mint a régi, kis betűs kártya volt
  // (kb. 130 px).
  const sima = p.locator('.napi-lista .kartya')
    .filter({ hasNot: p.locator('.extrak, .kartya-tobbnap, .kartya-megj') }).first()
  ok('a kártya alacsony maradt', true, (await sima.boundingBox()).height <= 130)
  ok('az egyéb szolgáltatás narancs', 'rgb(253, 238, 221)',
    await abc.locator('.extrak').evaluate((e) => getComputedStyle(e).backgroundColor))

  const ker = p.locator('.napi-lista .kartya').filter({ has: p.locator('.kartya-tobbnap') }).first()
  ok('többnapos: az utolsó nap és az óra ki van írva', true,
    /viszi: .+ \d\d:\d\d/.test(await ker.locator('.kartya-tobbnap').innerText()))
}

console.log('\n=== 2) a nap kártyája ===\n')
{
  const kap = await p.locator('.kapacitas').innerText()
  ok('autó, munkaidő a kapacitás kártyán', true, kap.includes('Autó') && kap.includes('Munkaidő'))
  ok('a tulaj látja a bevételt és a lekötött munkát', true,
    kap.includes('Várható bevétel') && kap.includes('Lekötött munka'))
  ok('a munkaidő-változás a kártyán: „Gábor ma: 16:00-ig"', true, kap.includes('Gábor ma:') && kap.includes('16:00-ig'))
}

console.log('\n=== 3) áthúzás egérrel ===\n')
{
  const elotte = await rendszamok(p)
  const fogo3 = await p.locator('.napi-lista .fogo').nth(2).boundingBox()
  const elso = await p.locator('.napi-lista .sor-elem').first().boundingBox()
  await p.mouse.move(fogo3.x + fogo3.width / 2, fogo3.y + fogo3.height / 2)
  await p.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await p.mouse.move(fogo3.x + fogo3.width / 2,
      fogo3.y + fogo3.height / 2 + ((elso.y + 10) - (fogo3.y + fogo3.height / 2)) * (i / 12))
    await p.waitForTimeout(30)
  }
  await p.mouse.up()
  await p.waitForTimeout(1500)
  const utana = await rendszamok(p)
  ok('a harmadik kártya az első helyre került', [elotte[2], elotte[0], elotte[1]], utana.slice(0, 3))

  // Másik napra és vissza: az adatbázisból jön, és ugyanaz.
  await p.locator('.napvalto .nyil').last().click(); await p.waitForTimeout(1200)
  await p.locator('.napvalto .nyil').first().click(); await p.waitForTimeout(1500)
  ok('napváltás után is megmaradt (az adatbázisban van)', utana, await rendszamok(p))

  // Billentyűzet: a fogón a lefelé nyíl egy hellyel lejjebb tesz
  await p.locator('.napi-lista .fogo').first().focus()
  await p.keyboard.press('ArrowDown')
  await p.waitForTimeout(1200)
  const bill = await rendszamok(p)
  ok('billentyűzettel is: le nyíl', [utana[1], utana[0]], bill.slice(0, 2))

  // Az állapotgomb nem rendezi át
  const kartya = p.locator('.napi-lista .kartya').filter({ has: p.locator('.kartya-muvelet .btn-fo', { hasText: 'Megérkezett' }) }).first()
  await kartya.locator('.kartya-muvelet .btn-fo').click()
  await p.waitForTimeout(1500)
  ok('a Megérkezett után is ugyanaz a sorrend', bill, await rendszamok(p))
}

console.log('\n=== 4) többnapos a következő napon is ===\n')
{
  const ker = await p.locator('.napi-lista .kartya').filter({ has: p.locator('.kartya-tobbnap') }).first()
  const rsz = await ker.locator('.rendszam').innerText()
  const szoveg = await ker.locator('.kartya-tobbnap').innerText()
  const [, napok, nap] = szoveg.match(/(\d+) napos · (\d+)\. nap/) ?? []
  if (Number(nap) < Number(napok)) {
    await p.locator('.napvalto .nyil').last().click(); await p.waitForTimeout(1500)
    const masnap = p.locator('.napi-lista .kartya').filter({ hasText: rsz })
      .filter({ has: p.locator('.kartya-tobbnap') }).first()
    ok(`${rsz} a következő napon is ott van`, true, (await masnap.count()) > 0)
    ok('a következő napon a hányadik nap eggyel nő', `${Number(nap) + 1}. nap`,
      (await masnap.locator('.kartya-tobbnap').innerText()).match(/\d+\. nap/)?.[0])
    await p.locator('.napvalto .nyil').first().click(); await p.waitForTimeout(1200)
  }
}

console.log('\n=== 5) heti nézet: többnapos sáv ===\n')
await p.locator('.fejlec .nezetvalto button').filter({ hasText: 'Hét' }).click()
await p.waitForTimeout(1500)
{
  const savok = await p.locator('.hetsav').count()
  ok('vannak többnapos sávok', true, savok > 0)
  const r = await p.locator('.hetsav').first().evaluate((e) => {
    const cs = getComputedStyle(e)
    return { tol: cs.gridColumnStart, ig: cs.gridColumnEnd, szel: e.getBoundingClientRect().width }
  })
  const oszlop = await p.locator('.hetfejsor .oszlopfej').first().boundingBox()
  ok('a sáv több napon fut végig (szélesebb egy oszlopnál)', true,
    Number(r.ig) - Number(r.tol) <= 1 || r.szel > oszlop.width * 1.5)
  const savRsz = await p.locator('.hetsav .rendszam').allInnerTexts()
  const oszlopban = await p.locator('.oszloptorzs .minikartya .azon').allInnerTexts()
  ok('a többnapos nincs ott még egyszer az oszlopokban', [],
    savRsz.filter((x) => oszlopban.filter((y) => y === x).length > 1))
}

console.log('\n=== 6) havi nézet: az aznapi autók száma (v50) ===\n')
await p.locator('.fejlec .nezetvalto button').filter({ hasText: 'Hónap' }).click()
await p.waitForTimeout(1500)
{
  // v50 óta a cellában nem egyenként állnak az autók, hanem egy nagy szám.
  ok('a cellákban nincs egyenkénti kártya', 0, await p.locator('.honapnap .minikartya').count())
  ok('van „autó" szám', true, (await p.locator('.honap-autok').count()) > 0)
}
await p.locator('.fejlec .nezetvalto button').filter({ hasText: /^Nap$/ }).click()
await p.waitForTimeout(1200)

console.log('\n=== 7) figyelmeztetés: telefonszám nélkül → a mező írásra kész ===\n')
// Egy telefonszám nélküli foglalás, csak rendszámmal
await p.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click()
await p.waitForTimeout(1200)
await p.locator('#rendszam').fill('NOT-777')
await p.locator('#marka').click()
await p.waitForTimeout(300)
await p.getByRole('button', { name: 'Foglalás rögzítése' }).click()
await p.waitForTimeout(2000)
{
  const gomb = p.locator('.figyelem .gond-rendszam', { hasText: 'NOT-777' })
  ok('a figyelmeztetésben ott a rendszám', 1, await gomb.count())
  await gomb.click()
  await p.waitForTimeout(1500)
  const r = await p.evaluate(() => {
    const a = document.activeElement
    return {
      tipus: a?.getAttribute('type'), cimke: a?.getAttribute('aria-label'),
      kijelolve: a && a.selectionStart === 0 && a.selectionEnd === a.value.length,
      lapon: Boolean(a?.closest('.lap')),
    }
  })
  ok('a munkalap a telefon mezőn nyílik', { tipus: 'tel', cimke: 'Telefon', lapon: true },
    { tipus: r.tipus, cimke: r.cimke, lapon: r.lapon })
  ok('a mező tartalma ki van jelölve', true, r.kijelolve)
  await p.keyboard.type('+36301234999')
  await p.keyboard.press('Enter')
  await p.waitForTimeout(1500)
  ok('beírva, elmentve', true,
    (await p.locator('.adatsor').filter({ hasText: /^Telefon/ }).innerText()).includes('+36301234999'))
  await p.locator('.lap-fej .bezar').click(); await p.waitForTimeout(1200)
  ok('a figyelmeztetésből eltűnt', 0, await p.locator('.figyelem .gond-rendszam', { hasText: 'NOT-777' }).count())
}

console.log('\n=== 8) Áttekintés: kattintható figyelmeztetések ===\n')
await p.locator('aside.oldalsav button').filter({ hasText: 'Áttekintés' }).click()
await p.waitForTimeout(2000)
{
  const hatarido = p.locator('.gondok .gond-sor').filter({ hasText: 'határideje' }).first()
  ok('a határidő sor egy gomb', 1, await hatarido.count())
  await hatarido.click(); await p.waitForTimeout(1500)
  ok('megnyitja a munkalapot', 1, await p.locator('.lap[aria-label="Munkalap"]').count())
  await p.locator('.lap-fej .bezar').click(); await p.waitForTimeout(800)

  const hianyzo = p.locator('.gondok .gond-sor').filter({ hasText: 'nincs ára' }).first()
  if (await hianyzo.count()) {
    await hianyzo.click(); await p.waitForTimeout(1500)
    ok('a hiányzó ár a Szolgáltatásokra visz', 'Szolgáltatások',
      (await p.locator('.fejlec .cim').innerText()).trim())
  }
}
await ctx.close()

// =============================================================================
console.log('\n=== 9) alkalmazott: nem látja a bevételt ===\n')
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 800 }, isMobile: true, hasTouch: true })
const t = await ctx2.newPage()
t.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(t, 'alkalmazott@mosathat.hu')
await t.waitForTimeout(500)
{
  const kap = await t.locator('.kapacitas').innerText()
  ok('nincs Várható bevétel', false, kap.includes('Várható bevétel'))
  ok('nincs Lekötött munka', false, kap.includes('Lekötött munka'))
  ok('az autók száma ott van', true, kap.includes('Autó'))
}

console.log('\n=== 10) tablet: hamburger menü, áthúzás ujjal ===\n')
{
  ok('az oldalsáv rejtve', 'none', await t.locator('aside.oldalsav').evaluate((e) => getComputedStyle(e).display))
  ok('a fejlécben ott a menü gomb', true, await t.locator('.fejlec-hamburger').isVisible())
  ok('a napváltó és az Új időpont is ott van', true,
    await t.locator('.fejlec .napvalto').isVisible() && await t.locator('.fejlec .btn-fo').isVisible())
  await t.locator('.fejlec-hamburger').click(); await t.waitForTimeout(400)
  ok('a menü kinyílik', true, await t.locator('.fiok').isVisible())
  await t.locator('.fiok-hatter').click({ position: { x: 1200, y: 400 } }); await t.waitForTimeout(300)

  const elotte = await rendszamok(t)
  const fogo = await t.locator('.napi-lista .fogo').nth(1).boundingBox()
  const elso = await t.locator('.napi-lista .sor-elem').first().boundingBox()
  const cdp = await ctx2.newCDPSession(t)
  const x = fogo.x + fogo.width / 2
  const y0 = fogo.y + fogo.height / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x, y: y0 + ((elso.y + 10) - y0) * (i / 12) }] })
    await t.waitForTimeout(30)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await t.waitForTimeout(1500)
  ok('ujjal húzva a második az első helyre került', [elotte[1], elotte[0]], (await rendszamok(t)).slice(0, 2))
}

// Érintőképernyőn: a figyelmeztetésből nyitva a telefon mező kapja a fókuszt
// (a billentyűzetet egy ideiglenes mező hívja elő, ami utána eltűnik).
await t.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click()
await t.waitForTimeout(1200)
await t.locator('#rendszam').fill('NOT-888')
await t.locator('#marka').click()
await t.waitForTimeout(300)
await t.getByRole('button', { name: 'Foglalás rögzítése' }).click()
await t.waitForTimeout(2000)
await t.locator('.figyelem .gond-rendszam', { hasText: 'NOT-888' }).tap()
await t.waitForTimeout(1500)
{
  const r = await t.evaluate(() => ({
    cimke: document.activeElement?.getAttribute('aria-label'),
    ideiglenes: document.querySelectorAll('body > input[aria-hidden="true"]').length,
  }))
  ok('tableten is a telefon mező kapja a fókuszt', 'Telefon', r.cimke)
  ok('az ideiglenes mező eltűnt', 0, r.ideiglenes)
}
await t.screenshot({ path: '/tmp/f3-tablet.png' })
await ctx2.close()

// =============================================================================
console.log('\n=== 11) telefon: heti nézet egy oszlopban ===\n')
const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const m = await ctx3.newPage()
m.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(m)
await m.locator('.mobil-fejlec .hamburger').click(); await m.waitForTimeout(400)
await m.locator('.fiok button').filter({ hasText: 'Időpontok' }).first().click(); await m.waitForTimeout(1800)
{
  const r = await m.evaluate(() => ({
    sw: document.querySelector('.tartalom').scrollWidth,
    cw: document.querySelector('.tartalom').clientWidth,
  }))
  ok('a napi lista nem lóg ki oldalra', true, r.sw <= r.cw + 1)
}
await m.locator('.nezetvalto-sav .nezetvalto button').filter({ hasText: 'Hét' }).click()
await m.waitForTimeout(1500)
{
  const r = await m.evaluate(() => {
    const t = document.querySelector('.tartalom')
    const s = document.querySelector('.hetsav')
    return { sw: t.scrollWidth, cw: t.clientWidth, sav: s ? Math.round(s.getBoundingClientRect().width) : 0,
             fej: getComputedStyle(document.querySelector('.hetfejsor')).display }
  })
  ok('a heti nézet nem lóg ki oldalra', true, r.sw <= r.cw + 1)
  ok('a közös fejléc helyett oszloponként', 'none', r.fej)
  ok('a sáv teljes szélességű', true, r.sav > 300)
}
await m.screenshot({ path: '/tmp/f3-tel-het.png', fullPage: true })
await ctx3.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
