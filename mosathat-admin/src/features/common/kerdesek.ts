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

/** „Nem fért be": a kérdőjeles autó lezárása 0 Ft-tal. */
export function NEM_FERT_BE_KERDES(b: Pick<DayBooking, 'plate_raw'>): KerdesBeallitas {
  return {
    cim: `Nem fért be? ${(b.plate_raw ?? '').toUpperCase()}`,
    szoveg: 'A foglalás lezárul 0 Ft-tal, „nem fért be" jelöléssel. '
      + 'Ha mégis megcsináljátok, a munkalapon visszanyitható.',
    igen: 'Nem fért be',
    nem: 'Mégse',
  }
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
