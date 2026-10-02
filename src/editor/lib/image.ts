import type { PolygonMask } from '../../types'
import type { RasterImage } from '../ai/protocol'
import { vectorize } from './contours'
import { emptyMask, type Mask } from './mask'

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (!url.startsWith('blob:') && !url.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${url}`))
    img.src = url
  })
}

/** Scale that brings the long side down to `maxSide` (never up). */
export const fitScale = (width: number, height: number, maxSide: number) => Math.min(1, maxSide / Math.max(width, height))

/** RGBA pixels of an image, downscaled so the long side is at most `maxSide`. */
export function rasterOf(img: CanvasImageSource & { naturalWidth?: number; width: number; height: number }, width: number, height: number, maxSide: number): RasterImage {
  const s = fitScale(width, height, maxSide)
  const w = Math.max(1, Math.round(width * s)), h = Math.max(1, Math.round(height * s))
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  ctx.canvas.width = w
  ctx.canvas.height = h
  ctx.drawImage(img, 0, 0, w, h)
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h }
}

function hex(color: string): [number, number, number] {
  const n = parseInt(color.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Masks for each surface colour of a rendered id map, as editable polygons in photo pixels.
 * Anti-aliased edge pixels go to the nearest surface colour.
 */
export async function masksFromIdMap(url: string, colors: string[], roomWidth: number, maxSide = 1280): Promise<Map<string, PolygonMask>> {
  const img = await loadImage(url)
  const raster = rasterOf(img, img.naturalWidth, img.naturalHeight, maxSide)
  const rgb = colors.map(hex)
  const masks: Mask[] = colors.map(() => emptyMask(raster.width, raster.height))
  const { data } = raster
  for (let i = 0; i < raster.width * raster.height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    let best = -1, bestD = 40 * 40 * 3
    for (let k = 0; k < rgb.length; k++) {
      const d = (r - rgb[k][0]) ** 2 + (g - rgb[k][1]) ** 2 + (b - rgb[k][2]) ** 2
      if (d < bestD) [best, bestD] = [k, d]
    }
    if (best >= 0) masks[best].data[i] = 1
  }
  const scale = roomWidth / raster.width
  const out = new Map<string, PolygonMask>()
  colors.forEach((c, k) => out.set(c, vectorize(masks[k], { scale, tolerance: 1.2 })))
  return out
}
