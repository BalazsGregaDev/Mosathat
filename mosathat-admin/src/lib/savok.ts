import type { DayBooking, VacationRow } from './types'

// ---------------------------------------------------------------------------
//  Többnapos munkák sávjai — a heti és a havi nézet közös számítása
//
//  Egy többnapos foglalás (a Viszi napja későbbi, mint a Hozzáé) nem egy-egy
//  kártya minden napon, hanem EGY sáv, ami azokon a napokon fut végig, amikor
//  az autó nálunk van. A heti nézetben öt oszlop van (hétfő–péntek), a havi
//  naptár egy sorában hét (hétfő–vasárnap) — a számítás ugyanaz, csak az
//  oszlopok száma más.
//
//  Elhelyezés: időrendben, mindegyik sáv az első olyan sorba kerül, ahol még
//  nem fedi semmi. Így két egymást nem fedő sáv egy sorba fér, és a naptár
//  nem nő feleslegesen magasra.
// ---------------------------------------------------------------------------

export interface Sav {
  b: DayBooking
  /** Az első és az utolsó oszlop (0 = hétfő), a látható napokra vágva. */
  tol: number
  ig: number
  /** Melyik sorba került (0 = legfelső). */
  sor: number
  /** Belelóg-e a látható napok elé / mögé — ilyenkor a sáv vége nyitott. */
  korabbrol: boolean
  tovabb: boolean
}

/** Többnapos-e: a Viszi napja későbbi, mint a Hozzáé. */
export const tobbnaposE = (b: DayBooking) => b.last_day.slice(0, 10) > b.service_date.slice(0, 10)

/** Hány nap telt el a hétfő óta (a hét előtti napnál negatív). */
export function napIndex(hetfo: string, nap: string): number {
  return Math.round((Date.parse(`${nap}T12:00:00Z`) - Date.parse(`${hetfo}T12:00:00Z`)) / 86_400_000)
}

/**
 * Egy hét sávjai.
 *
 * @param foglalasok  a foglalások (bármennyi — a nem többnaposakat és a hetet
 *                    nem érintőket kihagyja)
 * @param hetfo       a hét hétfője ("2026-10-05")
 * @param oszlopok    hány napot mutat a nézet: 5 (heti) vagy 7 (havi)
 */
export function hetiSavok(foglalasok: DayBooking[], hetfo: string, oszlopok: number):
  { savok: Sav[]; sorok: number } {
  const utolsoOszlop = oszlopok - 1
  const foglalt: number[][] = []          // soronként: mely oszlopok foglaltak
  const savok: Sav[] = []
  const tobb = foglalasok.filter(tobbnaposE)
    .sort((a, z) => a.service_date.localeCompare(z.service_date) || a.plate_raw.localeCompare(z.plate_raw))

  for (const b of tobb) {
    const a = napIndex(hetfo, b.service_date.slice(0, 10))
    const z = napIndex(hetfo, b.last_day.slice(0, 10))
    const tol = Math.max(0, a)
    const ig = Math.min(utolsoOszlop, z)
    if (ig < tol) continue                // nem érinti a látható napokat
    let sor = foglalt.findIndex((s) => s.every((o) => o < tol || o > ig))
    if (sor === -1) { foglalt.push([]); sor = foglalt.length - 1 }
    for (let o = tol; o <= ig; o++) foglalt[sor].push(o)
    savok.push({ b, tol, ig, sor, korabbrol: a < 0, tovabb: z > utolsoOszlop })
  }
  return { savok, sorok: foglalt.length }
}

/** A szabadság sávja egy héten (a havi naptárban, az autók sávjai alatt). */
export interface SzabadsagSav {
  v: VacationRow
  tol: number
  ig: number
  sor: number
  korabbrol: boolean
  tovabb: boolean
}

/**
 * Egy hét szabadság-sávjai — ugyanaz az elhelyezés, mint a többnapos
 * autóknál, csak egynapos szabadság is sáv (egy nap széles).
 */
export function hetiSzabadsagok(lista: VacationRow[], hetfo: string, oszlopok: number):
  { savok: SzabadsagSav[]; sorok: number } {
  const utolsoOszlop = oszlopok - 1
  const foglalt: number[][] = []
  const savok: SzabadsagSav[] = []
  const rendben = lista.slice()
    .sort((a, z) => a.from_day.localeCompare(z.from_day) || a.staff_name.localeCompare(z.staff_name))

  for (const v of rendben) {
    const a = napIndex(hetfo, v.from_day.slice(0, 10))
    const z = napIndex(hetfo, v.to_day.slice(0, 10))
    const tol = Math.max(0, a)
    const ig = Math.min(utolsoOszlop, z)
    if (ig < tol) continue
    let sor = foglalt.findIndex((s) => s.every((o) => o < tol || o > ig))
    if (sor === -1) { foglalt.push([]); sor = foglalt.length - 1 }
    for (let o = tol; o <= ig; o++) foglalt[sor].push(o)
    savok.push({ v, tol, ig, sor, korabbrol: a < 0, tovabb: z > utolsoOszlop })
  }
  return { savok, sorok: foglalt.length }
}
