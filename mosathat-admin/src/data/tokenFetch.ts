import type { SupabaseClient } from '@supabase/supabase-js'

export function tokenFetch(kliens: () => SupabaseClient): typeof fetch {
  let folyamatban: Promise<string | null> | null = null
  const ujToken = () => {
    folyamatban ??= kliens().auth.refreshSession()
      .then(({ data }) => data.session?.access_token ?? null)
      .catch(() => null)
      .finally(() => { setTimeout(() => { folyamatban = null }, 1000) })
    return folyamatban
  }

  return async (input, init) => {
    const valasz = await fetch(input, init)
    if (valasz.status !== 401) return valasz

    const cim = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (cim.includes('/auth/v1/')) return valasz

    const szoveg = await valasz.clone().text().catch(() => '')
    if (!/jwt|PGRST30/i.test(szoveg)) return valasz

    const token = await ujToken()
    if (!token) return valasz

    const fejlec = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    fejlec.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers: fejlec })
  }
}
