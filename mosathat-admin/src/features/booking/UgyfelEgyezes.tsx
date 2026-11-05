import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { SearchHit } from '../../lib/types'
import { ellentmond, type Valtozas } from '../../lib/ugyfel'
import Ablak from '../common/Ablak'

export type EgyezesValasz = 'UGYANAZ' | 'MASIK' | null

interface Kerdes {
  nev: string
  elteres: Valtozas[]
}

export function useUgyfelEgyezes(): [
  React.ReactNode,
  (h: SearchHit | null, urlap: { nev: string; tel: string }) => Promise<EgyezesValasz>,
] {
  const [kerdes, setKerdes] = useState<Kerdes | null>(null)
  const valasz = useRef<((v: EgyezesValasz) => void) | null>(null)

  const kerdez = useCallback(async (h: SearchHit | null, urlap: { nev: string; tel: string }) => {
    if (!h) return 'UGYANAZ' as const
    const elteres = ellentmond({ nev: h.customer_name, tel: h.customer_phone }, urlap)
    if (elteres.length === 0) return 'UGYANAZ' as const
    valasz.current?.(null)
    setKerdes({ nev: h.customer_name, elteres })
    return new Promise<EgyezesValasz>((resolve) => { valasz.current = resolve })
  }, [])

  const lezar = useCallback((v: EgyezesValasz) => {
    valasz.current?.(v)
    valasz.current = null
    setKerdes(null)
  }, [])

  const ablak = kerdes ? createPortal(
    <Ablak osztaly="fedo kerdes-fedo" szerep="alertdialog" cimkeId="ugyfel-kerdes"
           onEsc={() => lezar(null)} onHatter={() => lezar(null)}>
      <div className="kerdes-ablak ugyfel-egyezes">
        <h2 id="ugyfel-kerdes">Ugyanaz az ügyfél?</h2>
        <p>A kiválasztott ügyfél adatai mások, mint amit most beírtál:</p>
        <dl className="ugyfel-elteres">
          {kerdes.elteres.map((v) => (
            <div key={v.mezo} data-mezo={v.mezo}>
              <dt>{v.mezo === 'NEV' ? 'Név' : 'Telefon'}</dt>
              <dd><span className="halk">{v.regi}</span> <span aria-hidden="true">→</span> <strong>{v.uj}</strong></dd>
            </div>
          ))}
        </dl>
        <p>
          Ha másik ügyfél, új ügyfélként mentem, és {kerdes.nev} adatai nem változnak.
          Ha ugyanaz, az adatai frissülnek, és a korábbi foglalásainál is az új adat látszik.
        </p>
        <div className="ceg-jeloltek">
          <button type="button" className="btn btn-fo" onClick={() => lezar('MASIK')}>
            Másik ügyfél, új ügyfélként mentem
          </button>
          <button type="button" className="btn" onClick={() => lezar('UGYANAZ')}>
            Ugyanaz az ügyfél, frissítem az adatait
          </button>
          <button type="button" className="btn btn-csendes" onClick={() => lezar(null)}>Mégse</button>
        </div>
      </div>
    </Ablak>,
    document.body,
  ) : null

  return [ablak, kerdez]
}
