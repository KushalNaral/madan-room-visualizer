import { add, cross, dot, len, mul, norm, rotation, sub, type Vec3 } from './math.ts'

export type ColorFn = (p: Vec3, uv: [number, number], n: Vec3) => Vec3

export interface Material {
  albedo: Vec3 | ColorFn
  /** Self-lit (sky, lamp shades). Not affected by lighting. */
  emissive?: Vec3 | ColorFn
  /** Set false for lamp shades / sky so light passes through. */
  castsShadow?: boolean
}

export interface SurfaceDef {
  id: string
  label: string
  accepts: string[]
  group?: string
}

export type PatchRec =
  | { surface: number; kind: 'quad'; corners: [Vec3, Vec3, Vec3, Vec3]; widthCm: number; heightCm: number }
  | { surface: number; kind: 'mesh'; cols: number; rows: number; points: Vec3[]; widthCm: number; heightCm: number }

export interface AreaLight {
  /** Corner of the emitting rectangle and its two edges. Emits along +normal (= norm(u × v)). */
  origin: Vec3
  u: Vec3
  v: Vec3
  radiance: Vec3
}

export interface PointLight {
  pos: Vec3
  radius: number
  intensity: Vec3
}

export interface SunLight {
  /** Direction pointing towards the sun. */
  dir: Vec3
  angularRadius: number
  irradiance: Vec3
}

export interface CameraDef {
  pos: Vec3
  target: Vec3
  fovY: number
  width: number
  height: number
}

export interface Preset {
  id: string
  name: string
  description?: string
  selections: Record<string, { productId: string; variantId: string; scale?: number; rotation?: number }>
}

export interface SceneDef {
  id: string
  name: string
  camera: CameraDef
  exposure: number
  build(b: SceneBuilder): void
  presets?: Preset[]
}

export interface Frame {
  /** Maps local coordinates to world. */
  toWorld(p: Vec3): Vec3
  /** Rotates a local direction to world. */
  dir(d: Vec3): Vec3
}

export function frame(origin: Vec3 = [0, 0, 0], yaw = 0, pitch = 0, roll = 0): Frame {
  const r = rotation(yaw, pitch, roll)
  return { toWorld: (p) => add(origin, r(p)), dir: r }
}

const WORLD = frame()

interface PrimitiveOpts {
  surface?: number
  /** Attach triangles to an existing patch (e.g. wall pieces around a window). */
  patchIndex?: number
  /** Register a texture patch for this primitive (default true when surface is set). */
  patch?: boolean
}

export class SceneBuilder {
  // Per triangle: 9 position, 9 normal, 6 uv floats.
  positions: number[] = []
  normals: number[] = []
  uvs: number[] = []
  triMaterial: number[] = []
  triSurface: number[] = []
  triPatch: number[] = []
  triShadow: number[] = []
  private currentPatch = -1

  materials: Material[] = []
  surfaces: SurfaceDef[] = []
  patches: PatchRec[] = []
  areaLights: AreaLight[] = []
  pointLights: PointLight[] = []
  sun: SunLight | null = null
  ambient: Vec3 = [0.2, 0.2, 0.2]

  material(m: Material): number {
    this.materials.push(m)
    return this.materials.length - 1
  }

  surface(def: SurfaceDef): number {
    this.surfaces.push(def)
    return this.surfaces.length - 1
  }

  private tri(p: Vec3[], n: Vec3[], uv: [number, number][], mat: number, surface: number) {
    for (let i = 0; i < 3; i++) {
      this.positions.push(...p[i])
      this.normals.push(...n[i])
      this.uvs.push(...uv[i])
    }
    this.triMaterial.push(mat)
    this.triSurface.push(surface)
    this.triPatch.push(this.currentPatch)
    this.triShadow.push(this.materials[mat].castsShadow === false ? 0 : 1)
  }

  /**
   * Parametric patch: `fn(u, v)` with u → right, v → down as seen from the front.
   * Normals face the viewer of that front side.
   */
  parametric(fn: (u: number, v: number) => Vec3, cols: number, rows: number, mat: number, opts: PrimitiveOpts = {}) {
    const surface = opts.surface ?? -1
    const registers = surface >= 0 && opts.patch !== false
    this.currentPatch = registers ? this.patches.length : (opts.patchIndex ?? -1)
    const grid: Vec3[] = []
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) grid.push(fn(i / cols, j / rows))
    const eps = 1e-3
    const normalAt = (u: number, v: number): Vec3 => {
      const du = sub(fn(Math.min(1, u + eps), v), fn(Math.max(0, u - eps), v))
      const dv = sub(fn(u, Math.min(1, v + eps)), fn(u, Math.max(0, v - eps)))
      return norm(cross(du, mul(dv, -1)))
    }
    const normals: Vec3[] = []
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) normals.push(normalAt(i / cols, j / rows))
    const idx = (i: number, j: number) => j * (cols + 1) + i
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1)
        const uv = (k: number): [number, number] => [(k % (cols + 1)) / cols, Math.floor(k / (cols + 1)) / rows]
        this.tri([grid[a], grid[b], grid[c]], [normals[a], normals[b], normals[c]], [uv(a), uv(b), uv(c)], mat, surface)
        this.tri([grid[a], grid[c], grid[d]], [normals[a], normals[c], normals[d]], [uv(a), uv(c), uv(d)], mat, surface)
      }
    }
    this.currentPatch = -1
    if (registers) {
      // Physical size from the mid-lines' arc lengths.
      const arc = (f: (t: number) => Vec3) => {
        let s = 0
        let prev = f(0)
        for (let k = 1; k <= 24; k++) {
          const cur = f(k / 24)
          s += len(sub(cur, prev))
          prev = cur
        }
        return s
      }
      this.patches.push({
        surface,
        kind: 'mesh',
        cols,
        rows,
        points: grid,
        widthCm: arc((t) => fn(t, 0.5)) * 100,
        heightCm: arc((t) => fn(0.5, t)) * 100,
      })
    }
  }

  /** Planar rectangle given TL, TR, BR, BL as seen from its front. */
  quad(tl: Vec3, tr: Vec3, br: Vec3, bl: Vec3, mat: number, opts: PrimitiveOpts & { subdiv?: number } = {}) {
    const surface = opts.surface ?? -1
    const registers = surface >= 0 && opts.patch !== false
    this.currentPatch = registers ? this.patches.length : (opts.patchIndex ?? -1)
    const n = norm(cross(sub(tr, tl), sub(tl, bl)))
    const s = opts.subdiv ?? 1
    const at = (u: number, v: number): Vec3 => {
      const top = add(tl, mul(sub(tr, tl), u))
      const bot = add(bl, mul(sub(br, bl), u))
      return add(top, mul(sub(bot, top), v))
    }
    for (let j = 0; j < s; j++) {
      for (let i = 0; i < s; i++) {
        const [u0, u1, v0, v1] = [i / s, (i + 1) / s, j / s, (j + 1) / s]
        const a = at(u0, v0), b = at(u1, v0), c = at(u1, v1), d = at(u0, v1)
        this.tri([a, b, c], [n, n, n], [[u0, v0], [u1, v0], [u1, v1]], mat, surface)
        this.tri([a, c, d], [n, n, n], [[u0, v0], [u1, v1], [u0, v1]], mat, surface)
      }
    }
    this.currentPatch = -1
    if (registers) this.planarPatch(surface, tl, tr, br, bl)
  }

  /** Texture frame for a planar surface whose geometry is built from several pieces. */
  planarPatch(surface: number, tl: Vec3, tr: Vec3, br: Vec3, bl: Vec3): number {
    this.patches.push({
      surface,
      kind: 'quad',
      corners: [tl, tr, br, bl],
      widthCm: len(sub(tr, tl)) * 100,
      heightCm: len(sub(bl, tl)) * 100,
    })
    return this.patches.length - 1
  }

  /**
   * Axis-aligned box in a local frame (origin at bottom-centre). `bulge` puffs faces
   * outward like a cushion; `faces` limits which faces are built.
   */
  box(
    f: Frame,
    size: Vec3,
    mat: number,
    opts: PrimitiveOpts & { bulge?: number; faces?: string; res?: number; round?: number } = {},
  ) {
    const [w, h, d] = size.map((v) => v / 2) as Vec3
    const faces = opts.faces ?? 'fbltrd' // front back left top right down(bottom)
    const bulge = opts.bulge ?? 0
    const round = opts.round ?? 0
    const res = opts.res ?? (bulge || round ? 12 : 1)
    // Each face: center, right axis, down axis, normal (local).
    const defs: Record<string, [Vec3, Vec3, Vec3, Vec3, number, number]> = {
      f: [[0, h, d], [1, 0, 0], [0, -1, 0], [0, 0, 1], w, h],
      b: [[0, h, -d], [-1, 0, 0], [0, -1, 0], [0, 0, -1], w, h],
      l: [[-w, h, 0], [0, 0, 1], [0, -1, 0], [-1, 0, 0], d, h],
      r: [[w, h, 0], [0, 0, -1], [0, -1, 0], [1, 0, 0], d, h],
      t: [[0, 2 * h, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0], w, d],
      d: [[0, 0, 0], [1, 0, 0], [0, 0, -1], [0, -1, 0], w, d],
    }
    for (const key of faces) {
      const [c, right, down, normal, hu, hv] = defs[key]
      const fn = (u: number, v: number): Vec3 => {
        const su = (u * 2 - 1) * hu
        const sv = (v * 2 - 1) * hv
        let p = add(add(c, mul(right, su)), mul(down, sv))
        if (bulge) p = add(p, mul(normal, bulge * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)))
        if (round) {
          // Pull the rim inward so edges read as rounded.
          const eu = Math.min(u, 1 - u) * 2, ev = Math.min(v, 1 - v) * 2
          const k = (1 - Math.min(1, eu * 4)) ** 2 + (1 - Math.min(1, ev * 4)) ** 2
          p = sub(p, mul(normal, round * Math.min(1, k)))
        }
        return f.toWorld(p)
      }
      if (res === 1) {
        this.quad(fn(0, 0), fn(1, 0), fn(1, 1), fn(0, 1), mat, opts)
      } else {
        this.parametric(fn, res, res, mat, opts)
      }
    }
  }

  /** Vertical cylinder / truncated cone in a local frame, base at origin. */
  cylinder(
    f: Frame,
    r0: number,
    r1: number,
    height: number,
    mat: number,
    opts: PrimitiveOpts & { segments?: number; caps?: boolean; y0?: number } = {},
  ) {
    const seg = opts.segments ?? 32
    const y0 = opts.y0 ?? 0
    this.parametric(
      (u, v) => {
        const a = -u * Math.PI * 2
        const r = r1 + (r0 - r1) * v
        return f.toWorld([Math.cos(a) * r, y0 + height * (1 - v), Math.sin(a) * r])
      },
      seg,
      1,
      mat,
      opts,
    )
    if (opts.caps !== false) {
      const cap = (y: number, r: number, up: boolean) =>
        this.parametric(
          (u, v) => {
            const a = (up ? -1 : 1) * u * Math.PI * 2
            return f.toWorld([Math.cos(a) * r * (1 - v), y, Math.sin(a) * r * (1 - v)])
          },
          seg,
          1,
          mat,
          opts,
        )
      cap(y0 + height, r1, false)
      cap(y0, r0, true)
    }
  }

  sphere(f: Frame, r: Vec3 | number, mat: number, opts: PrimitiveOpts & { res?: number } = {}) {
    const [rx, ry, rz] = typeof r === 'number' ? [r, r, r] : r
    const res = opts.res ?? 16
    this.parametric(
      (u, v) => {
        const th = u * Math.PI * 2
        const ph = v * Math.PI
        return f.toWorld([-Math.cos(th) * Math.sin(ph) * rx, Math.cos(ph) * ry, Math.sin(th) * Math.sin(ph) * rz])
      },
      res * 2,
      res,
      mat,
      opts,
    )
  }

  /**
   * Hanging curtain panel along local +x with sinusoidal folds (local frame: top-left
   * at origin, hangs down -y, folds along ±z).
   */
  curtain(f: Frame, width: number, height: number, folds: number, depth: number, mat: number, opts: PrimitiveOpts = {}) {
    this.parametric(
      (u, v) => {
        const x = u * width
        const amp = depth * (0.75 + 0.25 * v)
        const z = Math.sin(u * Math.PI * 2 * folds) * amp
        return f.toWorld([x, -v * height, z])
      },
      folds * 12,
      6,
      mat,
      opts,
    )
  }

  /** Area light occupying a rectangle; `u × v` must point into the room. */
  areaLight(l: AreaLight) {
    this.areaLights.push(l)
  }

  /** Writes a frame's world-space down/right vectors for reuse in scene code. */
  static worldFrame() {
    return WORLD
  }

  triangleCount() {
    return this.triMaterial.length
  }

  /** Back-face test helper for patches. */
  static facing(n: Vec3, toCamera: Vec3) {
    return dot(n, toCamera) > 0
  }
}

export { WORLD }
