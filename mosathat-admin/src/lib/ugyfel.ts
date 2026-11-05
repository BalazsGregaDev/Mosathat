export function nevKulcs(s: string | null | undefined): string {
  const t = (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return t === 'nevtelen' ? '' : t
}

export function telKulcs(s: string | null | undefined): string {
  const x = (s ?? '').replace(/[^0-9]/g, '')
  if (x.startsWith('0036')) return x.slice(4)
  if (x.startsWith('06')) return x.slice(2)
  if (x.startsWith('36') && (x.length === 10 || x.length === 11)) return x.slice(2)
  return x
}

export function rendszamKulcs(s: string | null | undefined): string {
  const t = (s ?? '').trim()
  return t === '—' ? '' : t.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export interface Valtozas {
  mezo: 'NEV' | 'TELEFON' | 'CEG'
  regi: string
  uj: string
}

export function ugyfelValtozasok(
  regi: { nev: string; tel: string },
  uj: { nev: string; tel: string },
): Valtozas[] {
  const ki: Valtozas[] = []
  if (nevKulcs(regi.nev) !== nevKulcs(uj.nev)) ki.push({ mezo: 'NEV', regi: regi.nev.trim(), uj: uj.nev.trim() })
  if (telKulcs(regi.tel) !== telKulcs(uj.tel)) ki.push({ mezo: 'TELEFON', regi: regi.tel.trim(), uj: uj.tel.trim() })
  return ki
}

export function ellentmond(kivalasztott: { nev: string; tel: string }, urlap: { nev: string; tel: string }): Valtozas[] {
  return ugyfelValtozasok(kivalasztott, urlap).filter((v) => (v.mezo === 'NEV' ? nevKulcs(v.regi) && nevKulcs(v.uj) : telKulcs(v.regi) && telKulcs(v.uj)))
}
