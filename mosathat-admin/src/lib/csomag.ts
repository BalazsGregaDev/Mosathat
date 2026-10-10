import type { BookingScope, Extra } from './types'

export function csomagbanBenne(
  e: Pick<Extra, 'area' | 'included_in_packages' | 'included_in_full_service'>,
  csomagId: string | null,
  terjedelem: BookingScope,
  fullService: boolean,
): boolean {
  if (fullService && e.included_in_full_service) return true
  if (!csomagId || !e.included_in_packages.includes(csomagId)) return false
  return terjedelem === 'TELJES' || e.area === null || e.area === terjedelem
}
