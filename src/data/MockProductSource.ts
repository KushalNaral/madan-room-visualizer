import type { Category, Page, Product, ProductQuery, Room } from '../types'
import { matchesQuery, paginate, sortProducts, type ProductSource } from './ProductSource'
import categories from './mock/categories.json'
import products from './mock/products.json'
import living from './mock/rooms/living.json'
import bedroom from './mock/rooms/bedroom.json'
import dining from './mock/rooms/dining.json'
import lounge from './mock/rooms/lounge.json'
import family from './mock/rooms/family.json'
import drawing from './mock/rooms/drawing.json'

export interface MockProductSourceOptions {
  categories?: Category[]
  products?: Product[]
  rooms?: Room[]
  /** Base URL the generated room images are served from (defaults to the app's base). */
  assetBase?: string
  /** Simulated network latency in ms, to exercise loading states. */
  latency?: number
}

function withBase(room: Room, base: string): Room {
  const abs = (u?: string) => (u && !/^(https?:|data:|blob:|\/)/.test(u) ? base.replace(/\/?$/, '/') + u : u)
  return {
    ...room,
    imageUrl: abs(room.imageUrl)!,
    shadingUrl: abs(room.shadingUrl),
    idMapUrl: abs(room.idMapUrl),
    thumbnailUrl: abs(room.thumbnailUrl),
  }
}

/** In-memory catalog for development until Madan's API exists. */
export class MockProductSource implements ProductSource {
  private categories: Category[]
  private products: Product[]
  private rooms: Room[]
  private latency: number

  constructor(opts: MockProductSourceOptions = {}) {
    const base = opts.assetBase ?? (import.meta.env?.BASE_URL || '/')
    this.categories = opts.categories ?? categories
    this.products = opts.products ?? (products as Product[])
    this.rooms = (opts.rooms ?? ([living, lounge, family, drawing, bedroom, dining] as Room[])).map((r) => withBase(r, base))
    this.latency = opts.latency ?? 0
  }

  private async delay<T>(value: T): Promise<T> {
    if (this.latency) await new Promise((r) => setTimeout(r, this.latency))
    return value
  }

  listCategories() {
    return this.delay(this.categories)
  }

  listProducts(query: ProductQuery = {}): Promise<Page<Product>> {
    const filtered = sortProducts(this.products.filter((p) => matchesQuery(p, query)), query.sort)
    return this.delay(paginate(filtered, query.page, query.pageSize))
  }

  getProduct(id: string) {
    return this.delay(this.products.find((p) => p.id === id))
  }

  listRooms() {
    return this.delay(this.rooms)
  }

  getRoom(id: string) {
    return this.delay(this.rooms.find((r) => r.id === id))
  }

  /** Lets the room editor preview a freshly authored room. */
  upsertRoom(room: Room) {
    this.rooms = [...this.rooms.filter((r) => r.id !== room.id), room]
  }
}
