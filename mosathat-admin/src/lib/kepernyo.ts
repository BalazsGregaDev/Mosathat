export function erintokepernyo(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
}

export function urlapMegnyilt(mezo: HTMLElement | null): void {
  if (!mezo) return
  if (!erintokepernyo()) {
    mezo.focus()
    return
  }
  mezo.scrollIntoView({ block: 'nearest' })
}

export function billentyuzetHelyreallitas(): void {
  const nezet = window.visualViewport
  if (!nezet) return

  let legnagyobb = nezet.height
  let szelesseg = nezet.width
  nezet.addEventListener('resize', () => {
    if (Math.abs(nezet.width - szelesseg) > 1) {
      szelesseg = nezet.width
      legnagyobb = nezet.height
    }
    legnagyobb = Math.max(legnagyobb, nezet.height)
    if (nezet.height >= legnagyobb - 40 && window.scrollY !== 0) {
      window.scrollTo(0, 0)
    }
  })
}
