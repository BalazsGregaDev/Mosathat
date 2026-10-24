import { hibaSzoveg } from '../../lib/format'
import type { BookingStatus, FinishPreview } from '../../lib/types'
import type { KerdesBeallitas } from '../common/Kerdes'
import { ALLAPOT_KERDES } from '../common/kerdesek'
import type { IgazoloFajta } from '../igazolo/IgazoloGomb'
import type { IgazoloKapu } from '../igazolo/useIgazoloKapu'

const ALAIRAS_KERES = 'Az autó elkészült. Átadáskor írasd alá az igazolólapot (km, név, aláírás). '
  + 'Ha most nem, az Átvette gombnál újra előjön.'

const BERLET_ALAIRAS = 'Az autó elkészült, az alkalmat levontuk a bérletből. '
  + 'Átadáskor írasd alá a bérlet igazolólapját (név, aláírás). Ha most nem, az Átvette gombnál újra előjön.'

export async function kovetkezoLepesFut(o: {
  bookingId: string
  cel: BookingStatus
  felirat: string
  igazolo: IgazoloFajta | null
  kapu: IgazoloKapu
  keszVan: (bookingId: string, felirat: string) => Promise<FinishPreview | null>
  kerdez: (k: KerdesBeallitas) => Promise<boolean>
  allapot: (cel: BookingStatus) => Promise<void>
  keszUtan: (e: FinishPreview) => void | Promise<void>
  hiba: (uzenet: string) => void
}): Promise<void> {
  try {
    if (o.igazolo && o.cel === 'COMPLETED' && !(await o.kapu.atadhato(o.bookingId, o.igazolo))) return
  } catch (e) {
    o.hiba(hibaSzoveg(e))
    return
  }
  if (o.cel === 'READY') {
    const eredmeny = await o.keszVan(o.bookingId, o.felirat)
    if (!eredmeny) return
    await o.keszUtan(eredmeny)
  } else {
    const k = ALLAPOT_KERDES[o.cel]
    if (k && !(await o.kerdez(k))) return
    await o.allapot(o.cel)
  }
  if (o.igazolo && o.cel === 'READY') {
    try {
      await o.kapu.alairat(o.bookingId, o.igazolo === 'BERLET' ? BERLET_ALAIRAS : ALAIRAS_KERES, o.igazolo)
    } catch (e) {
      o.hiba(hibaSzoveg(e))
    }
  }
}
