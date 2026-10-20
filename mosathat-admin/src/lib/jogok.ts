import type { StaffRole } from './types'

const FOGLALAS_PROBA_FIOKOK = ['hegedusgabor@mosathat.hu']

export function foglalasModulLatja(u: { role: StaffRole; email: string | null } | null): boolean {
  if (!u) return false
  if (u.role === 'SUPERADMIN' || u.role === 'TULAJDONOS') return true
  return FOGLALAS_PROBA_FIOKOK.includes((u.email ?? '').trim().toLowerCase())
}
