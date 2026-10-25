const ELEJE = '⁣'
const VEGE = '⁤'
const SZAMJEGY = 0xfe00

export function jelol(sorszam: number, szoveg: string): string {
  const kod = [sorszam >> 8, (sorszam >> 4) & 15, sorszam & 15].map((d) => String.fromCharCode(SZAMJEGY + d)).join('')
  return `${ELEJE}${kod}${szoveg}${VEGE}`
}

export function jeloletlen(s: string): string {
  return s.replace(/⁣[︀-️]{3}/g, '').replace(/⁤/g, '')
}

function kodbol(s: string, i: number): number | null {
  const a = s.charCodeAt(i + 1) - SZAMJEGY
  const b = s.charCodeAt(i + 2) - SZAMJEGY
  const c = s.charCodeAt(i + 3) - SZAMJEGY
  if ([a, b, c].some((d) => !(d >= 0 && d < 16))) return null
  return (a << 8) | (b << 4) | c
}

function szovegCsomopontok(gyoker: Node): Text[] {
  const ki: Text[] = []
  const jaro = document.createTreeWalker(gyoker, NodeFilter.SHOW_TEXT)
  for (let n = jaro.nextNode(); n; n = jaro.nextNode()) ki.push(n as Text)
  return ki
}

export interface Elofordulas {
  sorszam: number
  tartomany: Range
}

export function elofordulasok(gyoker: Node): Elofordulas[] {
  const ki: Elofordulas[] = []
  let nyitott: { sorszam: number; node: Text; hely: number } | null = null
  for (const node of szovegCsomopontok(gyoker)) {
    const s = node.data
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]
      if (ch === ELEJE) {
        const sorszam = kodbol(s, i)
        if (sorszam !== null) nyitott = { sorszam, node, hely: i }
      } else if (ch === VEGE && nyitott) {
        const r = document.createRange()
        r.setStart(nyitott.node, nyitott.hely)
        r.setEnd(node, i + 1)
        ki.push({ sorszam: nyitott.sorszam, tartomany: r })
        nyitott = null
      }
    }
  }
  return ki
}

function pontHelye(x: number, y: number): { node: Node; hely: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y)
    if (p) return { node: p.offsetNode, hely: p.offset }
  }
  if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y)
    if (r) return { node: r.startContainer, hely: r.startOffset }
  }
  return null
}

const benneVan = (r: Range, x: number, y: number) =>
  [...r.getClientRects()].some((t) => x >= t.left - 1 && x <= t.right + 1 && y >= t.top - 1 && y <= t.bottom + 1)

const ATTRIBUTUMOK = ['placeholder', 'aria-label', 'alt', 'title']

function attributumbol(elem: Element | null, gyoker: Element): number | null {
  for (let e = elem; e && gyoker.contains(e); e = e.parentElement) {
    for (const a of ATTRIBUTUMOK) {
      const v = e.getAttribute(a)
      const i = v?.indexOf(ELEJE) ?? -1
      if (v && i >= 0) {
        const s = kodbol(v, i)
        if (s !== null) return s
      }
    }
    if (e.textContent && e.textContent.trim()) break
  }
  return null
}

export function talalat(lista: Elofordulas[], gyoker: Element, x: number, y: number, cel: Element | null): Elofordulas | { sorszam: number; tartomany: null } | null {
  const hely = pontHelye(x, y)
  if (hely && gyoker.contains(hely.node)) {
    const pont = document.createRange()
    pont.setStart(hely.node, Math.min(hely.hely, hely.node.nodeType === Node.TEXT_NODE ? (hely.node as Text).length : hely.node.childNodes.length))
    const jo = lista.find((e) => e.tartomany.isPointInRange(pont.startContainer, pont.startOffset) && benneVan(e.tartomany, x, y))
    if (jo) return jo
  }
  const kozel = lista.find((e) => benneVan(e.tartomany, x, y))
  if (kozel) return kozel
  const doboz = cel?.closest('button, a, summary, label, [role="button"], [role="tab"]')
  if (doboz && gyoker.contains(doboz)) {
    const benne = lista.find((e) => doboz.contains(e.tartomany.commonAncestorContainer) && lathato(e.tartomany))
    if (benne) return benne
  }
  const attr = attributumbol(cel, gyoker)
  return attr === null ? null : { sorszam: attr, tartomany: null }
}

export function lathato(r: Range): boolean {
  return [...r.getClientRects()].some((t) => t.width > 0 && t.height > 0)
}
