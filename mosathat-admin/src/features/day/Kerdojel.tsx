import type { DayBooking } from '../../lib/types'

export default function Kerdojel({ b }: { b: Pick<DayBooking, 'tentative' | 'not_fitted'> }) {
  if (b.not_fitted) {
    return (
      <span className="cimke-pill nem-fert-be" title="Nem fért be — 0 Ft-tal lezárva">
        nem fért be
      </span>
    )
  }
  if (b.tentative) {
    return (
      <span className="cimke-pill kerdojel" title="Kérdőjeles: ha befér, megcsináljuk, ha nem, nem">
        ???
      </span>
    )
  }
  return null
}
