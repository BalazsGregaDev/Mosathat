import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import { sajatOszlop, ujOszlopKulcs } from '../../lib/igazolo'
import type { SheetColumn } from '../../lib/types'
import { useKerdes } from '../common/Kerdes'

// ---------------------------------------------------------------------------
//  Az igazolólap oszlopai és lábléce — cégenként
//
//  Minden cég a saját formáját kéri. Ezért:
//
//    - az alap oszlopok (Dátum, Rendszám, Km óra állás, Nettó ár, Név,
//      Aláírás) ÁTNEVEZHETŐK és ELREJTHETŐK, de nem törölhetők — a program
//      ezekbe tölti az adatot a foglalásból;
//    - bármennyi SAJÁT oszlop felvehető (pl. „Munkaszám", „Költséghely"),
//      ezek szöveges mezők, kézzel töltik ki;
//    - a sorrend szabadon állítható (Fel / Le).
//
//  A lábléc elején a szerződés árai állnak (méret – csomag – nettó ár), ezt
//  a szerződésből számoljuk, itt nem kell beírni. Alájuk jön a saját szöveg
//  (pl. „Fizetés havonta, átutalással.").
//
//  A beállítás a NYITOTT hónapokra érvényes. A lezárt hónap a lezáráskori
//  oszlopokkal, lábléccel és árakkal marad (az adatbázis rögzíti) — így egy
//  régi lap Word fájlja akkor is ugyanaz, ha azóta itt bármi változott.
// ---------------------------------------------------------------------------

export default function LapBeallitas({
  cegId,
  oszlopok,
  lablec,
  arSorok,
  onBezar,
  onMentve,
}: {
  cegId: string
  oszlopok: SheetColumn[]
  lablec: string | null
  /** A szerződés árai a lábléchez — csak megmutatjuk, itt nem szerkeszthető. */
  arSorok: string[]
  onBezar: () => void
  onMentve: () => void
}) {
  const { data } = useApp()
  const [kerdesAblak, kerdez] = useKerdes()
  // Saját másolat: a „Mégse" így nem hagy nyomot.
  const [sorok, setSorok] = useState<SheetColumn[]>(() => oszlopok.map((o) => ({ ...o })))
  const [szoveg, setSzoveg] = useState(lablec ?? '')
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  // Escape: csak ezt az ablakot zárja be, az alatta lévőt (munkalap, cég
  // lapja) nem. Ezért a „capture" fázisban figyeljük, és nem engedjük tovább.
  // Ha épp egy kérdés van nyitva (pl. „Biztosan törlöd?"), az Escape azé.
  const kerdesNyitva = Boolean(kerdesAblak)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || kerdesNyitva) return
      e.stopPropagation()
      if (!megy) onBezar()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onBezar, megy, kerdesNyitva])

  function valtoztat(i: number, v: Partial<SheetColumn>) {
    setSorok((s) => s.map((o, j) => (j === i ? { ...o, ...v } : o)))
  }

  /** Egy oszlop arrébb tolása: -1 fel, +1 le. */
  function mozgat(i: number, irany: -1 | 1) {
    const j = i + irany
    if (j < 0 || j >= sorok.length) return
    setSorok((s) => {
      const uj = [...s]
      ;[uj[i], uj[j]] = [uj[j], uj[i]]
      return uj
    })
  }

  async function torol(i: number) {
    const o = sorok[i]
    if (!(await kerdez({
      cim: `Törlöd a(z) „${o.label}" oszlopot?`,
      szoveg: 'A lapról és a Word fájlból is eltűnik. Ha csak most nem kell, elég kivenni a pipát a „Látszik" elől.',
      igen: 'Törlés', nem: 'Mégse', veszelyes: true,
    }))) return
    setSorok((s) => s.filter((_, j) => j !== i))
  }

  function ujOszlop() {
    setSorok((s) => [...s, { key: ujOszlopKulcs(), label: 'Új oszlop', visible: true }])
  }

  async function ment() {
    if (megy) return
    if (sorok.some((o) => !o.label.trim())) { setHiba('Minden oszlopnak legyen neve.'); return }
    setMegy(true)
    setHiba(null)
    try {
      await data.saveSheetSettings(cegId, {
        columns: sorok.map((o) => ({ ...o, label: o.label.trim() })),
        footer_text: szoveg.trim() || null,
      })
      onMentve()
      onBezar()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMegy(false)
    }
  }

  return createPortal(
    <div className="fedo" role="presentation"
         onMouseDown={(e) => e.target === e.currentTarget && !megy && onBezar()}>
      <div className="lap" role="dialog" aria-modal="true" aria-label="Oszlopok és lábléc">
        <div className="lap-fej">
          <h2>Oszlopok és lábléc</h2>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          {hiba && <div className="hibauzenet">{hiba}</div>}

          <div className="szakasz">
            <div className="fej">Oszlopok, balról jobbra</div>
            <div className="oszlop-lista">
              {sorok.map((o, i) => (
                <div className="oszlop-sor" key={o.key} data-rejtett={!o.visible}>
                  <input className="beviteli" value={o.label} aria-label="Oszlop neve"
                         onChange={(e) => valtoztat(i, { label: e.target.value })} />
                  <label className="latszik">
                    <input type="checkbox" checked={o.visible}
                           onChange={(e) => valtoztat(i, { visible: e.target.checked })} />
                    Látszik
                  </label>
                  <div className="oszlop-gombok">
                    <button type="button" className="btn btn-kicsi" disabled={i === 0}
                            onClick={() => mozgat(i, -1)} aria-label={`${o.label} feljebb`}>Fel</button>
                    <button type="button" className="btn btn-kicsi" disabled={i === sorok.length - 1}
                            onClick={() => mozgat(i, 1)} aria-label={`${o.label} lejjebb`}>Le</button>
                    {sajatOszlop(o)
                      ? <button type="button" className="btn btn-kicsi btn-veszelyes"
                                onClick={() => void torol(i)}>Törlés</button>
                      : <span className="alap-jel" title="Alap oszlop: elrejthető, de nem törölhető">alap</span>}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <button type="button" className="btn" onClick={ujOszlop}>+ Saját oszlop</button>
            </div>
            <small className="halk">
              Az alap oszlopokat a program tölti ki a foglalásból; átnevezhetők és
              elrejthetők. A saját oszlopokba szöveget írtok a sor kitöltésekor.
              A változás a nyitott hónapokra érvényes; a lezártak úgy maradnak,
              ahogy lezáráskor voltak.
            </small>
          </div>

          <div className="szakasz">
            <div className="fej">Lábléc</div>
            {arSorok.length > 0
              ? (
                <div className="igazolo-lablec">
                  {arSorok.map((s) => <div key={s}>{s}</div>)}
                  <small className="halk">
                    Ezek a szerződés árai (nettó) — a Cégek és bérletesek menüben, a szerződésnél
                    változtathatók.
                  </small>
                </div>
              )
              : <small className="halk">A cégnek nincs szerződéses ára: a láblécben csak a saját szöveg áll.</small>}
            <div className="mezo">
              <label htmlFor="ig-lablec">Saját szöveg az árak alatt</label>
              <textarea id="ig-lablec" className="beviteli" rows={3} value={szoveg}
                        placeholder="pl. Fizetés havonta, átutalással."
                        onChange={(e) => setSzoveg(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="lap-lab">
          <div className="gombok">
            <button className="btn" onClick={onBezar} disabled={megy}>Mégse</button>
            <button className="btn btn-fo" onClick={() => void ment()} disabled={megy}>
              {megy ? 'Mentés…' : 'Mentés'}
            </button>
          </div>
        </div>
      </div>
      {kerdesAblak}
    </div>,
    document.body,
  )
}
