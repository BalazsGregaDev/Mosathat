import { idosav, ora } from '../../lib/format'
import Kerdojel from './Kerdojel'
import { csoportNev, csoportOsszeg, HELYORZO, vanRendszam, vegsoIdo } from '../../lib/flotta'
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

/** Többnapos-e: a Viszi napja későbbi, mint a Hozzáé (a régi „Több napos" is). */
export function tobbnapos(b: DayBooking): boolean {
  return b.last_day.slice(0, 10) > b.service_date.slice(0, 10)
}

/** „okt. 6-ig" helyett rövidebben: „6-ig" — a hónap a naptárból látszik. */
function utolsoNapIg(b: DayBooking): string {
  return `${Number(b.last_day.slice(8, 10))}-ig`
}

/**
 * Mettől meddig. Foglalástípusonként más:
 *   megvárja     – konkrét kezdés, és a munka hossza adja a végét
 *   itt hagyja   – amikor hozza és amikor viszi
 *   többnapos    – napokig áll nálunk: az utolsó nap számít („6-ig")
 */
export function idoSzoveg(b: DayBooking): string {
  // Flottás autó: csak a végső időpont van („17:00-ig").
  if (b.fleet_group && !tobbnapos(b)) return vegsoIdo(b)
  if (tobbnapos(b)) {
    const viszi = b.pick_up_at ?? b.deadline_at
    return viszi ? `${utolsoNapIg(b)}, ${ora(viszi)}` : utolsoNapIg(b)
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
  if (b.fleet_group && !tobbnapos(b)) return vegsoIdo(b)
  if (tobbnapos(b)) return utolsoNapIg(b)
  const kezdes = b.start_at ?? b.drop_off_at
  return kezdes ? ora(kezdes) : '—'
}

/**
 * A rendszám az azonosító. Ha valamiért nincs (telefonon felvett foglalás,
 * ahol még nem tudták), akkor a név — mert üres kártyát mutatni értelmetlen.
 */
export function azonosito(b: DayBooking): string {
  // Flottás csoport (képviselő): „Raiffeisen 3 db".
  if (b.flotta) return `${csoportNev(b)} ${csoportOsszeg(b.flotta).darab} db`
  // A rendszám mindig nagybetűvel (az adatbázis is így tárolja). A „—"
  // helyőrző (flottás autó, még nincs rendszáma): helyette a cég neve.
  const r = (b.plate_raw ?? '').trim().toUpperCase()
  if (r && r !== HELYORZO) return r
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
  /** Havi nézetben egy sorba fér: rendszám és idő egymás mellett. */
  egysoros?: boolean
}) {
  const rendszamE = vanRendszam(b) && !b.flotta
  // A teljes idősáv a buboréksúgóban mindig megmarad, akkor is, ha a
  // kártyán csak a kezdés fér el.
  const cim = `${azonosito(b)} · ${idoSzoveg(b)} · ${STATUS_LABEL[b.status]}`
  const tartalom = (
    <>
      <span className={rendszamE ? 'azon rendszam' : 'azon nev'}>{azonosito(b)}</span>
      <Kerdojel b={b} />
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
