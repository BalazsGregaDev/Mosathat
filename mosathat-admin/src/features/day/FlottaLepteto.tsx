import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import { aktualisAuto, autoNev, csoportOsszeg } from '../../lib/flotta'
import { hibaSzoveg } from '../../lib/format'
import type { DayBooking } from '../../lib/types'
import { igazoloKell } from '../igazolo/IgazoloGomb'
import { useIgazoloKapu } from '../igazolo/useIgazoloKapu'

export default function FlottaLepteto({ groupId, tagok, onValtozas }: {
  groupId: string
  tagok: DayBooking[]
  onValtozas: () => void
}) {
  const { data } = useApp()
  const [kapuAblak, kapu] = useIgazoloKapu()
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  const o = csoportOsszeg(tagok)
  const most = aktualisAuto(tagok)
  const mostNev = most ? autoNev(most) : null

  async function lep(irany: 1 | -1) {
    if (megy) return
    setMegy(true)
    setHiba(null)
    try {
      const id = await data.fleetStep(groupId, irany)
      onValtozas()
      const auto = tagok.find((t) => t.id === id)
      if (irany === 1 && id && auto && igazoloKell(auto)) {
        await kapu.alairat(id,
          `${autoNev(auto)} kész. `
          + 'Írasd alá az igazolólapot (km, név, aláírás) — vagy zárd be, és pótold később.')
        onValtozas()
      }
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setMegy(false)
    }
  }

  return (
    <div className="flotta-lepteto">
      <button type="button" className="btn" aria-label="Vissza egy autót"
              disabled={megy || o.kesz === 0} onClick={() => void lep(-1)}>−</button>
      <span className="lepteto-allas">
        <strong className="szam">{o.kesz} / {o.darab}</strong> kész
        {mostNev && <span className="halk"> · most: {mostNev}</span>}
        {!mostNev && o.darab > 0 && <span className="halk"> · mind kész</span>}
      </span>
      <button type="button" className="btn btn-fo"
              disabled={megy || !most} onClick={() => void lep(1)}>
        {most ? 'Kész, jöhet a következő' : 'Mind kész'}
      </button>
      {hiba && <span className="igazolo-hiba" role="alert">{hiba}</span>}
      {kapuAblak}
    </div>
  )
}
