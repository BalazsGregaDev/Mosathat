// ---------------------------------------------------------------------------
//  A csippentéses nagyítás kikapcsolása
//
//  Miért kell egyáltalán: nagyított nézetben a böngésző egy kisebb kivágaton
//  át mutatja a lapot. Az ujjmozdulat onnantól ezt a KIVÁGATOT tologatja, nem
//  a listát görgeti — ezért lehet a képet oldalra elhúzni (és nem áll
//  vissza), és ezért „fagy be" a munkalap görgetése. Kizoomolás után magától
//  újra működik.
//
//  Három helyen van letiltva, mert három böngészőcsalád máshogy kezeli:
//
//    index.html  user-scalable=no   — Android böngészők ezt elfogadják
//    base.css    touch-action        — a szabvány szerinti mód (iOS 13-tól is)
//    ez a fájl   gesture* események  — a régebbi iPhone Safari csak ezt érti
//
//  Amit NEM kapcsolunk ki: a görgetést, a koppintást és a hosszú nyomást.
//  Csak a nagyítást.
// ---------------------------------------------------------------------------

export function nagyitasTiltas(): void {
  // A régebbi iPhone Safari a `user-scalable=no`-t iOS 10 óta szándékosan
  // nem veszi figyelembe, és a touch-action-t sem ismeri. Ott a nagyításnak
  // saját eseményei vannak: ha a kezdetét elfogjuk, el sem indul.
  for (const nev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(nev, (e) => e.preventDefault(), { passive: false })
  }
}
