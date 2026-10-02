import type { Selection } from '../types'

/**
 * Serialises applied materials into one query-string value so a styled room can be
 * shared: `look=sofa:velvet:velvet-v1,floor:oak-plank:oak-plank-v2:1.5:90`.
 * Optional trailing fields: scale, rotation, offsetX, offsetY.
 */
export function serializeSelections(selections: Record<string, Selection>): string {
  return Object.entries(selections)
    .map(([surfaceId, s]) => {
      const parts = [surfaceId, s.productId, s.variantId].map(encodeURIComponent)
      const extra = [s.scale ?? 1, s.rotation ?? 0, s.offsetX ?? 0, s.offsetY ?? 0]
      const isDefault = extra[0] === 1 && extra.slice(1).every((v) => v === 0)
      if (!isDefault) {
        const trimmed = [...extra]
        while (trimmed.length > 1 && trimmed[trimmed.length - 1] === 0) trimmed.pop()
        parts.push(...trimmed.map((v) => String(Math.round(v * 100) / 100)))
      }
      return parts.join(':')
    })
    .join(',')
}

export function parseSelections(value: string | null | undefined): Record<string, Selection> {
  const out: Record<string, Selection> = {}
  if (!value) return out
  for (const entry of value.split(',')) {
    const parts = entry.split(':')
    if (parts.length < 3 || parts.slice(0, 3).some((p) => !p)) continue
    const [surfaceId, productId, variantId] = parts.slice(0, 3).map(decodeURIComponent)
    const nums = parts.slice(3, 7).map(Number)
    if (nums.some((n) => !Number.isFinite(n))) continue
    const sel: Selection = { productId, variantId }
    if (nums.length) {
      const [scale = 1, rotation = 0, offsetX = 0, offsetY = 0] = nums
      if (scale !== 1) sel.scale = scale
      if (rotation) sel.rotation = rotation
      if (offsetX) sel.offsetX = offsetX
      if (offsetY) sel.offsetY = offsetY
    }
    out[surfaceId] = sel
  }
  return out
}
