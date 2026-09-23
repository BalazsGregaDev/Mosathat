import { ft, idoRovid, idosav, ora } from '../../lib/format'
import {
  CATEGORY_SHORT, SCOPE_LABEL, STATUS_LABEL, TYPE_LABEL, type DayBooking,
} from '../../lib/types'

// Egy kártya a napi listában. Amit a dolgozó egy pillantással lát:
// mikor, melyik autó, mit kér, hol tart.

export default function BookingCard({ b, onMegnyit }: { b: DayBooking; onMegnyit: () => void }) {
  const varos = b.booking_type === 'VAROS'
  const ido = varos
    ? idosav(b.start_at, b.planned_duration_minutes)
    : `${ora(b.drop_off_at)} leadás`

  const arany = b.tasks_total > 0 ? (b.tasks_done / b.tasks_total) * 100 : 0

  return (
    <button className="kartya" data-allapot={b.status} onClick={onMegnyit}>
      <div className="kartya-felso">
        <span className="ido">{ido}</span>
        <span className="rendszam">{b.plate_raw}</span>
        <span className="auto">
          {[b.brand, b.model].filter(Boolean).join(' ') || CATEGORY_SHORT[b.category]}
        </span>
        <span className="tolto" />
        <span className="cimke-pill allapot-pill" data-a={b.status}>
          {STATUS_LABEL[b.status]}
        </span>
      </div>

      <div className="kartya-also">
        <span className="csomag">
          {b.package_name ?? 'Csak extrák'}
          {b.full_service && ' + Full Service'}
          {b.scope !== 'TELJES' && ` · ${SCOPE_LABEL[b.scope]}`}
        </span>

        <span>{CATEGORY_SHORT[b.category]}</span>

        {!varos && <span>{TYPE_LABEL[b.booking_type]}</span>}

        {b.planned_duration_minutes > 0 ? (
          <span className="szam">{idoRovid(b.planned_duration_minutes)}</span>
        ) : (
          <span style={{ color: 'var(--v-erkezett)', fontWeight: 600 }}>idő hiányzik</span>
        )}

        <span className="ar">{ft(b.final_price_huf ?? b.estimated_price_huf)}</span>

        {b.tasks_total > 0 && (
          <span className="lista-jelzo">
            <span className="csik">
              <i style={{ width: `${arany}%` }} />
            </span>
            {b.tasks_done}/{b.tasks_total}
          </span>
        )}

        {b.rest_minutes > 0 && <span title="száradási idő">száradás</span>}
      </div>
    </button>
  )
}
