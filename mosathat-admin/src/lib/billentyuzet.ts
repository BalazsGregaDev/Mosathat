import { erintokepernyo } from './kepernyo'

let ideiglenes: HTMLInputElement | null = null
let idozito: number | undefined

export function billentyuzetElore(mod: 'tel' | 'text' = 'tel'): void {
  if (!erintokepernyo()) return
  billentyuzetTakarit()

  const el = document.createElement('input')
  el.type = mod
  el.inputMode = mod
  el.setAttribute('aria-hidden', 'true')
  el.tabIndex = -1
  Object.assign(el.style, {
    position: 'fixed', top: '0', left: '0',
    width: '1px', height: '1px', opacity: '0',
    fontSize: '16px', border: '0', padding: '0',
    pointerEvents: 'none',
  })
  document.body.appendChild(el)
  el.focus()
  ideiglenes = el
  idozito = window.setTimeout(billentyuzetTakarit, 5000)
}

export function billentyuzetTakarit(): void {
  window.clearTimeout(idozito)
  ideiglenes?.remove()
  ideiglenes = null
}
