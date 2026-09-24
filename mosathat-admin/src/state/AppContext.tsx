import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { createDataSource } from '../data'
import type { Catalog, DataSource, SessionUser } from '../data'

// ---------------------------------------------------------------------------
//  Az alkalmazás közös állapota: adatforrás, bejelentkezett dolgozó, katalógus.
//
//  A katalógus (csomagok, árak, extrák) egyszer töltődik be, mert ritkán
//  változik, és a foglalási űrlap minden kattintásnál hozzányúl.
// ---------------------------------------------------------------------------

interface AppValue {
  data: DataSource
  user: SessionUser | null
  catalog: Catalog | null
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  /** Számláló: ha nő, a nap újratöltődik. Mentés után ezt kell hívni. */
  revision: number
  refresh(): void
}

const Ctx = createContext<AppValue | null>(null)

// ---------------------------------------------------------------------------
//  Az adatforrás CSAK EGYSZER jöhet létre.
//
//  React fejlesztői módban (StrictMode) minden effekt kétszer fut le — ez
//  szándékos, így derülnek ki a rosszul megírt effektek. Itt viszont ez azt
//  jelentené, hogy KÉT PostgreSQL indul el a böngészőben, és mindkettő
//  ugyanazt a WASM fájlt próbálja betölteni. Ilyenkor az egyik elhasal
//  ezzel: "Cannot compile WebAssembly.Module from an already read Response",
//  és az alkalmazás beragad az "Adatbázis indítása…" feliratnál.
//
//  A megoldás: az indítást egyetlen ígéretben (Promise) tároljuk modulszinten.
//  A második hívás ugyanazt az ígéretet kapja vissza, új adatbázis nem indul.
//  Élesben ez nem fordulna elő, de a fejlesztés közbeni véletlenszerű
//  beragadás pont olyan hiba, amit senki nem tud megismételni.
// ---------------------------------------------------------------------------

let indulas: Promise<DataSource> | null = null

function adatforras(): Promise<DataSource> {
  if (!indulas) {
    indulas = (async () => {
      const ds = await createDataSource()
      await ds.init()
      return ds
    })().catch((e) => {
      indulas = null // hiba esetén legyen újrapróbálható
      throw e
    })
  }
  return indulas
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataSource | null>(null)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let el = true
    ;(async () => {
      try {
        const ds = await adatforras()
        if (!el) return
        const u = await ds.currentUser()
        if (!el) return
        setUser(u)
        if (u) setCatalog(await ds.getCatalog())
        if (el) setData(ds)
      } catch (e) {
        if (el) setHiba(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      el = false
    }
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!data) return
      const u = await data.signIn(email, password)
      setUser(u)
      setCatalog(await data.getCatalog())
    },
    [data],
  )

  const signOut = useCallback(async () => {
    if (!data) return
    await data.signOut()
    setUser(null)
    setCatalog(null)
  }, [data])

  const refresh = useCallback(() => setRevision((r) => r + 1), [])

  const value = useMemo<AppValue | null>(
    () => (data ? { data, user, catalog, signIn, signOut, revision, refresh } : null),
    [data, user, catalog, signIn, signOut, revision, refresh],
  )

  if (hiba) {
    return (
      <div style={{ maxWidth: 560, margin: '18vh auto', padding: 24 }}>
        <div className="hibauzenet">{hiba}</div>
      </div>
    )
  }

  if (!value) {
    return (
      <div className="betolt" style={{ paddingTop: '22vh' }}>
        Adatbázis indítása…
      </div>
    )
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp csak AppProvider-en belül használható.')
  return v
}

/** A katalógus akkor kell, amikor már biztosan betöltött. */
export function useCatalog(): Catalog {
  const { catalog } = useApp()
  if (!catalog) throw new Error('A katalógus még nem töltött be.')
  return catalog
}
