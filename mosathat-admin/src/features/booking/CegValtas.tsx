import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg, napRovidCim } from '../../lib/format'
import { STATUS_LABEL, type FoglalasTars } from '../../lib/types'
import type { Valtozas } from '../../lib/ugyfel'
import Ablak from '../common/Ablak'

interface Kerdes {
  bookingId: string
  valtozasok: Valtozas[]
  tarsak: FoglalasTars[]
}

const MEZO_NEV: Record<Valtozas['mezo'], string> = { CEG: 'cég', NEV: 'név', TELEFON: 'telefonszám' }
const MEZO_CIMKE: Record<Valtozas['mezo'], string> = { CEG: 'Cég', NEV: 'Név', TELEFON: 'Telefon' }
const URES: Record<Valtozas['mezo'], string> = { CEG: 'nincs cég', NEV: 'nincs név', TELEFON: 'nincs telefonszám' }

function felsorol(v: Valtozas[]): string {
  const r = v.map((x) => `a ${MEZO_NEV[x.mezo]}`)
  return r.length < 2 ? r.join('') : `${r.slice(0, -1).join(', ')} és ${r[r.length - 1]}`
}

function kotelezo(t: FoglalasTars): boolean {
  return t.ugyanaz_auto || Boolean(t.ugyanaz_flotta)
}

function CegValtasAblak({ k, onKesz, onMegse }: { k: Kerdes; onKesz: () => void; onMegse: () => void }) {
  const { data } = useApp()
  const [kijelolt, setKijelolt] = useState<Set<string>>(() => new Set(k.tarsak.filter(kotelezo).map((t) => t.id)))
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const csakCeg = k.valtozasok.every((v) => v.mezo === 'CEG')
  const cim = csakCeg ? 'Cég módosítása' : 'Ügyféladat módosítása'

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
    <Ablak cimke={cim} onEsc={() => { if (!megy) onMegse() }}>
      <div className="lap ceg-valtas" data-mezok={k.valtozasok.map((v) => v.mezo).join(' ')}>
        <div className="lap-fej">
          <h2>{cim}</h2>
          <button className="bezar" onClick={onMegse} aria-label="Bezárás" disabled={megy}>×</button>
        </div>
        <div className="lap-torzs">
          {hiba && <div className="hibauzenet">{hiba}</div>}
          {k.valtozasok.map((v) => (
            <p key={v.mezo} className="ceg-valtas-mi" data-mezo={v.mezo}>
              {!csakCeg && <span className="ceg-valtas-cimke">{MEZO_CIMKE[v.mezo]}:</span>}
              <span className="halk">{v.regi || URES[v.mezo]}</span>
              <span aria-hidden="true">→</span>
              <strong>{v.uj || URES[v.mezo]}</strong>
            </p>
          ))}
          <p>
            Ennek az ügyfélnek más aktív foglalása is van. Ennél a foglalásnál mindenképp módosul {felsorol(k.valtozasok)}.
            Jelöld be, melyiknél módosuljon még.
            {!csakCeg && ' Amelyiket nem jelölöd be, ott a régi adat marad.'}
          </p>
          <ul className="ceg-valtas-lista">
            {k.tarsak.map((t) => (
              <li key={t.id}>
                <label className="jelolo" data-foglalas={t.id} data-aktiv={kijelolt.has(t.id)}>
                  <input type="checkbox" checked={kijelolt.has(t.id)} disabled={megy || kotelezo(t)}
                         onChange={() => valt(t.id)} />
                  <span className="ceg-valtas-sor">
                    <strong>{napRovidCim(t.service_date.slice(0, 10))}</strong>
                    {t.plate_raw ? <span className="rendszam">{t.plate_raw}</span> : <span className="halvany">rendszám nélkül</span>}
                    {t.package_name && <span>{t.package_name}</span>}
                    <span className="halk">{STATUS_LABEL[t.status]}</span>
                  </span>
                  {t.ugyanaz_flotta
                    ? <span className="cimke-pill">ugyanaz a flotta, vele együtt módosul</span>
                    : t.ugyanaz_auto && <span className="cimke-pill">ugyanaz az autó, vele együtt módosul</span>}
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

export function useCegValtas(): [React.ReactNode, (bookingId: string, valtozasok: Valtozas[]) => Promise<boolean>] {
  const { data } = useApp()
  const [kerdes, setKerdes] = useState<Kerdes | null>(null)
  const valasz = useRef<((v: boolean) => void) | null>(null)

  const kerdez = useCallback(async (bookingId: string, valtozasok: Valtozas[]) => {
    if (valtozasok.length === 0) return true
    const tarsak = await data.foglalasTarsai(bookingId)
    if (tarsak.length === 0) return true
    valasz.current?.(false)
    setKerdes({ bookingId, valtozasok, tarsak })
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
