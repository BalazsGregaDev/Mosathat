import { createContext, Fragment, useContext, useMemo, type ReactNode } from 'react'

import {
  cegbol, GOOGLE_KERESES, jogibol, kitolt, szovegAlap, URES_TARTALOM, uzletbol, uzletValtozok,
  type CegAdatok, type JogiAdatok, type PublikusTartalomNyers, type SzovegKulcs, type Uzlet, type Valtozok, type Velemeny,
} from '../../lib/publikusTartalom'
import { formatum, type Formatum, type Nyelv } from '../../lib/nyelv'
import { URES_GYIK, type GyikPublikus } from '../../lib/gyik'

export type Sz = (kulcs: SzovegKulcs, extra?: Valtozok) => string

interface TartalomErtek {
  sz: Sz
  u: Uzlet
  ceg: CegAdatok
  jogi: JogiAdatok
  nyelv: Nyelv
  f: Formatum
  velemenyek: Velemeny[]
  google: string
  gyik: GyikPublikus
}

export type Jelolo = (kulcs: SzovegKulcs, szoveg: string) => string

function ertekbol(t: PublikusTartalomNyers, lemondasOra?: number, nyelv: Nyelv = 'hu', jelolo?: Jelolo): TartalomErtek {
  const u = uzletbol(t, nyelv)
  const valtozok = uzletValtozok(u, lemondasOra)
  const sajatok = nyelv === 'en' ? t.szovegek_en ?? {} : t.szovegek
  const alap = szovegAlap(nyelv)
  const sz: Sz = (kulcs, extra) => {
    const sajat = sajatok[kulcs]
    const sablon = sajat && sajat.trim() ? sajat : alap[kulcs]
    const kesz = kitolt(sablon, extra ? { ...valtozok, ...extra } : valtozok)
    return jelolo ? jelolo(kulcs, kesz) : kesz
  }
  return {
    sz, u, ceg: cegbol(t, u), jogi: jogibol(t, u, nyelv), nyelv, f: formatum(nyelv),
    velemenyek: t.velemenyek ?? [], gyik: t.gyik ?? URES_GYIK, google: t.adatok.google_ertekeles?.trim() || GOOGLE_KERESES,
  }
}

const Ctx = createContext<TartalomErtek>(ertekbol(URES_TARTALOM))

export function TartalomProvider({ t, lemondasOra, nyelv = 'hu', jelolo, children }: {
  t: PublikusTartalomNyers
  lemondasOra?: number
  nyelv?: Nyelv
  jelolo?: Jelolo
  children: ReactNode
}) {
  const ertek = useMemo(() => ertekbol(t, lemondasOra, nyelv, jelolo), [t, lemondasOra, nyelv, jelolo])
  return <Ctx.Provider value={ertek}>{children}</Ctx.Provider>
}

export const useSz = () => useContext(Ctx).sz
export const useUzlet = () => useContext(Ctx).u
export const useCeg = () => useContext(Ctx).ceg
export const useJogi = () => useContext(Ctx).jogi
export const useNyelv = () => useContext(Ctx).nyelv
export const useFormatum = () => useContext(Ctx).f
export const useVelemenyek = () => useContext(Ctx).velemenyek
export const useGoogle = () => useContext(Ctx).google
export const useGyik = () => useContext(Ctx).gyik

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
