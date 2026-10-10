import { useCallback, useEffect, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg, honapCim, honapPlusz, maStr } from '../../lib/format'
import type { SheetCompany } from '../../lib/types'
import { idoszakNapok, naptariHonap } from '../../lib/igazolo'
import IgazoloLap from './IgazoloLap'
import HonapUgras from './HonapUgras'

export default function IgazoloOldal({ onSzerzodes }: {
  onSzerzodes?: (cegId: string) => void
}) {
  const { data } = useApp()
  const [honap, setHonap] = useState(() => maStr())
  const [cegek, setCegek] = useState<SheetCompany[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [nyitott, setNyitott] = useState<{ ceg: SheetCompany; ujSor: boolean } | null>(null)

  const kerSzam = useRef(0)
  const betolt = useCallback(async () => {
    const n = ++kerSzam.current
    try {
      const r = await data.listSheetCompanies(honap)
      if (n !== kerSzam.current) return
      setCegek(r)
      setHiba(null)
    } catch (e) {
      if (n === kerSzam.current) setHiba(hibaSzoveg(e))
    }
  }, [data, honap])

  useEffect(() => { void betolt() }, [betolt])
  useEffect(() => data.subscribe(() => void betolt()), [data, betolt])

  function lep(uj: string) {
    if (uj === honap) return
    setHonap(uj)
    setCegek(null)
  }

  const szurt = (cegek ?? []).filter((c) =>
    q.trim() === '' || c.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Igazolólap</h2>
      </div>

      <div className="igazolo-oldal-fej">
        <div className="honap-lepteto">
          <button className="btn btn-kicsi" aria-label="Előző hónap"
                  onClick={() => lep(honapPlusz(honap, -1))}>‹</button>
          <strong className="honap-nev">{honapCim(honap)}</strong>
          <button className="btn btn-kicsi" aria-label="Következő hónap"
                  onClick={() => lep(honapPlusz(honap, 1))}>›</button>
        </div>
        <HonapUgras honap={honap} onLep={lep} />
      </div>

      <input className="beviteli" style={{ margin: 'var(--t3) 0 var(--t4)' }}
             value={q} onChange={(e) => setQ(e.target.value)}
             placeholder="Cég neve" aria-label="Cég keresése" />

      {hiba && <div className="hibauzenet">{hiba}</div>}
      {!cegek && !hiba && <div className="betolt">Betöltés…</div>}
      {cegek && szurt.length === 0 && (
        <div className="panel">
          <div className="ures">
            {cegek.length === 0
              ? 'Még nincs olyan cég, akinek igazolólap kell (szerződéses vagy bérletes).'
              : 'Nincs találat.'}
          </div>
        </div>
      )}

      {szurt.length > 0 && (
        <div className="panel igazolo-cegek">
          {szurt.map((c) => (
            <div className="igazolo-ceg" key={c.id} data-kell={c.kell}>
              <button className="igazolo-ceg-nyit" onClick={() => setNyitott({ ceg: c, ujSor: false })}>
                <span className="nev">
                  {c.name}
                  {c.szerzodes && <span className="cimke-pill szerzodes-pill">szerződés</span>}
                  {c.berletes && <span className="cimke-pill szerzodes-pill">bérlet</span>}
                  {!c.kell && <span className="cimke-pill">már nem kell lap</span>}
                </span>
                {!naptariHonap(c.period_start) && (
                  <span className="idoszak halk">
                    időszak: {idoszakNapok(c.period_start, c.period_end)}
                  </span>
                )}
                <span className="allas">
                  {c.rows === 0
                    ? <span className="halvany">nincs sora</span>
                    : <span>{c.rows} autó</span>}
                  {c.unsigned > 0 && <span className="figyel">{c.unsigned} aláírás hiányzik</span>}
                  {c.closed
                    ? <span className="cimke-pill igazolo-allapot" data-zarva="true">lezárva</span>
                    : c.rows > 0 && <span className="cimke-pill igazolo-allapot">nyitott</span>}
                  {c.open_before > 0 && (
                    <span className="figyel">
                      {c.open_before} korábbi hónap lezáratlan
                    </span>
                  )}
                </span>
              </button>
              <div className="igazolo-ceg-gombok">
                {c.szerzodes && onSzerzodes && (
                  <button className="btn btn-kicsi" onClick={() => onSzerzodes(c.id)}>
                    Szerződés részletei
                  </button>
                )}
                {!c.closed && (
                  <button className="btn btn-kicsi" onClick={() => setNyitott({ ceg: c, ujSor: true })}>
                    + Sor
                  </button>
                )}
                <button className="btn btn-kicsi" onClick={() => setNyitott({ ceg: c, ujSor: false })}>
                  Megnyitás
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {nyitott && (
        <IgazoloLap
          cegId={nyitott.ceg.id}
          cegNev={nyitott.ceg.name}
          kezdoHonap={honap}
          ujSorral={nyitott.ujSor}
          onBezar={() => { setNyitott(null); void betolt() }}
        />
      )}
    </div>
  )
}
