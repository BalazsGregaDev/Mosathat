import { useApp } from '../../state/AppContext'
import { ft } from '../../lib/format'
import FlottaLepteto from './FlottaLepteto'
import { csoportNev, csoportOsszeg, elo, vanRendszam, vegsoIdo } from '../../lib/flotta'
import { STATUS_LABEL, type DayBooking } from '../../lib/types'

// ---------------------------------------------------------------------------
//  Flottás csoport a napi listában — egy kártya, több autó
//
//    RAIFFEISEN BANK  [3 darab]  17:00-ig  Premium
//    [RAI-001] [2. autó] [3. autó]          ← autónként, az állapot színével
//    38 100 Ft        [−] 1 / 3 kész · most: 2. autó [Kész, jöhet a következő] [Autók]
//
//  Az autók sorában a rendszám áll, ha már tudjuk; ha még nem, a sorszám
//  („2. autó"). A kártya színe a csoport állapota: ahol a legkevésbé
//  előrehaladott autója tart.
//
//  Állapotgombok (Megérkezett, Kész van, Átvette) nincsenek: a flottás autók
//  gyors munkák. Helyettük a léptető: hányadik autónál tartunk (lásd
//  FlottaLepteto). A munkalapot az „Autók" gomb nyitja.
// ---------------------------------------------------------------------------

export default function FlottaKartya({ b, onMegnyit }: {
  /** A csoport képviselője (a `flotta` mezőben az összes autó). */
  b: DayBooking
  onMegnyit: () => void
}) {
  const { refresh } = useApp()
  const tagok = b.flotta ?? [b]
  const o = csoportOsszeg(tagok)

  return (
    <div className="kartya flotta-kartya" data-allapot={b.status} title={STATUS_LABEL[b.status]}>
      <button className="kartya-nyit" onClick={onMegnyit}>
        <div className="kartya-felso">
          <span className="rendszam flotta-nev">{csoportNev(b)}</span>
          <span className="cimke-pill flotta-db">{o.darab} darab</span>
          {b.booking_type === 'HOZOMVISZEM' && (
            <span className="cimke-pill" data-r="hozomviszem" title="Hozom-viszem">H-V</span>
          )}
          <span className="ido">{vegsoIdo(b)}</span>
          <span className="csomag">{b.package_name ?? 'Nincs csomag'}</span>
          <span className="csak-felolvaso">{STATUS_LABEL[b.status]}</span>
        </div>

        {/* Autónként: rendszám (vagy sorszám), az állapot színével. */}
        <div className="flotta-autok">
          {tagok.filter(elo).map((t) => (
            <span key={t.id} className="flotta-auto" data-allapot={t.status}
                  title={STATUS_LABEL[t.status]}>
              {vanRendszam(t) ? t.plate_raw?.toUpperCase() : `${t.fleet_index}. autó`}
            </span>
          ))}
        </div>
      </button>

      <div className="kartya-lab">
        <div className="kartya-allas">
          <span className="ar-kiemelt">{ft(o.ar)}</span>
          {o.rendszammal < o.darab && (
            <span className="halk">{o.darab - o.rendszammal} rendszám hiányzik</span>
          )}
        </div>
        <div className="kartya-muvelet">
          {b.fleet_group && (
            <FlottaLepteto groupId={b.fleet_group} tagok={tagok} onValtozas={refresh} />
          )}
          <button className="btn" onClick={onMegnyit}>Autók</button>
        </div>
      </div>
    </div>
  )
}
