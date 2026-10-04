import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, napRovidCim, ora } from '../../lib/format'
import { useKerdes, type KerdesBeallitas } from '../common/Kerdes'
import { ALLAPOT_KERDES, TORLES_KERDES } from '../common/kerdesek'
import {
  NEXT_STATUS, SCOPE_LABEL, STATUS_LABEL,
  type BookingStatus, type DayBooking,
} from '../../lib/types'
import { azonosito } from './MiniKartya'
import IgazoloGomb, { igazoloKell } from '../igazolo/IgazoloGomb'

// ---------------------------------------------------------------------------
//  Egy kártya a napi listában.
//
//  A műhelyben a tabletet nem kézben tartják, hanem a falon vagy a pulton
//  áll, és pár lépésről nézik. Ezért a BETŰK kétszer akkorák, mint egy
//  irodai listán — a kártya viszont nem lett nagyobb: kevés a hézag, és
//  ami összetartozik, egy sorba került. Csak az van rajta, ami a MUNKÁHOZ
//  kell:
//
//    1. sor   RENDSZÁM  [H-V]  időpont  Csomag + egyéb szolgáltatások
//    2. sor   (többnapos) hányadik nap, mikor viszi
//    3. sor   megjegyzés
//    alul     ár és a munkalista állása — mellette a következő lépés gombja
//
//  Ami SZÁNDÉKOSAN nincs rajta:
//    - az ügyfél neve: az autót a rendszámáról ismerik fel, a név a
//      telefonhoz kell — az a munkalapon van;
//    - az állapot felirata („Várjuk", „Dolgozunk"): a kártya bal szélének
//      színe már mondja, a gomb pedig azt, hogy mi a következő lépés.
//      A felirat csak helyet vett el a rendszám és a csomag elől.
//
//  A kártya alján ott van a KÖVETKEZŐ lépés gombja (Megérkezett, Kész van,
//  Átvette). A nap nagy részében ez a három mozdulat ismétlődik, ezért nem
//  kell hozzá megnyitni a munkalapot.
// ---------------------------------------------------------------------------

/**
 * Mettől meddig, AZON A NAPON, amelyiket nézzük.
 *
 *   egynapos, megvárja    08:00 – 11:30   (kezdés + a munka hossza)
 *   egynapos, itt hagyja  08:00 – 15:00   (hozza – viszi)
 *   többnapos, 1. nap     08:00-tól
 *   többnapos, közte      egész nap
 *   többnapos, utolsó     17:00-ig
 */
export function napiIdo(b: DayBooking): string {
  const napok = b.napok_szama ?? 1
  const hanyadik = b.nap_szama ?? 1
  const viszi = b.pick_up_at ?? b.deadline_at
  const hozza = b.drop_off_at ?? b.start_at

  if (napok > 1) {
    if (hanyadik === 1) return hozza ? `${ora(hozza)}-tól` : 'első nap'
    if (hanyadik === napok) return viszi ? `${ora(viszi)}-ig` : 'utolsó nap'
    return 'egész nap'
  }

  if (b.booking_type === 'VAROS' && b.start_at) {
    const kezd = new Date(b.start_at)
    const veg = new Date(kezd.getTime() + b.planned_duration_minutes * 60_000)
    return `${ora(b.start_at)} – ${ora(veg.toISOString())}`
  }
  if (!hozza) return '—'
  return viszi ? `${ora(hozza)} – ${ora(viszi)}` : ora(hozza)
}

export default function BookingCard({
  b,
  onMegnyit,
  onModosit,
}: {
  b: DayBooking
  onMegnyit: () => void
  /** A napi lista helyben átírja ezt az egy foglalást — a sorrendhez nem nyúl. */
  onModosit?: (id: string, valtozas: Partial<DayBooking>) => void
}) {
  const { data, refresh } = useApp()
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [kerdesAblak, kerdez] = useKerdes()
  const arany = b.tasks_total > 0 ? (b.tasks_done / b.tasks_total) * 100 : 0

  const kovetkezo = NEXT_STATUS[b.status]
  const lemondott = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP'].includes(b.status)
  const lezart = b.status === 'COMPLETED'
  const torolheto = !lezart && !lemondott && b.status !== 'NO_SHOW'

  const napok = b.napok_szama ?? 1
  const tobbnapos = napok > 1
  const viszi = b.pick_up_at ?? b.deadline_at
  const megjegyzes = (b.notes ?? '').trim()
  // Szerződéses / bérletes cég autója: a cég havi igazolólapjára kerül.
  const igazolo = igazoloKell(b)

  // Állapotváltás. A kártya AZONNAL átvált (helyben, a listában), a mentés
  // utána megy. Nincs újratöltés, nincs „Betöltés…", és a kártya a helyén
  // marad: a sorrendet csak a kézi átrendezés változtatja meg.
  // Ha a mentés hibára fut, visszaváltunk, és a kártyán megjelenik a hiba.
  async function allapot(cel: BookingStatus) {
    if (megy) return
    const regi = b.status
    setMegy(true)
    setHiba(null)
    onModosit?.(b.id, { status: cel })
    try {
      await data.setStatus(b.id, cel)
      // Csendes frissítés: a kapacitás és a többi szám is utánamegy, de a
      // lista nem tűnik el közben.
      refresh()
    } catch (e) {
      onModosit?.(b.id, { status: regi })
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMegy(false)
    }
  }

  // A kész, az átvétel és a törlés megkérdez. Nem azért, mert nehéz
  // visszacsinálni — mind visszavonható —, hanem mert egy zsúfolt listában
  // a szomszédos kártya gombja is egy ujjnyira van.
  async function kerdesUtan(k: KerdesBeallitas, cel: BookingStatus) {
    if (!(await kerdez(k))) return
    await allapot(cel)
  }

  return (
    <div className="kartya" data-allapot={b.status} title={STATUS_LABEL[b.status]}>
      {/* A kártya teteje nyitja meg a munkalapot. A gombok külön állnak
          alatta: gomb a gombban érvénytelen, és a véletlen kattintás is
          pont a rossz helyre esne. */}
      <button className="kartya-nyit" onClick={onMegnyit}>
        {/* 1. sor — melyik autó, mikor, és mit kérnek. A csomag után,
            narancsban, ami KÜLÖN kérve van: „Premium + Motorkozmetika".
            Ez az, amit nem szabad elfelejteni, ezért nem olvad bele a
            csomag nevébe. */}
        <div className="kartya-felso">
          <span className="rendszam">{azonosito(b)}</span>
          {/* Hozom-viszem: mi megyünk az autóért. Ez a nap beosztását
              érinti (valakinek el kell mennie), ezért a kártyán is látszik. */}
          {b.booking_type === 'HOZOMVISZEM' && (
            <span className="cimke-pill" data-r="hozomviszem" title="Hozom-viszem">H-V</span>
          )}
          <span className="ido">{napiIdo(b)}</span>
          {/* A csomag és az extrák külön elemek a sorban: ha az extrák
              listája hosszú, csak AZ törik a következő sorba — a csomag
              neve fent marad a rendszám mellett. */}
          <span className="csomag">
            {b.package_name ?? 'Nincs csomag'}
            {b.full_service && ' + Full Service'}
            {b.scope !== 'TELJES' && ` · ${SCOPE_LABEL[b.scope]}`}
          </span>
          {b.extras_summary && (
            <span className="extrak">+ {b.extras_summary}</span>
          )}
          {/* Az állapot felirata nem látszik (a bal szél színe mondja), de a
              felolvasó program kimondja. */}
          <span className="csak-felolvaso">{STATUS_LABEL[b.status]}</span>
        </div>

        {/* 2. sor — többnapos: a nap minden napján itt áll, és az utolsó nap
            meg az óra mindig ki van írva, nem csak az utolsó napon. */}
        {tobbnapos && (
          <div className="kartya-tobbnap">
            {napok} napos · {b.nap_szama}. nap
            {' · '}viszi: {napRovidCim(b.last_day.slice(0, 10))}
            {viszi && ` ${ora(viszi)}`}
          </div>
        )}

        {/* 3. sor — a megjegyzés. A „jobb hátsó ajtón karc" a munkához
            tartozik, nem a munkalap mélyére. Hosszú szövegből három sor
            látszik, a többi a munkalapon. */}
        {megjegyzes && <div className="kartya-megj">{megjegyzes}</div>}
      </button>

      {hiba && <div className="kartya-hiba">{hiba}</div>}

      {/* A kártya alja egy sor: balra mennyi és hol tart a munka, jobbra a
          következő lépés gombja. Két külön sorban sok helyet vinne el —
          telefonon úgyis kettétörik. */}
      <div className="kartya-lab">
        <div className="kartya-allas">
          {b.planned_duration_minutes === 0 && (
            <span className="ido-hianyzik">idő hiányzik</span>
          )}
          {b.rest_minutes > 0 && <span title="száradási idő">száradás</span>}
          <span className="ar-kiemelt">{ft(b.final_price_huf ?? b.estimated_price_huf)}</span>
          {b.tasks_total > 0 && (
            <span className="lista-jelzo">
              <span className="csik">
                <i style={{ width: `${arany}%` }} />
              </span>
              {b.tasks_done}/{b.tasks_total}
            </span>
          )}
        </div>

        {(kovetkezo || torolheto || lemondott || igazolo) && (
          <div className="kartya-muvelet">
            {/* Az igazolólap sora: átadáskor km, név, aláírás. */}
            {igazolo && <IgazoloGomb bookingId={b.id} />}
            {torolheto && (
              <button className="btn btn-veszelyes" disabled={megy}
                      onClick={() => void kerdesUtan(TORLES_KERDES(b), 'CANCELLED_BY_CUSTOMER')}>
                Törlés
              </button>
            )}
            {lemondott && (
              <button className="btn" disabled={megy}
                      onClick={() => void allapot('CONFIRMED')}>
                Mégis jön
              </button>
            )}
            {kovetkezo && (
              <button className="btn btn-fo" disabled={megy}
                      onClick={() => {
                        const k = ALLAPOT_KERDES[kovetkezo.to]
                        void (k ? kerdesUtan(k, kovetkezo.to) : allapot(kovetkezo.to))
                      }}>
                {kovetkezo.label}
              </button>
            )}
          </div>
        )}
      </div>
      {kerdesAblak}
    </div>
  )
}
