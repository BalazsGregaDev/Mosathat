import type { BookingStatus, DayBooking } from '../../lib/types'
import type { KerdesBeallitas } from './Kerdes'

export const ALLAPOT_KERDES: Partial<Record<BookingStatus, KerdesBeallitas>> = {
  COMPLETED: {
    cim: 'Biztosan átvette?',
    szoveg: 'Átvétel után a munkalap lezárul: a munkalista és az ár már nem módosítható.',
  },
}

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

export function ELUTASITAS_KERDES(nev: string): KerdesBeallitas {
  return {
    cim: `Elutasítod? ${nev}`,
    szoveg: 'A kérés elutasítva kerül a napba; a „Mégis jön" gombbal visszavehető.',
    igen: 'Elutasít',
    nem: 'Mégse',
    veszelyes: true,
  }
}
