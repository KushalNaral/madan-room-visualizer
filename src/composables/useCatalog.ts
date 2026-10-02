import { ref, shallowRef, watch, type Ref } from 'vue'
import type { ProductSource } from '../data/ProductSource'
import type { Category, Product, ProductQuery } from '../types'

/** Debounced product listing filtered by the categories a surface accepts. */
export function useCatalog(source: ProductSource, allowedCategoryIds: Readonly<Ref<string[] | null>>) {
  const categories = shallowRef<Category[]>([])
  const products = shallowRef<Product[]>([])
  const total = ref(0)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const search = ref('')
  const sort = ref<NonNullable<ProductQuery['sort']>>('featured')
  const activeCategoryId = ref<string | null>(null)

  source.listCategories().then((c) => (categories.value = c))

  let requestId = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  async function load() {
    const id = ++requestId
    loading.value = true
    error.value = null
    const allowed = allowedCategoryIds.value
    const categoryIds = activeCategoryId.value ? [activeCategoryId.value] : (allowed ?? undefined)
    // A surface that offers nothing has nothing to list (an empty filter would mean "everything").
    if (categoryIds && !categoryIds.length) {
      products.value = []
      total.value = 0
      loading.value = false
      return
    }
    try {
      const page = await source.listProducts({ categoryIds, search: search.value, sort: sort.value, pageSize: 100 })
      if (id !== requestId) return
      products.value = page.items
      total.value = page.total
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

  return { categories, products, total, loading, error, search, sort, activeCategoryId, reload: load }
}
