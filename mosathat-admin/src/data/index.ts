import type { DataSource } from './source'

// Egyetlen env változó dönti el, honnan jön az adat. A felület kódjából
// semmi nem tud arról, hogy melyik fut.
//
// A betöltés szándékosan dinamikus: a PGlite (a böngészőben futó Postgres)
// 13 MB. Éles módban erre nincs szükség, és a dinamikus import miatt a
// böngésző le sem tölti — külön chunkba kerül, amit csak a demó kér be.

/**
 * A környezeti értékből minden szóközt és sortörést kiszedünk.
 *
 * Nem elvi tisztogatás: a Vercel felületére bemásolt kulcs végére odakerült
 * egy sortörés, és onnantól a valós idejű kapcsolat némán nem épült fel —
 * a böngésző konzolja végtelen ciklusban próbálkozott. A címben a hiba
 * `%0A`-ként látszott a kulcs végén, ami egy kódolt sortörés.
 *
 * Se az URL, se a JWT nem tartalmazhat szóközt, tehát ez mindig biztonságos:
 * nem tud elrontani egy helyes értéket, viszont megjavít egy elgépeltet.
 */
function tiszta(v: string | undefined): string {
  return (v ?? '').replace(/\s+/g, '')
}

export async function createDataSource(): Promise<DataSource> {
  const mode = (import.meta.env.VITE_DATA_SOURCE ?? 'demo').trim()

  if (mode === 'supabase') {
    const url = tiszta(import.meta.env.VITE_SUPABASE_URL)
    const key = tiszta(import.meta.env.VITE_SUPABASE_ANON_KEY)
    if (!url || !key) {
      throw new Error(
        'VITE_DATA_SOURCE=supabase, de hiányzik a VITE_SUPABASE_URL vagy a VITE_SUPABASE_ANON_KEY. ' +
          'Másold le a .env.example fájlt .env néven, és töltsd ki.',
      )
    }
    const { SupabaseSource } = await import('./supabase')
    return new SupabaseSource(url, key)
  }

  const { DemoSource } = await import('./demo')
  return new DemoSource()
}

export type { DataSource, Catalog, KeresesMezo, SessionUser } from './source'
