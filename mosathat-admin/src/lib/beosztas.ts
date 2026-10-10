import { helyiNap, idoPercbe, percEjfeltol } from './format'
import { tobbnaposE } from './savok'
import { eloE } from './types'

export type MunkaFajta = 'FIX' | 'RUGALMAS' | 'TOBBNAPOS' | 'KESZ'

export const PUFFER_PERC = 10

export interface Munka {
  id: string
  cimke: string
  fajta: MunkaFajta
  tol: number
  hatarido: number
  perc: number
  kerdojeles?: boolean
  probabeli?: boolean
  keres?: boolean
}

export interface Negyed {
  tol: number
  ig: number
  helyek: number
}

export interface Darab {
  id: string
  tol: number
  ig: number
  sor: number
}

export interface Eredmeny {
  darabok: Darab[]
  kesz: Map<string, number>
  keses: Map<string, number>
  maradt: Map<string, number>
  tulfoglalt: number[]
  sorok: number
}

function rang(m: Munka): number {
  if (m.probabeli) return 4
  if (m.kerdojeles) return 3
  if (m.fajta === 'TOBBNAPOS') return 2
  return 1
}

export function beoszt(negyedek: Negyed[], munkak: Munka[], most: number | null = null): Eredmeny {
  const maradek = new Map<string, number>()
  for (const m of munkak) maradek.set(m.id, Math.max(0, m.perc))

  const kesz = new Map<string, number>()
  const keses = new Map<string, number>()
  const tulfoglalt: number[] = []
  const elozoSor = new Map<string, number>()
  const darabok: Darab[] = []
  const nyitott = new Map<string, Darab>()
  let sorok = Math.max(0, ...negyedek.map((n) => n.helyek))

  const fixek = munkak.filter((m) => m.fajta === 'FIX')
  const rugalmasak = munkak.filter((m) => m.fajta !== 'FIX')

  for (const n of negyedek) {
    const hossz = n.ig - n.tol

    const fixMost = fixek.filter((m) => m.perc > 0 && m.tol < n.ig && n.tol < m.tol + m.perc)
    if (fixMost.length > n.helyek) tulfoglalt.push(n.tol)

    const szabad = Math.max(0, n.helyek - fixMost.length)
    const sorrendben = rugalmasak
      .filter((m) => (maradek.get(m.id) ?? 0) > 0 && m.tol <= n.tol
        && (m.fajta !== 'KESZ' || n.tol < m.hatarido)
        && (most === null || !m.probabeli || n.tol >= most))
      .sort((a, b) => (a.fajta === 'KESZ' ? 0 : 1) - (b.fajta === 'KESZ' ? 0 : 1)
        || (rang(a) >= 3 ? 1 : 0) - (rang(b) >= 3 ? 1 : 0)
        || a.hatarido - b.hatarido || rang(a) - rang(b) || a.tol - b.tol)
    const jeloltek = sorrendben.slice(0, szabad)
    for (const m of sorrendben.slice(szabad)) {
      if (m.fajta === 'KESZ' && (maradek.get(m.id) ?? 0) >= m.hatarido - n.tol) jeloltek.push(m)
    }

    const itt = [...fixMost, ...jeloltek]
    const foglalt = new Set<number>()
    const sorKi = new Map<string, number>()
    for (const m of itt) {
      const s = elozoSor.get(m.id)
      if (s !== undefined && !foglalt.has(s)) { sorKi.set(m.id, s); foglalt.add(s) }
    }
    for (const m of itt) {
      if (sorKi.has(m.id)) continue
      let s = 0
      while (foglalt.has(s)) s++
      sorKi.set(m.id, s)
      foglalt.add(s)
      sorok = Math.max(sorok, s + 1)
    }

    elozoSor.clear()
    for (const m of itt) {
      const s = sorKi.get(m.id)!
      elozoSor.set(m.id, s)
      let ig = n.ig
      if (m.fajta !== 'FIX') {
        const r = maradek.get(m.id) ?? 0
        const dolgozik = Math.min(hossz, r)
        maradek.set(m.id, r - dolgozik)
        ig = n.tol + dolgozik
        if (r - dolgozik <= 0) kesz.set(m.id, ig)
      } else {
        ig = Math.min(n.ig, m.tol + m.perc)
        if (m.tol + m.perc <= n.ig) kesz.set(m.id, m.tol + m.perc)
      }
      const tol = Math.max(n.tol, m.fajta === 'FIX' ? m.tol : n.tol)
      const d = nyitott.get(m.id)
      if (d && d.sor === s && d.ig === n.tol) {
        d.ig = ig
      } else {
        const uj = { id: m.id, tol, ig, sor: s }
        darabok.push(uj)
        nyitott.set(m.id, uj)
      }
    }
    for (const id of [...nyitott.keys()]) if (!sorKi.has(id)) nyitott.delete(id)
  }

  const maradt = new Map<string, number>()
  for (const m of rugalmasak) {
    if (m.fajta === 'KESZ') continue
    const r = maradek.get(m.id) ?? 0
    if (r > 0) maradt.set(m.id, r)
    const k = kesz.get(m.id)
    if (k !== undefined && k > m.hatarido) keses.set(m.id, k - m.hatarido)
  }

  return { darabok, kesz, keses, maradt, tulfoglalt, sorok }
}

export function beferMeg(negyedek: Negyed[], munkak: Munka[], perc: number,
                         most: number | null = null, legfeljebb = 30): number {
  if (!perc || perc <= 0 || negyedek.length === 0) return 0
  const nyit = negyedek[0].tol
  const zar = negyedek[negyedek.length - 1].ig
  const tol = most === null ? nyit : Math.max(nyit, most)
  let db = 0
  while (db < legfeljebb) {
    const proba: Munka[] = Array.from({ length: db + 1 }, (_, i) => ({
      id: `__proba${i}`, cimke: 'Start', fajta: 'RUGALMAS', tol, hatarido: zar, perc, probabeli: true,
    }))
    const e = beoszt(negyedek, [...munkak, ...proba], most)
    const mindKesz = proba.every((p) => !e.maradt.has(p.id) && !e.keses.has(p.id))
    if (!mindKesz) break
    db++
  }
  return db
}

export function negyedekbol(sorok: { starts: string; ends: string; lanes: number }[]): Negyed[] {
  const ki: Negyed[] = []
  for (const s of sorok) {
    const tol = idoPercbe(s.starts)
    const ig = idoPercbe(s.ends)
    const elozo = ki[ki.length - 1]
    if (elozo && tol > elozo.ig) {
      for (let t = elozo.ig; t < tol; t += 15) ki.push({ tol: t, ig: Math.min(t + 15, tol), helyek: 0 })
    }
    ki.push({ tol, ig, helyek: s.lanes })
  }
  return ki
}

export interface FoglalasBeosztashoz {
  id: string
  status: string
  booking_type: string
  service_date: string
  last_day: string
  start_at: string | null
  drop_off_at: string | null
  pick_up_at: string | null
  deadline_at: string | null
  planned_duration_minutes: number
  napi_perc?: number | null
  kezdve?: string | null
  befejezve?: string | null
  tentative?: boolean
  not_fitted?: boolean
}

export function munkakNapra(foglalasok: FoglalasBeosztashoz[], nap: string, nyit: number, zar: number,
                            cimke: (b: FoglalasBeosztashoz) => string,
                            most: number | null = null): { munkak: Munka[]; idoNelkul: string[] } {
  const munkak: Munka[] = []
  const idoNelkul: string[] = []

  for (const b of foglalasok) {
    if (!eloE(b.status) || b.not_fitted) continue
    const tobbnapos = tobbnaposE(b)
    const perc = tobbnapos ? Math.round(b.napi_perc ?? 0) : b.planned_duration_minutes
    const keszE = b.status === 'READY' || b.status === 'COMPLETED'

    if (keszE) {
      if (b.befejezve && helyiNap(b.befejezve) < nap) continue
      if (!perc || perc <= 0) continue
      const hozza = b.drop_off_at ?? b.start_at
      const lehet: number[] = []
      if (hozza && helyiNap(hozza) === nap) lehet.push(percEjfeltol(hozza))
      if (b.kezdve && helyiNap(b.kezdve) === nap) lehet.push(percEjfeltol(b.kezdve))
      let tol = lehet.length > 0 ? Math.min(...lehet) : nyit
      let ig = b.befejezve && helyiNap(b.befejezve) === nap ? percEjfeltol(b.befejezve) : zar
      if (ig - tol < perc) tol = Math.max(nyit, ig - perc)
      if (ig - tol < perc) ig = tol + perc
      munkak.push({ id: b.id, cimke: cimke(b), fajta: 'KESZ', tol, hatarido: ig, perc })
      continue
    }

    if (!perc || perc <= 0) {
      if (!tobbnapos) idoNelkul.push(cimke(b))
      continue
    }

    if (b.booking_type === 'VAROS' && b.start_at && helyiNap(b.start_at) === nap) {
      munkak.push({ id: b.id, cimke: cimke(b), fajta: 'FIX', tol: percEjfeltol(b.start_at),
                    hatarido: percEjfeltol(b.start_at) + perc, perc, kerdojeles: b.tentative,
                    keres: b.status === 'REQUESTED' })
      continue
    }

    const hozza = b.drop_off_at ?? b.start_at
    const viszi = b.pick_up_at ?? b.deadline_at
    let tol = hozza && helyiNap(hozza) === nap ? percEjfeltol(hozza) : nyit
    if (most !== null && (b.status === 'CONFIRMED' || b.status === 'REQUESTED')) tol = Math.max(tol, most)
    const hatarido = viszi && helyiNap(viszi) === nap ? percEjfeltol(viszi) : zar
    munkak.push({ id: b.id, cimke: cimke(b), fajta: tobbnapos ? 'TOBBNAPOS' : 'RUGALMAS',
                  tol, hatarido: Math.max(hatarido, tol), perc, kerdojeles: b.tentative,
                  keres: b.status === 'REQUESTED' })
  }
  return { munkak, idoNelkul }
}
