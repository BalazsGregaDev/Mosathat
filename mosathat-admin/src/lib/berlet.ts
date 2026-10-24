import { datumPont } from './igazolo'
import { igazoloLetolt } from './igazoloWord'
import { CATEGORY_SHORT, type BerletLap, type SheetDetail, type VehicleCategory } from './types'

export function tetelNev(t: { package_name: string; category: VehicleCategory | null }): string {
  return t.category ? `${t.package_name} · ${CATEGORY_SHORT[t.category]}` : t.package_name
}

export function ervenyesseg(p: { valid_from: string; valid_until: string }): string {
  return `${datumPont(p.valid_from.slice(0, 10))} – ${datumPont(p.valid_until.slice(0, 10))}`
}

export function berletAllapot(p: { active: boolean; lejart: boolean }): string | null {
  if (!p.active) return 'kivezetve'
  if (p.lejart) return 'lejárt'
  return null
}

function fajlBarat(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export async function berletWord(lap: BerletLap): Promise<void> {
  const osszes = lap.items.reduce((a, t) => a + t.qty_total, 0)
  const tabla: SheetDetail = {
    company: { id: lap.pass.id, name: lap.pass.customer_name, tax_number: null },
    month: lap.pass.valid_from,
    period_start: lap.pass.valid_from,
    period_end: lap.pass.valid_until,
    sheet: null,
    columns: [
      { key: 'E_SORSZAM', label: 'Alkalom', visible: true },
      { key: 'DATUM', label: 'Dátum', visible: true },
      { key: 'RENDSZAM', label: 'Rendszám', visible: true },
      { key: 'E_CSOMAG', label: 'Csomag', visible: true },
      { key: 'NEV', label: 'Név', visible: true },
      { key: 'ALAIRAS', label: 'Aláírás', visible: true },
    ],
    footer_text: null,
    prices: [],
    months: [],
    rows: lap.rows.map((r) => ({
      id: r.id,
      booking_id: r.booking_id,
      day: r.day.slice(0, 10),
      plate: r.plate,
      km: null,
      net_huf: null,
      name: r.name,
      extra: { E_SORSZAM: `${r.sorszam}.`, E_CSOMAG: r.package_name },
      signature: r.signature,
      signed_at: r.signed_at,
    })),
  }
  await igazoloLetolt(tabla, {
    cim: `${lap.pass.customer_name} – bérlet igazolólap`,
    alcim: [
      lap.pass.name,
      `érvényes: ${ervenyesseg(lap.pass)}`,
      lap.items.map((t) => `${t.qty_total} × ${t.package_name}${t.category ? ` (${CATEGORY_SHORT[t.category]})` : ''}`).join(', '),
    ].join(' · '),
    fajlnev: `Berlet_${fajlBarat(lap.pass.customer_name) || 'ugyfel'}_${lap.pass.valid_from.slice(0, 10)}.docx`,
    suly: { E_SORSZAM: 0.8, E_CSOMAG: 1.2 },
    uresSorok: Math.max(osszes - lap.rows.length, 0),
  })
}
