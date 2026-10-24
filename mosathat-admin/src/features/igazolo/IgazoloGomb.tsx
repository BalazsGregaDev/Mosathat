import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import { eloE, type BerletFoglalashoz, type DayBooking, type SheetForBooking } from '../../lib/types'
import SorUrlap from './SorUrlap'
import BerletSorUrlap from './BerletSorUrlap'
import { hibaSzoveg } from '../../lib/format'

export type IgazoloFajta = 'CEG' | 'BERLET'

export function igazoloFajta(b: DayBooking): IgazoloFajta | null {
  if (!eloE(b.status) || b.not_fitted) return null
  if (b.pass_item_id) return 'BERLET'
  if (b.company_id && b.billing_kind !== 'NORMAL') return 'CEG'
  return null
}

export function igazoloKell(b: DayBooking): boolean {
  return igazoloFajta(b) !== null
}

export default function IgazoloGomb({
  bookingId,
  fajta = 'CEG',
  className = 'btn',
  felirat = 'Igazolólap',
}: {
  bookingId: string
  fajta?: IgazoloFajta
  className?: string
  felirat?: string
}) {
  const { data } = useApp()
  const [ceg, setCeg] = useState<SheetForBooking | null>(null)
  const [berlet, setBerlet] = useState<BerletFoglalashoz | null>(null)
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  async function nyit() {
    if (megy) return
    setMegy(true)
    setHiba(null)
    try {
      if (fajta === 'BERLET') {
        const d = await data.berletFoglalashoz(bookingId)
        if (d.pass_id && d.row) setBerlet(d)
        else setHiba('Ehhez a foglaláshoz már nem tartozik bérlet.')
      } else {
        setCeg(await data.sheetForBooking(bookingId))
      }
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setMegy(false)
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={megy}
              title={hiba ?? (fajta === 'BERLET'
                ? 'A bérlet igazolólapjának sora: név, aláírás'
                : 'A cég havi igazolólapjának sora: km, név, aláírás')}
              onClick={() => void nyit()}>
        {megy ? 'Megnyitás…' : felirat}
      </button>
      {hiba && <span className="igazolo-hiba" role="alert">{hiba}</span>}
      {ceg && ceg.company_id && (
        <SorUrlap
          cegId={ceg.company_id}
          cegNev={ceg.company_name ?? ''}
          oszlopok={ceg.columns}
          sor={ceg.row}
          zarva={ceg.closed}
          onBezar={() => setCeg(null)}
        />
      )}
      {berlet && berlet.pass_id && berlet.row && (
        <BerletSorUrlap
          ugyfelNev={berlet.customer_name ?? ''}
          berletNev={berlet.pass_name ?? ''}
          sor={berlet.row}
          onBezar={() => setBerlet(null)}
        />
      )}
    </>
  )
}
