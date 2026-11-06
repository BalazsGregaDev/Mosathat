import { napKulonbseg } from './format'
import type { AbsenceRow, DayBooking, VacationRow } from './types'
import { VALTOZAS_FAJTAK, valtozasRovid } from './munkaido'

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

export interface TavolletSav extends Hely {
  id: string
  felirat: string
  leiras: string
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

interface Tavollet {
  id: string
  tol: string
  ig: string
  nev: string
  felirat: string
  leiras: string
}

function tavolletCim(a: AbsenceRow): string {
  const cimke = VALTOZAS_FAJTAK.find((f) => f.kind === a.kind)?.cimke ?? ''
  const ido = a.kind === 'EGESZ_NAP' ? '' : a.kind === 'TAVOL' ? ` ${a.starts}–${a.ends}`
    : ` ${a.kind === 'KESOBB_ERKEZIK' ? a.ends : a.starts}`
  return `${cimke}${ido}`
}

function tavolletek(szabadsagok: VacationRow[], valtozasok: AbsenceRow[]): Tavollet[] {
  const lista: Tavollet[] = []
  for (const v of szabadsagok) {
    const megj = (v.note ?? '').trim()
    lista.push({
      id: `sz-${v.id}`, tol: v.from_day.slice(0, 10), ig: v.to_day.slice(0, 10), nev: v.staff_name,
      felirat: `${v.staff_name} · ${megj || 'szabadság'}`,
      leiras: `Szabadság: ${v.staff_name}${megj ? ` · ${megj}` : ''}`,
    })
  }
  for (const a of valtozasok) {
    const megj = (a.note ?? '').trim()
    const nap = a.day.slice(0, 10)
    lista.push({
      id: `mv-${a.id}`, tol: nap, ig: nap, nev: a.staff_name,
      felirat: `${a.staff_name} · ${a.kind === 'EGESZ_NAP' && megj ? megj : valtozasRovid(a)}`,
      leiras: `${a.staff_name}: ${tavolletCim(a)}${megj ? ` · ${megj}` : ''}`,
    })
  }
  return lista.sort((a, z) => a.tol.localeCompare(z.tol) || a.nev.localeCompare(z.nev))
}

export function hetiTavolletek(szabadsagok: VacationRow[], valtozasok: AbsenceRow[], hetfo: string, oszlopok: number):
  { savok: TavolletSav[]; sorok: number } {
  const { helyek, sorok } = elhelyez(tavolletek(szabadsagok, valtozasok), hetfo, oszlopok, (t) => t.tol, (t) => t.ig)
  return {
    savok: helyek.map(({ x, ...h }) => ({ id: x.id, felirat: x.felirat, leiras: x.leiras, ...h })),
    sorok,
  }
}
