import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg, napRovidCim } from '../../lib/format'
import { STATUS_LABEL, type FoglalasTars } from '../../lib/types'
import Ablak from '../common/Ablak'

interface Kerdes {
  bookingId: string
  regi: string
  uj: string
  tarsak: FoglalasTars[]
}

function CegValtasAblak({ k, onKesz, onMegse }: { k: Kerdes; onKesz: () => void; onMegse: () => void }) {
  const { data } = useApp()
  const [kijelolt, setKijelolt] = useState<Set<string>>(() => new Set(k.tarsak.filter((t) => t.ugyanaz_auto).map((t) => t.id)))
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  const valt = (id: string) => setKijelolt((s) => {
    const uj = new Set(s)
    if (uj.has(id)) uj.delete(id)
    else uj.add(id)
    return uj
  })

  async function ment() {
    setMegy(true)
    setHiba(null)
    try {
      await data.foglalasLevalaszt(k.bookingId, [...kijelolt])
      onKesz()
    } catch (e) {
      setHiba(hibaSzoveg(e))
      setMegy(false)
    }
  }

  return (
    <Ablak cimke="Cég módosítása" onEsc={() => { if (!megy) onMegse() }}>
      <div className="lap ceg-valtas">
        <div className="lap-fej">
          <h2>Cég módosítása</h2>
          <button className="bezar" onClick={onMegse} aria-label="Bezárás" disabled={megy}>×</button>
        </div>
        <div className="lap-torzs">
          {hiba && <div className="hibauzenet">{hiba}</div>}
          <p className="ceg-valtas-mi">
            <span className="halk">{k.regi || 'nincs cég'}</span>
            <span aria-hidden="true">→</span>
            <strong>{k.uj || 'nincs cég'}</strong>
          </p>
          <p>
            Ennek az ügyfélnek más aktív foglalása is van. Ennél a foglalásnál mindenképp módosul a cég.
            Jelöld be, melyiknél módosuljon még.
          </p>
          <ul className="ceg-valtas-lista">
            {k.tarsak.map((t) => (
              <li key={t.id}>
                <label className="jelolo" data-foglalas={t.id} data-aktiv={kijelolt.has(t.id)}>
                  <input type="checkbox" checked={kijelolt.has(t.id)} disabled={megy || t.ugyanaz_auto}
                         onChange={() => valt(t.id)} />
                  <span className="ceg-valtas-sor">
                    <strong>{napRovidCim(t.service_date.slice(0, 10))}</strong>
                    {t.plate_raw ? <span className="rendszam">{t.plate_raw}</span> : <span className="halvany">rendszám nélkül</span>}
                    {t.package_name && <span>{t.package_name}</span>}
                    <span className="halk">{STATUS_LABEL[t.status]}</span>
                  </span>
                  {t.ugyanaz_auto && <span className="cimke-pill">ugyanaz az autó, vele együtt módosul</span>}
                </label>
              </li>
            ))}
          </ul>
          <div className="lap-lab">
            <div className="gombok">
              <button className="btn" onClick={onMegse} disabled={megy}>Mégse</button>
              <button className="btn btn-fo" onClick={() => void ment()} disabled={megy}>
                {megy ? 'Mentés…' : kijelolt.size > 0 ? `Mentés (${kijelolt.size + 1} foglalás)` : 'Csak ennél a foglalásnál'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Ablak>
  )
}

export function useCegValtas(): [React.ReactNode, (bookingId: string, regi: string, uj: string) => Promise<boolean>] {
  const { data } = useApp()
  const [kerdes, setKerdes] = useState<Kerdes | null>(null)
  const valasz = useRef<((v: boolean) => void) | null>(null)

  const kerdez = useCallback(async (bookingId: string, regi: string, uj: string) => {
    const tarsak = await data.foglalasTarsai(bookingId)
    if (tarsak.length === 0) return true
    valasz.current?.(false)
    setKerdes({ bookingId, regi, uj, tarsak })
    return new Promise<boolean>((resolve) => { valasz.current = resolve })
  }, [data])

  const lezar = useCallback((v: boolean) => {
    valasz.current?.(v)
    valasz.current = null
    setKerdes(null)
  }, [])

  const ablak = kerdes
    ? createPortal(<CegValtasAblak k={kerdes} onKesz={() => lezar(true)} onMegse={() => lezar(false)} />, document.body)
    : null
  return [ablak, kerdez]
}
