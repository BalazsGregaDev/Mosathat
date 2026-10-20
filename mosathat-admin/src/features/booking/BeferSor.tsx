import { useMemo } from 'react'

import type { Munka } from '../../lib/beosztas'
import { leadosHozasok, ujMunkaEllenoriz, varosKezdesek } from '../../lib/befer'
import { idoPercbe, percIdo, percOra } from '../../lib/format'
import { useNapBeosztas } from '../../state/napBeosztas'
import type { BookingType } from '../../lib/types'

export default function BeferSor({ datum, tipus, kezdes, hozza, visziNap, viszi, perc, kihagy, onIdo }: {
  datum: string
  tipus: BookingType
  kezdes: string
  hozza: string
  visziNap: string
  viszi: string
  perc: number | null | undefined
  kihagy: string | null
  onIdo: (mezo: 'startTime' | 'dropOffTime', ertek: string) => void
}) {
  const tobbnapos = Boolean(visziNap && visziNap !== datum)
  const adat = useNapBeosztas(tobbnapos || !perc ? null : datum, kihagy)

  const eredmeny = useMemo(() => {
    if (!adat || !perc || adat.negyedek.length === 0) return null
    const varos = tipus === 'VAROS'
    const tol = idoPercbe(varos ? kezdes || '09:00' : hozza || '08:00')
    const hatarido = varos ? tol + perc : (viszi ? idoPercbe(viszi) : adat.zar)
    const uj: Munka = { id: '__uj', cimke: 'Új autó', fajta: varos ? 'FIX' : 'RUGALMAS', tol, hatarido, perc }
    const e = ujMunkaEllenoriz(adat.negyedek, adat.munkak, uj, adat.most)
    const lehet = e.befer ? [] : (varos
      ? varosKezdesek(adat.negyedek, adat.munkak, perc, adat.most)
      : leadosHozasok(adat.negyedek, adat.munkak, perc, adat.most))
    return { e, lehet, varos }
  }, [adat, perc, tipus, kezdes, hozza, viszi])

  if (tobbnapos || !perc) return null
  if (!adat) return <div className="befer-sor halk">Befér-e? Számolom…</div>
  if (adat.negyedek.length === 0) return <div className="befer-sor" data-ok="false">Ezen a napon zárva vagyunk.</div>
  if (!eredmeny) return null

  const { e, lehet, varos } = eredmeny
  return (
    <div className="befer-sor" data-ok={e.befer}>
      <div className="befer-fej">
        <strong>{e.befer ? 'Befér' : 'Nem fér be'}</strong>
        {e.befer && e.kesz !== null && <span> — kész kb. {percOra(e.kesz)}</span>}
        <span className="befer-jel" title="Fejlesztői próba: a napi nézet idővonalával azonos számítás">próba</span>
      </div>
      {!e.befer && (
        <ul>{e.gondok.map((g, i) => <li key={i}>{g}</li>)}</ul>
      )}
      {!e.befer && (
        lehet.length > 0 ? (
          <div className="befer-idok">
            <span>{varos ? 'Szabad kezdések ezen a napon:' : 'Ha ekkor hozza, befér:'}</span>
            {lehet.slice(0, 10).map((l) => (
              <button key={l.tol} type="button" className="btn btn-kicsi"
                      onClick={() => onIdo(varos ? 'startTime' : 'dropOffTime', percIdo(l.tol))}>
                {percOra(l.tol)}
              </button>
            ))}
          </div>
        ) : <div>Ezen a napon már egyik időpontban sem fér be.</div>
      )}
    </div>
  )
}
