import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import { honapCim } from '../../lib/format'
import type { SheetColumn, SheetRow } from '../../lib/types'
import { useKerdes } from '../common/Kerdes'
import AlairasRajzolo from './AlairasRajzolo'

// ---------------------------------------------------------------------------
//  Az igazolólap egy sora — kitöltés, aláírás, mentés
//
//  Két helyről nyílik:
//
//    - a napi nézetből (a kártya vagy a munkalap „Igazolólap" gombja): a sor
//      már ki van töltve a foglalásból — dátum (az átadás napja), rendszám,
//      nettó ár, a sofőr neve. Csak a km-t kell beírni és aláírni.
//    - a cég lapjáról („+ Új sor", vagy egy meglévő sorra kattintva).
//
//  A mezők a cég oszlopaiból jönnek: ami el van rejtve, az itt sem látszik
//  (a dátum kivétel: abból tudjuk, melyik havi lapra kerül a sor). A cég
//  saját oszlopai szöveges mezők.
//
//  Lezárt lapnál minden csak olvasható.
// ---------------------------------------------------------------------------

/** Csak a számjegyek („123 456 km" → 123456); üresből null. */
function szam(s: string): number | null {
  const d = s.replace(/[^0-9]/g, '')
  return d === '' ? null : Number(d)
}

export default function SorUrlap({
  cegId,
  cegNev,
  oszlopok,
  sor,
  zarva,
  onBezar,
  onMentve,
}: {
  cegId: string
  cegNev: string
  oszlopok: SheetColumn[]
  /** A kitöltendő / módosítandó sor (új sornál id = null). */
  sor: SheetRow
  /** A sor hónapjának lapja le van zárva: csak olvasható. */
  zarva: boolean
  onBezar: () => void
  /** Mentés vagy törlés után (a hívó újratölt). */
  onMentve?: () => void
}) {
  const { data } = useApp()
  const [kerdesAblak, kerdez] = useKerdes()
  const [nap, setNap] = useState(sor.day.slice(0, 10))
  const [rendszam, setRendszam] = useState(sor.plate ?? '')
  const [km, setKm] = useState(sor.km != null ? String(sor.km) : '')
  const [netto, setNetto] = useState(sor.net_huf != null ? String(sor.net_huf) : '')
  const [nev, setNev] = useState(sor.name ?? '')
  const [extra, setExtra] = useState<Record<string, string>>(sor.extra ?? {})
  const [alairas, setAlairas] = useState<string | null>(sor.signature)
  // Csak akkor küldjük el az aláírást, ha változott — különben a mentett marad.
  const [alairasValtozott, setAlairasValtozott] = useState(false)
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

  const latszik = (key: string) => oszlopok.find((o) => o.key === key)?.visible !== false
  const cimke = (key: string, alap: string) => oszlopok.find((o) => o.key === key)?.label ?? alap
  const sajat = oszlopok.filter((o) => o.key.startsWith('E_') && o.visible)

  async function ment() {
    if (megy || zarva) return
    if (!nap) { setHiba('Add meg a dátumot.'); return }
    setMegy(true)
    setHiba(null)
    try {
      await data.saveSheetRow({
        id: sor.id,
        booking_id: sor.booking_id,
        company_id: cegId,
        day: nap,
        plate: rendszam.trim() || null,
        km: szam(km),
        net_huf: szam(netto),
        name: nev.trim() || null,
        extra,
        ...(alairasValtozott ? { signature: alairas ?? '' } : {}),
      })
      onMentve?.()
      onBezar()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMegy(false)
    }
  }

  async function torol() {
    if (!sor.id || zarva) return
    if (!(await kerdez({
      cim: 'Biztosan törlöd ezt a sort?',
      szoveg: `${nap} · ${rendszam || 'rendszám nélkül'}`,
      igen: 'Törlés', nem: 'Mégse', veszelyes: true,
    }))) return
    try {
      await data.deleteSheetRow(sor.id)
      onMentve?.()
      onBezar()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  return createPortal(
    <div className="fedo" role="presentation"
         onMouseDown={(e) => e.target === e.currentTarget && !megy && onBezar()}>
      <div className="lap" role="dialog" aria-modal="true" aria-label="Igazolólap sora">
        <div className="lap-fej">
          <div>
            <h2>Igazolólap</h2>
            <div className="halk" style={{ fontSize: 'var(--m-sm)' }}>
              {cegNev} · {honapCim(nap || sor.day)}
            </div>
          </div>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs sorurlap">
          {zarva && (
            <div className="figyelmeztet">
              <span>
                <strong>Ez a havi lap le van zárva.</strong> A sor csak megnézhető;
                ha javítani kell, a tulajdonos újranyithatja a cég lapján.
              </span>
            </div>
          )}
          {hiba && <div className="hibauzenet">{hiba}</div>}

          <div className="sor-2">
            <div className="mezo">
              <label htmlFor="ig-nap">{cimke('DATUM', 'Dátum')}</label>
              <input id="ig-nap" className="beviteli" type="date" value={nap} disabled={zarva}
                     onChange={(e) => setNap(e.target.value)} />
            </div>
            {latszik('RENDSZAM') && (
              <div className="mezo">
                <label htmlFor="ig-rsz">{cimke('RENDSZAM', 'Rendszám')}</label>
                <input id="ig-rsz" className="beviteli beviteli-rendszam" value={rendszam}
                       disabled={zarva} onChange={(e) => setRendszam(e.target.value)} />
              </div>
            )}
          </div>

          <div className="sor-2">
            {latszik('KM') && (
              <div className="mezo">
                <label htmlFor="ig-km">{cimke('KM', 'Km óra állás')}</label>
                <input id="ig-km" className="beviteli szam" inputMode="numeric" value={km}
                       disabled={zarva} placeholder="pl. 123456"
                       onChange={(e) => setKm(e.target.value)} />
              </div>
            )}
            {latszik('NETTO') && (
              <div className="mezo">
                <label htmlFor="ig-netto">{cimke('NETTO', 'Nettó ár')} (Ft)</label>
                <input id="ig-netto" className="beviteli szam" inputMode="numeric" value={netto}
                       disabled={zarva} onChange={(e) => setNetto(e.target.value)} />
              </div>
            )}
          </div>

          {latszik('NEV') && (
            <div className="mezo">
              <label htmlFor="ig-nev">{cimke('NEV', 'Név')}</label>
              <input id="ig-nev" className="beviteli" value={nev} disabled={zarva}
                     onChange={(e) => setNev(e.target.value)} />
            </div>
          )}

          {/* A cég saját oszlopai: szöveges mezők. */}
          {sajat.map((o) => (
            <div className="mezo" key={o.key}>
              <label htmlFor={`ig-${o.key}`}>{o.label}</label>
              <input id={`ig-${o.key}`} className="beviteli" value={extra[o.key] ?? ''}
                     disabled={zarva}
                     onChange={(e) => setExtra((x) => ({ ...x, [o.key]: e.target.value }))} />
            </div>
          ))}

          {latszik('ALAIRAS') && (
            <div className="mezo">
              <span className="cimke">{cimke('ALAIRAS', 'Aláírás')}</span>
              <AlairasRajzolo ertek={sor.signature} zarolt={zarva}
                              onValt={(k) => { setAlairas(k); setAlairasValtozott(true) }} />
              <small>
                Nem kötelező: ha most nem írja alá, a Wordben üres marad a cella, és
                kinyomtatva papíron aláírható.
              </small>
            </div>
          )}
        </div>

        <div className="lap-lab">
          <div className="gombok" style={{ marginLeft: 0, width: '100%' }}>
            <button className="btn" onClick={onBezar} disabled={megy}>
              {zarva ? 'Bezárás' : 'Mégse'}
            </button>
            {sor.id && !zarva && (
              <button className="btn btn-veszelyes" onClick={() => void torol()} disabled={megy}>
                Törlés
              </button>
            )}
            {!zarva && (
              <button className="btn btn-fo" onClick={() => void ment()} disabled={megy}
                      style={{ marginLeft: 'auto' }}>
                {megy ? 'Mentés…' : 'Mentés'}
              </button>
            )}
          </div>
        </div>
      </div>
      {kerdesAblak}
    </div>,
    document.body,
  )
}
