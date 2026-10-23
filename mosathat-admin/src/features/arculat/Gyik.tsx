import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import DOMPurify from 'dompurify'

import {
  fooldalra, GYIK_KATEGORIAK, nyelvre, simaSzoveg, type GyikKategoria, type GyikKerdes, type GyikMegjelenes,
} from '../../lib/gyik'
import { nyelviUt } from '../../lib/nyelv'
import { Gazdag, telefonLink, useGyik, useNyelv, useSz, useUzlet } from '../publikus/tartalom'

const MINTA: GyikKerdes[] = [
  { id: 'minta-1', kerdes: 'Minta kérdés: mennyi ideig tart egy mosás?', valasz: '<p>Minta válasz. A valódi kérdéseket a GYIK menüben írhatod meg és publikálhatod.</p>', kerdes_en: null, valasz_en: null, kategoria: 'EGYEB', kiemelt: true },
  { id: 'minta-2', kerdes: 'Minta kérdés: kézzel mostok?', valasz: '<p>Minta válasz <strong>kiemeléssel</strong> és felsorolással:</p><ul><li>első pont</li><li>második pont</li></ul>', kerdes_en: null, valasz_en: null, kategoria: 'KULSO', kiemelt: true },
  { id: 'minta-3', kerdes: 'Minta kérdés: kiszedik a kutyaszőrt?', valasz: '<p>Minta válasz.</p>', kerdes_en: null, valasz_en: null, kategoria: 'BELSO', kiemelt: true },
]

const ENGEDETT_CIMKEK = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'hr']
const ENGEDETT_ATTR = ['href', 'src', 'alt', 'title', 'loading']
const ENGEDETT_URI = /^(?:https?:|mailto:|tel:|\/|#|data:image\/(?:png|jpe?g|webp|gif);base64,)/i

let horog = false

export function tisztaHtml(html: string): string {
  if (!horog) {
    horog = true
    DOMPurify.addHook('afterSanitizeAttributes', (n) => {
      if (n.tagName === 'A') {
        const href = n.getAttribute('href') ?? ''
        if (/^https?:/i.test(href) && !href.startsWith(window.location.origin)) {
          n.setAttribute('target', '_blank')
          n.setAttribute('rel', 'noopener noreferrer')
        }
      }
      if (n.tagName === 'IMG') {
        n.setAttribute('loading', 'lazy')
        n.setAttribute('decoding', 'async')
      }
    })
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ENGEDETT_CIMKEK,
    ALLOWED_ATTR: [...ENGEDETT_ATTR, 'target', 'rel', 'decoding'],
    ALLOWED_URI_REGEXP: ENGEDETT_URI,
  })
}

export const KAT_KULCS = {
  KULSO: 'gyik.kat.kulso',
  BELSO: 'gyik.kat.belso',
  EGYEB: 'gyik.kat.egyeb',
} as const

function Elem({ k }: { k: GyikMegjelenes }) {
  const html = useMemo(() => tisztaHtml(k.valasz), [k.valasz])
  return (
    <details className="kv-gyik-elem" id={`kerdes-${k.id.slice(0, 8)}`}>
      <summary>
        <span className="kv-gyik-kerdes">{k.kerdes}</span>
        <span className="kv-gyik-jel" aria-hidden="true" />
      </summary>
      <div className="kv-gyik-valasz" dangerouslySetInnerHTML={{ __html: html }} />
    </details>
  )
}

export function GyikLista({ kerdesek }: { kerdesek: GyikMegjelenes[] }) {
  return (
    <div className="kv-gyik-lista">
      {kerdesek.map((k) => <Elem key={k.id} k={k} />)}
    </div>
  )
}

const tiltott = (e: MouseEvent) => e.preventDefault()

function magosVeletlen(mag: number) {
  let x = mag
  return () => {
    x = ((x * 9301 + 49297) % 233280) / 233280
    return x
  }
}

export default function GyikSzakasz({ nyilvanos, minta = false }: { nyilvanos: boolean; minta?: boolean }) {
  const g = useGyik()
  const sz = useSz()
  const nyelv = useNyelv()
  const forras = useMemo(() => (g.kerdesek.length || !minta ? g : { ...g, kerdesek: MINTA }), [g, minta])
  const [mag] = useState(() => Math.random())
  const kerdesek = useMemo(() => fooldalra(forras, magosVeletlen(mag)).map((k) => nyelvre(k, nyelv)), [forras, mag, nyelv])
  if (kerdesek.length === 0) return null
  const tobb = forras.kerdesek.length > kerdesek.length
  return (
    <section className="kv-gyik" aria-labelledby="kv-gyik-cim">
      <div className="kv-gyik-fej">
        <h2 id="kv-gyik-cim">{sz('gyik.cim')}</h2>
        <p className="kv-bevezeto"><Gazdag s={sz('gyik.bevezeto')} /></p>
        {tobb && (
          <a className="kv-link kv-gyik-tovabb" href={nyelviUt('/gyik', nyelv)} onClick={nyilvanos ? undefined : tiltott}>
            {sz('gyik.tovabb')}
          </a>
        )}
      </div>
      <GyikLista kerdesek={kerdesek} />
    </section>
  )
}

type Szuro = 'MIND' | GyikKategoria

function hashSzuro(): Szuro {
  const h = window.location.hash.slice(1).toUpperCase()
  return (GYIK_KATEGORIAK as string[]).includes(h) ? (h as GyikKategoria) : 'MIND'
}

function useSeo(cim: string, leiras: string, kerdesek: GyikMegjelenes[], be: boolean) {
  useEffect(() => {
    if (!be) return
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const voltMeta = Boolean(meta)
    const regiLeiras = meta?.content ?? ''
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    meta.content = leiras
    const ld = document.createElement('script')
    ld.type = 'application/ld+json'
    ld.id = 'gyik-ld'
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      name: cim,
      mainEntity: kerdesek.map((k) => ({
        '@type': 'Question',
        name: k.kerdes,
        acceptedAnswer: { '@type': 'Answer', text: simaSzoveg(k.valasz) },
      })),
    })
    document.head.appendChild(ld)
    return () => {
      ld.remove()
      if (voltMeta && meta) meta.content = regiLeiras
      else meta?.remove()
    }
  }, [cim, leiras, kerdesek, be])
}

export function GyikOldal({ nyilvanos, minta = false }: { nyilvanos: boolean; minta?: boolean }) {
  const g = useGyik()
  const sz = useSz()
  const u = useUzlet()
  const nyelv = useNyelv()
  const osszes = useMemo(
    () => (g.kerdesek.length ? g.kerdesek : minta ? MINTA : []).map((k) => nyelvre(k, nyelv)),
    [g.kerdesek, minta, nyelv],
  )
  const [szuro, setSzuro] = useState<Szuro>(() => (nyilvanos ? hashSzuro() : 'MIND'))
  useSeo(sz('gyik.cim'), sz('gyik.leiras'), osszes, nyilvanos)

  useEffect(() => {
    if (!nyilvanos) return
    const figyel = () => setSzuro(hashSzuro())
    window.addEventListener('hashchange', figyel)
    return () => window.removeEventListener('hashchange', figyel)
  }, [nyilvanos])

  const valaszt = (s: Szuro) => {
    setSzuro(s)
    if (!nyilvanos) return
    const url = new URL(window.location.href)
    url.hash = s === 'MIND' ? '' : s.toLowerCase()
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  const katok = GYIK_KATEGORIAK.filter((k) => osszes.some((x) => x.kategoria === k))
  const mutatott = szuro === 'MIND' ? osszes : osszes.filter((k) => k.kategoria === szuro)

  return (
    <article className="kv-gyik-oldal">
      <header className="kv-gyik-oldal-fej">
      <h1>{sz('gyik.cim')}</h1>
      <p className="kv-bevezeto"><Gazdag s={sz('gyik.oldal_bevezeto')} /></p>
      {katok.length > 1 && (
        <div className="kv-gyik-szuro" role="group" aria-label={sz('gyik.cim')}>
          <button type="button" aria-pressed={szuro === 'MIND'} onClick={() => valaszt('MIND')}>
            {sz('gyik.osszes')} <span>{osszes.length}</span>
          </button>
          {katok.map((k) => (
            <button key={k} type="button" aria-pressed={szuro === k} onClick={() => valaszt(k)} data-kat={k}>
              {sz(KAT_KULCS[k])} <span>{osszes.filter((x) => x.kategoria === k).length}</span>
            </button>
          ))}
        </div>
      )}
      </header>
      <div className="kv-gyik-oldal-lista">
      {szuro === 'MIND' && katok.length > 1 ? (
        katok.map((k) => (
          <section key={k} className="kv-gyik-csoport" data-kat={k}>
            <h2>{sz(KAT_KULCS[k])}</h2>
            <GyikLista kerdesek={osszes.filter((x) => x.kategoria === k)} />
          </section>
        ))
      ) : (
        <section className="kv-gyik-csoport">
          <GyikLista kerdesek={mutatott} />
        </section>
      )}
      </div>
      <aside className="kv-gyik-segitseg">
        <h2>{sz('gyik.nem_talalod')}</h2>
        <p>
          <Gazdag s={sz('gyik.nem_talalod_szoveg')}
                  linkek={{ [u.telefon]: telefonLink(u.telefon), [u.email]: `mailto:${u.email}` }} />
        </p>
        <a className="kv-link" href={`${nyelviUt('/publikus', nyelv)}#foglalas`} onClick={nyilvanos ? undefined : tiltott}>
          {sz('gomb.idopont')}
        </a>
      </aside>
    </article>
  )
}
