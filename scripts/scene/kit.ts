// Reusable architectural pieces built on SceneBuilder.
import { add, cross, mul, norm, sub, type Vec3 } from './math.ts'
import { frame, type SceneBuilder } from './scene.ts'

export interface Opening {
  /** Metres from the wall's left edge (as seen from inside). */
  u0: number
  u1: number
  /** Metres from the floor. */
  y0: number
  y1: number
}

export interface WallSpec {
  /** Bottom-left corner as seen from inside the room. */
  origin: Vec3
  /** Unit vector pointing to the right along the wall, as seen from inside. */
  right: Vec3
  width: number
  height: number
  mat: number
  surface?: number
  openings?: Opening[]
  revealDepth?: number
  revealMat?: number
}

/** Wall with rectangular openings; all pieces share one texture frame. */
export function wall(b: SceneBuilder, w: WallSpec) {
  const up: Vec3 = [0, 1, 0]
  const at = (u: number, y: number): Vec3 => add(add(w.origin, mul(w.right, u)), mul(up, y))
  const quadUY = (u0: number, u1: number, y0: number, y1: number, mat: number, opts: object) =>
    b.quad(at(u0, y1), at(u1, y1), at(u1, y0), at(u0, y0), mat, opts)

  const patchIndex =
    w.surface !== undefined ? b.planarPatch(w.surface, at(0, w.height), at(w.width, w.height), at(w.width, 0), at(0, 0)) : undefined
  const opts = w.surface !== undefined ? { surface: w.surface, patch: false, patchIndex } : {}

  const openings = [...(w.openings ?? [])].sort((a, c) => a.u0 - c.u0)
  let u = 0
  for (const o of openings) {
    if (o.u0 > u) quadUY(u, o.u0, 0, w.height, w.mat, opts)
    if (o.y1 < w.height) quadUY(o.u0, o.u1, o.y1, w.height, w.mat, opts)
    if (o.y0 > 0) quadUY(o.u0, o.u1, 0, o.y0, w.mat, opts)
    u = o.u1
    // Reveals: thickness going outward (opposite the room-facing normal).
    if (w.revealDepth && w.revealMat !== undefined) {
      const inward = norm(cross(w.right, up)) // into the room
      const out = mul(inward, -w.revealDepth)
      const rm = w.revealMat
      const A = at(o.u0, o.y1), B = at(o.u1, o.y1), C = at(o.u1, o.y0), D = at(o.u0, o.y0)
      b.quad(add(A, out), add(B, out), B, A, rm) // head
      b.quad(D, C, add(C, out), add(D, out), rm) // sill
      b.quad(add(A, out), A, D, add(D, out), rm) // left jamb
      b.quad(B, add(B, out), add(C, out), C, rm) // right jamb
    }
  }
  if (u < w.width) quadUY(u, w.width, 0, w.height, w.mat, opts)
}

/** Window frame + mullions placed `inset` metres outside the wall plane. */
export function windowFrame(b: SceneBuilder, w: WallSpec, o: Opening, inset: number, mat: number, bars = { v: 1, h: 1 }) {
  const up: Vec3 = [0, 1, 0]
  const inward = norm(cross(w.right, up))
  const yaw = (Math.atan2(inward[0], inward[2]) * 180) / Math.PI
  const at = (u: number, y: number): Vec3 => add(add(add(w.origin, mul(w.right, u)), mul(up, y)), mul(inward, -inset))
  const t = 0.05
  const width = o.u1 - o.u0
  const height = o.y1 - o.y0
  const piece = (u: number, y: number, sw: number, sh: number) =>
    b.box(frame(at(u, y), yaw), [sw, sh, 0.06], mat)
  piece(o.u0 + width / 2, o.y0, width, t) // bottom rail
  piece(o.u0 + width / 2, o.y1 - t, width, t) // top rail
  piece(o.u0 + t / 2, o.y0, t, height)
  piece(o.u1 - t / 2, o.y0, t, height)
  for (let i = 1; i <= bars.v; i++) piece(o.u0 + (width * i) / (bars.v + 1), o.y0, 0.04, height)
  for (let i = 1; i <= bars.h; i++) piece(o.u0 + width / 2, o.y0 + (height * i) / (bars.h + 1) - 0.02, width, 0.04)
}

/** Outdoor backdrop plane parallel to a wall, `dist` metres beyond it. */
export function backdrop(b: SceneBuilder, w: WallSpec, dist: number, mat: number) {
  const up: Vec3 = [0, 1, 0]
  const inward = norm(cross(w.right, up))
  const off = mul(inward, -dist)
  const at = (u: number, y: number): Vec3 => add(add(add(w.origin, mul(w.right, u)), mul(up, y)), off)
  b.quad(at(-40, 20), at(w.width + 40, 20), at(w.width + 40, -6), at(-40, -6), mat)
}

/** Area light filling an opening, emitting into the room. */
export function openingLight(b: SceneBuilder, w: WallSpec, o: Opening, inset: number, radiance: Vec3) {
  const up: Vec3 = [0, 1, 0]
  const inward = norm(cross(w.right, up))
  const origin = add(add(add(w.origin, mul(w.right, o.u0)), mul(up, o.y0)), mul(inward, -inset))
  const U = mul(w.right, o.u1 - o.u0)
  const V = mul(up, o.y1 - o.y0)
  // Order the edges so u × v points into the room.
  const n = cross(U, V)
  const into = n[0] * inward[0] + n[1] * inward[1] + n[2] * inward[2] > 0
  b.areaLight({ origin, u: into ? U : V, v: into ? V : U, radiance })
}

/** Skirting board along a wall segment. */
export function baseboard(b: SceneBuilder, w: WallSpec, u0: number, u1: number, mat: number, h = 0.1) {
  const up: Vec3 = [0, 1, 0]
  const inward = norm(cross(w.right, up))
  const yaw = (Math.atan2(inward[0], inward[2]) * 180) / Math.PI
  const mid = add(add(w.origin, mul(w.right, (u0 + u1) / 2)), mul(inward, 0.008))
  b.box(frame(mid, yaw), [u1 - u0, h, 0.016], mat, { faces: 'ft' })
}

/** Leafy plant: stems radiating from `base` with elongated leaves angled outward and up. */
export function plant(b: SceneBuilder, base: Vec3, leafMat: number, stemMat: number, count: number, height: number, seed = 7) {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2
    const t = Math.sqrt(rnd())
    const y = base[1] + 0.1 + t * height
    const k = Math.min(1, height / 1.1)
    const reach = (0.04 + (1 - Math.abs(t - 0.55)) * 0.3 * (0.6 + rnd() * 0.6)) * k
    const len = (0.13 + rnd() * 0.09) * (0.5 + 0.5 * k)
    const tip: Vec3 = [base[0] + Math.cos(a) * reach, y, base[2] + Math.sin(a) * reach]
    // Leaf centre half a length beyond the stem tip; long axis points outward and tilts up.
    const c: Vec3 = [tip[0] + Math.cos(a) * len * 0.5, y + 0.02, tip[2] + Math.sin(a) * len * 0.5]
    b.sphere(frame(c, (-a * 180) / Math.PI, 0, 15 + rnd() * 30), [len * 0.5, 0.008, len * 0.2], leafMat, { res: 6 })
    if (i % 3 === 0) {
      const dx = tip[0] - base[0], dz = tip[2] - base[2]
      const tilt = (Math.atan2(Math.hypot(dx, dz), y - base[1]) * 180) / Math.PI
      b.cylinder(frame(base, (-Math.atan2(dz, dx) * 180) / Math.PI, 0, -tilt), 0.005, 0.004, Math.hypot(dx, dz, y - base[1]), stemMat, { segments: 5, caps: false })
    }
  }
}

export function downlight(b: SceneBuilder, pos: Vec3, mat: number, trim: number) {
  b.cylinder(frame(sub(pos, [0, 0.004, 0])), 0.07, 0.07, 0.004, trim, { segments: 24 })
  b.cylinder(frame(sub(pos, [0, 0.006, 0])), 0.045, 0.045, 0.003, mat, { segments: 24 })
}
