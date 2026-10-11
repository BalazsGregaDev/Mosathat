import { visszaigazolasLevel } from './sablon.ts'
import { lemondoLink } from './token.ts'
import type { KuldesEredmeny, Level, SorTetel, Uzlet } from './tipusok.ts'

export interface SorFuggosegek {
  atvesz(): Promise<SorTetel[]>
  linkMentes(foglalasId: string, token: string): Promise<void>
  eredmeny(id: string, ok: boolean, szolgaltatoId: string | null, hiba: string | null): Promise<void>
  kuld(level: Level): Promise<string>
  ujToken(): string
  lemondasAlap: string
  uzlet: Uzlet
}

export async function sorFeldolgozas(f: SorFuggosegek): Promise<KuldesEredmeny> {
  const ki: KuldesEredmeny = { kuldve: 0, hibas: 0, hibak: [] }
  for (const t of await f.atvesz()) {
    try {
      const foglalas = t.lemondas.foglalas
      if (!foglalas) throw new Error('A foglalás már nem létezik.')
      const token = f.ujToken()
      await f.linkMentes(foglalas.id, token)
      const level = visszaigazolasLevel(t.to, t.lemondas, lemondoLink(f.lemondasAlap, token), f.uzlet)
      const azon = await f.kuld(level)
      await f.eredmeny(t.id, true, azon, null)
      ki.kuldve++
    } catch (e) {
      const uzenet = e instanceof Error ? e.message : String(e)
      await f.eredmeny(t.id, false, null, uzenet).catch(() => undefined)
      ki.hibas++
      ki.hibak.push(`${t.to}: ${uzenet}`)
    }
  }
  return ki
}
