import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, napRovidCim } from '../../lib/format'
import { aktualisAuto, csoportNev, csoportOsszeg, elo, HELYORZO, vanRendszam } from '../../lib/flotta'
import FlottaLepteto from '../day/FlottaLepteto'
import {
  CATEGORY_LABEL, TYPE_LABEL,
  type BookingType, type DayBooking, type VehicleCategory,
} from '../../lib/types'
import Szerkesztheto from '../common/Szerkesztheto'
import IdoMezo from '../common/IdoMezo'
import { useKerdes } from '../common/Kerdes'
import IgazoloGomb, { igazoloKell } from '../igazolo/IgazoloGomb'

// ---------------------------------------------------------------------------
//  Flottás csoport munkalapja — egy cég, egy nap, több autó
//
//  Ami KÖZÖS (egyszer kell megadni, mind a csoport minden autójára érvényes):
//    cég, ügyfél (név, telefonszám), nap, típus (itt hagyja / hozom-viszem),
//    csomag, és egy VÉGSŐ IDŐPONT: amikorra az utolsó autónak is el kell
//    készülnie (hozom-viszemnél: amikorra vissza kell érni vele).
//
//  Ami AUTÓNKÉNT más — egy sor autónként:
//    rendszám (ha megtudjuk; ha már járt itt az autó, a régi adataihoz
//    kötjük), méret (az ár ehhez igazodik), állapot (Megérkezett / Kész van /
//    Átvette), igazolólap, és a részletek (munkalista, megjegyzés).
//
//  Állapot autónként NINCS (Megérkezett / Kész van / Átvette): a flottás autók
//  gyors munkák, jönnek-mennek. Helyette fent a léptető: hányadik autónál
//  tartunk; a „Kész, jöhet a következő" a soron lévő autót zárja le (és
//  szerződéses cégnél megnyitja az igazolólap sorát).
// ---------------------------------------------------------------------------

const MERETEK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
const TIPUSOK: BookingType[] = ['LEADOS', 'HOZOMVISZEM']

export default function FlottaMunkalap({
  groupId,
  onBezar,
  reszletek,
}: {
  groupId: string
  onBezar: () => void
  /** Egy autó saját munkalapja (munkalista, megjegyzés) — a hívó rajzolja. */
  reszletek: (bookingId: string, bezar: () => void) => React.ReactNode
}) {
  const { data, catalog, refresh } = useApp()
  const [kerdesAblak, kerdez] = useKerdes()
  const [tagok, setTagok] = useState<DayBooking[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [megy, setMegy] = useState(false)
  // Egy autó részletei (a saját munkalapja) nyitva.
  const [reszletId, setReszletId] = useState<string | null>(null)

  const betolt = useCallback(async () => {
    try {
      setTagok(await data.getFleetGroup(groupId))
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    }
  }, [data, groupId])

  useEffect(() => { void betolt() }, [betolt])
  useEffect(() => data.subscribe(() => void betolt()), [data, betolt])

  // Bezáráskor a nap nézete is frissüljön.
  const bezar = useCallback(() => { refresh(); onBezar() }, [refresh, onBezar])

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !reszletId) bezar() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [bezar, reszletId])

  /** Egy művelet: hibát mutat, és utána újratölt. */
  async function muvelet(fn: () => Promise<unknown>) {
    if (megy) return
    setMegy(true)
    setHiba(null)
    try {
      await fn()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMegy(false)
      await betolt()
    }
  }

  if (!tagok) {
    return (
      <div className="fedo" role="presentation">
        <div className="lap lap-szeles" role="dialog" aria-modal="true" aria-label="Flottás csoport">
          <div className="lap-torzs">
            <div className="betolt">{hiba ? <span className="hibauzenet">{hiba}</span> : 'Betöltés…'}</div>
          </div>
        </div>
      </div>
    )
  }

  const elso = tagok.find(elo) ?? tagok[0]
  const o = csoportOsszeg(tagok)
  const szerkesztheto = tagok.some((t) => elo(t) && t.status !== 'COMPLETED')
  const vegso = elso?.pick_up_at ?? elso?.deadline_at
  const vegsoOra = vegso
    ? new Intl.DateTimeFormat('hu-HU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Budapest' }).format(new Date(vegso))
    : ''
  const hozomViszem = elso?.booking_type === 'HOZOMVISZEM'
  const kozos = (patch: Record<string, unknown>) => muvelet(() => data.fleetPatch(groupId, patch))

  async function torol(t: DayBooking) {
    if (!(await kerdez({
      cim: `Törlöd ezt az autót a csoportból? ${autoNev(t)}`,
      szoveg: 'Az autó lemondottként marad meg (visszavonható), a darabszám eggyel csökken.',
      igen: 'Törlés', nem: 'Mégse', veszelyes: true,
    }))) return
    await muvelet(() => data.setStatus(t.id, 'CANCELLED_BY_CUSTOMER'))
  }

  return (
    <div className="fedo" role="presentation"
         onMouseDown={(e) => e.target === e.currentTarget && !reszletId && bezar()}>
      <div className="lap lap-szeles flotta-munkalap" role="dialog" aria-modal="true"
           aria-label="Flottás csoport">
        <div className="lap-fej">
          <div>
            <h2>
              {csoportNev(elso)} <span className="cimke-pill flotta-db">{o.darab} darab</span>
            </h2>
            <div className="halk" style={{ fontSize: 'var(--m-sm)' }}>
              {napRovidCim(elso.service_date.slice(0, 10))} · {elso.package_name}
              {' · '}{o.kesz}/{o.darab} kész
            </div>
          </div>
          <button className="bezar" onClick={bezar} aria-label="Bezárás">×</button>
        </div>

        <div className="lap-torzs">
          {hiba && <div className="hibauzenet">{hiba}</div>}

          {/* --- közös: egyszer kell megadni ------------------------------------- */}
          <div className="szakasz">
            <div className="fej">Közös — minden autóra</div>

            <Szerkesztheto cimke="Név" ertek={elso.customer_name} zarolt={!szerkesztheto}
                           onMent={(v) => muvelet(() => data.patchBooking(elso.id, { customer_name: v }))} />
            <Szerkesztheto cimke="Telefon" ertek={elso.customer_phone} tipus="telefon"
                           zarolt={!szerkesztheto}
                           onMent={(v) => muvelet(() => data.patchBooking(elso.id, { customer_phone: v }))}
                           utotag={elso.customer_phone && (
                             <a href={`tel:${elso.customer_phone}`} className="hivas">Hívás</a>
                           )} />

            <div className="adatsor">
              <span>Nap</span>
              <span className="ertek">
                <input type="date" className="beviteli" aria-label="A csoport napja"
                       value={elso.service_date.slice(0, 10)} disabled={!szerkesztheto || megy}
                       onChange={(e) => e.target.value && void kozos({ service_date: e.target.value })} />
              </span>
            </div>

            <div className="adatsor">
              <span>{hozomViszem ? 'Visszaérni' : 'Kész legyen'}</span>
              <span className="ertek">
                <IdoMezo ariaLabel="Végső időpont" cim={hozomViszem ? 'Visszaérni' : 'Kész legyen'}
                         value={vegsoOra}
                         onChange={() => { /* a mentés a választás végén */ }}
                         onKesz={(v) => { if (v && v !== vegsoOra) void kozos({ pick_up_time: v }) }} />
                <span className="halk"> — amikorra az utolsó autónak is {hozomViszem ? 'vissza kell érnie' : 'el kell készülnie'}</span>
              </span>
            </div>

            <div className="adatsor">
              <span>Típus</span>
              <span className="ertek valaszto">
                {TIPUSOK.map((tp) => (
                  <button key={tp} type="button" aria-pressed={elso.booking_type === tp}
                          disabled={!szerkesztheto || megy}
                          onClick={() => elso.booking_type !== tp && void kozos({ booking_type: tp })}>
                    {TYPE_LABEL[tp]}
                  </button>
                ))}
              </span>
            </div>

            <div className="adatsor">
              <span>Csomag</span>
              <span className="ertek">
                <select className="beviteli" aria-label="A csoport csomagja"
                        value={elso.package_id ?? ''} disabled={!szerkesztheto || megy}
                        onChange={(e) => void kozos({ package_id: e.target.value })}>
                  {(catalog?.packages ?? []).filter((p) => p.active).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </span>
            </div>
          </div>

          {/* --- autónként ----------------------------------------------------- */}
          <div className="szakasz">
            <div className="fej">
              Autók
              <span className="jobbra halvany">a rendszám ráér: ha megtudod, írd be</span>
            </div>
            {/* A léptető: hányadik autónál tartunk. */}
            <FlottaLepteto groupId={groupId} tagok={tagok} onValtozas={() => void betolt()} />

            <div className="flotta-sorok">
              {tagok.map((t) => (
                <AutoSor key={t.id} t={t} megy={megy}
                         soron={aktualisAuto(tagok)?.id === t.id}
                         onRendszam={(r) => muvelet(() => data.fleetSetPlate(t.id, r))}
                         onMeret={(m) => muvelet(() => data.patchBooking(t.id, { category: m }))}
                         onTorol={() => void torol(t)}
                         onMegisJon={() => void muvelet(() => data.setStatus(t.id, 'CONFIRMED'))}
                         onReszletek={() => setReszletId(t.id)} />
              ))}
            </div>
            <div>
              <button className="btn" disabled={megy}
                      onClick={() => void muvelet(() => data.fleetAddCar(groupId))}>
                + Autó hozzáadása
              </button>
            </div>
          </div>
        </div>

        <div className="lap-lab">
          <div className="osszeg">
            <span className="ertek">{ft(o.ar)}</span>
            <span className="alatta">{o.darab} autó összesen</span>
          </div>
          <div className="gombok">
            <button className="btn" onClick={bezar}>Bezárás</button>
          </div>
        </div>
      </div>

      {reszletId && reszletek(reszletId, () => { setReszletId(null); void betolt() })}
      {kerdesAblak}
    </div>
  )
}

/** Egy autó neve a kérdésekben: a rendszáma, vagy „2. autó". */
function autoNev(t: DayBooking): string {
  return vanRendszam(t) ? (t.plate_raw ?? '').toUpperCase() : `${t.fleet_index}. autó`
}

// ---------------------------------------------------------------------------
//  Egy autó sora
// ---------------------------------------------------------------------------
function AutoSor({ t, megy, soron, onRendszam, onMeret, onTorol, onMegisJon, onReszletek }: {
  t: DayBooking
  megy: boolean
  /** Ennél az autónál tartunk most (a léptető szerint). */
  soron: boolean
  onRendszam: (r: string) => void
  onMeret: (m: VehicleCategory) => void
  onTorol: () => void
  onMegisJon: () => void
  onReszletek: () => void
}) {
  const kezdo = vanRendszam(t) ? (t.plate_raw ?? '').toUpperCase() : ''
  const [rsz, setRsz] = useState(kezdo)
  // Ha máshol változott (élő frissítés), kövesse — gépelés közben nem.
  const [elozo, setElozo] = useState(kezdo)
  if (kezdo !== elozo) { setElozo(kezdo); setRsz(kezdo) }

  const lemondott = !elo(t)
  const lezart = t.status === 'COMPLETED'

  function rendszamMent() {
    const uj = rsz.trim().toUpperCase()
    if (uj === kezdo || (uj === '' && !kezdo)) return
    onRendszam(uj === HELYORZO ? '' : uj)
  }

  return (
    <div className="flotta-sor" data-allapot={t.status} data-lemondott={lemondott || undefined}
         data-soron={soron || undefined}>
      <span className="flotta-sorszam">{t.fleet_index}.</span>
      <input className="beviteli beviteli-rendszam" aria-label={`${t.fleet_index}. autó rendszáma`}
             placeholder="rendszám" value={rsz} disabled={lemondott || megy}
             onChange={(e) => setRsz(e.target.value.toUpperCase())}
             onBlur={rendszamMent}
             onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      <select className="beviteli" aria-label={`${t.fleet_index}. autó mérete`}
              value={t.category} disabled={lemondott || lezart || megy}
              onChange={(e) => onMeret(e.target.value as VehicleCategory)}>
        {MERETEK.map((m) => <option key={m} value={m}>{CATEGORY_LABEL[m]}</option>)}
      </select>
      <span className="flotta-ar szam">{ft(t.final_price_huf ?? t.estimated_price_huf)}</span>
      <span className="flotta-allapot">
        {lemondott ? 'törölve' : lezart ? 'kész' : soron ? 'most ez' : 'vár'}
      </span>
      <span className="flotta-gombok">
        {!lemondott && igazoloKell(t) && <IgazoloGomb bookingId={t.id} className="btn btn-kicsi" />}
        <button className="btn btn-kicsi" onClick={onReszletek}>Részletek</button>
        {lemondott && (
          <button className="btn btn-kicsi" disabled={megy} onClick={onMegisJon}>Mégis jön</button>
        )}
        {!lemondott && !lezart && (
          <button className="btn btn-kicsi btn-veszelyes" disabled={megy} onClick={onTorol}>Törlés</button>
        )}
      </span>
    </div>
  )
}
