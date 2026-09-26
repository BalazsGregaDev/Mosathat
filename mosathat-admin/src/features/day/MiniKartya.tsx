import { idosav, ora } from '../../lib/format'
import { STATUS_LABEL, type DayBooking } from '../../lib/types'

// ---------------------------------------------------------------------------
//  Kis kártya a heti és a havi nézethez
//
//  Egy komponens, két helyen. Nem azért, hogy kevesebb kódot írjunk, hanem
//  azért, hogy a heti és a havi nézet ugyanazt mondja ugyanarról a
//  foglalásról. Két külön kártya előbb-utóbb eltérne egymástól, és a
//  különbséget senki nem venné észre, amíg egyszer nem számít.
//
//  Amit mutat: a rendszám, és hogy mettől meddig. Semmi mást — ebben a
//  méretben minden további adat csak zsúfolttá tenné, a részletekért úgyis
//  meg kell nyitni.
// ---------------------------------------------------------------------------

/**
 * Mettől meddig. Foglalástípusonként más:
 *   VAROS       – konkrét kezdés, és a munka hossza adja a végét
 *   LEADOS      – amikor hozza és amikor viszi
 *   TOBBNAPOS   – napokig áll nálunk, itt az óra nem mond semmit
 */
export function idoSzoveg(b: DayBooking): string {
  if (b.booking_type === 'TOBBNAPOS') {
    return b.deadline_at ? `${b.deadline_at.slice(8, 10)}-ig` : 'több napos'
  }

  // Leadósnál a hozza–viszi a lényeg, ha meg van beszélve.
  if (b.drop_off_at && b.pick_up_at) {
    return `${ora(b.drop_off_at)} – ${ora(b.pick_up_at)}`
  }

  // Egyébként az induláshoz a munka hossza adja a végét. A kezdés bármelyik
  // mezőben lehet: a típus nem dönti el egyedül, hogy melyik van kitöltve —
  // ezért azt nézzük, ami VAN, nem azt, aminek lennie kellene.
  const kezdes = b.start_at ?? b.drop_off_at
  if (kezdes) {
    return b.planned_duration_minutes > 0
      ? idosav(kezdes, b.planned_duration_minutes)
      : ora(kezdes)
  }
  return '—'
}

/**
 * Rövid idő a havi naptárba: csak a kezdés. Egy hónapnyi cellában a
 * befejezés nem mond annyit, hogy megérje elvennie a helyet a rendszámtól —
 * ott az a kérdés, MIKOR jön, nem az, hogy meddig tart.
 */
export function idoRovidSzoveg(b: DayBooking): string {
  if (b.booking_type === 'TOBBNAPOS') {
    return b.deadline_at ? `${b.deadline_at.slice(8, 10)}-ig` : 'több nap'
  }
  const kezdes = b.start_at ?? b.drop_off_at
  return kezdes ? ora(kezdes) : '—'
}

/**
 * A rendszám az azonosító. Ha valamiért nincs (telefonon felvett foglalás,
 * ahol még nem tudták), akkor a név — mert üres kártyát mutatni értelmetlen.
 */
export function azonosito(b: DayBooking): string {
  const r = (b.plate_raw ?? '').trim()
  if (r) return r
  return b.company_name || b.customer_name || 'névtelen'
}

export default function MiniKartya({ b, onMegnyit, egysoros }: {
  b: DayBooking
  /**
   * Ha hiányzik, a kártya nem gomb, hanem szöveg. A havi naptárban ez a
   * helyzet: ott az EGÉSZ cella visz a napra, és egy tíz pixeles sorból
   * munkalapot nyitni úgyis félrekattintás lenne.
   */
  onMegnyit?: (id: string) => void
  /** Havi nézetben egy sorba fér: idő és rendszám egymás mellett. */
  egysoros?: boolean
}) {
  const rendszamE = Boolean((b.plate_raw ?? '').trim())
  // A teljes idősáv a buboréksúgóban mindig megmarad, akkor is, ha a
  // kártyán csak a kezdés fér el.
  const cim = `${azonosito(b)} · ${idoSzoveg(b)} · ${STATUS_LABEL[b.status]}`
  const tartalom = (
    <>
      <span className={rendszamE ? 'azon rendszam' : 'azon nev'}>{azonosito(b)}</span>
      <span className="ido">{egysoros ? idoRovidSzoveg(b) : idoSzoveg(b)}</span>
    </>
  )

  if (!onMegnyit) {
    return (
      <span className={`minikartya statikus${egysoros ? ' egysoros' : ''}`}
            data-a={b.status} title={cim}>
        {tartalom}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={`minikartya${egysoros ? ' egysoros' : ''}`}
      data-a={b.status}
      onClick={(e) => { e.stopPropagation(); onMegnyit(b.id) }}
      title={cim}
    >
      {tartalom}
    </button>
  )
}
