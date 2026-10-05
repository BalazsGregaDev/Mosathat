import type { DayBooking } from '../../lib/types'

// ---------------------------------------------------------------------------
//  „???" — kérdőjeles foglalás jelölése a rendszám mellett
//
//  Kérdőjeles: az autót itt hagyják, de csak feltételesen vállaltuk el — ha
//  befér, megcsináljuk, ha nem, nem. Minden nézetben (nap, hét, hónap,
//  munkalap) ugyanígy, a rendszám mellett látszik.
//
//  Ha a végén nem fért be (és 0 Ft-tal lezártuk), a „???" helyett ez áll:
//  „nem fért be".
// ---------------------------------------------------------------------------

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
