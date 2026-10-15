import { napKulonbseg } from './format'
import type { DayBooking, VacationRow } from './types'

interface Hely {
  tol: number
  ig: number
  sor: number
  korabbrol: boolean
  tovabb: boolean
}

export interface Sav extends Hely {
  b: DayBooking
}

export interface SzabadsagSav extends Hely {
  v: VacationRow
}

export const tobbnaposE = (b: Pick<DayBooking, 'last_day' | 'service_date'>) =>
  b.last_day.slice(0, 10) > b.service_date.slice(0, 10)

function elhelyez<T>(lista: T[], hetfo: string, oszlopok: number,
                     elso: (x: T) => string, utolso: (x: T) => string): { helyek: (Hely & { x: T })[]; sorok: number } {
  const utolsoOszlop = oszlopok - 1
  const foglalt: number[][] = []
  const helyek: (Hely & { x: T })[] = []
  for (const x of lista) {
    const a = napKulonbseg(hetfo, elso(x))
    const z = napKulonbseg(hetfo, utolso(x))
    const tol = Math.max(0, a)
    const ig = Math.min(utolsoOszlop, z)
    if (ig < tol) continue
    let sor = foglalt.findIndex((s) => s.every((o) => o < tol || o > ig))
    if (sor === -1) { foglalt.push([]); sor = foglalt.length - 1 }
    for (let o = tol; o <= ig; o++) foglalt[sor].push(o)
    helyek.push({ x, tol, ig, sor, korabbrol: a < 0, tovabb: z > utolsoOszlop })
  }
  return { helyek, sorok: foglalt.length }
}

export function hetiSavok(foglalasok: DayBooking[], hetfo: string, oszlopok: number):
  { savok: Sav[]; sorok: number } {
  const tobb = foglalasok.filter(tobbnaposE)
    .sort((a, z) => a.service_date.localeCompare(z.service_date) || a.plate_raw.localeCompare(z.plate_raw))
  const { helyek, sorok } = elhelyez(tobb, hetfo, oszlopok, (b) => b.service_date, (b) => b.last_day)
  return { savok: helyek.map(({ x, ...h }) => ({ b: x, ...h })), sorok }
}

export function hetiSzabadsagok(lista: VacationRow[], hetfo: string, oszlopok: number):
  { savok: SzabadsagSav[]; sorok: number } {
  const rendben = lista.slice()
    .sort((a, z) => a.from_day.localeCompare(z.from_day) || a.staff_name.localeCompare(z.staff_name))
  const { helyek, sorok } = elhelyez(rendben, hetfo, oszlopok, (v) => v.from_day, (v) => v.to_day)
  return { savok: helyek.map(({ x, ...h }) => ({ v: x, ...h })), sorok }
}
