import { createContext, Fragment, useContext, useMemo, type ReactNode } from 'react'

import {
  cegbol, jogibol, kitolt, SZOVEG_ALAP, URES_TARTALOM, uzletbol, uzletValtozok,
  type CegAdatok, type JogiAdatok, type PublikusTartalomNyers, type SzovegKulcs, type Uzlet, type Valtozok,
} from '../../lib/publikusTartalom'

export type Sz = (kulcs: SzovegKulcs, extra?: Valtozok) => string

interface TartalomErtek {
  sz: Sz
  u: Uzlet
  ceg: CegAdatok
  jogi: JogiAdatok
}

function ertekbol(t: PublikusTartalomNyers, lemondasOra?: number): TartalomErtek {
  const u = uzletbol(t)
  const valtozok = uzletValtozok(u, lemondasOra)
  const sz: Sz = (kulcs, extra) => {
    const sajat = t.szovegek[kulcs]
    const sablon = sajat && sajat.trim() ? sajat : SZOVEG_ALAP[kulcs]
    return kitolt(sablon, extra ? { ...valtozok, ...extra } : valtozok)
  }
  return { sz, u, ceg: cegbol(t, u), jogi: jogibol(t, u) }
}

const Ctx = createContext<TartalomErtek>(ertekbol(URES_TARTALOM))

export function TartalomProvider({ t, lemondasOra, children }: {
  t: PublikusTartalomNyers
  lemondasOra?: number
  children: ReactNode
}) {
  const ertek = useMemo(() => ertekbol(t, lemondasOra), [t, lemondasOra])
  return <Ctx.Provider value={ertek}>{children}</Ctx.Provider>
}

export const useSz = () => useContext(Ctx).sz
export const useUzlet = () => useContext(Ctx).u
export const useCeg = () => useContext(Ctx).ceg
export const useJogi = () => useContext(Ctx).jogi

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
