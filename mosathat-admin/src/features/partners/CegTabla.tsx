import { useEffect, useRef, useState } from 'react'

import { ft } from '../../lib/format'
import type { ContractRow } from '../../lib/types'
import SzerzodesArak from './SzerzodesArak'
import IgazoloLap from '../igazolo/IgazoloLap'
import type { CegLinkVezerlo } from '../ceglink/useCegLinkek'

function idoszak(nap: number): string {
  return nap > 1 ? `${nap}. naptól a következő hónap ${nap - 1}. napjáig` : 'naptári hónap'
}

function CegSor({ c, kiemelt, szerkesztheto, linkek, onSzerkeszt, onTorol }: {
  c: ContractRow
  kiemelt: boolean
  szerkesztheto: boolean
  linkek: CegLinkVezerlo | null
  onSzerkeszt: () => void
  onTorol: () => void
}) {
  const sor = useRef<HTMLTableRowElement>(null)
  const [villan, setVillan] = useState(kiemelt)
  const [lapNyitva, setLapNyitva] = useState(false)
  const nev = c.company_name ?? c.customer_name

  useEffect(() => {
    if (!kiemelt) return
    sor.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = window.setTimeout(() => setVillan(false), 2500)
    return () => window.clearTimeout(t)
  }, [kiemelt])

  return (
    <tr ref={sor} className="cegtabla-sor" data-kiemelt={villan || undefined} data-ceg={nev}>
      <td className="cegtabla-ceg">
        <strong>{nev}</strong>
        <dl className="cegtabla-adatok">
          {nev !== c.customer_name && <><dt>Kapcsolattartó</dt><dd>{c.customer_name}</dd></>}
          {c.tax_number && <><dt>Adószám</dt><dd>{c.tax_number}</dd></>}
          <dt>Szerződés vége</dt><dd>{c.valid_until ? c.valid_until.slice(0, 10) : 'határozatlan'}</dd>
          <dt>Autók</dt><dd className="szam">{c.jarmuvek}</dd>
          <dt>Hozom-viszem</dt>
          <dd>
            {c.pickup_delivery
              ? `igen${c.pickup_delivery_fee_huf != null ? `, ${ft(c.pickup_delivery_fee_huf)} / út` : ''}`
              : 'nem'}
          </dd>
          <dt>Flottás autók</dt><dd>{c.fleet_cars ? 'igen' : 'nem'}</dd>
          <dt>Igazolólap</dt><dd>{idoszak(c.cycle_day)}</dd>
        </dl>
        <div className="cegtabla-gombok">
          <button type="button" className="btn btn-kicsi" onClick={() => setLapNyitva(true)}>Igazolólap</button>
          {szerkesztheto && (
            <>
              <button type="button" className="btn btn-kicsi" onClick={onSzerkeszt}>Szerkesztés</button>
              <button type="button" className="btn btn-kicsi btn-veszelyes" onClick={onTorol}>Törlés</button>
            </>
          )}
        </div>
        {lapNyitva && <IgazoloLap cegId={c.company_id} cegNev={nev} onBezar={() => setLapNyitva(false)} />}
      </td>
      <td className="cegtabla-arak">
        <SzerzodesArak prices={c.prices} netto />
      </td>
      {linkek && <td className="cegtabla-link">{linkek.linkCella(c.company_id)}</td>}
      {linkek && <td className="cegtabla-uzenet">{linkek.uzenetCella(c.company_id)}</td>}
    </tr>
  )
}

export default function CegTabla({ contracts, fokuszCeg, szerkesztheto, linkek, onSzerkeszt, onTorol }: {
  contracts: ContractRow[]
  fokuszCeg?: string | null
  szerkesztheto: boolean
  linkek: CegLinkVezerlo | null
  onSzerkeszt: (c: ContractRow) => void
  onTorol: (c: ContractRow) => void
}) {
  return (
    <div className="cegtabla-keret">
      {linkek?.hiba && <div className="hibauzenet">{linkek.hiba}</div>}
      <table className="cegtabla" data-linkkel={linkek ? true : undefined}>
        <thead>
          <tr>
            <th scope="col">Cég</th>
            <th scope="col">Szerződéses árak</th>
            {linkek && <th scope="col">Foglalási link</th>}
            {linkek && <th scope="col">Üzenet a foglalóknak</th>}
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <CegSor key={c.id} c={c} kiemelt={fokuszCeg === c.company_id} szerkesztheto={szerkesztheto}
                    linkek={linkek} onSzerkeszt={() => onSzerkeszt(c)} onTorol={() => onTorol(c)} />
          ))}
        </tbody>
      </table>
      {linkek?.kerdesAblak}
    </div>
  )
}
