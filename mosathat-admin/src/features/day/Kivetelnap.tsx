import { useEffect, useState } from 'react'

import { useApp, useRevizio } from '../../state/AppContext'
import { idoMezo } from '../../lib/format'
import type { DayOverride } from '../../lib/types'

export type Kivetelnapok = Map<string, DayOverride>

export function useKivetelnapok(tol: string, ig: string): Kivetelnapok {
  const { data } = useApp()
  const revision = useRevizio()
  const [napok, setNapok] = useState<Kivetelnapok>(() => new Map())

  useEffect(() => {
    let el = true
    data.listDayOverrides(tol)
      .then((l) => {
        if (!el) return
        setNapok(new Map(l.filter((o) => o.day.slice(0, 10) <= ig).map((o) => [o.day.slice(0, 10), o])))
      })
      .catch(() => { if (el) setNapok(new Map()) })
    return () => { el = false }
  }, [data, tol, ig, revision])

  return napok
}

export function kivetelTipus(o: DayOverride | undefined): 'zarva' | 'nyitva' | undefined {
  if (!o) return undefined
  return o.closed ? 'zarva' : 'nyitva'
}

export function kivetelFelirat(o: DayOverride): string {
  return o.closed ? 'Zárva' : `Nyitva ${idoMezo(o.opens) || '?'}–${idoMezo(o.closes) || '?'}`
}

export function kivetelLeiras(o: DayOverride): string {
  return `Kivételnap: ${kivetelFelirat(o)}${o.note ? ` · ${o.note}` : ''}`
}

export default function KivetelJel({ o }: { o: DayOverride }) {
  return (
    <span className="kivetel-jel" data-kivetel={kivetelTipus(o)} title={kivetelLeiras(o)}>
      <strong>{kivetelFelirat(o)}</strong>
      {o.note && <span className="kivetel-megj">{o.note}</span>}
    </span>
  )
}
