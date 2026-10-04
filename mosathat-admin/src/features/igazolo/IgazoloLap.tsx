import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import { ft, honapCim, honapElseje, honapPlusz, maStr } from '../../lib/format'
import { cellaSzoveg, lablecArak } from '../../lib/igazolo'
import { igazoloLetolt } from '../../lib/igazoloWord'
import type { SheetDetail, SheetRow } from '../../lib/types'
import { useKerdes } from '../common/Kerdes'
import SorUrlap from './SorUrlap'
import LapBeallitas from './LapBeallitas'
import HonapUgras from './HonapUgras'

// ---------------------------------------------------------------------------
//  Egy cég igazolólapja — havonta egy
//
//  Ez váltja ki a cégenkénti Word fájlt. A lap sorai az átadott autók:
//  dátum, rendszám, km óra állás, nettó ár, név, aláírás (és amit a cég még
//  kér: saját oszlopok). A lap alján a szerződés árai és egy szabad szöveg.
//
//  Hogyan kerül sor a lapra:
//    - a napi nézetből, a foglalás „Igazolólap" gombjával (előre kitöltve);
//    - itt, a „+ Új sor" gombbal (kézzel, pl. egy régi, papíros tételhez).
//
//  A hónap végén a tulajdonos lezárja a lapot: onnantól csak olvasható. A
//  következő hónap lapja az első sorral magától megnyílik — nincs külön
//  „új lap" teendő. Ha mégis javítani kell, a lezárt lap újranyitható.
//
//  A Word letöltés is innen indul (a fájlt a böngésző állítja össze, lásd
//  lib/igazoloWord.ts) — a lezárt és a nyitott hónapé is.
// ---------------------------------------------------------------------------

/** Új, üres sor: a mostani hónapban a mai nappal, máskor a hónap elsejével. */
function uresSor(honap: string): SheetRow {
  const ma = maStr()
  return {
    id: null, booking_id: null,
    day: honapElseje(ma) === honap ? ma : honap,
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
  /** Melyik hónappal nyíljon (alapból a mostani). */
  kezdoHonap?: string
  /** Betöltés után rögtön egy új sor nyíljon (az Igazolólap menü „+ Sor" gombja). */
  ujSorral?: boolean
  onBezar: () => void
}) {
  const { data, user } = useApp()
  const tulaj = user?.canEditCustomers === true
  const [kerdesAblak, kerdez] = useKerdes()
  const [honap, setHonap] = useState(() => honapElseje(kezdoHonap ?? maStr()))
  const [lap, setLap] = useState<SheetDetail | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  // A megnyitott sor (szerkesztés vagy új), és a beállítások ablaka.
  const [sor, setSor] = useState<SheetRow | null>(null)
  const [beallit, setBeallit] = useState(false)
  // A Word fájl készül (pár tized másodperc, nagy lapnál egy-két másodperc).
  const [wordKeszul, setWordKeszul] = useState(false)

  // Az új sor csak az ELSŐ betöltés után nyílik meg magától, később nem.
  const ujSorKell = useRef(ujSorral === true)

  const betolt = useCallback(async () => {
    try {
      const d = await data.getSheet(cegId, honap)
      setLap(d)
      setHiba(null)
      if (ujSorKell.current) {
        ujSorKell.current = false
        if (!d.sheet?.closed_at) setSor(uresSor(honap))
      }
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }, [data, cegId, honap])

  useEffect(() => { void betolt() }, [betolt])
  // Ha a tableten aláírnak, a pultnál nyitott lap is frissül.
  useEffect(() => data.subscribe(() => void betolt()), [data, betolt])

  // Esc: csak ha nincs felette másik ablak (sor, beállítások).
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sor && !beallit) onBezar() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onBezar, sor, beallit])

  /**
   * Egy másik hónapra lép (nyíl, választó, a lapok listája). A régi hónap
   * adata azonnal eltűnik — különben a betöltés alatt egy pillanatra az előző
   * hónap sorai és állapota látszana az új hónap neve alatt.
   */
  function lep(uj: string) {
    if (uj === honap) return
    setHonap(uj)
    setLap(null)
  }

  const zarva = Boolean(lap?.sheet?.closed_at)
  const oszlopok = (lap?.columns ?? []).filter((o) => o.visible)
  const sorok = lap?.rows ?? []
  const alairasNelkul = sorok.filter((r) => !r.signature).length
  const nettoOsszes = sorok.reduce((s, r) => s + (r.net_huf ?? 0), 0)
  const nettoLatszik = oszlopok.some((o) => o.key === 'NETTO')
  const arSorok = lablecArak(lap?.prices ?? [])

  function ujSor(): SheetRow { return uresSor(honap) }

  /** A Word fájl: a böngésző állítja össze a lap mostani állapotából. */
  async function word() {
    if (!lap || wordKeszul) return
    setWordKeszul(true)
    setHiba(null)
    try {
      await igazoloLetolt(lap)
    } catch (e) {
      setHiba(`A Word fájl nem készült el: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setWordKeszul(false)
    }
  }

  async function lezar() {
    const hianyzik = alairasNelkul > 0
      ? ` ${alairasNelkul} sorról hiányzik az aláírás — a kinyomtatott lapon még aláírható.`
      : ''
    if (!(await kerdez({
      cim: `Lezárod a ${honapCim(honap)} lapot?`,
      szoveg: 'Lezárás után a sorok nem módosíthatók, és erre a hónapra új sor sem vehető fel. '
        + 'Ha javítani kell, újranyitható.' + hianyzik,
      igen: 'Lezárás', nem: 'Mégse',
    }))) return
    try {
      await data.closeSheet(cegId, honap)
      await betolt()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  async function ujranyit() {
    if (!(await kerdez({
      cim: `Újranyitod a ${honapCim(honap)} lapot?`,
      szoveg: 'A sorok újra módosíthatók lesznek. A javítás után érdemes újra lezárni.',
      igen: 'Újranyitás', nem: 'Mégse',
    }))) return
    try {
      await data.reopenSheet(cegId, honap)
      await betolt()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  // A lap állapota egy szóval, a hónap mellett.
  const allapot = !lap
    ? null
    : zarva
      ? `lezárva ${lap.sheet?.closed_at?.slice(0, 10) ?? ''}`
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
          {/* --- hónap és állapot ------------------------------------------- */}
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

          {/* Bármelyik korábbi (vagy későbbi) hónap, korlát nélkül: az év
              szabadon beírható, a hónap választható. A nyilakkal egyesével
              lehet lépni, a lap alján pedig ott vannak a cég eddigi lapjai. */}
          <HonapUgras honap={honap} onLep={lep} />

          {hiba && <div className="hibauzenet">{hiba}</div>}

          {/* --- teendők ----------------------------------------------------- */}
          <div className="igazolo-eszkozok">
            {!zarva && (
              <button className="btn btn-fo" onClick={() => setSor(ujSor())}>+ Új sor</button>
            )}
            {/* Lezárt hónapnál nincs: annak a kinézete a lezáráskor rögzült. */}
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
                <strong>Ez a hónap le van zárva:</strong> csak megnézni és letölteni lehet.
                Az oszlopai, a lábléce és az árai a lezáráskori állapotban maradnak —
                akkor is, ha azóta a cég beállítása vagy szerződése változott.
                A következő hónap lapja az első sorral magától megnyílik.{' '}
                <button className="link-gomb" onClick={() => lep(honapPlusz(honap, 1))}>
                  Tovább: {honapCim(honapPlusz(honap, 1))}
                </button>
              </span>
            </div>
          )}

          {/* --- a sorok ------------------------------------------------------ */}
          {!lap && !hiba && <div className="betolt">Betöltés…</div>}
          {lap && sorok.length === 0 && (
            <div className="ures">
              Ebben a hónapban még nincs sora. A napi nézetben a cég autójánál az
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
                  // Az egész sor kattintható: megnyitja szerkesztésre (lezárt
                  // lapnál megnézésre). Billentyűvel a sor első cellájában
                  // lévő gomb érhető el.
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

          {/* --- a lábléc, ahogy a Wordbe kerül ------------------------------ */}
          {lap && (arSorok.length > 0 || lap.footer_text) && (
            <div className="igazolo-lablec">
              <div className="szakasz-cim">Lábléc</div>
              {arSorok.map((s) => <div key={s}>{s}</div>)}
              {lap.footer_text && <div className="sajat-szoveg">{lap.footer_text}</div>}
            </div>
          )}

          {/* --- a korábbi hónapok ------------------------------------------- */}
          {lap && lap.months.length > 0 && (
            <div className="igazolo-honapok">
              <div className="szakasz-cim">Lapok</div>
              <div className="honap-gombok">
                {lap.months.map((m) => (
                  <button key={m.month} className="btn btn-kicsi"
                          data-aktiv={m.month.slice(0, 10) === honap}
                          onClick={() => lep(m.month.slice(0, 10))}>
                    {honapCim(m.month.slice(0, 10))}
                    <span className="halk"> · {m.rows} sor{m.closed ? ' · lezárva' : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lap-lab">
          {/* Üres hónapnál is letölthető: akkor üres sorokkal készül, papíron
              kitölthető. */}
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
