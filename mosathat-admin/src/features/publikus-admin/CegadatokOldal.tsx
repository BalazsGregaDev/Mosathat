import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import { useMentetlen } from '../../state/useMentetlen'
import { CEG_ALAP, type PublikusAdatokNyers } from '../../lib/publikusTartalom'
import { TERVEZET, type Kamera } from '../../lib/ceg'
import type { Nyelv } from '../../lib/nyelv'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import { Mezo, PubFej, useMentes } from './kozos'

type CegKulcs = keyof typeof CEG_ALAP

const CEG_MEZOK: { kulcs: CegKulcs; cimke: string; sugo?: string }[] = [
  { kulcs: 'ceg_nev', cimke: 'Cégnév' },
  { kulcs: 'ceg_rovid_nev', cimke: 'Rövidített cégnév' },
  { kulcs: 'ceg_szekhely', cimke: 'Székhely' },
  { kulcs: 'ceg_cegjegyzekszam', cimke: 'Cégjegyzékszám' },
  { kulcs: 'ceg_cegbirosag', cimke: 'Nyilvántartó bíróság' },
  { kulcs: 'ceg_adoszam', cimke: 'Adószám' },
]

interface Allapot {
  ceg: Record<CegKulcs, string>
  tervezet: boolean
  konyveloNev: string
  konyveloCim: string
  megorzes: string
  megorzesEn: string
  kamerak: Kamera[]
}

function kezdo(a: PublikusAdatokNyers | undefined, kamerak: Kamera[] | undefined): Allapot {
  return {
    ceg: Object.fromEntries((Object.keys(CEG_ALAP) as CegKulcs[]).map((k) => [k, a?.[k]?.trim() || CEG_ALAP[k]])) as Record<CegKulcs, string>,
    tervezet: a?.jogi_tervezet ?? TERVEZET,
    konyveloNev: a?.konyvelo_nev ?? '',
    konyveloCim: a?.konyvelo_cim ?? '',
    megorzes: a?.kamera_megorzes ?? '',
    megorzesEn: a?.kamera_megorzes_en ?? '',
    kamerak: (kamerak ?? []).map((k) => ({ hely: k.hely, terulet: k.terulet, hely_en: k.hely_en ?? '', terulet_en: k.terulet_en ?? '' })),
  }
}

export default function CegadatokOldal() {
  const { data } = useApp()
  const { adat: pub, frissit } = usePublikusAdat()
  const [alap, setAlap] = useState(pub)
  const [v, setV] = useState<Allapot>(() => kezdo(pub?.tartalom.adatok, pub?.tartalom.kamerak))
  const { allapot, fut } = useMentes()
  const [kameraNyelv, setKameraNyelv] = useState<Nyelv>('hu')

  if (pub !== alap) {
    setAlap(pub)
    setV(kezdo(pub?.tartalom.adatok, pub?.tartalom.kamerak))
  }

  const eredeti = kezdo(pub?.tartalom.adatok, pub?.tartalom.kamerak)
  const valtozott = JSON.stringify(v) !== JSON.stringify(eredeti)
  useMentetlen(valtozott)

  if (!pub) return <div className="betolt">Betöltés…</div>

  const kamera = (i: number, patch: Partial<Kamera>) =>
    setV({ ...v, kamerak: v.kamerak.map((k, j) => (j === i ? { ...k, ...patch } : k)) })
  const mozgat = (i: number, irany: -1 | 1) => {
    const l = [...v.kamerak]
    const [x] = l.splice(i, 1)
    l.splice(i + irany, 0, x)
    setV({ ...v, kamerak: l })
  }

  return (
    <div className="oldal pub-oldal">
      <PubFej
        cim="Cégadatok"
        alcim="Az Impresszum és az Adatvédelmi tájékoztató adatai. A telefonszám és az e-mail cím az Elérhetőség menüből jön."
        linkek={[['Impresszum', '/impresszum'], ['Adatvédelmi tájékoztató', '/adatvedelem']]}
        valtozott={valtozott}
        allapot={allapot}
        onElvet={() => setV(eredeti)}
        onMent={() => void fut(async () => {
          await data.savePublikusTartalom({
            adatok: {
              ...v.ceg,
              jogi_tervezet: v.tervezet,
              konyvelo_nev: v.konyveloNev,
              konyvelo_cim: v.konyveloCim,
              kamera_megorzes: v.megorzes,
              kamera_megorzes_en: v.megorzesEn,
            },
            kamerak: v.kamerak.map((k) => ({
              hely: k.hely.trim(), terulet: k.terulet.trim(),
              hely_en: k.hely_en?.trim() || null, terulet_en: k.terulet_en?.trim() || null,
            })),
          })
          await frissit()
        })}
      />

      <div className="pub-racs">
        <section className="panel">
          <h3>Cégadatok</h3>
          <div className="panel-torzs pub-mezok">
            {CEG_MEZOK.map((m) => (
              <Mezo key={m.kulcs} cimke={m.cimke} sugo={m.sugo}>
                <input className="beviteli" value={v.ceg[m.kulcs]} placeholder={CEG_ALAP[m.kulcs]} data-mezo={m.kulcs}
                       onChange={(e) => setV({ ...v, ceg: { ...v.ceg, [m.kulcs]: e.target.value } })} />
              </Mezo>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3>Jogi oldalak</h3>
          <div className="panel-torzs pub-mezok">
            <Mezo cimke="Hatályos" sugo="A két jogi oldal tetején jelenik meg. Módosításkor írd át a változás napjára.">
              <input className="beviteli" value={v.ceg.jogi_hataly} placeholder={CEG_ALAP.jogi_hataly} data-mezo="jogi_hataly"
                     onChange={(e) => setV({ ...v, ceg: { ...v.ceg, jogi_hataly: e.target.value } })} />
            </Mezo>
            <label className="pub-pipa">
              <input type="checkbox" checked={v.tervezet} onChange={(e) => setV({ ...v, tervezet: e.target.checked })} data-mezo="jogi_tervezet" />
              <span>
                „Tervezet” jelzés a jogi oldalak tetején
                <small className="halk">Akkor vedd ki, ha a szöveget jogász átnézte, és minden adat végleges.</small>
              </span>
            </label>
            <Mezo cimke="Könyvelő neve" sugo="Adatfeldolgozóként szerepel az Adatvédelmi tájékoztatóban. Amíg üres, helykitöltő látszik.">
              <input className="beviteli" value={v.konyveloNev} data-mezo="konyvelo_nev"
                     onChange={(e) => setV({ ...v, konyveloNev: e.target.value })} />
            </Mezo>
            <Mezo cimke="Könyvelő címe">
              <input className="beviteli" value={v.konyveloCim} data-mezo="konyvelo_cim"
                     onChange={(e) => setV({ ...v, konyveloCim: e.target.value })} />
            </Mezo>
          </div>
        </section>

        <section className="panel pub-kamerak" data-nyelv={kameraNyelv}>
          <h3>
            Kamerás megfigyelés
            <NyelvKapcsolo nyelv={kameraNyelv} onValt={setKameraNyelv} cimke="Kamerás megfigyelés" />
          </h3>
          {kameraNyelv === 'hu' ? (
            <div className="panel-torzs pub-mezok">
              <Mezo cimke="Megőrzési idő" sugo={<>Mondatba illesztve jelenik meg: „a rögzítéstől számított … utána a rendszer felülírja a felvételeket”. Például: <em>3 munkanapig</em>.</>}>
                <input className="beviteli" value={v.megorzes} placeholder="pl. 3 munkanapig" data-mezo="kamera_megorzes"
                       onChange={(e) => setV({ ...v, megorzes: e.target.value })} />
              </Mezo>
              <div className="pub-kamera-lista">
                <span className="pub-kamera-cim">Kamerák</span>
                {v.kamerak.length === 0 && <p className="halk">Még nincs felvett kamera. Amíg nincs, a tájékoztatóban helykitöltő látszik.</p>}
                {v.kamerak.map((k, i) => (
                  <div key={i} className="pub-kamera">
                    <input className="beviteli" value={k.hely} placeholder="Hol van? (pl. bejárat)" aria-label={`${i + 1}. kamera helye`}
                           onChange={(e) => kamera(i, { hely: e.target.value })} />
                    <input className="beviteli" value={k.terulet} placeholder="Mit lát? (pl. a beálló autókat)" aria-label={`${i + 1}. kamera látótere`}
                           onChange={(e) => kamera(i, { terulet: e.target.value })} />
                    <div className="pub-kamera-gombok">
                      <button type="button" className="btn btn-kicsi btn-csendes" disabled={i === 0} onClick={() => mozgat(i, -1)}>Fel</button>
                      <button type="button" className="btn btn-kicsi btn-csendes" disabled={i === v.kamerak.length - 1} onClick={() => mozgat(i, 1)}>Le</button>
                      <button type="button" className="btn btn-kicsi btn-csendes"
                              onClick={() => setV({ ...v, kamerak: v.kamerak.filter((_, j) => j !== i) })}>Törlés</button>
                    </div>
                  </div>
                ))}
                <button type="button" className="btn btn-kicsi"
                        onClick={() => setV({ ...v, kamerak: [...v.kamerak, { hely: '', terulet: '', hely_en: '', terulet_en: '' }] })}>
                  + Kamera
                </button>
              </div>
            </div>
          ) : (
            <div className="panel-torzs pub-mezok">
              <Mezo cimke="Megőrzési idő angolul" sugo={<>Az angol mondatban: „for … from the time of recording”. Például: <em>3 working days</em>. Ha üres, a magyar szöveg jelenik meg.</>}>
                <input className="beviteli" lang="en" value={v.megorzesEn} placeholder={v.megorzes || 'e.g. 3 working days'} data-mezo="kamera_megorzes_en"
                       onChange={(e) => setV({ ...v, megorzesEn: e.target.value })} />
              </Mezo>
              <div className="pub-kamera-lista">
                <span className="pub-kamera-cim">Kamerák angolul</span>
                {v.kamerak.length === 0 && <p className="halk">Még nincs felvett kamera. Kamerát a magyar nézetben vehetsz fel.</p>}
                {v.kamerak.map((k, i) => (
                  <div key={i} className="pub-kamera" data-angol>
                    <input className="beviteli" lang="en" value={k.hely_en ?? ''} placeholder={k.hely || 'Where is it?'}
                           aria-label={`${i + 1}. kamera helye angolul`} onChange={(e) => kamera(i, { hely_en: e.target.value })} />
                    <input className="beviteli" lang="en" value={k.terulet_en ?? ''} placeholder={k.terulet || 'What does it cover?'}
                           aria-label={`${i + 1}. kamera látótere angolul`} onChange={(e) => kamera(i, { terulet_en: e.target.value })} />
                  </div>
                ))}
                {v.kamerak.length > 0 && <p className="halk pub-megjegyzes">Ahol az angol mező üres, ott a magyar szöveg jelenik meg az angol oldalon.</p>}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
