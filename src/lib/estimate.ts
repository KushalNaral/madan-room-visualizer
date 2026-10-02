import type { Product, Surface, Variant } from '../types'

export interface Estimate {
  areaM2: number | null
  units: number
  unit: string
  total: number | null
  /** Human readable, e.g. "4 litres · 18.4 m²". */
  label: string
  /** How a server quote worked the total out, step by step. */
  breakdown?: string[]
  /** Opaque host data from a server quote (e.g. a cart line). */
  cart?: unknown
  /** A server quote for this line is still loading; the numbers are local. */
  pending?: boolean
}

const PLURAL: Record<string, string> = { litre: 'litres', roll: 'rolls', metre: 'metres', piece: 'pieces', box: 'boxes', 'm²': 'm²', sqft: 'sq ft' }
const SQFT_PER_M2 = 10.7639

/** Real-world size of a surface: `sizeCm`, else its largest patch. */
export function surfaceSize(surface: Surface): { w: number; h: number } {
  if (surface.sizeCm) return surface.sizeCm
  let best = { w: 0, h: 0 }
  for (const p of surface.patches) if (p.widthCm * p.heightCm > best.w * best.h) best = { w: p.widthCm, h: p.heightCm }
  return best
}

/** Quantity and cost to cover a surface with a product, using its pricing rules. */
export function estimate(surface: Surface, product: Product, variant: Variant): Estimate {
  const pricing = product.pricing ?? { unit: 'piece' as const }
  const area = surface.areaM2 ?? null
  let units = 1
  if (pricing.coverageM2 && area) {
    const raw = (area * (1 + (pricing.wastage ?? 0))) / pricing.coverageM2
    units = pricing.unit === 'm²' ? Math.ceil(raw * 10) / 10 : Math.max(1, Math.ceil(raw))
  } else if (pricing.unit === 'sqft' && area) {
    units = Math.ceil(area * SQFT_PER_M2 * (1 + (pricing.wastage ?? 0)))
  } else if (pricing.unit === 'metre') {
    const w = surfaceSize(surface).w / 100
    if (w) units = Math.ceil(w * (1 + (pricing.wastage ?? 0)) * 10) / 10
  }
  const unitLabel = units === 1 ? pricing.unit : PLURAL[pricing.unit] ?? pricing.unit
  const total = variant.price != null ? Math.round(units * variant.price) : null
  const qty = pricing.unit === 'm²' ? `${units} m²` : `${units} ${unitLabel}`
  const label = area && !['m²', 'sqft', 'piece'].includes(pricing.unit) ? `${qty} · ${area} m²` : qty
  return { areaM2: area, units, unit: pricing.unit, total, label }
}

export function unitSuffix(product: Product): string {
  const u = product.pricing?.unit
  if (!u || u === 'piece') return ''
  return ` / ${u === 'sqft' ? 'sq ft' : u}`
}
