import type { DataSource } from './source'

function tiszta(v: string | undefined): string {
  return (v ?? '').replace(/\s+/g, '')
}

export async function createDataSource(): Promise<DataSource> {
  const mode = (import.meta.env.VITE_DATA_SOURCE ?? 'demo').trim().toLowerCase()
  if (mode !== 'supabase' && mode !== 'demo') {
    throw new Error(`Ismeretlen VITE_DATA_SOURCE érték: „${mode}". Lehetséges: demo vagy supabase.`)
  }

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
