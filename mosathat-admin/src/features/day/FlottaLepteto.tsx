import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import { aktualisAuto, csoportOsszeg, vanRendszam } from '../../lib/flotta'
import type { DayBooking } from '../../lib/types'
import { igazoloKell } from '../igazolo/IgazoloGomb'
import { useIgazoloKapu } from '../igazolo/useIgazoloKapu'

// ---------------------------------------------------------------------------
//  Flottás csoport léptetője — hányadik autónál tartunk
//
//      [−]   2 / 4 kész · a 3. autónál tartunk   [Kész, jöhet a következő]
//
//  A flottás autók gyors munkák: jönnek, megcsináljuk, mennek. Nincs
//  Megérkezett / Kész van / Átvette autónként — egy gomb: a soron lévő autó
//  kész (lezárva), jöhet a következő. A „−" visszalép, ha elnyomták.
//
//  Szerződéses cégnél a kész autóhoz rögtön megnyílik az igazolólap sora
//  (km, név, aláírás) — de nem kötelező most kitölteni: bezárható, és később
//  a munkalapon az autó „Igazolólap" gombjával pótolható.
//
//  Ugyanez van a napi kártyán és a csoport munkalapján.
// ---------------------------------------------------------------------------

export default function FlottaLepteto({ groupId, tagok, onValtozas, kicsi }: {
  groupId: string
  /** A csoport autói (sorszám szerint). */
  tagok: DayBooking[]
  /** Lépés után: a hívó újratölt. */
  onValtozas: () => void
  /** A napi kártyán kisebb gombok. */
  kicsi?: boolean
}) {
  const { data } = useApp()
  const [kapuAblak, kapu] = useIgazoloKapu()
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  const o = csoportOsszeg(tagok)
  const most = aktualisAuto(tagok)
  const mostNev = most
    ? (vanRendszam(most) ? (most.plate_raw ?? '').toUpperCase() : `${most.fleet_index}. autó`)
    : null

  async function lep(irany: 1 | -1) {
    if (megy) return
    setMegy(true)
    setHiba(null)
    try {
      const id = await data.fleetStep(groupId, irany)
      onValtozas()
      // Kész autó szerződéses cégnél: az igazolólap sora (nem kötelező most).
      const auto = tagok.find((t) => t.id === id)
      if (irany === 1 && id && auto && igazoloKell(auto)) {
        await kapu.alairat(id,
          `${vanRendszam(auto) ? (auto.plate_raw ?? '').toUpperCase() : `${auto.fleet_index}. autó`} kész. `
          + 'Írasd alá az igazolólapot (km, név, aláírás) — vagy zárd be, és pótold később.')
        onValtozas()
      }
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMegy(false)
    }
  }

  const gomb = kicsi ? 'btn btn-kicsi' : 'btn'
  return (
    <div className={`flotta-lepteto${kicsi ? ' kicsi' : ''}`}>
      <button type="button" className={gomb} aria-label="Vissza egy autót"
              disabled={megy || o.kesz === 0} onClick={() => void lep(-1)}>−</button>
      <span className="lepteto-allas">
        <strong className="szam">{o.kesz} / {o.darab}</strong> kész
        {mostNev && <span className="halk"> · most: {mostNev}</span>}
        {!mostNev && o.darab > 0 && <span className="halk"> · mind kész</span>}
      </span>
      <button type="button" className={`${gomb} btn-fo`}
              disabled={megy || !most} onClick={() => void lep(1)}>
        {most ? 'Kész, jöhet a következő' : 'Mind kész'}
      </button>
      {hiba && <span className="igazolo-hiba" role="alert">{hiba}</span>}
      {kapuAblak}
    </div>
  )
}
