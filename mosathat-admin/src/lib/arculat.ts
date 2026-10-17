import type { Catalog } from '../data/source'
import { formatum, type Nyelv } from './nyelv'
import type { ServiceArea, VehicleCategory } from './types'

export type KoncepcioKod = '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08'
export type Mod = 'VILAGOS' | 'SOTET'

export const KONCEPCIOK: { kod: KoncepcioKod; nev: string; leiras: string }[] = [
  { kod: '01', nev: 'Adatlap', leiras: 'Szervizkönyv-esztétika: vonalak, monospace feliratok, sorszámozott sorok' },
  { kod: '02', nev: 'Mélygarázs', leiras: 'Beton, felfestett vonalak, keskeny ipari nagybetűk' },
  { kod: '03', nev: 'Magazin', leiras: 'Talpas cím, sok levegő, a fotó viszi az oldalt' },
  { kod: '04', nev: 'Showroom', leiras: 'Majdnem üres oldal, vékony betű, egy vonal' },
  { kod: '05', nev: 'Jelzőtábla', leiras: 'Lapos színmezők, vastag keretek, csupa nagybetű' },
  { kod: '06', nev: 'Munkalap', leiras: 'Sorszám, perforáció, pecsét, írógépbetű' },
  { kod: '07', nev: 'Rács', leiras: '12 oszlopos rács, egyetlen betűcsalád' },
  { kod: '08', nev: 'Lakk', leiras: 'Mély lakkfelület egy fénycsíkkal' },
]

export const UZLET = {
  nev: 'Mosathat',
  irsz: '1138 Budapest',
  cim: 'Váci út 140.',
  haz: 'ONE Forty',
  szint: 'mélygarázs −1. szint',
  bejarat: 'Dagály utca felől',
  napok: 'Hétfő–Péntek',
  napokRovid: 'H–P',
  nyitas: '9:00',
  zaras: '17:00',
  leadas: '7:15',
  telefon: '+36 1 506 0420',
  kerulet: 'Budapest XIII.',
}

export const KATEGORIAK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']

export const KAT_NEV: Record<VehicleCategory, string> = {
  SZEMELYAUTO: 'Személygépjármű',
  SUV: 'SUV, Egyterű',
  KISBUSZ: 'Kisbusz, Furgon',
}

export const KAT_ALCIM: Record<VehicleCategory, string> = {
  SZEMELYAUTO: 'Személygépjármű — sedan, kombi, ferdehátú',
  SUV: 'SUV, egyterű',
  KISBUSZ: 'Kisbusz, furgon',
}

export type Cella = { tipus: 'van' } | { tipus: 'nincs' } | { tipus: 'mas'; szoveg: string; kiemelt: boolean }

export interface TablaSor {
  nev: string
  cellak: Cella[]
}

export interface TablaCsoport {
  terulet: ServiceArea
  cim: string
  sorok: TablaSor[]
}

export interface CsomagTabla {
  csomagok: { id: string; nev: string; ar: number | null }[]
  csoportok: TablaCsoport[]
  kulsoTol: number | null
  belsoTol: number | null
}

function kozosElotag(nevek: string[]): number {
  const szavak = nevek.map((n) => n.split(' '))
  const legrovidebb = Math.min(...szavak.map((s) => s.length))
  let k = 0
  while (k < legrovidebb - 1 && szavak.every((s) => s[k] === szavak[0][k])) k++
  return k
}

function valtozatok(nevek: (string | undefined)[], nyelv: Nyelv): Cella[] {
  const meglevo = nevek.filter((n): n is string => Boolean(n))
  const k = kozosElotag(meglevo)
  const alap = meglevo[0]
  const kisbetu = formatum(nyelv).kisbetu
  return nevek.map((n): Cella => (n
    ? { tipus: 'mas', szoveg: kisbetu(n.split(' ').slice(k).join(' ')), kiemelt: n !== alap }
    : { tipus: 'nincs' }))
}

function aktivCsomagok(k: Catalog) {
  return k.packages.filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order)
}

function arKereso(k: Catalog, kat: VehicleCategory) {
  return (id: string, scope: 'TELJES' | 'KULSO' | 'BELSO') => {
    const r = k.packagePricing.find((x) => x.package_id === id && x.category === kat && x.scope === scope)
    return r && !r.requires_quote ? r.price_huf : null
  }
}

export function kategoriaTol(k: Catalog): Record<VehicleCategory, number | null> {
  const aktiv = aktivCsomagok(k)
  const tol = (kat: VehicleCategory) => {
    const ar = arKereso(k, kat)
    const ertekek = aktiv.map((p) => ar(p.id, 'TELJES')).filter((v): v is number => v != null)
    return ertekek.length ? Math.min(...ertekek) : null
  }
  return { SZEMELYAUTO: tol('SZEMELYAUTO'), SUV: tol('SUV'), KISBUSZ: tol('KISBUSZ') }
}

export function csomagTabla(k: Catalog, kat: VehicleCategory = 'SZEMELYAUTO', nyelv: Nyelv = 'hu'): CsomagTabla {
  const en = nyelv === 'en'
  const aktiv = aktivCsomagok(k)
  const ar = arKereso(k, kat)
  const minimum = (scope: 'KULSO' | 'BELSO') => {
    const ertekek = aktiv.map((p) => ar(p.id, scope)).filter((v): v is number => v != null)
    return ertekek.length ? Math.min(...ertekek) : null
  }

  const sorok = new Map<string, { nev: string; terulet: ServiceArea; rend: number; cella: Record<string, string> }>()
  for (const r of k.packageItems) {
    let s = sorok.get(r.slot_id)
    if (!s) {
      s = { nev: (en && r.slot_name_en?.trim()) || r.slot_name, terulet: r.area, rend: r.sort_order, cella: {} }
      sorok.set(r.slot_id, s)
    }
    s.cella[r.package_id] = (en && r.name_en?.trim()) || r.name
  }

  const csoport = (terulet: ServiceArea, cim: string): TablaCsoport => ({
    terulet,
    cim,
    sorok: [...sorok.values()]
      .filter((s) => s.terulet === terulet)
      .sort((a, b) => a.rend - b.rend)
      .map((s) => {
        const nevek = aktiv.map((p) => s.cella[p.id])
        const elter = nevek.some((n) => n && n !== s.nev)
        return {
          nev: s.nev,
          cellak: elter
            ? valtozatok(nevek, nyelv)
            : nevek.map((n): Cella => (n ? { tipus: 'van' } : { tipus: 'nincs' })),
        }
      }),
  })

  return {
    csomagok: aktiv.map((p) => ({ id: p.id, nev: (en && p.name_en?.trim()) || p.name, ar: ar(p.id, 'TELJES') })),
    csoportok: [csoport('KULSO', 'Mosás'), csoport('BELSO', 'Takarítás')].filter((c) => c.sorok.length > 0),
    kulsoTol: minimum('KULSO'),
    belsoTol: minimum('BELSO'),
  }
}

export function szam(v: number | null): string {
  return v == null ? 'egyedi' : String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
}
