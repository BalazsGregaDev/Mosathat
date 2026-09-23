import { useEffect, useMemo, useState } from 'react'

import { useApp, useCatalog } from '../../state/AppContext'
import { useBookingForm } from '../../state/useBookingForm'
import { ft, idotartam, napRovidCim } from '../../lib/format'
import {
  CATEGORY_LABEL, SCOPE_LABEL, type BookingScope, type BookingType,
  type Extra, type LatestStart, type VehicleCategory,
} from '../../lib/types'

const MERETEK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
const TERJEDELEM: BookingScope[] = ['TELJES', 'KULSO', 'BELSO']

// ---------------------------------------------------------------------------
//  Új időpont.
//
//  A mezők sorrendje nem esztétikai döntés: ez a telefonbeszélgetés sorrendje.
//  "Milyen autóval? Mi a rendszám? Kinek a nevére? Mit kér?" — a felület
//  ugyanígy halad, hogy a felvevő ne ugráljon a képernyőn a hívás közben.
// ---------------------------------------------------------------------------

export default function NewBookingModal({
  nap,
  onBezar,
  onKesz,
}: {
  nap: string
  onBezar: () => void
  onKesz: () => void
}) {
  const { data } = useApp()
  const katalogus = useCatalog()
  const { f, set, talalat, keres, calc, menthetE, ment, mentes, hiba, elozmenyAtvesz } =
    useBookingForm(true, nap)

  const [sav, setSav] = useState<LatestStart[]>([])

  useEffect(() => {
    const kezel = (e: KeyboardEvent) => e.key === 'Escape' && onBezar()
    window.addEventListener('keydown', kezel)
    return () => window.removeEventListener('keydown', kezel)
  }, [onBezar])

  // A csomagkód → id leképezés az "Ezt kéri →" gombhoz kell.
  const kodSzerint = useMemo(
    () => Object.fromEntries(katalogus.packages.map((p) => [p.code, p.id])),
    [katalogus.packages],
  )

  // A csomagok ára a KIVÁLASZTOTT mérethez és terjedelemhez. Ez az, amiért
  // a méretválasztó legfelül van: nélküle nincs mit kiírni a csomagok mellé.
  function csomagAr(packageId: string) {
    return katalogus.packagePricing.find(
      (p) => p.package_id === packageId && p.category === f.category && p.scope === f.scope,
    )
  }

  function fullServiceAr(packageId: string) {
    return katalogus.fullServicePricing.find(
      (p) => p.package_id === packageId && p.category === f.category,
    )
  }

  // Szabad-e még elkezdeni? A latest_start() a munkaidő-sávok végéből
  // visszaszámolva adja meg a legkésőbbi kezdést — az ebédszünettel együtt.
  useEffect(() => {
    if (f.bookingType !== 'VAROS' || !calc?.work_minutes) {
      setSav([])
      return
    }
    let el = true
    data
      .getLatestStart(f.date, calc.work_minutes)
      .then((r) => el && setSav(r))
      .catch(() => el && setSav([]))
    return () => {
      el = false
    }
  }, [data, f.date, f.bookingType, calc?.work_minutes])

  const belefer = useMemo(() => {
    if (sav.length === 0 || !f.startTime) return null
    const w = sav.find((s) => f.startTime >= s.starts.slice(0, 5) && f.startTime < s.ends.slice(0, 5))
    if (!w) return { ok: false, uzenet: 'Ez az időpont munkaidőn kívülre esik.' }
    if (!w.fits) return { ok: false, uzenet: 'Ebben a sávban ennyi idő már nem fér el.' }
    const ok = f.startTime <= w.latest_start.slice(0, 5)
    return {
      ok,
      uzenet: ok
        ? `Belefér — ebben a sávban legkésőbb ${w.latest_start.slice(0, 5)}-kor kezdhető.`
        : `Ennyi munka legkésőbb ${w.latest_start.slice(0, 5)}-kor kezdhető ebben a sávban.`,
    }
  }, [sav, f.startTime])

  function extraAllit(e: Extra, be: boolean) {
    const uj = { ...f.extras }
    if (be) uj[e.id] = e.price_unit === 'ULES' ? 5 : e.price_unit === 'AJTO' ? 4 : 1
    else delete uj[e.id]
    set('extras', uj)
  }

  function darabAllit(id: string, n: number) {
    set('extras', { ...f.extras, [id]: Math.max(1, n) })
  }

  async function mentesGomb() {
    const id = await ment()
    if (id) onKesz()
  }

  return (
    <div className="fedo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onBezar()}>
      <div className="lap lap-szeles" role="dialog" aria-modal="true" aria-label="Új időpont">
        <div className="lap-fej">
          <h2>Új időpont</h2>
          <span className="halk" style={{ fontSize: 'var(--m-sm)' }}>
            {napRovidCim(f.date)}
          </span>
          <button className="bezar" onClick={onBezar} aria-label="Bezárás">
            ×
          </button>
        </div>

        <div className="lap-torzs">
          {/* ---------- 1. MÉRET ---------- */}
          <div className="szakasz">
            <div className="fej">Milyen autóval jön?</div>
            <div className="valaszto">
              {MERETEK.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={f.category === m}
                  onClick={() => set('category', m)}
                >
                  {CATEGORY_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          {/* ---------- 2–4. RENDSZÁM, NÉV, TELEFON ---------- */}
          <div className="szakasz">
            <div className="fej">
              Ügyfél
              {keres && <span className="jobbra halvany">keresés…</span>}
            </div>

            <div className="mezo">
              <label htmlFor="rendszam">Rendszám</label>
              <input
                id="rendszam"
                className="beviteli beviteli-rendszam"
                value={f.plate}
                onChange={(e) => set('plate', e.target.value)}
                placeholder="ABC-123"
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {talalat && (
              <div className="talalat">
                <div className="cim">Ismerjük ezt az autót</div>
                <div style={{ fontSize: 'var(--m-sm)' }}>
                  {[talalat.vehicle.brand, talalat.vehicle.model].filter(Boolean).join(' ')}
                  {' · '}
                  {CATEGORY_LABEL[talalat.vehicle.category]}
                  {talalat.vehicle.seats ? ` · ${talalat.vehicle.seats} ülés` : ''}
                </div>

                {talalat.history.length > 0 && (
                  <>
                    <div className="cim" style={{ marginTop: 4 }}>
                      Korábban ezeket kérte
                    </div>
                    {talalat.history.slice(0, 4).map((h, i) => (
                      <button
                        key={i}
                        type="button"
                        className="elozmeny"
                        onClick={() => elozmenyAtvesz(h, kodSzerint)}
                      >
                        <span className="datum">{h.service_date}</span>
                        <span className="mit">
                          {h.package_name ?? '—'}
                          {h.full_service && ' + FS'}
                          {h.scope !== 'TELJES' && ` (${SCOPE_LABEL[h.scope]})`}
                        </span>
                        <span className="arat">{ft(h.price_huf)}</span>
                        <span className="kerem">Ezt kéri →</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}

            <div className="sor-2">
              <div className="mezo">
                <label htmlFor="nev">Név</label>
                <input
                  id="nev"
                  className="beviteli"
                  value={f.name}
                  onChange={(e) => set('name', e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="mezo">
                <label htmlFor="tel">Telefonszám</label>
                <input
                  id="tel"
                  className="beviteli"
                  type="tel"
                  value={f.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="+36 30 123 4567"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="sor-3">
              <div className="mezo">
                <label htmlFor="marka">Márka</label>
                <input
                  id="marka"
                  className="beviteli"
                  value={f.brand}
                  onChange={(e) => set('brand', e.target.value)}
                />
              </div>
              <div className="mezo">
                <label htmlFor="tipus">Típus</label>
                <input
                  id="tipus"
                  className="beviteli"
                  value={f.model}
                  onChange={(e) => set('model', e.target.value)}
                />
              </div>
              <div className="mezo">
                <label htmlFor="ules">Ülések</label>
                <input
                  id="ules"
                  className="beviteli"
                  type="number"
                  min={2}
                  max={9}
                  value={f.seats}
                  onChange={(e) => set('seats', e.target.value)}
                  placeholder="5"
                />
              </div>
            </div>
          </div>

          {/* ---------- 5. CSOMAG ---------- */}
          <div className="szakasz">
            <div className="fej">Csomag</div>
            <div className="csomagok">
              {katalogus.packages.map((p) => {
                const ar = csomagAr(p.id)
                const kivalasztott = f.packageId === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="csomag"
                    aria-label={p.name}
                    aria-pressed={kivalasztott}
                    onClick={() => set('packageId', kivalasztott ? null : p.id)}
                  >
                    <span className="jel" />
                    <span style={{ minWidth: 0 }}>
                      <span className="nev">{p.name}</span>
                      <span className="leiras">{p.description}</span>
                    </span>
                    <span className="arblokk">
                      <div className="ar">
                        {ar?.requires_quote || ar?.price_huf == null ? 'Érdeklődjön' : ft(ar.price_huf)}
                      </div>
                      <div className="ido">{idotartam(ar?.duration_minutes ?? null)}</div>
                    </span>
                  </button>
                )
              })}
            </div>

            {f.packageId && (
              <label className="jelolo" data-aktiv={f.fullService}>
                <input
                  type="checkbox"
                  checked={f.fullService}
                  onChange={(e) => set('fullService', e.target.checked)}
                />
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>Full Service</div>
                  <div className="halk" style={{ fontSize: 'var(--m-xs)' }}>
                    Mélytisztítás. Saját ára van, nem a csomag + extra összege.
                  </div>
                </span>
                <span className="szam" style={{ fontWeight: 600 }}>
                  {(() => {
                    const fs = fullServiceAr(f.packageId!)
                    return fs?.requires_quote || fs?.price_huf == null ? 'Érdeklődjön' : ft(fs.price_huf)
                  })()}
                </span>
              </label>
            )}
          </div>

          {/* ---------- 6. TERJEDELEM ---------- */}
          <div className="szakasz">
            <div className="fej">Terjedelem</div>
            <div className="valaszto">
              {TERJEDELEM.map((s) => (
                <button key={s} type="button" aria-pressed={f.scope === s} onClick={() => set('scope', s)}>
                  {SCOPE_LABEL[s]}
                </button>
              ))}
            </div>
            {f.scope !== 'TELJES' && calc && !calc.duration_known && (
              <div className="figyelmeztet">
                <span>
                  <strong>Nincs rá időadat.</strong> A csak kívül / csak belül munkák
                  időtartama még nincs feltöltve, ezért ez a foglalás nem terheli a napi
                  kapacitást. Amint megvan a 18 érték, magától helyes lesz.
                </span>
              </div>
            )}
          </div>

          {/* ---------- 7. EGYÉB SZOLGÁLTATÁSOK ---------- */}
          <div className="szakasz">
            <div className="fej">Egyéb szolgáltatások</div>
            <div className="extrak">
              {katalogus.extras.map((e) => {
                const aktiv = f.extras[e.id] !== undefined
                const darabos = e.price_unit === 'ULES' || e.price_unit === 'AJTO' || e.price_unit === 'LITER'
                return (
                  <div key={e.id}>
                    <label className="extra" data-aktiv={aktiv}>
                      <input
                        type="checkbox"
                        checked={aktiv}
                        onChange={(ev) => extraAllit(e, ev.target.checked)}
                      />
                      <span className="nev">{e.name}</span>
                      <span className={`ar ${e.price_huf == null ? 'kerdes' : ''}`}>
                        {e.requires_quote
                          ? 'árajánlat'
                          : e.price_huf == null
                            ? 'ár hiányzik'
                            : `${ft(e.price_huf)}${
                                e.price_unit === 'ULES'
                                  ? ' / ülés'
                                  : e.price_unit === 'AJTO'
                                    ? ' / ajtó'
                                    : e.price_unit === 'LITER'
                                      ? ' / liter'
                                      : ''
                              }`}
                      </span>
                    </label>

                    {aktiv && darabos && (
                      <div className="mennyiseg">
                        {e.price_unit === 'ULES' && (
                          <>
                            <button
                              type="button"
                              className={`btn btn-kicsi ${f.extras[e.id] === 5 ? 'btn-fo' : ''}`}
                              onClick={() => darabAllit(e.id, 5)}
                            >
                              Teljes (5 ülés)
                            </button>
                            <span className="magyarazat">vagy</span>
                          </>
                        )}
                        <input
                          className="darab"
                          type="number"
                          min={1}
                          max={9}
                          value={f.extras[e.id]}
                          onChange={(ev) => darabAllit(e.id, Number(ev.target.value))}
                        />
                        <span className="magyarazat">
                          {e.price_unit === 'ULES' ? 'ülés' : e.price_unit === 'AJTO' ? 'ajtó' : 'liter'}
                          {e.price_unit === 'ULES' && e.duration_unit === 'ALKALOM' && (
                            <> — az ár ülésenként nő, az idő az egész autóra szól</>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ---------- FELÁR ---------- */}
          <div className="szakasz">
            <div className="fej">Felár</div>
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
                  value={f.surchargePct}
                  onChange={(e) => set('surchargePct', Number(e.target.value))}
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
                  value={f.surchargeFix}
                  onChange={(e) => set('surchargeFix', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* ---------- 8. MEGVÁRJA / ITT HAGYJA ---------- */}
          <div className="szakasz">
            <div className="fej">Mikor és hogyan</div>

            <div className="valaszto">
              {(['VAROS', 'LEADOS', 'TOBBNAPOS'] as BookingType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={f.bookingType === t}
                  onClick={() => set('bookingType', t)}
                >
                  {t === 'VAROS' ? 'Megvárja' : t === 'LEADOS' ? 'Itt hagyja' : 'Több napos'}
                </button>
              ))}
            </div>

            <div className="sor-3">
              <div className="mezo">
                <label htmlFor="datum">Nap</label>
                <input
                  id="datum"
                  className="beviteli"
                  type="date"
                  value={f.date}
                  onChange={(e) => set('date', e.target.value)}
                />
              </div>

              {f.bookingType === 'VAROS' ? (
                <div className="mezo">
                  <label htmlFor="kezdes">Kezdés</label>
                  <input
                    id="kezdes"
                    className="beviteli szam"
                    type="time"
                    step={300}
                    value={f.startTime}
                    onChange={(e) => set('startTime', e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="mezo">
                    <label htmlFor="leadas">Leadás</label>
                    <input
                      id="leadas"
                      className="beviteli szam"
                      type="time"
                      step={300}
                      value={f.dropOffTime}
                      onChange={(e) => set('dropOffTime', e.target.value)}
                    />
                  </div>
                  <div className="mezo">
                    <label htmlFor="atvetel">
                      {f.bookingType === 'TOBBNAPOS' ? 'Határidő' : 'Átvétel'}
                    </label>
                    {f.bookingType === 'TOBBNAPOS' ? (
                      <input
                        id="atvetel"
                        className="beviteli"
                        type="date"
                        value={f.deadlineDate}
                        onChange={(e) => set('deadlineDate', e.target.value)}
                      />
                    ) : (
                      <input
                        id="atvetel"
                        className="beviteli szam"
                        type="time"
                        step={300}
                        value={f.pickUpTime}
                        onChange={(e) => set('pickUpTime', e.target.value)}
                      />
                    )}
                  </div>
                </>
              )}
            </div>

            {belefer && (
              <div
                className={belefer.ok ? '' : 'figyelmeztet'}
                style={
                  belefer.ok
                    ? { fontSize: 'var(--m-sm)', color: 'var(--zold)', fontWeight: 500 }
                    : undefined
                }
              >
                {belefer.uzenet}
              </div>
            )}

            <div className="mezo">
              <label htmlFor="megj">Megjegyzés</label>
              <textarea
                id="megj"
                className="beviteli"
                value={f.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Amit tudni kell róla — pl. kutyaszőr, gyerekülés bent marad"
              />
            </div>
          </div>

          {calc?.requires_quote && (
            <div className="figyelmeztet">
              <span>
                <strong>Van benne árajánlatos tétel.</strong> A lent látszó összeg csak
                részösszeg — a végleges árat a munka után kell rögzíteni.
              </span>
            </div>
          )}

          {hiba && <div className="hibauzenet">{hiba}</div>}
        </div>

        {/* ---------- ÖSSZEGZŐ LÁB ---------- */}
        <div className="lap-lab">
          <div className="osszeg">
            <span className="ertek">{calc ? ft(calc.price_huf) : '—'}</span>
            <span className="alatta">
              {calc
                ? [
                    calc.work_minutes ? idotartam(calc.work_minutes) + ' munka' : 'idő ismeretlen',
                    calc.rest_minutes ? idotartam(calc.rest_minutes) + ' száradás' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'válassz csomagot vagy szolgáltatást'}
            </span>
          </div>

          <div className="gombok">
            <button className="btn" onClick={onBezar} disabled={mentes}>
              Mégse
            </button>
            <button className="btn btn-fo" onClick={mentesGomb} disabled={!menthetE || mentes}>
              {mentes ? 'Mentés…' : 'Foglalás rögzítése'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
