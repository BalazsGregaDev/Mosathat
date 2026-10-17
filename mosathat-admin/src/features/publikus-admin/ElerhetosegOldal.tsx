import { useState } from 'react'

import { useApp } from '../../state/AppContext'
import { useMentetlen } from '../../state/useMentetlen'
import { ELERHETOSEG_ALAP, uzletbol, type PublikusAdatokNyers } from '../../lib/publikusTartalom'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import { Mezo, PubFej, useMentes } from './kozos'

type Kulcs = keyof typeof ELERHETOSEG_ALAP

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

function kezdo(a: PublikusAdatokNyers | undefined): Record<Kulcs, string> {
  return Object.fromEntries(KULCSOK.map((k) => [k, a?.[k]?.trim() || ELERHETOSEG_ALAP[k]])) as Record<Kulcs, string>
}

export default function ElerhetosegOldal({ onBeallitasok }: { onBeallitasok: () => void }) {
  const { data } = useApp()
  const { adat: pub, frissit } = usePublikusAdat()
  const [alap, setAlap] = useState(pub)
  const [v, setV] = useState<Record<Kulcs, string>>(() => kezdo(pub?.tartalom.adatok))
  const { allapot, fut } = useMentes()

  if (pub !== alap) {
    setAlap(pub)
    setV(kezdo(pub?.tartalom.adatok))
  }

  const eredeti = kezdo(pub?.tartalom.adatok)
  const valtozott = KULCSOK.some((k) => v[k] !== eredeti[k])
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
        onElvet={() => setV(eredeti)}
        onMent={() => void fut(async () => {
          await data.savePublikusTartalom({ adatok: Object.fromEntries(KULCSOK.map((k) => [k, v[k]])) as PublikusAdatokNyers })
          await frissit()
        })}
      />

      <div className="pub-racs">
        <section className="panel">
          <h3>Kapcsolat</h3>
          <div className="panel-torzs pub-mezok">{MEZOK.map(mezo)}</div>
        </section>

        <section className="panel">
          <h3>Cím és megközelítés</h3>
          <div className="panel-torzs pub-mezok">{CIM_MEZOK.map(mezo)}</div>
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
