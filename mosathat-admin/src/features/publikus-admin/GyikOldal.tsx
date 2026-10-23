import { useCallback, useEffect, useMemo, useState } from 'react'

import './gyik-admin.css'
import { useApp } from '../../state/AppContext'
import { useMentetlen } from '../../state/useMentetlen'
import { hibaSzoveg } from '../../lib/format'
import { GYIK_KATEGORIAK, uresValasz, type GyikAdmin, type GyikKategoria, type GyikMod, type GyikSor } from '../../lib/gyik'
import type { Nyelv } from '../../lib/nyelv'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import SzovegSzerkeszto from '../common/SzovegSzerkeszto'
import { Mezo, PubFej, useMentes } from './kozos'

const KAT_NEV: Record<GyikKategoria, string> = { KULSO: 'Külső', BELSO: 'Belső', EGYEB: 'Egyéb' }

type Szuro = 'MIND' | GyikKategoria | 'PISZKOZAT'

interface Vazlat {
  id: string | null
  kerdes: string
  valasz: string
  kerdes_en: string
  valasz_en: string
  kategoria: GyikKategoria
  kiemelt: boolean
  publikalt: boolean
}

const UJ: Vazlat = { id: null, kerdes: '', valasz: '', kerdes_en: '', valasz_en: '', kategoria: 'KULSO', kiemelt: false, publikalt: false }

function vazlatbol(k: GyikSor): Vazlat {
  return {
    id: k.id, kerdes: k.kerdes, valasz: k.valasz, kerdes_en: k.kerdes_en ?? '', valasz_en: k.valasz_en ?? '',
    kategoria: k.kategoria, kiemelt: k.kiemelt, publikalt: k.publikalt,
  }
}

const tartalma = (v: Vazlat) => JSON.stringify([v.kerdes.trim(), v.valasz, v.kerdes_en.trim(), v.valasz_en, v.kategoria, v.kiemelt])

function datum(s?: string | null) {
  if (!s) return ''
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(s))
}

function Csillag({ be, tiltva, onClick, cim }: { be: boolean; tiltva?: boolean; onClick: () => void; cim: string }) {
  return (
    <button type="button" className="gyik-csillag" aria-pressed={be} aria-label={cim} title={cim} disabled={tiltva} onClick={onClick} />
  )
}

function Beallitas({ adat, onMentve }: { adat: GyikAdmin; onMentve: () => Promise<void> }) {
  const { data } = useApp()
  const [mod, setMod] = useState<GyikMod>(adat.mod)
  const [max, setMax] = useState(String(adat.max))
  const [alap, setAlap] = useState(adat)
  const { allapot, fut } = useMentes()
  if (alap !== adat) {
    setAlap(adat)
    setMod(adat.mod)
    setMax(String(adat.max))
  }
  const szam = Number(max)
  const jo = Number.isInteger(szam) && szam >= 1 && szam <= 20
  const valtozott = mod !== adat.mod || szam !== adat.max
  const publikalt = adat.kerdesek.filter((k) => k.publikalt)
  const kiemelt = publikalt.filter((k) => k.kiemelt)
  const fooldalon = mod === 'VELETLEN' ? Math.min(szam || 0, publikalt.length) : Math.min(szam || 0, (kiemelt.length || publikalt.length))

  return (
    <section className="panel gyik-beallitas">
      <h3>Főoldal</h3>
      <div className="panel-torzs">
        <div className="gyik-modok" role="radiogroup" aria-label="Melyik kérdések legyenek a főoldalon">
          {([
            ['VALOGATOTT', 'Kiválasztott kérdések', 'A csillaggal jelölt kérdések, a lista sorrendjében.'],
            ['VELETLEN', 'Véletlenszerű', 'Minden oldalbetöltéskor mások, a publikált kérdések közül.'],
          ] as const).map(([k, cim, leiras]) => (
            <label key={k} className="gyik-mod" data-valasztva={mod === k || undefined} aria-label={cim}>
              <input type="radio" name="gyik-mod" checked={mod === k} onChange={() => setMod(k)} />
              <span><strong>{cim}</strong><small>{leiras}</small></span>
            </label>
          ))}
          <Mezo cimke="Legfeljebb ennyi kérdés">
            <input className="beviteli gyik-max" type="number" min={1} max={20} value={max} data-mezo="gyik-max"
                   onChange={(e) => setMax(e.target.value)} />
          </Mezo>
        </div>
        <p className="halk gyik-osszegzes">
          {publikalt.length === 0
            ? 'Még nincs publikált kérdés, ezért a szakasz most nem látszik a publikus oldalon.'
            : `A főoldalon ${fooldalon} kérdés látszik${publikalt.length > fooldalon ? `, a többi ${publikalt.length - fooldalon} a További kérdések gomb mögötti oldalon` : ''}.`}
          {mod === 'VALOGATOTT' && publikalt.length > 0 && kiemelt.length === 0 && ' Nincs csillaggal jelölt kérdés, ezért a lista elejéről jelennek meg.'}
          {mod === 'VALOGATOTT' && jo && kiemelt.length > szam && ` ${kiemelt.length} csillagos kérdés van, ebből az első ${szam} látszik.`}
        </p>
        <div className="gyik-beallitas-gombok">
          {allapot === 'megy' && <span className="halk">Mentés…</span>}
          {allapot === 'kesz' && <span className="pub-mentve">Mentve</span>}
          {allapot && allapot !== 'megy' && allapot !== 'kesz' && <span className="pub-hiba">{allapot}</span>}
          {!jo && <span className="pub-hiba">1 és 20 között adj meg számot.</span>}
          <button type="button" className="btn btn-fo btn-kicsi" disabled={!valtozott || !jo || allapot === 'megy'}
                  onClick={() => void fut(async () => { await data.gyikBeallitas(mod, szam); await onMentve() })}>
            Mentés
          </button>
        </div>
      </div>
    </section>
  )
}

export default function GyikAdminOldal() {
  const { data } = useApp()
  const [adat, setAdat] = useState<GyikAdmin | null>(null)
  const [toltHiba, setToltHiba] = useState('')
  const [szuro, setSzuro] = useState<Szuro>('MIND')
  const [v, setV] = useState<Vazlat | null>(null)
  const [eredeti, setEredeti] = useState<Vazlat | null>(null)
  const [nyelv, setNyelv] = useState<Nyelv>('hu')
  const [kulcs, setKulcs] = useState(0)
  const [fuggo, setFuggo] = useState<Vazlat | 'bezar' | null>(null)
  const [torles, setTorles] = useState(false)
  const [listaHiba, setListaHiba] = useState('')
  const { allapot, fut } = useMentes()

  const frissit = useCallback(async () => { setAdat(await data.gyikLista()) }, [data])
  useEffect(() => {
    let el = true
    data.gyikLista().then((a) => { if (el) setAdat(a) }).catch((e: unknown) => { if (el) setToltHiba(hibaSzoveg(e)) })
    return () => { el = false }
  }, [data])

  const piszkos = v !== null && eredeti !== null && tartalma(v) !== tartalma(eredeti)
  useMentetlen(piszkos)

  const lista = useMemo(() => adat?.kerdesek ?? [], [adat])
  const latszik = lista.filter((k) => (szuro === 'MIND' ? true : szuro === 'PISZKOZAT' ? !k.publikalt : k.kategoria === szuro))

  if (toltHiba) return <div className="oldal pub-oldal"><p className="pub-hiba">{toltHiba}</p></div>
  if (!adat) return <div className="betolt">Betöltés…</div>

  const megnyit = (uj: Vazlat | 'bezar') => {
    if (piszkos) { setFuggo(uj); return }
    setFuggo(null)
    setTorles(false)
    if (uj === 'bezar') { setV(null); setEredeti(null); return }
    setV(uj)
    setEredeti(uj)
    setNyelv('hu')
    setKulcs((x) => x + 1)
  }

  const listaMuvelet = async (f: () => Promise<void>) => {
    setListaHiba('')
    try { await f(); await frissit() } catch (e) { setListaHiba(hibaSzoveg(e)) }
  }

  const mozgat = (id: string, irany: -1 | 1) => void listaMuvelet(async () => {
    const i = latszik.findIndex((k) => k.id === id)
    const masik = latszik[i + irany]
    if (!masik) return
    const ids = lista.map((k) => k.id)
    const a = ids.indexOf(id)
    const b = ids.indexOf(masik.id)
    ;[ids[a], ids[b]] = [ids[b], ids[a]]
    setAdat({ ...adat, kerdesek: ids.map((x) => lista.find((k) => k.id === x)!) })
    await data.gyikSorrend(ids)
  })

  const kiemel = (k: GyikSor) => void listaMuvelet(async () => {
    await data.gyikMentes({ ...k, kiemelt: !k.kiemelt })
    if (v?.id === k.id && eredeti) {
      setV({ ...v, kiemelt: !k.kiemelt })
      setEredeti({ ...eredeti, kiemelt: !k.kiemelt })
    }
  })

  const ment = (publikalt: boolean) => {
    if (!v) return
    void fut(async () => {
      const id = await data.gyikMentes({
        id: v.id ?? undefined, kerdes: v.kerdes, valasz: v.valasz, kerdes_en: v.kerdes_en, valasz_en: v.valasz_en,
        kategoria: v.kategoria, kiemelt: v.kiemelt, publikalt,
      })
      const uj = { ...v, id, publikalt, kerdes: v.kerdes.trim(), kerdes_en: v.kerdes_en.trim() }
      setV(uj)
      setEredeti(uj)
      await frissit()
    })
  }

  const torol = () => {
    if (!v?.id) return
    const id = v.id
    void fut(async () => {
      await data.gyikTorles(id)
      setV(null)
      setEredeti(null)
      setTorles(false)
      await frissit()
    })
  }

  const kepFel = (f: File) => data.gyikKepFeltoltes(f)
  const sajat = v?.id ? lista.find((k) => k.id === v.id) : undefined
  const valaszUres = v ? uresValasz(v.valasz) : true
  const kerdesRovid = v ? v.kerdes.trim().length < 3 : true
  const szamol = (s: Szuro) => lista.filter((k) => (s === 'MIND' ? true : s === 'PISZKOZAT' ? !k.publikalt : k.kategoria === s)).length

  return (
    <div className="oldal pub-oldal gyik-admin-oldal">
      <PubFej
        cim="Gyakran ismételt kérdések"
        alcim="A kérdések a publikus oldalon a lábléc fölött, lenyíló listában jelennek meg, a többi a További kérdések gomb mögötti aloldalon, kategóriák szerint. Csak a publikált kérdések látszanak."
        linkek={[['Publikus oldal megnyitása', '/publikus#gyik'], ['Aloldal megnyitása', '/gyik']]}
      />

      <Beallitas adat={adat} onMentve={frissit} />

      <div className="gyik-admin">
        <section className="panel gyik-lista-panel">
          <h3>
            Kérdések
            <button type="button" className="btn btn-kicsi btn-fo gyik-uj" onClick={() => megnyit({ ...UJ, kategoria: szuro === 'BELSO' || szuro === 'EGYEB' ? szuro : 'KULSO' })}>
              + Új kérdés
            </button>
          </h3>
          <div className="panel-torzs">
            <div className="gyik-szurok" role="group" aria-label="Szűrés">
              {(['MIND', ...GYIK_KATEGORIAK, 'PISZKOZAT'] as Szuro[]).map((s) => (
                <button key={s} type="button" className="gyik-szuro" aria-pressed={szuro === s} onClick={() => setSzuro(s)}>
                  {s === 'MIND' ? 'Összes' : s === 'PISZKOZAT' ? 'Piszkozatok' : KAT_NEV[s]} <span>{szamol(s)}</span>
                </button>
              ))}
            </div>
            {listaHiba && <p className="pub-hiba">{listaHiba}</p>}
            {latszik.length === 0 && <p className="halk">Itt még nincs kérdés.</p>}
            <ol className="gyik-sorok">
              {latszik.map((k, i) => (
                <li key={k.id} className="gyik-sor" data-aktiv={v?.id === k.id || undefined} data-piszkozat={!k.publikalt || undefined}>
                  <div className="gyik-sor-mozgat">
                    <button type="button" className="btn btn-kicsi btn-csendes" aria-label="Feljebb" disabled={i === 0} onClick={() => mozgat(k.id, -1)}>Fel</button>
                    <button type="button" className="btn btn-kicsi btn-csendes" aria-label="Lejjebb" disabled={i === latszik.length - 1} onClick={() => mozgat(k.id, 1)}>Le</button>
                  </div>
                  <button type="button" className="gyik-sor-nyit" onClick={() => megnyit(vazlatbol(k))}>
                    <span className="gyik-sor-kerdes">{k.kerdes}</span>
                    <span className="gyik-sor-meta">
                      <span className="gyik-cimke" data-kat={k.kategoria}>{KAT_NEV[k.kategoria]}</span>
                      <span className="gyik-allapot" data-allapot={k.publikalt ? 'kint' : 'piszkozat'}>
                        {k.publikalt ? `Publikálva ${datum(k.publikalva_at)}` : 'Piszkozat'}
                      </span>
                      {!k.kerdes_en && <span className="halk">nincs angolul</span>}
                    </span>
                  </button>
                  <Csillag be={k.kiemelt} tiltva={adat.mod === 'VELETLEN'} onClick={() => kiemel(k)}
                           cim={adat.mod === 'VELETLEN' ? 'Véletlenszerű módban a csillag nem számít' : k.kiemelt ? 'Levétel a főoldalról' : 'Főoldalra'} />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="panel gyik-szerkeszto-panel" data-nyelv={nyelv}>
          {!v ? (
            <div className="panel-torzs gyik-ures">
              <p>Válassz egy kérdést a listából, vagy írj újat.</p>
              <button type="button" className="btn btn-kicsi" onClick={() => megnyit({ ...UJ })}>+ Új kérdés</button>
            </div>
          ) : (
            <>
              <h3>
                {v.id ? 'Kérdés szerkesztése' : 'Új kérdés'}
                <span className="gyik-allapot" data-allapot={v.publikalt ? 'kint' : 'piszkozat'}>
                  {v.publikalt ? (piszkos ? 'Publikálva, nem mentett módosítással' : 'Publikálva') : 'Piszkozat'}
                </span>
                <NyelvKapcsolo nyelv={nyelv} onValt={setNyelv} cimke="Kérdés és válasz" />
              </h3>
              <div className="panel-torzs pub-mezok">
                {fuggo && (
                  <div className="gyik-figyelem" role="alert">
                    <span>Nem mentett módosítás van ennél a kérdésnél.</span>
                    <button type="button" className="btn btn-kicsi" onClick={() => {
                      const cel = fuggo
                      setFuggo(null)
                      setEredeti(v)
                      if (cel === 'bezar') { setV(null); setEredeti(null) } else { setV(cel); setEredeti(cel); setNyelv('hu'); setKulcs((x) => x + 1) }
                    }}>Elvetem</button>
                    <button type="button" className="btn btn-kicsi btn-csendes" onClick={() => setFuggo(null)}>Maradok</button>
                  </div>
                )}
                {nyelv === 'hu' ? (
                  <>
                    <Mezo cimke="Kérdés">
                      <input className="beviteli" value={v.kerdes} maxLength={300} placeholder="pl. Mennyi ideig tart egy mosás?" data-mezo="kerdes"
                             onChange={(e) => setV({ ...v, kerdes: e.target.value })} />
                    </Mezo>
                    <div className="mezo pub-mezo">
                      <span>Kategória</span>
                      <div className="gyik-katok" role="radiogroup" aria-label="Kategória">
                        {GYIK_KATEGORIAK.map((k) => (
                          <button key={k} type="button" role="radio" aria-checked={v.kategoria === k} className="gyik-kat"
                                  onClick={() => setV({ ...v, kategoria: k })}>{KAT_NEV[k]}</button>
                        ))}
                      </div>
                    </div>
                    <div className="mezo pub-mezo">
                      <span>Válasz</span>
                      <SzovegSzerkeszto key={`hu-${kulcs}`} ertek={v.valasz} onValtozik={(h) => setV((x) => (x ? { ...x, valasz: h } : x))}
                                        onKep={kepFel} cimke="Válasz" helykitolto="Írd ide a választ. Képet a kép gombbal, vagy behúzva, beillesztve is tehetsz bele." />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="halk pub-megjegyzes">
                      Nem kötelező. Ha üresen hagyod, az angol oldalon a magyar kérdés és válasz jelenik meg.
                    </p>
                    <Mezo cimke="Kérdés angolul" sugo={`Magyarul: ${v.kerdes || '—'}`}>
                      <input className="beviteli" lang="en" value={v.kerdes_en} maxLength={300} data-mezo="kerdes_en"
                             onChange={(e) => setV({ ...v, kerdes_en: e.target.value })} />
                    </Mezo>
                    <div className="mezo pub-mezo">
                      <span>Válasz angolul</span>
                      <SzovegSzerkeszto key={`en-${kulcs}`} ertek={v.valasz_en} lang="en" onValtozik={(h) => setV((x) => (x ? { ...x, valasz_en: h } : x))}
                                        onKep={kepFel} cimke="Válasz angolul" helykitolto="The answer in English." />
                    </div>
                  </>
                )}
                <label className="pub-pipa">
                  <input type="checkbox" checked={v.kiemelt} disabled={adat.mod === 'VELETLEN'} onChange={(e) => setV({ ...v, kiemelt: e.target.checked })} />
                  <span>
                    Megjelenik a főoldalon is
                    <small className="halk">
                      {adat.mod === 'VELETLEN' ? 'Most véletlenszerű a főoldal, ezért ez nem számít.' : 'A többi kérdés a További kérdések oldalon látszik.'}
                    </small>
                  </span>
                </label>

                <div className="gyik-gombok">
                  {allapot === 'megy' && <span className="halk">Mentés…</span>}
                  {allapot === 'kesz' && <span className="pub-mentve">{v.publikalt ? 'Mentve, a publikus oldalon már látszik' : 'Mentve piszkozatként'}</span>}
                  {allapot && allapot !== 'megy' && allapot !== 'kesz' && <span className="pub-hiba">{allapot}</span>}
                  {kerdesRovid && <span className="halk">Írd be a kérdést.</span>}
                  {!kerdesRovid && valaszUres && <span className="halk">Válasz nélkül csak piszkozatként menthető.</span>}
                  <span className="gyik-gombok-tag" />
                  {v.publikalt ? (
                    <>
                      <button type="button" className="btn" disabled={allapot === 'megy'} onClick={() => ment(false)}>Visszavonás a publikus oldalról</button>
                      <button type="button" className="btn btn-fo" disabled={!piszkos || kerdesRovid || valaszUres || allapot === 'megy'} onClick={() => ment(true)}>Mentés</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn" disabled={(!piszkos && v.id !== null) || kerdesRovid || allapot === 'megy'} onClick={() => ment(false)}>
                        Mentés piszkozatként
                      </button>
                      <button type="button" className="btn btn-fo" disabled={kerdesRovid || valaszUres || allapot === 'megy'} onClick={() => ment(true)}>Publikálás</button>
                    </>
                  )}
                </div>
                <div className="gyik-also">
                  {v.id && !torles && <button type="button" className="btn btn-kicsi btn-csendes gyik-torles" onClick={() => setTorles(true)}>Törlés</button>}
                  {torles && (
                    <span className="gyik-torles-kerdes">
                      Biztosan törlöd ezt a kérdést? Ez nem vonható vissza.
                      <button type="button" className="btn btn-kicsi gyik-torles-igen" onClick={torol}>Igen, törlöm</button>
                      <button type="button" className="btn btn-kicsi btn-csendes" onClick={() => setTorles(false)}>Mégse</button>
                    </span>
                  )}
                  {sajat?.updated_at && <span className="halk">Utoljára módosítva: {datum(sajat.updated_at)}</span>}
                  <button type="button" className="btn btn-kicsi btn-csendes" onClick={() => megnyit('bezar')}>Bezárás</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
