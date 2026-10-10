import type { BookingScope, PackageMatrixRow } from './types'

export function nevKulcs(nev: string): string {
  return nev.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
}

export function csomagTetelei(
  sorok: PackageMatrixRow[],
  csomagId: string | null,
  terjedelem: BookingScope = 'TELJES',
): Set<string> {
  const ki = new Set<string>()
  if (!csomagId) return ki
  for (const r of sorok) {
    if (r.package_id !== csomagId) continue
    if (terjedelem !== 'TELJES' && r.area !== terjedelem) continue
    ki.add(nevKulcs(r.name))
    ki.add(nevKulcs(r.slot_name))
  }
  return ki
}

export function csomagbanBenne(nev: string, tetelek: Set<string>): boolean {
  return tetelek.has(nevKulcs(nev))
}
