import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, helyiNap, maStr, napRovidCim, ora, relativNap } from '../../lib/format'
import { useKerdes, type KerdesBeallitas } from '../common/Kerdes'
import { ALLAPOT_KERDES, NEM_FERT_BE_KERDES, TORLES_KERDES } from '../common/kerdesek'
import Kerdojel from './Kerdojel'
import {
  NEXT_STATUS, SCOPE_LABEL, STATUS_LABEL,
  type BookingStatus, type DayBooking,
} from '../../lib/types'
import { azonosito } from './MiniKartya'
import IgazoloGomb, { igazoloKell } from '../igazolo/IgazoloGomb'
import { useIgazoloKapu } from '../igazolo/useIgazoloKapu'
import { useKeszAblak } from '../booking/KeszAblak'

// ---------------------------------------------------------------------------
//  Egy kártya a napi listában.
//
//  A műhelyben a tabletet nem kézben tartják, hanem a falon vagy a pulton
//  áll, és pár lépésről nézik. Ezért a BETŰK kétszer akkorák, mint egy
//  irodai listán — a kártya viszont nem lett nagyobb: kevés a hézag, és
//  ami összetartozik, egy sorba került. Csak az van rajta, ami a MUNKÁHOZ
//  kell:
//
//    1. sor   RENDSZÁM  [???] [Megvárja] [H-V]  Cég  időpont  Csomag + egyéb szolgáltatások
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
 * Mettől meddig.
 *
 *   egynapos, megvárja    08:00 – 11:30   (kezdés + a munka hossza)
 *   egynapos, itt hagyja  08:00 – 15:00   (hozza – viszi)
 *
 *   Ha az autó nem ugyanazon a napon jön és megy (többnapos, vagy előző
 *   este hozzák), a két végén a nap is ott áll, a MAI naphoz képest:
 *
 *     Tegnap – Holnap 11:00          (már itt van)
 *     Ma 16:00 – Holnap 11:00        (ma hozzák: az érkezés órája is kell)
 *     Csütörtök – Ma 17:00           (egy napnál régebben hozták)
 *     Tegnap – Péntek 17:00          (egy napnál később viszik)
 *
 *   Egy napon belül Tegnap / Ma / Holnap, távolabb a nap neve, egy héten
 *   túl a dátum (lásd relativNap).
 */
export function napiIdo(b: DayBooking, ma: string = maStr()): string {
  const hozza = b.drop_off_at ?? b.start_at
  const viszi = b.pick_up_at ?? b.deadline_at
  const hozzaNap = hozza ? helyiNap(hozza) : b.service_date.slice(0, 10)
  const visziNap = viszi ? helyiNap(viszi) : b.last_day.slice(0, 10)

  if (hozzaNap !== visziNap) {
    const eleje = hozzaNap === ma && hozza ? `Ma ${ora(hozza)}` : relativNap(hozzaNap, ma)
    const vege = `${relativNap(visziNap, ma)}${viszi ? ` ${ora(viszi)}` : ''}`
    return `${eleje} – ${vege}`
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
  const [kapuAblak, kapu] = useIgazoloKapu()
  const [keszAblak, keszVan] = useKeszAblak()
  const arany = b.tasks_total > 0 ? (b.tasks_done / b.tasks_total) * 100 : 0

  const kovetkezo = NEXT_STATUS[b.status]
  const lemondott = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_SHOP', 'REJECTED'].includes(b.status)
  const lezart = b.status === 'COMPLETED'
  // Online foglalási kérés: Visszaigazol (a következő lépés) vagy Elutasít.
  const keres = b.status === 'REQUESTED'
  const torolheto = !lezart && !lemondott && b.status !== 'NO_SHOW' && !keres
  // Kérdőjeles autó, ami még nincs lezárva: „Nem fért be" gombbal 0 Ft-tal zárható.
  const nemFertBeHato = b.tentative && torolheto

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

  // „Nem fért be": lezárás 0 Ft-tal (az adatbázis jelöli meg, és ott zárja).
  async function nemFertBe() {
    if (megy || !(await kerdez(NEM_FERT_BE_KERDES(b)))) return
    setMegy(true)
    setHiba(null)
    onModosit?.(b.id, { status: 'COMPLETED', not_fitted: true, final_price_huf: 0 })
    try {
      await data.notFitted(b.id)
      refresh()
    } catch (e) {
      onModosit?.(b.id, { status: b.status, not_fitted: false, final_price_huf: b.final_price_huf })
      setHiba(e instanceof Error ? e.message : String(e))
    } finally {
      setMegy(false)
    }
  }

  // A következő lépés gombja. Igazolólapos cég autójánál:
  //   Kész van  → utána rögtön megnyílik a lap sora, aláíratni;
  //   Átvette   → csak ha a sor már ki van töltve (különben előbb azt nyitja).
  async function kovetkezoLepes() {
    if (!kovetkezo || megy) return
    const cel = kovetkezo.to
    try {
      if (igazolo && cel === 'COMPLETED' && !(await kapu.atadhato(b.id))) return
    } catch (e) {
      setHiba(e instanceof Error ? e.message : String(e))
      return
    }
    if (cel === 'READY') {
      // „Kész van": a munkalistás ablak kérdez és ment (ami kimaradt, nem
      // számít bele az árba). Mégse esetén nem történt semmi.
      const eredmeny = await keszVan(b.id, azonosito(b))
      if (!eredmeny) return
      onModosit?.(b.id, {
        status: 'READY',
        skip_note: eredmeny.skip_note,
        skip_huf: eredmeny.skip_huf || null,
      })
      refresh()
    } else {
      const k = ALLAPOT_KERDES[cel]
      if (k && !(await kerdez(k))) return
      await allapot(cel)
    }
    if (igazolo && cel === 'READY') {
      try {
        await kapu.alairat(b.id,
          'Az autó elkészült. Átadáskor írasd alá az igazolólapot (km, név, aláírás). '
          + 'Ha most nem, az Átvette gombnál újra előjön.')
      } catch (e) {
        setHiba(e instanceof Error ? e.message : String(e))
      }
    }
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
          {/* Kérdőjeles („???") vagy „nem fért be" — közvetlenül a rendszám mellett. */}
          <Kerdojel b={b} />
          {/* Online foglalási kérés: még vissza kell igazolni. */}
          {keres && (
            <span className="cimke-pill" data-r="keres" title="Online foglalási kérés — vissza kell igazolni">
              Online kérés
            </span>
          )}
          {/* Hozom-viszem: mi megyünk az autóért. Ez a nap beosztását
              érinti (valakinek el kell mennie), ezért a kártyán is látszik. */}
          {/* Megvárja: az ügyfél ott ül, amíg kész — ezt az autót RÖGTÖN
              el kell kezdeni. Erős sárga, hogy messziről is kiugorjon. */}
          {b.booking_type === 'VAROS' && (
            <span className="cimke-pill" data-r="megvarja" title="Megvárja — rögtön kezdeni">Megvárja</span>
          )}
          {b.booking_type === 'HOZOMVISZEM' && (
            <span className="cimke-pill" data-r="hozomviszem" title="Hozom-viszem">H-V</span>
          )}
          {/* A cég: céges autónál a rendszám mellett, hogy a pultnál és a
              mosóállásban is lássák, kinek a flottájából jött. */}
          {b.company_name && (
            <span className="kartya-ceg" title={`Cég: ${b.company_name}`}>{b.company_name}</span>
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

        {(kovetkezo || torolheto || lemondott || igazolo || nemFertBeHato || keres) && (
          <div className="kartya-muvelet">
            {keres && (
              <button className="btn btn-veszelyes" disabled={megy}
                      onClick={() => void kerdesUtan({
                        cim: `Elutasítod? ${azonosito(b)}`,
                        szoveg: 'A kérés elutasítva kerül a napba; a „Mégis jön" gombbal visszavehető.',
                        igen: 'Elutasít', nem: 'Mégse', veszelyes: true,
                      }, 'REJECTED')}>
                Elutasít
              </button>
            )}
            {/* Az igazolólap sora: átadáskor km, név, aláírás. */}
            {igazolo && <IgazoloGomb bookingId={b.id} />}
            {nemFertBeHato && (
              <button className="btn btn-kerdojel" disabled={megy}
                      onClick={() => void nemFertBe()}>
                Nem fért be
              </button>
            )}
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
                      onClick={() => void kovetkezoLepes()}>
                {kovetkezo.label}
              </button>
            )}
          </div>
        )}
      </div>
      {kerdesAblak}
      {keszAblak}
      {kapuAblak}
    </div>
  )
}
