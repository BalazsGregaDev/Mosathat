import type { ReactNode } from 'react'

import { datumAngolul, FELIRAT } from '../../lib/nyelv'
import { useJogi, useNyelv } from './tartalom'

const CIMKE = {
  hu: { adatok: 'Kezelt adatok', cel: 'Cél', jogalap: 'Jogalap', megorzes: 'Megőrzés' },
  en: { adatok: 'Data processed', cel: 'Purpose', jogalap: 'Legal basis', megorzes: 'Retention' },
} as const

export function Keret({ cim, children }: { cim: string; children: ReactNode }) {
  const jogi = useJogi()
  const nyelv = useNyelv()
  const f = FELIRAT[nyelv]
  return (
    <article className="kv-jogi">
      {jogi.tervezet && <p className="kv-jogi-tervezet" role="note">{f.tervezet}</p>}
      <h1>{cim}</h1>
      <p className="kv-jogi-hataly">{f.hatalyos}: {nyelv === 'en' ? datumAngolul(jogi.hataly) : jogi.hataly}</p>
      {nyelv === 'en' && <p className="kv-jogi-halk">{f.forditas}</p>}
      {children}
    </article>
  )
}

export function Sor({ cimke, children }: { cimke: string; children: ReactNode }) {
  return (
    <div className="kv-jogi-sor">
      <dt>{cimke}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export function Level({ cim }: { cim: string }) {
  return <a href={`mailto:${cim}`}>{cim}</a>
}

export function Adatkezeles({ cim, adatok, cel, jogalap, megorzes, children }: {
  cim: string
  adatok: ReactNode
  cel: ReactNode
  jogalap: ReactNode
  megorzes: ReactNode
  children?: ReactNode
}) {
  const c = CIMKE[useNyelv()]
  return (
    <section className="kv-jogi-kezeles">
      <h3>{cim}</h3>
      <dl className="kv-jogi-adatok">
        <Sor cimke={c.adatok}>{adatok}</Sor>
        <Sor cimke={c.cel}>{cel}</Sor>
        <Sor cimke={c.jogalap}>{jogalap}</Sor>
        <Sor cimke={c.megorzes}>{megorzes}</Sor>
      </dl>
      {children}
    </section>
  )
}
