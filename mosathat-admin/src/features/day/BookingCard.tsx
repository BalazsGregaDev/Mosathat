import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, ora } from '../../lib/format'
import {
  CATEGORY_SHORT, NEXT_STATUS, SCOPE_LABEL, STATUS_LABEL,
  type BookingStatus, type DayBooking,
} from '../../lib/types'

// ---------------------------------------------------------------------------
//  Egy kártya a napi listában.
//
//  A sorrend nem véletlen: mikor → melyik autó → kinek → mit kér → mennyi.
//  Ez az a sorrend, ahogy a kérdések elhangzanak a műhelyben.
//
//  Ami szándékosan NINCS rajta: a "leadás" szó és a külön kiírt időtartam.
//  Az időintervallumból mindkettő kiderül, és minden felesleges szó azt
//  veszi el a szemtől, ami tényleg számít.
//
//  A kártya alján ott van a KÖVETKEZŐ lépés gombja. A nap nagy részében
//  ugyanaz a három mozdulat ismétlődik — megérkezett, kész van, átvette —,
//  és ezért eddig minden alkalommal meg kellett nyitni a munkalapot, majd
//  bezárni. Két kattintás abból, aminek egy is elég.
//
//  A munkalap ettől nem lesz fölösleges: ott van a munkalista, az ár, a
//  megjegyzés. Csak nem kell megnyitni ahhoz, hogy egy autót továbbléptess.
// ---------------------------------------------------------------------------

/** Az időintervallum: kezdés – vég. Nincs külön szó rá, hogy melyik melyik. */
function idoSav(b: DayBooking): string {
  if (b.booking_type === 'VAROS' && b.start_at) {
    const kezd = new Date(b.start_at)
    const veg = new Date(kezd.getTime() + b.planned_duration_minutes * 60_000)
    return `${ora(b.start_at)} – ${ora(veg.toISOString())}`
  }
  // Leadós és többnapos: leadás – határidő (vagy átvétel)
  const eleje = b.drop_off_at ?? b.start_at
  const vege = b.pick_up_at ?? b.deadline_at ?? null
  if (!eleje) return '—'
  return vege ? `${ora(eleje)} – ${ora(vege)}` : ora(eleje)
}

export default function BookingCard({ b, onMegnyit }: { b: DayBooking; onMegnyit: () => void }) {
  const { data, refresh } = useApp()
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const arany = b.tasks_total > 0 ? (b.tasks_done / b.tasks_total) * 100 : 0

  // Név → Modell → Márka → Kategória. A név viszi a hierarchiát: a műhelyben
  // az autót a tulajdonosával együtt azonosítják.
  const azonosito = [
    b.company_name || b.customer_name,
    b.model,
    b.brand,
    CATEGORY_SHORT[b.category],
  ].filter(Boolean).join(' · ')

  const kovetkezo = NEXT_STATUS[b.status]
  const lemondott = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP'].includes(b.status)
  const lezart = b.status === 'COMPLETED'
  const torolheto = !lezart && !lemondott && b.status !== 'NO_SHOW'

  async function allapot(cel: BookingStatus) {
    if (megy) return
    setMegy(true)
    setHiba(null)
    try {
      await data.setStatus(b.id, cel)
      refresh()
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMegy(false)
    }
  }

  // A lezárás és a törlés megkérdez. Nem azért, mert nehéz visszacsinálni —
  // a törlés visszavonható, a lezárás visszanyitható —, hanem mert egy
  // zsúfolt listában a szomszédos kártya gombja is egy ujjnyira van.
  function kerdez(uzenet: string, cel: BookingStatus) {
    if (!window.confirm(uzenet)) return
    void allapot(cel)
  }

  return (
    <div className="kartya" data-allapot={b.status}>
      {/* A kártya teteje nyitja meg a munkalapot. A gombok külön állnak
          alatta: gomb a gombban érvénytelen, és a véletlen kattintás is
          pont a rossz helyre esne. */}
      <button className="kartya-nyit" onClick={onMegnyit}>
        {/* 1. sor — mikor, melyik autó, hol tart */}
        <div className="kartya-felso">
          <span className="ido">{idoSav(b)}</span>
          <span className="rendszam">{b.plate_raw}</span>
          <span className="tolto" />
          <span className="cimke-pill allapot-pill" data-a={b.status}>
            {STATUS_LABEL[b.status]}
          </span>
        </div>

        {/* 2. sor — kinek */}
        <div className="kartya-kozep">{azonosito}</div>

        {/* 3. sor — mit kér, mennyiért, hol tart a munka */}
        <div className="kartya-also">
          <span className="csomag">
            {b.package_name ?? 'Csak extrák'}
            {b.full_service && ' + Full Service'}
            {b.scope !== 'TELJES' && ` · ${SCOPE_LABEL[b.scope]}`}
          </span>

          {b.planned_duration_minutes === 0 && (
            <span style={{ color: 'var(--v-erkezett)', fontWeight: 600 }}>idő hiányzik</span>
          )}
          {b.rest_minutes > 0 && <span title="száradási idő">száradás</span>}

          <span className="tolto" />

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
      </button>

      {hiba && <div className="kartya-hiba">{hiba}</div>}

      {(kovetkezo || torolheto || lemondott) && (
        <div className="kartya-muvelet">
          {torolheto && (
            <button className="btn btn-kicsi btn-veszelyes" disabled={megy}
                    onClick={() => kerdez(
                      `Biztos törlöd? ${b.plate_raw} · ${b.customer_name}\n\n`
                      + 'A foglalás törölve marad, az időpont felszabadul. '
                      + 'Az ügyfél és az autó adata nem vész el, és a törlés '
                      + 'visszavonható.',
                      'CANCELLED_BY_CUSTOMER')}>
              Törlés
            </button>
          )}
          {lemondott && (
            <button className="btn btn-kicsi" disabled={megy}
                    onClick={() => void allapot('CONFIRMED')}>
              Mégis jön
            </button>
          )}
          {kovetkezo && (
            <button className="btn btn-kicsi btn-fo" disabled={megy}
                    onClick={() => {
                      if (kovetkezo.to === 'COMPLETED') {
                        kerdez('Biztos lezárod? Minden adat helyes?\n\n'
                          + 'Lezárás után a munkalista és az ár nem módosítható.',
                          'COMPLETED')
                      } else {
                        void allapot(kovetkezo.to)
                      }
                    }}>
              {kovetkezo.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
