import { useRef, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { IGAZITASOK, KEP_HELYEK, KEP_MERETEK, MAX_KEP, type Bejelentes } from '../../lib/bejelentes'
import { KEP_MAX_MERET, KEP_TIPUSOK } from '../../lib/kep'
import { hibaSzoveg } from '../../lib/format'
import type { Mod } from '../../lib/arculat'
import { KoncepcioResz } from '../arculat/Koncepcio'
import { TartalomProvider } from '../publikus/tartalom'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import Idozitesek, { type Valt } from './Idozitesek'
import { Elonezet, Mezo } from './kozos'

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

function Kepek({ v, valt, tolt, setTolt }: { v: Bejelentes; valt: Valt; tolt: number; setTolt: (f: (n: number) => number) => void }) {
  const { data } = useApp()
  const fajl = useRef<HTMLInputElement>(null)
  const [hiba, setHiba] = useState('')
  const hely = MAX_KEP - v.kepek.length - tolt

  const feltolt = (lista: FileList | null) => {
    setHiba('')
    const fajlok = Array.from(lista ?? [])
    if (fajlok.length > hely) setHiba(`Legfeljebb ${MAX_KEP} kép lehet, a többit kihagytam.`)
    for (const f of fajlok.slice(0, Math.max(0, hely))) {
      if (!KEP_TIPUSOK.includes(f.type)) { setHiba('Csak JPG, PNG, WebP, GIF vagy HEIC kép tölthető fel.'); continue }
      if (f.size > KEP_MAX_MERET) { setHiba('A kép legfeljebb 15 MB lehet.'); continue }
      setTolt((n) => n + 1)
      data.oldalKepFeltoltes(f)
        .then((src) => valt((x) => (x.kepek.length >= MAX_KEP ? {} : { kepek: [...x.kepek, src] })))
        .catch((x: unknown) => setHiba(hibaSzoveg(x)))
        .finally(() => setTolt((n) => n - 1))
    }
  }
  const mozgat = (i: number, irany: -1 | 1) => {
    const k = [...v.kepek]
    const [x] = k.splice(i, 1)
    k.splice(i + irany, 0, x)
    valt({ kepek: k })
  }

  return (
    <div className="mezo pub-mezo">
      <span>Képek ({v.kepek.length} / {MAX_KEP})</span>
      <div className="bej-kepek">
        {v.kepek.map((k, i) => (
          <figure key={`${i}-${k.slice(-24)}`} className="bej-kep">
            <img src={k} alt={`${i + 1}. kép`} />
            <figcaption>
              <button type="button" className="btn btn-kicsi btn-csendes" disabled={i === 0}
                      aria-label={`${i + 1}. kép balra`} onClick={() => mozgat(i, -1)}>Balra</button>
              <button type="button" className="btn btn-kicsi btn-csendes" disabled={i === v.kepek.length - 1}
                      aria-label={`${i + 1}. kép jobbra`} onClick={() => mozgat(i, 1)}>Jobbra</button>
              <button type="button" className="btn btn-kicsi btn-csendes" aria-label={`${i + 1}. kép törlése`}
                      onClick={() => valt({ kepek: v.kepek.filter((_, j) => j !== i) })}>Törlés</button>
            </figcaption>
          </figure>
        ))}
        {Array.from({ length: tolt }, (_, i) => <div key={`t${i}`} className="bej-kep bej-kep-tolt" role="status">Feltöltés…</div>)}
        {hely > 0 && (
          <button type="button" className="bej-kep bej-kep-uj" onClick={() => fajl.current?.click()}>+ Kép hozzáadása</button>
        )}
      </div>
      <input ref={fajl} type="file" accept={KEP_TIPUSOK.join(',')} multiple hidden data-mezo="kep-fajl"
             onChange={(x) => { feltolt(x.target.files); x.target.value = '' }} />
      {hiba && <small className="pub-hiba" role="alert">{hiba}</small>}
    </div>
  )
}

export default function EgyediOldal() {
  const { adat: pub } = usePublikusAdat()
  const [kepernyo, setKepernyo] = useState<'asztal' | 'telefon'>('asztal')
  const [tolt, setTolt] = useState(0)
  if (!pub) return <div className="betolt">Betöltés…</div>
  const mod: Mod = pub.arculat === '03' && pub.mod ? pub.mod : 'VILAGOS'

  return (
    <Idozitesek
      tipus="EGYEDI"
      cim="Egyedi szekció"
      alcim="Saját szöveg és legfeljebb 3 kép a főoldalon, a nyitó rész rövid leírása alatt, a borítókép felett. Előre több is beállítható, mindegyik a saját időszakában: egyszerre mindig csak egy látszik."
      ujFelirat="+ Új egyedi szekció"
      feltoltes={tolt}
      tartalomHiba={(v) => (v.szoveg.trim() || v.kepek.length ? null : 'Írj szöveget vagy tölts fel képet.')}
      urlap={(v, valt) => (
        <>
          <Mezo cimke="Szöveg" sugo="A *csillagok közé* írt szöveg dőlt betűs lesz.">
            <textarea className="beviteli" rows={4} value={v.szoveg} maxLength={3000}
                      onChange={(x) => valt({ szoveg: x.target.value })} data-mezo="szoveg" />
          </Mezo>
          <details className="bej-angol" open={Boolean(v.szoveg_en) || undefined}>
            <summary>Angolul (nem kötelező)</summary>
            <Mezo cimke="Szöveg angolul" sugo="Ha üresen marad, az angol oldalon a magyar szöveg látszik.">
              <textarea className="beviteli" rows={3} value={v.szoveg_en} maxLength={3000}
                        onChange={(x) => valt({ szoveg_en: x.target.value })} data-mezo="szoveg_en" />
            </Mezo>
          </details>
          <Kepek v={v} valt={valt} tolt={tolt} setTolt={setTolt} />
          <Valaszto cimke="Képek helye" ertek={v.kep_hely} lehetosegek={KEP_HELYEK} mezo="kep_hely" onValt={(x) => valt({ kep_hely: x })} />
          <Valaszto cimke="Igazítás" ertek={v.igazitas} lehetosegek={IGAZITASOK} mezo="igazitas" onValt={(x) => valt({ igazitas: x })} />
          <Valaszto cimke="Képméret" ertek={v.meret} lehetosegek={KEP_MERETEK} mezo="meret" onValt={(x) => valt({ meret: x })} />
          <p className="halk pub-megjegyzes">Az igazítás a képekre és a szövegre is vonatkozik. Telefonon a képek egymás alá kerülnek.</p>
        </>
      )}
      elonezetEszkoz={(
        <span className="valaszto bej-valaszto" role="group" aria-label="Képernyő">
          <button type="button" aria-pressed={kepernyo === 'asztal'} onClick={() => setKepernyo('asztal')}>Számítógép</button>
          <button type="button" aria-pressed={kepernyo === 'telefon'} onClick={() => setKepernyo('telefon')}>Telefon</button>
        </span>
      )}
      elonezet={(v, nyelv) => {
        const ures = !v.szoveg.trim() && v.kepek.length === 0
        const minta = { ...v, aktiv: true, szoveg: ures ? 'Ide kerül az egyedi szekció szövege.' : v.szoveg }
        return (
          <div className="bej-kepernyo" data-kepernyo={kepernyo}>
            <TartalomProvider t={{ ...pub.tartalom, egyedi: minta }} lemondasOra={pub.lemondasOra} nyelv={nyelv}>
              <Elonezet key={kepernyo} szel={kepernyo === 'telefon' ? 390 : 1280} keret>
                <KoncepcioResz resz="nav" mod={mod} k={pub.katalogus} />
                <KoncepcioResz resz="hero" mod={mod} k={pub.katalogus} />
              </Elonezet>
            </TartalomProvider>
          </div>
        )
      }}
    />
  )
}
