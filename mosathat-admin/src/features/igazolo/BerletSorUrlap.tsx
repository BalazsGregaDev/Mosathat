import { useState } from 'react'
import { createPortal } from 'react-dom'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg } from '../../lib/format'
import { tetelNev } from '../../lib/berlet'
import type { BerletSor, BerletTetel } from '../../lib/types'
import { useKerdes } from '../common/Kerdes'
import Ablak from '../common/Ablak'
import AlairasRajzolo from './AlairasRajzolo'

export default function BerletSorUrlap({
  ugyfelNev,
  berletNev,
  sor,
  tetelek,
  uzenet,
  onBezar,
  onMentve,
}: {
  ugyfelNev: string
  berletNev: string
  sor: BerletSor
  tetelek?: BerletTetel[]
  uzenet?: string
  onBezar: () => void
  onMentve?: () => void
}) {
  const { data, user } = useApp()
  const tulaj = user?.canEditCustomers === true
  const [kerdesAblak, kerdez] = useKerdes()
  const ujKezi = !sor.id && !sor.booking_id
  const valaszthato = (tetelek ?? []).filter((t) => t.left > 0)
  const [tetel, setTetel] = useState(sor.pass_item_id ?? valaszthato[0]?.id ?? '')
  const [nap, setNap] = useState(sor.day.slice(0, 10))
  const [rendszam, setRendszam] = useState(sor.plate ?? '')
  const [nev, setNev] = useState(sor.name ?? '')
  const [megj, setMegj] = useState(sor.note ?? '')
  const [alairas, setAlairas] = useState<string | null>(sor.signature)
  const [alairasValtozott, setAlairasValtozott] = useState(false)
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  const valtozott = alairasValtozott
    || nap !== sor.day.slice(0, 10)
    || rendszam !== (sor.plate ?? '')
    || nev !== (sor.name ?? '')
    || megj !== (sor.note ?? '')

  const valasztott = ujKezi ? valaszthato.find((t) => t.id === tetel) : null
  const alcim = ujKezi
    ? 'Korábbi alkalom felvétele'
    : `${sor.sorszam}. alkalom · ${tetelNev(sor)}`

  async function ment() {
    if (megy) return
    if (!nap) { setHiba('Add meg a dátumot.'); return }
    if (ujKezi && !tetel) { setHiba('Válaszd ki, melyik tételből vonjuk le az alkalmat.'); return }
    setMegy(true)
    setHiba(null)
    try {
      await data.saveBerletSor({
        id: sor.id,
        booking_id: sor.booking_id,
        pass_item_id: ujKezi ? tetel : sor.pass_item_id,
        day: nap,
        plate: rendszam.trim() || null,
        name: nev.trim() || null,
        note: megj.trim() || null,
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
    if (!sor.id || !sor.kezi) return
    if (!(await kerdez({
      cim: 'Biztosan törlöd ezt a sort?',
      szoveg: `${nap} · ${rendszam || 'rendszám nélkül'}. Az alkalom visszakerül a bérletre.`,
      igen: 'Törlés', nem: 'Mégse', veszelyes: true,
    }))) return
    try {
      await data.deleteBerletSor(sor.id)
      onMentve?.()
      onBezar()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
  }

  return createPortal(
    <Ablak cimke="Bérlet igazolólap sora"
           onEsc={() => { if (!megy) onBezar() }}
           onHatter={() => { if (!megy && !valtozott) onBezar() }}>
      <div className="lap">
        <div className="lap-fej">
          <div>
            <h2>Bérlet igazolólap</h2>
            <div className="halk" style={{ fontSize: 'var(--m-sm)' }}>
              {ugyfelNev} · {berletNev}
            </div>
          </div>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs sorurlap">
          <div className="berlet-alkalom">{alcim}</div>
          {uzenet && <div className="igazolo-uzenet">{uzenet}</div>}
          {hiba && <div className="hibauzenet">{hiba}</div>}

          {ujKezi && (
            <div className="mezo">
              <label htmlFor="bs-tetel">Melyik alkalmat vonjuk le?</label>
              <select id="bs-tetel" className="beviteli" value={tetel}
                      onChange={(e) => setTetel(e.target.value)}>
                {valaszthato.map((t) => (
                  <option key={t.id} value={t.id}>{tetelNev(t)} (még {t.left})</option>
                ))}
              </select>
              {valasztott && (
                <small>Papíron vezetett, korábbi alkalom: ennyivel kevesebb marad a bérleten.</small>
              )}
            </div>
          )}

          <div className="sor-2">
            <div className="mezo">
              <label htmlFor="bs-nap">Dátum</label>
              <input id="bs-nap" className="beviteli" type="date" value={nap}
                     onChange={(e) => setNap(e.target.value)} />
            </div>
            <div className="mezo">
              <label htmlFor="bs-rsz">Rendszám</label>
              <input id="bs-rsz" className="beviteli beviteli-rendszam" value={rendszam}
                     onChange={(e) => setRendszam(e.target.value)} />
            </div>
          </div>

          <div className="mezo">
            <label htmlFor="bs-nev">Név</label>
            <input id="bs-nev" className="beviteli" value={nev}
                   onChange={(e) => setNev(e.target.value)} />
          </div>

          <div className="mezo">
            <label htmlFor="bs-megj">Megjegyzés <span className="halk">(nem kötelező)</span></label>
            <input id="bs-megj" className="beviteli" value={megj} maxLength={300}
                   onChange={(e) => setMegj(e.target.value)} />
          </div>

          <div className="mezo">
            <span className="cimke">Aláírás</span>
            <AlairasRajzolo ertek={sor.signature}
                            onValt={(k) => { setAlairas(k); setAlairasValtozott(true) }} />
            <small>
              Nem kötelező: ha most nem írja alá, a Wordben üres marad a cella, és
              kinyomtatva papíron aláírható.
            </small>
          </div>
        </div>

        <div className="lap-lab">
          <div className="gombok" style={{ marginLeft: 0, width: '100%' }}>
            <button className="btn" onClick={onBezar} disabled={megy}>Mégse</button>
            {sor.id && sor.kezi && tulaj && (
              <button className="btn btn-veszelyes" onClick={() => void torol()} disabled={megy}>
                Törlés
              </button>
            )}
            <button className="btn btn-fo" onClick={() => void ment()}
                    disabled={megy || (ujKezi && valaszthato.length === 0)}
                    style={{ marginLeft: 'auto' }}>
              {megy ? 'Mentés…' : 'Mentés'}
            </button>
          </div>
        </div>
      </div>
      {kerdesAblak}
    </Ablak>,
    document.body,
  )
}
