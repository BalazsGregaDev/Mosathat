import type { Catalog } from '../data/source'

export function automatikusLeiras(k: Catalog | null | undefined, csomagId: string): string {
  const plusz = k?.packageExtras.filter((x) => x.package_id === csomagId) ?? []
  return plusz.length ? `${plusz[0].parent_name} mindene, plusz: ${plusz.map((x) => x.name).join(', ')}` : ''
}

export function csomagLeiras(k: Catalog | null | undefined, p: { id: string; description: string | null }): string {
  return p.description?.trim() || automatikusLeiras(k, p.id)
}
