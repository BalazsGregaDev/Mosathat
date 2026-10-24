import type { Nyelv } from './nyelv'

export type GyikKategoria = 'KULSO' | 'BELSO' | 'EGYEB'
export type GyikMod = 'VALOGATOTT' | 'VELETLEN'

export const GYIK_KATEGORIAK: GyikKategoria[] = ['KULSO', 'BELSO', 'EGYEB']

export interface GyikKerdes {
  id: string
  kerdes: string
  valasz: string
  kerdes_en: string | null
  valasz_en: string | null
  kategoria: GyikKategoria
  kiemelt: boolean
}

export interface GyikSor extends GyikKerdes {
  publikalt: boolean
  publikalva_at?: string | null
  updated_at?: string | null
}

export interface GyikPublikus {
  mod: GyikMod
  max: number
  kerdesek: GyikKerdes[]
}

export interface GyikAdmin {
  mod: GyikMod
  max: number
  kerdesek: GyikSor[]
}

export const URES_GYIK: GyikPublikus = { mod: 'VALOGATOTT', max: 5, kerdesek: [] }

export interface GyikMegjelenes {
  id: string
  kerdes: string
  valasz: string
  kategoria: GyikKategoria
}

export function nyelvre(k: GyikKerdes, nyelv: Nyelv): GyikMegjelenes {
  const en = nyelv === 'en'
  return {
    id: k.id,
    kerdes: (en && k.kerdes_en?.trim()) || k.kerdes,
    valasz: (en && k.valasz_en?.trim()) || k.valasz,
    kategoria: k.kategoria,
  }
}

function keveres<T>(l: T[], veletlen: () => number = Math.random): T[] {
  const x = [...l]
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(veletlen() * (i + 1))
    ;[x[i], x[j]] = [x[j], x[i]]
  }
  return x
}

export function fooldalra(g: GyikPublikus, veletlen: () => number = Math.random): GyikKerdes[] {
  const max = Math.max(1, Math.min(20, g.max || 5))
  if (g.mod === 'VELETLEN') return keveres(g.kerdesek, veletlen).slice(0, max)
  const kiemelt = g.kerdesek.filter((k) => k.kiemelt)
  return (kiemelt.length ? kiemelt : g.kerdesek).slice(0, max)
}

export function simaSzoveg(html: string): string {
  return html
    .replace(/<(br|\/p|\/li|\/h[1-6])\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function uresValasz(html: string): boolean {
  return simaSzoveg(html) === '' && !/<img\b/i.test(html)
}
