import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft } from '../../lib/format'
import {
  CATEGORY_SHORT, SCOPE_LABEL,
  type BookingScope, type Extra, type FullServicePrice, type Package,
  type PackagePrice, type VehicleCategory,
} from '../../lib/types'
import type { Catalog } from '../../data'
import { CsomagTartalom, Tobblet } from './Arlista'
import { KETTO_PX } from './ServicesView'
import { useSzeles } from '../../state/useSzeles'

const KATEGORIAK: VehicleCategory[] = ['SZEMELYAUTO', 'SUV', 'KISBUSZ']
const TERJEDELMEK: BookingScope[] = ['TELJES', 'KULSO', 'BELSO']

// ---------------------------------------------------------------------------
//  Szolgáltatások — árak, időtartamok, leírások.
//
//  Ez a képernyő azért van elöl a sorban, mert ezzel lehet pótolni a hiányzó
//  adatokat: a hét extra árát és a tizennyolc Kívül/Belül időtartamot. Amíg
//  azok nincsenek meg, a kapacitásszámítás és az árkalkulátor is féllábon áll.
//
//  Ezért a hiányzó értékek nem üres mezőként jelennek meg, hanem narancs
//  kerettel — hogy szemet szúrjanak, ne el lehessen nézni felettük.
//
//  Mentés a mezőből kilépéskor. Nincs külön Mentés gomb: harminc mezőnél
//  úgyis elfelejtené az ember, melyiket írta át.
// ---------------------------------------------------------------------------

type Mentes = 'nincs' | 'megy' | 'kesz' | 'hiba'

/** Szám bevitele, ami üresen NULL-t jelent (nem nullát). */
function SzamMezo({
  ertek, onMent, cimke, suffix, hianyzoJelzes = true, lepes = 100,
}: {
  ertek: number | null
  onMent: (v: number | null) => Promise<void>
  /** Képernyőolvasónak: melyik cella ez. A táblázatban nincs látható címke. */
  cimke: string
  suffix?: string
  hianyzoJelzes?: boolean
  lepes?: number
}) {
  const [v, setV] = useState(ertek === null ? '' : String(ertek))
  const [allapot, setAllapot] = useState<Mentes>('nincs')

  useEffect(() => {
    setV(ertek === null ? '' : String(ertek))
  }, [ertek])

  async function ki() {
    const uj = v.trim() === '' ? null : Number(v)
    if (uj !== null && !Number.isFinite(uj)) return
    if (uj === ertek) return
    setAllapot('megy')
    try {
      await onMent(uj)
      setAllapot('kesz')
      window.setTimeout(() => setAllapot('nincs'), 1200)
    } catch {
      setAllapot('hiba')
    }
  }

  const hianyzik = hianyzoJelzes && v.trim() === ''

  return (
    <span className="szammezo" data-allapot={allapot} data-hianyzik={hianyzik}>
      <input
        className="beviteli szam"
        type="number"
        inputMode="numeric"
        step={lepes}
        aria-label={cimke}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => void ki()}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  )
}

export default function ServicesPage() {
  const { data, catalog } = useApp()
  const [k, setK] = useState<Catalog | null>(catalog)
  const [ful, setFul] = useState<'csomagok' | 'tartalom' | 'extrak'>('csomagok')
  // Széles képernyőn a csomagok mellé fér az egyéb szolgáltatások listája is:
  // soronként egy név, egy ár és egy időtartam. Keskenyen külön fülre megy.
  const szeles = useSzeles(KETTO_PX)

  const ujra = useCallback(async () => {
    setK(await data.getCatalog())
  }, [data])

  useEffect(() => {
    void ujra()
  }, [ujra])

  if (!k) return <div className="betolt">Betöltés…</div>

  const ar = (p: Package, c: VehicleCategory, s: BookingScope): PackagePrice | undefined =>
    k.packagePricing.find((x) => x.package_id === p.id && x.category === c && x.scope === s)

  const fsAr = (p: Package, c: VehicleCategory): FullServicePrice | undefined =>
    k.fullServicePricing.find((x) => x.package_id === p.id && x.category === c)

  // Hány adat hiányzik még — ezt érdemes látni a fejlécben.
  const hianyzoIdo = k.packages.length * KATEGORIAK.length * 2 -
    k.packagePricing.filter((x) => x.scope !== 'TELJES' && x.duration_minutes !== null).length
  const hianyzoExtraAr = k.extras.filter((e) => e.price_huf === null && !e.requires_quote).length

  return (
    <div className="oldal">
      <div className="oldal-fej">
        <h2>Szolgáltatások</h2>
        <div className="fulek">
          <button className={ful === 'csomagok' ? 'aktiv' : ''} onClick={() => setFul('csomagok')}>
            Csomagok és árak
          </button>
          <button className={ful === 'tartalom' ? 'aktiv' : ''} onClick={() => setFul('tartalom')}>
            Mi van bennük?
          </button>
          {!szeles && (
            <button className={ful === 'extrak' ? 'aktiv' : ''} onClick={() => setFul('extrak')}>
              Egyéb szolgáltatások
              {hianyzoExtraAr > 0 && <span className="jelzo">{hianyzoExtraAr}</span>}
            </button>
          )}
        </div>
      </div>

      {(hianyzoIdo > 0 || hianyzoExtraAr > 0) && (
        <div className="figyelmeztet" style={{ marginBottom: 'var(--t4)' }}>
          <span>
            <strong>Hiányzó adatok.</strong>{' '}
            {hianyzoIdo > 0 && <>{hianyzoIdo} időtartam a Kívül/Belül munkákhoz. </>}
            {hianyzoExtraAr > 0 && <>{hianyzoExtraAr} szolgáltatásnak nincs ára. </>}
            Amíg ezek nincsenek meg, az érintett foglalások nem terhelik a napi
            kapacitást, és az áruk csak részösszeg.
          </span>
        </div>
      )}

      {ful === 'csomagok' && (
        <div className={szeles ? 'szolg-ketto' : undefined}>
          <div className="szolg-bal">
          <div className="panelek panelek-szeles">
            {k.packages.map((p) => (
              <div className="panel" key={p.id}>
                {/* Ugyanaz az egysoros összefoglaló, mint az alkalmazotti
                    nézetben és az árlista ablakban — ne kelljen két helyen
                    fejben tartani, mi a különbség a csomagok között. */}
                <h3 className="csomag-cim">
                  {p.name}
                  <Tobblet k={k} packageId={p.id} />
                </h3>
                <div className="panel-torzs">
                  <p className="halk" style={{ fontSize: 'var(--m-sm)', marginBottom: 'var(--t3)' }}>
                    {p.description}
                  </p>

                  <div className="tablagorgo">
                  <table className="artabla">
                    <thead>
                      <tr>
                        <th />
                        {TERJEDELMEK.map((s) => (
                          <th key={s} colSpan={2}>{SCOPE_LABEL[s]}</th>
                        ))}
                      </tr>
                      <tr className="alfejlec">
                        <th />
                        {TERJEDELMEK.map((s) => [
                          <th key={s + 'a'}>Ár</th>,
                          <th key={s + 'i'}>Perc</th>,
                        ])}
                      </tr>
                    </thead>
                    <tbody>
                      {KATEGORIAK.map((c) => (
                        <tr key={c}>
                          <th scope="row">{CATEGORY_SHORT[c]}</th>
                          {TERJEDELMEK.map((s) => {
                            const sor = ar(p, c, s)
                            return [
                              <td key={s + 'a'}>
                                <SzamMezo
                                  cimke={`${p.name} · ${CATEGORY_SHORT[c]} · ${SCOPE_LABEL[s]} ára`}
                                  ertek={sor?.price_huf ?? null}
                                  lepes={100}
                                  onMent={async (v) => {
                                    await data.updatePackagePrice(p.id, c, s, {
                                      price_huf: v,
                                      duration_minutes: sor?.duration_minutes ?? null,
                                    })
                                    await ujra()
                                  }}
                                />
                              </td>,
                              <td key={s + 'i'}>
                                <SzamMezo
                                  cimke={`${p.name} · ${CATEGORY_SHORT[c]} · ${SCOPE_LABEL[s]} időtartama`}
                                  ertek={sor?.duration_minutes ?? null}
                                  lepes={15}
                                  onMent={async (v) => {
                                    await data.updatePackagePrice(p.id, c, s, {
                                      price_huf: sor?.price_huf ?? null,
                                      duration_minutes: v,
                                    })
                                    await ujra()
                                  }}
                                />
                              </td>,
                            ]
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>

                  <div className="fsrész">
                    <div className="cimke">Full Service (mélytisztítás)</div>
                    <table className="artabla keskeny">
                      <tbody>
                        {KATEGORIAK.map((c) => {
                          const sor = fsAr(p, c)
                          return (
                            <tr key={c}>
                              <th scope="row">{CATEGORY_SHORT[c]}</th>
                              <td>
                                <SzamMezo
                                  cimke={`${p.name} Full Service · ${CATEGORY_SHORT[c]} ára`}
                                  ertek={sor?.price_huf ?? null}
                                  hianyzoJelzes={!sor?.requires_quote}
                                  onMent={async (v) => {
                                    await data.updateFullServicePrice(p.id, c, { price_huf: v })
                                    await ujra()
                                  }}
                                />
                              </td>
                              <td className="halk" style={{ fontSize: 'var(--m-xs)' }}>
                                {sor?.requires_quote ? 'árajánlatos' : 'saját ár, nem csomag + extra'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </div>
          </div>

          {/* Széles képernyőn ide, a csomagok mellé kerül. Keskenyen külön
              fülre megy — ott a fenti gombsorban jelenik meg. */}
          {szeles && (
            <div className="szolg-jobb">
              <h3 className="szolg-cim">
                Egyéb szolgáltatások
                {hianyzoExtraAr > 0 && (
                  <span className="jelzo" title="Ennyinek nincs ára">{hianyzoExtraAr}</span>
                )}
              </h3>
              <div className="panel">
                <div className="extralista">
                  {k.extras.map((e) => (
                    <ExtraSor key={e.id} e={e} onMent={async (patch) => {
                      await data.updateExtra(e.id, patch)
                      await ujra()
                    }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* A csomagok tartalma nem itt szerkeszthető: a munkalépéseket és az
          öröklődést az adatbázis tartja (package_items), mert ugyanaz a lista
          adja a munkalapot is. Itt megnézni lehet — ugyanazt, amit az
          alkalmazott lát. */}
      {ful === 'tartalom' && <CsomagTartalom k={k} />}

      {ful === 'extrak' && (
        <div className="panel">
          <h3>Egyéb szolgáltatások</h3>
          <div className="extralista">
            {k.extras.map((e) => (
              <ExtraSor key={e.id} e={e} onMent={async (patch) => {
                await data.updateExtra(e.id, patch)
                await ujra()
              }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ExtraSor({ e, onMent }: { e: Extra; onMent: (patch: Partial<Extra>) => Promise<void> }) {
  const [leiras, setLeiras] = useState(e.description ?? '')
  const [nyitva, setNyitva] = useState(false)

  const egyseg =
    e.price_unit === 'ULES' ? '/ ülés'
    : e.price_unit === 'AJTO' ? '/ ajtó'
    : e.price_unit === 'LITER' ? '/ liter' : ''

  return (
    <div className="extrasor" data-aktiv={e.active}>
      <div className="fo">
        <button type="button" className="nev" onClick={() => setNyitva((v) => !v)}>
          {e.name}
          <span className="nyil">{nyitva ? '−' : '+'}</span>
        </button>

        <SzamMezo
          cimke={`${e.name} ára`}
          ertek={e.price_huf}
          suffix={`Ft ${egyseg}`}
          hianyzoJelzes={!e.requires_quote}
          onMent={(v) => onMent({ price_huf: v })}
        />
        <SzamMezo
          cimke={`${e.name} időtartama`}
          ertek={e.work_minutes}
          suffix="perc"
          lepes={5}
          onMent={(v) => onMent({ work_minutes: v })}
        />
      </div>

      {nyitva && (
        <div className="reszletek">
          <div className="mezo">
            <label htmlFor={`leiras-${e.id}`}>Leírás — ezt látja a látogató az ⓘ ikonra</label>
            <textarea
              id={`leiras-${e.id}`}
              className="beviteli"
              value={leiras}
              onChange={(ev) => setLeiras(ev.target.value)}
              onBlur={() => leiras !== (e.description ?? '') && void onMent({ description: leiras })}
            />
          </div>
          <div className="sor-2">
            <label className="jelolo" data-aktiv={e.active}>
              <input
                type="checkbox"
                checked={e.active}
                onChange={(ev) => void onMent({ active: ev.target.checked })}
              />
              <span>Aktív — látszik a foglalási űrlapon</span>
            </label>
            <div className="mezo">
              <span className="cimke">Száradási idő (perc)</span>
              <SzamMezo
                cimke={`${e.name} száradási ideje`}
                ertek={e.rest_minutes}
                suffix="perc"
                lepes={30}
                hianyzoJelzes={false}
                onMent={(v) => onMent({ rest_minutes: v ?? 0 })}
              />
            </div>
          </div>
          {e.requires_quote && (
            <p className="halk" style={{ fontSize: 'var(--m-xs)' }}>
              Árajánlatos tétel: nincs fix ára, a foglalásnál részösszegként jelenik meg.
            </p>
          )}
          {e.price_huf === null && !e.requires_quote && (
            <p style={{ fontSize: 'var(--m-xs)', color: 'var(--v-erkezett)' }}>
              Nincs ára. A foglalási űrlapon „ár hiányzik" felirattal jelenik meg,
              és nem számít bele az összegbe — jelenlegi ára: {ft(null)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
