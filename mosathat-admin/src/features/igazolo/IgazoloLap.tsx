import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import { ft, helyiNap, hibaSzoveg, honapCim, honapElseje, honapPlusz, maStr } from '../../lib/format'
import { cellaSzoveg, idoszakCim, idoszakNapok, lablecArak, naptariHonap } from '../../lib/igazolo'
import { igazoloLetolt } from '../../lib/igazoloWord'
import type { SheetDetail, SheetRow } from '../../lib/types'
import { useKerdes } from '../common/Kerdes'
import SorUrlap from './SorUrlap'
import LapBeallitas from './LapBeallitas'
import HonapUgras from './HonapUgras'

function uresSor(kezdet: string, veg: string): SheetRow {
  const ma = maStr()
  return {
    id: null, booking_id: null,
    day: ma >= kezdet && ma <= veg ? ma : kezdet,
    plate: null, km: null, net_huf: null, name: null,
    extra: {}, signature: null, signed_at: null,
  }
}

export default function IgazoloLap({
  cegId,
  cegNev,
  kezdoHonap,
  ujSorral,
  onBezar,
}: {
  cegId: string
  cegNev: string
  kezdoHonap?: string
  ujSorral?: boolean
  onBezar: () => void
}) {
  const { data, user } = useApp()
  const tulaj = user?.canEditCustomers === true
  const [kerdesAblak, kerdez] = useKerdes()
  const [kert, setKert] = useState(() => kezdoHonap ?? maStr())
  const [lap, setLap] = useState<SheetDetail | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [sor, setSor] = useState<SheetRow | null>(null)
  const [beallit, setBeallit] = useState(false)
  const [wordKeszul, setWordKeszul] = useState(false)

  const ujSorKell = useRef(ujSorral === true)

  const kerSzam = useRef(0)
  const betolt = useCallback(async () => {
    const n = ++kerSzam.current
    try {
      const d = await data.getSheet(cegId, kert)
      if (n !== kerSzam.current) return
      setLap(d)
      setHiba(null)
      if (ujSorKell.current) {
        ujSorKell.current = false
        if (!d.sheet?.closed_at) setSor(uresSor(d.period_start, d.period_end))
      }
    } catch (e) {
      if (n === kerSzam.current) setHiba(hibaSzoveg(e))
    }
  }, [data, cegId, kert])

  useEffect(() => { void betolt() }, [betolt])
  useEffect(() => data.subscribe(() => void betolt()), [data, betolt])

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sor && !beallit) onBezar() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onBezar, sor, beallit])

  function lep(uj: string) {
    if (uj === kert) return
    setKert(uj)
    setLap(null)
  }

  const honap = lap ? lap.month.slice(0, 10) : honapElseje(kert)

  const zarva = Boolean(lap?.sheet?.closed_at)
  const oszlopok = (lap?.columns ?? []).filter((o) => o.visible)
  const sorok = lap?.rows ?? []
  const alairasNelkul = sorok.filter((r) => !r.signature).length
  const nettoOsszes = sorok.reduce((s, r) => s + (r.net_huf ?? 0), 0)
  const nettoLatszik = oszlopok.some((o) => o.key === 'NETTO')
  const arSorok = lablecArak(lap?.prices ?? [])

  function ujSor(): SheetRow {
    return lap ? uresSor(lap.period_start, lap.period_end) : uresSor(honap, honap)
  }
  const idoszak = lap ? idoszakCim(lap.period_start, lap.period_end) : honapCim(honap)

  async function word() {
    if (!lap || wordKeszul) return
    setWordKeszul(true)
    setHiba(null)
    try {
      await igazoloLetolt(lap)
    } catch (e) {
      setHiba(`A Word fájl nem készült el: ${hibaSzoveg(e)}`)
    } finally {
      setWordKeszul(false)
    }
  }

  async function lezar() {
    const hianyzik = alairasNelkul > 0
      ? ` ${alairasNelkul} sorról hiányzik az aláírás — a kinyomtatott lapon még aláírható.`
      : ''
    if (!(await kerdez({
      cim: `Lezárod a(z) ${idoszak} lapot?`,
      szoveg: 'Lezárás után a sorok nem módosíthatók, és erre az időszakra új sor sem vehető fel. '
        + 'Ha javítani kell, újranyitható.' + hianyzik,
      igen: 'Lezárás', nem: 'Mégse',
    }))) return
    try {
      await data.closeSheet(cegId, lap?.period_start ?? honap)
      await betolt()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
  }

  async function ujranyit() {
    if (!(await kerdez({
      cim: `Újranyitod a(z) ${idoszak} lapot?`,
      szoveg: 'A sorok újra módosíthatók lesznek. A javítás után érdemes újra lezárni.',
      igen: 'Újranyitás', nem: 'Mégse',
    }))) return
    try {
      await data.reopenSheet(cegId, lap?.period_start ?? honap)
      await betolt()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
  }

  const allapot = !lap
    ? null
    : zarva
      ? `lezárva ${helyiNap(lap.sheet?.closed_at)}`
        + (lap.sheet?.closed_by_name ? ` · ${lap.sheet.closed_by_name}` : '')
      : lap.sheet ? 'nyitott' : 'még nincs sora'

  return createPortal(
    <div className="fedo" role="presentation"
         onMouseDown={(e) => e.target === e.currentTarget && !sor && !beallit && onBezar()}>
      <div className="lap lap-igazolo" role="dialog" aria-modal="true" aria-label={`Igazolólap: ${cegNev}`}>
        <div className="lap-fej">
          <div>
            <h2>Igazolólap</h2>
            <div className="halk" style={{ fontSize: 'var(--m-sm)' }}>{cegNev}</div>
          </div>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          <div className="igazolo-fejsor">
            <div className="honap-lepteto">
              <button className="btn btn-kicsi" aria-label="Előző hónap"
                      onClick={() => lep(honapPlusz(honap, -1))}>‹</button>
              <strong className="honap-nev">{honapCim(honap)}</strong>
              <button className="btn btn-kicsi" aria-label="Következő hónap"
                      onClick={() => lep(honapPlusz(honap, 1))}>›</button>
            </div>
            {allapot && (
              <span className="cimke-pill igazolo-allapot" data-zarva={zarva}>{allapot}</span>
            )}
          </div>
          {lap && !naptariHonap(lap.period_start) && (
            <div className="igazolo-idoszak">
              Időszak: <strong>{idoszakNapok(lap.period_start, lap.period_end)}</strong>
              <span className="halk"> (a szerződés fordulónapja szerint)</span>
            </div>
          )}

          <HonapUgras honap={honap} onLep={lep} />

          {hiba && <div className="hibauzenet">{hiba}</div>}

          <div className="igazolo-eszkozok">
            {!zarva && (
              <button className="btn btn-fo" onClick={() => setSor(ujSor())}>+ Új sor</button>
            )}
            {tulaj && !zarva && (
              <button className="btn" onClick={() => setBeallit(true)}>Oszlopok és lábléc</button>
            )}
            {tulaj && !zarva && sorok.length > 0 && (
              <button className="btn" onClick={() => void lezar()}>Hónap lezárása</button>
            )}
            {tulaj && zarva && (
              <button className="btn" onClick={() => void ujranyit()}>Újranyitás</button>
            )}
          </div>

          {zarva && (
            <div className="figyelmeztet">
              <span>
                <strong>Ez az időszak le van zárva:</strong> csak megnézni és letölteni lehet.
                Az oszlopai, a lábléce és az árai a lezáráskori állapotban maradnak —
                akkor is, ha azóta a cég beállítása vagy szerződése változott.
                A következő hónap lapja az első sorral magától megnyílik.{' '}
                <button className="link-gomb" onClick={() => lep(honapPlusz(honap, 1))}>
                  Tovább: {honapCim(honapPlusz(honap, 1))}
                </button>
              </span>
            </div>
          )}

          {!lap && !hiba && <div className="betolt">Betöltés…</div>}
          {lap && sorok.length === 0 && (
            <div className="ures">
              Ebben az időszakban még nincs sor. A napi nézetben a cég autójánál az
              „Igazolólap" gombbal, vagy itt a „+ Új sor" gombbal kerül rá.
            </div>
          )}
          {lap && sorok.length > 0 && (
            <table className="igazolo-tabla">
              <thead>
                <tr>{oszlopok.map((o) => <th key={o.key} data-kulcs={o.key}>{o.label}</th>)}</tr>
              </thead>
              <tbody>
                {sorok.map((r) => (
                  <tr key={r.id ?? r.day} onClick={() => setSor(r)}>
                    {oszlopok.map((o, i) => (
                      <td key={o.key} data-kulcs={o.key} data-cimke={o.label}>
                        {o.key === 'ALAIRAS'
                          ? (r.signature
                              ? <img src={r.signature} alt="aláírás" className="alairas-mini" />
                              : <span className="halvany">—</span>)
                          : i === 0
                            ? <button className="link-gomb" onClick={(e) => { e.stopPropagation(); setSor(r) }}>
                                {cellaSzoveg(o, r) || '—'}
                              </button>
                            : cellaSzoveg(o, r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {lap && sorok.length > 0 && (
            <div className="igazolo-osszeg">
              <span>{sorok.length} autó</span>
              {nettoLatszik && <span>nettó összesen: <strong>{ft(nettoOsszes)}</strong></span>}
              {alairasNelkul > 0 && (
                <span className="figyel">{alairasNelkul} aláírás hiányzik</span>
              )}
            </div>
          )}

          {lap && (arSorok.length > 0 || lap.footer_text) && (
            <div className="igazolo-lablec">
              <div className="szakasz-cim">Lábléc</div>
              {arSorok.map((s) => <div key={s}>{s}</div>)}
              {lap.footer_text && <div className="sajat-szoveg">{lap.footer_text}</div>}
            </div>
          )}

          {lap && lap.months.length > 0 && (
            <div>
              <div className="szakasz-cim">Lapok</div>
              <div className="honap-gombok">
                {lap.months.map((m) => (
                  <button key={m.start} className="btn btn-kicsi"
                          data-aktiv={m.start.slice(0, 10) === lap.period_start.slice(0, 10)}
                          onClick={() => lep(m.start.slice(0, 10))}>
                    {idoszakCim(m.start.slice(0, 10), m.end.slice(0, 10))}
                    <span className="halk"> · {m.rows} sor{m.closed ? ' · lezárva' : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lap-lab">
          <span className="halk igazolo-lab-szoveg">
            {lap && lap.rows.length === 0
              ? 'Üres hónap: a Word üres sorokkal készül, papíron kitölthető.'
              : 'A Word a lap mostani állapotával készül.'}
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
        <SorUrlap
          cegId={cegId}
          cegNev={cegNev}
          oszlopok={lap.columns}
          sor={sor}
          zarva={zarva}
          onBezar={() => setSor(null)}
          onMentve={() => void betolt()}
        />
      )}
      {beallit && lap && (
        <LapBeallitas
          cegId={cegId}
          oszlopok={lap.columns}
          lablec={lap.footer_text}
          arSorok={arSorok}
          onBezar={() => setBeallit(false)}
          onMentve={() => void betolt()}
        />
      )}
      {kerdesAblak}
    </div>,
    document.body,
  )
}
