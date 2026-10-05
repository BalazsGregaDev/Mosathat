import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import type { DayBooking, SheetForBooking } from '../../lib/types'
import SorUrlap from './SorUrlap'

// ---------------------------------------------------------------------------
//  „Igazolólap" gomb a napi kártyán és a munkalapon (ott a cég sora alatt)
//
//  Szerződéses vagy bérletes cég autójánál látszik. Megnyomva az adatbázis
//  visszaadja a foglalás sorát: ha már kitöltötték, a meglévőt, ha még nem,
//  egy előre kitöltöttet (dátum, rendszám, nettó ár, a sofőr neve). Ebbe már
//  csak a km-t kell beírni, és aláíratni — mentés, bezárás.
//
//  A sor a cég adott havi lapjára kerül; ha az a hónap még nem volt
//  megnyitva, a mentés megnyitja.
// ---------------------------------------------------------------------------

/** Kell-e a foglaláshoz igazolólap gomb. */
export function igazoloKell(b: DayBooking): boolean {
  const lemondott = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'NO_SHOW'].includes(b.status)
  // A „nem fért be" autót nem csináltuk meg: nincs mit igazolni.
  return Boolean(b.company_id) && b.billing_kind !== 'NORMAL' && !lemondott && !b.not_fitted
}

export default function IgazoloGomb({
  bookingId,
  className = 'btn',
  felirat = 'Igazolólap',
}: {
  bookingId: string
  className?: string
  /** A gomb szövege (a munkalapon a sor neve már „Igazolólap"). */
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
      setHiba(e instanceof Error ? e.message : String(e))
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
