export const TOKEN_MINTA = /^[A-Za-z0-9_-]{43}$/

export function ujToken(): string {
  const bajtok = new Uint8Array(32)
  crypto.getRandomValues(bajtok)
  let bin = ''
  for (const b of bajtok) bin += String.fromCharCode(b)
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function lemondoLink(alap: string, token: string): string {
  const u = new URL(alap)
  u.searchParams.set('t', token)
  return u.toString()
}

export function foglalasLink(alap: string, token: string): string {
  return new URL(`/foglalas/${encodeURIComponent(token)}`, alap).toString()
}
