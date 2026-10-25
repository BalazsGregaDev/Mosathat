export const tiszta = (s) => String(s ?? '').replace(new RegExp('\\u2063[\\uFE00-\\uFE0F]{3}|\\u2064', 'g'), '')
export const blokk = (p, sav) => p.locator(`.tsz-blokk[data-sav="${sav}"]`)
export const kartya = (p) => p.locator('.tsz-kartya')
export const kartyaMezo = (p) => p.locator('.tsz-kartya input, .tsz-kartya textarea').first()

export async function varTartalom(p) {
  await p.locator('.tsz-blokk').first().waitFor({ timeout: 30000 })
  await p.waitForTimeout(1500)
}

export async function lapra(p, nev) {
  await p.locator('.tsz-lapok button').filter({ hasText: nev }).click()
  await varTartalom(p)
}

export async function kulcsok(p, sav = null) {
  return p.evaluate(async (sav) => {
    const { SZOVEGEK } = await import('/src/lib/publikusTartalom.ts')
    const { elofordulasok, lathato } = await import('/src/features/publikus-admin/szovegJelolo.ts')
    const gyoker = sav ? document.querySelector(`.tsz-blokk[data-sav="${sav}"]`) : document.querySelector('.tsz-lap')
    if (!gyoker) return []
    const ki = new Set()
    for (const e of elofordulasok(gyoker)) if (lathato(e.tartomany)) ki.add(SZOVEGEK[e.sorszam].kulcs)
    gyoker.querySelectorAll('[placeholder]').forEach((el) => {
      const v = el.getAttribute('placeholder') ?? ''
      const i = v.indexOf('⁣')
      if (i >= 0 && el.getClientRects().length) {
        const d = [1, 2, 3].map((j) => v.charCodeAt(i + j) - 0xfe00)
        ki.add(SZOVEGEK[(d[0] << 8) | (d[1] << 4) | d[2]].kulcs)
      }
    })
    return [...ki]
  }, sav)
}

export async function rejtettKulcsok(p) {
  const fej = p.locator('.tsz-rejtett-fej')
  if ((await fej.getAttribute('aria-expanded')) === 'false') { await fej.click(); await p.waitForTimeout(300) }
  return p.locator('.tsz-rejtett [data-rejtett-kulcs]').evaluateAll((l) => l.map((e) => e.dataset.rejtettKulcs))
}

async function helye(p, kulcs, sav) {
  return p.evaluate(async ({ kulcs, sav }) => {
    const { SZOVEGEK } = await import('/src/lib/publikusTartalom.ts')
    const { elofordulasok, lathato } = await import('/src/features/publikus-admin/szovegJelolo.ts')
    const sorszam = SZOVEGEK.findIndex((s) => s.kulcs === kulcs)
    const gyoker = sav ? document.querySelector(`.tsz-blokk[data-sav="${sav}"]`) : document.querySelector('.tsz-lap')
    if (!gyoker || sorszam < 0) return null
    const e = elofordulasok(gyoker).find((x) => x.sorszam === sorszam && lathato(x.tartomany))
    if (e) {
      const el = e.tartomany.startContainer.parentElement
      el.scrollIntoView({ block: 'center' })
      const r = [...e.tartomany.getClientRects()].find((t) => t.width > 2 && t.height > 2)
      return r ? { x: r.left + Math.min(6, r.width / 2), y: r.top + r.height / 2 } : null
    }
    for (const el of gyoker.querySelectorAll('[placeholder]')) {
      const v = el.getAttribute('placeholder') ?? ''
      const i = v.indexOf('⁣')
      if (i < 0 || !el.getClientRects().length) continue
      const d = [1, 2, 3].map((j) => v.charCodeAt(i + j) - 0xfe00)
      if (((d[0] << 8) | (d[1] << 4) | d[2]) === sorszam) {
        el.scrollIntoView({ block: 'center' })
        const r = el.getBoundingClientRect()
        return { x: r.left + 12, y: r.top + r.height / 2 }
      }
    }
    return null
  }, { kulcs, sav })
}

export async function nyit(p, kulcs, sav = null) {
  if (await kartya(p).count()) {
    if ((await kartya(p).getAttribute('data-kulcs')) === kulcs) return kartya(p)
    await kartya(p).getByRole('button', { name: 'Bezárás' }).click()
    await p.waitForTimeout(150)
  }
  const h = await helye(p, kulcs, sav)
  if (h) {
    await p.waitForTimeout(150)
    const h2 = await helye(p, kulcs, sav)
    await p.mouse.click(h2.x, h2.y)
  } else {
    const fej = p.locator('.tsz-rejtett-fej')
    if ((await fej.getAttribute('aria-expanded')) === 'false') await fej.click()
    const gomb = p.locator(`.tsz-rejtett [data-rejtett-kulcs="${kulcs}"]`)
    if (!(await gomb.count())) throw new Error(`nem található szöveg: ${kulcs}`)
    await gomb.click()
  }
  await kartya(p).waitFor({ timeout: 5000 })
  const k = await kartya(p).getAttribute('data-kulcs')
  if (k !== kulcs) throw new Error(`más szöveg nyílt meg: ${k} (várt: ${kulcs})`)
  return kartya(p)
}

export async function beir(p, kulcs, ertek, sav = null) {
  await nyit(p, kulcs, sav)
  await kartyaMezo(p).fill(ertek)
  await p.waitForTimeout(400)
}

export async function ertek(p, kulcs, sav = null) {
  await nyit(p, kulcs, sav)
  return kartyaMezo(p).inputValue()
}

export async function bezar(p) {
  if (await kartya(p).count()) await kartya(p).getByRole('button', { name: 'Kész' }).click()
  await p.waitForTimeout(200)
}
