import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
//  Élő frissítés — egy közös csatorna az egész alkalmazásnak
//
//  MIT OLD MEG
//
//  Ha a telefonon átírnak egy foglalást (Start → Premium), a tableten nyitva
//  hagyott napi nézetnek is át kell váltania — oldalfrissítés nélkül.
//
//  HOGYAN, KEVÉS ADATTAL
//
//  1. Realtime (WebSocket): a Supabase szól, ha a figyelt táblák bármelyik
//     sora változik. Az üzenet pár száz bájt. Nem az üzenet tartalmát
//     használjuk, csak jelzésnek: „valami változott, tölts újra".
//
//  2. Összevonás: egy mentés több táblát is érint (foglalás, tételek,
//     munkalista, sorrend) — ez 5-10 jelzés egyszerre. Ezeket 400 ms-ig
//     gyűjtjük, és EGY újratöltés lesz belőlük, nem tíz.
//
//  3. Ébredés: ha a tablet aludt (vagy a lap a háttérben volt), a WebSocket
//     közben megszakadhatott, és a belépés tokenje is lejárhatott. Ezért
//     amikor a lap újra látható lesz (vagy visszajön a net):
//       - frissítjük a belépést (új token),
//       - újranyitjuk a csatornát (az új tokennel),
//       - és egyszer újratöltünk — hátha közben változott valami, amiről a
//         megszakadt kapcsolat miatt nem kaptunk jelzést.
//
//  4. Biztonsági háló: ha a Realtime valamiért nem működik (pl. nincs
//     bekapcsolva egy táblán), 5 percenként akkor is újratöltünk — de csak
//     amíg a lap LÁTHATÓ. Háttérben, alvó tableten nincs forgalom.
//
//  Egy napi újratöltés néhány tíz kilobájt; 5 percenként egy munkanap alatt
//  pár megabájt. A Realtime jelzései ennél is kevesebbek.
//
//  EGY CSATORNA
//
//  Régen minden nézet (napi, heti, havi, igazolólap, áttekintés) saját
//  csatornát nyitott. Most egy van: a nézetek csak „feliratkoznak" rá, és
//  a csatorna akkor nyílik meg, amikor az első feliratkozó megjön, és akkor
//  zárul be, amikor az utolsó elmegy.
// ---------------------------------------------------------------------------

/** A figyelt táblák. Ami ezekben változik, az a képernyőn látszik. */
const TABLAK = [
  'bookings',            // a foglalás maga (állapot, ár, csomag, idő)
  'booking_items',       // a tételei (csomag, extrák)
  'booking_tasks',       // a munkalista pipái
  'day_order',           // a nap kézi sorrendje
  'staff_absences',      // munkaidő-változások (kapacitás)
  'staff_vacations',     // szabadságok (kapacitás, napi kártya, havi naptár)
  'customers',           // ügyfél neve, telefonja, cége
  'vehicles',            // rendszám, márka, méret
  'company_sheet_rows',  // igazolólap sorai (aláírás)
  'company_sheets',      // igazolólap (lezárás)
] as const

/** Ennyi ideig gyűjtjük a jelzéseket egy újratöltés előtt. */
const OSSZEVONAS_MS = 400
/** Biztonsági újratöltés (csak amíg a lap látható). */
const BIZTONSAGI_MS = 5 * 60_000
/** Ha legalább ennyi ideig volt a háttérben, ébredéskor újranyitjuk a csatornát. */
const ALVAS_MS = 30_000
/** Az utolsó leiratkozás után ennyit várunk a csatorna bezárásával. */
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

  /** Feliratkozás: a `figyelo` hívódik, ha valami változott. A visszaadott
   *  függvény leiratkoztat. */
  feliratkoz(figyelo: () => void): () => void {
    this.figyelok.add(figyelo)
    // Ha épp zárni készültünk (lásd lent), maradunk nyitva.
    if (this.zaroIdozito) { clearTimeout(this.zaroIdozito); this.zaroIdozito = null }
    if (this.figyelok.size === 1 && !this.fut) this.indit()
    return () => {
      this.figyelok.delete(figyelo)
      if (this.figyelok.size > 0 || this.zaroIdozito) return
      // Nézetváltáskor (napi → heti) az egyik nézet leiratkozik, a másik
      // rögtön feliratkozik. Hogy ne zárjuk be és nyissuk újra a csatornát
      // minden kattintásra, a zárás pár másodpercet vár.
      this.zaroIdozito = setTimeout(() => {
        this.zaroIdozito = null
        if (this.figyelok.size === 0) this.leallit()
      }, ZARAS_MS)
    }
  }

  // --- jelzés → (összevonva) egy újratöltés ----------------------------------

  private jelez = () => {
    if (this.idozito) clearTimeout(this.idozito)
    this.idozito = setTimeout(() => {
      this.idozito = null
      for (const f of this.figyelok) f()
    }, OSSZEVONAS_MS)
  }

  // --- indítás, leállítás -------------------------------------------------------

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

  // --- a csatorna ------------------------------------------------------------------

  private csatornaNyit() {
    // Minden nyitás új nevet kap: ugyanazzal a névvel a kliens a régi
    // (lezárt) csatornát adná vissza.
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
    if (this.csatorna) void this.sb.removeChannel(this.csatorna)
    this.csatorna = null
  }

  // --- ébredés -----------------------------------------------------------------------

  private lathatosag = () => {
    if (document.visibilityState === 'hidden') {
      this.rejtveOta = Date.now()
      return
    }
    this.ebredHaKell()
  }

  /** Csak ha tényleg a háttérben volt — egy sima kattintás (focus) ne töltsön újra. */
  private ebredHaKell = () => {
    if (this.rejtveOta === null) return
    const meddig = Date.now() - this.rejtveOta
    this.rejtveOta = null
    if (meddig >= ALVAS_MS) void this.ebred()
    else this.jelez()
  }

  /** Új token, új csatorna, egy újratöltés. */
  private ebred = async () => {
    try {
      // A getSession lejárt token esetén magától frissít. Ha a frissítés
      // nem sikerül (pl. nincs még net), a következő ébredés újra próbálja.
      await this.sb.auth.getSession()
    } catch {
      /* a lekérdezések maguk is újrapróbálnak (lásd tokenFetch) */
    }
    if (this.figyelok.size === 0) return
    this.csatornaZar()
    this.csatornaNyit()
    this.biztonsagiIndit()
    this.jelez()
  }
}
