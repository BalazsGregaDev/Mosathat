import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { createDataSource } from '../data'
import { hibaSzoveg } from '../lib/format'
import type { Catalog, DataSource, SessionUser } from '../data'

interface AppValue {
  data: DataSource
  user: SessionUser | null
  catalog: Catalog | null
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  refresh(): void
  refreshUser(): Promise<void>
  refreshCatalog(): Promise<void>
}

const Ctx = createContext<AppValue | null>(null)
const RevCtx = createContext(0)

let indulas: Promise<DataSource> | null = null

function adatforras(): Promise<DataSource> {
  if (!indulas) {
    indulas = (async () => {
      const ds = await createDataSource()
      await ds.init()
      return ds
    })().catch((e) => {
      indulas = null
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
        const c = u ? await ds.getCatalog() : null
        if (!el) return
        setCatalog(c)
        setUser(u)
        setData(ds)
      } catch (e) {
        if (el) setHiba(hibaSzoveg(e))
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
      const c = await data.getCatalog()
      setCatalog(c)
      setUser(u)
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

  const refreshUser = useCallback(async () => {
    if (!data) return
    setUser(await data.currentUser())
  }, [data])

  const refreshCatalog = useCallback(async () => {
    if (!data) return
    setCatalog(await data.getCatalog())
  }, [data])

  const value = useMemo<AppValue | null>(
    () => (data
      ? { data, user, catalog, signIn, signOut, refresh, refreshUser, refreshCatalog }
      : null),
    [data, user, catalog, signIn, signOut, refresh, refreshUser, refreshCatalog],
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

  return (
    <Ctx.Provider value={value}>
      <RevCtx.Provider value={revision}>{children}</RevCtx.Provider>
    </Ctx.Provider>
  )
}

export function useRevizio(): number {
  return useContext(RevCtx)
}

export function useApp(): AppValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp csak AppProvider-en belül használható.')
  return v
}

export function useCatalog(): Catalog {
  const { catalog } = useApp()
  if (!catalog) throw new Error('A katalógus még nem töltött be.')
  return catalog
}
