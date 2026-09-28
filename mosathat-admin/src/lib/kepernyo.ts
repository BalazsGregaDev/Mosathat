// ---------------------------------------------------------------------------
//  Ujj vagy egér?
//
//  Nem minden „kényelmi" megoldás kényelmes telefonon. A legjellemzőbb: egy
//  megnyíló űrlapnál egérrel jó, ha a kurzor rögtön az első mezőben van —
//  ujjal viszont ez felhozza a billentyűzetet, a böngésző pedig magától
//  odagörget. A lista elugrik az ujj alól, és amíg a billentyűzet animációja
//  tart, egyáltalán nem lehet rendesen görgetni: felfelé nem enged a lista
//  tetejéig, lefelé viszont van üres hely a billentyűzet helyén.
//
//  Ezért nem a képernyő SZÉLESSÉGÉT nézzük (egy kis böngészőablak nem
//  telefon), hanem a mutatóeszközt.
// ---------------------------------------------------------------------------

/** Igaz, ha ujjal kezelt képernyő: telefon, tablet, érintős laptop. */
export function erintokepernyo(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
}

/**
 * Egy most megnyílt űrlap első mezője.
 *
 * Egérrel: kurzor a mezőbe, lehet gépelni.
 * Ujjal:   csak annyi, hogy az űrlap látszódjon — a billentyűzet akkor jön
 *          fel, amikor a felhasználó tényleg belekoppint egy mezőbe.
 */
export function urlapMegnyilt(mezo: HTMLElement | null): void {
  if (!mezo) return
  if (!erintokepernyo()) {
    mezo.focus()
    return
  }
  // A `nearest` csak annyit görget, amennyi kell. A sima (nem „smooth")
  // görgetés szándékos: a lassított mozgás közben az ujjal indított görgetés
  // összeakad vele.
  mezo.scrollIntoView({ block: 'nearest' })
}

/**
 * A billentyűzet után visszateszi a lapot a helyére.
 *
 * iPhone-on a képernyő-billentyűzet feljövetelekor a böngésző magát a LAPOT
 * görgeti el, hogy a beviteli mező a billentyűzet fölé kerüljön. Ilyenkor az
 * alkalmazás fejléce kicsúszik a kép tetejéről — és a billentyűzet bezárása
 * után is elcsúszva marad. Ez után nem lehet teljesen felgörgetni, alul
 * viszont üres hely marad; pár másodperc múlva néha magától helyreáll, néha
 * nem.
 *
 * Amikor a látható terület visszanő (vagyis a billentyűzet eltűnt),
 * visszaküldjük a lapot a tetejére. A tűrés azért kell, mert a böngésző
 * címsora is változtatja a magasságot, az viszont nem billentyűzet.
 */
export function billentyuzetHelyreallitas(): void {
  const nezet = window.visualViewport
  if (!nezet) return

  let legnagyobb = nezet.height
  nezet.addEventListener('resize', () => {
    legnagyobb = Math.max(legnagyobb, nezet.height)
    if (nezet.height >= legnagyobb - 40 && window.scrollY !== 0) {
      window.scrollTo(0, 0)
    }
  })
}
