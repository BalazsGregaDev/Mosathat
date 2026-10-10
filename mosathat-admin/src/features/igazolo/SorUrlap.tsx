import { useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg, honapCim } from '../../lib/format'
import type { SheetColumn, SheetRow } from '../../lib/types'
import { useKerdes } from '../common/Kerdes'
import Ablak from '../common/Ablak'
import AlairasRajzolo from './AlairasRajzolo'

function szam(s: string): number | null {
  const t = s.trim()
  if (/^\d+\.\d{1,2}$/.test(t)) return Math.round(Number(t))
  const d = t.split(',')[0].replace(/[^0-9]/g, '')
  return d === '' ? null : Number(d)
}

export default function SorUrlap({
  cegId,
  cegNev,
  oszlopok,
  sor,
  zarva,
  uzenet,
  onBezar,
  onMentve,
}: {
  cegId: string
  cegNev: string
  oszlopok: SheetColumn[]
  sor: SheetRow
  zarva: boolean
  uzenet?: string
  onBezar: () => void
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
  const [alairasValtozott, setAlairasValtozott] = useState(false)
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  const valtozott = alairasValtozott
    || nap !== sor.day.slice(0, 10)
    || rendszam !== (sor.plate ?? '')
    || km !== (sor.km != null ? String(sor.km) : '')
    || netto !== (sor.net_huf != null ? String(sor.net_huf) : '')
    || nev !== (sor.name ?? '')
    || JSON.stringify(extra) !== JSON.stringify(sor.extra ?? {})

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
      setHiba(hibaSzoveg(e))
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
      setHiba(hibaSzoveg(e))
    }
  }

  return createPortal(
    <Ablak cimke="Igazolólap sora"
           onEsc={() => { if (!megy) onBezar() }}
           onHatter={() => { if (!megy && !valtozott) onBezar() }}>
      <div className="lap">
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
          {uzenet && !zarva && <div className="igazolo-uzenet">{uzenet}</div>}
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
    </Ablak>,
    document.body,
  )
}
