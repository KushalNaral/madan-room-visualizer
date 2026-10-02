// Renders the mock rooms. Usage:
//   node scripts/scene/generate.ts [roomId…] [--quality=2] [--preview]
// --preview renders at half resolution with low sampling for fast iteration.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cross, len, sub, type Vec3 } from './math.ts'
import { encodePng } from './png.ts'
import { idColor, project, renderScene } from './render.ts'
import type { SceneDef } from './scene.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const imgDir = join(root, 'public', 'mock-rooms')
const jsonDir = join(root, 'src', 'data', 'mock', 'rooms')
mkdirSync(imgDir, { recursive: true })
mkdirSync(jsonDir, { recursive: true })

const args = process.argv.slice(2)
const only = args.filter((a) => !a.startsWith('--'))
const quality = Number(args.find((a) => a.startsWith('--quality='))?.split('=')[1] ?? 2)
const preview = args.includes('--preview')

const hexOf = (c: number[]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
const r1 = (v: number) => Math.round(v * 10) / 10
const r4 = (v: number) => Math.round(v * 10000) / 10000

function downsample(src: Uint8Array, w: number, h: number, tw: number, th: number) {
  const out = new Uint8Array(tw * th * 3)
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor((x * w) / tw), x1 = Math.floor(((x + 1) * w) / tw)
      const y0 = Math.floor((y * h) / th), y1 = Math.floor(((y + 1) * h) / th)
      const acc = [0, 0, 0]
      let n = 0
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        for (let c = 0; c < 3; c++) acc[c] += src[(yy * w + xx) * 3 + c]
        n++
      }
      for (let c = 0; c < 3; c++) out[(y * tw + x) * 3 + c] = Math.round(acc[c] / n)
    }
  }
  return out
}

/** Point deepest inside each surface's largest region (chamfer distance transform at 1/4 scale). */
function anchors(surfaceAt: Int16Array, W: number, H: number, count: number, scaleToImage: number) {
  const f = 4
  const w = Math.floor(W / f), h = Math.floor(H / f)
  const out: ({ x: number; y: number } | undefined)[] = []
  const dist = new Float32Array(w * h)
  for (let s = 0; s < count; s++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      dist[y * w + x] = surfaceAt[(y * f + f / 2) * W + x * f + f / 2] === s ? 1e9 : 0
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!dist[i]) continue
      const up = y > 0 ? dist[i - w] : 0, left = x > 0 ? dist[i - 1] : 0
      dist[i] = Math.min(dist[i], up + 1, left + 1)
    }
    let best = -1, bx = 0, by = 0
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (!dist[i]) continue
      const down = y < h - 1 ? dist[i + w] : 0, right = x < w - 1 ? dist[i + 1] : 0
      dist[i] = Math.min(dist[i], down + 1, right + 1)
      if (dist[i] > best) { best = dist[i]; bx = x; by = y }
    }
    out.push(best > 0 ? { x: Math.round(((bx + 0.5) * f) * scaleToImage), y: Math.round(((by + 0.5) * f) * scaleToImage) } : undefined)
  }
  return out
}

const files = readdirSync(join(here, 'rooms')).filter((f) => f.endsWith('.ts'))
for (const file of files) {
  const modulePath = pathToFileURL(join(here, 'rooms', file)).href
  const def: SceneDef = (await import(modulePath)).default
  if (only.length && !only.includes(def.id)) continue
  if (preview) {
    def.camera = { ...def.camera, width: def.camera.width / 2, height: def.camera.height / 2 }
  }
  const started = Date.now()
  let last = ''
  const out = await renderScene(modulePath, def, preview ? 1 : quality, (m) => {
    const pct = m.split(': ')[1]
    if (pct !== last && /0%$/.test(pct)) process.stdout.write(`\r${m}   `)
    last = pct
  })
  const { width: w, height: h, scene, camera } = out
  writeFileSync(join(imgDir, `${def.id}.png`), encodePng(w, h, out.photo, 3))
  writeFileSync(join(imgDir, `${def.id}-shading.png`), encodePng(w, h, out.shading, 3))
  writeFileSync(join(imgDir, `${def.id}-ids.png`), encodePng(w * 2, h * 2, out.ids, 3))
  writeFileSync(join(imgDir, `${def.id}-thumb.png`), encodePng(480, 300, downsample(out.photo, w, h, 480, 300), 3))

  const area = new Array(scene.surfaces.length).fill(0)
  for (let t = 0; t < scene.triSurface.length; t++) {
    const s = scene.triSurface[t]
    if (s < 0) continue
    const p = (k: number): Vec3 => [scene.positions[t * 9 + k * 3], scene.positions[t * 9 + k * 3 + 1], scene.positions[t * 9 + k * 3 + 2]]
    area[s] += len(cross(sub(p(1), p(0)), sub(p(2), p(0)))) / 2
  }
  const anchorPts = anchors(out.surfaceAt, w * 2, h * 2, scene.surfaces.length, 0.5)

  const surfaces = scene.surfaces.map((s, si) => {
    const patches = scene.patches
      .map((p, pi) => ({ p, pi }))
      .filter(({ p, pi }) => p.surface === si && out.patchVisible.has(pi))
      .map(({ p }) => {
        if (p.kind === 'quad') {
          const pr = p.corners.map((c) => project(camera, c))
          return {
            kind: 'quad' as const,
            quad: pr.map((q) => ({ x: r1(q.x), y: r1(q.y) })),
            depth: pr.map((q) => r4(q.d)),
            widthCm: Math.round(p.widthCm),
            heightCm: Math.round(p.heightCm),
          }
        }
        const pts: number[] = []
        for (const c of p.points) {
          const q = project(camera, c)
          pts.push(r1(q.x), r1(q.y), r4(q.d))
        }
        return { kind: 'mesh' as const, cols: p.cols, rows: p.rows, points: pts, widthCm: Math.round(p.widthCm), heightCm: Math.round(p.heightCm) }
      })
    return {
      id: s.id,
      label: s.label,
      accepts: s.accepts,
      ...(s.group ? { group: s.group } : {}),
      idColor: hexOf(idColor(si)),
      areaM2: Math.round(area[si] * 10) / 10,
      ...(anchorPts[si] ? { anchor: anchorPts[si] } : {}),
      patches,
    }
  }).filter((s) => s.patches.length)

  const room = {
    id: def.id,
    name: def.name,
    imageUrl: `mock-rooms/${def.id}.png`,
    shadingUrl: `mock-rooms/${def.id}-shading.png`,
    idMapUrl: `mock-rooms/${def.id}-ids.png`,
    thumbnailUrl: `mock-rooms/${def.id}-thumb.png`,
    width: w,
    height: h,
    surfaces,
    presets: def.presets ?? [],
  }
  writeFileSync(join(jsonDir, `${def.id}.json`), JSON.stringify(room) + '\n')
  console.log(`\r${def.id}: ${scene.triangleCount()} triangles, ${surfaces.length} surfaces, ${((Date.now() - started) / 1000).toFixed(1)}s`)
}
