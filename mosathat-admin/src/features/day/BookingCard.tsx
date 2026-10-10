import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, helyiNap, hibaSzoveg, maStr, napRovidCim, ora, relativNap, vegOra } from '../../lib/format'
import { useKerdes, type KerdesBeallitas } from '../common/Kerdes'
import { ELUTASITAS_KERDES, NEM_FERT_BE_KERDES, TORLES_KERDES } from '../common/kerdesek'
import Kerdojel from './Kerdojel'
import {
  NEXT_STATUS, SCOPE_LABEL, STATUS_LABEL, eloE, lemondottE,
  type BookingStatus, type DayBooking,
} from '../../lib/types'
import { azonosito } from './MiniKartya'
import IgazoloGomb, { igazoloKell } from '../igazolo/IgazoloGomb'
import { useIgazoloKapu } from '../igazolo/useIgazoloKapu'
import { useKeszAblak } from '../booking/KeszAblak'
import { kovetkezoLepesFut } from '../booking/lepes'

function napiIdo(b: DayBooking, ma: string = maStr()): string {
  const hozza = b.drop_off_at ?? b.start_at
  const viszi = b.pick_up_at ?? b.deadline_at
  const hozzaNap = hozza ? helyiNap(hozza) : b.service_date.slice(0, 10)
  const visziNap = viszi ? helyiNap(viszi) : b.last_day.slice(0, 10)

  if (hozzaNap !== visziNap) {
    const eleje = hozzaNap === ma && hozza ? `Ma ${ora(hozza)}` : relativNap(hozzaNap, ma)
    const vege = `${relativNap(visziNap, ma)}${viszi ? ` ${ora(viszi)}` : ''}`
    return `${eleje} – ${vege}`
  }

  if (b.booking_type === 'VAROS' && b.start_at) {
    return `${ora(b.start_at)} – ${vegOra(b.start_at, b.planned_duration_minutes)}`
  }
  if (!hozza) return '—'
  return viszi ? `${ora(hozza)} – ${ora(viszi)}` : ora(hozza)
}

export default function BookingCard({
  b,
  nap,
  onMegnyit,
  onModosit,
}: {
  b: DayBooking
  nap?: string
  onMegnyit: () => void
  onModosit?: (id: string, valtozas: Partial<DayBooking>) => void
}) {
  const { data, refresh } = useApp()
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [kerdesAblak, kerdez] = useKerdes()
  const [kapuAblak, kapu] = useIgazoloKapu()
  const [keszAblak, keszVan] = useKeszAblak()
  const arany = b.tasks_total > 0 ? (b.tasks_done / b.tasks_total) * 100 : 0

  const kovetkezo = NEXT_STATUS[b.status]
  const lemondott = lemondottE(b.status)
  const lezart = b.status === 'COMPLETED'
  const keres = b.status === 'REQUESTED'
  const torolheto = !lezart && eloE(b.status) && !keres

  const napok = b.napok_szama ?? 1
  const tobbnapos = napok > 1
  const viszi = b.pick_up_at ?? b.deadline_at
  const megjegyzes = (b.notes ?? '').trim()
  const igazolo = igazoloKell(b)

  async function allapot(cel: BookingStatus) {
    if (megy) return
    const regi = b.status
    setMegy(true)
    setHiba(null)
    onModosit?.(b.id, { status: cel })
    try {
      await data.setStatus(b.id, cel)
      refresh()
    } catch (e) {
      onModosit?.(b.id, { status: regi })
      setHiba(hibaSzoveg(e))
    } finally {
      setMegy(false)
    }
  }

  async function kerdesUtan(k: KerdesBeallitas, cel: BookingStatus) {
    if (!(await kerdez(k))) return
    await allapot(cel)
  }

  async function nemFertBe() {
    if (megy || !(await kerdez(NEM_FERT_BE_KERDES(b)))) return
    setMegy(true)
    setHiba(null)
    onModosit?.(b.id, { status: 'COMPLETED', not_fitted: true, final_price_huf: 0 })
    try {
      await data.notFitted(b.id)
      refresh()
    } catch (e) {
      onModosit?.(b.id, { status: b.status, not_fitted: false, final_price_huf: b.final_price_huf })
      setHiba(hibaSzoveg(e))
    } finally {
      setMegy(false)
    }
  }

  async function kovetkezoLepes() {
    if (!kovetkezo || megy) return
    await kovetkezoLepesFut({
      bookingId: b.id, cel: kovetkezo.to, felirat: azonosito(b), igazolo,
      kapu, keszVan, kerdez, allapot,
      keszUtan: (eredmeny) => {
        onModosit?.(b.id, {
          status: 'READY',
          skip_note: eredmeny.skip_note,
          skip_huf: eredmeny.skip_huf || null,
        })
        refresh()
      },
      hiba: setHiba,
    })
  }

  return (
    <div className="kartya" data-allapot={b.status} title={STATUS_LABEL[b.status]}>
      <button className="kartya-nyit" onClick={onMegnyit}>
        <div className="kartya-felso">
          <span className="rendszam">{azonosito(b)}</span>
          <Kerdojel b={b} />
          {keres && (
            <span className="cimke-pill" data-r="keres" title="Online foglalási kérés — vissza kell igazolni">
              Online kérés
            </span>
          )}
          {b.booking_type === 'VAROS' && (
            <span className="cimke-pill" data-r="megvarja" title="Megvárja — rögtön kezdeni">Megvárja</span>
          )}
          {b.booking_type === 'HOZOMVISZEM' && (
            <span className="cimke-pill" data-r="hozomviszem" title="Hozom-viszem">H-V</span>
          )}
          {b.company_name && (
            <span className="kartya-ceg" title={`Cég: ${b.company_name}`}>{b.company_name}</span>
          )}
          <span className="ido">{napiIdo(b, nap)}</span>
          <span className="csomag">
            {b.package_name ?? 'Nincs csomag'}
            {b.full_service && ' + Full Service'}
            {b.scope !== 'TELJES' && ` · ${SCOPE_LABEL[b.scope]}`}
          </span>
          {b.extras_summary && (
            <span className="extrak">+ {b.extras_summary}</span>
          )}
          <span className="csak-felolvaso">{STATUS_LABEL[b.status]}</span>
        </div>

        {tobbnapos && (
          <div className="kartya-tobbnap">
            {napok} napos · {b.nap_szama}. nap
            {' · '}viszi: {napRovidCim(b.last_day.slice(0, 10))}
            {viszi && ` ${ora(viszi)}`}
          </div>
        )}

        {megjegyzes && <div className="kartya-megj">{megjegyzes}</div>}
      </button>

      {hiba && <div className="kartya-hiba">{hiba}</div>}

      <div className="kartya-lab">
        <div className="kartya-allas">
          {b.planned_duration_minutes === 0 && (
            <span className="ido-hianyzik">idő hiányzik</span>
          )}
          {b.rest_minutes > 0 && <span title="száradási idő">száradás</span>}
          <span className="ar-kiemelt">{ft(b.final_price_huf ?? b.estimated_price_huf)}</span>
          {b.tasks_total > 0 && (
            <span className="lista-jelzo">
              <span className="csik">
                <i style={{ width: `${arany}%` }} />
              </span>
              {b.tasks_done}/{b.tasks_total}
            </span>
          )}
        </div>

        {(kovetkezo || torolheto || lemondott || igazolo || keres) && (
          <div className="kartya-muvelet">
            {keres && (
              <button className="btn btn-veszelyes" disabled={megy}
                      onClick={() => void kerdesUtan(ELUTASITAS_KERDES(azonosito(b)), 'REJECTED')}>
                Elutasít
              </button>
            )}
            {igazolo && <IgazoloGomb bookingId={b.id} />}
            {torolheto && (
              <button className="btn btn-kerdojel" disabled={megy}
                      onClick={() => void nemFertBe()}>
                Nem fért be
              </button>
            )}
            {torolheto && (
              <button className="btn btn-veszelyes" disabled={megy}
                      onClick={() => void kerdesUtan(TORLES_KERDES(b), 'CANCELLED_BY_CUSTOMER')}>
                Törlés
              </button>
            )}
            {lemondott && (
              <button className="btn" disabled={megy}
                      onClick={() => void allapot('CONFIRMED')}>
                Mégis jön
              </button>
            )}
            {kovetkezo && (
              <button className="btn btn-fo" disabled={megy}
                      onClick={() => void kovetkezoLepes()}>
                {kovetkezo.label}
              </button>
            )}
          </div>
        )}
      </div>
      {kerdesAblak}
      {keszAblak}
      {kapuAblak}
    </div>
  )
}
