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

export type BejelentesTipus = 'FELUGRO' | 'EGYEDI'

export interface Bejelentes {
  id: string | null
  tipus: BejelentesTipus
  aktiv: boolean
  kezdes: string | null
  zaras: string | null
  cim: string
  szoveg: string
  cim_en: string
  szoveg_en: string
  kepek: string[]
  kep_hely: KepHely
  igazitas: Igazitas
  meret: KepMeret
  updated_at?: string
}

export type IdozitesAllapot = 'MOST' | 'IDOZITVE' | 'KI' | 'LEJART'

export const ALLAPOT_CIMKE: Record<IdozitesAllapot, string> = {
  MOST: 'Most látszik',
  IDOZITVE: 'Időzítve',
  KI: 'Kikapcsolva',
  LEJART: 'Lejárt',
}

export function ujBejelentes(tipus: BejelentesTipus): Bejelentes {
  return {
    id: null, tipus, aktiv: true, kezdes: null, zaras: null, cim: '', szoveg: '', cim_en: '', szoveg_en: '',
    kepek: [], kep_hely: 'FELETT', igazitas: 'KOZEP', meret: 'KOZEPES',
  }
}

export function bejelentesBol(n: Partial<Bejelentes> & { tipus: BejelentesTipus }): Bejelentes {
  const e = egyediBol(n)
  return {
    id: n.id ?? null, tipus: n.tipus, aktiv: n.aktiv ?? true, kezdes: n.kezdes ?? null, zaras: n.zaras ?? null,
    cim: n.cim ?? '', szoveg: n.szoveg ?? '', cim_en: n.cim_en ?? '', szoveg_en: n.szoveg_en ?? '',
    kepek: e?.kepek ?? [], kep_hely: e?.kep_hely ?? 'FELETT', igazitas: e?.igazitas ?? 'KOZEP', meret: e?.meret ?? 'KOZEPES',
    updated_at: n.updated_at,
  }
}

export function idozitesAllapot(b: Pick<Bejelentes, 'aktiv' | 'kezdes' | 'zaras'>, most: number): IdozitesAllapot {
  if (!b.aktiv) return 'KI'
  if (b.zaras && Date.parse(b.zaras) <= most) return 'LEJART'
  if (b.kezdes && Date.parse(b.kezdes) > most) return 'IDOZITVE'
  return 'MOST'
}

const ALLAPOT_SOR: Record<IdozitesAllapot, number> = { MOST: 0, IDOZITVE: 1, KI: 2, LEJART: 3 }

export function idozitesSorrend(l: Bejelentes[], most: number): Bejelentes[] {
  return [...l].sort((a, b) => {
    const aa = idozitesAllapot(a, most)
    const ba = idozitesAllapot(b, most)
    if (aa !== ba) return ALLAPOT_SOR[aa] - ALLAPOT_SOR[ba]
    if (aa === 'LEJART') return Date.parse(b.zaras ?? '') - Date.parse(a.zaras ?? '')
    return (a.kezdes ? Date.parse(a.kezdes) : -Infinity) - (b.kezdes ? Date.parse(b.kezdes) : -Infinity)
  })
}

export function idoszakUtkozik(a: Pick<Bejelentes, 'kezdes' | 'zaras'>, b: Pick<Bejelentes, 'kezdes' | 'zaras'>): boolean {
  const ak = a.kezdes ? Date.parse(a.kezdes) : -Infinity
  const az = a.zaras ? Date.parse(a.zaras) : Infinity
  const bk = b.kezdes ? Date.parse(b.kezdes) : -Infinity
  const bz = b.zaras ? Date.parse(b.zaras) : Infinity
  return ak < bz && bk < az
}

const IDO = new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Budapest' })
const IDO_EVVEL = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Budapest' })

export function idoCimke(iso: string, most: number): string {
  const d = new Date(iso)
  const evvel = d.getFullYear() !== new Date(most).getFullYear()
  return (evvel ? IDO_EVVEL : IDO).format(d)
}

export function idoszakCimke(b: Pick<Bejelentes, 'kezdes' | 'zaras'>, most: number): string {
  const tol = b.kezdes ? idoCimke(b.kezdes, most) : 'azonnal'
  const ig = b.zaras ? idoCimke(b.zaras, most) : 'visszavonásig'
  return `${tol} – ${ig}`
}

export function bejelentesNev(b: Pick<Bejelentes, 'tipus' | 'cim' | 'szoveg' | 'kepek'>): string {
  const elso = b.szoveg.split('\n')[0].replace(/\*/g, '').trim()
  if (b.tipus === 'FELUGRO' && b.cim.trim()) return b.cim.trim()
  if (elso) return elso.length > 60 ? `${elso.slice(0, 57)}…` : elso
  if (b.kepek.length) return `Csak képek (${b.kepek.length})`
  return b.tipus === 'FELUGRO' ? 'Új felugró ablak' : 'Új egyedi szekció'
}

export function helyiIdo(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const k = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${k(d.getMonth() + 1)}-${k(d.getDate())}T${k(d.getHours())}:${k(d.getMinutes())}`
}

export function isoIdo(helyi: string): string | null {
  if (!helyi) return null
  const d = new Date(helyi)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
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
