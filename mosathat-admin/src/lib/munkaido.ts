import type { Absence, AbsenceKind } from './types'

// ---------------------------------------------------------------------------
//  Munkaidő-változások szövegei — egy helyen, hogy a Profilom és a napi
//  kártya ugyanazt mondja ugyanarról.
// ---------------------------------------------------------------------------

/** A választó gombjai: mi változik. */
export const VALTOZAS_FAJTAK: { kind: AbsenceKind; cimke: string }[] = [
  { kind: 'KESOBB_ERKEZIK', cimke: 'Később érkezik' },
  { kind: 'KORABBAN_TAVOZIK', cimke: 'Korábban megy el' },
  { kind: 'TAVOL', cimke: 'Napközben távol' },
  { kind: 'EGESZ_NAP', cimke: 'Egész nap nincs bent' },
]

/** „16:00-ig van bent" — egy munkaidő-változás egy sorban. */
export function valtozasSzoveg(a: Pick<Absence, 'kind' | 'starts' | 'ends'>): string {
  switch (a.kind) {
    case 'KESOBB_ERKEZIK':   return `${a.ends}-tól van bent`
    case 'KORABBAN_TAVOZIK': return `${a.starts}-ig van bent`
    case 'TAVOL':            return `${a.starts}–${a.ends} között nincs bent`
    case 'EGESZ_NAP':        return 'egész nap nincs bent'
  }
}
