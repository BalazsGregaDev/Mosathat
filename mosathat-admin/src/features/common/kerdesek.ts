import type { BookingStatus, DayBooking } from '../../lib/types'
import type { KerdesBeallitas } from './Kerdes'

// ---------------------------------------------------------------------------
//  A kérdések — közösek a kártyával és a munkalappal, hogy ugyanaz a gomb
//  mindkét helyen ugyanazt kérdezze.
// ---------------------------------------------------------------------------

/** Melyik lépés előtt kérdezünk rá. A „Megérkezett" nem: az a nap leggyakoribb
 *  mozdulata, és ha téves, a munkalista egyszerűen még üres. */
export const ALLAPOT_KERDES: Partial<Record<BookingStatus, KerdesBeallitas>> = {
  READY: { cim: 'Biztosan elkészült?' },
  COMPLETED: {
    cim: 'Biztosan átvette?',
    szoveg: 'Átvétel után a munkalap lezárul: a munkalista és az ár már nem módosítható.',
  },
}

export function TORLES_KERDES(b: Pick<DayBooking, 'plate_raw'>): KerdesBeallitas {
  return {
    cim: `Biztosan törlöd? ${b.plate_raw}`,
    szoveg: 'Az időpont felszabadul. Az ügyfél és az autó adata megmarad, '
      + 'és a törlés visszavonható.',
    igen: 'Törlés',
    nem: 'Mégse',
    veszelyes: true,
  }
}
