import { ora } from './format'
import type { BookingStatus, DayBooking } from './types'

// ---------------------------------------------------------------------------
//  Flottás csoportok a listákban
//
//  A csoport minden autója külön foglalás az adatbázisban (lásd a
//  20261005100000_flotta migrációt). A felületen viszont EGY kártya:
//
//    Raiffeisen · 3 darab · Premium · 17:00-ig
//
//  Ez a fájl rakja össze: a listában a csoport első autója marad meg
//  (képviselő), és a `flotta` mezőjébe kerül a csoport összes autója. A
//  képviselő ott áll, ahol a csoport első autója állt — új csoportnál a nap
//  elején (Hozza óra nincs).
// ---------------------------------------------------------------------------

/** A helyőrző rendszám: a flottás autó, aminek még nem tudjuk a rendszámát. */
export const HELYORZO = '—'

/** Van-e valódi rendszáma az autónak. */
export function vanRendszam(b: Pick<DayBooking, 'plate_raw'>): boolean {
  const r = (b.plate_raw ?? '').trim()
  return r !== '' && r !== HELYORZO
}

/** A lemondott / el nem jött autók nem számítanak a csoport darabszámába. */
export function elo(b: DayBooking): boolean {
  return !['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW'].includes(b.status)
}

/**
 * A lista, a flottás csoportok egy-egy kártyává összevonva. A nem flottás
 * foglalások változatlanul, a helyükön maradnak.
 */
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
    // A képviselő a csoport ÖSSZESÍTETT állapotát kapja (a kártya színe ebből).
    ki.push({ ...b, status: csoportAllapot(tagok), flotta: tagok })
  }
  return ki
}

// Az állapotok sorrendje a munka menetében: a csoport ott tart, ahol a
// legkevésbé előrehaladott (élő) autója.
const SORREND: BookingStatus[] = [
  'PENDING', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'READY', 'COMPLETED',
] as BookingStatus[]

/**
 * A csoport egy állapota (a kártya színe). A flottás autóknál nincs
 * Megérkezett / Kész van: csak a léptető (hány autó kész). Ezért:
 *   egy sem kész          → Várjuk (CONFIRMED)
 *   néhány kész           → Dolgozunk (IN_PROGRESS)
 *   mind kész             → Lezárva (COMPLETED)
 */
export function csoportAllapot(tagok: DayBooking[]): BookingStatus {
  const elok = tagok.filter(elo)
  if (elok.length === 0) return tagok[0]?.status ?? 'CONFIRMED'
  const kesz = elok.filter((t) => t.status === 'COMPLETED').length
  if (kesz === elok.length) return 'COMPLETED'
  if (kesz > 0) return 'IN_PROGRESS'
  // Régi (léptető előtti) állapotok: a legkevésbé előrehaladott.
  return elok
    .map((t) => t.status)
    .sort((a, b) => SORREND.indexOf(a) - SORREND.indexOf(b))[0]
}

/**
 * Hányadik autónál tartunk: a legkisebb sorszámú, még nem kész élő autó
 * (null, ha mind kész).
 */
export function aktualisAuto(tagok: DayBooking[]): DayBooking | null {
  return tagok.filter(elo).find((t) => t.status !== 'COMPLETED') ?? null
}

/** A csoport neve a kártyán: „Raiffeisen Bank". */
export function csoportNev(b: DayBooking): string {
  return b.company_name || b.customer_name || 'Flotta'
}

/** A végső időpont: „17:00-ig" (hozom-viszemnél ekkorra kell visszaérni). */
export function vegsoIdo(b: DayBooking): string {
  const v = b.pick_up_at ?? b.deadline_at
  return v ? `${ora(v)}-ig` : 'nap végéig'
}

/** Összesítés a kártyára: hány élő autó, ebből hány kész / átvett, összár. */
export function csoportOsszeg(tagok: DayBooking[]) {
  const elok = tagok.filter(elo)
  return {
    darab: elok.length,
    kesz: elok.filter((t) => t.status === 'COMPLETED').length,
    atvett: elok.filter((t) => t.status === 'COMPLETED').length,
    rendszammal: elok.filter(vanRendszam).length,
    ar: elok.reduce((s, t) => s + (t.final_price_huf ?? t.estimated_price_huf ?? 0), 0),
  }
}
