import type { Point, PolygonMask } from '../../types'
import type { Mask } from './mask'

export interface VectorizeOptions {
  /** Douglas–Peucker tolerance in raster pixels. */
  tolerance?: number
  /** Rings smaller than this (raster px²) are dropped as specks. */
  minArea?: number
  /** Multiplies output coordinates (raster → image pixels). */
  scale?: number
}

/** Shoelace area; with this module's tracing, outer boundaries are negative and holes positive. */
export function signedArea(ring: Point[]): number {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j].x * ring[i].y - ring[i].x * ring[j].y
  return a / 2
}

/**
 * Traces every boundary of a binary mask along pixel edges. Each inside pixel contributes the
 * sides it shares with outside pixels, directed so the inside is on one side; the edges link into
 * closed rings. Outer rings and holes come out with opposite orientation.
 */
export function traceRings(mask: Mask): Point[][] {
  const { width: w, height: h, data } = mask
  const W = w + 1
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] === 1
  // Edges keyed by start vertex; at most two leave a vertex (where diagonal pixels touch).
  const from: number[] = []
  const to: number[] = []
  const outgoing = new Map<number, number[]>()
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const s = y0 * W + x0
    const e = from.length
    from.push(s)
    to.push(y1 * W + x1)
    const list = outgoing.get(s)
    if (list) list.push(e)
    else outgoing.set(s, [e])
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue
      if (!inside(x, y - 1)) add(x + 1, y, x, y)
      if (!inside(x - 1, y)) add(x, y, x, y + 1)
      if (!inside(x, y + 1)) add(x, y + 1, x + 1, y + 1)
      if (!inside(x + 1, y)) add(x + 1, y + 1, x + 1, y)
    }
  }

  const used = new Uint8Array(from.length)
  const rings: Point[][] = []
  for (let e0 = 0; e0 < from.length; e0++) {
    if (used[e0]) continue
    const ring: Point[] = []
    let e = e0
    while (!used[e]) {
      used[e] = 1
      const v = from[e]
      ring.push({ x: v % W, y: Math.floor(v / W) })
      const choices = outgoing.get(to[e])!
      // Where two edges leave, take the one that turns the same way each time (keeps rings simple).
      e = choices.length === 1 ? choices[0] : pickTurn(choices, e, from, to, W, used)
    }
    rings.push(dropCollinear(ring))
  }
  return rings
}

function pickTurn(choices: number[], incoming: number, from: number[], to: number[], W: number, used: Uint8Array): number {
  const dir = (e: number) => {
    const a = from[e], b = to[e]
    return { x: (b % W) - (a % W), y: Math.floor(b / W) - Math.floor(a / W) }
  }
  const d = dir(incoming)
  let best = choices.find((c) => !used[c]) ?? choices[0]
  for (const c of choices) {
    if (used[c]) continue
    const n = dir(c)
    if (d.x * n.y - d.y * n.x > 0) best = c
  }
  return best
}

function dropCollinear(ring: Point[]): Point[] {
  const out: Point[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i - 1 + ring.length) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length]
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) !== 0) out.push(b)
  }
  return out.length >= 3 ? out : ring
}

function perpendicular(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (!len) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
}

/** Douglas–Peucker on an open polyline. */
export function simplifyLine(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    let max = 0, idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = perpendicular(points[i], points[s], points[e])
      if (d > max) [max, idx] = [d, i]
    }
    if (idx >= 0 && max > tolerance) {
      keep[idx] = 1
      stack.push([s, idx], [idx, e])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** Douglas–Peucker on a closed ring: split at the point farthest from the first, simplify both halves. */
export function simplifyRing(ring: Point[], tolerance: number): Point[] {
  if (ring.length <= 4) return ring
  let far = 0, max = -1
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i].x - ring[0].x, ring[i].y - ring[0].y)
    if (d > max) [max, far] = [d, i]
  }
  const a = simplifyLine(ring.slice(0, far + 1), tolerance)
  const b = simplifyLine([...ring.slice(far), ring[0]], tolerance)
  const out = [...a.slice(0, -1), ...b.slice(0, -1)]
  return out.length >= 3 ? out : ring
}

/**
 * Mask → the library's PolygonMask. Outer boundaries and holes all go into `polygons`, which are
 * filled even-odd, so holes stay holes and islands inside holes stay filled. (`cutouts` are
 * painted over everything by the renderer, which would erase such islands.)
 */
export function vectorize(mask: Mask, opts: VectorizeOptions = {}): PolygonMask {
  const { tolerance = 1.5, minArea = 24, scale = 1 } = opts
  const polygons: Point[][] = []
  for (const raw of traceRings(mask)) {
    if (Math.abs(signedArea(raw)) < minArea) continue
    const ring = simplifyRing(raw, tolerance).map((p) => ({ x: round(p.x * scale), y: round(p.y * scale) }))
    if (ring.length >= 3) polygons.push(ring)
  }
  return { polygons, cutouts: [] }
}

const round = (n: number) => Math.round(n * 10) / 10
