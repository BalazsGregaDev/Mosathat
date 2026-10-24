import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import { ft, hibaSzoveg, maStr } from '../../lib/format'
import { datumPont } from '../../lib/igazolo'
import { berletAllapot, berletWord, ervenyesseg, tetelNev } from '../../lib/berlet'
import type { BerletLap, BerletSor } from '../../lib/types'
import Ablak from '../common/Ablak'
import BerletSorUrlap from './BerletSorUrlap'

function keziSor(lap: BerletLap): BerletSor {
  const ma = maStr()
  const nap = ma >= lap.pass.valid_from.slice(0, 10) && ma <= lap.pass.valid_until.slice(0, 10)
    ? ma : lap.pass.valid_from.slice(0, 10)
  return {
    id: null, booking_id: null, pass_item_id: null, day: nap,
    plate: null, name: lap.pass.customer_name, note: null,
    signature: null, signed_at: null, kitoltve_at: null,
    sorszam: lap.rows.length + 1, package_name: '', category: null, kezi: true,
  }
}

export default function BerletLapAblak({ passId, onBezar }: {
  passId: string
  onBezar: () => void
}) {
  const { data, user } = useApp()
  const tulaj = user?.canEditCustomers === true
  const [lap, setLap] = useState<BerletLap | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [sor, setSor] = useState<BerletSor | null>(null)
  const [wordKeszul, setWordKeszul] = useState(false)

  const kerSzam = useRef(0)
  const betolt = useCallback(async () => {
    const n = ++kerSzam.current
    try {
      const d = await data.berletLap(passId)
      if (n !== kerSzam.current) return
      setLap(d)
      setHiba(null)
    } catch (e) {
      if (n === kerSzam.current) setHiba(hibaSzoveg(e))
    }
  }, [data, passId])

  useEffect(() => { void betolt() }, [betolt])
  useEffect(() => data.subscribe(() => void betolt()), [data, betolt])

  async function word() {
    if (!lap || wordKeszul) return
    setWordKeszul(true)
    setHiba(null)
    try {
      await berletWord(lap)
    } catch (e) {
      setHiba(`A Word fájl nem készült el: ${hibaSzoveg(e)}`)
    } finally {
      setWordKeszul(false)
    }
  }

  const sorok = lap?.rows ?? []
  const alairasNelkul = sorok.filter((r) => !r.signature).length
  const osszes = (lap?.items ?? []).reduce((a, t) => a + t.qty_total, 0)
  const maradt = (lap?.items ?? []).reduce((a, t) => a + t.left, 0)
  const allapot = lap ? berletAllapot(lap.pass) : null
  const vehetoFel = tulaj && (lap?.items ?? []).some((t) => t.left > 0)

  return createPortal(
    <Ablak cimke={`Bérlet igazolólap: ${lap?.pass.customer_name ?? ''}`} onEsc={onBezar} onHatter={onBezar}>
      <div className="lap lap-igazolo">
        <div className="lap-fej">
          <div>
            <h2>Bérlet igazolólap</h2>
            <div className="halk" style={{ fontSize: 'var(--m-sm)' }}>
              {lap ? `${lap.pass.customer_name} · ${lap.pass.name}` : ''}
            </div>
          </div>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          {hiba && <div className="hibauzenet">{hiba}</div>}
          {!lap && !hiba && <div className="betolt">Betöltés…</div>}

          {lap && (
            <>
              <div className="igazolo-fejsor">
                <span>Érvényes: <strong>{ervenyesseg(lap.pass)}</strong></span>
                <span className="halk">{ft(lap.pass.price_huf)}</span>
                {allapot
                  ? <span className="cimke-pill igazolo-allapot" data-zarva="true">{allapot}</span>
                  : <span className="cimke-pill igazolo-allapot">{maradt} / {osszes} alkalom szabad</span>}
              </div>

              <div className="berlet-tetelek">
                {lap.items.map((t) => {
                  const foglalt = Math.max(t.qty_total - t.used - t.left, 0)
                  return (
                    <div className="berlet-tetel" key={t.id}>
                      <span>{tetelNev(t)}</span>
                      <span className="szamok">
                        {t.used} felhasználva{foglalt > 0 ? ` · ${foglalt} lefoglalva` : ''} · {t.left} szabad / {t.qty_total}
                      </span>
                    </div>
                  )
                })}
              </div>

              {vehetoFel && (
                <div className="igazolo-eszkozok">
                  <button className="btn" onClick={() => setSor(keziSor(lap))}
                          title="Papíron vezetett, korábbi alkalom felvétele">
                    + Korábbi alkalom
                  </button>
                </div>
              )}

              {sorok.length === 0 && (
                <div className="ures">
                  Még nincs felhasznált alkalom. A bérletes foglalás a Kész van gombnál
                  magától rákerül, és ott alá is íratható.
                </div>
              )}
              {sorok.length > 0 && (
                <table className="igazolo-tabla">
                  <thead>
                    <tr>
                      <th>Alkalom</th><th>Dátum</th><th>Rendszám</th><th>Csomag</th><th>Név</th><th>Aláírás</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorok.map((r) => (
                      <tr key={r.id ?? r.sorszam} onClick={() => setSor(r)}>
                        <td data-cimke="Alkalom">
                          <button className="link-gomb" onClick={(e) => { e.stopPropagation(); setSor(r) }}>
                            {r.sorszam}.
                          </button>
                        </td>
                        <td data-cimke="Dátum">{datumPont(r.day.slice(0, 10))}</td>
                        <td data-cimke="Rendszám" data-kulcs="RENDSZAM">{r.plate ?? ''}</td>
                        <td data-cimke="Csomag">
                          <span>
                            {r.package_name}
                            {r.kezi && <span className="halk"> · korábbi</span>}
                          </span>
                        </td>
                        <td data-cimke="Név">{r.name ?? ''}</td>
                        <td data-cimke="Aláírás">
                          {r.signature
                            ? <img src={r.signature} alt="aláírás" className="alairas-mini" />
                            : <span className="halvany">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {sorok.length > 0 && (
                <div className="igazolo-osszeg">
                  <span>{sorok.length} alkalom felhasználva</span>
                  {alairasNelkul > 0 && <span className="figyel">{alairasNelkul} aláírás hiányzik</span>}
                </div>
              )}

              {lap.reserved.length > 0 && (
                <div className="berlet-foglalt">
                  <div className="szakasz-cim">Lefoglalva, még nincs levonva</div>
                  {lap.reserved.map((r) => (
                    <span key={r.booking_id}>
                      {datumPont(r.service_date.slice(0, 10))} · {r.plate ?? 'rendszám nélkül'} · {r.package_name}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="lap-lab">
          <span className="halk igazolo-lab-szoveg">
            A Word a bérlet mostani állapotával készül, a hátralévő alkalmakhoz üres sorokkal.
          </span>
          <div className="gombok">
            <button className="btn" onClick={onBezar}>Bezárás</button>
            <button className="btn btn-fo" onClick={() => void word()} disabled={!lap || wordKeszul}>
              {wordKeszul ? 'Készül…' : 'Word letöltés'}
            </button>
          </div>
        </div>
      </div>

      {sor && lap && (
        <BerletSorUrlap
          ugyfelNev={lap.pass.customer_name}
          berletNev={lap.pass.name}
          sor={sor}
          tetelek={lap.items}
          onBezar={() => setSor(null)}
          onMentve={() => void betolt()}
        />
      )}
    </Ablak>,
    document.body,
  )
}
