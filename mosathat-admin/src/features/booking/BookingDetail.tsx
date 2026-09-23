import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, idosav, idotartam, ora } from '../../lib/format'
import {
  CATEGORY_LABEL, NEXT_STATUS, SCOPE_LABEL, STATUS_LABEL, TYPE_LABEL,
  type BookingTask, type DayBooking,
} from '../../lib/types'

// ---------------------------------------------------------------------------
//  Egy foglalás megnyitva.
//
//  Ez az a képernyő, ami a mosóállásban nyitva van: egy gomb az állapotra,
//  alatta a munkalista. A pipálás időbélyeget ír — ebből derül ki utólag,
//  meddig tartott a munka, és hogy nyitvatartási időn kívül készült-e.
//  Külön "indítom / leállítom" gomb nélkül.
// ---------------------------------------------------------------------------

export default function BookingDetail({
  bookingId,
  onBezar,
}: {
  bookingId: string
  onBezar: () => void
}) {
  const { data, refresh } = useApp()
  const [b, setB] = useState<DayBooking | null>(null)
  const [lista, setLista] = useState<BookingTask[]>([])
  const [tolt, setTolt] = useState(true)
  const [vegleges, setVegleges] = useState('')
  const [hiba, setHiba] = useState<string | null>(null)

  const betolt = useCallback(async () => {
    try {
      const [f, t] = await Promise.all([data.getBooking(bookingId), data.getTasks(bookingId)])
      setB(f)
      setLista(t)
      setVegleges(f?.final_price_huf ? String(f.final_price_huf) : '')
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setTolt(false)
    }
  }, [data, bookingId])

  useEffect(() => {
    void betolt()
  }, [betolt])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onBezar()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onBezar])

  async function pipal(t: BookingTask) {
    // Azonnal átbillentjük a felületen, hogy ne kelljen várni a válaszra —
    // a mosóállásban vizes kézzel nem szórakozik senki a késleltetéssel.
    setLista((l) => l.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))
    try {
      await data.toggleTask(t.id, !t.done)
      await betolt()
      refresh()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      await betolt()
    }
  }

  async function allapot(cel: Parameters<typeof data.setStatus>[1]) {
    try {
      await data.setStatus(bookingId, cel)
      await betolt()
      refresh()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  async function arMent() {
    const n = Number(vegleges)
    if (!Number.isFinite(n) || n < 0) return
    try {
      await data.setFinalPrice(bookingId, n)
      await betolt()
      refresh()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  const kovetkezo = b ? NEXT_STATUS[b.status] : undefined
  const keszLista = lista.filter((t) => t.done).length

  return (
    <div className="fedo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onBezar()}>
      <div className="lap" role="dialog" aria-modal="true" aria-label="Foglalás">
        {tolt || !b ? (
          <div className="lap-torzs">
            <div className="betolt">{hiba ? <span className="hibauzenet">{hiba}</span> : 'Betöltés…'}</div>
          </div>
        ) : (
          <>
            <div className="lap-fej">
              <div>
                <h2 style={{ fontFamily: 'var(--betu-szam)', letterSpacing: '.06em' }}>
                  {b.plate_raw}
                </h2>
                <div className="halk" style={{ fontSize: 'var(--m-sm)' }}>
                  {[b.brand, b.model].filter(Boolean).join(' ')} · {CATEGORY_LABEL[b.category]}
                </div>
              </div>
              <span className="cimke-pill allapot-pill" data-a={b.status} style={{ marginLeft: 12 }}>
                {STATUS_LABEL[b.status]}
              </span>
              <button className="bezar" onClick={onBezar} aria-label="Bezárás">
                ×
              </button>
            </div>

            <div className="lap-torzs">
              {hiba && <div className="hibauzenet">{hiba}</div>}

              {/* --- alapadatok --- */}
              <div className="szakasz">
                <div className="adatsor">
                  <span>Ügyfél</span>
                  <span className="ertek" style={{ fontFamily: 'var(--betu)' }}>
                    {b.customer_name}
                    {b.company_name && ` · ${b.company_name}`}
                  </span>
                </div>
                <div className="adatsor">
                  <span>Telefon</span>
                  <span className="ertek">
                    <a href={`tel:${b.customer_phone}`} style={{ color: 'inherit' }}>
                      {b.customer_phone}
                    </a>
                  </span>
                </div>
                <div className="adatsor">
                  <span>Mit kér</span>
                  <span className="ertek" style={{ fontFamily: 'var(--betu)' }}>
                    {b.package_name ?? 'Csak extrák'}
                    {b.full_service && ' + Full Service'}
                    {b.scope !== 'TELJES' && ` · ${SCOPE_LABEL[b.scope]}`}
                  </span>
                </div>
                <div className="adatsor">
                  <span>{TYPE_LABEL[b.booking_type]}</span>
                  <span className="ertek">
                    {b.booking_type === 'VAROS'
                      ? idosav(b.start_at, b.planned_duration_minutes)
                      : `${ora(b.drop_off_at)}${b.pick_up_at ? ` – ${ora(b.pick_up_at)}` : ''}`}
                  </span>
                </div>
                <div className="adatsor">
                  <span>Tervezett munkaidő</span>
                  <span className="ertek">
                    {b.planned_duration_minutes > 0 ? (
                      idotartam(b.planned_duration_minutes)
                    ) : (
                      <span style={{ color: 'var(--v-erkezett)' }}>nincs megadva</span>
                    )}
                    {b.rest_minutes > 0 && (
                      <span className="halk"> + {idotartam(b.rest_minutes)} száradás</span>
                    )}
                  </span>
                </div>
                {b.notes && (
                  <div className="adatsor">
                    <span>Megjegyzés</span>
                    <span className="ertek" style={{ fontFamily: 'var(--betu)', fontWeight: 400 }}>
                      {b.notes}
                    </span>
                  </div>
                )}
              </div>

              {/* --- munkalista --- */}
              <div className="szakasz">
                <div className="fej">
                  Munkalista
                  <span className="jobbra szam halk">
                    {keszLista}/{lista.length}
                  </span>
                </div>
                <div className="munkalista">
                  {lista.map((t) => (
                    <label className="munka" key={t.id} data-kesz={t.done}>
                      <input type="checkbox" checked={t.done} onChange={() => void pipal(t)} />
                      <span className="nev">{t.name}</span>
                      {t.done_at && <span className="terulet szam">{ora(t.done_at)}</span>}
                      <span className="terulet">{t.area === 'KULSO' ? 'kívül' : t.area === 'BELSO' ? 'belül' : ''}</span>
                    </label>
                  ))}
                  {lista.length === 0 && <div className="ures">Ehhez a foglaláshoz nincs munkalista.</div>}
                </div>
              </div>

              {/* --- ár --- */}
              <div className="szakasz">
                <div className="fej">Ár</div>
                <div className="adatsor">
                  <span>Becsült (foglaláskor)</span>
                  <span className="ertek">{ft(b.estimated_price_huf)}</span>
                </div>
                <div className="sor-2" style={{ alignItems: 'end' }}>
                  <div className="mezo">
                    <label htmlFor="veg">Végleges ár</label>
                    <input
                      id="veg"
                      className="beviteli szam"
                      type="number"
                      step={500}
                      value={vegleges}
                      onChange={(e) => setVegleges(e.target.value)}
                      placeholder={String(b.estimated_price_huf)}
                    />
                  </div>
                  <button className="btn" onClick={() => void arMent()} style={{ height: 43 }}>
                    Ár rögzítése
                  </button>
                </div>
                <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>
                  A becsült és a végleges közti eltérés a leghasznosabb adat a rendszerben:
                  ebből derül ki, hol becsül rosszul.
                </p>
              </div>
            </div>

            <div className="lap-lab">
              <div className="osszeg">
                <span className="ertek">{ft(b.final_price_huf ?? b.estimated_price_huf)}</span>
                <span className="alatta">
                  {b.final_price_huf ? 'végleges' : 'becsült'}
                </span>
              </div>
              <div className="gombok">
                {b.status === 'CONFIRMED' && (
                  <button className="btn" onClick={() => void allapot('NO_SHOW')}>
                    Nem jött el
                  </button>
                )}
                {kovetkezo && (
                  <button className="btn btn-fo" onClick={() => void allapot(kovetkezo.to)}>
                    {kovetkezo.label}
                  </button>
                )}
                {!kovetkezo && (
                  <button className="btn" onClick={onBezar}>
                    Bezárás
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
