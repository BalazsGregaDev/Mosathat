import { ft, honapCim, napRovidCim, nettobol } from './format'
import {
  KIND_LABEL, SIZE_LABEL,
  type ContractPrice, type SheetColumn, type SheetRow,
} from './types'

function datumPont(nap: string): string {
  return `${nap.slice(0, 4)}.${nap.slice(5, 7)}.${nap.slice(8, 10)}.`
}

function kmSzoveg(km: number | null): string {
  return km == null ? '' : km.toLocaleString('hu-HU')
}

export function sajatOszlop(o: SheetColumn): boolean {
  return o.key.startsWith('E_')
}

export function cellaSzoveg(o: SheetColumn, r: SheetRow): string {
  switch (o.key) {
    case 'DATUM':    return datumPont(r.day)
    case 'RENDSZAM': return r.plate ?? ''
    case 'KM':       return kmSzoveg(r.km)
    case 'NETTO':    return r.net_huf == null ? '' : ft(r.net_huf)
    case 'NEV':      return r.name ?? ''
    case 'ALAIRAS':  return ''
    default:         return r.extra?.[o.key] ?? ''
  }
}

export function lablecArak(arak: ContractPrice[]): string[] {
  const ketFajta = new Set(arak.map((a) => a.kind)).size > 1

  const csoportok = new Map<string, ContractPrice[]>()
  for (const a of arak) {
    const kulcs = `${a.size}|${a.package_id}`
    csoportok.set(kulcs, [...(csoportok.get(kulcs) ?? []), a])
  }

  return [...csoportok.values()]
    .sort((x, y) => (x[0].size === y[0].size ? 0 : x[0].size === 'NORMAL' ? -1 : 1))
    .map((cs) => {
      const eleje = `${SIZE_LABEL[cs[0].size]} – ${cs[0].package_name} – `
      if (!ketFajta) return `${eleje}${ft(nettobol(cs[0].price_huf))} + ÁFA`
      const sorban = [...cs].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'FLOTTA' ? -1 : 1))
      return eleje
        + sorban.map((a) => `${KIND_LABEL[a.kind]}: ${ft(nettobol(a.price_huf))}`).join(', ')
        + ' + ÁFA'
    })
}

export function ujOszlopKulcs(): string {
  return `E_${Math.random().toString(36).slice(2, 8)}`
}

const nap = (d: string) => napRovidCim(d.slice(0, 10))

export function naptariHonap(kezdet: string): boolean {
  return kezdet.slice(8, 10) === '01'
}

export function idoszakNapok(kezdet: string, veg: string): string {
  return `${nap(kezdet)} – ${nap(veg)}`
}

export function idoszakCim(kezdet: string, veg: string): string {
  if (naptariHonap(kezdet)) return honapCim(kezdet.slice(0, 10))
  const ev1 = kezdet.slice(0, 4)
  const ev2 = veg.slice(0, 4)
  return ev1 === ev2
    ? `${ev1}. ${nap(kezdet)} – ${nap(veg)}`
    : `${ev1}. ${nap(kezdet)} – ${ev2}. ${nap(veg)}`
}
