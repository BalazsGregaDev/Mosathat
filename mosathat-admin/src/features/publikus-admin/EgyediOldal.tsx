import { useEffect, useMemo, useRef, useState } from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import './bejelentes-admin.css'
import { useApp } from '../../state/AppContext'
import { useMentes } from '../../state/useMentes'
import { useMentetlen } from '../../state/useMentetlen'
import {
  IGAZITASOK, KEP_HELYEK, KEP_MERETEK, MAX_KEP, URES_EGYEDI, type Egyedi,
} from '../../lib/bejelentes'
import { KEP_MAX_MERET, KEP_TIPUSOK } from '../../lib/kep'
import { hibaSzoveg } from '../../lib/format'
import type { Mod } from '../../lib/arculat'
import type { Nyelv } from '../../lib/nyelv'
import { KoncepcioResz } from '../arculat/Koncepcio'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import { TartalomProvider } from '../publikus/tartalom'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import { Elonezet, Mezo, PubFej } from './kozos'

function tisztit(e: Egyedi): Egyedi {
  return {
    aktiv: e.aktiv, szoveg: e.szoveg, szoveg_en: e.szoveg_en, kepek: [...e.kepek],
    kep_hely: e.kep_hely, igazitas: e.igazitas, meret: e.meret,
  }
}

function Valaszto<T extends string>({ cimke, ertek, lehetosegek, onValt, mezo }: {
  cimke: string
  ertek: T
  lehetosegek: { id: T; cimke: string }[]
  onValt: (v: T) => void
  mezo: string
}) {
  return (
    <div className="mezo pub-mezo">
      <span>{cimke}</span>
      <div className="valaszto bej-valaszto" role="group" aria-label={cimke} data-mezo={mezo}>
        {lehetosegek.map((l) => (
          <button key={l.id} type="button" aria-pressed={ertek === l.id} onClick={() => onValt(l.id)}>{l.cimke}</button>
        ))}
      </div>
    </div>
  )
}

export default function EgyediOldal() {
  const { data } = useApp()
  const { adat: pub } = usePublikusAdat()
  const [eredeti, setEredeti] = useState<Egyedi | null>(null)
  const [e, setE] = useState<Egyedi>(URES_EGYEDI)
  const [nyelv, setNyelv] = useState<Nyelv>('hu')
  const [kepernyo, setKepernyo] = useState<'asztal' | 'telefon'>('asztal')
  const [toltHiba, setToltHiba] = useState('')
  const [kepHiba, setKepHiba] = useState('')
  const [tolt, setTolt] = useState(0)
  const fajl = useRef<HTMLInputElement>(null)
  const { allapot, fut } = useMentes()

  useEffect(() => {
    let el = true
    data.bejelentesAdat()
      .then((a) => {
        if (!el) return
        const t = tisztit(a.egyedi)
        setEredeti(t)
        setE(t)
      })
      .catch((x: unknown) => { if (el) setToltHiba(hibaSzoveg(x)) })
    return () => { el = false }
  }, [data])

  const valtozott = eredeti !== null && JSON.stringify(e) !== JSON.stringify(eredeti)
  useMentetlen(valtozott || tolt > 0)

  const elonezet = useMemo(() => {
    if (!pub) return null
    const ures = !e.szoveg.trim() && e.kepek.length === 0
    const minta: Egyedi = { ...e, aktiv: true, szoveg: ures ? 'Ide kerül az egyedi szekció szövege.' : e.szoveg }
    return { ...pub.tartalom, egyedi: minta }
  }, [pub, e])

  if (toltHiba) return <div className="oldal pub-oldal"><p className="pub-hiba">{toltHiba}</p></div>
  if (!pub || eredeti === null || !elonezet) return <div className="betolt">Betöltés…</div>
  const mod: Mod = pub.arculat === '03' && pub.mod ? pub.mod : 'VILAGOS'
  const valt = (patch: Partial<Egyedi>) => setE((x) => ({ ...x, ...patch }))
  const hiany = e.aktiv && !e.szoveg.trim() && e.kepek.length === 0
  const hely = MAX_KEP - e.kepek.length - tolt

  const feltolt = (lista: FileList | null) => {
    setKepHiba('')
    const fajlok = Array.from(lista ?? [])
    if (fajlok.length > hely) setKepHiba(`Legfeljebb ${MAX_KEP} kép lehet, a többit kihagytam.`)
    for (const f of fajlok.slice(0, Math.max(0, hely))) {
      if (!KEP_TIPUSOK.includes(f.type)) { setKepHiba('Csak JPG, PNG, WebP, GIF vagy HEIC kép tölthető fel.'); continue }
      if (f.size > KEP_MAX_MERET) { setKepHiba('A kép legfeljebb 15 MB lehet.'); continue }
      setTolt((n) => n + 1)
      data.oldalKepFeltoltes(f)
        .then((src) => setE((x) => (x.kepek.length >= MAX_KEP ? x : { ...x, kepek: [...x.kepek, src] })))
        .catch((x: unknown) => setKepHiba(hibaSzoveg(x)))
        .finally(() => setTolt((n) => n - 1))
    }
  }
  const mozgat = (i: number, irany: -1 | 1) => {
    const k = [...e.kepek]
    const [x] = k.splice(i, 1)
    k.splice(i + irany, 0, x)
    valt({ kepek: k })
  }

  return (
    <div className="oldal pub-oldal">
      <PubFej
        cim="Egyedi szekció"
        alcim="Saját szöveg és legfeljebb 3 kép a főoldalon, a nyitó rész rövid leírása alatt, a borítókép felett."
        linkek={[['Publikus oldal megnyitása', '/publikus']]}
        valtozott={valtozott && !hiany && tolt === 0}
        allapot={hiany ? 'A bekapcsolt szekcióhoz írj szöveget vagy tölts fel képet.' : allapot}
        onElvet={() => { setE(eredeti); setKepHiba('') }}
        onMent={() => void fut(async () => {
          await data.egyediMentes({ ...e, szoveg: e.szoveg.trim(), szoveg_en: e.szoveg_en.trim() })
          const uj = tisztit((await data.bejelentesAdat()).egyedi)
          setEredeti(uj)
          setE(uj)
        })}
      />

      <div className="bej-racs">
        <section className="panel">
          <h3>Beállítás</h3>
          <div className="panel-torzs pub-mezok">
            <label className="pub-pipa bej-kapcsolo">
              <input type="checkbox" checked={e.aktiv} onChange={(x) => valt({ aktiv: x.target.checked })} data-mezo="aktiv" />
              <span>
                Bekapcsolva
                <small className="halk">{e.aktiv ? 'Megjelenik a főoldalon.' : 'Most nem jelenik meg a főoldalon.'}</small>
              </span>
            </label>

            <Mezo cimke="Szöveg" sugo="A *csillagok közé* írt szöveg dőlt betűs lesz.">
              <textarea className="beviteli" rows={4} value={e.szoveg} maxLength={3000}
                        onChange={(x) => valt({ szoveg: x.target.value })} data-mezo="szoveg" />
            </Mezo>
            <details className="bej-angol" open={Boolean(e.szoveg_en) || undefined}>
              <summary>Angolul (nem kötelező)</summary>
              <Mezo cimke="Szöveg angolul" sugo="Ha üresen marad, az angol oldalon a magyar szöveg látszik.">
                <textarea className="beviteli" rows={3} value={e.szoveg_en} maxLength={3000}
                          onChange={(x) => valt({ szoveg_en: x.target.value })} data-mezo="szoveg_en" />
              </Mezo>
            </details>

            <div className="mezo pub-mezo">
              <span>Képek ({e.kepek.length} / {MAX_KEP})</span>
              <div className="bej-kepek">
                {e.kepek.map((k, i) => (
                  <figure key={`${i}-${k.slice(-24)}`} className="bej-kep">
                    <img src={k} alt={`${i + 1}. kép`} />
                    <figcaption>
                      <button type="button" className="btn btn-kicsi btn-csendes" disabled={i === 0}
                              aria-label={`${i + 1}. kép balra`} onClick={() => mozgat(i, -1)}>Balra</button>
                      <button type="button" className="btn btn-kicsi btn-csendes" disabled={i === e.kepek.length - 1}
                              aria-label={`${i + 1}. kép jobbra`} onClick={() => mozgat(i, 1)}>Jobbra</button>
                      <button type="button" className="btn btn-kicsi btn-csendes" aria-label={`${i + 1}. kép törlése`}
                              onClick={() => valt({ kepek: e.kepek.filter((_, j) => j !== i) })}>Törlés</button>
                    </figcaption>
                  </figure>
                ))}
                {Array.from({ length: tolt }, (_, i) => <div key={`t${i}`} className="bej-kep bej-kep-tolt" role="status">Feltöltés…</div>)}
                {hely > 0 && (
                  <button type="button" className="bej-kep bej-kep-uj" onClick={() => fajl.current?.click()}>
                    + Kép hozzáadása
                  </button>
                )}
              </div>
              <input ref={fajl} type="file" accept={KEP_TIPUSOK.join(',')} multiple hidden data-mezo="kep-fajl"
                     onChange={(x) => { feltolt(x.target.files); x.target.value = '' }} />
              {kepHiba && <small className="pub-hiba" role="alert">{kepHiba}</small>}
            </div>

            <Valaszto cimke="Képek helye" ertek={e.kep_hely} lehetosegek={KEP_HELYEK} mezo="kep_hely"
                      onValt={(v) => valt({ kep_hely: v })} />
            <Valaszto cimke="Igazítás" ertek={e.igazitas} lehetosegek={IGAZITASOK} mezo="igazitas"
                      onValt={(v) => valt({ igazitas: v })} />
            <Valaszto cimke="Képméret" ertek={e.meret} lehetosegek={KEP_MERETEK} mezo="meret"
                      onValt={(v) => valt({ meret: v })} />
            <p className="halk pub-megjegyzes">Az igazítás a képekre és a szövegre is vonatkozik. Telefonon a képek egymás alá kerülnek.</p>
          </div>
        </section>

        <section className="panel bej-elonezet">
          <h3>
            Előnézet
            <span className="bej-elonezet-eszkoz">
              <span className="valaszto bej-valaszto" role="group" aria-label="Képernyő">
                <button type="button" aria-pressed={kepernyo === 'asztal'} onClick={() => setKepernyo('asztal')}>Számítógép</button>
                <button type="button" aria-pressed={kepernyo === 'telefon'} onClick={() => setKepernyo('telefon')}>Telefon</button>
              </span>
              <NyelvKapcsolo nyelv={nyelv} onValt={setNyelv} />
            </span>
          </h3>
          <div className="panel-torzs">
            {!e.aktiv && <p className="halk pub-megjegyzes">Kikapcsolva: így nézne ki, ha bekapcsolnád.</p>}
            <div className="bej-kepernyo" data-kepernyo={kepernyo}>
              <TartalomProvider t={elonezet} lemondasOra={pub.lemondasOra} nyelv={nyelv}>
                <Elonezet key={kepernyo} szel={kepernyo === 'telefon' ? 390 : 1280} keret>
                  <KoncepcioResz resz="nav" mod={mod} k={pub.katalogus} />
                  <KoncepcioResz resz="hero" mod={mod} k={pub.katalogus} />
                </Elonezet>
              </TartalomProvider>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
