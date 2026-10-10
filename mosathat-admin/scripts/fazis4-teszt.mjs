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
async function menu(p, nev) {
  if (await p.locator('.mobil-fejlec .hamburger').isVisible()) {
    await p.locator('.mobil-fejlec .hamburger').click(); await p.waitForTimeout(400)
    await p.locator('.fiok button').filter({ hasText: nev }).first().click()
  } else {
    await p.locator('aside.oldalsav button').filter({ hasText: nev }).first().click()
  }
  await p.waitForTimeout(1500)
}

console.log('=== 1) Profilom (alkalmazott, telefon) ===\n')
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(p, 'alkalmazott@mosathat.hu')
await menu(p, 'Profilom')
{
  ok('van Profilom oldal', 'Profilom', (await p.locator('.oldal-fej h2').innerText()).trim())
  ok('rajta a név', true, (await p.locator('.profil-racs').innerText()).includes('Kis János'))
  await p.getByRole('button', { name: 'Jelszó módosítása' }).first().click()
  await p.waitForTimeout(400)
  ok('a jelszó ablak nyílik', 1, await p.locator('.lap[aria-label="Jelszó megadása"]').count())
  await p.locator('.lap[aria-label="Jelszó megadása"] .bezar').click()
  await p.waitForTimeout(300)

  await p.locator('.valaszto button').filter({ hasText: 'Korábban megy el' }).click()
  await p.locator('#mv-tol').click()
  await p.locator('.ido-ablak .ido-orak button').filter({ hasText: /^15$/ }).click()
  await p.locator('.ido-ablak .ido-percek button').filter({ hasText: ':00' }).click()
  await p.waitForTimeout(200)
  await p.locator('#mv-megj').fill('teszt-korábban')
  await p.getByRole('button', { name: 'Bejelentés' }).click()
  await p.waitForTimeout(1200)
  const lista = await p.locator('.valtozas-lista').first().innerText()
  ok('a listában: 15:00-ig van bent', true, lista.includes('15:00-ig van bent') && lista.includes('teszt-korábban'))
}
await menu(p, 'Időpontok')
{
  const kap = await p.locator('.kapacitas').innerText()
  ok('a napi kártyán: „Kis János ma: 15:00-ig"', true, kap.includes('Kis János ma:') && kap.includes('15:00-ig'))
}
await menu(p, 'Profilom')
{
  await p.locator('.valtozas-lista li').filter({ hasText: 'teszt-korábban' }).getByRole('button', { name: 'Törlés' }).click()
  await p.waitForTimeout(300)
  ok('törlés előtt rákérdez', 'Biztosan törlöd?', await p.locator('.kerdes-ablak h2').innerText())
  await p.locator('.kerdes-gombok button').filter({ hasText: 'Törlés' }).click()
  await p.waitForTimeout(1000)
  ok('törölve', false, (await p.locator('.profil-racs').innerText()).includes('teszt-korábban'))
  await p.locator('.profil-racs').getByRole('button', { name: 'Kilépés' }).click()
  await p.waitForTimeout(1200)
  ok('Kilépés: a belépő képernyő jön', 1, await p.locator('input[type="email"]').count())
}

console.log('\n=== 2) Szerződés űrlap telefonon: a dátum nem lóg ki ===\n')
await belep(p, 'tulaj@mosathat.hu')
await menu(p, 'Cégek és bérletesek')
await p.locator('.fulek button').filter({ hasText: 'Szerződéses cégek' }).click()
await p.waitForTimeout(500)
await p.getByRole('button', { name: '+ Új szerződés' }).click()
await p.waitForTimeout(800)
{
  const r = await p.evaluate(() => {
    const i = document.querySelector('#lej').getBoundingClientRect()
    const l = document.querySelector('.lap-torzs')
    return { jobb: Math.round(i.right), ki: l.getBoundingClientRect().right, sw: l.scrollWidth, cw: l.clientWidth }
  })
  ok('a „Szerződés vége" mező a lapon belül', true, r.jobb <= r.ki)
  ok('a lap nem görgethető oldalra', true, r.sw <= r.cw + 1)
  ok('három csomag választható', ['Start', 'Premium', 'Elit'],
    await p.locator('.lap .valaszto button').allInnerTexts())
  await p.locator('.lap .valaszto button').filter({ hasText: 'Elit' }).click()
  await p.waitForTimeout(300)
  ok('az Elitnél is van Normál és Nagy, Céges és Magán mező', 4,
    await p.locator('.szerz-csomag').filter({ hasText: 'Elit' }).locator('input').count())
}
await p.screenshot({ path: '/tmp/f4-szerzodes-tel.png' })
await ctx.close()

console.log('\n=== 3) Szolgáltatások: Ft és perc egymás mellett, új szolgáltatás ===\n')
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } })
const d = await ctx2.newPage()
d.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
await belep(d)
await menu(d, 'Szolgáltatások')
{
  const sor = d.locator('.szolg-jobb .extrasor').first()
  const [ar, perc] = await sor.locator('.szammezo input').evaluateAll((l) =>
    l.map((e) => Math.round(e.getBoundingClientRect().top)))
  ok('az ár és a perc egy sorban', true, Math.abs(ar - perc) <= 2)

  ok('nincs „Gumiápolás (Külön kerve)"', false,
    (await d.locator('.szolg-jobb').innerText()).includes('Külön'))

  await d.getByRole('button', { name: '+ Új szolgáltatás' }).first().click()
  await d.waitForTimeout(300)
  await d.locator('#uj-extra-nev').fill('Fényszóró polírozás')
  await d.locator('.uj-extra-szamok input').nth(0).fill('9900')
  await d.locator('.uj-extra-szamok input').nth(1).fill('45')
  await d.getByRole('button', { name: 'Felvétel' }).click()
  await d.waitForTimeout(1500)
  ok('az új szolgáltatás a listában', true,
    (await d.locator('.szolg-jobb .extralista').innerText()).includes('Fényszóró polírozás'))

  await menu(d, 'Időpontok')
  await d.locator('.fejlec .btn-fo').filter({ hasText: 'Új időpont' }).click()
  await d.waitForTimeout(1000)
  await d.locator('.osszecsuk').filter({ hasText: 'Egyéb szolgáltatások' }).click()
  await d.waitForTimeout(300)
  ok('az Új időpontnál is választható', 1,
    await d.locator('.extra').filter({ hasText: 'Fényszóró polírozás' }).count())
  await d.locator('.lap-fej .bezar').click()
  await d.waitForTimeout(400)
}

console.log('\n=== 4) Árlista: a leírás egyszer, a cím mellett ===\n')
await d.locator('.fejlec .arlista-gombok button').filter({ hasText: 'Csomagok' }).click()
await d.waitForTimeout(1000)
{
  const cimek = (await d.locator('.arpanel .csomag-cim').allTextContents())
    .map((x) => x.replace(/\s+/g, ' ').trim())
  console.log(`         ${JSON.stringify(cimek)}`)
  ok('a Start címe mellett a leírása', true, /^Start \| \S+/.test(cimek[0] ?? ''))
  ok('a Premium címe mellett a „Start + …"', true, /^Premium \| Start \+/.test(cimek[1] ?? ''))
  ok('nincs külön leírás-bekezdés a csomagok alatt', 0,
    await d.locator('.arpanel .panel-torzs > p.halk').count())
}
await d.locator('.arpanel .bezar').click()
await d.waitForTimeout(300)

console.log('\n=== 5) Ügyfelek: rendszámok, cég, cég szerinti nézet ===\n')
await menu(d, 'Ügyfelek')
{
  await d.locator('.oldal-fej .fulek button').filter({ hasText: 'Jármű szerint' }).click()
  await d.waitForTimeout(1200)
  const ker = d.locator('.panelek-ugyfel .panel').filter({ hasText: 'KER-100' }).first()
  ok('jármű szerint: a cégnév a kártyán', true, (await ker.innerText()).includes('Autó Trans'))

  await d.locator('.oldal-fej .fulek button').filter({ hasText: 'Ügyfél szerint' }).click()
  await d.waitForTimeout(1200)
  const kov = d.locator('.panelek-ugyfel .panel').filter({ hasText: 'Kovács Péter' }).first()
  ok('ügyfél szerint: a rendszám, nem a darabszám', true,
    (await kov.locator('.rendszamok').innerText()).includes('ABC-123'))
  await kov.locator('.kartya-nyito').click()
  await d.waitForTimeout(1000)
  ok('kinyitva a járművek gomb nélkül látszanak', true,
    (await kov.locator('.alkartya').count()) > 0
    && (await kov.getByRole('button', { name: /Járművei \(/ }).count()) === 0)

  await d.locator('.oldal-fej .fulek button').filter({ hasText: 'Cég szerint' }).click()
  await d.waitForTimeout(1200)
  const at = d.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).first()
  ok('cég szerint: van Autó Trans kártya, szerződéssel', true,
    (await at.count()) === 1 && (await at.locator('.szerzodes-pill').count()) > 0)
  const rsz = (await at.locator('.rendszamok').innerText()).split(',').map((x) => x.trim())
  await at.locator('.kartya-nyito').click()
  await d.waitForTimeout(500)
  ok('kinyitva minden autója egy sorban', rsz.length, await at.locator('.ceg-auto').count())
}
await d.screenshot({ path: '/tmp/f4-ceg.png' })

console.log('\n=== 6) Szerződés: Elit nagy és magán ár ===\n')
await menu(d, 'Cégek és bérletesek')
await d.locator('.fulek button').filter({ hasText: 'Szerződéses cégek' }).click()
await d.waitForTimeout(600)
{
  const kartya = d.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).first()
  await kartya.locator('.kartya-nyito').click()
  await d.waitForTimeout(300)
  await kartya.getByRole('button', { name: 'Szerkesztés' }).click()
  await d.waitForTimeout(800)
  ok('a meglévő csomagok ki vannak választva', ['Start', 'Premium', 'Elit'],
    await d.locator('.lap .valaszto button[aria-pressed="true"]').allInnerTexts())
  await d.locator('input[aria-label="Elit · Nagy méret · Magán ár"]').fill('31000')
  await d.getByRole('button', { name: 'Mentés', exact: true }).click()
  await d.waitForTimeout(1500)
  const k2 = d.locator('.panelek-ugyfel .panel').filter({ hasText: 'Autó Trans' }).first()
  if ((await k2.getAttribute('data-nyitva')) !== 'true') {
    await k2.locator('.kartya-nyito').click(); await d.waitForTimeout(300)
  }
  const sor = await k2.locator('.szerzodes-arak tr').filter({ hasText: 'Elit · Nagy' }).innerText()
  ok('az Elit · Nagy Magán ára elmentve', true, sor.replace(/\s/g, '').includes('31000Ft'))
}
await d.screenshot({ path: '/tmp/f4-szerzodes.png' })
await ctx2.close()

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
