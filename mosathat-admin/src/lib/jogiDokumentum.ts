import { CEG } from './ceg'
import type { Nyelv } from './nyelv'

export type JogiLap = 'impresszum' | 'adatvedelem'

export const JOGI_LAPOK: JogiLap[] = ['impresszum', 'adatvedelem']

export interface Futam {
  s: string
  b?: true
  i?: true
  h?: true
  href?: string
}

export type Sor = Futam[]

export interface ListaElem {
  r: Sor
  al?: ListaBlokk
}

export interface ListaBlokk {
  t: 'lista'
  szamozott?: true
  elemek: ListaElem[]
}

export interface CimBlokk {
  t: 'h1' | 'h2' | 'h3' | 'h4'
  r: Sor
}

export type JogiBlokk =
  | CimBlokk
  | { t: 'p'; r: Sor; stilus?: 'halk' | 'hataly' }
  | ListaBlokk
  | { t: 'tabla'; fej: boolean; sorok: Sor[][] }
  | { t: 'adatok'; sorok: [Sor, Sor][] }

export interface JogiValtozat {
  id: string
  dokumentum: JogiLap
  nyelv: Nyelv
  beepitett: boolean
  fajlnev: string | null
  meret: number | null
  feltolto_nev: string | null
  letrehozva: string
  aktivalva: string
  aktivalta_nev: string | null
  aktiv: boolean
}

export interface JogiFeltoltes {
  dokumentum: JogiLap
  nyelv: Nyelv
  fajlnev: string
  fajl: string
  tartalom: JogiBlokk[]
}

export interface JogiFajl {
  fajlnev: string | null
  fajl: string | null
  beepitett: boolean
}

const WEBOLDAL = `https://${CEG.honlap}`

const SAJAT_HOSZT = new Set([CEG.honlap, `www.${CEG.honlap}`])

export function biztonsagosLink(href: string | null | undefined): string | undefined {
  const h = href?.trim()
  if (!h) return undefined
  if (/^(mailto|tel):[^\s<>"]+$/i.test(h)) return h
  if (h.startsWith('/') && !h.startsWith('//')) return h
  try {
    const u = new URL(h)
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href
  } catch {
    return undefined
  }
  return undefined
}

export function oldalLink(href: string): string {
  if (!/^https?:/i.test(href)) return href
  try {
    const u = new URL(href)
    if (SAJAT_HOSZT.has(u.hostname.toLowerCase())) return `${u.pathname}${u.search}${u.hash}` || '/'
  } catch {
    return href
  }
  return href
}

export function teljesLink(href: string): string {
  return href.startsWith('/') && !href.startsWith('//') ? `${WEBOLDAL}${href}` : href
}

export function kulsoLink(href: string): boolean {
  return /^https?:/i.test(href)
}

const tomb = (x: unknown): x is unknown[] => Array.isArray(x)

function joSor(r: unknown): r is Sor {
  return tomb(r) && r.every((f) => typeof f === 'object' && f !== null && typeof (f as Futam).s === 'string'
    && ((f as Futam).href === undefined || typeof (f as Futam).href === 'string'))
}

function joLista(l: unknown): l is ListaBlokk {
  const x = l as ListaBlokk
  return typeof l === 'object' && l !== null && x.t === 'lista' && tomb(x.elemek)
    && x.elemek.every((e) => typeof e === 'object' && e !== null && joSor(e.r) && (e.al === undefined || joLista(e.al)))
}

export function ervenyesBlokkok(adat: unknown): JogiBlokk[] | null {
  if (!tomb(adat) || adat.length === 0) return null
  const jo = adat.every((b) => {
    if (typeof b !== 'object' || b === null) return false
    const x = b as JogiBlokk
    switch (x.t) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'p':
        return joSor(x.r)
      case 'lista':
        return joLista(x)
      case 'tabla':
        return tomb(x.sorok) && x.sorok.every((s) => tomb(s) && s.every(joSor))
      case 'adatok':
        return tomb(x.sorok) && x.sorok.every((s) => tomb(s) && s.length === 2 && joSor(s[0]) && joSor(s[1]))
      default:
        return false
    }
  })
  return jo ? (adat as JogiBlokk[]) : null
}

export function sorSzoveg(r: Sor): string {
  return r.map((f) => f.s).join('')
}

export function blokkokSzovege(blokkok: JogiBlokk[]): string {
  const listaSorai = (l: ListaBlokk): string[] => l.elemek.flatMap((e) => [sorSzoveg(e.r), ...(e.al ? listaSorai(e.al) : [])])
  return blokkok.flatMap((b) => {
    if (b.t === 'lista') return listaSorai(b)
    if (b.t === 'tabla') return b.sorok.map((s) => s.map(sorSzoveg).join(' | '))
    if (b.t === 'adatok') return b.sorok.map(([c, e]) => `${sorSzoveg(c)}: ${sorSzoveg(e)}`)
    return [sorSzoveg(b.r)]
  }).join('\n')
}

type Forma = Omit<Futam, 's'>

function hozzaad(ki: Sor, s: string, forma: Forma) {
  if (!s) return
  const utolso = ki[ki.length - 1]
  if (utolso && utolso.b === forma.b && utolso.i === forma.i && utolso.h === forma.h && utolso.href === forma.href) {
    utolso.s += s
    return
  }
  ki.push({ s, ...forma })
}

function rendez(ki: Sor): Sor {
  const kesz: Sor = []
  for (const f of ki) {
    const s = f.s.replace(/[ \t\r\f\v ]*\n[ \t\r\f\v ]*/g, '\n').replace(/ {2,}/g, ' ')
    hozzaad(kesz, s, { ...(f.b ? { b: true } : {}), ...(f.i ? { i: true } : {}), ...(f.h ? { h: true } : {}), ...(f.href ? { href: f.href } : {}) } as Forma)
  }
  while (kesz.length && !kesz[0].s.replace(/^[\s\n]+/, '')) kesz.shift()
  while (kesz.length && !kesz[kesz.length - 1].s.replace(/[\s\n]+$/, '')) kesz.pop()
  if (kesz.length) {
    kesz[0].s = kesz[0].s.replace(/^[\s\n]+/, '')
    const u = kesz[kesz.length - 1]
    u.s = u.s.replace(/[\s\n]+$/, '')
  }
  return kesz.filter((f) => f.s)
}

const BLOKK_ELEMEK = new Set(['p', 'div', 'li', 'ul', 'ol', 'table', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dl', 'dt', 'dd', 'section', 'blockquote'])

function futamok(el: Node, listakNelkul = false): Sor {
  const ki: Sor = []
  const jar = (n: Node, forma: Forma) => {
    if (n.nodeType === 3) {
      hozzaad(ki, (n.nodeValue ?? '').replace(/[ \t\n\r\f\v]+/g, ' '), forma)
      return
    }
    if (n.nodeType !== 1) return
    const e = n as Element
    const tag = e.tagName.toLowerCase()
    if (tag === 'br') { hozzaad(ki, '\n', forma); return }
    if (tag === 'img' || tag === 'script' || tag === 'style') return
    if (listakNelkul && (tag === 'ul' || tag === 'ol')) return
    let uj = forma
    if (tag === 'strong' || tag === 'b') uj = { ...uj, b: true }
    if (tag === 'em' || tag === 'i') uj = { ...uj, i: true }
    if (tag === 'span' && e.classList.contains('kv-jogi-halk')) uj = { ...uj, h: true }
    if (tag === 'a') {
      const href = e.getAttribute('href') ?? ''
      if (/^#(footnote|endnote|comment)-ref/.test(href)) return
      const jo = biztonsagosLink(href)
      if (jo) uj = { ...uj, href: jo }
    }
    const blokk = BLOKK_ELEMEK.has(tag)
    if (blokk && ki.length) hozzaad(ki, '\n', forma)
    if (tag === 'li') hozzaad(ki, '• ', forma)
    e.childNodes.forEach((c) => jar(c, uj))
    if (tag === 'td' || tag === 'th') hozzaad(ki, ' ', forma)
  }
  el.childNodes.forEach((c) => jar(c, {}))
  return rendez(ki)
}

function lista(el: Element): ListaBlokk {
  const elemek: ListaElem[] = []
  for (const li of Array.from(el.children)) {
    if (li.tagName.toLowerCase() !== 'li') continue
    const r = futamok(li, true)
    const al = Array.from(li.children).find((c) => /^(ul|ol)$/i.test(c.tagName))
    const elem: ListaElem = { r }
    if (al) {
      const alLista = lista(al)
      if (alLista.elemek.length) elem.al = alLista
    }
    if (r.length || elem.al) elemek.push(elem)
  }
  return el.tagName.toLowerCase() === 'ol' ? { t: 'lista', szamozott: true, elemek } : { t: 'lista', elemek }
}

function tablaSorok(el: Element): { sorok: Sor[][]; fej: boolean } {
  const sorok: Sor[][] = []
  let fej = false
  const trk = Array.from(el.querySelectorAll('tr')).filter((tr) => tr.closest('table') === el)
  trk.forEach((tr, i) => {
    const cellak = Array.from(tr.children).filter((c) => /^(td|th)$/i.test(c.tagName))
    if (i === 0) fej = tr.parentElement?.tagName.toLowerCase() === 'thead' || (cellak.length > 0 && cellak.every((c) => c.tagName.toLowerCase() === 'th'))
    sorok.push(cellak.map((c) => futamok(c)))
  })
  return { sorok: sorok.filter((s) => s.some((c) => c.length)), fej }
}

function tabla(el: Element): JogiBlokk | null {
  const { sorok, fej } = tablaSorok(el)
  if (!sorok.length) return null
  if (!fej && sorok.every((s) => s.length === 2)) return { t: 'adatok', sorok: sorok as [Sor, Sor][] }
  return { t: 'tabla', fej, sorok }
}

function adatok(el: Element): JogiBlokk | null {
  const sorok: [Sor, Sor][] = []
  let cimke: Sor | null = null
  const jar = (szulo: Element) => {
    for (const c of Array.from(szulo.children)) {
      const tag = c.tagName.toLowerCase()
      if (tag === 'dt') cimke = futamok(c)
      else if (tag === 'dd') { sorok.push([cimke ?? [], futamok(c)]); cimke = null }
      else if (tag === 'div') jar(c)
    }
  }
  jar(el)
  return sorok.length ? { t: 'adatok', sorok } : null
}

function bekezdesStilus(el: Element): 'halk' | 'hataly' | undefined {
  if (el.classList.contains('kv-jogi-hataly')) return 'hataly'
  if (el.classList.contains('kv-jogi-halk')) return 'halk'
  return undefined
}

export function htmlBolBlokkok(gyoker: ParentNode): JogiBlokk[] {
  const ki: JogiBlokk[] = []
  const jar = (szulo: ParentNode) => {
    for (const el of Array.from(szulo.children)) {
      if (el.classList.contains('kv-jogi-tervezet')) continue
      const tag = el.tagName.toLowerCase()
      const fejszint = /^h([1-6])$/.exec(tag)
      if (fejszint) {
        const r = futamok(el)
        if (r.length) ki.push({ t: (`h${Math.min(4, Number(fejszint[1]))}`) as 'h1' | 'h2' | 'h3' | 'h4', r })
      } else if (tag === 'p') {
        const r = futamok(el)
        const stilus = bekezdesStilus(el)
        if (r.length) ki.push(stilus ? { t: 'p', r, stilus } : { t: 'p', r })
      } else if (tag === 'ul' || tag === 'ol') {
        const l = lista(el)
        if (l.elemek.length) ki.push(l)
      } else if (tag === 'table') {
        const t = tabla(el)
        if (t) ki.push(t)
      } else if (tag === 'dl') {
        const a = adatok(el)
        if (a) ki.push(a)
      } else if (['div', 'section', 'article', 'main', 'header', 'footer', 'blockquote', 'aside', 'nav'].includes(tag)) {
        jar(el)
      } else {
        const r = futamok(el)
        if (r.length) ki.push({ t: 'p', r })
      }
    }
  }
  jar(gyoker)
  return ki
}

export function base64bol(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const ki = new ArrayBuffer(bin.length)
  const b = new Uint8Array(ki)
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i)
  return ki
}

export function base64be(adat: ArrayBuffer): string {
  const b = new Uint8Array(adat)
  let bin = ''
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function letoltes(adat: Blob, nev: string) {
  const url = URL.createObjectURL(adat)
  const a = document.createElement('a')
  a.href = url
  a.download = nev
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
