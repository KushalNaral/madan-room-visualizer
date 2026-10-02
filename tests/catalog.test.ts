import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { CATALOG_PAGE_SIZE, useCatalog } from '../src/composables/useCatalog'
import { MockProductSource } from '../src/data/MockProductSource'

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
  }
}

describe('useCatalog paging', () => {
  it('loads the first page, then appends more until everything is shown', async () => {
    const source = new MockProductSource({ assetBase: '/', latency: 0 })
    const all = (await source.listProducts({ pageSize: 1000 })).total
    const c = useCatalog(source, ref(null))
    await settle()
    expect(c.products.value).toHaveLength(Math.min(CATALOG_PAGE_SIZE, all))
    expect(c.total.value).toBe(all)
    expect(c.hasMore.value).toBe(all > CATALOG_PAGE_SIZE)

    while (c.hasMore.value) {
      await c.loadMore()
    }
    expect(c.products.value).toHaveLength(all)
    expect(new Set(c.products.value.map((p) => p.id)).size).toBe(all)
  })

  it('starts over at page one when the filter changes', async () => {
    const source = new MockProductSource({ assetBase: '/', latency: 0 })
    const allowed = ref<string[] | null>(null)
    const c = useCatalog(source, allowed)
    await settle()
    await c.loadMore()
    allowed.value = ['paint']
    await settle()
    expect(c.products.value.every((p) => p.categoryId === 'paint')).toBe(true)
    expect(c.products.value.length).toBeLessThanOrEqual(CATALOG_PAGE_SIZE)
  })
})
