export function foglalasLink(alap: string, token: string): string {
  return new URL(`/foglalas/${encodeURIComponent(token)}`, alap).toString()
}
