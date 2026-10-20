function gorgetoDoboz(elem: Element): HTMLElement | null {
  for (let p = elem.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

export function gorgetIde(elem: Element | null | undefined, sima = true) {
  if (!elem) return
  const margo = parseFloat(getComputedStyle(elem).scrollMarginTop) || 0
  const behavior: ScrollBehavior = sima ? 'smooth' : 'auto'
  const doboz = gorgetoDoboz(elem)
  if (doboz) {
    const y = elem.getBoundingClientRect().top - doboz.getBoundingClientRect().top + doboz.scrollTop - margo
    doboz.scrollTo({ top: Math.max(0, Math.round(y)), behavior })
    return
  }
  const y = elem.getBoundingClientRect().top + window.scrollY - margo
  window.scrollTo({ top: Math.max(0, Math.round(y)), behavior })
}
