import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import { eloE, type DayBooking, type SheetForBooking } from '../../lib/types'
import SorUrlap from './SorUrlap'
import { hibaSzoveg } from '../../lib/format'

export function igazoloKell(b: DayBooking): boolean {
  const lemondott = !eloE(b.status)
  return Boolean(b.company_id) && b.billing_kind !== 'NORMAL' && !lemondott && !b.not_fitted
}

export default function IgazoloGomb({
  bookingId,
  className = 'btn',
  felirat = 'Igazolólap',
}: {
  bookingId: string
  className?: string
  felirat?: string
}) {
  const { data } = useApp()
  const [adat, setAdat] = useState<SheetForBooking | null>(null)
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  async function nyit() {
    if (megy) return
    setMegy(true)
    setHiba(null)
    try {
      setAdat(await data.sheetForBooking(bookingId))
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setMegy(false)
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={megy}
              title={hiba ?? 'A cég havi igazolólapjának sora: km, név, aláírás'}
              onClick={() => void nyit()}>
        {megy ? 'Megnyitás…' : felirat}
      </button>
      {hiba && <span className="igazolo-hiba" role="alert">{hiba}</span>}
      {adat && adat.company_id && (
        <SorUrlap
          cegId={adat.company_id}
          cegNev={adat.company_name ?? ''}
          oszlopok={adat.columns}
          sor={adat.row}
          zarva={adat.closed}
          onBezar={() => setAdat(null)}
        />
      )}
    </>
  )
}
