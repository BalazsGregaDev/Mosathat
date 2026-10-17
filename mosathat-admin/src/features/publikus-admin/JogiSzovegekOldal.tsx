import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import { useApp } from '../../state/AppContext'
import { useMentetlen } from '../../state/useMentetlen'
import type { DataSource, PublikusAdat } from '../../data/source'
import { hibaSzoveg } from '../../lib/format'
import type { Nyelv } from '../../lib/nyelv'
import {
  base64be, base64bol, htmlBolBlokkok, JOGI_LAPOK, letoltes,
  type JogiBlokk, type JogiLap, type JogiValtozat,
} from '../../lib/jogiDokumentum'
import { jogiCim, MAX_MERET, wordbe, wordbol, wordFajlnev } from '../../lib/jogiWord'
import { KoncepcioLap } from '../arculat/Koncepcio'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import JogiDokumentum from '../publikus/JogiDokumentum'
import { BeepitettJogi } from '../publikus/JogiOldal'
import { TartalomProvider } from '../publikus/tartalom'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import { PubFej } from './kozos'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const idopont = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Budapest',
})

function mikor(iso: string): string {
  return idopont.format(new Date(iso))
}

function meretSzoveg(b: number | null | undefined): string {
  if (!b) return ''
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

function valtozatNev(v: JogiValtozat | undefined): string {
  return !v || v.beepitett ? 'Beépített szöveg' : v.fajlnev ?? 'Word-fájl'
}

function valtozatReszlet(v: JogiValtozat | undefined, aktiv: boolean): string {
  if (!v || v.beepitett) {
    const alap = 'A Cégadatok menü adataiból áll össze'
    if (!v) return `${alap}, és azokkal együtt frissül.`
    return aktiv
      ? `${alap}, és azokkal együtt frissül. Visszaállította: ${v.aktivalta_nev ?? 'ismeretlen'}, ${mikor(v.aktivalva)}.`
      : `${alap}; letöltéskor a mostani adatokkal készül el.`
  }
  const reszek = [`Feltöltötte: ${v.feltolto_nev ?? 'ismeretlen'}, ${mikor(v.letrehozva)}`]
  if (v.meret) reszek.push(meretSzoveg(v.meret))
  const visszaallitva = new Date(v.aktivalva).getTime() !== new Date(v.letrehozva).getTime()
  if (aktiv && visszaallitva) reszek.push(`visszaállította: ${v.aktivalta_nev ?? 'ismeretlen'}, ${mikor(v.aktivalva)}`)
  return reszek.join(' · ')
}

async function beepitettBlokkok(pub: PublikusAdat, lap: JogiLap, nyelv: Nyelv): Promise<JogiBlokk[]> {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const html = renderToStaticMarkup(
    <TartalomProvider t={pub.tartalom} lemondasOra={pub.lemondasOra} nyelv={nyelv}>
      <BeepitettJogi lap={lap} />
    </TartalomProvider>,
  )
  return htmlBolBlokkok(new DOMParser().parseFromString(html, 'text/html').body)
}

async function valtozatLetoltes(data: DataSource, pub: PublikusAdat | null, lap: JogiLap, nyelv: Nyelv, v: JogiValtozat | undefined) {
  if (v && !v.beepitett) {
    const f = await data.jogiFajl(v.id)
    if (!f.fajl) throw new Error('Ehhez a változathoz nincs fájl.')
    letoltes(new Blob([base64bol(f.fajl)], { type: DOCX }), f.fajlnev ?? wordFajlnev(lap, nyelv))
    return
  }
  if (!pub) throw new Error('A beépített szöveg még töltődik, próbáld újra egy pillanat múlva.')
  letoltes(await wordbe(await beepitettBlokkok(pub, lap, nyelv), lap, nyelv), wordFajlnev(lap, nyelv))
}

interface Ellenorzes {
  fajlnev: string
  meret: number
  fajl: string
  blokkok: JogiBlokk[]
  figyelmeztetesek: string[]
}

type Uzenet = { ok: boolean; szoveg: string } | null

function JogiPanel({ lap, valtozatok, pub, onFrissit }: {
  lap: JogiLap
  valtozatok: JogiValtozat[]
  pub: PublikusAdat | null
  onFrissit: () => Promise<void>
}) {
  const { data } = useApp()
  const [nyelv, setNyelv] = useState<Nyelv>('hu')
  const [ellenorzes, setEllenorzes] = useState<Ellenorzes | null>(null)
  const [munka, setMunka] = useState('')
  const [uzenet, setUzenet] = useState<Uzenet>(null)
  const [huzas, setHuzas] = useState(false)
  const fajlMezo = useRef<HTMLInputElement>(null)
  useMentetlen(ellenorzes !== null)

  const cim = jogiCim(lap, 'hu')
  const sajat = (ny: Nyelv) => valtozatok.filter((v) => v.dokumentum === lap && v.nyelv === ny)
  const lista = sajat(nyelv)
  const aktiv = lista.find((v) => v.aktiv)
  const elozok = lista.filter((v) => !v.aktiv)
  const huAktiv = sajat('hu').find((v) => v.aktiv)
  const angolRegebbi = nyelv === 'en' && huAktiv && !huAktiv.beepitett
    && (!aktiv || aktiv.beepitett || new Date(aktiv.aktivalva) < new Date(huAktiv.aktivalva))
  const nyelvNev = nyelv === 'en' ? 'angol' : 'magyar'
  const elfoglalt = munka !== ''

  const fut = async (mi: string, f: () => Promise<string | void>) => {
    setMunka(mi)
    setUzenet(null)
    try {
      const kesz = await f()
      if (kesz) setUzenet({ ok: true, szoveg: kesz })
    } catch (e) {
      setUzenet({ ok: false, szoveg: hibaSzoveg(e) })
    } finally {
      setMunka('')
    }
  }

  const nyelvValt = (n: Nyelv) => {
    if (ellenorzes) {
      setUzenet({ ok: false, szoveg: 'Előbb tedd közzé vagy vesd el a feltöltött fájlt, utána válts nyelvet.' })
      return
    }
    setNyelv(n)
    setUzenet(null)
  }

  const beolvas = (fajl: File | undefined) => {
    if (!fajl || elfoglalt) return
    void fut('olvas', async () => {
      setEllenorzes(null)
      if (/\.doc$/i.test(fajl.name)) throw new Error('Ez régi .doc formátum. Nyisd meg Wordben, és mentsd el Word-dokumentumként (.docx), azt töltsd fel.')
      if (!/\.docx$/i.test(fajl.name)) throw new Error('Csak Word-dokumentum (.docx) tölthető fel.')
      if (fajl.size > MAX_MERET) throw new Error(`A fájl túl nagy (${meretSzoveg(fajl.size)}), legfeljebb 2 MB lehet. Ha képek vannak benne, töröld ki őket, mert a weboldalon úgysem jelennek meg.`)
      const adat = await fajl.arrayBuffer()
      const { blokkok, figyelmeztetesek } = await wordbol(adat, lap, nyelv)
      setEllenorzes({ fajlnev: fajl.name, meret: fajl.size, fajl: base64be(adat), blokkok, figyelmeztetesek })
    })
  }

  const kozzetesz = () => {
    if (!ellenorzes) return
    const e = ellenorzes
    void fut('kozzetesz', async () => {
      await data.jogiFeltoltes({ dokumentum: lap, nyelv, fajlnev: e.fajlnev, fajl: e.fajl, tartalom: e.blokkok })
      setEllenorzes(null)
      await onFrissit()
      return `Közzétéve. A weboldalon már a(z) ${e.fajlnev} szövege látszik.`
    })
  }

  const visszaallit = (v: JogiValtozat) => {
    void fut(`vissza:${v.id}`, async () => {
      await data.jogiVisszaallitas(v.id)
      await onFrissit()
      return `Visszaállítva: ${valtozatNev(v)}. A weboldalon már ez látszik, az eddigi változat átkerült az előzők közé.`
    })
  }

  const letolt = (v: JogiValtozat | undefined, mi: string) => {
    void fut(mi, async () => { await valtozatLetoltes(data, pub, lap, nyelv, v) })
  }

  const huz = (e: DragEvent<HTMLElement>, be: boolean) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    if (ellenorzes || elfoglalt) return
    setHuzas(be)
  }

  const publikusUt = nyelv === 'en' ? `/${lap}?lang=en` : `/${lap}`
  const mod = pub && pub.arculat === '03' && pub.mod ? pub.mod : 'VILAGOS'

  return (
    <section className="panel jogi-panel" data-lap={lap} data-nyelv={nyelv} data-huzas={huzas || undefined}
             onDragOver={(e) => huz(e, true)} onDragLeave={(e) => huz(e, false)}
             onDrop={(e) => { huz(e, false); if (!ellenorzes) beolvas(e.dataTransfer.files[0]) }}>
      <h3>
        {cim}
        <NyelvKapcsolo nyelv={nyelv} onValt={nyelvValt} cimke={cim} />
      </h3>
      <div className="panel-torzs jogi-torzs">
        <div className="jogi-most">
          <span className="jogi-cimke">Most a weboldalon, {nyelvNev}ul</span>
          <div className="jogi-sor">
            <div className="jogi-adat">
              <strong className="jogi-nev">{valtozatNev(aktiv)}</strong>
              <span className="halk jogi-reszlet">{valtozatReszlet(aktiv, true)}</span>
            </div>
            <div className="jogi-gombok">
              <a className="btn btn-csendes" href={publikusUt} target="_blank" rel="noopener">Megnyitás</a>
              <button type="button" className="btn" disabled={elfoglalt || (!pub && (!aktiv || aktiv.beepitett))}
                      onClick={() => letolt(aktiv, 'letolt')}>
                {munka === 'letolt' ? 'Készül…' : 'Letöltés Wordben'}
              </button>
              <button type="button" className="btn btn-fo" disabled={elfoglalt || ellenorzes !== null}
                      onClick={() => fajlMezo.current?.click()}>
                {munka === 'olvas' ? 'Beolvasás…' : 'Új változat feltöltése'}
              </button>
              <input ref={fajlMezo} type="file" hidden accept={`.docx,${DOCX}`} aria-label={`${cim} új változata (${nyelvNev})`}
                     onChange={(e) => { beolvas(e.target.files?.[0]); e.target.value = '' }} />
            </div>
          </div>
          {angolRegebbi && (
            <p className="jogi-megjegyzes">
              A magyar változat frissebb ({mikor(huAktiv.aktivalva)}). Ha tartalmilag is változott, az angolt is érdemes frissíteni.
            </p>
          )}
          {uzenet && <p className={uzenet.ok ? 'pub-mentve jogi-uzenet' : 'pub-hiba jogi-uzenet'} aria-live="polite">{uzenet.szoveg}</p>}
        </div>

        {ellenorzes && (
          <section className="jogi-ellenorzes" aria-label="A feltöltött fájl ellenőrzése">
            <div className="jogi-ellenorzes-fej">
              <strong>Ellenőrizd, mielőtt közzéteszed</strong>
              <span className="halk">{ellenorzes.fajlnev} · {meretSzoveg(ellenorzes.meret)} · {nyelvNev} változat</span>
            </div>
            {ellenorzes.figyelmeztetesek.length > 0 && (
              <ul className="figyelmeztet jogi-figyelmeztetesek">
                {ellenorzes.figyelmeztetesek.map((f) => <li key={f}>{f}</li>)}
              </ul>
            )}
            <span className="jogi-cimke">Így fog kinézni a weboldalon</span>
            <div className="jogi-elonezet kv-keret">
              {pub && (
                <KoncepcioLap mod={mod} k={pub.katalogus}>
                  <TartalomProvider t={pub.tartalom} lemondasOra={pub.lemondasOra} nyelv={nyelv}>
                    <JogiDokumentum blokkok={ellenorzes.blokkok} cim={jogiCim(lap, nyelv)} />
                  </TartalomProvider>
                </KoncepcioLap>
              )}
            </div>
            <div className="jogi-gombok">
              <button type="button" className="btn btn-fo" disabled={elfoglalt} onClick={kozzetesz}>
                {munka === 'kozzetesz' ? 'Közzététel…' : 'Közzététel a weboldalon'}
              </button>
              <button type="button" className="btn" disabled={elfoglalt} onClick={() => { setEllenorzes(null); setUzenet(null) }}>Mégse</button>
            </div>
          </section>
        )}

        <div className="jogi-elozok">
          <span className="jogi-cimke">Előző változatok</span>
          {elozok.length === 0 ? (
            <p className="halk jogi-ures">Még nincs előző változat. Az első feltöltés után a beépített szöveg is itt marad, és visszaállítható.</p>
          ) : (
            <ol>
              {elozok.map((v) => (
                <li key={v.id} className="jogi-elozo">
                  <div className="jogi-adat">
                    <span className="jogi-nev">{valtozatNev(v)}</span>
                    <span className="halk jogi-reszlet">{valtozatReszlet(v, false)}</span>
                  </div>
                  <div className="jogi-gombok">
                    <button type="button" className="btn btn-kicsi btn-csendes" disabled={elfoglalt || (v.beepitett && !pub)}
                            aria-label={`Letöltés: ${valtozatNev(v)}`} onClick={() => letolt(v, `letolt:${v.id}`)}>
                      {munka === `letolt:${v.id}` ? 'Készül…' : 'Letöltés'}
                    </button>
                    <button type="button" className="btn btn-kicsi" disabled={elfoglalt || ellenorzes !== null}
                            aria-label={`Visszaállítás: ${valtozatNev(v)}`} onClick={() => visszaallit(v)}>
                      {munka === `vissza:${v.id}` ? 'Visszaállítás…' : 'Visszaállítás'}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="halk jogi-tipp">
            Legfeljebb 3 előző változatot őrzünk meg, az újabb feltöltésnél a legrégebbi törlődik.
            Visszaállításkor a mostani változat sem vész el, átkerül az előzők közé.
          </p>
        </div>
      </div>
      <div className="jogi-huzas" aria-hidden="true">Engedd el a Word-fájlt a feltöltéshez</div>
    </section>
  )
}

export default function JogiSzovegekOldal() {
  const { data } = useApp()
  const { adat: pub } = usePublikusAdat()
  const [valtozatok, setValtozatok] = useState<JogiValtozat[] | null>(null)
  const [hiba, setHiba] = useState<string | null>(null)

  const frissit = useCallback(async () => { setValtozatok(await data.jogiValtozatok()) }, [data])

  useEffect(() => {
    let el = true
    data.jogiValtozatok()
      .then((v) => { if (el) setValtozatok(v) })
      .catch((e) => { if (el) setHiba(hibaSzoveg(e)) })
    return () => { el = false }
  }, [data])

  return (
    <div className="oldal pub-oldal">
      <PubFej
        cim="Jogi szövegek"
        alcim="Az Impresszum és az Adatvédelmi tájékoztató Word-fájlként. Töltsd le, írd át vagy küldd el a jogásznak, aztán töltsd vissza: a weboldalon az új változat jelenik meg. Az előző 3 változat megmarad, bármelyik visszaállítható."
        linkek={[['Impresszum', '/impresszum'], ['Adatvédelmi tájékoztató', '/adatvedelem']]}
      />
      {hiba && <p className="pub-hiba">{hiba}</p>}
      {!valtozatok && !hiba && <div className="betolt">Betöltés…</div>}
      {valtozatok && (
        <div className="jogi-panelek">
          {JOGI_LAPOK.map((lap) => <JogiPanel key={lap} lap={lap} valtozatok={valtozatok} pub={pub} onFrissit={frissit} />)}
        </div>
      )}
    </div>
  )
}
