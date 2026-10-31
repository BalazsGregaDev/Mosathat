import type { Nyelv } from './nyelv'

export type KepHely = 'FELETT' | 'ALATT'
export type Igazitas = 'BAL' | 'KOZEP' | 'JOBB'
export type KepMeret = 'KICSI' | 'KOZEPES' | 'NAGY' | 'TELJES'

export interface Felugro {
  aktiv: boolean
  cim: string
  szoveg: string
  cim_en: string
  szoveg_en: string
  valtozat?: string
}

export interface Egyedi {
  aktiv: boolean
  szoveg: string
  szoveg_en: string
  kepek: string[]
  kep_hely: KepHely
  igazitas: Igazitas
  meret: KepMeret
}

export interface BejelentesAdat {
  felugro: Felugro
  egyedi: Egyedi
}

export const URES_FELUGRO: Felugro = { aktiv: false, cim: '', szoveg: '', cim_en: '', szoveg_en: '' }

export const URES_EGYEDI: Egyedi = {
  aktiv: false, szoveg: '', szoveg_en: '', kepek: [], kep_hely: 'FELETT', igazitas: 'KOZEP', meret: 'KOZEPES',
}

export const MAX_KEP = 3

export const KEP_HELYEK: { id: KepHely; cimke: string }[] = [
  { id: 'FELETT', cimke: 'Szöveg felett' },
  { id: 'ALATT', cimke: 'Szöveg alatt' },
]

export const IGAZITASOK: { id: Igazitas; cimke: string }[] = [
  { id: 'BAL', cimke: 'Balra' },
  { id: 'KOZEP', cimke: 'Középre' },
  { id: 'JOBB', cimke: 'Jobbra' },
]

export const KEP_MERETEK: { id: KepMeret; cimke: string }[] = [
  { id: 'KICSI', cimke: 'Kicsi' },
  { id: 'KOZEPES', cimke: 'Közepes' },
  { id: 'NAGY', cimke: 'Nagy' },
  { id: 'TELJES', cimke: 'Teljes szélesség' },
]

export function felugroSzoveg(f: Felugro, nyelv: Nyelv): { cim: string; szoveg: string } {
  if (nyelv === 'en' && f.szoveg_en.trim()) return { cim: f.cim_en.trim(), szoveg: f.szoveg_en.trim() }
  return { cim: f.cim.trim(), szoveg: f.szoveg.trim() }
}

export function egyediSzoveg(e: Egyedi, nyelv: Nyelv): string {
  return (nyelv === 'en' ? e.szoveg_en.trim() || e.szoveg : e.szoveg).trim()
}

export function felugroLathato(f: Felugro | null | undefined): f is Felugro {
  return Boolean(f && f.aktiv && f.szoveg.trim())
}

export function egyediLathato(e: Egyedi | null | undefined): e is Egyedi {
  return Boolean(e && e.aktiv && (e.szoveg.trim() || e.kepek.length > 0))
}

export function felugroBol(n: Partial<Felugro> | null | undefined): Felugro | null {
  if (!n) return null
  return {
    aktiv: Boolean(n.aktiv), cim: n.cim ?? '', szoveg: n.szoveg ?? '', cim_en: n.cim_en ?? '', szoveg_en: n.szoveg_en ?? '',
    valtozat: n.valtozat,
  }
}

export function egyediBol(n: Partial<Egyedi> | null | undefined): Egyedi | null {
  if (!n) return null
  return {
    aktiv: Boolean(n.aktiv),
    szoveg: n.szoveg ?? '',
    szoveg_en: n.szoveg_en ?? '',
    kepek: Array.isArray(n.kepek) ? n.kepek.filter((k): k is string => typeof k === 'string').slice(0, MAX_KEP) : [],
    kep_hely: n.kep_hely === 'ALATT' ? 'ALATT' : 'FELETT',
    igazitas: n.igazitas === 'BAL' || n.igazitas === 'JOBB' ? n.igazitas : 'KOZEP',
    meret: n.meret === 'KICSI' || n.meret === 'NAGY' || n.meret === 'TELJES' ? n.meret : 'KOZEPES',
  }
}
