import type { Point, PolygonMask } from '../../types'

/** A binary raster (1 = inside), row-major. */
export interface Mask {
  width: number
  height: number
  data: Uint8Array
}

export function emptyMask(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) }
}

export function maskArea(mask: Mask): number {
  let n = 0
  for (let i = 0; i < mask.data.length; i++) n += mask.data[i]
  return n
}

export function maskBounds(mask: Mask) {
  const { width: w, height: h, data } = mask
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (data[row + x]) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY }
}

/** Nearest-neighbour resample (e.g. a model-resolution mask to the working resolution). */
export function resizeMask(mask: Mask, width: number, height: number): Mask {
  const out = emptyMask(width, height)
  const sx = mask.width / width, sy = mask.height / height
  for (let y = 0; y < height; y++) {
    const srcRow = Math.min(mask.height - 1, Math.floor((y + 0.5) * sy)) * mask.width
    for (let x = 0; x < width; x++) out.data[y * width + x] = mask.data[srcRow + Math.min(mask.width - 1, Math.floor((x + 0.5) * sx))]
  }
  return out
}

export function combine(a: Mask, b: Mask, op: 'union' | 'subtract' | 'intersect'): Mask {
  const out = emptyMask(a.width, a.height)
  for (let i = 0; i < a.data.length; i++) {
    const x = a.data[i], y = b.data[i]
    out.data[i] = op === 'union' ? x | y : op === 'subtract' ? x & (y ^ 1) : x & y
  }
  return out
}

/** Intersection over union, for comparing a detected mask with a reference. */
export function iou(a: Mask, b: Mask): number {
  let inter = 0, union = 0
  for (let i = 0; i < a.data.length; i++) {
    inter += a.data[i] & b.data[i]
    union += a.data[i] | b.data[i]
  }
  return union ? inter / union : 0
}

/** Paints a filled disc (brush = 1, eraser = 0). */
export function paintDisc(mask: Mask, cx: number, cy: number, r: number, value: 0 | 1) {
  const { width: w, height: h, data } = mask
  const r2 = r * r
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy
      if (dx * dx + dy * dy <= r2) data[y * w + x] = value
    }
  }
}

/** Paints along a segment with discs spaced a third of the radius apart. */
export function paintStroke(mask: Mask, from: Point, to: Point, r: number, value: 0 | 1) {
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(1, r / 3)))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    paintDisc(mask, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, r, value)
  }
}

/**
 * Rasterizes a PolygonMask the way the renderer does: `polygons` filled even-odd, then each
 * `cutouts` ring removed. `scale` maps polygon (image) coordinates to raster coordinates.
 */
export function rasterize(poly: PolygonMask, width: number, height: number, scale = 1): Mask {
  const out = emptyMask(width, height)
  fillEvenOdd(out, poly.polygons, scale, 1)
  for (const ring of poly.cutouts ?? []) fillEvenOdd(out, [ring], scale, 0)
  return out
}

function fillEvenOdd(out: Mask, ringsIn: Point[][], scale: number, value: 0 | 1) {
  const { width, height } = out
  const rings = ringsIn.filter((r) => r.length >= 3)
  const xs: number[] = []
  for (let y = 0; y < height; y++) {
    const sy = (y + 0.5) / scale
    xs.length = 0
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j]
        if (a.y > sy !== b.y > sy) xs.push((a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x)) * scale)
      }
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5))
      for (let x = x0; x <= x1; x++) out.data[y * width + x] = value
    }
  }
}

/** 4-connected components, largest first, each as its own mask. */
export function components(mask: Mask, minArea = 1): Mask[] {
  const { width: w, height: h, data } = mask
  const label = new Int32Array(w * h)
  const out: { area: number; mask: Mask }[] = []
  const stack: number[] = []
  let next = 0
  for (let start = 0; start < data.length; start++) {
    if (!data[start] || label[start]) continue
    next++
    const m = emptyMask(w, h)
    let area = 0
    stack.push(start)
    label[start] = next
    while (stack.length) {
      const i = stack.pop()!
      m.data[i] = 1
      area++
      const x = i % w, y = (i - x) / w
      const n = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
      for (const j of n) {
        if (j >= 0 && data[j] && !label[j]) {
          label[j] = next
          stack.push(j)
        }
      }
    }
    if (area >= minArea) out.push({ area, mask: m })
  }
  return out.sort((a, b) => b.area - a.area).map((c) => c.mask)
}
