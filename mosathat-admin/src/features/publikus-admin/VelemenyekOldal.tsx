import { useEffect, useMemo, useState } from 'react'

import '../arculat/betuk'
import '../arculat/koncepciok.css'
import { useApp } from '../../state/AppContext'
import { useMentes } from '../../state/useMentes'
import { useMentetlen } from '../../state/useMentetlen'
import type { VelemenySor } from '../../lib/publikusTartalom'
import type { Mod } from '../../lib/arculat'
import { KoncepcioResz } from '../arculat/Koncepcio'
import { TartalomProvider } from '../publikus/tartalom'
import { usePublikusAdat } from '../publikus/usePublikusAdat'
import { Elonezet, Mezo, PubFej } from './kozos'

const UJ: VelemenySor = { nev: '', csillag: 5, szoveg: '', datum: null, aktiv: true }

function tisztit(l: VelemenySor[]): VelemenySor[] {
  return l.map((v) => ({ nev: v.nev, csillag: v.csillag, szoveg: v.szoveg, datum: v.datum || null, aktiv: v.aktiv }))
}

export default function VelemenyekOldal() {
  const { data } = useApp()
  const { adat: pub } = usePublikusAdat()
  const [eredeti, setEredeti] = useState<VelemenySor[] | null>(null)
  const [lista, setLista] = useState<VelemenySor[]>([])
  const [toltHiba, setToltHiba] = useState('')
  const { allapot, fut } = useMentes()

  useEffect(() => {
    let el = true
    data.velemenyekLista()
      .then((l) => { if (el) { setEredeti(tisztit(l)); setLista(tisztit(l)) } })
      .catch((e: unknown) => { if (el) setToltHiba(e instanceof Error ? e.message : String(e)) })
    return () => { el = false }
  }, [data])

  const valtozott = eredeti !== null && JSON.stringify(lista) !== JSON.stringify(eredeti)
  useMentetlen(valtozott)

  const megjelenik = useMemo(() => lista.filter((v) => v.aktiv && v.csillag >= 4 && v.nev.trim() && v.szoveg.trim()), [lista])
  const elonezet = useMemo(
    () => (pub ? { ...pub.tartalom, velemenyek: megjelenik.map((v) => ({ nev: v.nev.trim(), csillag: v.csillag, szoveg: v.szoveg.trim(), datum: v.datum })) } : null),
    [pub, megjelenik],
  )

  if (toltHiba) return <div className="oldal pub-oldal"><p className="pub-hiba">{toltHiba}</p></div>
  if (!pub || eredeti === null || !elonezet) return <div className="betolt">Betöltés…</div>
  const mod: Mod = pub.arculat === '03' && pub.mod ? pub.mod : 'VILAGOS'

  const valt = (i: number, patch: Partial<VelemenySor>) => setLista(lista.map((v, j) => (j === i ? { ...v, ...patch } : v)))
  const mozgat = (i: number, irany: -1 | 1) => {
    const l = [...lista]
    const [x] = l.splice(i, 1)
    l.splice(i + irany, 0, x)
    setLista(l)
  }

  return (
    <div className="oldal pub-oldal">
      <PubFej
        cim="Vélemények"
        alcim="A Google-on kapott értékelések a publikus oldal „Rólunk mondták” sávjába, a Hol vagyunk fölé. Csak a bekapcsolt, 4 és 5 csillagos vélemények jelennek meg, a beírt sorrendben."
        linkek={[['Publikus oldal megnyitása', '/publikus']]}
        valtozott={valtozott}
        allapot={allapot}
        onElvet={() => setLista(eredeti)}
        onMent={() => void fut(async () => {
          const ment = lista.map((v) => ({ ...v, nev: v.nev.trim(), szoveg: v.szoveg.trim() }))
          await data.velemenyekMentes(ment)
          const uj = tisztit(await data.velemenyekLista())
          setEredeti(uj)
          setLista(uj)
        })}
      />

      <section className="panel pub-velemeny-elonezet">
        <h3>Előnézet</h3>
        <div className="panel-torzs">
          {megjelenik.length === 0 ? (
            <p className="halk">Még nincs megjeleníthető vélemény, ezért a sáv most nem látszik a publikus oldalon.</p>
          ) : (
            <TartalomProvider t={elonezet} lemondasOra={pub.lemondasOra}>
              <Elonezet szel={1280} keret>
                <KoncepcioResz resz="velemenyek" mod={mod} k={pub.katalogus} />
              </Elonezet>
            </TartalomProvider>
          )}
        </div>
      </section>

      <section className="panel">
        <h3>
          Vélemények
          <span className="halk pub-velemeny-szam">{megjelenik.length} látszik a {lista.length}-ból</span>
        </h3>
        <div className="panel-torzs pub-velemeny-lista">
          <p className="halk pub-megjegyzes">
            Másold át a szöveget a Google-értékelésből, a nevet úgy, ahogy a Google-on látszik. A 3 vagy kevesebb csillagosakat is
            felveheted, ezek nem jelennek meg, de megmaradnak itt.
          </p>
          {lista.length === 0 && <p className="halk">Még nincs felvett vélemény.</p>}
          {lista.map((v, i) => (
            <div key={i} className="pub-velemeny" data-rejtett={!v.aktiv || v.csillag < 4 || undefined}>
              <div className="pub-velemeny-sor">
                <Mezo cimke="Név">
                  <input className="beviteli" value={v.nev} maxLength={80} placeholder="pl. Kovács Anna"
                         onChange={(e) => valt(i, { nev: e.target.value })} data-mezo="nev" />
                </Mezo>
                <div className="mezo pub-mezo">
                  <span>Csillag</span>
                  <div className="pub-csillagok" role="radiogroup" aria-label={`${i + 1}. vélemény csillagai`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={v.csillag === n} aria-label={`${n} csillag`}
                              data-tele={n <= v.csillag || undefined} onClick={() => valt(i, { csillag: n })} />
                    ))}
                  </div>
                </div>
                <div className="mezo pub-mezo">
                  <span>Dátum (nem kötelező)</span>
                  <div className="pub-velemeny-datum">
                    <input className="beviteli" type="date" value={v.datum ?? ''} aria-label={`${i + 1}. vélemény dátuma`}
                           onChange={(e) => valt(i, { datum: e.target.value || null })} data-mezo="datum" />
                    {v.datum && (
                      <button type="button" className="btn btn-kicsi btn-csendes" onClick={() => valt(i, { datum: null })}>Dátum törlése</button>
                    )}
                  </div>
                </div>
              </div>
              <Mezo cimke="Szöveg">
                <textarea className="beviteli" rows={3} value={v.szoveg} maxLength={1500}
                          onChange={(e) => valt(i, { szoveg: e.target.value })} data-mezo="szoveg" />
              </Mezo>
              <div className="pub-velemeny-also">
                <label className="pub-pipa">
                  <input type="checkbox" checked={v.aktiv} onChange={(e) => valt(i, { aktiv: e.target.checked })} />
                  <span>Megjelenik a publikus oldalon{v.csillag < 4 ? ' (4 csillag alatt nem)' : ''}</span>
                </label>
                <div className="pub-kamera-gombok">
                  <button type="button" className="btn btn-kicsi btn-csendes" disabled={i === 0} onClick={() => mozgat(i, -1)}>Fel</button>
                  <button type="button" className="btn btn-kicsi btn-csendes" disabled={i === lista.length - 1} onClick={() => mozgat(i, 1)}>Le</button>
                  <button type="button" className="btn btn-kicsi btn-csendes" onClick={() => setLista(lista.filter((_, j) => j !== i))}>Törlés</button>
                </div>
              </div>
            </div>
          ))}
          <div>
            <button type="button" className="btn btn-kicsi" disabled={lista.length >= 60}
                    onClick={() => setLista([...lista, { ...UJ }])}>
              + Vélemény
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
