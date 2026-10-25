import { useState, type FormEvent } from 'react'

import type { FoglalasTalalat } from '../../../../supabase/functions/_shared/tipusok.ts'
import type { DataSource } from '../../data/source'
import { hibaSzoveg } from '../../lib/format'
import { FELIRAT, hibaFordit, nyelviUt } from '../../lib/nyelv'
import Ablak from '../common/Ablak'
import { useKereso } from './keresoKontextus'
import { telefonLink, useFormatum, useNyelv, useSz, useUzlet } from './tartalom'

type Mezo = 'rendszam' | 'telefon' | 'email'
const URES: Record<Mezo, string> = { rendszam: '', telefon: '', email: '' }

export function KeresoSor() {
  const fe = FELIRAT[useNyelv()]
  const kereso = useKereso()
  if (!kereso) return null
  return (
    <div className="kv-kereso kv-kereso-csukva">
      <span>{fe.kerKerdes}</span>
      <button type="button" className="kv-kereso-nyito" aria-haspopup="dialog" onClick={kereso.nyit}>
        {fe.kerNyito}
      </button>
    </div>
  )
}

export function KeresoAblak({ forras }: { forras: DataSource }) {
  const kereso = useKereso()
  if (!kereso?.nyitva) return null
  return <KeresoUrlap forras={forras} onBezar={kereso.zar} />
}

function KeresoUrlap({ forras, onBezar }: { forras: DataSource; onBezar: () => void }) {
  const nyelv = useNyelv()
  const sz = useSz()
  const f = useFormatum()
  const u = useUzlet()
  const fe = FELIRAT[nyelv]
  const [adat, setAdat] = useState(URES)
  const [megy, setMegy] = useState(false)
  const [hiba, setHiba] = useState<string | null>(null)
  const [talalat, setTalalat] = useState<FoglalasTalalat[] | null>(null)

  const kitoltve = (Object.keys(URES) as Mezo[]).filter((k) => adat[k].trim() !== '').length
  const oldal = (token: string) => nyelviUt(`/foglalas/${token}`, nyelv)

  function ir(k: Mezo, v: string) {
    setAdat((a) => ({ ...a, [k]: k === 'rendszam' ? v.toUpperCase() : v }))
    setTalalat(null)
    setHiba(null)
  }

  async function keres(e: FormEvent) {
    e.preventDefault()
    if (kitoltve < 2 || megy) return
    setMegy(true)
    setHiba(null)
    setTalalat(null)
    try {
      const lista = await forras.foglalasKereses({
        rendszam: adat.rendszam.trim(), telefon: adat.telefon.trim(), email: adat.email.trim(),
      })
      if (lista.length === 1) {
        window.location.assign(oldal(lista[0].token))
        return
      }
      setTalalat(lista)
    } catch (err) {
      setHiba(hibaFordit(hibaSzoveg(err).replace(/^Keresés: /, ''), nyelv))
    } finally {
      setMegy(false)
    }
  }

  const mezo = (k: Mezo, cimke: string, tipus: string, auto: string, elso = false) => (
    <div className="mezo">
      <label htmlFor={`fk-${k}`}>{cimke}</label>
      <input id={`fk-${k}`} data-autofocus={elso || undefined} className="beviteli" type={tipus}
             autoComplete={auto} value={adat[k]}
             inputMode={k === 'telefon' ? 'tel' : k === 'email' ? 'email' : undefined}
             autoCapitalize={k === 'rendszam' ? 'characters' : 'none'} spellCheck={false}
             onChange={(e) => ir(k, e.target.value)} />
    </div>
  )

  return (
    <Ablak osztaly="fedo kv-kereso-fedo" cimkeId="kv-kereso-cim" onEsc={onBezar} onHatter={onBezar}>
      <form className="kv-kereso-ablak fogl-kartya" noValidate onSubmit={(e) => void keres(e)}>
        <div className="kv-kereso-fej">
          <h3 id="kv-kereso-cim">{fe.kerCim}</h3>
          <button type="button" className="kv-kereso-bezar" aria-label={fe.kerBezar}
                  onClick={onBezar}>×</button>
        </div>
        <p className="kv-kereso-leiras">{fe.kerLeiras}</p>
        <div className="kv-kereso-mezok">
          {mezo('rendszam', sz('foglalas.mezo.rendszam'), 'text', 'off', true)}
          {mezo('telefon', sz('foglalas.mezo.telefon'), 'tel', 'tel')}
          {mezo('email', fe.kerEmail, 'email', 'email')}
        </div>
        <div className="kv-kereso-lab">
          <button type="submit" className="btn btn-fo" disabled={kitoltve < 2 || megy}>
            {megy ? fe.kerFolyamat : fe.kerGomb}
          </button>
          {kitoltve < 2 && <small className="kv-kereso-tipp">{fe.kerKetto}</small>}
        </div>
        {hiba && <div className="hibauzenet" role="alert">{hiba}</div>}
        {talalat && talalat.length === 0 && (
          <p className="kv-kereso-nincs" role="status">
            {fe.kerNincs} <a href={telefonLink(u.telefon)}>{u.telefon}</a>
          </p>
        )}
        {talalat && talalat.length > 1 && (
          <div className="kv-kereso-talalat" role="status">
            <p>{fe.kerTobb}</p>
            <ul>
              {talalat.map((t) => (
                <li key={t.token}>
                  <a href={oldal(t.token)}>
                    <strong>{f.napCim(t.nap)}</strong>
                    <span>{[t.rendszam, nyelv === 'en' ? t.csomag_en ?? t.csomag : t.csomag].filter(Boolean).join(' · ')}</span>
                    <span className="kv-kereso-allapot" data-allapot={t.allapot}>{fe.kerAllapot[t.allapot]}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Ablak>
  )
}
