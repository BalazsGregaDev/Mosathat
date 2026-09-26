import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, idosav, idotartam, ora } from '../../lib/format'
import {
  CATEGORY_LABEL, NEXT_STATUS, SCOPE_LABEL, STATUS_LABEL, TYPE_LABEL,
  type BookingTask, type DayBooking, type ServiceArea,
} from '../../lib/types'

// ---------------------------------------------------------------------------
//  A munkalap.
//
//  Ez az a képernyő, ami a mosóállásban nyitva van, gyakran vizes kézzel.
//  Ezért három szabály vezette a felépítését:
//
//  1. Ami a csomag része, azt nem kell egyenként pipálni. Egy Elitnél 14
//     lépés van — ezeket egyesével kipipálni időpazarlás. Ami KÜLÖN volt
//     kérve, az az érdekes: azt külön kell nyugtázni.
//
//  2. A pipálás nem tölti újra az oldalt. Azonnal átbillen, a mentés a
//     háttérben megy. Ha hiba van, visszabillen és szól.
//
//  3. Amíg az ügyfél nem érkezett meg, a lista nincs nyitva. Lezárás után
//     pedig végleg zárva van — ezt nem itt, hanem az adatbázisban is
//     biztosítja egy trigger.
// ---------------------------------------------------------------------------

interface Csoport {
  kulcs: 'KULSO' | 'BELSO' | 'EGYEB'
  cim: string
  area: ServiceArea | null
  csomag: BookingTask[]
  extra: BookingTask[]
}

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
  const [hiba, setHiba] = useState<string | null>(null)

  // ár
  const [vegleges, setVegleges] = useState('')
  const [pct, setPct] = useState(0)
  const [fix, setFix] = useState(0)

  // megjegyzés
  const [megjegyzes, setMegjegyzes] = useState('')
  const [megjMentve, setMegjMentve] = useState(true)

  // Ha bármi változott, a napi nézetet frissíteni kell — de csak bezáráskor,
  // nem minden pipa után.
  const valtozott = useRef(false)

  const betolt = useCallback(async () => {
    try {
      const [f, t] = await Promise.all([data.getBooking(bookingId), data.getTasks(bookingId)])
      setB(f)
      setLista(t)
      setVegleges(f?.final_price_huf ? String(f.final_price_huf) : '')
      setMegjegyzes(f?.notes ?? '')
      setMegjMentve(true)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setTolt(false)
    }
  }, [data, bookingId])

  useEffect(() => {
    void betolt()
  }, [betolt])

  const bezar = useCallback(() => {
    if (valtozott.current) refresh()
    onBezar()
  }, [onBezar, refresh])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && bezar()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [bezar])

  // --- állapotból adódó zárolás ----------------------------------------------

  const lezart = b?.status === 'COMPLETED'
  const megerkezett = b ? ['ARRIVED', 'IN_PROGRESS', 'READY'].includes(b.status) : false
  const listaNyitva = megerkezett && !lezart

  // --- a lista csoportosítva --------------------------------------------------

  const csoportok = useMemo<Csoport[]>(() => {
    const ki = (a: ServiceArea | null) => lista.filter((t) => t.area === a)
    const mk = (kulcs: Csoport['kulcs'], cim: string, area: ServiceArea | null): Csoport => {
      const sorok = ki(area).sort((x, y) => x.sort_order - y.sort_order)
      return {
        kulcs, cim, area,
        csomag: sorok.filter((t) => t.source === 'PACKAGE'),
        extra: sorok.filter((t) => t.source === 'EXTRA'),
      }
    }
    return [
      mk('KULSO', 'Kívül', 'KULSO'),
      mk('BELSO', 'Belül', 'BELSO'),
      mk('EGYEB', 'Csomagon kívül', null),
    ].filter((cs) => cs.csomag.length + cs.extra.length > 0)
  }, [lista])

  // --- pipálás ----------------------------------------------------------------

  async function pipal(t: BookingTask) {
    if (!listaNyitva) return
    const uj = !t.done
    // Azonnal átbillentjük. Nincs újratöltés: a mosóállásban a késleltetés
    // azt jelentené, hogy kétszer nyomják meg.
    setLista((l) => l.map((x) => (x.id === t.id ? { ...x, done: uj, done_at: uj ? new Date().toISOString() : null } : x)))
    valtozott.current = true
    try {
      await data.toggleTask(t.id, uj)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      setLista((l) => l.map((x) => (x.id === t.id ? { ...x, done: !uj } : x))) // vissza
    }
  }

  async function csoportPipal(cs: Csoport, done: boolean) {
    if (!listaNyitva || cs.area === null) return
    const erintett = new Set(cs.csomag.map((t) => t.id))
    const most = new Date().toISOString()
    setLista((l) =>
      l.map((x) => (erintett.has(x.id) ? { ...x, done, done_at: done ? most : null } : x)),
    )
    valtozott.current = true
    try {
      await data.toggleTaskGroup(bookingId, cs.area, done)
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      await betolt()
    }
  }

  // --- állapotváltás -----------------------------------------------------------

  async function allapot(cel: Parameters<typeof data.setStatus>[1]) {
    // A lezárás visszafordíthatatlan: a munkalap véglegessé válik.
    if (cel === 'COMPLETED') {
      const ok = window.confirm(
        'Biztos lezárom? Minden adat helyes?\n\n' +
          'Lezárás után a munkalista és az ár nem módosítható.',
      )
      if (!ok) return
    }
    try {
      await data.setStatus(bookingId, cel)
      valtozott.current = true
      await betolt()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  // --- ár ----------------------------------------------------------------------

  // Amit a rendszer javasol: a becsült ár, a most megadott felárakkal.
  const javasolt = useMemo(() => {
    if (!b) return 0
    const alap = b.estimated_price_huf
    return Math.round(alap * (1 + pct / 100)) + fix
  }, [b, pct, fix])

  async function arMent() {
    if (!b || lezart) return
    // ÜRES mező nem nulla forintot jelent, hanem azt, hogy marad a javasolt ár.
    const beirt = vegleges.trim()
    const ar = beirt === '' ? javasolt : Number(beirt)
    if (!Number.isFinite(ar) || ar < 0) return

    const indok = [
      pct ? `erősen szennyezett +${pct}%` : null,
      fix ? `fix felár ${ft(fix)}` : null,
    ].filter(Boolean).join(', ')

    try {
      await data.setFinalPrice(bookingId, ar, indok || undefined)
      valtozott.current = true
      await betolt()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  // --- megjegyzés ---------------------------------------------------------------

  async function megjMent() {
    if (lezart) return
    try {
      await data.setNotes(bookingId, megjegyzes)
      setMegjMentve(true)
      valtozott.current = true
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }

  const kovetkezo = b ? NEXT_STATUS[b.status] : undefined
  const keszLista = lista.filter((t) => t.done).length

  return (
    <div className="fedo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && bezar()}>
      <div className="lap" role="dialog" aria-modal="true" aria-label="Munkalap">
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
                  {b.customer_name}
                  {[b.brand, b.model].filter(Boolean).length > 0 &&
                    ` · ${[b.brand, b.model].filter(Boolean).join(' ')}`}
                </div>
              </div>
              <span className="cimke-pill allapot-pill" data-a={b.status} style={{ marginLeft: 12 }}>
                {STATUS_LABEL[b.status]}
              </span>
              <button className="bezar" onClick={bezar} aria-label="Bezárás">
                ×
              </button>
            </div>

            <div className="lap-torzs">
              {hiba && <div className="hibauzenet">{hiba}</div>}

              {lezart && (
                <div className="figyelmeztet">
                  <span>
                    <strong>Lezárva.</strong> Ez a munkalap végleges — a lista és az ár
                    nem módosítható. Ha javítani kell, előbb vissza kell nyitni.
                  </span>
                </div>
              )}

              {/* ---------- alapadatok ---------- */}
              <div className="szakasz">
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
                    {' · '}
                    {CATEGORY_LABEL[b.category]}
                  </span>
                </div>
                <div className="adatsor">
                  <span>{TYPE_LABEL[b.booking_type]}</span>
                  <span className="ertek">
                    {b.booking_type === 'VAROS'
                      ? idosav(b.start_at, b.planned_duration_minutes)
                      : `${ora(b.drop_off_at)}${b.pick_up_at ? ` – ${ora(b.pick_up_at)}` : ''}`}
                    {b.planned_duration_minutes > 0 && (
                      <span className="halk"> · {idotartam(b.planned_duration_minutes)}</span>
                    )}
                  </span>
                </div>
              </div>

              {/* ---------- 1. MEGJEGYZÉS ---------- */}
              {/* Menet közben derül ki a legtöbb fontos dolog, ezért van elöl. */}
              <div className="szakasz">
                <div className="fej">
                  Megjegyzés
                  {!megjMentve && <span className="jobbra halvany">nincs mentve</span>}
                </div>
                <textarea
                  className="beviteli"
                  value={megjegyzes}
                  disabled={lezart}
                  onChange={(e) => {
                    setMegjegyzes(e.target.value)
                    setMegjMentve(false)
                  }}
                  onBlur={() => !megjMentve && void megjMent()}
                  placeholder="Amit tudni kell róla — kulcs helye, korábbi sérülés, különleges kérés"
                />
              </div>

              {/* ---------- 2. MUNKALISTA ---------- */}
              <div className="szakasz">
                <div className="fej">
                  Munkalista
                  <span className="jobbra szam halk">
                    {keszLista}/{lista.length}
                  </span>
                </div>

                {!megerkezett && !lezart && (
                  <div className="figyelmeztet">
                    <span>
                      Az ügyfél még nem érkezett meg, ezért a lista zárolva van.
                      Nyomd meg lent a <strong>Megérkezett</strong> gombot.
                    </span>
                  </div>
                )}

                {csoportok.map((cs) => {
                  const mind = cs.csomag.length
                  const kesz = cs.csomag.filter((t) => t.done).length
                  const teljes = mind > 0 && kesz === mind
                  return (
                    <div className="munkacsoport" key={cs.kulcs}>
                      <div className="munkacsoport-fej">
                        <span className="cim">{cs.cim}</span>
                        {mind > 0 && (
                          <span className="szam halk">
                            {kesz}/{mind}
                          </span>
                        )}
                        {mind > 0 && cs.area && (
                          <button
                            type="button"
                            className={`btn btn-kicsi ${teljes ? '' : 'btn-fo'}`}
                            disabled={!listaNyitva}
                            onClick={() => void csoportPipal(cs, !teljes)}
                          >
                            {teljes ? 'Visszavon' : `${cs.cim} kész`}
                          </button>
                        )}
                      </div>

                      {/* a csomag lépései — tájékoztatásul, egyenként is pipálhatók */}
                      <div className="munkalista">
                        {cs.csomag.map((t) => (
                          <label className="munka" key={t.id} data-kesz={t.done}>
                            <input
                              type="checkbox"
                              checked={t.done}
                              disabled={!listaNyitva}
                              onChange={() => void pipal(t)}
                            />
                            <span className="nev">{t.name}</span>
                            {t.done_at && <span className="terulet szam">{ora(t.done_at)}</span>}
                          </label>
                        ))}
                      </div>

                      {/* a külön kért szolgáltatások — ezeket sosem pipálja a csoportgomb */}
                      {cs.extra.length > 0 && (
                        <>
                          <div className="munkacsoport-alcim">Külön kért</div>
                          <div className="munkalista">
                            {cs.extra.map((t) => (
                              <label className="munka munka-extra" key={t.id} data-kesz={t.done}>
                                <input
                                  type="checkbox"
                                  checked={t.done}
                                  disabled={!listaNyitva}
                                  onChange={() => void pipal(t)}
                                />
                                <span className="nev">{t.name}</span>
                                {t.done_at && <span className="terulet szam">{ora(t.done_at)}</span>}
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}

                {lista.length === 0 && <div className="ures">Ehhez a foglaláshoz nincs munkalista.</div>}
              </div>

              {/* ---------- 3. ÁR ---------- */}
              {/* A felár ide került, nem a foglaláshoz: telefonos foglaláskor
                  még nem látjuk az autót. Itt már készen áll. */}
              <div className="szakasz">
                <div className="fej">Ár</div>

                <div className="adatsor">
                  <span>Becsült (foglaláskor)</span>
                  <span className="ertek">{ft(b.estimated_price_huf)}</span>
                </div>

                <div className="sor-2">
                  <div className="mezo">
                    <label htmlFor="pct">Erősen szennyezett (%)</label>
                    <input
                      id="pct"
                      className="beviteli szam"
                      type="number"
                      min={0}
                      max={50}
                      step={5}
                      disabled={lezart}
                      value={pct}
                      onChange={(e) => setPct(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="mezo">
                    <label htmlFor="fix">Fix felár (Ft)</label>
                    <input
                      id="fix"
                      className="beviteli szam"
                      type="number"
                      min={0}
                      step={500}
                      disabled={lezart}
                      value={fix}
                      onChange={(e) => setFix(Number(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="sor-2" style={{ alignItems: 'end' }}>
                  <div className="mezo">
                    <label htmlFor="veg">Végleges ár</label>
                    <input
                      id="veg"
                      className="beviteli szam"
                      type="number"
                      step={500}
                      disabled={lezart}
                      value={vegleges}
                      onChange={(e) => setVegleges(e.target.value)}
                      placeholder={String(javasolt)}
                    />
                  </div>
                  <button
                    className="btn"
                    disabled={lezart}
                    onClick={() => void arMent()}
                    style={{ height: 43 }}
                  >
                    Ár rögzítése
                  </button>
                </div>

                <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>
                  Üresen hagyva a javasolt ár kerül be: <strong>{ft(javasolt)}</strong>.
                  Nullát csak akkor rögzít, ha tényleg nullát írsz be.
                </p>
              </div>
            </div>

            <div className="lap-lab">
              <div className="osszeg">
                <span className="ertek">{ft(b.final_price_huf ?? b.estimated_price_huf)}</span>
                <span className="alatta">{b.final_price_huf ? 'végleges' : 'becsült'}</span>
              </div>
              <div className="gombok">
                {b.status === 'CONFIRMED' && (
                  <button className="btn" onClick={() => void allapot('NO_SHOW')}>
                    Nem jött el
                  </button>
                )}
                {lezart && (
                  <button className="btn" onClick={() => void allapot('READY')}>
                    Visszanyit
                  </button>
                )}
                {kovetkezo && (
                  <button className="btn btn-fo" onClick={() => void allapot(kovetkezo.to)}>
                    {kovetkezo.label}
                  </button>
                )}
                <button className="btn" onClick={bezar}>
                  Bezárás
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
