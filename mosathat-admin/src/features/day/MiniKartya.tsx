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

export function csomagBetu(b: Pick<DayBooking, 'package_name' | 'package_code'>): string | null {
  const n = (b.package_name ?? b.package_code ?? '').trim()
  return n ? n.charAt(0).toUpperCase() : null
}

export function extraRovid(nev: string): string {
  const elso = nev.trim().split(/\s+/)[0]?.replace(/[,.;:]+$/, '') ?? ''
  return elso.length > 5 ? `${elso.slice(0, 4)}.` : elso
}

export default function MiniKartya({ b, onMegnyit }: {
  b: DayBooking
  onMegnyit: (id: string) => void
}) {
  const rendszamE = vanRendszam(b) && !b.flotta
  const betu = csomagBetu(b)
  const extrak = (b.extras_summary ?? '').split(', ').map((x) => x.trim()).filter(Boolean)
  const csomagSzoveg = [b.package_name, b.full_service ? 'Full Service' : null].filter(Boolean).join(' + ')
  return (
    <button
      type="button"
      className="minikartya"
      data-a={b.status}
      onClick={(e) => { e.stopPropagation(); onMegnyit(b.id) }}
      title={[azonosito(b), idoSzoveg(b), csomagSzoveg, extrak.length ? `+ ${extrak.join(', ')}` : null, STATUS_LABEL[b.status]]
        .filter(Boolean).join(' · ')}
    >
      <span className="mini-fej">
        {betu && (
          <span className="csomag-betu" data-csomag={b.package_code ?? undefined} data-betu={betu}>
            {betu}{b.full_service ? '+' : ''}
          </span>
        )}
        <span className={rendszamE ? 'azon rendszam' : 'azon nev'}>{azonosito(b)}</span>
        <Kerdojel b={b} />
      </span>
      <span className="ido">{idoSzoveg(b)}</span>
      {extrak.length > 0 && (
        <span className="mini-extrak">+ {extrak.map(extraRovid).join(' · ')}</span>
      )}
    </button>
  )
}
