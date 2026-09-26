import { ft, ora } from '../../lib/format'
import {
  CATEGORY_SHORT, SCOPE_LABEL, STATUS_LABEL, type DayBooking,
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
  const arany = b.tasks_total > 0 ? (b.tasks_done / b.tasks_total) * 100 : 0

  // Név → Modell → Márka → Kategória. A név viszi a hierarchiát: a műhelyben
  // az autót a tulajdonosával együtt azonosítják.
  const azonosito = [
    b.company_name || b.customer_name,
    b.model,
    b.brand,
    CATEGORY_SHORT[b.category],
  ].filter(Boolean).join(' · ')

  return (
    <button className="kartya" data-allapot={b.status} onClick={onMegnyit}>
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
  )
}
