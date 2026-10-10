import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const p = await ctx.newPage()
let baj = 0
p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })

function ok(mit, varjuk, kaptuk) {
  const jo = JSON.stringify(varjuk) === JSON.stringify(kaptuk)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(kaptuk)} (várt: ${JSON.stringify(varjuk)})`}`)
}

await p.goto('http://localhost:5180/')
await p.waitForSelector('input[type="email"]', { timeout: 60000 })
await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
await p.fill('input[type="password"]', 'akarmi')
await p.getByRole('button', { name: /Belépés/ }).click()
await p.waitForTimeout(3000)

console.log('=== 0) nagyítás ki van kapcsolva ===\n')
{
  const m = await p.getAttribute('meta[name="viewport"]', 'content')
  ok('a viewport tiltja', true, /user-scalable=no/.test(m) && /maximum-scale=1/.test(m))
  const ta = await p.evaluate(() => getComputedStyle(document.body).touchAction)
  ok('a body touch-action = pan-x pan-y', 'pan-x pan-y', ta)
}

await p.locator('.mobil-fejlec .hamburger').click()
await p.waitForTimeout(600)
await p.locator('.fiok button').filter({ hasText: 'Időpontok' }).first().click()
await p.waitForTimeout(2000)

console.log('\n=== 1) árlista: kilóg-e a szöveg ===\n')
{
  const gomb = p.locator('.arlista-gombok button')
  console.log(`         árlista gombok: ${await gomb.count()}`)
  const lathato = gomb.filter({ visible: true })
  console.log(`         láthatóak: ${await lathato.count()}`)
  if (await lathato.count()) await lathato.first().click()
  await p.waitForTimeout(900)
}
ok('az árlista kinyílt', 1, await p.locator('.arpanel').count())
await p.locator('.arpanel-fej .fulek button').filter({ hasText: 'Egyéb' }).click()
await p.waitForTimeout(900)
{
  const r = await p.evaluate(() => {
    const t = document.querySelector('.arpanel-torzs')
    const tab = document.querySelector('.arpanel-torzs table')
    const sorok = [...document.querySelectorAll('.arpanel-torzs tbody tr')].slice(0, 5).map((tr) => ({
      nev: tr.querySelector('th')?.innerText.trim().replace(/\s+/g, ' ').slice(0, 44),
      magas: Math.round(tr.getBoundingClientRect().height),
      jobb: Math.round(tr.getBoundingClientRect().right),
    }))
    return {
      torzsSW: t.scrollWidth, torzsCW: t.clientWidth,
      tabW: tab ? Math.round(tab.getBoundingClientRect().width) : null,
      betu: tab ? getComputedStyle(tab).fontSize : null,
      sorok,
    }
  })
  ok('a panel törzsében nincs vízszintes görgetés', true, r.torzsSW <= r.torzsCW + 1)
  console.log(`         táblázat: ${r.tabW}px széles, betű ${r.betu}`)
  for (const s of r.sorok) console.log(`         ${String(s.magas).padStart(3)}px  "${s.nev}"`)
  const ido = await p.evaluate(() => [...document.querySelectorAll('.arpanel-torzs tbody tr')]
    .slice(0, 8)
    .map((tr) => { const td = tr.children[2]; return { sz: td.innerText.trim(), h: Math.round(td.getBoundingClientRect().height) } }))
  console.log(`         idő oszlop: ${ido.map((x) => `${x.sz}(${x.h}px)`).join(' ')}`)
}
await p.screenshot({ path: '/tmp/m-arlista-egyeb.png' })

console.log('\n=== 2) árlista nyitva: a háttér nem görgethető ===\n')
{
  const r = await p.evaluate(() => {
    const t = document.querySelector('.tartalom')
    const cs = getComputedStyle(t)
    return {
      osztaly: document.body.className,
      overflow: cs.overflow,
      touch: cs.touchAction,
      panelTouch: getComputedStyle(document.querySelector('.arpanel-torzs')).touchAction,
    }
  })
  ok('a body megkapta a jelzést', true, r.osztaly.includes('arlista-nyitva'))
  ok('a háttér görgetése tiltva', 'hidden', r.overflow)
  ok('a háttér ujjal sem mozdul', 'none', r.touch)
  ok('a panel viszont görgethető', 'pan-y', r.panelTouch)
}

await p.locator('.arpanel-fej .fulek button').filter({ hasText: 'Csomagok' }).click()
await p.waitForTimeout(700)
{
  const r = await p.evaluate(() => {
    const tab = document.querySelector('.arpanel-torzs table.arlista')
    return tab ? getComputedStyle(tab).minWidth : null
  })
  ok('a Csomagok táblázata változatlan (min-width 420px)', '420px', r)
}
await p.screenshot({ path: '/tmp/m-arlista-csomagok.png' })

await p.locator('.arpanel-fej .bezar').click()
await p.waitForTimeout(500)
{
  const r = await p.evaluate(() => getComputedStyle(document.querySelector('.tartalom')).overflow)
  ok('bezárás után a háttér újra görgethető', false, r === 'hidden')
}

console.log('\n=== 3) munkalap lába ===\n')
await p.locator('.kartya-nyit').first().click()
await p.waitForTimeout(2500)
{
  const r = await p.evaluate(() => {
    const lab = document.querySelector('.munkalap-lab')
    if (!lab) return { van: false }
    const fent = lab.querySelector('.lab-fent')
    const gombok = [...lab.querySelectorAll('.gombok .btn')]
    return {
      van: true,
      fentSor: [...fent.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim()),
      lentSor: gombok.map((g) => g.innerText.trim()),
      kilog: gombok.some((g) => g.getBoundingClientRect().right > window.innerWidth + 1),
      labAlja: Math.round(lab.getBoundingClientRect().bottom),
      ablak: window.innerHeight,
    }
  })
  ok('a munkalap lába a két soros elrendezés', true, r.van)
  if (r.van) {
    console.log(`         fent: ${JSON.stringify(r.fentSor)}`)
    console.log(`         lent: ${JSON.stringify(r.lentSor)}`)
    ok('egyik gomb sem lóg le oldalra', false, r.kilog)
    ok('a láb a képernyőn belül van', true, r.labAlja <= r.ablak + 1)
  }
}
await p.screenshot({ path: '/tmp/m-munkalap.png' })

console.log('\n=== 4) a munkalap görgethető ===\n')
{
  const r = await p.evaluate(async () => {
    const t = document.querySelector('.lap-torzs')
    const elotte = t.scrollTop
    t.scrollTop = 400
    await new Promise((r) => setTimeout(r, 200))
    return {
      elotte, utana: t.scrollTop,
      meddig: t.scrollHeight - t.clientHeight,
      viz: t.scrollWidth <= t.clientWidth + 1,
      tul: getComputedStyle(t).overscrollBehaviorY,
    }
  })
  ok('görgethető', true, r.utana > r.elotte)
  ok('vízszintesen nem lóg ki', true, r.viz)
  ok('a görgetés nem csordul át a háttérre', 'contain', r.tul)
}
await p.screenshot({ path: '/tmp/m-munkalap-alja.png' })

console.log('\n=== 5) négygombos eset (még nem érkezett meg) ===\n')
await p.locator('.lap-fej .bezar').click()
await p.waitForTimeout(800)
{
  const kartyak = p.locator('.kartya')
  const n = await kartyak.count()
  let talalt = false
  for (let i = 0; i < n && !talalt; i++) {
    const sz = await kartyak.nth(i).innerText()
    if (/Visszaigazolva|Vár/i.test(sz) || !/Megérkezett|Dolgozunk|Kész|Átvette|Lemondva/i.test(sz)) {
      await kartyak.nth(i).locator('.kartya-nyit').click()
      await p.waitForTimeout(2200)
      const van = await p.locator('.munkalap-lab').count()
      if (van) {
        const r = await p.evaluate(() => {
          const lab = document.querySelector('.munkalap-lab')
          const g = [...lab.querySelectorAll('.gombok .btn')]
          return {
            gombok: g.map((x) => x.innerText.trim()),
            kilog: g.some((x) => x.getBoundingClientRect().right > window.innerWidth + 1),
            alja: Math.round(lab.getBoundingClientRect().bottom), ablak: window.innerHeight,
          }
        })
        if (r.gombok.length >= 4) {
          talalt = true
          console.log(`         gombok: ${JSON.stringify(r.gombok)}`)
          ok('négy gombnál sem lóg ki semmi', false, r.kilog)
          ok('a láb a képernyőn belül', true, r.alja <= r.ablak + 1)
          await p.screenshot({ path: '/tmp/m-munkalap-4gomb.png' })
        }
        await p.locator('.lap-fej .bezar').click()
        await p.waitForTimeout(600)
      }
    }
  }
  if (!talalt) console.log('         (nem volt négygombos foglalás a mai napon)')
}

console.log('\n=== 6) asztali gépen a láb egy sor maradt ===\n')
await p.setViewportSize({ width: 1440, height: 900 })
await p.waitForTimeout(800)
await p.locator('.kartya-nyit').first().click()
await p.waitForTimeout(2200)
{
  const r = await p.evaluate(() => {
    const lab = document.querySelector('.munkalap-lab')
    const osszeg = lab.querySelector('.osszeg').getBoundingClientRect()
    const gombok = [...lab.querySelectorAll('.btn')].map((x) => ({
      sz: x.innerText.trim(), y: Math.round(x.getBoundingClientRect().top),
    }))
    return { osszegY: Math.round(osszeg.top), gombok, magas: Math.round(lab.getBoundingClientRect().height) }
  })
  const egySor = r.gombok.every((g) => Math.abs(g.y - r.gombok[0].y) < 4)
  ok('minden gomb egy sorban', true, egySor)
  console.log(`         láb magassága: ${r.magas}px, gombok: ${JSON.stringify(r.gombok.map((g) => g.sz))}`)
  await p.screenshot({ path: '/tmp/d-munkalap.png' })
}

console.log('\n=== 7) lenyíló űrlap nem rontja el a görgetést ===\n')
await p.setViewportSize({ width: 390, height: 844 })
await p.waitForTimeout(600)
if (await p.locator('.lap-fej .bezar').count()) {
  await p.locator('.lap-fej .bezar').first().click()
  await p.waitForTimeout(800)
}
await p.locator('.mobil-fejlec .hamburger').click()
await p.waitForTimeout(500)
await p.locator('.fiok button').filter({ hasText: 'Ügyfelek' }).first().click()
await p.waitForTimeout(2500)
await p.locator('.fulek button').filter({ hasText: 'Ügyfél szerint' }).click()
await p.waitForTimeout(2000)
{
  const meret = () => p.evaluate(() => {
    const t = document.querySelector('.tartalom')
    const also = [...document.querySelectorAll('.tartalom .panel')].pop()
    return {
      scrollH: t.scrollHeight, clientH: t.clientHeight, top: t.scrollTop,
      minH: getComputedStyle(t).minHeight,
      tulcsordul: getComputedStyle(t).overscrollBehaviorY,
      tartalomAlja: also
        ? Math.round(also.getBoundingClientRect().bottom - t.getBoundingClientRect().top + t.scrollTop)
        : 0,
    }
  })
  ok('a görgetődoboz zsugorodhat (min-height: 0)', '0px', (await meret()).minH)
  ok('a görgetés nem csordul tovább a lapra', 'contain', (await meret()).tulcsordul)

  const fej = p.locator('.tartalom .panel .kartya-fej, .tartalom .panel h3').first()
  if (await fej.count()) { await fej.click(); await p.waitForTimeout(700) }

  const gomb = p.getByRole('button', { name: /További jármű/ }).first()
  if (await gomb.count()) {
    await gomb.scrollIntoViewIfNeeded()
    const elotte = await meret()
    await gomb.click()
    await p.waitForTimeout(400)
    const utana = await meret()
    ok('az űrlap megnyitásakor nő a görgethető magasság', true, utana.scrollH > elotte.scrollH)
    ok('nem nyílt fel billentyűzet (nincs fókuszált mező)', 'BODY',
      await p.evaluate(() => document.activeElement?.tagName))

    await p.evaluate(() => { document.querySelector('.tartalom').scrollTop = 0 })
    await p.waitForTimeout(250)
    ok('a lista tetejéig fel lehet görgetni', 0, (await meret()).top)

    await p.evaluate(() => { document.querySelector('.tartalom').scrollTop = 99999 })
    await p.waitForTimeout(250)
    const v = await meret()
    ok('alul nincs indokolatlan üres hely', true, v.scrollH - v.tartalomAlja <= 100)
    ok('a lap egésze nem csúszott el', 0, await p.evaluate(() => window.scrollY))
    await p.screenshot({ path: '/tmp/m-ujjarmu.png' })
  } else {
    console.log('         (nincs ügyfélkártya, kihagyva)')
  }
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
