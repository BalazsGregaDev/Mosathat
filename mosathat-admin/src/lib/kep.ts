export async function kepKicsinyit(f: Blob, max: number, minoseg: number): Promise<Blob> {
  const kep = await createImageBitmap(f)
  const arany = Math.min(1, max / Math.max(kep.width, kep.height))
  const w = Math.max(1, Math.round(kep.width * arany))
  const h = Math.max(1, Math.round(kep.height * arany))
  const vaszon = document.createElement('canvas')
  vaszon.width = w
  vaszon.height = h
  const ctx = vaszon.getContext('2d')
  if (!ctx) throw new Error('A kép feldolgozása nem sikerült.')
  ctx.drawImage(kep, 0, 0, w, h)
  kep.close()
  const ki = await new Promise<Blob | null>((r) => vaszon.toBlob(r, 'image/webp', minoseg))
  if (!ki) throw new Error('A kép feldolgozása nem sikerült.')
  return ki
}

export function adatUrl(b: Blob): Promise<string> {
  return new Promise((r, h) => {
    const o = new FileReader()
    o.onload = () => r(String(o.result))
    o.onerror = () => h(new Error('A kép beolvasása nem sikerült.'))
    o.readAsDataURL(b)
  })
}

export const KEP_TIPUSOK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
export const KEP_MAX_MERET = 15 * 1024 * 1024
