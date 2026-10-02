import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpProductSource } from '../src/data/HttpProductSource'

afterEach(() => vi.unstubAllGlobals())

describe('HttpProductSource', () => {
  it('resolves room and variant asset paths by use', async () => {
    const room = { id: 'r', name: 'R', imageUrl: 'rooms/r.jpg', idMapUrl: 'rooms/r-ids.png', thumbnailUrl: 'rooms/r-t.jpg', width: 10, height: 10, surfaces: [] }
    const product = { id: '1', sku: 's', name: 'P', categoryId: '3', variants: [{ id: '2', sku: 'v', name: 'V', colorHex: '#000', textureUrl: 'tex/a.jpg', thumbnailUrl: 'img/a.jpg', tileSizeCm: { w: 1, h: 1 }, finish: 'matte' }] }
    vi.stubGlobal('fetch', vi.fn(async (u: URL) => new Response(JSON.stringify(u.pathname.endsWith('rooms/r') ? room : product))))
    const src = new HttpProductSource({ baseUrl: 'http://api.test/front/visualizer', assetUrl: (p, use) => `cdn/${use}/${p}` })

    const r = (await src.getRoom('r'))!
    expect(r.imageUrl).toBe('cdn/room/rooms/r.jpg')
    expect(r.idMapUrl).toBe('cdn/room/rooms/r-ids.png')
    expect(r.thumbnailUrl).toBe('cdn/thumb/rooms/r-t.jpg')
    expect(r.shadingUrl).toBeUndefined()

    const p = (await src.getProduct('1'))!
    expect(p.variants[0].textureUrl).toBe('cdn/texture/tex/a.jpg')
    expect(p.variants[0].thumbnailUrl).toBe('cdn/thumb/img/a.jpg')
  })

  it('posts quote lines as JSON', async () => {
    const fetch = vi.fn(async () => new Response('[]'))
    vi.stubGlobal('fetch', fetch)
    const src = new HttpProductSource({ baseUrl: 'http://api.test/front/visualizer/' })
    await src.quote([{ surfaceId: 's', productId: '1', variantId: '2', widthCm: 100, heightCm: 200 }])
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toBe('http://api.test/front/visualizer/quote')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string).lines[0].widthCm).toBe(100)
  })
})
