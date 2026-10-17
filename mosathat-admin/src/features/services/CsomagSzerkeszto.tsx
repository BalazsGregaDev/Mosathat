import { useEffect, useMemo, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg } from '../../lib/format'
import type { Nyelv } from '../../lib/nyelv'
import type {
  CsomagSzerkesztoAdat, ServiceArea, SzerkesztoCella, SzerkesztoCsomag, SzerkesztoExtra, SzerkesztoSor,
} from '../../lib/types'
import Csuszka from '../common/Csuszka'
import NyelvKapcsolo from '../common/NyelvKapcsolo'

interface Cella {
  name: string
  name_en: string
  active: boolean
}

interface Sor extends Omit<SzerkesztoSor, 'name_en' | 'cellak'> {
  kulcs: string
  name_en: string
  cellak: Record<string, Cella>
}

interface Csomag extends Omit<SzerkesztoCsomag, 'name_en' | 'description_en' | 'description'> {
  description: string
  name_en: string
  description_en: string
}

interface Extra extends Omit<SzerkesztoExtra, 'name_en' | 'description_en' | 'description'> {
  description: string
  name_en: string
  description_en: string
}

interface Vazlat {
  csomagok: Csomag[]
  sorok: Sor[]
  extrak: Extra[]
}

const TERULETEK: { kulcs: ServiceArea; cim: string }[] = [
  { kulcs: 'KULSO', cim: 'Kívül' },
  { kulcs: 'BELSO', cim: 'Belül' },
]

let szamlalo = 0
const ujKulcs = () => `uj-${++szamlalo}`

const ures = (s: string | null | undefined) => s ?? ''
const vagyNull = (s: string) => s.trim() || null

function vazlatbol(a: CsomagSzerkesztoAdat): Vazlat {
  return {
    csomagok: a.csomagok.map((c) => ({
      ...c, description: ures(c.description), name_en: ures(c.name_en), description_en: ures(c.description_en),
    })),
    sorok: a.sorok.map((s) => ({
      ...s,
      kulcs: s.id ?? ujKulcs(),
      name_en: ures(s.name_en),
      cellak: Object.fromEntries(Object.entries(s.cellak).map(([id, c]) => [id, { ...c, name_en: ures(c.name_en) }])),
    })),
    extrak: (a.extrak ?? []).map((e) => ({
      ...e, description: ures(e.description), name_en: ures(e.name_en), description_en: ures(e.description_en),
    })),
  }
}

function ujAzonosito(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`
}

function mentendo(v: Vazlat): CsomagSzerkesztoAdat {
  const sorrend = TERULETEK.flatMap((t) => v.sorok.filter((s) => s.area === t.kulcs))
  const ids = new Set(v.csomagok.map((c) => c.id))
  return {
    csomagok: v.csomagok.map((c) => ({
      ...c,
      name: c.name.trim(),
      description: vagyNull(c.description),
      name_en: vagyNull(c.name_en),
      description_en: vagyNull(c.description_en),
    })),
    sorok: sorrend.map(({ kulcs: _k, ...s }) => ({
      ...s,
      name: s.name.trim(),
      name_en: vagyNull(s.name_en),
      cellak: Object.fromEntries(Object.entries(s.cellak)
        .filter(([id]) => ids.has(id))
        .map(([id, c]): [string, SzerkesztoCella] => [id, {
          name: c.name.trim() || s.name.trim(),
          name_en: c.name_en.trim() && c.name_en.trim() !== s.name_en.trim() ? c.name_en.trim() : null,
          active: c.active,
        }])),
    })),
    extrak: v.extrak.map((e) => ({
      id: e.id,
      name: e.name.trim(),
      description: vagyNull(e.description),
      name_en: vagyNull(e.name_en),
      description_en: vagyNull(e.description_en),
    })),
  }
}

export default function CsomagSzerkeszto() {
  const { data, refreshCatalog, refresh } = useApp()
  const [eredeti, setEredeti] = useState<Vazlat | null>(null)
  const [v, setV] = useState<Vazlat | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)
  const [ment, setMent] = useState(false)
  const [uzenet, setUzenet] = useState<string | null>(null)
  const [tablaNyelv, setTablaNyelv] = useState<Nyelv>('hu')
  const [csomagNyelv, setCsomagNyelv] = useState<Nyelv>('hu')
  const [extraNyelv, setExtraNyelv] = useState<Nyelv>('hu')

  useEffect(() => {
    let el = true
    data.getCsomagSzerkeszto()
      .then((a) => { if (!el) return; const x = vazlatbol(a); setEredeti(x); setV(x) })
      .catch((e) => { if (el) setHiba(hibaSzoveg(e)) })
    return () => { el = false }
  }, [data])

  const valtozott = useMemo(
    () => !!v && !!eredeti && JSON.stringify(mentendo(v)) !== JSON.stringify(mentendo(eredeti)),
    [v, eredeti],
  )

  const hianyos = useMemo(() => {
    if (!v) return null
    if (v.csomagok.some((c) => !c.name.trim())) return 'Minden csomagnak kell név.'
    if (v.sorok.some((s) => !s.name.trim())) return 'Minden sornak kell név.'
    if (v.extrak.some((e) => !e.name.trim())) return 'Minden extrának kell név.'
    return null
  }, [v])

  if (hiba && !v) return <div className="hibauzenet">{hiba}</div>
  if (!v) return <div className="betolt">Betöltés…</div>

  const csomagok = v.csomagok
  const tablaEn = tablaNyelv === 'en'
  const csomagEn = csomagNyelv === 'en'
  const extraEn = extraNyelv === 'en'

  function sorValt(kulcs: string, f: (s: Sor) => Sor) {
    setUzenet(null)
    setV((x) => x && { ...x, sorok: x.sorok.map((s) => (s.kulcs === kulcs ? f(s) : s)) })
  }

  function sorNev(kulcs: string, nev: string) {
    sorValt(kulcs, (s) => ({
      ...s,
      name: nev,
      cellak: Object.fromEntries(Object.entries(s.cellak).map(([id, c]) => [id, c.name === s.name ? { ...c, name: nev } : c])),
    }))
  }

  function cellaValt(kulcs: string, csomagId: string, f: (c: Cella) => Cella) {
    sorValt(kulcs, (s) => {
      const regi = s.cellak[csomagId] ?? { name: s.name, name_en: '', active: false }
      return { ...s, cellak: { ...s.cellak, [csomagId]: f(regi) } }
    })
  }

  function mozgat(kulcs: string, irany: -1 | 1) {
    setUzenet(null)
    setV((x) => {
      if (!x) return x
      const s = x.sorok.find((y) => y.kulcs === kulcs)!
      const csoport = x.sorok.filter((y) => y.area === s.area)
      const i = csoport.indexOf(s)
      const j = i + irany
      if (j < 0 || j >= csoport.length) return x
      const masik = csoport[j]
      const sorok = x.sorok.slice()
      const a = sorok.indexOf(s)
      const b = sorok.indexOf(masik)
      sorok[a] = masik
      sorok[b] = s
      return { ...x, sorok }
    })
  }

  function torol(kulcs: string) {
    setUzenet(null)
    setV((x) => x && { ...x, sorok: x.sorok.filter((s) => s.kulcs !== kulcs) })
  }

  function ujSor(area: ServiceArea) {
    setUzenet(null)
    const kulcs = ujKulcs()
    setV((x) => x && {
      ...x,
      sorok: [...x.sorok, {
        kulcs, id: null, name: '', name_en: '', area,
        cellak: Object.fromEntries(x.csomagok.map((c) => [c.id, { name: '', name_en: '', active: false }])),
      }],
    })
    window.setTimeout(() => document.getElementById(`sor-${kulcs}`)?.focus(), 0)
  }

  function csomagValt(id: string, mezo: 'name' | 'description' | 'name_en' | 'description_en', ertek: string) {
    setUzenet(null)
    setV((x) => x && { ...x, csomagok: x.csomagok.map((c) => (c.id === id ? { ...c, [mezo]: ertek } : c)) })
  }

  function extraValt(id: string, mezo: 'name' | 'description' | 'name_en' | 'description_en', ertek: string) {
    setUzenet(null)
    setV((x) => x && { ...x, extrak: x.extrak.map((e) => (e.id === id ? { ...e, [mezo]: ertek } : e)) })
  }

  const sorNeve = (s: Sor, en: boolean) => (en ? s.name_en.trim() || s.name : s.name)
  const cellaNeve = (s: Sor, c: Cella | undefined, en: boolean) => {
    if (!c) return sorNeve(s, en)
    if (!en) return c.name || s.name
    return c.name_en.trim() || (c.name === s.name ? sorNeve(s, true) : c.name)
  }
  const csomagNeve = (c: Csomag | undefined, en: boolean) => (c ? (en ? c.name_en.trim() || c.name : c.name) : '')

  function automatikus(c: Csomag, en: boolean): string {
    const alap = csomagok.find((x) => x.id === c.includes_package_id)
    if (!alap) return ''
    const plusz = TERULETEK.flatMap((t) => v!.sorok.filter((s) => s.area === t.kulcs))
      .filter((s) => {
        const sajat = s.cellak[c.id]
        const alapCella = s.cellak[alap.id]
        if (!sajat?.active) return false
        return !(alapCella?.active && (alapCella.name || s.name) === (sajat.name || s.name))
      })
      .map((s) => cellaNeve(s, s.cellak[c.id], en))
    if (!plusz.length) return ''
    return en
      ? `Üresen hagyva: Everything in ${csomagNeve(alap, true) || 'unnamed'}, plus: ${plusz.join(', ')}`
      : `Üresen hagyva: ${alap.name || 'névtelen'} mindene, plusz: ${plusz.join(', ')}`
  }

  function ujCsomag() {
    setUzenet(null)
    const id = ujAzonosito()
    setV((x) => x && {
      ...x,
      csomagok: [...x.csomagok, {
        id, code: null, name: '', description: '', name_en: '', description_en: '', includes_package_id: null, hasznalt: false,
      }],
      sorok: x.sorok.map((s) => ({ ...s, cellak: { ...s.cellak, [id]: { name: '', name_en: '', active: false } } })),
    })
    window.setTimeout(() => {
      const el = document.getElementById(`csn-${id}`)
      el?.scrollIntoView({ block: 'center' })
      el?.focus()
    }, 0)
  }

  function csomagTorol(id: string) {
    setUzenet(null)
    setV((x) => x && {
      ...x,
      csomagok: x.csomagok
        .filter((c) => c.id !== id)
        .map((c) => (c.includes_package_id === id ? { ...c, includes_package_id: null } : c)),
    })
  }

  function csomagMozgat(id: string, irany: -1 | 1) {
    setUzenet(null)
    setV((x) => {
      if (!x) return x
      const i = x.csomagok.findIndex((c) => c.id === id)
      const j = i + irany
      if (j < 0 || j >= x.csomagok.length) return x
      const cs = x.csomagok.slice()
      ;[cs[i], cs[j]] = [cs[j], cs[i]]
      return { ...x, csomagok: cs }
    })
  }

  function csomagAlap(id: string, alap: string) {
    setUzenet(null)
    setV((x) => x && { ...x, csomagok: x.csomagok.map((c) => (c.id === id ? { ...c, includes_package_id: alap || null } : c)) })
  }

  async function mentes() {
    if (!v || hianyos) return
    setMent(true)
    setHiba(null)
    try {
      const e = await data.saveCsomagSzerkeszto(mentendo(v))
      const friss = vazlatbol(await data.getCsomagSzerkeszto())
      setEredeti(friss)
      setV(friss)
      await refreshCatalog()
      refresh()
      setUzenet([
        'Mentve.',
        e.frissitett > 0 ? `${e.frissitett} nyitott foglalás munkalapja frissült.` : '',
        e.torolt > 0 ? `${e.torolt} csomag törölve.` : '',
        e.kivezetve.length ? `Kivezetve (van hozzá foglalás, ezért nem törölhető): ${e.kivezetve.join(', ')}.` : '',
      ].filter(Boolean).join(' '))
    } catch (e) {
      setHiba(hibaSzoveg(e))
    } finally {
      setMent(false)
    }
  }

  const hianyzoAngol = v.sorok.some((s) => !s.name_en.trim()
    || Object.values(s.cellak).some((c) => c.active && c.name !== s.name && !c.name_en.trim()))

  return (
    <div className="csomag-szerk">
      <div className="panel panelek-szeles" data-nyelv={tablaNyelv}>
        <h3 className="szerk-fej">
          Csomagtartalom
          <span className="szerk-fej-jobb">
            {!tablaEn && <button type="button" className="btn btn-kicsi" onClick={ujCsomag}>+ Új csomag (oszlop)</button>}
            <NyelvKapcsolo nyelv={tablaNyelv} onValt={setTablaNyelv} cimke="Csomagtartalom" />
          </span>
        </h3>
        <div className="panel-torzs">
          <div className="tablagorgo">
            <table className="lista szerk-tabla" data-sok={csomagok.length >= 4 || undefined} data-nyelv={tablaNyelv}>
              <thead>
                <tr>
                  <th>{tablaEn ? 'Munkalépés angolul' : 'Munkalépés'}</th>
                  {csomagok.map((c) => (
                    <th key={c.id} data-uj={!c.code || undefined}>
                      {csomagNeve(c, tablaEn) || <span className="szerk-nevtelen">névtelen</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              {TERULETEK.map((t) => {
                const csoport = v.sorok.filter((s) => s.area === t.kulcs)
                return (
                  <tbody key={t.kulcs}>
                    <tr className="terulet-sor">
                      <th scope="colgroup" colSpan={csomagok.length + 1}>{t.cim}</th>
                    </tr>
                    {csoport.map((s, i) => (
                      <tr key={s.kulcs} data-sor={s.name}>
                        <th scope="row">
                          {tablaEn ? (
                            <div className="szerk-sor">
                              <input
                                className="beviteli"
                                lang="en"
                                aria-label={`${s.name || 'Új sor'} angolul`}
                                placeholder={s.name || 'Munkalépés angolul'}
                                value={s.name_en}
                                data-hianyzik={!s.name_en.trim() || undefined}
                                onChange={(e) => sorValt(s.kulcs, (x) => ({ ...x, name_en: e.target.value }))}
                              />
                            </div>
                          ) : (
                            <div className="szerk-sor">
                              <input
                                id={`sor-${s.kulcs}`}
                                className="beviteli"
                                aria-label="Munkalépés neve"
                                placeholder="Munkalépés neve"
                                value={s.name}
                                data-ures={!s.name.trim() || undefined}
                                onChange={(e) => sorNev(s.kulcs, e.target.value)}
                              />
                              <div className="szerk-sor-gombok">
                                <select
                                  className="beviteli"
                                  aria-label="Terület"
                                  value={s.area}
                                  onChange={(e) => sorValt(s.kulcs, (x) => ({ ...x, area: e.target.value as ServiceArea }))}
                                >
                                  {TERULETEK.map((x) => <option key={x.kulcs} value={x.kulcs}>{x.cim}</option>)}
                                </select>
                                <button type="button" className="btn btn-kicsi" aria-label="Feljebb"
                                        disabled={i === 0} onClick={() => mozgat(s.kulcs, -1)}>Fel</button>
                                <button type="button" className="btn btn-kicsi" aria-label="Lejjebb"
                                        disabled={i === csoport.length - 1} onClick={() => mozgat(s.kulcs, 1)}>Le</button>
                                <button type="button" className="btn btn-kicsi btn-veszelyes"
                                        onClick={() => torol(s.kulcs)}>Törlés</button>
                              </div>
                            </div>
                          )}
                        </th>
                        {csomagok.map((c) => {
                          const cella = s.cellak[c.id] ?? { name: s.name, name_en: '', active: false }
                          const sajatHu = cella.name !== s.name
                          return (
                            <td key={c.id} data-be={cella.active || undefined}>
                              <div className="szerk-cella">
                                {tablaEn ? (
                                  <input
                                    className="beviteli"
                                    lang="en"
                                    aria-label={`${s.name || 'Új sor'} angolul: ${c.name}`}
                                    placeholder={sajatHu ? cella.name : sorNeve(s, true) || 'Név'}
                                    value={cella.name_en}
                                    data-hianyzik={(cella.active && sajatHu && !cella.name_en.trim()) || undefined}
                                    onChange={(e) => cellaValt(s.kulcs, c.id, (x) => ({ ...x, name_en: e.target.value }))}
                                  />
                                ) : (
                                  <input
                                    className="beviteli"
                                    aria-label={`${s.name || 'Új sor'} neve: ${c.name}`}
                                    placeholder={s.name || 'Név'}
                                    value={cella.name === s.name ? '' : cella.name}
                                    onChange={(e) => cellaValt(s.kulcs, c.id, (x) => ({ ...x, name: e.target.value || s.name }))}
                                  />
                                )}
                                <Csuszka
                                  be={cella.active}
                                  cimke={`${s.name || 'Új sor'}: ${c.name}`}
                                  onValt={(be) => cellaValt(s.kulcs, c.id, (x) => ({ ...x, active: be }))}
                                />
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    {!tablaEn && (
                      <tr className="szerk-uj">
                        <td colSpan={csomagok.length + 1}>
                          <button type="button" className="btn btn-kicsi" onClick={() => ujSor(t.kulcs)}>
                            + Új sor ({t.cim.toLowerCase()})
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                )
              })}
            </table>
          </div>
          {tablaEn ? (
            <p className="halk szerk-tipp">
              Az angol táblázat szövegei. Üres cellánál az angol sornév érvényes; ha a magyar cellának saját neve van
              (például Falc mélytisztítás), írd be az angolt is, különben a magyar jelenik meg. A hiányzó fordítások
              narancs kerettel látszanak. Új sort és új csomagot a magyar nézetben vehetsz fel.
              {hianyzoAngol ? '' : ' Most minden sornak és cellának van angol neve.'}
            </p>
          ) : (
            <p className="halk szerk-tipp">
              Üres cellanévnél a sor neve érvényes. Ha egy csomag ugyanazt a munkát másképp végzi,
              írd be a cellába a saját nevét (például Falc mélytisztítás).
            </p>
          )}
        </div>
      </div>

      <div className="panel panelek-szeles" data-nyelv={csomagNyelv}>
        <h3>
          Csomagok neve és leírása
          <NyelvKapcsolo nyelv={csomagNyelv} onValt={setCsomagNyelv} cimke="Csomagok neve és leírása" />
        </h3>
        <div className="panel-torzs szerk-csomagok">
          {csomagok.map((c, i) => (
            <div className="szerk-csomag" key={c.id} data-uj={!c.code || undefined}>
              <div className="szerk-csomag-fej">
                <span className="szerk-csomag-szam">{i + 1}. oszlop{!c.code && ' · új'}{csomagEn && ` · ${c.name}`}</span>
                {!csomagEn && (
                  <>
                    <button type="button" className="btn btn-kicsi" aria-label={`${c.name || 'Új csomag'} balra`}
                            disabled={i === 0} onClick={() => csomagMozgat(c.id, -1)}>Balra</button>
                    <button type="button" className="btn btn-kicsi" aria-label={`${c.name || 'Új csomag'} jobbra`}
                            disabled={i === csomagok.length - 1} onClick={() => csomagMozgat(c.id, 1)}>Jobbra</button>
                    <button type="button" className="btn btn-kicsi btn-veszelyes" disabled={csomagok.length === 1}
                            title={c.hasznalt ? 'Van hozzá foglalás, ezért mentéskor csak kivezetjük: eltűnik mindenhonnan, a régi foglalások megtartják.' : undefined}
                            onClick={() => csomagTorol(c.id)}>
                      {c.hasznalt ? 'Kivezetés' : 'Törlés'}
                    </button>
                  </>
                )}
              </div>
              {csomagEn ? (
                <>
                  <div className="mezo">
                    <label htmlFor={`csn-en-${c.id}`}>Név angolul</label>
                    <input id={`csn-en-${c.id}`} className="beviteli" lang="en" value={c.name_en} placeholder={c.name}
                           data-hianyzik={!c.name_en.trim() || undefined}
                           onChange={(e) => csomagValt(c.id, 'name_en', e.target.value)} />
                  </div>
                  <div className="mezo">
                    <label htmlFor={`csl-en-${c.id}`}>Leírás angolul</label>
                    <textarea id={`csl-en-${c.id}`} className="beviteli" lang="en" rows={3} value={c.description_en}
                              placeholder={automatikus(c, true) || c.description}
                              onChange={(e) => csomagValt(c.id, 'description_en', e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <div className="mezo">
                    <label htmlFor={`csn-${c.id}`}>Név</label>
                    <input id={`csn-${c.id}`} className="beviteli" value={c.name}
                           data-ures={!c.name.trim() || undefined}
                           onChange={(e) => csomagValt(c.id, 'name', e.target.value)} />
                  </div>
                  <div className="mezo">
                    <label htmlFor={`csa-${c.id}`}>Erre épül</label>
                    <select id={`csa-${c.id}`} className="beviteli" value={c.includes_package_id ?? ''}
                            onChange={(e) => csomagAlap(c.id, e.target.value)}>
                      <option value="">Semmire (önálló)</option>
                      {csomagok.filter((x) => x.id !== c.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.name || 'névtelen'}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mezo">
                    <label htmlFor={`csl-${c.id}`}>Leírás</label>
                    <textarea id={`csl-${c.id}`} className="beviteli" rows={3} value={c.description}
                              placeholder={automatikus(c, false)}
                              onChange={(e) => csomagValt(c.id, 'description', e.target.value)} />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        {csomagEn ? (
          <p className="halk szerk-tipp">
            Ha az angol név üres, a magyar jelenik meg. Az üresen hagyott angol leírás helyett az angol
            sornevekből összeállított szöveg látszik, ahogy a mezőben halványan olvasható.
          </p>
        ) : csomagok.some((c) => !c.code) && (
          <p className="halk szerk-tipp">
            Az új csomag árait mentés után a Csomagok és árak fülön tudod megadni. Amíg nincs ára,
            foglalásnál „árajánlat alapján” jelenik meg.
          </p>
        )}
      </div>

      <div className="panel panelek-szeles" data-nyelv={extraNyelv}>
        <h3>
          Extrák neve és leírása
          <NyelvKapcsolo nyelv={extraNyelv} onValt={setExtraNyelv} cimke="Extrák neve és leírása" />
        </h3>
        <div className="panel-torzs szerk-extrak">
          {v.extrak.map((e) => (
            <div className="szerk-extra" key={e.id} data-extra={e.id}>
              {extraEn ? (
                <>
                  <input className="beviteli" lang="en" value={e.name_en} placeholder={e.name}
                         aria-label={`${e.name} angolul`} data-hianyzik={!e.name_en.trim() || undefined}
                         onChange={(x) => extraValt(e.id, 'name_en', x.target.value)} />
                  <input className="beviteli szerk-extra-leiras" lang="en" value={e.description_en}
                         placeholder={e.description || 'Rövid leírás angolul (nem kötelező)'}
                         aria-label={`${e.name} leírása angolul`}
                         onChange={(x) => extraValt(e.id, 'description_en', x.target.value)} />
                </>
              ) : (
                <>
                  <input className="beviteli" value={e.name} aria-label="Extra neve" data-ures={!e.name.trim() || undefined}
                         onChange={(x) => extraValt(e.id, 'name', x.target.value)} />
                  <input className="beviteli szerk-extra-leiras" value={e.description} placeholder="Rövid leírás (nem kötelező)"
                         aria-label={`${e.name} leírása`}
                         onChange={(x) => extraValt(e.id, 'description', x.target.value)} />
                </>
              )}
            </div>
          ))}
        </div>
        <p className="halk szerk-tipp szerk-extrak-tipp">
          A foglalás 4. lépésében látszanak. Az árat, az időt és azt, hogy melyik csomagban van benne,
          a Szolgáltatások menüben állíthatod.{extraEn ? ' Ha az angol név üres, a magyar jelenik meg.' : ''}
        </p>
      </div>

      <div className="szerk-lab" data-valtozott={valtozott || undefined}>
        <span className="szerk-allapot" aria-live="polite">
          {hiba ?? hianyos ?? uzenet ?? (valtozott ? 'Mentetlen változások' : 'Nincs változás')}
        </span>
        <button type="button" className="btn" disabled={!valtozott || ment}
                onClick={() => { setV(eredeti); setUzenet(null); setHiba(null) }}>
          Elvetés
        </button>
        <button type="button" className="btn btn-fo" disabled={!valtozott || !!hianyos || ment}
                onClick={() => void mentes()}>
          {ment ? 'Mentés…' : 'Mentés'}
        </button>
      </div>
    </div>
  )
}
