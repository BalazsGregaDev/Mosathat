import { JOGI_CIM, JOGI_CIM_EN } from './ceg'
import type { Nyelv } from './nyelv'
import {
  blokkokSzovege, htmlBolBlokkok, sorSzoveg, teljesLink,
  type CimBlokk, type JogiBlokk, type JogiLap, type ListaBlokk, type Sor,
} from './jogiDokumentum'

export const MAX_MERET = 2 * 1024 * 1024

const A4_SZEL = 11906
const MARGO = 1134
const HASZNOS = A4_SZEL - 2 * MARGO
const SZOVEG = '1F211F'
const HALK = '6B6F6A'
const VONAL = 'C9CCC6'

export function jogiCim(lap: JogiLap, nyelv: Nyelv): string {
  return (nyelv === 'en' ? JOGI_CIM_EN : JOGI_CIM)[lap]
}

export async function wordbe(blokkok: JogiBlokk[], lap: JogiLap, nyelv: Nyelv): Promise<Blob> {
  const d = await import('docx')
  const {
    AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, HeadingLevel, LevelFormat, Packer,
    PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, UnderlineType, WidthType,
  } = d
  type Gyerek = InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>

  const futamok = (r: Sor, alap: { bold?: boolean; size?: number; color?: string } = {}): Gyerek[] => {
    const ki: Gyerek[] = []
    for (const f of r) {
      const darabok = f.s.split('\n')
      const futas = darabok.map((s, i) => new TextRun({
        text: s,
        break: i > 0 ? 1 : undefined,
        bold: f.b || alap.bold || undefined,
        italics: f.i || undefined,
        size: alap.size,
        color: alap.color,
        style: f.href ? 'Hyperlink' : f.h ? 'HalkKar' : undefined,
      }))
      if (f.href) ki.push(new ExternalHyperlink({ link: teljesLink(f.href), children: futas }))
      else ki.push(...futas)
    }
    return ki
  }

  const szint = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4 }
  let listaPeldany = 0
  const vonal = { style: BorderStyle.SINGLE, size: 4, color: VONAL }
  const semmi = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const keretek = { top: vonal, bottom: vonal, left: semmi, right: semmi, insideHorizontal: vonal, insideVertical: semmi }
  const cellaMargo = { top: 70, bottom: 70, left: 60, right: 140 }

  const lista = (l: ListaBlokk, mely: number, peldany: number): InstanceType<typeof Paragraph>[] =>
    l.elemek.flatMap((e) => [
      new Paragraph({
        numbering: { reference: l.szamozott ? 'szamok' : 'pontok', level: Math.min(mely, 3), instance: peldany },
        spacing: { after: 60 },
        children: futamok(e.r),
      }),
      ...(e.al ? lista(e.al, mely + 1, e.al.szamozott ? ++listaPeldany : peldany) : []),
    ])

  const cella = (r: Sor, szel: number, opt: { fej?: boolean; cimke?: boolean } = {}) => new TableCell({
    width: { size: szel, type: WidthType.DXA },
    margins: cellaMargo,
    shading: opt.fej ? { type: ShadingType.CLEAR, fill: 'F1F2EF', color: 'auto' } : undefined,
    children: [new Paragraph({
      spacing: { after: 0 },
      children: futamok(r, opt.fej || opt.cimke ? { bold: true, size: opt.cimke ? 18 : 19, color: opt.cimke ? '4A4D49' : undefined } : {}),
    })],
  })

  const tablazat = (szelek: number[], sorok: InstanceType<typeof TableRow>[]) => [
    new Table({ width: { size: HASZNOS, type: WidthType.DXA }, columnWidths: szelek, borders: keretek, rows: sorok }),
    new Paragraph({ spacing: { after: 60 }, children: [] }),
  ]

  const elemek = blokkok.flatMap((b): (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] => {
    switch (b.t) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
        return [new Paragraph({ heading: szint[b.t], children: futamok(b.r) })]
      case 'p':
        return [new Paragraph({ style: b.stilus === 'halk' ? 'Halk' : b.stilus === 'hataly' ? 'Hataly' : undefined, children: futamok(b.r) })]
      case 'lista':
        return lista(b, 0, ++listaPeldany)
      case 'adatok': {
        const elso = Math.round(HASZNOS * 0.3)
        const szelek = [elso, HASZNOS - elso]
        return tablazat(szelek, b.sorok.map(([c, e]) => new TableRow({
          cantSplit: true,
          children: [cella(c, szelek[0], { cimke: true }), cella(e, szelek[1])],
        })))
      }
      case 'tabla': {
        const oszlop = Math.max(1, ...b.sorok.map((s) => s.length))
        const szel = Math.floor(HASZNOS / oszlop)
        const szelek = Array.from({ length: oszlop }, (_, i) => (i === oszlop - 1 ? HASZNOS - szel * (oszlop - 1) : szel))
        return tablazat(szelek, b.sorok.map((s, i) => new TableRow({
          tableHeader: b.fej && i === 0 ? true : undefined,
          cantSplit: true,
          children: szelek.map((w, j) => cella(s[j] ?? [], w, { fej: b.fej && i === 0 })),
        })))
      }
    }
  })

  const szintek = (format: (typeof LevelFormat)[keyof typeof LevelFormat], jelek: string[]) =>
    jelek.map((text, level) => ({
      level,
      format,
      text,
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 400 + level * 360, hanging: 280 } } },
    }))

  const doc = new Document({
    title: jogiCim(lap, nyelv),
    creator: 'Mosathat',
    lastModifiedBy: 'Mosathat',
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 21, color: SZOVEG, language: { value: nyelv === 'en' ? 'en-GB' : 'hu-HU' } },
          paragraph: { spacing: { after: 120, line: 288 } },
        },
        heading1: { run: { font: 'Calibri', size: 40, bold: false, color: SZOVEG }, paragraph: { spacing: { before: 0, after: 100 } } },
        heading2: { run: { font: 'Calibri', size: 28, bold: true, color: SZOVEG }, paragraph: { spacing: { before: 380, after: 120 }, keepNext: true } },
        heading3: { run: { font: 'Calibri', size: 23, bold: true, color: SZOVEG }, paragraph: { spacing: { before: 260, after: 80 }, keepNext: true } },
        heading4: { run: { font: 'Calibri', size: 21, bold: true, italics: true, color: SZOVEG }, paragraph: { spacing: { before: 200, after: 60 }, keepNext: true } },
        hyperlink: { run: { color: '1F4D35', underline: { type: UnderlineType.SINGLE, color: '1F4D35' } } },
      },
      characterStyles: [
        { id: 'HalkKar', name: 'Halk szöveg', basedOn: 'DefaultParagraphFont', quickFormat: true, run: { size: 18, color: HALK } },
      ],
      paragraphStyles: [
        { id: 'Halk', name: 'Halk', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 18, color: HALK } },
        { id: 'Hataly', name: 'Hatály', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 19, color: HALK }, paragraph: { spacing: { after: 200 } } },
      ],
    },
    numbering: {
      config: [
        { reference: 'pontok', levels: szintek(LevelFormat.BULLET, ['•', '◦', '▪', '•']) },
        { reference: 'szamok', levels: szintek(LevelFormat.DECIMAL, ['%1.', '%2.', '%3.', '%4.']) },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: MARGO, bottom: MARGO, left: MARGO, right: MARGO } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT], size: 17, color: HALK })],
          })],
        }),
      },
      children: elemek,
    }],
  })
  return Packer.toBlob(doc)
}

export function wordFajlnev(lap: JogiLap, nyelv: Nyelv): string {
  const nev = lap === 'impresszum' ? 'Impresszum' : 'Adatvedelmi_tajekoztato'
  return `Mosathat_${nev}_${nyelv.toUpperCase()}.docx`
}

export interface Beolvasas {
  blokkok: JogiBlokk[]
  figyelmeztetesek: string[]
}

const STILUSOK = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => p:fresh",
  "p.Halk => p.kv-jogi-halk:fresh",
  "p[style-name='Halk'] => p.kv-jogi-halk:fresh",
  "p.Hataly => p.kv-jogi-hataly:fresh",
  "p[style-name='Hatály'] => p.kv-jogi-hataly:fresh",
  "r.HalkKar => span.kv-jogi-halk",
  "r[style-name='Halk szöveg'] => span.kv-jogi-halk",
]

function ekezetArany(szoveg: string): number {
  const betuk = szoveg.match(/\p{L}/gu)?.length ?? 0
  if (!betuk) return 0
  return (szoveg.match(/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g)?.length ?? 0) / betuk
}

export async function wordbol(adat: ArrayBuffer, lap: JogiLap, nyelv: Nyelv): Promise<Beolvasas> {
  const fej = new Uint8Array(adat.slice(0, 4))
  if (fej[0] !== 0x50 || fej[1] !== 0x4b || fej[2] !== 0x03 || fej[3] !== 0x04) {
    throw new Error('Ez nem Word (.docx) fájl. Régi .doc fájlt Wordben nyiss meg, és mentsd el Word-dokumentumként (.docx).')
  }
  const JSZip = (await import('jszip')).default
  let dokumentumXml: string
  let megjegyzesXml: string | null
  try {
    const zip = await JSZip.loadAsync(adat)
    const fo = zip.file('word/document.xml')
    if (!fo) throw new Error('nincs document.xml')
    dokumentumXml = await fo.async('string')
    megjegyzesXml = (await zip.file('word/comments.xml')?.async('string')) ?? null
  } catch {
    throw new Error('A fájlt nem sikerült Word-dokumentumként megnyitni. Nyisd meg Wordben, és mentsd el újra .docx formátumban.')
  }

  const mammoth = (await import('mammoth')).default
  let html: string
  let kepek = 0
  try {
    const eredmeny = await mammoth.convertToHtml({ arrayBuffer: adat }, {
      styleMap: STILUSOK,
      convertImage: mammoth.images.imgElement(() => { kepek++; return Promise.resolve({ src: '' }) }),
    })
    html = eredmeny.value
  } catch {
    throw new Error('A dokumentum szövegét nem sikerült beolvasni. Nyisd meg Wordben, és mentsd el újra .docx formátumban.')
  }

  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const lab = Array.from(dom.body.querySelectorAll('li[id^="footnote-"], li[id^="endnote-"]'))
  const blokkok = htmlBolBlokkok(dom.body)
  if (!blokkok.length) throw new Error('A dokumentumban nincs szöveg.')

  const figyelmeztetesek: string[] = []
  const cim = jogiCim(lap, nyelv)
  if (/<w:(ins|del|moveFrom|moveTo)\b/.test(dokumentumXml)) {
    figyelmeztetesek.push('A dokumentumban elfogadatlan követett változtatások vannak. A weboldalra úgy kerül, mintha mindet elfogadtad volna: a beszúrások bent maradnak, a törlések kimaradnak. Biztosabb, ha előbb Wordben elfogadod vagy elveted őket.')
  }
  if (megjegyzesXml && /<w:comment\b/.test(megjegyzesXml)) {
    figyelmeztetesek.push('A dokumentumban megjegyzések vannak. Ezek nem jelennek meg a weboldalon, de a feltöltött fájlban megmaradnak.')
  }
  if (kepek > 0) {
    figyelmeztetesek.push(`${kepek === 1 ? 'Egy kép' : `${kepek} kép`} van a dokumentumban. A képek nem jelennek meg a weboldalon.`)
  }
  if (lab.length > 0) {
    figyelmeztetesek.push('A lábjegyzetek a weboldalon a szöveg végére kerülnek, számozott listába.')
  }
  const elsoCim = blokkok.find((b): b is CimBlokk => b.t === 'h1')
  if (!elsoCim) {
    figyelmeztetesek.push(`A dokumentumban nincs „Címsor 1” stílusú cím, ezért a weboldalon „${cim}” lesz a cím. Ha a Wordben a dokumentum címét Címsor 1 stílusra állítod, az jelenik meg.`)
  }
  if (!blokkok.some((b) => b.t === 'h2' || b.t === 'h3') && blokkok.length > 12) {
    figyelmeztetesek.push('Nincsenek fejezetcímek a dokumentumban. Ha a Wordben a fejezetcímeket Címsor 2 stílusra állítod, a weboldalon is kiemelve jelennek meg.')
  }
  const fejSzoveg = (elsoCim ? sorSzoveg(elsoCim.r) : blokkokSzovege(blokkok.slice(0, 2))).toLowerCase()
  if (lap === 'impresszum' && /adatvédelm|adatkezel|privacy/.test(fejSzoveg)) {
    figyelmeztetesek.push('Úgy tűnik, ez az Adatvédelmi tájékoztató, pedig az Impresszum helyére töltöd fel.')
  }
  if (lap === 'adatvedelem' && /impresszum|legal notice|imprint/.test(fejSzoveg)) {
    figyelmeztetesek.push('Úgy tűnik, ez az Impresszum, pedig az Adatvédelmi tájékoztató helyére töltöd fel.')
  }
  const szoveg = blokkokSzovege(blokkok)
  const arany = ekezetArany(szoveg)
  if (nyelv === 'en' && arany > 0.06) {
    figyelmeztetesek.push('Úgy tűnik, ez magyar szöveg, pedig az angol változat helyére töltöd fel.')
  }
  if (nyelv === 'hu' && szoveg.length > 400 && arany < 0.04) {
    figyelmeztetesek.push('Úgy tűnik, ez nem magyar szöveg, pedig a magyar változat helyére töltöd fel.')
  }
  return { blokkok, figyelmeztetesek }
}
