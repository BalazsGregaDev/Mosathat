import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import './bejelentes-admin.css'
import { useApp } from '../../state/AppContext'
import { useMentes } from '../../state/useMentes'
import { useMentetlen } from '../../state/useMentetlen'
import {
  ALLAPOT_CIMKE, bejelentesNev, helyiIdo, idoszakCimke, idoszakUtkozik, idozitesAllapot, idozitesSorrend, isoIdo, ujBejelentes,
  type Bejelentes, type BejelentesTipus,
} from '../../lib/bejelentes'
import { hibaSzoveg, idoMost } from '../../lib/format'
import type { Nyelv } from '../../lib/nyelv'
import { useKerdes } from '../common/Kerdes'
import IdoMezo from '../common/IdoMezo'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import { PubFej } from './kozos'

const UJ = 'uj'

export type Valt = (patch: Partial<Bejelentes> | ((x: Bejelentes) => Partial<Bejelentes>)) => void

export interface IdozitesekProps {
  tipus: BejelentesTipus
  cim: string
  alcim: string
  ujFelirat: string
  tartalomHiba: (v: Bejelentes) => string | null
  urlap: (v: Bejelentes, valt: Valt) => ReactNode
  elonezet: (v: Bejelentes, nyelv: Nyelv) => ReactNode
  elonezetEszkoz?: ReactNode
  feltoltes?: number
}

function tisztit(v: Bejelentes): Bejelentes {
  return {
    ...v, cim: v.cim.trim(), szoveg: v.szoveg.trim(), cim_en: v.cim_en.trim(), szoveg_en: v.szoveg_en.trim(),
  }
}

const NEGYEDEK = [0, 15, 30, 45]
const ORAK = Array.from({ length: 24 }, (_, i) => i)

function maiNap(): string {
  return helyiIdo(new Date(idoMost()).toISOString()).slice(0, 10)
}

function IdoPont({ cimke, mezo, ertek, alapOra, ures, torlo, onValt }: {
  cimke: string
  mezo: string
  ertek: string | null
  alapOra: string
  ures: string
  torlo: string
  onValt: (iso: string | null) => void
}) {
  const helyi = helyiIdo(ertek)
  const nap = helyi.slice(0, 10)
  const ora = helyi.slice(11, 16)
  return (
    <div className="mezo pub-mezo">
      <span>{cimke}</span>
      <span className="bej-ido-mezo">
        <span className="bej-ido-par">
          <input className="beviteli" type="date" value={nap} aria-label={`${cimke} napja`} data-mezo={`${mezo}-nap`}
                 onChange={(e) => onValt(e.target.value ? isoIdo(`${e.target.value}T${ora || alapOra}`) : null)} />
          <IdoMezo value={ora} ariaLabel={`${cimke} időpontja`} cim={`${cimke} — időpont`} mezo={`${mezo}-ora`}
                   className="beviteli bej-ora" placeholder="óra" egyedi percek={NEGYEDEK} orak={ORAK}
                   onChange={(o) => onValt(o ? isoIdo(`${nap || maiNap()}T${o}`) : null)} />
        </span>
        {ertek
          ? <button type="button" className="btn btn-kicsi btn-csendes" onClick={() => onValt(null)}>{torlo}</button>
          : <small className="halk">{ures}</small>}
      </span>
    </div>
  )
}

const osszevet = (v: Bejelentes) => JSON.stringify({ ...v, updated_at: undefined })

export default function Idozitesek({ tipus, cim, alcim, ujFelirat, tartalomHiba, urlap, elonezet, elonezetEszkoz, feltoltes = 0 }: IdozitesekProps) {
  const { data } = useApp()
  const [lista, setLista] = useState<Bejelentes[] | null>(null)
  const [toltHiba, setToltHiba] = useState('')
  const [nyitott, setNyitott] = useState<string | null>(null)
  const [v, setV] = useState<Bejelentes | null>(null)
  const [eredeti, setEredeti] = useState<Bejelentes | null>(null)
  const [nyelv, setNyelv] = useState<Nyelv>('hu')
  const [most, setMost] = useState(idoMost)
  const { allapot, fut } = useMentes()
  const [kerdesAblak, kerdez] = useKerdes()

  const betolt = useCallback(async () => setLista(await data.bejelentesLista(tipus)), [data, tipus])
  useEffect(() => {
    let el = true
    data.bejelentesLista(tipus)
      .then((l) => { if (el) setLista(l) })
      .catch((e: unknown) => { if (el) setToltHiba(hibaSzoveg(e)) })
    return () => { el = false }
  }, [data, tipus])
  useEffect(() => {
    const t = window.setInterval(() => setMost(idoMost()), 30000)
    return () => window.clearInterval(t)
  }, [])

  const piszkos = v !== null && (eredeti === null || osszevet(v) !== osszevet(eredeti))
  useMentetlen(piszkos || feltoltes > 0)

  const rendezett = useMemo(() => idozitesSorrend(lista ?? [], most), [lista, most])
  const utkozo = useMemo(() => {
    if (!v || !v.aktiv) return null
    return (lista ?? []).find((o) => o.aktiv && o.id !== v.id && idoszakUtkozik(o, v)) ?? null
  }, [v, lista])

  if (toltHiba) return <div className="oldal pub-oldal"><p className="pub-hiba">{toltHiba}</p></div>
  if (lista === null) return <div className="betolt">Betöltés…</div>

  const valt: Valt = (patch) => setV((x) => (x ? { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } : x))

  async function megnyit(kulcs: string | null) {
    const cel = kulcs === nyitott ? null : kulcs
    if (piszkos) {
      const ok = await kerdez({
        cim: 'Nem mentett módosítás', szoveg: 'Ennél az időzítésnél van nem mentett módosítás. Elveted?',
        igen: 'Elvetem', nem: 'Maradok', veszelyes: true,
      })
      if (!ok) return
    }
    setNyitott(cel)
    setNyelv('hu')
    if (cel === null) { setV(null); setEredeti(null); return }
    if (cel === UJ) { setV(ujBejelentes(tipus)); setEredeti(null); return }
    const sor = lista?.find((s) => s.id === cel) ?? null
    setV(sor)
    setEredeti(sor)
  }

  const idoHiba = v && v.kezdes && v.zaras && Date.parse(v.zaras) <= Date.parse(v.kezdes) ? 'A zárásnak a kezdés után kell lennie.' : null
  const tHiba = v ? tartalomHiba(v) : null
  const mentheto = Boolean(v && piszkos && !idoHiba && !tHiba && !utkozo && feltoltes === 0 && allapot !== 'megy')

  const ment = () => {
    if (!v) return
    void fut(async () => {
      const id = await data.bejelentesMentes(tisztit(v))
      const uj = await data.bejelentesLista(tipus)
      setLista(uj)
      const sor = uj.find((s) => s.id === id) ?? null
      setNyitott(id)
      setV(sor)
      setEredeti(sor)
    })
  }

  const torol = async () => {
    if (!v?.id) return
    const ok = await kerdez({ cim: 'Biztosan törlöd?', szoveg: `„${bejelentesNev(v)}” véglegesen törlődik.`, igen: 'Törlés', nem: 'Mégse', veszelyes: true })
    if (!ok) return
    const id = v.id
    void fut(async () => {
      await data.bejelentesTorles(id)
      setNyitott(null)
      setV(null)
      setEredeti(null)
      await betolt()
    })
  }

  const elo = rendezett.find((s) => idozitesAllapot(s, most) === 'MOST')
  const sorok: { kulcs: string; b: Bejelentes }[] = [
    ...(nyitott === UJ && v ? [{ kulcs: UJ, b: v }] : []),
    ...rendezett.map((b) => ({ kulcs: b.id ?? '', b: nyitott === b.id && v ? v : b })),
  ]

  const torzs = v && (
    <div className="bej-idozites-torzs pub-mezok">
      <div className="bej-idozites-ido">
        <label className="pub-pipa bej-kapcsolo">
          <input type="checkbox" checked={v.aktiv} onChange={(e) => valt({ aktiv: e.target.checked })} data-mezo="aktiv" />
          <span>
            Bekapcsolva
            <small className="halk">Kikapcsolva piszkozatként megmarad, és nem ütközik a többivel.</small>
          </span>
        </label>
        <div className="bej-ido-sor">
          <IdoPont cimke="Indítás" mezo="kezdes" ertek={v.kezdes} alapOra="00:00" ures="Üresen: azonnal" torlo="Azonnal"
                   onValt={(x) => valt({ kezdes: x })} />
          <IdoPont cimke="Zárás" mezo="zaras" ertek={v.zaras} alapOra="23:45" ures="Üresen: amíg ki nem kapcsolod" torlo="Visszavonásig"
                   onValt={(x) => valt({ zaras: x })} />
        </div>
        {idoHiba && <p className="pub-hiba" role="alert">{idoHiba}</p>}
        {utkozo && (
          <p className="pub-hiba bej-utkozes" role="alert">
            Ütközik ezzel: „{bejelentesNev(utkozo)}” ({idoszakCimke(utkozo, most)}). Egyszerre csak egy látszhat:
            módosítsd az időszakot, vagy kapcsold ki valamelyiket.
          </p>
        )}
      </div>

      {urlap(v, valt)}

      <div className="bej-idozites-gombok">
        {allapot === 'megy' && <span className="halk">Mentés…</span>}
        {allapot === 'kesz' && !piszkos && <span className="pub-mentve">Mentve</span>}
        {allapot && allapot !== 'megy' && allapot !== 'kesz' && <span className="pub-hiba">{allapot}</span>}
        {!allapot && tHiba && <span className="halk">{tHiba}</span>}
        <span className="bej-gombok-tag" />
        {v.id && <button type="button" className="btn btn-kicsi btn-csendes" onClick={() => void torol()}>Törlés</button>}
        {piszkos && eredeti && <button type="button" className="btn" onClick={() => setV(eredeti)}>Elvetés</button>}
        <button type="button" className="btn btn-fo" disabled={!mentheto} onClick={ment}>Mentés</button>
      </div>
    </div>
  )

  return (
    <div className="oldal pub-oldal">
      {kerdesAblak}
      <PubFej cim={cim} alcim={alcim} linkek={[['Publikus oldal megnyitása', '/publikus']]} />

      <div className="bej-racs">
        <section className="panel">
          <h3>
            Időzítések
            <button type="button" className="btn btn-kicsi btn-fo bej-uj" disabled={nyitott === UJ} onClick={() => void megnyit(UJ)}>
              {ujFelirat}
            </button>
          </h3>
          <div className="panel-torzs">
            <p className="halk pub-megjegyzes bej-most">
              {elo ? <>Most látszik: <strong>{bejelentesNev(elo)}</strong> ({idoszakCimke(elo, most)})</> : 'Most egyik sem látszik a publikus oldalon.'}
            </p>
            {sorok.length === 0 && <p className="halk">Még nincs időzítés.</p>}
            <div className="bej-idozites-lista">
              {sorok.map(({ kulcs, b }) => {
                const all = b.id ? idozitesAllapot(b, most) : null
                const nyitva = nyitott === kulcs
                return (
                  <details key={kulcs} className="bej-idozites" open={nyitva} data-allapot={all ?? 'UJ'} data-nyitva={nyitva || undefined}>
                    <summary onClick={(e) => { e.preventDefault(); void megnyit(kulcs) }}>
                      <span className="bej-idozites-nev">{bejelentesNev(b)}</span>
                      <span className="bej-allapot" data-allapot={all ?? 'UJ'}>{all ? ALLAPOT_CIMKE[all] : 'Új, még nincs mentve'}</span>
                      <span className="bej-idoszak halk">{idoszakCimke(b, most)}</span>
                    </summary>
                    {nyitva && torzs}
                  </details>
                )
              })}
            </div>
          </div>
        </section>

        <section className="panel bej-elonezet">
          <h3>
            Előnézet
            <span className="bej-elonezet-eszkoz">
              {elonezetEszkoz}
              <NyelvKapcsolo nyelv={nyelv} onValt={setNyelv} />
            </span>
          </h3>
          <div className="panel-torzs">
            {v ? (
              <>
                {!v.aktiv && <p className="halk pub-megjegyzes">Kikapcsolva: így nézne ki, ha bekapcsolnád.</p>}
                {elonezet(v, nyelv)}
              </>
            ) : (
              <p className="halk">Nyiss meg egy időzítést a listában, vagy hozz létre újat: itt látod, hogyan nézne ki.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
