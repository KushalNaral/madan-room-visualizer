import { describe, expect, it } from 'vitest'
import { MockProductSource } from '../src/data/MockProductSource'
import { sortProducts } from '../src/data/ProductSource'
import { pointInPolygon } from '../src/render/geometry'
import { parseSelections, serializeSelections } from '../src/lib/selectionUrl'

const source = new MockProductSource({ assetBase: '/' })

describe('MockProductSource', () => {
  it('filters by category', async () => {
    const page = await source.listProducts({ categoryIds: ['flooring'] })
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.every((p) => p.categoryId === 'flooring')).toBe(true)
  })

  it('searches product and variant names and SKUs', async () => {
    expect((await source.listProducts({ search: 'herringbone' })).items.map((p) => p.id)).toContain('herringbone')
    expect((await source.listProducts({ search: 'emerald' })).items.map((p) => p.id)).toContain('velvet')
    expect((await source.listProducts({ search: 'MF-FL-OP-02' })).items.map((p) => p.id)).toEqual(['oak-plank'])
  })

  it('sorts by price', async () => {
    const asc = (await source.listProducts({ sort: 'price-asc', pageSize: 100 })).items
    const prices = asc.map((p) => p.variants[0].price ?? 0)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
    expect(sortProducts(asc, 'name')[0].name <= sortProducts(asc, 'name')[1].name).toBe(true)
  })

  it('paginates', async () => {
    const page = await source.listProducts({ pageSize: 4, page: 2 })
    expect(page.items).toHaveLength(4)
    expect(page.page).toBe(2)
    expect(page.total).toBeGreaterThan(8)
  })

  it('has unique variant ids and a pricing rule for every product', async () => {
    const all = (await source.listProducts({ pageSize: 1000 })).items
    const ids = all.flatMap((p) => p.variants.map((v) => v.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(all.every((p) => p.pricing)).toBe(true)
  })

  it('resolves room asset URLs against the base', async () => {
    const [room] = await source.listRooms()
    expect(room.imageUrl.startsWith('/mock-rooms/')).toBe(true)
    expect(room.idMapUrl?.startsWith('/mock-rooms/')).toBe(true)
  })
})

describe('generated rooms', async () => {
  const rooms = await source.listRooms()
  const categoryIds = new Set((await source.listCategories()).map((c) => c.id))
  const products = (await source.listProducts({ pageSize: 1000 })).items

  for (const room of rooms) {
    it(`${room.id}: surfaces are well formed`, () => {
      const colors = room.surfaces.map((s) => s.idColor)
      expect(new Set(colors).size).toBe(colors.length)
      for (const s of room.surfaces) {
        expect(s.accepts.every((c) => categoryIds.has(c))).toBe(true)
        expect(s.patches.length).toBeGreaterThan(0)
        for (const p of s.patches) {
          if (p.kind === 'mesh') expect(p.points.length).toBe((p.cols + 1) * (p.rows + 1) * 3)
          else expect(p.quad).toHaveLength(4)
          expect(p.widthCm).toBeGreaterThan(0)
        }
        expect(s.anchor!.x).toBeGreaterThanOrEqual(0)
        expect(s.anchor!.x).toBeLessThanOrEqual(room.width)
      }
    })

    it(`${room.id}: presets reference real products that the surfaces accept`, () => {
      for (const preset of room.presets ?? []) {
        for (const [surfaceId, sel] of Object.entries(preset.selections)) {
          const surface = room.surfaces.find((s) => s.id === surfaceId)
          const product = products.find((p) => p.id === sel.productId)
          expect(surface, `${preset.id}: surface ${surfaceId}`).toBeDefined()
          expect(product?.variants.some((v) => v.id === sel.variantId), `${preset.id}: ${sel.variantId}`).toBe(true)
          expect(surface!.accepts).toContain(product!.categoryId)
        }
      }
    })
  }
})

describe('selection URL state', () => {
  it('round-trips, including ids that need escaping', () => {
    const sel = {
      'back-wall': { productId: 'trellis', variantId: 'trellis-v2' },
      'odd:id,x': { productId: 'p 1', variantId: 'v/1' },
    }
    expect(parseSelections(serializeSelections(sel))).toEqual(sel)
  })

  it('round-trips pattern adjustments compactly', () => {
    const sel = {
      floor: { productId: 'oak-plank', variantId: 'oak-plank-v2', scale: 1.5, rotation: 90 },
      wall: { productId: 'trellis', variantId: 'trellis-v1', offsetY: 12 },
    }
    const s = serializeSelections(sel)
    expect(s).toBe('floor:oak-plank:oak-plank-v2:1.5:90,wall:trellis:trellis-v1:1:0:0:12')
    expect(parseSelections(s)).toEqual(sel)
  })

  it('ignores malformed entries', () => {
    expect(parseSelections('a:b,c::d,,e:f:g,h:i:j:x')).toEqual({ e: { productId: 'f', variantId: 'g' } })
    expect(parseSelections(null)).toEqual({})
  })
})

describe('pointInPolygon', () => {
  const notched = [
    { x: 400, y: 200 }, { x: 1200, y: 200 }, { x: 1200, y: 650 }, { x: 1120, y: 650 },
    { x: 1120, y: 520 }, { x: 1060, y: 520 }, { x: 1060, y: 470 }, { x: 540, y: 470 },
    { x: 540, y: 520 }, { x: 480, y: 520 }, { x: 480, y: 650 }, { x: 400, y: 650 },
  ]

  it('handles concave polygons', () => {
    expect(pointInPolygon({ x: 800, y: 300 }, notched)).toBe(true)
    expect(pointInPolygon({ x: 800, y: 600 }, notched)).toBe(false)
    expect(pointInPolygon({ x: 440, y: 600 }, notched)).toBe(true)
    expect(pointInPolygon({ x: 100, y: 100 }, notched)).toBe(false)
  })
})
