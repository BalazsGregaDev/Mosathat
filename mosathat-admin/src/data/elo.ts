import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

const TABLAK = [
  'bookings',
  'booking_items',
  'booking_tasks',
  'day_order',
  'staff_absences',
  'staff_vacations',
  'customers',
  'vehicles',
  'company_sheet_rows',
  'company_sheets',
] as const

const OSSZEVONAS_MS = 400
const BIZTONSAGI_MS = 5 * 60_000
const ALVAS_MS = 30_000
const ZARAS_MS = 3_000

export class EloFrissites {
  private figyelok = new Set<() => void>()
  private csatorna: RealtimeChannel | null = null
  private csatornaSzam = 0
  private idozito: ReturnType<typeof setTimeout> | null = null
  private biztonsagi: ReturnType<typeof setInterval> | null = null
  private rejtveOta: number | null = null
  private hibaKiirva = false
  private fut = false
  private zaroIdozito: ReturnType<typeof setTimeout> | null = null
  private readonly sb: SupabaseClient

  constructor(sb: SupabaseClient) {
    this.sb = sb
  }

  feliratkoz(figyelo: () => void): () => void {
    this.figyelok.add(figyelo)
    if (this.zaroIdozito) { clearTimeout(this.zaroIdozito); this.zaroIdozito = null }
    if (this.figyelok.size === 1 && !this.fut) this.indit()
    return () => {
      this.figyelok.delete(figyelo)
      if (this.figyelok.size > 0 || this.zaroIdozito) return
      this.zaroIdozito = setTimeout(() => {
        this.zaroIdozito = null
        if (this.figyelok.size === 0) this.leallit()
      }, ZARAS_MS)
    }
  }

  private jelez = () => {
    if (this.idozito) clearTimeout(this.idozito)
    this.idozito = setTimeout(() => {
      this.idozito = null
      for (const f of this.figyelok) f()
    }, OSSZEVONAS_MS)
  }

  private indit() {
    this.fut = true
    this.csatornaNyit()
    document.addEventListener('visibilitychange', this.lathatosag)
    window.addEventListener('online', this.ebred)
    window.addEventListener('focus', this.ebredHaKell)
    this.biztonsagiIndit()
  }

  private leallit() {
    this.fut = false
    this.csatornaZar()
    document.removeEventListener('visibilitychange', this.lathatosag)
    window.removeEventListener('online', this.ebred)
    window.removeEventListener('focus', this.ebredHaKell)
    if (this.biztonsagi) clearInterval(this.biztonsagi)
    this.biztonsagi = null
    if (this.idozito) clearTimeout(this.idozito)
    this.idozito = null
  }

  private biztonsagiIndit() {
    if (this.biztonsagi) clearInterval(this.biztonsagi)
    this.biztonsagi = setInterval(() => {
      if (document.visibilityState === 'visible') this.jelez()
    }, BIZTONSAGI_MS)
  }

  private csatornaNyit() {
    let cs = this.sb.channel(`mosathat-elo-${++this.csatornaSzam}`)
    for (const t of TABLAK) {
      cs = cs.on('postgres_changes', { event: '*', schema: 'public', table: t }, this.jelez)
    }
    this.csatorna = cs.subscribe((allapot) => {
      if (allapot === 'SUBSCRIBED') { this.hibaKiirva = false; return }
      if (allapot !== 'CHANNEL_ERROR' && allapot !== 'TIMED_OUT') return
      if (this.hibaKiirva) return
      this.hibaKiirva = true
      console.warn(
        '[Mosathat] A valós idejű frissítés most nem él.\n'
        + 'Ez NEM töri el a rendszert: 5 percenként, és minden alkalommal, '
        + 'amikor a lap újra előtérbe kerül, magától újratölt.\n'
        + 'Ha tartósan így marad: Supabase → Database → Publications → '
        + 'supabase_realtime alatt legyenek bekapcsolva a foglalási táblák.',
      )
    })
  }

  private csatornaZar() {
    if (this.csatorna) this.sb.removeChannel(this.csatorna).catch(() => {})
    this.csatorna = null
  }

  private lathatosag = () => {
    if (document.visibilityState === 'hidden') {
      this.rejtveOta = Date.now()
      return
    }
    this.ebredHaKell()
  }

  private ebredHaKell = () => {
    if (this.rejtveOta === null) return
    const meddig = Date.now() - this.rejtveOta
    this.rejtveOta = null
    if (meddig >= ALVAS_MS) void this.ebred()
    else this.jelez()
  }

  private ebred = async () => {
    try {
      await this.sb.auth.getSession()
    } catch {
    }
    if (this.figyelok.size === 0) return
    this.csatornaZar()
    this.csatornaNyit()
    this.biztonsagiIndit()
    this.jelez()
  }
}
