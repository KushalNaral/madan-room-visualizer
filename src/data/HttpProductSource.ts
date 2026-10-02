import type { Category, Page, Product, ProductQuery, Quote, QuoteLine, Room } from '../types'
import type { ProductSource } from './ProductSource'

export interface HttpProductSourceOptions {
  baseUrl: string
  /** e.g. add auth headers. */
  init?: RequestInit
  /**
   * Maps Madan's API payloads to the visualizer's types. Defaults assume the API
   * already returns the shapes in `types.ts`.
   */
  mapProduct?: (raw: unknown) => Product
  mapRoom?: (raw: unknown) => Room
  mapCategory?: (raw: unknown) => Category
}

/**
 * Talks to Madan's dedicated visualizer API. Expected endpoints (adjust once the
 * API is designed):
 *   GET /categories
 *   GET /products?category=a,b&search=&sort=&page=&pageSize=   → { items, total, page, pageSize }
 *   GET /products/:id
 *   GET /rooms
 *   GET /rooms/:id
 *   POST /quote  { lines: QuoteLine[] }                         → Quote[]
 */
export class HttpProductSource implements ProductSource {
  private readonly mapProduct: (raw: unknown) => Product
  private readonly mapRoom: (raw: unknown) => Room
  private readonly mapCategory: (raw: unknown) => Category

  private readonly opts: HttpProductSourceOptions

  constructor(opts: HttpProductSourceOptions) {
    this.opts = opts
    this.mapProduct = opts.mapProduct ?? ((r) => r as Product)
    this.mapRoom = opts.mapRoom ?? ((r) => r as Room)
    this.mapCategory = opts.mapCategory ?? ((r) => r as Category)
  }

  private url(path: string) {
    return new URL(path.replace(/^\//, ''), this.opts.baseUrl.replace(/\/?$/, '/'))
  }

  private async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = this.url(path)
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    }
    const res = await fetch(url, this.opts.init)
    if (!res.ok) throw new Error(`GET ${url.pathname} failed: ${res.status}`)
    return res.json() as Promise<T>
  }

  private async getOptional<T>(path: string): Promise<T | undefined> {
    try {
      return await this.get<T>(path)
    } catch {
      return undefined
    }
  }

  async listCategories() {
    return (await this.get<unknown[]>('categories')).map(this.mapCategory)
  }

  async listProducts(query: ProductQuery = {}): Promise<Page<Product>> {
    const page = await this.get<Page<unknown>>('products', {
      category: query.categoryIds?.join(','),
      search: query.search,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    })
    return { ...page, items: page.items.map(this.mapProduct) }
  }

  async getProduct(id: string) {
    const raw = await this.getOptional<unknown>(`products/${encodeURIComponent(id)}`)
    return raw === undefined ? undefined : this.mapProduct(raw)
  }

  async listRooms() {
    return (await this.get<unknown[]>('rooms')).map(this.mapRoom)
  }

  async getRoom(id: string) {
    const raw = await this.getOptional<unknown>(`rooms/${encodeURIComponent(id)}`)
    return raw === undefined ? undefined : this.mapRoom(raw)
  }

  async quote(lines: QuoteLine[]): Promise<Quote[]> {
    const url = this.url('quote')
    const headers = new Headers(this.opts.init?.headers)
    headers.set('Content-Type', 'application/json')
    headers.set('Accept', 'application/json')
    const res = await fetch(url, { ...this.opts.init, method: 'POST', headers, body: JSON.stringify({ lines }) })
    if (!res.ok) throw new Error(`POST ${url.pathname} failed: ${res.status}`)
    return res.json() as Promise<Quote[]>
  }
}
