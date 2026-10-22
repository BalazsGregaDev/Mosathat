import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp, useRevizio } from '../../state/AppContext'
import { helyiNap, helyiOra, hibaSzoveg, napCim, ota, relativNap } from '../../lib/format'
import { STATUS_LABEL, type ModositasCsoport } from '../../lib/types'
import BookingDetail from '../booking/BookingDetail'
import './modositas.css'

const HALASZTAS_MS = 15 * 60_000
const FRISSITES_MS = 60_000

export default function ModositasFigyelo({ szabad, onSzerkeszt }: {
  szabad: boolean
  onSzerkeszt: (id: string) => void
}) {
  const { data, refresh } = useApp()
  const revision = useRevizio()
  const [lista, setLista] = useState<ModositasCsoport[]>([])
  const [halasztva, setHalasztva] = useState<Record<string, number>>({})
  const [ora, setOra] = useState(() => Date.now())
  const [valasztott, setValasztott] = useState<string | null>(null)
  const kerSzam = useRef(0)

  const betolt = useCallback(() => {
    const n = ++kerSzam.current
    data.modositasiKerelmek()
      .then((l) => { if (n === kerSzam.current) setLista(l) })
      .catch(() => {})
  }, [data])

  useEffect(() => { betolt() }, [betolt, revision])
  useEffect(() => data.subscribe(betolt), [data, betolt])
  useEffect(() => {
    const t = setInterval(() => { setOra(Date.now()); betolt() }, FRISSITES_MS)
    return () => clearInterval(t)
  }, [betolt])

  const varo = lista.filter((k) => (halasztva[k.booking_id] ?? 0) <= ora)
  const mutatott = szabad ? (varo.find((k) => k.booking_id === valasztott) ?? varo[0] ?? null) : null
  const index = mutatott ? varo.indexOf(mutatott) : -1

  function kesobb() {
    const most = Date.now()
    setHalasztva((h) => {
      const uj = { ...h }
      for (const k of lista) uj[k.booking_id] = most + HALASZTAS_MS
      return uj
    })
    setOra(most)
    refresh()
  }

  function lapoz(irany: 1 | -1) {
    if (varo.length === 0) return
    setValasztott(varo[(index + irany + varo.length) % varo.length].booking_id)
  }

  if (mutatott) {
    return (
      <BookingDetail
        key={mutatott.booking_id}
        bookingId={mutatott.booking_id}
        osztott
        onBezar={kesobb}
        onSzerkeszt={onSzerkeszt}
        arlistaPanel={
          <ModositasPanel k={mutatott} sorszam={index + 1} osszes={varo.length} onLapoz={lapoz}
                          onKesobb={kesobb} onKesz={() => { betolt(); refresh() }} />
        }
      />
    )
  }
  if (lista.length === 0) return null
  return (
    <button type="button" className="keres-jelzo modositas-jelzo"
            onClick={() => { setHalasztva({}); setOra(Date.now()) }}>
      <strong>{lista.length}</strong> módosítási kérés vár
    </button>
  )
}

function ModositasPanel({ k, sorszam, osszes, onLapoz, onKesobb, onKesz }: {
  k: ModositasCsoport
  sorszam: number
  osszes: number
  onLapoz: (irany: 1 | -1) => void
  onKesobb: () => void
  onKesz: () => void
}) {
  const { data } = useApp()
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const nap = k.service_date.slice(0, 10)

  async function elintez() {
    if (megy) return
    setMegy(true)
    setHiba(null)
    try {
      await data.modositasElintezve(k.booking_id)
      onKesz()
    } catch (e) {
      setHiba(hibaSzoveg(e))
      setMegy(false)
    }
  }

  return (
    <aside className="arpanel osztott modositas-panel" aria-label="Módosítási kérés">
      <div className="arpanel-fej">
        <strong>Módosítási kérés</strong>
        {osszes > 1 && (
          <span className="keres-lapozo">
            <button type="button" className="btn btn-kicsi" aria-label="Előző kérés" onClick={() => onLapoz(-1)}>‹</button>
            <span>{sorszam} / {osszes}</span>
            <button type="button" className="btn btn-kicsi" aria-label="Következő kérés" onClick={() => onLapoz(1)}>›</button>
          </span>
        )}
      </div>
      <div className="modositas-torzs">
        <div className="modositas-ki">
          <span className="rendszam">{(k.plate_raw ?? '').toUpperCase()}</span>
          <strong>{k.customer_name}</strong>
          <a className="hivas" href={`tel:${k.customer_phone}`}>{k.customer_phone}</a>
        </div>
        <p className="halk">
          Foglalás: {napCim(nap)} · {STATUS_LABEL[k.status]}
        </p>
        <ul className="modositas-uzenetek">
          {k.kerelmek.map((u) => (
            <li key={u.id}>
              <span className="halk">
                {relativNap(helyiNap(u.mikor))} {helyiOra(u.mikor)} · {ota(u.mikor)}
              </span>
              <p>„{u.uzenet}”</p>
            </li>
          ))}
        </ul>
        <p className="halk modositas-tipp">
          Írd át a munkalapon, amit kér, aztán nyomd meg az Elintézve gombot. Az ügyfél a foglalása oldalán látja,
          hogy elintéztük, és a módosított adatokat is.
        </p>
        {hiba && <div className="hibauzenet">{hiba}</div>}
      </div>
      <div className="modositas-lab">
        <button type="button" className="btn" disabled={megy} onClick={onKesobb}>Később</button>
        <button type="button" className="btn btn-fo" disabled={megy} onClick={() => void elintez()}>
          {megy ? 'Mentés…' : 'Elintézve'}
        </button>
      </div>
    </aside>
  )
}
