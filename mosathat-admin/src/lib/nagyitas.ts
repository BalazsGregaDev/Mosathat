export function nagyitasTiltas(): void {
  for (const nev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(nev, (e) => e.preventDefault(), { passive: false })
  }
}
