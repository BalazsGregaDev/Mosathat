import { Fragment, type ReactNode } from 'react'

import { FELIRAT } from '../../lib/nyelv'
import { biztonsagosLink, kulsoLink, oldalLink, type JogiBlokk, type ListaBlokk, type Sor } from '../../lib/jogiDokumentum'
import { useJogi, useNyelv } from './tartalom'

function sorokra(s: string): ReactNode {
  const darabok = s.split('\n')
  return darabok.map((d, i) => <Fragment key={i}>{i > 0 && <br />}{d}</Fragment>)
}

function Szoveg({ r, sima = false }: { r: Sor; sima?: boolean }) {
  return (
    <>
      {r.map((f, i) => {
        let x: ReactNode = sorokra(f.s)
        if (!sima && f.i) x = <em>{x}</em>
        if (!sima && f.b) x = <strong>{x}</strong>
        if (f.h) x = <span className="kv-jogi-halk">{x}</span>
        const jo = biztonsagosLink(f.href)
        if (jo) {
          const href = oldalLink(jo)
          x = kulsoLink(href)
            ? <a href={href} target="_blank" rel="noreferrer">{x}</a>
            : <a href={href}>{x}</a>
        }
        return <Fragment key={i}>{x}</Fragment>
      })}
    </>
  )
}

function Lista({ l }: { l: ListaBlokk }) {
  const elemek = l.elemek.map((e, i) => (
    <li key={i}>
      <Szoveg r={e.r} />
      {e.al && <Lista l={e.al} />}
    </li>
  ))
  return l.szamozott ? <ol>{elemek}</ol> : <ul>{elemek}</ul>
}

function Blokk({ b, elsoCim }: { b: JogiBlokk; elsoCim: boolean }) {
  switch (b.t) {
    case 'h1':
      return elsoCim ? <h1><Szoveg r={b.r} sima /></h1> : <h2><Szoveg r={b.r} /></h2>
    case 'h2':
      return <h2><Szoveg r={b.r} /></h2>
    case 'h3':
      return <h3><Szoveg r={b.r} /></h3>
    case 'h4':
      return <h4><Szoveg r={b.r} /></h4>
    case 'p':
      return (
        <p className={b.stilus === 'hataly' ? 'kv-jogi-hataly' : b.stilus === 'halk' ? 'kv-jogi-halk' : undefined}>
          <Szoveg r={b.r} />
        </p>
      )
    case 'lista':
      return <Lista l={b} />
    case 'adatok':
      return (
        <dl className="kv-jogi-adatok">
          {b.sorok.map(([c, e], i) => (
            <div className="kv-jogi-sor" key={i}>
              <dt><Szoveg r={c} sima /></dt>
              <dd><Szoveg r={e} /></dd>
            </div>
          ))}
        </dl>
      )
    case 'tabla': {
      const [fej, ...test] = b.fej ? b.sorok : [null, ...b.sorok]
      return (
        <div className="kv-jogi-tabla">
          <table>
            {fej && (
              <thead>
                <tr>{fej.map((c, i) => <th key={i}><Szoveg r={c} sima /></th>)}</tr>
              </thead>
            )}
            <tbody>
              {test.map((s, i) => s && <tr key={i}>{s.map((c, j) => <td key={j}><Szoveg r={c} /></td>)}</tr>)}
            </tbody>
          </table>
        </div>
      )
    }
  }
}

export default function JogiDokumentum({ blokkok, cim }: { blokkok: JogiBlokk[]; cim: string }) {
  const jogi = useJogi()
  const nyelv = useNyelv()
  const elsoH1 = blokkok.findIndex((b) => b.t === 'h1')
  return (
    <article className="kv-jogi" data-feltoltott>
      {jogi.tervezet && <p className="kv-jogi-tervezet" role="note">{FELIRAT[nyelv].tervezet}</p>}
      {elsoH1 < 0 && <h1>{cim}</h1>}
      {blokkok.map((b, i) => <Blokk key={i} b={b} elsoCim={i === elsoH1} />)}
    </article>
  )
}
