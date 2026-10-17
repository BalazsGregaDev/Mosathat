import { useMemo, useState } from 'react'

import { useApp } from '../../state/AppContext'
import { useMentetlen } from '../../state/useMentetlen'
import {
  CSOPORT_NEV, KOZOS_VALTOZOK, kitolt, SZOVEGEK, uzletbol, uzletValtozok,
  type SzovegCsoport, type SzovegDef, type SzovegKulcs,
} from '../../lib/publikusTartalom'
import { Gazdag } from '../publikus/tartalom'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import { PubFej, useMentes } from './kozos'

type Szovegek = Record<SzovegKulcs, string>

const MINTA: Record<string, string> = {
  csomag: 'Premium',
  tol: '13:00',
  ig: '16:00',
  mikor: '2026. október 20., kedd, 8:00 és 17:00 között',
}

const CSOPORTOK = Object.keys(CSOPORT_NEV) as SzovegCsoport[]
const LISTA: readonly SzovegDef[] = SZOVEGEK

function kezdo(sajat: Record<string, string> | undefined): Szovegek {
  return Object.fromEntries(LISTA.map((s) => [s.kulcs, sajat?.[s.kulcs]?.trim() ? sajat[s.kulcs] : s.alap])) as Szovegek
}

const kisbetu = (s: string) => s.toLocaleLowerCase('hu')

export default function TartalomOldal() {
  const { data } = useApp()
  const { adat: pub, frissit } = usePublikusAdat()
  const [alap, setAlap] = useState(pub)
  const [v, setV] = useState<Szovegek>(() => kezdo(pub?.tartalom.szovegek))
  const [keres, setKeres] = useState('')
  const { allapot, fut } = useMentes()

  if (pub !== alap) {
    setAlap(pub)
    setV(kezdo(pub?.tartalom.szovegek))
  }

  const eredeti = useMemo(() => kezdo(pub?.tartalom.szovegek), [pub])
  const valtozottak = LISTA.filter((s) => v[s.kulcs as SzovegKulcs] !== eredeti[s.kulcs as SzovegKulcs])
  useMentetlen(valtozottak.length > 0)

  const valtozok = useMemo(() => {
    if (!pub) return {}
    return { ...uzletValtozok(uzletbol(pub.tartalom), pub.lemondasOra), ...MINTA }
  }, [pub])

  if (!pub) return <div className="betolt">Betöltés…</div>

  const q = kisbetu(keres.trim())
  const latszik = (s: SzovegDef) => !q
    || kisbetu(s.cimke).includes(q) || kisbetu(s.alap).includes(q) || kisbetu(v[s.kulcs as SzovegKulcs]).includes(q)
    || kisbetu(CSOPORT_NEV[s.csoport]).includes(q)

  const modositott = LISTA.filter((s) => v[s.kulcs as SzovegKulcs] !== s.alap).length

  return (
    <div className="oldal pub-oldal">
      <PubFej
        cim="Tartalom"
        alcim="A publikus oldal minden szövege: címek, leírások, gombok, a foglalás lépései és a lábléc."
        linkek={[['Publikus oldal megnyitása', '/publikus']]}
        valtozott={valtozottak.length > 0}
        allapot={allapot}
        onElvet={() => setV(eredeti)}
        onMent={() => void fut(async () => {
          const kuld: Record<string, string | null> = {}
          for (const s of valtozottak) {
            const uj = v[s.kulcs as SzovegKulcs]
            kuld[s.kulcs] = uj.trim() === '' || uj === s.alap ? null : uj
          }
          await data.savePublikusTartalom({ szovegek: kuld })
          await frissit()
        })}
      />

      <section className="panel pub-sugo">
        <h3>Így működik</h3>
        <div className="panel-torzs">
          <ul>
            <li>Amit itt átírsz és elmentesz, az a publikus oldalon azonnal megjelenik.</li>
            <li>
              <strong>Kapcsos zárójelben</strong> az adatok automatikusan beíródnak, például a
              {' '}<code>{'{telefon}'}</code> helyére a telefonszám. Így ha az Elérhetőség menüben
              változik valami, a szövegekben nem kell átírni.
            </li>
            <li><strong>Csillagok között</strong> a szöveg kiemelt lesz, például <code>*Évekig*</code>.</li>
            <li>A több soros mezőkben az Enter új sort kezd.</li>
            <li>Ha egy mezőt üresen hagysz, az eredeti szöveg áll vissza.</li>
          </ul>
          <div className="pub-valtozok">
            {KOZOS_VALTOZOK.map((x) => (
              <span key={x.nev} title={x.leiras}>
                <code>{`{${x.nev}}`}</code> {String(valtozok[x.nev] ?? '')}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="pub-keres">
        <input className="beviteli" type="search" placeholder="Keresés a szövegek között" value={keres}
               onChange={(e) => setKeres(e.target.value)} aria-label="Keresés a szövegek között" />
        <span className="halk">{LISTA.length} szöveg, ebből {modositott} eltér az eredetitől</span>
      </div>

      {CSOPORTOK.map((cs) => {
        const sorok = LISTA.filter((s) => s.csoport === cs && latszik(s))
        if (sorok.length === 0) return null
        return (
          <section key={cs} className="panel pub-csoport" data-csoport={cs}>
            <h3>{CSOPORT_NEV[cs]}</h3>
            <div className="panel-torzs pub-szovegek">
              {sorok.map((s) => {
                const k = s.kulcs as SzovegKulcs
                const ertek = v[k]
                const elter = ertek !== s.alap
                const elonezet = /[{*]|\n/.test(ertek)
                return (
                  <div key={k} className="pub-szoveg" data-kulcs={k} data-valtozott={ertek !== eredeti[k] || undefined}>
                    <div className="pub-szoveg-fej">
                      <label htmlFor={`sz-${k}`}>{s.cimke}</label>
                      {elter && <span className="cimke-pill">módosítva</span>}
                      {elter && (
                        <button type="button" className="btn btn-kicsi btn-csendes" onClick={() => setV({ ...v, [k]: s.alap })}>
                          Eredeti szöveg
                        </button>
                      )}
                    </div>
                    {s.sor ? (
                      <textarea id={`sz-${k}`} className="beviteli" rows={Math.min(6, Math.max(2, Math.ceil(ertek.length / 90) + ertek.split('\n').length - 1))}
                                value={ertek} placeholder={s.alap} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
                    ) : (
                      <input id={`sz-${k}`} className="beviteli" value={ertek} placeholder={s.alap}
                             onChange={(e) => setV({ ...v, [k]: e.target.value })} />
                    )}
                    {elonezet && ertek.trim() !== '' && (
                      <div className="pub-elonezet">
                        <span className="halk">Így jelenik meg:</span>{' '}
                        <Gazdag s={kitolt(ertek, valtozok)} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
