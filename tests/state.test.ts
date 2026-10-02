import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useVisualizerState } from '../src/composables/useVisualizerState'
import { MockProductSource } from '../src/data/MockProductSource'
import { estimate, surfaceSize } from '../src/lib/estimate'
import type { Product, Quad, Quote, QuoteLine, Surface } from '../src/types'

const source = new MockProductSource({ assetBase: '/' })

async function setup() {
  const state = useVisualizerState(source, { storageKey: false, initialRoomId: 'living' })
  await state.init()
  const product = (await source.getProduct('velvet'))!
  return { state, product }
}

describe('useVisualizerState', () => {
  it('loads the initial room', async () => {
    const { state } = await setup()
    expect(state.room.value?.id).toBe('living')
    expect(state.applied.value).toHaveLength(0)
  })

  it('applies variants and supports undo/redo', async () => {
    const { state, product } = await setup()
    state.selectedSurfaceId.value = 'sofa'
    state.applyVariant('sofa', product, product.variants[0])
    state.applyVariant('sofa', product, product.variants[1])
    expect(state.selections.sofa.variantId).toBe(product.variants[1].id)
    state.undo()
    expect(state.selections.sofa.variantId).toBe(product.variants[0].id)
    state.undo()
    expect(state.selections.sofa).toBeUndefined()
    expect(state.canUndo.value).toBe(false)
    state.redo()
    state.redo()
    expect(state.selections.sofa.variantId).toBe(product.variants[1].id)
  })

  it('keeps pattern adjustments when switching colourways and merges rapid adjustments into one undo step', async () => {
    const { state, product } = await setup()
    state.applyVariant('sofa', product, product.variants[0])
    state.adjust('sofa', { scale: 1.2 })
    state.adjust('sofa', { scale: 1.4 })
    state.adjust('sofa', { scale: 1.6 })
    state.applyVariant('sofa', product, product.variants[2])
    expect(state.selections.sofa.scale).toBe(1.6)
    state.undo() // colourway
    state.undo() // the whole slider drag
    expect(state.selections.sofa.scale).toBeUndefined()
  })

  it('applies to a group and computes totals', async () => {
    const { state } = await setup()
    const paint = (await source.getProduct('silk-emulsion'))!
    state.selectedSurfaceId.value = 'feature-wall'
    expect(state.groupMates.value.map((s) => s.id).sort()).toEqual(['side-wall', 'window-wall'])
    state.applyVariant('feature-wall', paint, paint.variants[1], state.groupMates.value.map((s) => s.id))
    expect(state.applied.value).toHaveLength(3)
    expect(state.totalPrice.value).toBe(state.applied.value.reduce((s, a) => s + (a.estimate.total ?? 0), 0))
  })

  it('applies presets and ignores invalid references', async () => {
    const { state } = await setup()
    const preset = state.room.value!.presets![0]
    await state.applyPreset(preset)
    expect(Object.keys(state.selections).sort()).toEqual(Object.keys(preset.selections).sort())
    await state.applySelections({ sofa: { productId: 'nope', variantId: 'nope' } })
    expect(state.applied.value).toHaveLength(0)
  })

  it('switching rooms clears selections and history', async () => {
    const { state, product } = await setup()
    state.applyVariant('sofa', product, product.variants[0])
    await state.loadRoom('bedroom')
    await nextTick()
    expect(state.room.value?.id).toBe('bedroom')
    expect(state.applied.value).toHaveLength(0)
    expect(state.canUndo.value).toBe(false)
  })
})

describe('estimate', () => {
  const wall = { id: 'w', label: 'Wall', accepts: ['paint'], patches: [], areaM2: 16.2 } as Surface
  const paint = { id: 'p', sku: 'P', name: 'Paint', categoryId: 'paint', pricing: { unit: 'litre', coverageM2: 5, wastage: 0.05 }, variants: [] } as unknown as Product
  const rug = { id: 'r', sku: 'R', name: 'Rug', categoryId: 'rug', pricing: { unit: 'piece' }, variants: [] } as unknown as Product

  it('rounds up whole units with wastage', () => {
    const e = estimate(wall, paint, { id: 'v', price: 500 } as never)
    expect(e.units).toBe(4) // 16.2 × 1.05 / 5 = 3.4 → 4
    expect(e.total).toBe(2000)
    expect(e.label).toBe('4 litres · 16.2 m²')
  })

  it('treats per-piece items as one unit', () => {
    const e = estimate(wall, rug, { id: 'v', price: 12000 } as never)
    expect(e).toMatchObject({ units: 1, total: 12000, label: '1 piece' })
  })
})

describe('server quotes', () => {
  const tick = () => new Promise((r) => setTimeout(r, 5))

  class QuotingSource extends MockProductSource {
    calls: QuoteLine[][] = []
    fail = false
    async quote(lines: QuoteLine[]): Promise<Quote[]> {
      this.calls.push(lines)
      if (this.fail) throw new Error('offline')
      return lines.map((l) => ({ surfaceId: l.surfaceId, units: 7, unit: 'metre', total: 7000, label: `7 metres · ${l.widthCm}cm`, cart: { variant_id: l.variantId } }))
    }
  }

  async function quoted(fail = false) {
    const src = new QuotingSource({ assetBase: '/' })
    src.fail = fail
    const state = useVisualizerState(src, { storageKey: false, initialRoomId: 'living', quoteDelay: 0 })
    await state.init()
    const product = (await src.getProduct('velvet'))!
    return { src, state, product }
  }

  it('replaces the local estimate with the source quote', async () => {
    const { src, state, product } = await quoted()
    state.applyVariant('sofa', product, product.variants[0])
    await nextTick()
    expect(state.applied.value[0].estimate.pending).toBe(true)
    await tick()
    const est = state.applied.value[0].estimate
    expect(est.total).toBe(7000)
    expect(est.cart).toEqual({ variant_id: product.variants[0].id })
    expect(state.totalPrice.value).toBe(7000)
    expect(src.calls).toHaveLength(1)
    expect(src.calls[0][0]).toMatchObject({ surfaceId: 'sofa', productId: product.id, variantId: product.variants[0].id })
  })

  it('re-quotes only when the line changes, and never shows a stale quote', async () => {
    const { src, state, product } = await quoted()
    state.applyVariant('sofa', product, product.variants[0])
    await nextTick()
    await tick()
    state.adjust('sofa', { scale: 1.5 })
    await nextTick()
    await tick()
    expect(src.calls).toHaveLength(1)
    state.applyVariant('sofa', product, product.variants[1])
    await nextTick()
    expect(state.applied.value[0].estimate.cart).toBeUndefined()
    await tick()
    expect(src.calls).toHaveLength(2)
    expect(state.applied.value[0].estimate.cart).toEqual({ variant_id: product.variants[1].id })
  })

  it('keeps the local estimate when quoting fails', async () => {
    const { state, product } = await quoted(true)
    state.applyVariant('sofa', product, product.variants[0])
    await nextTick()
    await tick()
    const surface = state.room.value!.surfaces.find((s) => s.id === 'sofa')!
    expect(state.applied.value[0].estimate).toEqual(estimate(surface, product, product.variants[0]))
    expect(state.quoting.value).toBe(false)
  })
})

describe('surfaceSize', () => {
  const patch = (w: number, h: number) => ({ kind: 'quad' as const, quad: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] as Quad, widthCm: w, heightCm: h })
  it('prefers sizeCm, else the largest patch', () => {
    const base: Surface = { id: 's', label: 'S', accepts: [], patches: [patch(100, 50), patch(300, 200)] }
    expect(surfaceSize(base)).toEqual({ w: 300, h: 200 })
    expect(surfaceSize({ ...base, sizeCm: { w: 150, h: 240 } })).toEqual({ w: 150, h: 240 })
  })
  it('estimates sq ft and metres without coverage', () => {
    const s: Surface = { id: 'f', label: 'Floor', accepts: [], areaM2: 10, patches: [patch(400, 250)] }
    const p = (unit: 'sqft' | 'metre'): Product => ({ id: 'p', sku: 'p', name: 'P', categoryId: 'c', pricing: { unit }, variants: [] })
    const v = { id: 'v', sku: 'v', name: 'V', colorHex: '#000', textureUrl: '', tileSizeCm: { w: 1, h: 1 }, finish: 'matte' as const, price: 10 }
    expect(estimate(s, p('sqft'), v)).toMatchObject({ units: 108, total: 1080 })
    expect(estimate(s, p('metre'), v)).toMatchObject({ units: 4, total: 40 })
  })
})
