import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { honapCim, honapElseje, honapPlusz, maStr } from '../../lib/format'
import type { SheetCompany } from '../../lib/types'
import IgazoloLap from './IgazoloLap'
import HonapUgras from './HonapUgras'

// ---------------------------------------------------------------------------
//  Igazolólap menüpont — minden szerepkörnek
//
//  Egy lista: minden cég, akinek igazolólap kell (szerződéses vagy bérletes),
//  és akinek már volt lapja. Cégenként a választott hónap állása: hány sor,
//  hány aláírás hiányzik, le van-e zárva — és ha egy korábbi hónap
//  lezáratlanul maradt, azt is jelzi.
//
//  Egy cégre kattintva megnyílik az összesítő (a cég havi lapja): ott lehet
//  sort felvenni, kitölteni, aláíratni, és Wordben letölteni. A „+ Sor" gomb
//  rögtön egy új sorral nyitja.
//
//  Ki mit tud — ugyanaz az ablak, mint a Cégek és bérletesek menüben:
//    - alkalmazott: sort felvenni, kitölteni, aláíratni, letölteni;
//    - tulajdonos, fejlesztő: ezen felül oszlopok és lábléc, hónap lezárása
//      és újranyitása (a teljes szerkesztés).
//  A szétválasztás az ablakban és az adatbázisban is megvan, nem csak itt.
// ---------------------------------------------------------------------------

export default function IgazoloOldal() {
  const { data } = useApp()
  const [honap, setHonap] = useState(() => honapElseje(maStr()))
  const [cegek, setCegek] = useState<SheetCompany[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [q, setQ] = useState('')
  // A megnyitott cég lapja; `ujSor`: rögtön új sorral nyíljon.
  const [nyitott, setNyitott] = useState<{ ceg: SheetCompany; ujSor: boolean } | null>(null)

  const betolt = useCallback(async () => {
    try {
      setCegek(await data.listSheetCompanies(honap))
      setHiba(null)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }, [data, honap])

  useEffect(() => { void betolt() }, [betolt])
  // Ha máshol aláírnak vagy lezárnak, a számok itt is frissülnek.
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

      {/* --- melyik hónap ---------------------------------------------------- */}
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

      {/* --- a cégek ----------------------------------------------------------- */}
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
