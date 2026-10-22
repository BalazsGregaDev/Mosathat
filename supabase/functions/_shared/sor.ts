import { keszLevel, visszaigazolasLevel } from './sablon.ts'
import { foglalasLink } from './token.ts'
import type { KuldesEredmeny, Level, SorTetel, Uzlet } from './tipusok.ts'

export interface SorFuggosegek {
  atvesz(): Promise<SorTetel[]>
  eredmeny(id: string, ok: boolean, szolgaltatoId: string | null, hiba: string | null): Promise<void>
  kuld(level: Level): Promise<string>
  oldalAlap: string
  uzlet: Uzlet
}

export function levelKeszit(t: SorTetel, oldalAlap: string, uzlet: Uzlet): Level {
  if (!t.link) throw new Error('A foglalás már nem létezik.')
  const link = foglalasLink(oldalAlap, t.link)
  const opciok = { nyelv: t.nyelv, ceges: t.oldal?.ceges === true }
  if (t.kind === 'CAR_READY') return keszLevel(t.to, t.oldal, link, uzlet, opciok)
  if (!t.lemondas.foglalas) throw new Error('A foglalás már nem létezik.')
  return visszaigazolasLevel(t.to, t.lemondas, link, uzlet, opciok)
}

export async function sorFeldolgozas(f: SorFuggosegek): Promise<KuldesEredmeny> {
  const ki: KuldesEredmeny = { kuldve: 0, hibas: 0, hibak: [] }
  for (const t of await f.atvesz()) {
    try {
      const azon = await f.kuld(levelKeszit(t, f.oldalAlap, f.uzlet))
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
