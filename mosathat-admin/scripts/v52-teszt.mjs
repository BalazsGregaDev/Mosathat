// v52: havi nézet — a „+" a szám fölött; a szám és az „autó" a cellán belül
// marad, a sávok alá kerül (asztalon, tableten, telefonon).
import { chromium } from 'playwright'

const b = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) })
let baj = 0
const ok = (mit, v, k) => {
  const jo = JSON.stringify(v) === JSON.stringify(k)
  if (!jo) baj++
  console.log(`   ${jo ? 'OK  ' : 'HIBA'}  ${mit}${jo ? '' : `  → ${JSON.stringify(k)} (várt: ${JSON.stringify(v)})`}`)
}

for (const [nev, vp] of [['asztal', { width: 1440, height: 1000 }], ['tablet', { width: 1280, height: 800 }],
                         ['telefon', { width: 430, height: 930 }]]) {
  console.log(`\n=== ${nev} (${vp.width} px) ===\n`)
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: nev !== 'asztal' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => { console.log('   JS HIBA:', e.message.slice(0, 200)); baj++ })
  await p.goto('http://localhost:5180/')
  await p.waitForSelector('input[type="email"]', { timeout: 60000 })
  await p.fill('input[type="email"]', 'tulaj@mosathat.hu')
  await p.fill('input[type="password"]', 'x')
  await p.getByRole('button', { name: /Belépés/ }).click()
  await p.waitForTimeout(2500)
  // Az Időpontok menüpont: asztalon az oldalsávban, tableten és telefonon a
  // menü gombja mögött.
  const menupont = p.locator('aside.oldalsav button').filter({ hasText: 'Időpontok' }).first()
  if (await menupont.isVisible()) {
    await menupont.click()
  } else {
    const gomb = p.locator('.fejlec-hamburger:visible, .mobil-fejlec .hamburger:visible').first()
    if (await gomb.isVisible()) {
      await gomb.click(); await p.waitForTimeout(400)
      await p.locator('.fiok button').filter({ hasText: 'Időpontok' }).first().click()
    }
  }
  await p.waitForTimeout(1500)
  await p.locator('.nezetvalto button:visible').filter({ hasText: 'Hónap' }).first().click()
  await p.waitForTimeout(1500)

  const r = await p.evaluate(() => {
    const cellak = [...document.querySelectorAll('.honapnap')]
    let kilog = 0, takar = 0, pluszAlatt = 0, plusz = 0
    for (const c of cellak) {
      const a = c.querySelector('.honap-autok')
      if (!a) continue
      const cr = c.getBoundingClientRect()
      const sor = a.querySelector('.sor').getBoundingClientRect()
      // a szám + „autó" a cellán belül (vízszintesen és függőlegesen)
      const szo = a.querySelector('.szo')
      const szoR = szo.getBoundingClientRect()
      if (sor.left < cr.left - 0.5 || szoR.right > cr.right + 0.5 || sor.bottom > cr.bottom + 0.5) kilog++
      if (szo.scrollWidth > szo.clientWidth + 1 || a.querySelector('.sor').scrollWidth > a.querySelector('.sor').clientWidth + 1) kilog++
      // a „+" a szám fölött
      const pl = a.querySelector('.plusz')
      if (pl) { plusz++; if (pl.getBoundingClientRect().bottom <= sor.top + 2) pluszAlatt++ }
      // egyik sáv sem lóg rá a számra
      const sorElem = c.closest('.honapsor')
      for (const s of sorElem.querySelectorAll('.honap-sav')) {
        const sr = s.getBoundingClientRect()
        const ar = a.getBoundingClientRect()
        if (sr.left < ar.right - 1 && sr.right > ar.left + 1 && sr.top < ar.bottom - 1 && sr.bottom > ar.top + 1) takar++
      }
    }
    return { kilog, takar, plusz, pluszAlatt, szamok: document.querySelectorAll('.honap-autok').length }
  })
  ok('vannak számok', true, r.szamok > 0)
  ok('a szám és az „autó" a cellán belül', 0, r.kilog)
  ok('sáv nem takarja a számot', 0, r.takar)
  ok('a „+" a szám fölött (minden sávos napon)', r.plusz, r.pluszAlatt)
  ok('van „+"-os nap', true, r.plusz > 0)
  await p.screenshot({ path: `/tmp/claude-0/-home-claude/0da2f43f-f114-54e0-8861-a3d34165c4b9/scratchpad/v52-${nev}.png` })
  await ctx.close()
}

await b.close()
console.log(`\n${baj === 0 ? 'Minden rendben.' : `${baj} hiba.`}`)
process.exit(baj === 0 ? 0 : 1)
