import type { Product, Surface, Variant } from '../types'

export interface Estimate {
  areaM2: number | null
  units: number
  unit: string
  total: number | null
  /** Human readable, e.g. "4 litres · 18.4 m²". */
  label: string
}

const PLURAL: Record<string, string> = { litre: 'litres', roll: 'rolls', metre: 'metres', piece: 'pieces', box: 'boxes', 'm²': 'm²' }

/** Quantity and cost to cover a surface with a product, using its pricing rules. */
export function estimate(surface: Surface, product: Product, variant: Variant): Estimate {
  const pricing = product.pricing ?? { unit: 'piece' as const }
  const area = surface.areaM2 ?? null
  let units = 1
  if (pricing.coverageM2 && area) {
    const raw = (area * (1 + (pricing.wastage ?? 0))) / pricing.coverageM2
    units = pricing.unit === 'm²' ? Math.ceil(raw * 10) / 10 : Math.max(1, Math.ceil(raw))
  }
  const unitLabel = units === 1 ? pricing.unit : PLURAL[pricing.unit] ?? pricing.unit
  const total = variant.price != null ? Math.round(units * variant.price) : null
  const qty = pricing.unit === 'm²' ? `${units} m²` : `${units} ${unitLabel}`
  const label = area && pricing.unit !== 'm²' && pricing.unit !== 'piece' ? `${qty} · ${area} m²` : qty
  return { areaM2: area, units, unit: pricing.unit, total, label }
}

export function unitSuffix(product: Product): string {
  const u = product.pricing?.unit
  return !u || u === 'piece' ? '' : ` / ${u}`
}
