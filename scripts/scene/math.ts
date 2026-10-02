export type Vec3 = [number, number, number]

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const mulv = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]]
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

/** sRGB hex → linear RGB. */
export function hex(h: string): Vec3 {
  const n = parseInt(h.replace('#', ''), 16)
  const c = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)]
}

/** Rotation from yaw (around +y), then pitch (around local x), then roll (around local z); degrees. */
export function rotation(yawDeg = 0, pitchDeg = 0, rollDeg = 0) {
  const [y, p, r] = [yawDeg, pitchDeg, rollDeg].map((d) => (d * Math.PI) / 180)
  const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p), cr = Math.cos(r), sr = Math.sin(r)
  // R = Ry * Rx * Rz
  const m = [
    cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp,
    cp * sr, cp * cr, -sp,
    -sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp,
  ]
  return (v: Vec3): Vec3 => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ]
}

// ---- Procedural noise for material albedo ----

function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const fade = (t: number) => t * t * (3 - 2 * t)

export function valueNoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi)
  let out = 0
  for (let dz = 0; dz < 2; dz++)
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const w = (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf)
        out += w * hash3(xi + dx, yi + dy, zi + dz)
      }
  return out
}

export function fbm(x: number, y: number, z: number, octaves = 4) {
  let sum = 0, amp = 0.5, f = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f, y * f, z * f)
    f *= 2.03
    amp *= 0.5
  }
  return sum
}

export function hashInt(...n: number[]) {
  let h = 2166136261
  for (const v of n) h = Math.imul(h ^ (v | 0), 16777619)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}
