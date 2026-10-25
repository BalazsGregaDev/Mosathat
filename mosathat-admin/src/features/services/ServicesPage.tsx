import { useCallback, useEffect, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg } from '../../lib/format'
import {
  CATEGORY_SHORT, KATEGORIAK, SCOPE_LABEL, TERJEDELMEK,
  type BookingScope, type Extra, type FullServicePrice, type Package,
  type PackagePrice, type VehicleCategory,
} from '../../lib/types'
import { CimMellett, CsomagTartalom } from './Arlista'
import EgyebSzolgaltatasok, { hianyzoAr } from './EgyebSzolgaltatasok'
import SzamMezo from './SzamMezo'
import Szakasz from './Szakasz'

export default function ServicesPage({ onCsomagSzerkeszto }: { onCsomagSzerkeszto?: () => void }) {
  const { data, catalog: k, refreshCatalog: ujra } = useApp()
  const [ful, setFul] = useState<'csomagok' | 'tartalom'>('csomagok')
  const [extrak, setExtrak] = useState<Extra[] | null>(null)
  const [extraHiba, setExtraHiba] = useState<string | null>(null)

  const extraTolt = useCallback(async () => {
    try {
      setExtrak(await data.listAllExtras())
      setExtraHiba(null)
    } catch (e) {
      setExtraHiba(hibaSzoveg(e))
    }
  }, [data])

  useEffect(() => {
    ujra().catch(() => {})
    void extraTolt()
  }, [ujra, extraTolt])

  const extraFrissit = useCallback(async () => {
    await Promise.all([extraTolt(), ujra()])
  }, [extraTolt, ujra])

  if (!k) return <div className="betolt">Betöltés…</div>

  const ar = (p: Package, c: VehicleCategory, s: BookingScope): PackagePrice | undefined =>
    k.packagePricing.find((x) => x.package_id === p.id && x.category === c && x.scope === s)

  const fsAr = (p: Package, c: VehicleCategory): FullServicePrice | undefined =>
    k.fullServicePricing.find((x) => x.package_id === p.id && x.category === c)

  const hianyzoIdo = k.packages.length * KATEGORIAK.length * 2 -
    k.packagePricing.filter((x) => x.scope !== 'TELJES' && x.duration_minutes !== null).length
  const hianyzoExtraAr = hianyzoAr(extrak ?? k.extras)

  const csomagHiany = (p: Package) =>
    KATEGORIAK.reduce((n, c) => n + TERJEDELMEK.reduce((m, s) => {
      const sor = ar(p, c, s)
      return m + (sor?.price_huf == null ? 1 : 0) + (sor?.duration_minutes == null ? 1 : 0)
    }, 0) + (fsAr(p, c)?.price_huf == null && !fsAr(p, c)?.requires_quote ? 1 : 0), 0)

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
          {onCsomagSzerkeszto && (
            <button onClick={onCsomagSzerkeszto}>Csomagok tartalma</button>
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
        <div className="szolg-szakaszok">
          {k.packages.map((p) => (
            <Szakasz key={p.id} nev={p.id} cim={p.name} mellett={<CimMellett k={k} p={p} />}
                     jelzo={csomagHiany(p)} jelzoCim="Ennyi mező üres">
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
                                  await data.updatePackagePrice(p.id, c, s, { price_huf: v })
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
                                  await data.updatePackagePrice(p.id, c, s, { duration_minutes: v })
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
                <div className="cimke">Full Service (Csomag+Kárpit/Bőrtisztítás)</div>
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
            </Szakasz>
          ))}

          <Szakasz nev="egyeb" cim="Egyéb szolgáltatások"
                   mellett={extrak ? `${extrak.filter((e) => e.active).length} aktív${extrak.some((e) => !e.active) ? `, ${extrak.filter((e) => !e.active).length} kikapcsolva` : ''}` : null}
                   jelzo={hianyzoExtraAr} jelzoCim="Ennyinek nincs ára">
            {extraHiba && <div className="hibauzenet">{extraHiba}</div>}
            {extrak
              ? <EgyebSzolgaltatasok extrak={extrak} csomagok={k.packages} onFrissit={extraFrissit} />
              : !extraHiba && <div className="betolt">Betöltés…</div>}
          </Szakasz>
        </div>
      )}

      {ful === 'tartalom' && <CsomagTartalom k={k} />}
    </div>
  )
}
