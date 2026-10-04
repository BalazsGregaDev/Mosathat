import { useCallback, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import type { SheetForBooking } from '../../lib/types'
import SorUrlap from './SorUrlap'

// ---------------------------------------------------------------------------
//  Az igazolólap a munka menetében: „Kész van" és „Átvette"
//
//  Szerződéses / bérletes cég autójánál az igazolólap az átadás része:
//
//    Kész van  →  az állapot átvált, és rögtön megnyílik a lap sora
//                 (km, név, aláírás) — a sofőr ekkor írja alá.
//    Átvette   →  csak akkor zárható le, ha a sor már ki van töltve (el van
//                 mentve). Ha még nincs, a gomb előbb a sort nyitja meg;
//                 mentés után jön a lezárás.
//
//  Az aláírás maga nem kötelező (üresen hagyva papíron aláírható), de a
//  sornak meg kell lennie: különben a hónap végén hiányozna a lapról.
//
//  Ha a hónap lapja már le van zárva, nem állunk útba: a lezárt lapra úgysem
//  lehet írni.
//
//  Lezárt (átvett) foglalásnál is kitölthető a sor — erre a kártya és a
//  munkalap „Igazolólap" gombja való.
//
//  Használat:
//    const [kapuAblak, kapu] = useIgazoloKapu()
//    await kapu.alairat(bookingId, 'Az autó kész…')   // Kész van után
//    if (!(await kapu.atadhato(bookingId))) return   // Átvette előtt
//    …és a {kapuAblak} kerüljön a komponens kimenetébe.
// ---------------------------------------------------------------------------

type Nyitott = { adat: SheetForBooking; uzenet: string }

export function useIgazoloKapu(): [
  React.ReactNode,
  {
    alairat: (bookingId: string, uzenet: string) => Promise<boolean>
    atadhato: (bookingId: string) => Promise<boolean>
  },
] {
  const { data } = useApp()
  const [nyitott, setNyitott] = useState<Nyitott | null>(null)
  // A megnyitott ablak eredménye: elmentették-e a sort.
  const valasz = useRef<((mentve: boolean) => void) | null>(null)
  const mentve = useRef(false)

  /** Megnyitja a sort, és megvárja, amíg bezárják. true: el is mentették. */
  const megnyit = useCallback((adat: SheetForBooking, uzenet: string) => {
    mentve.current = false
    setNyitott({ adat, uzenet })
    return new Promise<boolean>((resolve) => { valasz.current = resolve })
  }, [])

  const alairat = useCallback(async (bookingId: string, uzenet: string) => {
    const adat = await data.sheetForBooking(bookingId)
    if (!adat.company_id || adat.closed) return true
    return megnyit(adat, uzenet)
  }, [data, megnyit])

  const atadhato = useCallback(async (bookingId: string) => {
    const adat = await data.sheetForBooking(bookingId)
    // Nincs cég, lezárt hónap, vagy már kitöltötték: mehet.
    if (!adat.company_id || adat.closed || adat.row.id) return true
    return megnyit(adat,
      'Átadás előtt töltsd ki az igazolólap sorát (km, név, aláírás). '
      + 'Mentés után lezárható az időpont.')
  }, [data, megnyit])

  const ablak = nyitott && nyitott.adat.company_id
    ? (
      <SorUrlap
        cegId={nyitott.adat.company_id}
        cegNev={nyitott.adat.company_name ?? ''}
        oszlopok={nyitott.adat.columns}
        sor={nyitott.adat.row}
        zarva={nyitott.adat.closed}
        uzenet={nyitott.uzenet}
        onMentve={() => { mentve.current = true }}
        onBezar={() => {
          setNyitott(null)
          valasz.current?.(mentve.current)
          valasz.current = null
        }}
      />
    )
    : null

  return [ablak, { alairat, atadhato }]
}
