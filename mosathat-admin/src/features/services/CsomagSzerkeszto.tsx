import { useEffect, useMemo, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { hibaSzoveg } from '../../lib/format'
import type { CsomagSzerkesztoAdat, ServiceArea, SzerkesztoCsomag, SzerkesztoSor } from '../../lib/types'
import Csuszka from '../common/Csuszka'

interface Sor extends SzerkesztoSor {
  kulcs: string
}

interface Vazlat {
  csomagok: SzerkesztoCsomag[]
  sorok: Sor[]
}

const TERULETEK: { kulcs: ServiceArea; cim: string }[] = [
  { kulcs: 'KULSO', cim: 'Kívül' },
  { kulcs: 'BELSO', cim: 'Belül' },
]

let szamlalo = 0
const ujKulcs = () => `uj-${++szamlalo}`

function vazlatbol(a: CsomagSzerkesztoAdat): Vazlat {
  return {
    csomagok: a.csomagok.map((c) => ({ ...c, description: c.description ?? '' })),
    sorok: a.sorok.map((s) => ({ ...s, kulcs: s.id ?? ujKulcs() })),
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
    csomagok: v.csomagok.map((c) => ({ ...c, name: c.name.trim(), description: (c.description ?? '').trim() || null })),
    sorok: sorrend.map(({ kulcs: _k, ...s }) => ({
      ...s,
      name: s.name.trim(),
      cellak: Object.fromEntries(Object.entries(s.cellak)
        .filter(([id]) => ids.has(id))
        .map(([id, c]) => [id, { ...c, name: c.name.trim() || s.name.trim() }])),
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
    return null
  }, [v])

  if (hiba && !v) return <div className="hibauzenet">{hiba}</div>
  if (!v) return <div className="betolt">Betöltés…</div>

  const csomagok = v.csomagok

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

  function cellaValt(kulcs: string, csomagId: string, f: (c: { name: string; active: boolean }) => { name: string; active: boolean }) {
    sorValt(kulcs, (s) => {
      const regi = s.cellak[csomagId] ?? { name: s.name, active: false }
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
        kulcs, id: null, name: '', area,
        cellak: Object.fromEntries(x.csomagok.map((c) => [c.id, { name: '', active: false }])),
      }],
    })
    window.setTimeout(() => document.getElementById(`sor-${kulcs}`)?.focus(), 0)
  }

  function csomagValt(id: string, mezo: 'name' | 'description', ertek: string) {
    setUzenet(null)
    setV((x) => x && { ...x, csomagok: x.csomagok.map((c) => (c.id === id ? { ...c, [mezo]: ertek } : c)) })
  }

  function automatikus(c: SzerkesztoCsomag): string {
    const alap = csomagok.find((x) => x.id === c.includes_package_id)
    if (!alap) return ''
    const plusz = TERULETEK.flatMap((t) => v!.sorok.filter((s) => s.area === t.kulcs))
      .filter((s) => {
        const sajat = s.cellak[c.id]
        const alapCella = s.cellak[alap.id]
        if (!sajat?.active) return false
        return !(alapCella?.active && (alapCella.name || s.name) === (sajat.name || s.name))
      })
      .map((s) => s.cellak[c.id].name || s.name)
    if (!plusz.length) return ''
    return `Üresen hagyva: ${alap.name || 'névtelen'} mindene, plusz: ${plusz.join(', ')}`
  }

  function ujCsomag() {
    setUzenet(null)
    const id = ujAzonosito()
    setV((x) => x && {
      csomagok: [...x.csomagok, { id, code: null, name: '', description: '', includes_package_id: null, hasznalt: false }],
      sorok: x.sorok.map((s) => ({ ...s, cellak: { ...s.cellak, [id]: { name: '', active: false } } })),
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

  return (
    <div className="csomag-szerk">
      <div className="panel panelek-szeles">
        <h3 className="szerk-fej">
          Csomagtartalom
          <button type="button" className="btn btn-kicsi" onClick={ujCsomag}>+ Új csomag (oszlop)</button>
        </h3>
        <div className="panel-torzs">
          <div className="tablagorgo">
            <table className="lista szerk-tabla" data-sok={csomagok.length >= 4 || undefined}>
              <thead>
                <tr>
                  <th>Munkalépés</th>
                  {csomagok.map((c) => (
                    <th key={c.id} data-uj={!c.code || undefined}>{c.name || <span className="szerk-nevtelen">névtelen</span>}</th>
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
                        </th>
                        {csomagok.map((c) => {
                          const cella = s.cellak[c.id] ?? { name: s.name, active: false }
                          return (
                            <td key={c.id} data-be={cella.active || undefined}>
                              <div className="szerk-cella">
                                <input
                                  className="beviteli"
                                  aria-label={`${s.name || 'Új sor'} neve: ${c.name}`}
                                  placeholder={s.name || 'Név'}
                                  value={cella.name === s.name ? '' : cella.name}
                                  onChange={(e) => cellaValt(s.kulcs, c.id, (x) => ({ ...x, name: e.target.value || s.name }))}
                                />
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
                    <tr className="szerk-uj">
                      <td colSpan={csomagok.length + 1}>
                        <button type="button" className="btn btn-kicsi" onClick={() => ujSor(t.kulcs)}>
                          + Új sor ({t.cim.toLowerCase()})
                        </button>
                      </td>
                    </tr>
                  </tbody>
                )
              })}
            </table>
          </div>
          <p className="halk szerk-tipp">
            Üres cellanévnél a sor neve érvényes. Ha egy csomag ugyanazt a munkát másképp végzi,
            írd be a cellába a saját nevét (például Falc mélytisztítás).
          </p>
        </div>
      </div>

      <div className="panel panelek-szeles">
        <h3>Csomagok neve és leírása</h3>
        <div className="panel-torzs szerk-csomagok">
          {csomagok.map((c, i) => (
            <div className="szerk-csomag" key={c.id} data-uj={!c.code || undefined}>
              <div className="szerk-csomag-fej">
                <span className="szerk-csomag-szam">{i + 1}. oszlop{!c.code && ' · új'}</span>
                <button type="button" className="btn btn-kicsi" aria-label={`${c.name || 'Új csomag'} balra`}
                        disabled={i === 0} onClick={() => csomagMozgat(c.id, -1)}>Balra</button>
                <button type="button" className="btn btn-kicsi" aria-label={`${c.name || 'Új csomag'} jobbra`}
                        disabled={i === csomagok.length - 1} onClick={() => csomagMozgat(c.id, 1)}>Jobbra</button>
                <button type="button" className="btn btn-kicsi btn-veszelyes" disabled={csomagok.length === 1}
                        title={c.hasznalt ? 'Van hozzá foglalás, ezért mentéskor csak kivezetjük: eltűnik mindenhonnan, a régi foglalások megtartják.' : undefined}
                        onClick={() => csomagTorol(c.id)}>
                  {c.hasznalt ? 'Kivezetés' : 'Törlés'}
                </button>
              </div>
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
                <textarea id={`csl-${c.id}`} className="beviteli" rows={3} value={c.description ?? ''}
                          placeholder={automatikus(c)}
                          onChange={(e) => csomagValt(c.id, 'description', e.target.value)} />
              </div>
            </div>
          ))}
        </div>
        {csomagok.some((c) => !c.code) && (
          <p className="halk szerk-tipp">
            Az új csomag árait mentés után a Csomagok és árak fülön tudod megadni. Amíg nincs ára,
            foglalásnál „árajánlat alapján” jelenik meg.
          </p>
        )}
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
