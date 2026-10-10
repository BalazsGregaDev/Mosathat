import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, helyiOra, hibaSzoveg, napRovidCim } from '../../lib/format'
import { aktualisAuto, autoNev, csoportNev, csoportOsszeg, elo, HELYORZO, vanRendszam } from '../../lib/flotta'
import FlottaLepteto from '../day/FlottaLepteto'
import {
  CATEGORY_LABEL, KATEGORIAK, TYPE_LABEL,
  type BookingType, type DayBooking, type VehicleCategory,
} from '../../lib/types'
import Szerkesztheto from '../common/Szerkesztheto'
import IdoMezo from '../common/IdoMezo'
import DatumMezo from '../common/DatumMezo'
import { NEM_FERT_BE_KERDES } from '../common/kerdesek'
import { useKerdes } from '../common/Kerdes'
import Ablak from '../common/Ablak'
import IgazoloGomb, { igazoloKell } from '../igazolo/IgazoloGomb'

const TIPUSOK: BookingType[] = ['LEADOS', 'HOZOMVISZEM']

export default function FlottaMunkalap({
  groupId,
  onBezar,
  reszletek,
  arlistaPanel,
}: {
  groupId: string
  onBezar: () => void
  reszletek: (bookingId: string, bezar: () => void) => React.ReactNode
  arlistaPanel?: React.ReactNode
}) {
  const { data, catalog, refresh } = useApp()
  const [kerdesAblak, kerdez] = useKerdes()
  const [tagok, setTagok] = useState<DayBooking[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [megy, setMegy] = useState(false)
  const [reszletId, setReszletId] = useState<string | null>(null)

  const betolt = useCallback(async () => {
    try {
      setTagok(await data.getFleetGroup(groupId))
    } catch (e) {
      setHiba(hibaSzoveg(e))
    }
  }, [data, groupId])

  const elso = tagok ? (tagok.find(elo) ?? tagok[0]) : null
  const vegso = elso?.pick_up_at ?? elso?.deadline_at
  const vegsoOra = vegso ? helyiOra(vegso) : ''
  const [oraVazlat, setOraVazlat] = useState(vegsoOra)
  const [oraAlap, setOraAlap] = useState(vegsoOra)
  if (vegsoOra !== oraAlap) { setOraAlap(vegsoOra); setOraVazlat(vegsoOra) }

  useEffect(() => { void betolt() }, [betolt])
  useEffect(() => data.subscribe(() => void betolt()), [data, betolt])

  const bezar = useCallback(() => { refresh(); onBezar() }, [refresh, onBezar])

  async function muvelet(fn: () => Promise<unknown>, dob = false) {
    if (megy) {
      if (dob) throw new Error('Még tart az előző mentés, próbáld újra.')
      return
    }
    setMegy(true)
    setHiba(null)
    try {
      await fn()
    } catch (e) {
      if (dob) throw e
      setHiba(hibaSzoveg(e))
    } finally {
      setMegy(false)
      await betolt()
    }
  }

  if (!tagok || !elso) {
    return (
      <Ablak cimke="Flottás csoport" onEsc={bezar} onHatter={bezar}>
        <div className="lap lap-szeles">
          <div className="lap-torzs">
            <div className="betolt">{hiba ? <span className="hibauzenet">{hiba}</span> : 'Betöltés…'}</div>
          </div>
        </div>
        {arlistaPanel}
      </Ablak>
    )
  }

  const o = csoportOsszeg(tagok)
  const szerkesztheto = tagok.some((t) => elo(t) && t.status !== 'COMPLETED')
  const hozomViszem = elso.booking_type === 'HOZOMVISZEM'
  const kozos = (patch: Record<string, unknown>) => muvelet(() => data.fleetPatch(groupId, patch))

  async function torol(t: DayBooking) {
    if (!(await kerdez({
      cim: `Törlöd ezt az autót a csoportból? ${autoNev(t)}`,
      szoveg: 'Az autó lemondottként marad meg (visszavonható), a darabszám eggyel csökken.',
      igen: 'Törlés', nem: 'Mégse', veszelyes: true,
    }))) return
    await muvelet(() => data.setStatus(t.id, 'CANCELLED_BY_CUSTOMER'))
  }

  async function nemFert(t: DayBooking) {
    if (!(await kerdez(NEM_FERT_BE_KERDES(t)))) return
    await muvelet(() => data.notFitted(t.id))
  }

  return (
    <Ablak cimke="Flottás csoport" onEsc={bezar} onHatter={bezar}>
      <div className="lap lap-szeles flotta-munkalap">
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

          <div className="szakasz">
            <div className="fej">Közös — minden autóra</div>

            <Szerkesztheto cimke="Név" ertek={elso.customer_name} zarolt={!szerkesztheto}
                           onMent={(v) => muvelet(() => data.patchBooking(elso.id, { customer_name: v }), true)} />
            <Szerkesztheto cimke="Telefon" ertek={elso.customer_phone} tipus="telefon"
                           zarolt={!szerkesztheto}
                           onMent={(v) => muvelet(() => data.patchBooking(elso.id, { customer_phone: v }), true)}
                           utotag={elso.customer_phone && (
                             <a href={`tel:${elso.customer_phone}`} className="hivas">Hívás</a>
                           )} />

            <div className="adatsor">
              <span>Nap</span>
              <span className="ertek">
                <DatumMezo ariaLabel="A csoport napja" ertek={elso.service_date.slice(0, 10)}
                           disabled={!szerkesztheto || megy}
                           onMent={(d) => void kozos({ service_date: d })} />
              </span>
            </div>

            <div className="adatsor">
              <span>{hozomViszem ? 'Visszaérni' : 'Kész legyen'}</span>
              <span className="ertek">
                <IdoMezo ariaLabel="Végső időpont" cim={hozomViszem ? 'Visszaérni' : 'Kész legyen'}
                         value={oraVazlat}
                         onChange={setOraVazlat}
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

          <div className="szakasz">
            <div className="fej">
              Autók
              <span className="jobbra halvany">a rendszám ráér: ha megtudod, írd be</span>
            </div>
            <FlottaLepteto groupId={groupId} tagok={tagok} onValtozas={() => void betolt()} />

            <div className="flotta-sorok">
              {tagok.map((t) => (
                <AutoSor key={t.id} t={t} megy={megy}
                         soron={aktualisAuto(tagok)?.id === t.id}
                         onRendszam={(r) => muvelet(() => data.fleetSetPlate(t.id, r))}
                         onMeret={(m) => muvelet(() => data.patchBooking(t.id, { category: m }))}
                         onTorol={() => void torol(t)}
                         onNemFert={() => void nemFert(t)}
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

      {reszletId ? reszletek(reszletId, () => { setReszletId(null); void betolt() }) : arlistaPanel}
      {kerdesAblak}
    </Ablak>
  )
}

function AutoSor({ t, megy, soron, onRendszam, onMeret, onTorol, onNemFert, onMegisJon, onReszletek }: {
  t: DayBooking
  megy: boolean
  soron: boolean
  onRendszam: (r: string) => void
  onMeret: (m: VehicleCategory) => void
  onTorol: () => void
  onNemFert: () => void
  onMegisJon: () => void
  onReszletek: () => void
}) {
  const kezdo = vanRendszam(t) ? (t.plate_raw ?? '').toUpperCase() : ''
  const [rsz, setRsz] = useState(kezdo)
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
        {KATEGORIAK.map((m) => <option key={m} value={m}>{CATEGORY_LABEL[m]}</option>)}
      </select>
      <span className="flotta-ar szam">{ft(t.final_price_huf ?? t.estimated_price_huf)}</span>
      <span className="flotta-allapot">
        {lemondott ? 'törölve' : t.not_fitted ? 'nem fért be' : lezart ? 'kész' : soron ? 'most ez' : 'vár'}
      </span>
      <span className="flotta-gombok">
        {!lemondott && igazoloKell(t) && <IgazoloGomb bookingId={t.id} className="btn btn-kicsi" />}
        <button className="btn btn-kicsi" onClick={onReszletek}>Részletek</button>
        {lemondott && (
          <button className="btn btn-kicsi" disabled={megy} onClick={onMegisJon}>Mégis jön</button>
        )}
        {!lemondott && !lezart && (
          <button className="btn btn-kicsi btn-kerdojel" disabled={megy} onClick={onNemFert}>Nem fért be</button>
        )}
        {!lemondott && !lezart && (
          <button className="btn btn-kicsi btn-veszelyes" disabled={megy} onClick={onTorol}>Törlés</button>
        )}
      </span>
    </div>
  )
}
