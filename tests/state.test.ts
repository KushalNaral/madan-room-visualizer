import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useVisualizerState } from '../src/composables/useVisualizerState'
import { MockProductSource } from '../src/data/MockProductSource'
import { estimate } from '../src/lib/estimate'
import type { Product, Surface } from '../src/types'

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
