import { cellaSzoveg, idoszakCim, lablecArak, naptariHonap } from './igazolo'
import type { SheetColumn, SheetDetail, SheetRow } from './types'

// ---------------------------------------------------------------------------
//  Az igazolólap Word fájlként (.docx)
//
//  A fájlt a BÖNGÉSZŐ állítja össze, a `docx` csomaggal — nincs hozzá
//  szerver, és nem kell hozzá Office sem. Valódi Word dokumentum lesz: Wordben,
//  LibreOffice-ban, Google Dokumentumokban is megnyílik, szerkeszthető,
//  nyomtatható.
//
//  Felépítése:
//
//    fejléc      Cégnév – igazolólap
//                2026. október · adószám
//    táblázat    a LÁTHATÓ oszlopok, a cég saját nevükkel és sorrendjükkel;
//                a fejléc sor minden oldal tetején megismétlődik;
//                az aláírás oszlopban a képernyőn rajzolt aláírás képe,
//                vagy üres cella (papíron aláírható);
//                a végén „Összesen" sor a nettó árral
//    lábléc      (minden oldal alján) a szerződés árai: méret – csomag –
//                nettó ár, alatta a cég saját szövege
//
//  Ha a hónapnak még nincs sora, üres sorokkal készül: kinyomtatva papíron
//  kitölthető.
//
//  A `docx` csomagot csak a letöltéskor töltjük be (import()): nagy, és a
//  program többi részének nincs rá szüksége.
// ---------------------------------------------------------------------------

/** Az oszlopok relatív szélessége; a saját oszlopoké 1,2. */
const SULY: Record<string, number> = {
  DATUM: 1.1, RENDSZAM: 1.1, KM: 1.0, NETTO: 1.1, NEV: 1.6, ALAIRAS: 1.8,
}

// A4, twip-ben (1 cm = 567 twip). Fekvő lapnál a docx csomag megcseréli.
const A4_SZEL = 11906
const A4_MAG = 16838
const MARGO = 850            // kb. 1,5 cm

/** Az aláírás képe a cellában legfeljebb ekkora (képpont). */
const KEP_MAX_SZEL = 130
const KEP_MAX_MAG = 42

/** Ennyi üres sor kerül egy még üres hónap lapjára (papíros kitöltéshez). */
const URES_SOROK = 12

/** "data:image/png;base64,...." → bájtok. */
function dataUrlBajtok(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Egy PNG kép mérete a fájl fejlécéből (16. bájttól: szélesség, majd
 * magasság, 4-4 bájt). Így nem kell a képet betölteni a méretéhez.
 */
function pngMeret(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 24 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return { w: v.getUint32(16), h: v.getUint32(20) }
}

/**
 * A fájl neve: Igazololap_Auto_Trans_Kft_2026-10.docx
 *
 * Ékezet és szóköz nélkül. Ékezetes névvel egyes böngészők (és a tabletek
 * letöltéskezelője) a nevet eldobják, és a fájl „download" néven érkezik,
 * kiterjesztés nélkül — azt pedig a Word sem ismeri fel.
 */
export function wordFajlnev(lap: SheetDetail): string {
  const ceg = lap.company.name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // á → a, ő → o, ...
    .replace(/[^A-Za-z0-9-]+/g, '_')                        // minden más → _
    .replace(/^_+|_+$/g, '')
  // Naptári hónapnál „2026-10"; fordulónapnál az első nap: „2026-10-15".
  const mikor = naptariHonap(lap.period_start)
    ? lap.period_start.slice(0, 7)
    : lap.period_start.slice(0, 10)
  return `Igazololap_${ceg || 'ceg'}_${mikor}.docx`
}

/** Összeállítja a Word fájlt. */
export async function igazoloWord(lap: SheetDetail): Promise<Blob> {
  const d = await import('docx')
  const {
    AlignmentType, BorderStyle, Document, Footer, HeightRule, ImageRun, Packer,
    PageOrientation, Paragraph, ShadingType, Table, TableCell, TableLayoutType,
    TableRow, TextRun, VerticalAlign, WidthType,
  } = d

  const oszlopok = lap.columns.filter((o) => o.visible)
  // Hat oszlopig elfér állóban; ha több, fekvő lap.
  const fekvo = oszlopok.length > 6
  const hasznos = (fekvo ? A4_MAG : A4_SZEL) - 2 * MARGO

  // Az oszlopok szélessége a súlyok arányában.
  const sulyok = oszlopok.map((o) => SULY[o.key] ?? 1.2)
  const osszSuly = sulyok.reduce((a, b) => a + b, 0)
  const szelessegek = sulyok.map((s) => Math.floor((hasznos * s) / osszSuly))

  const jobbra = (o: SheetColumn) => o.key === 'KM' || o.key === 'NETTO'
  const vekony = { style: BorderStyle.SINGLE, size: 4, color: '9AA39A' }
  const keretek = { top: vekony, bottom: vekony, left: vekony, right: vekony }

  /** Egy szöveges cella. */
  const cella = (szoveg: string, i: number, o: SheetColumn | null, vastag = false, fej = false) =>
    new TableCell({
      width: { size: szelessegek[i], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: keretek,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      shading: fej ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E6EBE4' } : undefined,
      children: [new Paragraph({
        alignment: o && jobbra(o) ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: szoveg, bold: vastag || fej, size: fej ? 18 : 20 })],
      })],
    })

  /** Az aláírás cellája: a kép, vagy üres. */
  const alairasCella = (r: SheetRow | null, i: number) => {
    let tartalom: InstanceType<typeof Paragraph>
    const bajtok = r?.signature ? dataUrlBajtok(r.signature) : null
    const meret = bajtok ? pngMeret(bajtok) : null
    if (bajtok && meret) {
      // Arányosan bele a dobozba (és a cella szélességébe).
      const maxSzel = Math.min(KEP_MAX_SZEL, szelessegek[i] / 15 - 10)
      const arany = Math.min(maxSzel / meret.w, KEP_MAX_MAG / meret.h)
      tartalom = new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({
          type: 'png',
          data: bajtok,
          transformation: { width: Math.round(meret.w * arany), height: Math.round(meret.h * arany) },
          altText: { name: 'Aláírás', description: 'Aláírás', title: 'Aláírás' },
        })],
      })
    } else {
      tartalom = new Paragraph({ children: [] })
    }
    return new TableCell({
      width: { size: szelessegek[i], type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      borders: keretek,
      margins: { top: 20, bottom: 20, left: 60, right: 60 },
      children: [tartalom],
    })
  }

  // Minden sor legalább ~0,9 cm magas: papíron is legyen hely aláírni.
  const sorMagassag = { value: 520, rule: HeightRule.ATLEAST }

  const fejSor = new TableRow({
    tableHeader: true,                       // minden oldal tetején megismétlődik
    children: oszlopok.map((o, i) => cella(o.label, i, o, true, true)),
  })

  const adatSorok = lap.rows.map((r) => new TableRow({
    height: sorMagassag,
    cantSplit: true,
    children: oszlopok.map((o, i) =>
      o.key === 'ALAIRAS' ? alairasCella(r, i) : cella(cellaSzoveg(o, r), i, o)),
  }))

  // Üres hónap: üres sorok a papíros kitöltéshez.
  const uresSorok = lap.rows.length > 0 ? [] : Array.from({ length: URES_SOROK }, () => new TableRow({
    height: sorMagassag,
    children: oszlopok.map((o, i) => (o.key === 'ALAIRAS' ? alairasCella(null, i) : cella('', i, o))),
  }))

  // Összesen sor: ha van nettó oszlop és van sor.
  const nettoIdx = oszlopok.findIndex((o) => o.key === 'NETTO')
  const osszesen = lap.rows.reduce((s, r) => s + (r.net_huf ?? 0), 0)
  const osszesSor = nettoIdx >= 0 && lap.rows.length > 0
    ? [new TableRow({
        children: oszlopok.map((o, i) => cella(
          i === nettoIdx ? `${osszesen.toLocaleString('hu-HU')} Ft`
            : i === 0 ? `Összesen: ${lap.rows.length} autó` : '',
          i, o, true)),
      })]
    : []

  const tabla = new Table({
    width: { size: hasznos, type: WidthType.DXA },
    columnWidths: szelessegek,
    layout: TableLayoutType.FIXED,
    rows: [fejSor, ...adatSorok, ...uresSorok, ...osszesSor],
  })

  // --- fejléc a lap tetején --------------------------------------------------
  const alcim = [idoszakCim(lap.period_start, lap.period_end)]
  if (lap.company.tax_number) alcim.push(`Adószám: ${lap.company.tax_number}`)
  const fej = [
    new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: `${lap.company.name} – igazolólap`, bold: true, size: 32 })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: alcim.join(' · '), size: 22, color: '555555' })],
    }),
  ]

  // --- lábléc: minden oldal alján ------------------------------------------
  const lablecSorok = [
    ...lablecArak(lap.prices).map((s) => new Paragraph({
      children: [new TextRun({ text: s, size: 16, color: '444444' })],
    })),
    ...(lap.footer_text ?? '').split('\n').filter((s) => s.trim()).map((s, i) => new Paragraph({
      spacing: { before: i === 0 && lap.prices.length > 0 ? 80 : 0 },
      children: [new TextRun({ text: s, size: 16, color: '444444' })],
    })),
  ]

  const doc = new Document({
    creator: 'Mosathat',
    title: `${lap.company.name} – igazolólap – ${idoszakCim(lap.period_start, lap.period_end)}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: A4_SZEL, height: A4_MAG, orientation: fekvo ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: MARGO, bottom: MARGO, left: MARGO, right: MARGO, footer: 400 },
        },
      },
      footers: lablecSorok.length > 0 ? { default: new Footer({ children: lablecSorok }) } : undefined,
      children: [...fej, tabla],
    }],
  })

  return Packer.toBlob(doc)
}

/** Összeállítja és letölti a fájlt (a böngésző „Letöltések" mappájába). */
export async function igazoloLetolt(lap: SheetDetail): Promise<void> {
  const blob = await igazoloWord(lap)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = wordFajlnev(lap)
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Kis késéssel engedjük el: egyes böngészők a kattintás után olvassák.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
