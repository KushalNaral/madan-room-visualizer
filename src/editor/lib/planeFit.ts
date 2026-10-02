import type { Point, Quad } from '../../types'
import { squareToQuad } from '../../render/homography'

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

/** Convex hull (monotone chain), counter-clockwise in y-up terms. */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const lower: Point[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function polygonArea(poly: Point[]): number {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j].x * poly[i].y - poly[i].x * poly[j].y
  return Math.abs(a / 2)
}

function lineIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x)
  if (Math.abs(den) < 1e-9) return null
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
}

/**
 * Reduces a convex polygon to the 4-gon that encloses it with the least extra area: repeatedly
 * replace an edge by the meeting point of its two neighbouring edges, choosing the edge whose
 * removal adds the smallest triangle.
 */
export function reduceToQuad(hull: Point[]): Point[] {
  let poly = [...hull]
  while (poly.length > 4) {
    let best = -1, bestArea = Infinity, bestPoint: Point | null = null
    const n = poly.length
    for (let i = 0; i < n; i++) {
      const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n], d = poly[(i + 2) % n]
      const p = lineIntersection(a, b, d, c)
      if (!p) continue
      // The neighbours must meet beyond the edge (outside the polygon), not behind it.
      const ahead = (p.x - b.x) * (b.x - a.x) + (p.y - b.y) * (b.y - a.y) >= 0 && (p.x - c.x) * (c.x - d.x) + (p.y - c.y) * (c.y - d.y) >= 0
      if (!ahead) continue
      const added = polygonArea([b, p, c])
      if (added < bestArea) [best, bestArea, bestPoint] = [i, added, p]
    }
    if (best < 0) {
      // No edge can be collapsed outward (nearly parallel neighbours): drop the vertex that costs least.
      let k = 0, least = Infinity
      for (let i = 0; i < n; i++) {
        const lost = polygonArea([poly[(i - 1 + n) % n], poly[i], poly[(i + 1) % n]])
        if (lost < least) [k, least] = [i, lost]
      }
      poly.splice(k, 1)
      continue
    }
    const next = (best + 1) % n
    poly[best] = bestPoint!
    poly.splice(next, 1)
  }
  return poly
}

/** Orders 4 corners top-left, top-right, bottom-right, bottom-left (texture orientation). */
export function orderCorners(points: Point[]): Quad {
  const c = { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length }
  // Clockwise on screen (y down) is increasing atan2.
  const sorted = [...points].sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x))
  let start = 0
  sorted.forEach((p, i) => {
    if (p.x + p.y < sorted[start].x + sorted[start].y) start = i
  })
  const q = [0, 1, 2, 3].map((k) => sorted[(start + k) % 4])
  return q.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })) as Quad
}

/** The plane for a surface: its mask's convex hull reduced to 4 ordered corners. */
export function fitPlane(points: Point[]): Quad | null {
  const hull = convexHull(points)
  if (hull.length < 3) return null
  if (hull.length === 3) {
    // A triangle: split its longest edge so there are 4 corners to drag.
    let k = 0, best = -1
    for (let i = 0; i < 3; i++) {
      const a = hull[i], b = hull[(i + 1) % 3]
      const d = Math.hypot(b.x - a.x, b.y - a.y)
      if (d > best) [best, k] = [d, i]
    }
    const a = hull[k], b = hull[(k + 1) % 3]
    hull.splice(k + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  }
  return orderCorners(reduceToQuad(hull))
}

export type PlaneIssue = 'self-intersecting' | 'concave' | 'skewed' | null

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  return d1 * d2 < 0 && d3 * d4 < 0
}

/** Why a plane would map textures badly, or null when it looks fine. */
export function planeIssue(q: Point[]): PlaneIssue {
  if (q.length !== 4) return null
  if (segmentsCross(q[0], q[1], q[2], q[3]) || segmentsCross(q[1], q[2], q[3], q[0])) return 'self-intersecting'
  const signs = q.map((_, i) => Math.sign(cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4])))
  if (new Set(signs.filter(Boolean)).size > 1) return 'concave'
  try {
    squareToQuad(q as Quad)
  } catch {
    return 'self-intersecting'
  }
  for (let i = 0; i < 4; i++) {
    const p = q[(i + 3) % 4], o = q[i], n = q[(i + 1) % 4]
    const a = Math.atan2(p.y - o.y, p.x - o.x) - Math.atan2(n.y - o.y, n.x - o.x)
    const deg = Math.abs(((a * 180) / Math.PI + 540) % 360 - 180)
    if (deg < 12 || deg > 168) return 'skewed'
  }
  return null
}
