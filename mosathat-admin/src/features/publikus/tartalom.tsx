import { createContext, Fragment, useContext, useMemo, type ReactNode } from 'react'

import {
  cegbol, jogibol, kitolt, szovegAlap, URES_TARTALOM, uzletbol, uzletValtozok,
  type CegAdatok, type JogiAdatok, type PublikusTartalomNyers, type SzovegKulcs, type Uzlet, type Valtozok,
} from '../../lib/publikusTartalom'
import { formatum, type Formatum, type Nyelv } from '../../lib/nyelv'

export type Sz = (kulcs: SzovegKulcs, extra?: Valtozok) => string

interface TartalomErtek {
  sz: Sz
  u: Uzlet
  ceg: CegAdatok
  jogi: JogiAdatok
  nyelv: Nyelv
  f: Formatum
}

function ertekbol(t: PublikusTartalomNyers, lemondasOra?: number, nyelv: Nyelv = 'hu'): TartalomErtek {
  const u = uzletbol(t, nyelv)
  const valtozok = uzletValtozok(u, lemondasOra)
  const sajatok = nyelv === 'en' ? t.szovegek_en ?? {} : t.szovegek
  const alap = szovegAlap(nyelv)
  const sz: Sz = (kulcs, extra) => {
    const sajat = sajatok[kulcs]
    const sablon = sajat && sajat.trim() ? sajat : alap[kulcs]
    return kitolt(sablon, extra ? { ...valtozok, ...extra } : valtozok)
  }
  return { sz, u, ceg: cegbol(t, u), jogi: jogibol(t, u, nyelv), nyelv, f: formatum(nyelv) }
}

const Ctx = createContext<TartalomErtek>(ertekbol(URES_TARTALOM))

export function TartalomProvider({ t, lemondasOra, nyelv = 'hu', children }: {
  t: PublikusTartalomNyers
  lemondasOra?: number
  nyelv?: Nyelv
  children: ReactNode
}) {
  const ertek = useMemo(() => ertekbol(t, lemondasOra, nyelv), [t, lemondasOra, nyelv])
  return <Ctx.Provider value={ertek}>{children}</Ctx.Provider>
}

export const useSz = () => useContext(Ctx).sz
export const useUzlet = () => useContext(Ctx).u
export const useCeg = () => useContext(Ctx).ceg
export const useJogi = () => useContext(Ctx).jogi
export const useNyelv = () => useContext(Ctx).nyelv
export const useFormatum = () => useContext(Ctx).f

export function forditott<T extends { name: string; name_en?: string | null }>(x: T, nyelv: Nyelv): string {
  return nyelv === 'en' ? x.name_en?.trim() || x.name : x.name
}

export function telefonLink(telefon: string): string {
  return `tel:${telefon.replace(/[^\d+]/g, '')}`
}

function sorbol(sor: string, Kiemeles: 'em' | 'strong', linkek: Record<string, string>): ReactNode[] {
  const darabok = sor.split(/(\*[^*]+\*)/g).filter((d) => d !== '')
  return darabok.map((d, i) => {
    if (d.length > 2 && d.startsWith('*') && d.endsWith('*')) return <Kiemeles key={i}>{d.slice(1, -1)}</Kiemeles>
    const minta = Object.keys(linkek).filter((k) => k !== '')
    if (minta.length === 0) return <Fragment key={i}>{d}</Fragment>
    const re = new RegExp(`(${minta.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
    return (
      <Fragment key={i}>
        {d.split(re).map((x, j) => (linkek[x] ? <a key={j} href={linkek[x]}>{x}</a> : <Fragment key={j}>{x}</Fragment>))}
      </Fragment>
    )
  })
}

export function Gazdag({ s, kiemeles = 'em', linkek = {} }: {
  s: string
  kiemeles?: 'em' | 'strong'
  linkek?: Record<string, string>
}) {
  const sorok = s.split('\n')
  return (
    <>
      {sorok.map((sor, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {sorbol(sor, kiemeles, linkek)}
        </Fragment>
      ))}
    </>
  )
}
