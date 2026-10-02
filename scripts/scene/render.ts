// Offline path-traced room renderer. Produces, per scene:
//   <id>.png          the "photo" (tone-mapped)
//   <id>-shading.png  per-pixel lighting (irradiance × exposure, sqrt(E/4) encoded) for exact relighting
//   <id>-ids.png      2× resolution surface id map
//   <id>-thumb.png    small preview
//   <id>.json         Room definition (surfaces, id colours, texture patches, anchors)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { cpus } from 'node:os'
import { BVH, type Hit } from './bvh.ts'
import { add, cross, dot, len, mul, norm, sub, type Vec3 } from './math.ts'
import { SceneBuilder, type CameraDef, type ColorFn, type Material, type SceneDef } from './scene.ts'

const SS = 2 // subsamples per axis

export interface Camera {
  pos: Vec3
  f: Vec3
  r: Vec3
  u: Vec3
  tanY: number
  tanX: number
  width: number
  height: number
}

export function makeCamera(c: CameraDef): Camera {
  const f = norm(sub(c.target, c.pos))
  const r = norm(cross(f, [0, 1, 0]))
  const u = cross(r, f)
  const tanY = Math.tan(((c.fovY / 2) * Math.PI) / 180)
  return { pos: c.pos, f, r, u, tanY, tanX: tanY * (c.width / c.height), width: c.width, height: c.height }
}

export const NEAR = 0.1

/** World point → image pixel + depth value (1 - near/z, linear in screen space for planes). */
export function project(cam: Camera, p: Vec3) {
  const rel = sub(p, cam.pos)
  const z = dot(rel, cam.f)
  const x = dot(rel, cam.r) / z / cam.tanX
  const y = dot(rel, cam.u) / z / cam.tanY
  return { x: ((x + 1) / 2) * cam.width, y: ((1 - y) / 2) * cam.height, d: 1 - NEAR / z, z }
}

function rayDir(cam: Camera, px: number, py: number): Vec3 {
  const nx = (px / cam.width) * 2 - 1
  const ny = 1 - (py / cam.height) * 2
  return norm(add(add(cam.f, mul(cam.r, nx * cam.tanX)), mul(cam.u, ny * cam.tanY)))
}

function evalColor(c: Vec3 | ColorFn | undefined, p: Vec3, uv: [number, number], n: Vec3): Vec3 {
  if (!c) return [0, 0, 0]
  return typeof c === 'function' ? c(p, uv, n) : c
}

// Low-discrepancy sampling with per-pixel rotation.
function hashSeed(a: number, b: number, c: number) {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const G1 = 0.7548776662466927, G2 = 0.5698402909980532 // R2 sequence

function cosineSample(n: Vec3, r1: number, r2: number): Vec3 {
  const phi = 2 * Math.PI * r1
  const s = Math.sqrt(r2)
  const a: Vec3 = Math.abs(n[0]) > 0.9 ? [0, 1, 0] : [1, 0, 0]
  const t = norm(cross(a, n))
  const b = cross(n, t)
  return norm(add(add(mul(t, Math.cos(phi) * s), mul(b, Math.sin(phi) * s)), mul(n, Math.sqrt(1 - r2))))
}

interface BandResult {
  y0: number
  y1: number
  albedo: Float32Array
  irr: Float32Array
  emissive: Float32Array
  normal: Float32Array
  depth: Float32Array
  surface: Int16Array
  material: Int16Array
  patch: Int32Array
}

interface WorkerInit {
  modulePath: string
  quality: number
  camera: CameraDef
}

function buildScene(def: SceneDef) {
  const b = new SceneBuilder()
  def.build(b)
  return b
}

function traceBand(def: SceneDef, scene: SceneBuilder, bvh: BVH, y0: number, y1: number, quality: number): BandResult {
  const cam = makeCamera(def.camera)
  const W = def.camera.width * SS
  const rows = y1 - y0
  const n = W * rows
  const res: BandResult = {
    y0, y1,
    albedo: new Float32Array(n * 3),
    irr: new Float32Array(n * 3),
    emissive: new Float32Array(n * 3),
    normal: new Float32Array(n * 3),
    depth: new Float32Array(n),
    surface: new Int16Array(n).fill(-1),
    material: new Int16Array(n).fill(-1),
    patch: new Int32Array(n).fill(-1),
  }
  const P = scene.positions, N = scene.normals, UV = scene.uvs
  const hit: Hit = { tri: -1, t: 0, u: 0, v: 0 }
  const sh: Hit = { tri: -1, t: 0, u: 0, v: 0 }
  const AO_RAYS = 3 * quality
  const AREA_SAMPLES = 2 * quality
  const AO_DIST = 0.9
  const mats: Material[] = scene.materials

  for (let sy = y0; sy < y1; sy++) {
    for (let sx = 0; sx < W; sx++) {
      const i = (sy - y0) * W + sx
      const dir = rayDir(cam, (sx + 0.5) / SS, (sy + 0.5) / SS)
      if (!bvh.intersect(cam.pos[0], cam.pos[1], cam.pos[2], dir[0], dir[1], dir[2], 1e9, false, hit)) continue
      const t = hit.tri
      const w0 = 1 - hit.u - hit.v
      const bary = (arr: number[], stride: number, k: number) =>
        w0 * arr[t * stride * 3 + k] + hit.u * arr[t * stride * 3 + stride + k] + hit.v * arr[t * stride * 3 + 2 * stride + k]
      const p: Vec3 = [bary(P, 3, 0), bary(P, 3, 1), bary(P, 3, 2)]
      let nrm: Vec3 = norm([bary(N, 3, 0), bary(N, 3, 1), bary(N, 3, 2)])
      if (dot(nrm, dir) > 0) nrm = mul(nrm, -1)
      const uv: [number, number] = [bary(UV, 2, 0), bary(UV, 2, 1)]
      const mat = mats[scene.triMaterial[t]]

      res.surface[i] = scene.triSurface[t]
      res.material[i] = scene.triMaterial[t]
      res.patch[i] = scene.triPatch[t]
      res.depth[i] = hit.t
      res.normal.set(nrm, i * 3)

      if (mat.emissive) {
        res.emissive.set(evalColor(mat.emissive, p, uv, nrm), i * 3)
        continue
      }
      res.albedo.set(evalColor(mat.albedo, p, uv, nrm), i * 3)

      const o: Vec3 = add(p, mul(nrm, 2e-3))
      const rot1 = hashSeed(sx, sy, 1), rot2 = hashSeed(sx, sy, 2)
      let E: Vec3 = [0, 0, 0]

      // Ambient with ambient occlusion.
      let open = 0
      for (let k = 0; k < AO_RAYS; k++) {
        const d = cosineSample(nrm, (rot1 + k * G1) % 1, (rot2 + k * G2) % 1)
        if (!bvh.intersect(o[0], o[1], o[2], d[0], d[1], d[2], AO_DIST, true, sh)) open++
      }
      const ao = 0.25 + 0.75 * (open / AO_RAYS)
      E = add(E, mul(scene.ambient, ao))

      // Area lights (windows).
      for (const L of scene.areaLights) {
        const ln = norm(cross(L.u, L.v))
        const area = len(cross(L.u, L.v))
        let acc = 0
        for (let k = 0; k < AREA_SAMPLES; k++) {
          const q = add(add(L.origin, mul(L.u, (rot1 + k * G1) % 1)), mul(L.v, (rot2 + k * G2) % 1))
          const toL = sub(q, o)
          const dist = len(toL)
          const l = mul(toL, 1 / dist)
          const cosS = dot(nrm, l)
          const cosL = -dot(ln, l)
          if (cosS <= 0 || cosL <= 0) continue
          if (bvh.intersect(o[0], o[1], o[2], l[0], l[1], l[2], dist - 1e-3, true, sh)) continue
          acc += (cosS * cosL * area) / (dist * dist)
        }
        E = add(E, mul(L.radiance, acc / AREA_SAMPLES / Math.PI))
      }

      // Sun through openings.
      if (scene.sun) {
        const s = scene.sun
        let acc = 0
        for (let k = 0; k < quality; k++) {
          const j = cosineSample(s.dir, (rot1 + k * G1) % 1, (rot2 + k * G2) % 1)
          const d = norm(add(s.dir, mul(sub(j, s.dir), s.angularRadius * 4)))
          const cosS = dot(nrm, d)
          if (cosS <= 0) continue
          if (bvh.intersect(o[0], o[1], o[2], d[0], d[1], d[2], 60, true, sh)) continue
          acc += cosS
        }
        E = add(E, mul(s.irradiance, acc / quality))
      }

      // Lamps.
      for (const L of scene.pointLights) {
        let acc = 0
        for (let k = 0; k < quality; k++) {
          const j = cosineSample([0, 1, 0], (rot1 + k * G1) % 1, (rot2 + k * G2) % 1)
          const q = add(L.pos, mul(norm(add(j, [0, -0.5, 0])), L.radius))
          const toL = sub(q, o)
          const dist = len(toL)
          const l = mul(toL, 1 / dist)
          const cosS = dot(nrm, l)
          if (cosS <= 0) continue
          if (bvh.intersect(o[0], o[1], o[2], l[0], l[1], l[2], dist - 1e-3, true, sh)) continue
          acc += cosS / (dist * dist)
        }
        E = add(E, mul(L.intensity, acc / quality))
      }
      res.irr.set(E, i * 3)
    }
  }
  return res
}

if (!isMainThread) {
  const init = workerData as WorkerInit
  const def: SceneDef = { ...(await import(init.modulePath)).default, camera: init.camera }
  const scene = buildScene(def)
  const bvh = new BVH(scene.positions, Uint8Array.from(scene.triShadow))
  parentPort!.on('message', ([y0, y1]: [number, number]) => {
    const r = traceBand(def, scene, bvh, y0, y1, init.quality)
    parentPort!.postMessage(r, [
      r.albedo.buffer, r.irr.buffer, r.emissive.buffer, r.normal.buffer, r.depth.buffer,
      r.surface.buffer, r.material.buffer, r.patch.buffer,
    ] as ArrayBuffer[])
  })
  parentPort!.postMessage('ready')
}

export interface RenderOutput {
  width: number
  height: number
  photo: Uint8Array // RGB
  shading: Uint8Array // RGB
  ids: Uint8Array // RGB at 2×
  surfaceAt: Int16Array // 2× surface index map
  patchVisible: Set<number>
  scene: SceneBuilder
  camera: Camera
}

function aces(x: number) {
  return Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)))
}
function toSrgb(x: number) {
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
}

export function idColor(index: number): [number, number, number] {
  const levels = [48, 112, 176, 240]
  const k = index + 1
  return [levels[k % 4], levels[Math.floor(k / 4) % 4], levels[Math.floor(k / 16) % 4]]
}

export async function renderScene(modulePath: string, def: SceneDef, quality = 2, onProgress?: (msg: string) => void): Promise<RenderOutput> {
  const W = def.camera.width * SS
  const H = def.camera.height * SS
  const threads = Math.max(1, cpus().length)
  // Interleave small bands across workers for balanced load.
  const bandRows = Math.ceil(H / (threads * 4))
  const bands: [number, number][] = []
  for (let y = 0; y < H; y += bandRows) bands.push([y, Math.min(H, y + bandRows)])

  const albedo = new Float32Array(W * H * 3)
  const irr = new Float32Array(W * H * 3)
  const emissive = new Float32Array(W * H * 3)
  const normal = new Float32Array(W * H * 3)
  const depth = new Float32Array(W * H)
  const surface = new Int16Array(W * H)
  const material = new Int16Array(W * H)
  const patch = new Int32Array(W * H)

  let next = 0
  let done = 0
  const runWorker = () =>
    new Promise<void>((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { modulePath, quality, camera: def.camera } satisfies WorkerInit })
      const take = () => {
        if (next >= bands.length) {
          w.terminate()
          return resolve()
        }
        w.postMessage(bands[next++])
      }
      w.on('error', reject)
      w.on('message', (r: BandResult | 'ready') => {
        if (r === 'ready') return take()
        {
          const o = r.y0 * W
          albedo.set(r.albedo, o * 3); irr.set(r.irr, o * 3); emissive.set(r.emissive, o * 3)
          normal.set(r.normal, o * 3); depth.set(r.depth, o); surface.set(r.surface, o)
          material.set(r.material, o); patch.set(r.patch, o)
          done++
          onProgress?.(`${def.id}: ${Math.round((done / bands.length) * 100)}%`)
          take()
        }
      })
    })
  await Promise.all(Array.from({ length: threads }, runWorker))

  // Edge-aware denoise of irradiance (separable cross-bilateral).
  const R = 5
  const sigma = R / 2
  const tmp = new Float32Array(irr.length)
  const passes: [Float32Array, Float32Array, number, number][] = [[irr, tmp, 1, 0], [tmp, irr, 0, 1]]
  for (const [src, dst, dx, dy] of passes) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (material[i] < 0) continue
        let r = 0, g = 0, b = 0, wsum = 0
        for (let k = -R; k <= R; k++) {
          const xx = x + k * dx, yy = y + k * dy
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
          const j = yy * W + xx
          if (material[j] !== material[i]) continue
          const nd = normal[i * 3] * normal[j * 3] + normal[i * 3 + 1] * normal[j * 3 + 1] + normal[i * 3 + 2] * normal[j * 3 + 2]
          if (nd < 0.9) continue
          if (Math.abs(depth[i] - depth[j]) > 0.04 * depth[i]) continue
          const w = Math.exp(-(k * k) / (2 * sigma * sigma)) * (nd - 0.89) * 10
          r += src[j * 3] * w; g += src[j * 3 + 1] * w; b += src[j * 3 + 2] * w; wsum += w
        }
        dst[i * 3] = r / wsum; dst[i * 3 + 1] = g / wsum; dst[i * 3 + 2] = b / wsum
      }
    }
  }

  const w1 = def.camera.width, h1 = def.camera.height
  const photo = new Uint8Array(w1 * h1 * 3)
  const shading = new Uint8Array(w1 * h1 * 3)
  const ex = def.exposure
  for (let y = 0; y < h1; y++) {
    for (let x = 0; x < w1; x++) {
      const c: Vec3 = [0, 0, 0]
      const s: Vec3 = [0, 0, 0]
      let sn = 0
      const anySurface = (() => {
        for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) if (surface[(y * SS + j) * W + x * SS + i] >= 0) return true
        return false
      })()
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const k = (y * SS + j) * W + x * SS + i
          for (let ch = 0; ch < 3; ch++) c[ch] += albedo[k * 3 + ch] * irr[k * 3 + ch] + emissive[k * 3 + ch]
          if (!anySurface || surface[k] >= 0) {
            for (let ch = 0; ch < 3; ch++) s[ch] += irr[k * 3 + ch]
            sn++
          }
        }
      }
      for (let ch = 0; ch < 3; ch++) {
        const lin = (c[ch] / (SS * SS)) * ex
        photo[(y * w1 + x) * 3 + ch] = Math.round(toSrgb(aces(lin)) * 255)
        const e = (s[ch] / Math.max(1, sn)) * ex
        shading[(y * w1 + x) * 3 + ch] = Math.round(Math.sqrt(Math.min(1, e / 4)) * 255)
      }
    }
  }

  const ids = new Uint8Array(W * H * 3)
  const patchVisible = new Set<number>()
  for (let i = 0; i < W * H; i++) {
    if (patch[i] >= 0) patchVisible.add(patch[i])
    if (surface[i] < 0) continue
    ids.set(idColor(surface[i]), i * 3)
  }

  // Rebuild scene on the main thread for metadata (patches, surfaces).
  const scene = buildScene(def)
  return { width: w1, height: h1, photo, shading, ids, surfaceAt: surface, patchVisible, scene, camera: makeCamera(def.camera) }
}
