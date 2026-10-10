import { hibaSzoveg } from '../../lib/format'
import type { BookingStatus, FinishPreview } from '../../lib/types'
import type { KerdesBeallitas } from '../common/Kerdes'
import { ALLAPOT_KERDES } from '../common/kerdesek'

const ALAIRAS_KERES = 'Az autó elkészült. Átadáskor írasd alá az igazolólapot (km, név, aláírás). '
  + 'Ha most nem, az Átvette gombnál újra előjön.'

export async function kovetkezoLepesFut(o: {
  bookingId: string
  cel: BookingStatus
  felirat: string
  igazolo: boolean
  kapu: {
    alairat: (bookingId: string, uzenet: string) => Promise<boolean>
    atadhato: (bookingId: string) => Promise<boolean>
  }
  keszVan: (bookingId: string, felirat: string) => Promise<FinishPreview | null>
  kerdez: (k: KerdesBeallitas) => Promise<boolean>
  allapot: (cel: BookingStatus) => Promise<void>
  keszUtan: (e: FinishPreview) => void | Promise<void>
  hiba: (uzenet: string) => void
}): Promise<void> {
  try {
    if (o.igazolo && o.cel === 'COMPLETED' && !(await o.kapu.atadhato(o.bookingId))) return
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
      await o.kapu.alairat(o.bookingId, ALAIRAS_KERES)
    } catch (e) {
      o.hiba(hibaSzoveg(e))
    }
  }
}
