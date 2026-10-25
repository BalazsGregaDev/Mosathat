import type { ReactNode } from 'react'

export default function Szakasz({ cim, mellett, jelzo, jelzoCim, nev, children }: {
  cim: ReactNode
  mellett?: ReactNode
  jelzo?: number
  jelzoCim?: string
  nev: string
  children: ReactNode
}) {
  return (
    <details className="panel szolg-szakasz" data-szakasz={nev}>
      <summary>
        <span className="szolg-szakasz-cim">{cim}</span>
        {mellett && <span className="szolg-szakasz-mellett">{mellett}</span>}
        {jelzo ? <span className="jelzo" title={jelzoCim}>{jelzo}</span> : null}
        <span className="szolg-szakasz-nyil" aria-hidden="true" />
      </summary>
      <div className="szolg-szakasz-torzs">{children}</div>
    </details>
  )
}
