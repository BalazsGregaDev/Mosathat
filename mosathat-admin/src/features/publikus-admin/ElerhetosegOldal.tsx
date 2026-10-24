import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import { useMentes } from '../../state/useMentes'
import { useMentetlen } from '../../state/useMentetlen'
import {
  ELERHETOSEG_ALAP, ELERHETOSEG_ALAP_EN, FORDITHATO_ADATOK, uzletbol, type PublikusAdatokNyers,
} from '../../lib/publikusTartalom'
import type { Nyelv } from '../../lib/nyelv'
import NyelvKapcsolo from '../common/NyelvKapcsolo'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import { Mezo, PubFej } from './kozos'

type Kulcs = keyof typeof ELERHETOSEG_ALAP
type AngolKulcs = `${(typeof FORDITHATO_ADATOK)[number]}_en`
type Mind = Kulcs | AngolKulcs

const MEZOK: { kulcs: Kulcs; cimke: string; sugo?: string; tipus?: string }[] = [
  { kulcs: 'nev', cimke: 'Megjelenő név', sugo: 'A logó helyén, a láblécben és a böngészőfül címében.' },
  { kulcs: 'telefon', cimke: 'Telefonszám', tipus: 'tel', sugo: 'Kattintással hívható a publikus oldalon, és ezt írják ki a foglalási hibaüzenetek is.' },
  { kulcs: 'email', cimke: 'E-mail cím', tipus: 'email', sugo: 'A láblécben, az Impresszumban és az Adatvédelmi tájékoztatóban jelenik meg.' },
]

const CIM_MEZOK: { kulcs: Kulcs; cimke: string; sugo?: string }[] = [
  { kulcs: 'irsz', cimke: 'Irányítószám és város' },
  { kulcs: 'cim', cimke: 'Utca, házszám', sugo: 'A térkép és az útvonaltervező is ebből a címből keres.' },
  { kulcs: 'haz', cimke: 'Épület' },
  { kulcs: 'szint', cimke: 'Szint' },
  { kulcs: 'bejarat', cimke: 'Bejárat', sugo: 'Mondatba illesztve jelenik meg: „A bejárat a … nyílik.”' },
  { kulcs: 'kerulet', cimke: 'Kerület', sugo: 'A nyitó rész felcímében.' },
]

const KULCSOK = [...MEZOK, ...CIM_MEZOK].map((m) => m.kulcs)
const ANGOL_KULCSOK = FORDITHATO_ADATOK.map((k) => `${k}_en` as AngolKulcs)
const MIND: Mind[] = [...KULCSOK, ...ANGOL_KULCSOK]

function kezdo(a: PublikusAdatokNyers | undefined): Record<Mind, string> {
  return {
    ...Object.fromEntries(KULCSOK.map((k) => [k, a?.[k]?.trim() || ELERHETOSEG_ALAP[k]])),
    ...Object.fromEntries(FORDITHATO_ADATOK.map((k) => [`${k}_en`, a?.[`${k}_en`]?.trim() || ELERHETOSEG_ALAP_EN[k]])),
  } as Record<Mind, string>
}

export default function ElerhetosegOldal({ onBeallitasok, kezdoNyelv = 'hu' }: { onBeallitasok: () => void; kezdoNyelv?: Nyelv }) {
  const { data } = useApp()
  const { adat: pub, frissit } = usePublikusAdat()
  const [alap, setAlap] = useState(pub)
  const [v, setV] = useState<Record<Mind, string>>(() => kezdo(pub?.tartalom.adatok))
  const [cimNyelv, setCimNyelv] = useState<Nyelv>(kezdoNyelv)
  const [google, setGoogle] = useState(() => pub?.tartalom.adatok.google_ertekeles ?? '')
  const { allapot, fut } = useMentes()

  if (pub !== alap) {
    setAlap(pub)
    setV(kezdo(pub?.tartalom.adatok))
    setGoogle(pub?.tartalom.adatok.google_ertekeles ?? '')
  }

  const eredeti = kezdo(pub?.tartalom.adatok)
  const eredetiGoogle = pub?.tartalom.adatok.google_ertekeles ?? ''
  const valtozott = MIND.some((k) => v[k] !== eredeti[k]) || google.trim() !== eredetiGoogle
  useMentetlen(valtozott)

  if (!pub) return <div className="betolt">Betöltés…</div>
  const u = uzletbol(pub.tartalom)

  const mezo = (m: { kulcs: Kulcs; cimke: string; sugo?: string; tipus?: string }) => (
    <Mezo key={m.kulcs} cimke={m.cimke} sugo={m.sugo}>
      <input className="beviteli" type={m.tipus ?? 'text'} value={v[m.kulcs]} placeholder={ELERHETOSEG_ALAP[m.kulcs]}
             onChange={(e) => setV({ ...v, [m.kulcs]: e.target.value })} data-mezo={m.kulcs} />
    </Mezo>
  )

  return (
    <div className="oldal pub-oldal">
      <PubFej
        cim="Elérhetőség"
        alcim="A publikus oldal kapcsolati adatai. A nyitó rész, a Hol vagyunk szakasz, a lábléc és a jogi oldalak is innen veszik."
        linkek={[['Publikus oldal megnyitása', '/publikus']]}
        valtozott={valtozott}
        allapot={allapot}
        onElvet={() => { setV(eredeti); setGoogle(eredetiGoogle) }}
        onMent={() => void fut(async () => {
          await data.savePublikusTartalom({
            adatok: { ...Object.fromEntries(MIND.map((k) => [k, v[k]])), google_ertekeles: google.trim() } as PublikusAdatokNyers,
          })
          await frissit()
        })}
      />

      <div className="pub-racs">
        <section className="panel">
          <h3>Kapcsolat</h3>
          <div className="panel-torzs pub-mezok">
            {MEZOK.map(mezo)}
            <Mezo cimke="Google-értékelés linkje"
                  sugo="Az ügyfél foglalási oldalán, az átvétel után jelenik meg az „Értékelés írása” gomb mögött. A Google Cégprofilban: Értékelések kérése, a megosztható link (https://g.page/r/…/review). Üresen hagyva a gomb a Google-keresés „Mosathat - Hand Car Wash Budapest” találatára visz, ahol az értékelés is megírható.">
              <input className="beviteli" type="url" value={google} placeholder="https://g.page/r/…/review"
                     onChange={(e) => setGoogle(e.target.value)} data-mezo="google_ertekeles" />
            </Mezo>
          </div>
        </section>

        <section className="panel" data-nyelv={cimNyelv}>
          <h3>
            Cím és megközelítés
            <NyelvKapcsolo nyelv={cimNyelv} onValt={setCimNyelv} cimke="Cím és megközelítés" />
          </h3>
          {cimNyelv === 'hu' ? (
            <div className="panel-torzs pub-mezok">{CIM_MEZOK.map(mezo)}</div>
          ) : (
            <div className="panel-torzs pub-mezok">
              <p className="halk pub-megjegyzes">
                Az irányítószám, az utca, házszám és az épület neve mindkét nyelven ugyanaz, angolul csak ezt a hármat kell megadni.
              </p>
              {CIM_MEZOK.filter((m) => (FORDITHATO_ADATOK as readonly string[]).includes(m.kulcs)).map((m) => {
                const k = `${m.kulcs}_en` as AngolKulcs
                return (
                  <Mezo key={k} cimke={`${m.cimke} angolul`} sugo={`Magyarul: ${v[m.kulcs]}`}>
                    <input className="beviteli" lang="en" value={v[k]}
                           placeholder={ELERHETOSEG_ALAP_EN[m.kulcs as (typeof FORDITHATO_ADATOK)[number]]}
                           onChange={(e) => setV({ ...v, [k]: e.target.value })} data-mezo={k} />
                  </Mezo>
                )
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Nyitvatartás és leadás</h3>
          <div className="panel-torzs">
            <dl className="pub-adatsor">
              <dt>Nyitvatartás</dt><dd>{u.nyitvatartas}</dd>
              <dt>Leadás legkorábban</dt><dd>{u.leadas}</dd>
            </dl>
            <p className="halk pub-megjegyzes">
              Ezeket a Beállítások menüben módosíthatod, a publikus oldal onnan veszi, így mindig
              egyezik azzal, amivel a foglalási rendszer számol.
            </p>
            <button type="button" className="btn btn-kicsi" onClick={onBeallitasok}>Beállítások megnyitása</button>
          </div>
        </section>
      </div>
    </div>
  )
}
