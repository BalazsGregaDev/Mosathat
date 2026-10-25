import { useEffect, useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { ft, hibaSzoveg } from '../../lib/format'
import { EGYSEG, type Extra, type Package, type ServiceArea } from '../../lib/types'
import { urlapMegnyilt } from '../../lib/kepernyo'
import { useKerdes } from '../common/Kerdes'
import SzamMezo from './SzamMezo'

const HELYEK: { kulcs: ServiceArea; cim: string }[] = [
  { kulcs: 'KULSO', cim: 'Külső' },
  { kulcs: 'BELSO', cim: 'Belső' },
]

export const helye = (e: Extra): ServiceArea => (e.area === 'BELSO' ? 'BELSO' : 'KULSO')

export function hianyzoAr(extrak: Extra[]): number {
  return extrak.filter((e) => e.active && e.price_huf === null && !e.requires_quote).length
}

export default function EgyebSzolgaltatasok({ extrak, csomagok, onFrissit }: {
  extrak: Extra[]
  csomagok: Package[]
  onFrissit: () => Promise<void>
}) {
  const { data } = useApp()
  const [kerdesAblak, kerdez] = useKerdes()
  const [hiba, setHiba] = useState<string | null>(null)
  const csoportok = HELYEK.map((h) => ({ ...h, lista: extrak.filter((e) => helye(e) === h.kulcs) }))

  async function futtat(f: () => Promise<void>) {
    setHiba(null)
    try {
      await f()
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      await onFrissit().catch(() => {})
    }
  }

  function mozgat(e: Extra, irany: -1 | 1) {
    const csoport = csoportok.find((c) => c.kulcs === helye(e))!.lista.slice()
    const i = csoport.findIndex((x) => x.id === e.id)
    const j = i + irany
    if (j < 0 || j >= csoport.length) return
    ;[csoport[i], csoport[j]] = [csoport[j], csoport[i]]
    const sorrend = csoportok.flatMap((c) => (c.kulcs === helye(e) ? csoport : c.lista)).map((x) => x.id)
    void futtat(() => data.sortExtras(sorrend))
  }

  async function torol(e: Extra) {
    if (!(await kerdez({
      cim: `Törlés: ${e.name}`,
      szoveg: 'A szolgáltatás mindenhonnan eltűnik: a publikus oldalról, a foglalási űrlapokról és az adminból is. '
        + 'Ha már szerepelt foglalásban, nem törölhető, ilyenkor kapcsold ki.',
      igen: 'Törlés', nem: 'Mégsem', veszelyes: true,
    }))) return
    await futtat(() => data.deleteExtra(e.id))
  }

  return (
    <div className="egyeb-szerk">
      {hiba && <div className="hibauzenet">{hiba}</div>}
      {csoportok.map((c) => (
        <section key={c.kulcs} className="egyeb-csoport" data-hely={c.kulcs}>
          <h4>{c.cim} <span className="halk">{c.lista.length}</span></h4>
          {c.lista.length === 0 && <div className="ures">Nincs {c.cim.toLowerCase()} szolgáltatás.</div>}
          <div className="extralista">
            {c.lista.map((e, i) => (
              <ExtraSor key={e.id} e={e} csomagok={csomagok}
                        elso={i === 0} utolso={i === c.lista.length - 1}
                        onMozgat={(irany) => mozgat(e, irany)}
                        onTorol={() => void torol(e)}
                        onMent={async (patch) => {
                          try {
                            await data.updateExtra(e.id, patch)
                          } finally {
                            await onFrissit().catch(() => {})
                          }
                        }} />
            ))}
          </div>
        </section>
      ))}
      <UjExtra onKesz={onFrissit} />
      <p className="halk egyeb-tipp">
        Ezek a szolgáltatások egy helyről mennek mindenhova: a publikus oldalra (a sorrend és a Külső/Belső
        oszlop is innen jön), az online és a telefonos foglalásra, a munkalapra és az árlistába.
      </p>
      {kerdesAblak}
    </div>
  )
}

function SzovegMezo({ id, cimke, ertek, sor, kotelezo, lang, helyorzo, onMent }: {
  id: string
  cimke: string
  ertek: string | null
  sor?: boolean
  kotelezo?: boolean
  lang?: string
  helyorzo?: string
  onMent: (v: string) => Promise<void>
}) {
  const [v, setV] = useState(ertek ?? '')
  const [alap, setAlap] = useState(ertek)
  if (ertek !== alap) { setAlap(ertek); setV(ertek ?? '') }

  function ki() {
    const uj = v.trim()
    if (uj === (ertek ?? '').trim()) return
    if (kotelezo && !uj) { setV(ertek ?? ''); return }
    void onMent(uj).catch(() => setV(ertek ?? ''))
  }

  return (
    <div className="mezo">
      <label htmlFor={id}>{cimke}</label>
      {sor
        ? <textarea id={id} className="beviteli" lang={lang} value={v} placeholder={helyorzo}
                    onChange={(e) => setV(e.target.value)} onBlur={ki} />
        : <input id={id} className="beviteli" lang={lang} value={v} placeholder={helyorzo}
                 onChange={(e) => setV(e.target.value)} onBlur={ki}
                 onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />}
    </div>
  )
}

function ExtraSor({ e, csomagok, elso, utolso, onMozgat, onTorol, onMent }: {
  e: Extra
  csomagok: Package[]
  elso: boolean
  utolso: boolean
  onMozgat: (irany: -1 | 1) => void
  onTorol: () => void
  onMent: (patch: Partial<Extra>) => Promise<void>
}) {
  const [nyitva, setNyitva] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)

  const resze = [
    ...csomagok.filter((p) => e.included_in_packages.includes(p.id)).map((p) => p.name),
    ...(e.included_in_full_service ? ['Full Service'] : []),
  ]
  const egyseg = ['ULES', 'AJTO', 'LITER'].includes(e.price_unit) ? `/ ${EGYSEG[e.price_unit]}` : ''

  async function ment(patch: Partial<Extra>) {
    setHiba(null)
    try {
      await onMent(patch)
    } catch (err) {
      setHiba(hibaSzoveg(err))
      throw err
    }
  }
  const csendben = (patch: Partial<Extra>) => { void ment(patch).catch(() => {}) }

  function csomagValt(id: string) {
    const benne = e.included_in_packages
    csendben({ included_in_packages: benne.includes(id) ? benne.filter((x) => x !== id) : [...benne, id] })
  }

  return (
    <div className="extrasor egyeb-sor" data-aktiv={e.active} data-extra={e.id}>
      <div className="fo">
        <span className="egyeb-mozgat">
          <button type="button" className="btn btn-kicsi" aria-label={`${e.name}: feljebb`} disabled={elso}
                  onClick={() => onMozgat(-1)}>Fel</button>
          <button type="button" className="btn btn-kicsi" aria-label={`${e.name}: lejjebb`} disabled={utolso}
                  onClick={() => onMozgat(1)}>Le</button>
        </span>
        <button type="button" className="nev" aria-expanded={nyitva} onClick={() => setNyitva((v) => !v)}>
          <span className="nev-szoveg">
            {e.name}
            {(resze.length > 0 || !e.active) && (
              <small className="resze">
                {[!e.active ? 'kikapcsolva' : null, resze.length > 0 ? `${resze.join(', ')} része` : null].filter(Boolean).join(' · ')}
              </small>
            )}
          </span>
          <span className="nyil">{nyitva ? '−' : '+'}</span>
        </button>
        <select className="beviteli egyeb-hely" aria-label={`${e.name}: hely`} value={helye(e)}
                onChange={(x) => csendben({ area: x.target.value as ServiceArea })}>
          {HELYEK.map((h) => <option key={h.kulcs} value={h.kulcs}>{h.cim}</option>)}
        </select>
        <SzamMezo cimke={`${e.name} ára`} ertek={e.price_huf} suffix={`Ft ${egyseg}`}
                  hianyzoJelzes={!e.requires_quote && e.active} onMent={(v) => ment({ price_huf: v })} />
        <SzamMezo cimke={`${e.name} időtartama`} ertek={e.work_minutes} suffix="perc" lepes={5}
                  onMent={(v) => ment({ work_minutes: v })} />
      </div>

      {hiba && <div className="hibauzenet">{hiba}</div>}
      {nyitva && (
        <div className="reszletek">
          <div className="sor-2">
            <SzovegMezo id={`nev-${e.id}`} cimke="Név" ertek={e.name} kotelezo onMent={(v) => ment({ name: v })} />
            <SzovegMezo id={`nev-en-${e.id}`} cimke="Név angolul" ertek={e.name_en ?? null} lang="en"
                        helyorzo="Ha üres, a magyar jelenik meg" onMent={(v) => ment({ name_en: v })} />
          </div>
          <div className="sor-2">
            <SzovegMezo id={`leiras-${e.id}`} cimke="Leírás, ezt látja a látogató" ertek={e.description} sor
                        onMent={(v) => ment({ description: v })} />
            <SzovegMezo id={`leiras-en-${e.id}`} cimke="Leírás angolul" ertek={e.description_en ?? null} sor lang="en"
                        onMent={(v) => ment({ description_en: v })} />
          </div>
          <div className="mezo">
            <span className="cimke">Csomag része: az online foglalásnál ezek mellé nem kínáljuk külön</span>
            <div className="resze-jelolok">
              {csomagok.map((p) => (
                <label key={p.id} className="jelolo" data-aktiv={e.included_in_packages.includes(p.id)}>
                  <input type="checkbox" checked={e.included_in_packages.includes(p.id)} onChange={() => csomagValt(p.id)} />
                  <span>{p.name}</span>
                </label>
              ))}
              <label className="jelolo" data-aktiv={e.included_in_full_service}>
                <input type="checkbox" checked={e.included_in_full_service}
                       onChange={(x) => csendben({ included_in_full_service: x.target.checked })} />
                <span>Full Service</span>
              </label>
            </div>
          </div>
          <div className="sor-2">
            <label className="jelolo" data-aktiv={e.active}>
              <input type="checkbox" checked={e.active} onChange={(x) => csendben({ active: x.target.checked })} />
              <span>Aktív: látszik a publikus oldalon és a foglalásnál</span>
            </label>
            <div className="mezo">
              <span className="cimke">Száradási idő (perc)</span>
              <SzamMezo cimke={`${e.name} száradási ideje`} ertek={e.rest_minutes} suffix="perc" lepes={30}
                        hianyzoJelzes={false} onMent={(v) => ment({ rest_minutes: v ?? 0 })} />
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
          <div className="egyeb-torles">
            <button type="button" className="btn btn-kicsi btn-veszelyes" onClick={onTorol}>Szolgáltatás törlése</button>
          </div>
        </div>
      )}
    </div>
  )
}

function UjExtra({ onKesz }: { onKesz: () => Promise<void> }) {
  const { data } = useApp()
  const [nyitva, setNyitva] = useState(false)
  const [nev, setNev] = useState('')
  const [hely, setHely] = useState<ServiceArea>('KULSO')
  const [ar, setAr] = useState('')
  const [perc, setPerc] = useState('')
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const nevMezo = useRef<HTMLInputElement>(null)
  useEffect(() => { if (nyitva) urlapMegnyilt(nevMezo.current) }, [nyitva])

  function bezar() {
    setNyitva(false); setNev(''); setHely('KULSO'); setAr(''); setPerc(''); setHiba(null)
  }

  async function ment() {
    if (!nev.trim() || megy) return
    setMegy(true)
    setHiba(null)
    try {
      await data.createExtra({
        name: nev.trim(),
        area: hely,
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
      <div className="uj-extra-sor">
        <div className="mezo">
          <label htmlFor="uj-extra-nev">Név</label>
          <input id="uj-extra-nev" ref={nevMezo} className="beviteli" value={nev} disabled={megy}
                 onChange={(e) => setNev(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') void ment() }} />
        </div>
        <div className="mezo">
          <label htmlFor="uj-extra-hely">Hely</label>
          <select id="uj-extra-hely" className="beviteli" value={hely} disabled={megy}
                  onChange={(e) => setHely(e.target.value as ServiceArea)}>
            {HELYEK.map((h) => <option key={h.kulcs} value={h.kulcs}>{h.cim}</option>)}
          </select>
        </div>
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
