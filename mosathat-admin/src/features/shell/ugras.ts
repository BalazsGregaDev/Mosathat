import { erintokepernyo } from '../../lib/kepernyo'
import type { Nyelv } from '../../lib/nyelv'

export type Billentyu = 'text' | 'tel' | 'email' | 'numeric'

export interface Ugras {
  oldal: 'pub-elerhetoseg' | 'beallitasok'
  ful?: 'ido' | 'altalanos'
  fokusz: string
  kiemel?: string
  billentyu?: Billentyu
  valaszto?: boolean
  nyelv?: Nyelv
}

export interface Honnan {
  sugo?: string
  kulcs?: string
  valtozo: string
}

const VARAKOZAS = 8000
const KIEMELES = 8000

export function billentyuElore(cel: Ugras): HTMLInputElement | null {
  if (!cel.billentyu || !erintokepernyo()) return null
  const m = document.createElement('input')
  m.type = 'text'
  m.inputMode = cel.billentyu
  m.tabIndex = -1
  m.autocomplete = 'off'
  m.setAttribute('aria-hidden', 'true')
  m.dataset.ugrasBillentyu = ''
  m.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;pointer-events:none'
  document.body.appendChild(m)
  m.focus({ preventScroll: true })
  return m
}

const lathato = (e: HTMLElement) => e.getClientRects().length > 0

function megerkezett(elem: HTMLElement, cel: Ugras, ideiglenes: HTMLInputElement | null): () => void {
  const kiemeltek = cel.kiemel ? [...document.querySelectorAll<HTMLElement>(cel.kiemel)] : [elem]
  if (!kiemeltek.includes(elem) && !kiemeltek.some((k) => k.contains(elem))) kiemeltek.push(elem)
  elem.scrollIntoView({ block: 'center' })
  elem.focus({ preventScroll: true })
  if (elem instanceof HTMLInputElement) elem.select()
  ideiglenes?.remove()
  if (cel.valaszto && elem instanceof HTMLButtonElement && erintokepernyo()) elem.click()

  for (const k of kiemeltek) k.dataset.ugras = ''
  let idozito = 0
  const kint = (e: PointerEvent) => {
    const c = e.target as Element | null
    if (!c || kiemeltek.some((k) => k.contains(c)) || c.closest('.ido-fedo')) return
    leveszi()
  }
  function leveszi() {
    window.clearTimeout(idozito)
    document.removeEventListener('pointerdown', kint, true)
    for (const k of kiemeltek) delete k.dataset.ugras
  }
  document.addEventListener('pointerdown', kint, true)
  idozito = window.setTimeout(leveszi, KIEMELES)
  return leveszi
}

export function celraUgrik(cel: Ugras, ideiglenes: HTMLInputElement | null): () => void {
  const indul = performance.now()
  let leall = false
  let idozito = 0
  let takarit = () => {}
  const keres = () => {
    if (leall) return
    const elem = document.querySelector<HTMLElement>(cel.fokusz)
    if (elem && lathato(elem)) {
      takarit = megerkezett(elem, cel, ideiglenes)
      return
    }
    if (performance.now() - indul > VARAKOZAS) {
      ideiglenes?.remove()
      return
    }
    idozito = window.setTimeout(keres, 50)
  }
  idozito = window.setTimeout(keres, 0)
  return () => {
    leall = true
    window.clearTimeout(idozito)
    ideiglenes?.remove()
    takarit()
  }
}
