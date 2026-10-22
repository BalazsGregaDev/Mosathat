export const CEG_LINK_UT = '/ceg/'

export function cegLinkCim(token: string, alap: string = window.location.origin): string {
  return `${alap.replace(/\/+$/, '')}${CEG_LINK_UT}${token}`
}

export function cegLinkToken(utvonal: string): string | null {
  const m = /^\/ceg\/([a-z0-9]{20,64})\/?$/.exec(utvonal)
  return m ? m[1] : null
}

export function cegLinkLevel(cegNev: string, link: string): string {
  return [
    `Kedves ${cegNev}!`,
    '',
    'Ezúton küldöm az időpontfoglaláshoz használható linket, adjátok tovább az erre jogosultaknak:',
    link,
    '',
    'Köszönettel,',
    'Mosathat autóápolási kft.',
  ].join('\n')
}

export function cegLinkCsereLevel(cegNev: string, link: string): string {
  return [
    `Kedves ${cegNev}!`,
    '',
    'Ezúton küldöm az időpontfoglaláshoz használható új linket. A korábbi link kiszivárgott, ezért megszüntettük, '
      + 'az már nem működik. Kérjük, hívjátok fel erre a kollégáitok figyelmét, és adjátok tovább az új linket az erre jogosultaknak:',
    link,
    '',
    'Köszönettel,',
    'Mosathat autóápolási kft.',
  ].join('\n')
}

export async function vagolapra(szoveg: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(szoveg)
    return true
  } catch {
    const t = document.createElement('textarea')
    t.value = szoveg
    t.setAttribute('readonly', '')
    t.style.position = 'fixed'
    t.style.opacity = '0'
    document.body.appendChild(t)
    t.select()
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    t.remove()
    return ok
  }
}

export function foglalasOldalCim(token: string, alap: string = window.location.origin): string {
  return `${alap.replace(/\/+$/, '')}/foglalas/${token}`
}
