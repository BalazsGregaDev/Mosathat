import { idosav, ora } from '../../lib/format'
import Kerdojel from './Kerdojel'
import { csoportNev, csoportOsszeg, HELYORZO, vanRendszam, vegsoIdo } from '../../lib/flotta'
import { tobbnaposE as tobbnapos } from '../../lib/savok'
import { STATUS_LABEL, type DayBooking } from '../../lib/types'

function utolsoNapIg(b: DayBooking): string {
  return `${Number(b.last_day.slice(8, 10))}-ig`
}

function idoSzoveg(b: DayBooking): string {
  if (b.fleet_group && !tobbnapos(b)) return vegsoIdo(b)
  if (tobbnapos(b)) {
    const viszi = b.pick_up_at ?? b.deadline_at
    return viszi ? `${utolsoNapIg(b)}, ${ora(viszi)}` : utolsoNapIg(b)
  }

  if (b.drop_off_at && b.pick_up_at) {
    return `${ora(b.drop_off_at)} – ${ora(b.pick_up_at)}`
  }

  const kezdes = b.start_at ?? b.drop_off_at
  if (kezdes) {
    return b.planned_duration_minutes > 0
      ? idosav(kezdes, b.planned_duration_minutes)
      : ora(kezdes)
  }
  return '—'
}

export function azonosito(b: DayBooking): string {
  if (b.flotta) return `${csoportNev(b)} ${csoportOsszeg(b.flotta).darab} db`
  const r = (b.plate_raw ?? '').trim().toUpperCase()
  if (r && r !== HELYORZO) return r
  return b.company_name || b.customer_name || 'névtelen'
}

export default function MiniKartya({ b, onMegnyit }: {
  b: DayBooking
  onMegnyit: (id: string) => void
}) {
  const rendszamE = vanRendszam(b) && !b.flotta
  return (
    <button
      type="button"
      className="minikartya"
      data-a={b.status}
      onClick={(e) => { e.stopPropagation(); onMegnyit(b.id) }}
      title={`${azonosito(b)} · ${idoSzoveg(b)} · ${STATUS_LABEL[b.status]}`}
    >
      <span className={rendszamE ? 'azon rendszam' : 'azon nev'}>{azonosito(b)}</span>
      <Kerdojel b={b} />
      <span className="ido">{idoSzoveg(b)}</span>
    </button>
  )
}
