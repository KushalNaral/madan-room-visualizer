import type { Point, Quad } from '../types'

/** Row-major 3×3 matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number]

/**
 * Projective map from the unit square (0,0)→(1,0)→(1,1)→(0,1) onto `quad`.
 * Closed form from Heckbert, "Fundamentals of Texture Mapping" (1989).
 */
export function squareToQuad(quad: Quad): Mat3 {
  const [p0, p1, p2, p3] = quad
  const sx = p0.x - p1.x + p2.x - p3.x
  const sy = p0.y - p1.y + p2.y - p3.y

  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    // Parallelogram: the map is affine.
    return [p1.x - p0.x, p2.x - p1.x, p0.x, p1.y - p0.y, p2.y - p1.y, p0.y, 0, 0, 1]
  }

  const dx1 = p1.x - p2.x
  const dx2 = p3.x - p2.x
  const dy1 = p1.y - p2.y
  const dy2 = p3.y - p2.y
  const den = dx1 * dy2 - dx2 * dy1
  const g = (sx * dy2 - dx2 * sy) / den
  const h = (dx1 * sy - sx * dy1) / den

  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ]
}

export function invert(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error('Degenerate quad: homography is not invertible')
  const k = 1 / det
  return [
    A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k,
  ]
}

export function apply(m: Mat3, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8]
  return {
    x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
    y: (m[3] * p.x + m[4] * p.y + m[5]) / w,
  }
}

/** Image pixel → unit-square texture coordinate for the given quad. */
export function quadToSquare(quad: Quad): Mat3 {
  return invert(squareToQuad(quad))
}

/** Column-major copy for `gl.uniformMatrix3fv`. */
export function toColumnMajor(m: Mat3): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]])
}
