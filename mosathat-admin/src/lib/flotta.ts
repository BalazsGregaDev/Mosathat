import { ora } from './format'
import { eloE, type BookingStatus, type DayBooking } from './types'

export const HELYORZO = '—'

export function vanRendszam(b: Pick<DayBooking, 'plate_raw'>): boolean {
  const r = (b.plate_raw ?? '').trim()
  return r !== '' && r !== HELYORZO
}

export function autoNev(t: Pick<DayBooking, 'plate_raw' | 'fleet_index'>): string {
  return vanRendszam(t) ? (t.plate_raw ?? '').toUpperCase() : `${t.fleet_index}. autó`
}

export function elo(b: DayBooking): boolean {
  return eloE(b.status)
}

export function flottaCsoportosit(lista: DayBooking[]): DayBooking[] {
  const csoportok = new Map<string, DayBooking[]>()
  for (const b of lista) {
    if (!b.fleet_group) continue
    csoportok.set(b.fleet_group, [...(csoportok.get(b.fleet_group) ?? []), b])
  }
  if (csoportok.size === 0) return lista

  const kesz = new Set<string>()
  const ki: DayBooking[] = []
  for (const b of lista) {
    if (!b.fleet_group) { ki.push(b); continue }
    if (kesz.has(b.fleet_group)) continue
    kesz.add(b.fleet_group)
    const tagok = [...(csoportok.get(b.fleet_group) ?? [])]
      .sort((x, y) => (x.fleet_index ?? 0) - (y.fleet_index ?? 0))
    ki.push({ ...b, status: csoportAllapot(tagok), flotta: tagok })
  }
  return ki
}

const SORREND: BookingStatus[] = ['REQUESTED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'READY', 'COMPLETED']

function csoportAllapot(tagok: DayBooking[]): BookingStatus {
  const elok = tagok.filter(elo)
  if (elok.length === 0) return tagok[0]?.status ?? 'CONFIRMED'
  const kesz = elok.filter((t) => t.status === 'COMPLETED').length
  if (kesz === elok.length) return 'COMPLETED'
  if (kesz > 0) return 'IN_PROGRESS'
  return elok
    .map((t) => t.status)
    .sort((a, b) => SORREND.indexOf(a) - SORREND.indexOf(b))[0]
}

export function aktualisAuto(tagok: DayBooking[]): DayBooking | null {
  return tagok.filter(elo).find((t) => t.status !== 'COMPLETED') ?? null
}

export function csoportNev(b: DayBooking): string {
  return b.company_name || b.customer_name || 'Flotta'
}

export function vegsoIdo(b: DayBooking): string {
  const v = b.pick_up_at ?? b.deadline_at
  return v ? `${ora(v)}-ig` : 'nap végéig'
}

export function csoportOsszeg(tagok: DayBooking[]) {
  const elok = tagok.filter(elo)
  return {
    darab: elok.length,
    kesz: elok.filter((t) => t.status === 'COMPLETED').length,
    rendszammal: elok.filter(vanRendszam).length,
    ar: elok.reduce((s, t) => s + (t.final_price_huf ?? t.estimated_price_huf ?? 0), 0),
  }
}
