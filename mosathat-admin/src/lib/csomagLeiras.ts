import type { Catalog } from '../data/source'
import type { Nyelv } from './nyelv'

function automatikusLeiras(k: Catalog | null | undefined, csomagId: string, nyelv: Nyelv = 'hu'): string {
  const plusz = k?.packageExtras.filter((x) => x.package_id === csomagId) ?? []
  if (!plusz.length) return ''
  if (nyelv === 'en') {
    return `Everything in ${plusz[0].parent_name_en?.trim() || plusz[0].parent_name}, plus: ${plusz.map((x) => x.name_en?.trim() || x.name).join(', ')}`
  }
  return `${plusz[0].parent_name} mindene, plusz: ${plusz.map((x) => x.name).join(', ')}`
}

export function csomagLeiras(
  k: Catalog | null | undefined,
  p: { id: string; description: string | null; description_en?: string | null },
  nyelv: Nyelv = 'hu',
): string {
  if (nyelv === 'en') return p.description_en?.trim() || automatikusLeiras(k, p.id, 'en') || p.description?.trim() || ''
  return p.description?.trim() || automatikusLeiras(k, p.id)
}
