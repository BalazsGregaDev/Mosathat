// ---------------------------------------------------------------------------
//  A képernyő-billentyűzet előhívása egy KÉSŐBB megjelenő mezőhöz
//
//  A helyzet: a „Figyelmet igényel" listában rákattintanak egy sorra („nincs
//  telefonszám"), erre megnyílik a munkalap, és a telefonszám mezőbe már
//  írni is lehet. A munkalap viszont csak egy pillanattal később jelenik meg
//  — előbb be kell tölteni a foglalást.
//
//  A gond: telefonon (főleg iPhone-on) a billentyűzet CSAK akkor jön fel, ha a
//  mező közvetlenül az ujjmozdulat hatására kap fókuszt. Ha a fókusz egy
//  betöltés után érkezik, a mező ki lesz jelölve, de billentyűzet nem lesz —
//  és akkor még egyszer bele kell bökni.
//
//  A megoldás: a kattintás pillanatában (még az ujjmozdulaton belül) egy
//  láthatatlan, ideiglenes mezőre tesszük a fókuszt. Erre feljön a
//  billentyűzet. Amikor a valódi mező megjelenik és megkapja a fókuszt, a
//  billentyűzet egyszerűen átvált rá — nem csukódik le közben. Utána az
//  ideiglenes mezőt eltávolítjuk.
//
//  Asztali gépen (egér) nincs képernyő-billentyűzet: ott nem csinál semmit.
// ---------------------------------------------------------------------------

let ideiglenes: HTMLInputElement | null = null
let idozito: number | undefined

/** A kattintás kezelőjében, AZONNAL kell hívni (nem await után). */
export function billentyuzetElore(mod: 'tel' | 'text' = 'tel'): void {
  if (!window.matchMedia?.('(pointer: coarse)').matches) return
  billentyuzetTakarit()

  const el = document.createElement('input')
  el.type = mod
  el.inputMode = mod
  el.setAttribute('aria-hidden', 'true')
  el.tabIndex = -1
  // A képernyőn van (különben egyes böngészők nem adnak neki fókuszt), de
  // nem látszik és nem lehet rákattintani. A 16 px-es betű azért kell, mert
  // iPhone-on a kisebb betűs mezőre fókuszálva ránagyít az oldalra.
  Object.assign(el.style, {
    position: 'fixed', top: '0', left: '0',
    width: '1px', height: '1px', opacity: '0',
    fontSize: '16px', border: '0', padding: '0',
    pointerEvents: 'none',
  })
  document.body.appendChild(el)
  el.focus()
  ideiglenes = el
  // Ha valamiért nem jön a valódi mező (hiba a betöltésnél), magától eltűnik.
  idozito = window.setTimeout(billentyuzetTakarit, 5000)
}

/** A valódi mező fókusza UTÁN hívandó: az ideiglenes mező eltűnik. */
export function billentyuzetTakarit(): void {
  window.clearTimeout(idozito)
  ideiglenes?.remove()
  ideiglenes = null
}
