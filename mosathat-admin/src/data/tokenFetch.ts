import type { SupabaseClient } from '@supabase/supabase-js'

const OLVASO_RPC = new Set([
  'absence_list', 'booking_finish_preview', 'csomag_szerkeszto', 'publikus_oldal', 'velemenyek_lista', 'gyik_lista', 'publikus_nap', 'publikus_ajanlat', 'publikus_jogi', 'ceg_linkek', 'ceg_link_adat', 'ceg_ajanlat', 'ceg_teli_napok', 'foglalasom', 'modositasi_kerelmek', 'jogi_valtozatok', 'jogi_valtozat_fajl', 'booking_form_data', 'can_edit_customers', 'ceg_jeloltek',
  'dashboard_summary', 'day_absences', 'day_bookings', 'day_capacity', 'day_lanes', 'latest_start',
  'list_companies', 'list_customers', 'list_role_permissions', 'list_staff', 'list_vehicles',
  'quote_booking', 'range_order', 'search_companies', 'search_customers', 'sheet_cegek', 'sheet_detail',
  'sheet_for_booking', 'start_perc', 'szerzodes_flottas', 'vacation_list', 'vacations_range',
  'week_capacity', 'work_windows',
])

export const UJRA_VARAKOZAS_MS = [500, 1500, 3500]

function cimE(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

export function ujraprobalhato(cim: string, modszer: string): boolean {
  const m = modszer.toUpperCase()
  if (m === 'GET' || m === 'HEAD') return !cim.includes('/auth/v1/')
  const rpc = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(cim)
  return m === 'POST' && rpc !== null && OLVASO_RPC.has(rpc[1])
}

function varj(ms: number, jel?: AbortSignal | null): Promise<void> {
  return new Promise((kesz) => {
    const t = setTimeout(kesz, ms)
    jel?.addEventListener('abort', () => { clearTimeout(t); kesz() }, { once: true })
  })
}

export function kitartoFetch(alap: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return async (input, init) => {
    const modszer = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const lehet = ujraprobalhato(cimE(input), modszer)
    for (let i = 0; ; i++) {
      try {
        return await alap(input, init)
      } catch (e) {
        const halozati = e instanceof TypeError
        if (!halozati || !lehet || i >= UJRA_VARAKOZAS_MS.length || init?.signal?.aborted) throw e
        await varj(UJRA_VARAKOZAS_MS[i], init?.signal)
        if (init?.signal?.aborted) throw e
      }
    }
  }
}

export function tokenFetch(kliens: () => SupabaseClient, alap: typeof fetch = kitartoFetch()): typeof fetch {
  let folyamatban: Promise<string | null> | null = null
  const ujToken = () => {
    folyamatban ??= kliens().auth.refreshSession()
      .then(({ data }) => data.session?.access_token ?? null)
      .catch(() => null)
      .finally(() => { setTimeout(() => { folyamatban = null }, 1000) })
    return folyamatban
  }

  return async (input, init) => {
    const valasz = await alap(input, init)
    if (valasz.status !== 401) return valasz

    const cim = cimE(input)
    if (cim.includes('/auth/v1/')) return valasz

    const szoveg = await valasz.clone().text().catch(() => '')
    if (!/jwt|PGRST30/i.test(szoveg)) return valasz

    const token = await ujToken()
    if (!token) return valasz

    const fejlec = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    fejlec.set('Authorization', `Bearer ${token}`)
    return alap(input, { ...init, headers: fejlec })
  }
}
