import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import type { ProductSource } from '../data/ProductSource'
import type { Category, Product, ProductQuery } from '../types'

/** Products per request; more load as the shopper scrolls. */
export const CATALOG_PAGE_SIZE = 24

/** Debounced, paged product listing filtered by the categories a surface accepts. */
export function useCatalog(source: ProductSource, allowedCategoryIds: Readonly<Ref<string[] | null>>) {
  const categories = shallowRef<Category[]>([])
  const products = shallowRef<Product[]>([])
  const total = ref(0)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const search = ref('')
  const sort = ref<NonNullable<ProductQuery['sort']>>('featured')
  const activeCategoryId = ref<string | null>(null)
  const page = ref(1)
  const loadingMore = ref(false)
  const hasMore = computed(() => products.value.length < total.value)

  source.listCategories().then((c) => (categories.value = c))

  let requestId = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function currentCategoryIds() {
    const allowed = allowedCategoryIds.value
    return activeCategoryId.value ? [activeCategoryId.value] : (allowed ?? undefined)
  }

  /** The next page, appended. Ignored while a load runs or when everything is shown. */
  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value) return
    const id = requestId
    const next = page.value + 1
    loadingMore.value = true
    try {
      const result = await source.listProducts({ categoryIds: currentCategoryIds(), search: search.value, sort: sort.value, page: next, pageSize: CATALOG_PAGE_SIZE })
      // The filters changed meanwhile: that load replaces the list.
      if (id !== requestId) return
      const seen = new Set(products.value.map((p) => p.id))
      products.value = [...products.value, ...result.items.filter((p) => !seen.has(p.id))]
      total.value = result.total
      page.value = next
    } catch (e) {
      if (id === requestId) error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (id === requestId) loadingMore.value = false
    }
  }

  async function load() {
    const id = ++requestId
    loading.value = true
    error.value = null
    page.value = 1
    loadingMore.value = false
    const categoryIds = currentCategoryIds()
    // A surface that offers nothing has nothing to list (an empty filter would mean "everything").
    if (categoryIds && !categoryIds.length) {
      products.value = []
      total.value = 0
      loading.value = false
      return
    }
    try {
      const result = await source.listProducts({ categoryIds, search: search.value, sort: sort.value, page: 1, pageSize: CATALOG_PAGE_SIZE })
      if (id !== requestId) return
      products.value = result.items
      total.value = result.total
    } catch (e) {
      if (id === requestId) error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  watch(allowedCategoryIds, (allowed, prev) => {
    if (JSON.stringify(allowed) === JSON.stringify(prev)) return
    if (activeCategoryId.value && allowed && !allowed.includes(activeCategoryId.value)) activeCategoryId.value = null
    load()
  })
  watch([activeCategoryId, sort], load)
  watch(search, () => {
    clearTimeout(timer)
    timer = setTimeout(load, 180)
  })
  load()

  return { categories, products, total, loading, loadingMore, hasMore, error, search, sort, activeCategoryId, reload: load, loadMore }
}
