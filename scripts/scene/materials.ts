// Procedural albedo functions (linear RGB) for scene materials.
import { fbm, hashInt, hex, lerp, mul, valueNoise, type Vec3 } from './math.ts'
import type { ColorFn } from './scene.ts'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const scale = (c: Vec3, s: number): Vec3 => mul(c, s)

export function plaster(color: string, amount = 0.05): ColorFn {
  const c = hex(color)
  return (p) => scale(c, 1 + amount * (fbm(p[0] * 2.5, p[1] * 2.5, p[2] * 2.5, 3) - 0.5))
}

export function fabric(color: string, amount = 0.08): ColorFn {
  const c = hex(color)
  return (p) => {
    const n = fbm(p[0] * 30, p[1] * 30, p[2] * 30, 2) - 0.5
    const m = fbm(p[0] * 3, p[1] * 3, p[2] * 3, 2) - 0.5
    return scale(c, 1 + amount * n + amount * 0.6 * m)
  }
}

/** Floor boards running along z, staggered joints. */
export function oakPlanks(base = '#b48a5e', alt = '#94683f', boardW = 0.19, boardL = 1.6): ColorFn {
  const a = hex(base), b = hex(alt)
  return (p) => {
    const bx = Math.floor((p[0] + 50) / boardW)
    const shift = hashInt(bx, 7) * boardL
    const bz = Math.floor((p[2] + 50 + shift) / boardL)
    const tone = hashInt(bx, bz)
    let c = lerp(a, b, tone * 0.8)
    const grain = fbm(p[0] * 90 + bx * 13.1, p[1], p[2] * 2.5 + bz * 3.7, 3)
    c = scale(c, 0.82 + 0.36 * grain)
    const fx = ((p[0] + 50) / boardW) % 1
    const fz = ((p[2] + 50 + shift) / boardL) % 1
    const seam = Math.min(fx, 1 - fx) * boardW < 0.0018 || Math.min(fz, 1 - fz) * boardL < 0.0015
    return seam ? scale(c, 0.45) : c
  }
}

/** Furniture wood; grain runs along `axis` (0=x, 1=y, 2=z). */
export function wood(base: string, alt: string, axis: 0 | 1 | 2 = 0, freq = 60): ColorFn {
  const a = hex(base), b = hex(alt)
  return (p) => {
    const q = [p[0] * freq, p[1] * freq, p[2] * freq]
    q[axis] /= freq / 2
    const g = fbm(q[0], q[1], q[2], 3)
    const ring = 0.5 + 0.5 * Math.sin(g * 18)
    return lerp(a, b, clamp01(ring * 0.7 + (g - 0.5)))
  }
}

export function marble(base = '#eeeeeb', vein = '#9a9a98'): ColorFn {
  const a = hex(base), v = hex(vein)
  return (p) => {
    const t = fbm(p[0] * 4, p[1] * 4, p[2] * 4, 5)
    const s = Math.abs(Math.sin((p[0] + p[2]) * 6 + t * 9))
    const veins = Math.pow(1 - s, 10)
    return lerp(a, v, clamp01(veins * 0.9))
  }
}

export function speckle(color: string, amount = 0.15, freq = 40): ColorFn {
  const c = hex(color)
  return (p) => scale(c, 1 + amount * (valueNoise(p[0] * freq, p[1] * freq, p[2] * freq) - 0.5))
}

export function leaves(base = '#3e6b35', alt = '#6b9a4a'): ColorFn {
  const a = hex(base), b = hex(alt)
  return (p) => lerp(a, b, clamp01(fbm(p[0] * 9, p[1] * 9, p[2] * 9, 3) * 1.4 - 0.2))
}

/** Abstract artwork mapped on the XY plane of a canvas whose front faces +z. */
export function artwork(x0: number, y0: number, w: number, h: number, palette: string[], axis: 0 | 2 = 0, flip = false): ColorFn {
  const cols = palette.map(hex)
  return (p) => {
    const u0 = (p[axis] - x0) / w, v = (p[1] - y0) / h
    const u = flip ? 1 - u0 : u0
    if (u < 0.04 || u > 0.96 || v < 0.05 || v > 0.95) return hex('#f2efe8')
    const big = Math.hypot(u - 0.38, v - 0.55) < 0.26
    const arc = Math.abs(Math.hypot(u - 0.66, v - 0.3) - 0.22) < 0.035
    const band = v < 0.22
    let c = cols[0]
    if (band) c = cols[1]
    if (big) c = cols[2]
    if (arc) c = cols[3]
    if (u > 0.7 && v > 0.55 && v < 0.85) c = cols[4 % cols.length]
    return scale(c, 0.95 + 0.1 * fbm(p[0] * 40, p[1] * 40, 0, 2))
  }
}

/** Woven rug with border; uses the patch uv. */
export function rugPattern(field: string, border: string, motif: string): ColorFn {
  const f = hex(field), b = hex(border), m = hex(motif)
  return (p, uv) => {
    const [u, v] = uv
    const edge = Math.min(u, 1 - u, v, 1 - v)
    let c = f
    if (edge < 0.07) c = b
    else if (edge < 0.085) c = m
    else {
      const du = Math.abs(((u * 6) % 1) - 0.5), dv = Math.abs(((v * 4) % 1) - 0.5)
      if (Math.abs(du + dv - 0.32) < 0.035) c = m
    }
    return scale(c, 0.9 + 0.2 * valueNoise(p[0] * 300, p[1] * 300, p[2] * 300))
  }
}

/** Brick-bond tiles on a vertical plane; `axis` is the horizontal world axis (0=x, 2=z). */
export function subwayTiles(base = '#f1efea', grout = '#bdb8ae', w = 0.3, h = 0.075, axis: 0 | 2 = 0): ColorFn {
  const a = hex(base), g = hex(grout)
  return (p) => {
    const row = Math.floor(p[1] / h)
    const u = (p[axis] + 50 + (row % 2) * w * 0.5) / w
    const fu = u % 1, fv = (p[1] / h) % 1
    if (Math.min(fu, 1 - fu) * w < 0.002 || Math.min(fv, 1 - fv) * h < 0.002) return g
    const tone = hashInt(Math.floor(u), row) * 0.08
    return scale(a, 0.96 + tone)
  }
}

/** Square floor tiles with soft veining and grout lines (horizontal plane). */
export function floorTiles(base = '#d9d6d0', vein = '#a9a59d', grout = '#8e8a83', size = 0.6): ColorFn {
  const a = hex(base), v = hex(vein), g = hex(grout)
  return (p) => {
    const fu = ((p[0] + 50) / size) % 1, fv = ((p[2] + 50) / size) % 1
    if (Math.min(fu, 1 - fu) * size < 0.0025 || Math.min(fv, 1 - fv) * size < 0.0025) return g
    const ti = Math.floor((p[0] + 50) / size), tj = Math.floor((p[2] + 50) / size)
    const t = fbm(p[0] * 3 + ti * 7, p[2] * 3 + tj * 5, 0.5, 4)
    const veins = Math.pow(1 - Math.abs(Math.sin(p[0] * 5 + p[2] * 3 + t * 8)), 12)
    return scale(lerp(a, v, veins * 0.6), 0.96 + 0.08 * hashInt(ti, tj))
  }
}

export function solid(color: string): Vec3 {
  return hex(color)
}

/** Sky seen through windows: horizon haze above, garden greens below. */
export function skyView(horizonY: number): ColorFn {
  return (p) => {
    const t = p[1] - horizonY
    if (t < 0) {
      const g = fbm(p[0] * 2, p[1] * 3, p[2] * 2, 4)
      return lerp([0.12, 0.2, 0.08], [0.32, 0.42, 0.18], g)
    }
    if (t < 0.9 && fbm(p[2] * 1.6, p[1] * 2.2, 0, 4) > 0.42 + t * 0.35) {
      return lerp([0.18, 0.28, 0.12], [0.35, 0.45, 0.22], fbm(p[2] * 5, p[1] * 5, 1, 3))
    }
    return lerp([2.6, 2.75, 2.85], [1.25, 1.75, 2.6], Math.min(1, t / 3))
  }
}

export function emissive(color: string, power: number): Vec3 {
  return mul(hex(color), power)
}
