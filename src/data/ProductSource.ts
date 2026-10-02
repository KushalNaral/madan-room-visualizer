import type { Category, Page, Product, ProductQuery, Room } from '../types'

/**
 * Everything the visualizer needs from a catalog. Madan's dedicated API will
 * implement this via `HttpProductSource`; the playground uses `MockProductSource`.
 */
export interface ProductSource {
  listCategories(): Promise<Category[]>
  listProducts(query?: ProductQuery): Promise<Page<Product>>
  getProduct(id: string): Promise<Product | undefined>
  listRooms(): Promise<Room[]>
  getRoom(id: string): Promise<Room | undefined>
}

export function paginate<T>(all: T[], page = 1, pageSize = 24): Page<T> {
  const start = (page - 1) * pageSize
  return { items: all.slice(start, start + pageSize), total: all.length, page, pageSize }
}

export function matchesQuery(product: Product, query: ProductQuery = {}): boolean {
  if (query.categoryIds?.length && !query.categoryIds.includes(product.categoryId)) return false
  const q = query.search?.trim().toLowerCase()
  if (!q) return true
  return [product.name, product.sku, product.description ?? '', ...product.variants.flatMap((v) => [v.name, v.sku])]
    .some((s) => s.toLowerCase().includes(q))
}

export function sortProducts(products: Product[], sort: ProductQuery['sort'] = 'featured'): Product[] {
  const price = (p: Product) => p.variants[0]?.price ?? 0
  const out = [...products]
  if (sort === 'price-asc') out.sort((a, b) => price(a) - price(b))
  else if (sort === 'price-desc') out.sort((a, b) => price(b) - price(a))
  else if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}
