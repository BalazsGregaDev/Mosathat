import { useEffect, useRef, useState } from 'react'

import { hibaSzoveg } from '../../lib/format'
import type { DayBooking } from '../../lib/types'
import { CegValaszto, URES_CEG, useCegEgyeztetes, type CegErtek } from '../common/Ceg'

export default function CegSor({
  b,
  zarolt,
  onMent,
}: {
  b: DayBooking
  zarolt: boolean
  onMent: (patch: Record<string, unknown>) => Promise<void>
}) {
  const [nyitva, setNyitva] = useState(false)
  const [ertek, setErtek] = useState<CegErtek>(URES_CEG)
  const [hiba, setHiba] = useState<string | null>(null)
  const [cegAblak, cegEgyeztet] = useCegEgyeztetes()
  const friss = useRef<CegErtek>(URES_CEG)
  const megy = useRef(false)
  const megse = useRef(false)

  useEffect(() => {
    if (nyitva) document.getElementById('munkalap-ceg')?.focus()
  }, [nyitva])

  function nyit() {
    if (zarolt) return
    const kezdo = { id: b.company_id, nev: b.company_name ?? '' }
    setErtek(kezdo)
    friss.current = kezdo
    megse.current = false
    setHiba(null)
    setNyitva(true)
  }

  function valt(uj: CegErtek) {
    setErtek(uj)
    friss.current = uj
    if (uj.id) void ment(uj)
  }

  async function ment(e: CegErtek) {
    if (megy.current || megse.current) return
    const nev = e.nev.trim()
    const regiNev = (b.company_name ?? '').trim()

    if ((e.id && e.id === b.company_id) || (!e.id && nev === '' && !b.company_id)
        || (!e.id && nev === regiNev && b.company_id)) {
      setNyitva(false)
      return
    }

    megy.current = true
    try {
      const c = await cegEgyeztet({ id: e.id, nev })
      if (c === null) return
      if (c.id && c.id === b.company_id) { setNyitva(false); return }
      await onMent(c.id
        ? { company_id: c.id }
        : { company_id: null, company_name: c.nev })
      setHiba(null)
      setNyitva(false)
    } catch (err) {
      setHiba(hibaSzoveg(err))
    } finally {
      megy.current = false
    }
  }

  if (!nyitva) {
    return (
      <div className="adatsor szerk-sor">
        <span className="szerk-cimke">Cég</span>
        <span className="ertek">
          {zarolt ? (
            <span className={b.company_name ? undefined : 'halvany'}>{b.company_name || 'nincs'}</span>
          ) : (
            <button type="button" className={`szerk-ertek${b.company_name ? '' : ' ures'}`}
                    onClick={nyit} title="Kattints az átíráshoz">
              {b.company_name || 'nincs'}
            </button>
          )}
          {b.contract_kind && <span className="cimke-pill szerzodes-pill">szerződés</span>}
        </span>
        {cegAblak}
      </div>
    )
  }

  return (
    <div className="adatsor szerk-sor szerk-nyitva"
         onKeyDownCapture={(e) => {
           if (e.key === 'Escape') { megse.current = true; setNyitva(false) }
         }}>
      <span className="szerk-cimke">Cég</span>
      <span className="ertek">
        <CegValaszto inputId="munkalap-ceg" ertek={ertek} onValt={valt}
                     onKilep={() => void ment(friss.current)} />
        {hiba && <div className="szerk-hiba">{hiba}</div>}
      </span>
      {cegAblak}
    </div>
  )
}
