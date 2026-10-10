import { useEffect, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, hibaSzoveg } from '../../lib/format'
import {
  CATEGORY_SHORT, EGYSEG, KATEGORIAK, SCOPE_LABEL, TERJEDELMEK,
  type BookingScope, type Extra, type FullServicePrice, type Package,
  type PackagePrice, type VehicleCategory,
} from '../../lib/types'
import { CimMellett, CsomagTartalom } from './Arlista'
import { KETTO_PX } from './ServicesView'
import { useSzeles } from '../../state/useSzeles'
import { urlapMegnyilt } from '../../lib/kepernyo'

type Mentes = 'nincs' | 'megy' | 'kesz' | 'hiba'

function SzamMezo({
  ertek, onMent, cimke, suffix, hianyzoJelzes = true, lepes = 100,
}: {
  ertek: number | null
  onMent: (v: number | null) => Promise<void>
  cimke: string
  suffix?: string
  hianyzoJelzes?: boolean
  lepes?: number
}) {
  const [v, setV] = useState(ertek === null ? '' : String(ertek))
  const [alap, setAlap] = useState(ertek)
  const [allapot, setAllapot] = useState<Mentes>('nincs')
  const [hiba, setHiba] = useState<string | undefined>(undefined)
  const idozito = useRef<number | undefined>(undefined)

  if (ertek !== alap) { setAlap(ertek); setV(ertek === null ? '' : String(ertek)) }

  useEffect(() => () => window.clearTimeout(idozito.current), [])

  async function ki() {
    const uj = v.trim() === '' ? null : Number(v)
    if (uj !== null && !Number.isFinite(uj)) return
    if (uj === ertek) return
    window.clearTimeout(idozito.current)
    setAllapot('megy')
    setHiba(undefined)
    try {
      await onMent(uj)
      setAllapot('kesz')
      idozito.current = window.setTimeout(() => setAllapot('nincs'), 1200)
    } catch (e) {
      setAllapot('hiba')
      setHiba(hibaSzoveg(e))
    }
  }

  const hianyzik = hianyzoJelzes && v.trim() === ''

  return (
    <span className="szammezo" data-allapot={allapot} data-hianyzik={hianyzik} title={hiba}>
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
  const { data, catalog: k, refreshCatalog: ujra } = useApp()
  const [ful, setFul] = useState<'csomagok' | 'tartalom' | 'extrak'>('csomagok')
  const szeles = useSzeles(KETTO_PX)

  useEffect(() => {
    ujra().catch(() => {})
  }, [ujra])

  if (!k) return <div className="betolt">Betöltés…</div>

  const ar = (p: Package, c: VehicleCategory, s: BookingScope): PackagePrice | undefined =>
    k.packagePricing.find((x) => x.package_id === p.id && x.category === c && x.scope === s)

  const fsAr = (p: Package, c: VehicleCategory): FullServicePrice | undefined =>
    k.fullServicePricing.find((x) => x.package_id === p.id && x.category === c)

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
          <div>
          <div className="panelek panelek-szeles">
            {k.packages.map((p) => (
              <div className="panel" key={p.id}>
                <h3 className="csomag-cim">
                  {p.name}
                  <CimMellett k={k} p={p} />
                </h3>
                <div className="panel-torzs">

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
                </div>
              </div>
            ))}
          </div>
          </div>

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
                <UjExtra onKesz={ujra} />
              </div>
            </div>
          )}
        </div>
      )}

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
          <UjExtra onKesz={ujra} />
        </div>
      )}
    </div>
  )
}

function ExtraSor({ e, onMent }: { e: Extra; onMent: (patch: Partial<Extra>) => Promise<void> }) {
  const [leiras, setLeiras] = useState(e.description ?? '')
  const [nyitva, setNyitva] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  const egyseg = ['ULES', 'AJTO', 'LITER'].includes(e.price_unit) ? `/ ${EGYSEG[e.price_unit]}` : ''

  function ment(patch: Partial<Extra>) {
    setHiba(null)
    onMent(patch).catch((err) => setHiba(hibaSzoveg(err)))
  }

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

      {hiba && <div className="hibauzenet">{hiba}</div>}
      {nyitva && (
        <div className="reszletek">
          <div className="mezo">
            <label htmlFor={`leiras-${e.id}`}>Leírás — ezt látja a látogató az ⓘ ikonra</label>
            <textarea
              id={`leiras-${e.id}`}
              className="beviteli"
              value={leiras}
              onChange={(ev) => setLeiras(ev.target.value)}
              onBlur={() => { if (leiras !== (e.description ?? '')) ment({ description: leiras }) }}
            />
          </div>
          <div className="sor-2">
            <label className="jelolo" data-aktiv={e.active}>
              <input
                type="checkbox"
                checked={e.active}
                onChange={(ev) => ment({ active: ev.target.checked })}
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

function UjExtra({ onKesz }: { onKesz: () => Promise<void> }) {
  const { data } = useApp()
  const [nyitva, setNyitva] = useState(false)
  const [nev, setNev] = useState('')
  const [ar, setAr] = useState('')
  const [perc, setPerc] = useState('')
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const nevMezo = useRef<HTMLInputElement>(null)
  useEffect(() => { if (nyitva) urlapMegnyilt(nevMezo.current) }, [nyitva])

  function bezar() {
    setNyitva(false); setNev(''); setAr(''); setPerc(''); setHiba(null)
  }

  async function ment() {
    if (!nev.trim() || megy) return
    setMegy(true)
    setHiba(null)
    try {
      await data.createExtra({
        name: nev.trim(),
        price_huf: ar.trim() === '' ? null : Number(ar),
        work_minutes: perc.trim() === '' ? null : Number(perc),
      })
      await onKesz()
      bezar()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setMegy(false)
    }
  }

  if (!nyitva) {
    return (
      <div className="uj-extra">
        <button type="button" className="btn btn-kicsi" onClick={() => setNyitva(true)}>
          + Új szolgáltatás
        </button>
      </div>
    )
  }

  return (
    <div className="uj-extra nyitva">
      {hiba && <div className="hibauzenet">{hiba}</div>}
      <div className="mezo">
        <label htmlFor="uj-extra-nev">Név</label>
        <input id="uj-extra-nev" ref={nevMezo} className="beviteli" value={nev} disabled={megy}
               onChange={(e) => setNev(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') void ment() }} />
      </div>
      <div className="uj-extra-szamok">
        <label className="mezo">
          <span>Ár</span>
          <span className="szammezo">
            <input className="beviteli szam" type="number" inputMode="numeric" min={0} step={100}
                   value={ar} disabled={megy} onChange={(e) => setAr(e.target.value)} />
            <span className="suffix">Ft</span>
          </span>
        </label>
        <label className="mezo">
          <span>Idő</span>
          <span className="szammezo">
            <input className="beviteli szam" type="number" inputMode="numeric" min={0} step={5}
                   value={perc} disabled={megy} onChange={(e) => setPerc(e.target.value)} />
            <span className="suffix">perc</span>
          </span>
        </label>
      </div>
      <div className="urlap-lab" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        <button type="button" className="btn btn-csendes btn-kicsi" onClick={bezar} disabled={megy}>
          Mégse
        </button>
        <button type="button" className="btn btn-fo btn-kicsi" onClick={() => void ment()}
                disabled={!nev.trim() || megy}>
          {megy ? 'Felvétel…' : 'Felvétel'}
        </button>
      </div>
    </div>
  )
}
