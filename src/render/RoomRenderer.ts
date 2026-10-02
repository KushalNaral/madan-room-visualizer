import type { Point, Room, Selection, Surface, TexturePatch, Variant } from '../types'
import { quadToSquare, toColumnMajor } from './homography'
import { overlayFragment, photoFragment, surfaceFragment, vertexShader } from './shaders'
import { loadImage, loadTextureSource, type TextureSource } from './textures'

export type PatternAdjust = Pick<Selection, 'scale' | 'rotation' | 'offsetX' | 'offsetY'>

interface AppliedMaterial {
  variant: Variant
  texture: WebGLTexture
  adjust: PatternAdjust
}

interface PatchGpu {
  buffer: WebGLBuffer
  count: number
  mode: number
  toUnit: Float32Array | null
  widthCm: number
  heightCm: number
}

export interface SurfaceInfo {
  surface: Surface
  /** Bounding box in image pixels. */
  bbox: { x: number; y: number; w: number; h: number }
  /** Hotspot position in image pixels. */
  anchor: Point
  /** Share of the image the surface covers (0..1). */
  coverage: number
}

interface SurfaceState extends SurfaceInfo {
  color: [number, number, number]
  baseLum: number
  patches: PatchGpu[]
}

const FINISH_GLOSS: Record<Variant['finish'], number> = { matte: 0, satin: 0.35, gloss: 1 }

export function autoIdColor(index: number): string {
  const levels = [48, 112, 176, 240]
  const k = index + 1
  const c = [levels[k % 4], levels[Math.floor(k / 4) % 4], levels[Math.floor(k / 16) % 4]]
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram()!
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`)
    }
    gl.attachShader(program, shader)
  }
  gl.bindAttribLocation(program, 0, 'a_pos')
  gl.bindAttribLocation(program, 1, 'a_uv')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`)
  }
  return program
}

/** Builds the id map canvas for rooms whose surfaces are described by polygons. */
function rasterizePolygonMasks(room: Room, scale: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.round(room.width * scale)
  c.height = Math.round(room.height * scale)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.scale(scale, scale)
  room.surfaces.forEach((s, i) => {
    if (!s.mask) return
    ctx.fillStyle = s.idColor ?? autoIdColor(i)
    ctx.beginPath()
    for (const poly of s.mask.polygons) {
      poly.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
    }
    ctx.fill('evenodd')
    ctx.fillStyle = '#000'
    for (const poly of s.mask.cutouts ?? []) {
      ctx.beginPath()
      poly.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      ctx.fill()
    }
  })
  return c
}

function pixelsOf(src: TexImageSource & { width: number; height: number }, w: number, h: number): Uint8ClampedArray {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
  ctx.canvas.width = w
  ctx.canvas.height = h
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src as CanvasImageSource, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

/**
 * Renders a room photo with materials projected onto its surfaces (WebGL2).
 * Masks come from the room's id map (or rasterised editor polygons); planar
 * patches use a homography, curved ones a warped mesh with depth ordering.
 */
export class RoomRenderer {
  private gl: WebGL2RenderingContext
  private photoProgram: WebGLProgram
  private surfaceProgram: WebGLProgram
  private overlayProgram: WebGLProgram
  private screenBuffer: WebGLBuffer
  private anisotropy: { ext: EXT_texture_filter_anisotropic; max: number } | null
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()

  private room: Room | null = null
  private photo: HTMLImageElement | null = null
  private textures: { photo?: WebGLTexture; shading?: WebGLTexture; ids?: WebGLTexture } = {}
  private ids: { data: Uint8ClampedArray; w: number; h: number } | null = null
  private surfaces = new Map<string, SurfaceState>()
  private materials = new Map<string, AppliedMaterial>()
  private textureCache = new Map<string, Promise<WebGLTexture>>()
  private thumbCache = new Map<string, string>()
  private loadToken = 0
  private frame = 0

  hoverId: string | null = null
  selectedId: string | null = null
  outlineColor: [number, number, number] = [0.85, 0.45, 0.15]
  /** Outline thickness in image pixels (set from the display scale for a constant on-screen width). */
  outlinePx = 3
  dimOthers = 0.18
  showHighlights = true

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      depth: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    })
    if (!gl) throw new Error('WebGL2 is not supported in this browser')
    this.gl = gl
    this.photoProgram = compile(gl, vertexShader, photoFragment)
    this.surfaceProgram = compile(gl, vertexShader, surfaceFragment)
    this.overlayProgram = compile(gl, vertexShader, overlayFragment)
    this.screenBuffer = gl.createBuffer()!
    const ext = gl.getExtension('EXT_texture_filter_anisotropic')
    this.anisotropy = ext ? { ext, max: gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) } : null
  }

  get currentRoom() {
    return this.room
  }

  async setRoom(room: Room): Promise<void> {
    const token = ++this.loadToken
    const [photo, shading, idImage] = await Promise.all([
      loadImage(room.imageUrl),
      room.shadingUrl ? loadImage(room.shadingUrl).catch(() => null) : Promise.resolve(null),
      room.idMapUrl ? loadImage(room.idMapUrl) : Promise.resolve(null),
    ])
    if (token !== this.loadToken) return
    const { gl } = this

    this.disposeRoom()
    this.room = room
    this.photo = photo
    this.canvas.width = room.width
    this.canvas.height = room.height

    const idSource: HTMLImageElement | HTMLCanvasElement = idImage ?? rasterizePolygonMasks(room, 2)
    this.textures.photo = this.uploadTexture(photo, 'clamp', gl.LINEAR)
    if (shading) this.textures.shading = this.uploadTexture(shading, 'clamp', gl.LINEAR)
    this.textures.ids = this.uploadTexture(idSource, 'clamp', gl.NEAREST)
    this.ids = { data: pixelsOf(idSource, idSource.width, idSource.height), w: idSource.width, h: idSource.height }

    this.analyseSurfaces(room, photo)
    this.render()
  }

  /** Applies (or clears, with `null`) a variant on a surface of the current room. */
  async setMaterial(surfaceId: string, variant: Variant | null, adjust: PatternAdjust = {}): Promise<void> {
    if (!variant) {
      if (this.materials.delete(surfaceId)) this.invalidate()
      return
    }
    const room = this.room
    const texture = await this.textureFor(variant)
    if (room !== this.room) return
    this.materials.set(surfaceId, { variant, texture, adjust })
    this.invalidate()
  }

  /** Preloads textures (e.g. on hover) so applying feels instant. */
  prefetch(variant: Variant) {
    void this.textureFor(variant)
  }

  clearMaterials() {
    this.materials.clear()
    this.invalidate()
  }

  /** Surface under a point in image pixels, via the id map. */
  hitTest(p: Point): Surface | undefined {
    const id = this.idAt(p)
    return id ? this.surfaces.get(id)?.surface : undefined
  }

  surfaceInfo(id: string): SurfaceInfo | undefined {
    const s = this.surfaces.get(id)
    return s && { surface: s.surface, bbox: s.bbox, anchor: s.anchor, coverage: s.coverage }
  }

  allSurfaceInfo(): SurfaceInfo[] {
    return [...this.surfaces.values()].map((s) => ({ surface: s.surface, bbox: s.bbox, anchor: s.anchor, coverage: s.coverage }))
  }

  /** Cropped photo of a surface with everything else faded out. */
  surfaceThumbnail(id: string, size = 112): string | undefined {
    const cached = this.thumbCache.get(id)
    if (cached) return cached
    const s = this.surfaces.get(id)
    if (!s || !this.photo || !this.ids || !this.room) return undefined
    const pad = 0.08
    const bx = Math.max(0, s.bbox.x - s.bbox.w * pad), by = Math.max(0, s.bbox.y - s.bbox.h * pad)
    const bw = Math.min(this.room.width - bx, s.bbox.w * (1 + 2 * pad)), bh = Math.min(this.room.height - by, s.bbox.h * (1 + 2 * pad))
    const side = Math.max(bw, bh)
    const cx = bx + bw / 2 - side / 2, cy = by + bh / 2 - side / 2
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#e9e6e1'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(this.photo, cx, cy, side, side, 0, 0, size, size)
    const img = ctx.getImageData(0, 0, size, size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const ix = cx + ((x + 0.5) / size) * side, iy = cy + ((y + 0.5) / size) * side
        if (this.idAt({ x: ix, y: iy }) === id) continue
        const i = (y * size + x) * 4
        img.data[i] = img.data[i] * 0.35 + 235 * 0.65
        img.data[i + 1] = img.data[i + 1] * 0.35 + 232 * 0.65
        img.data[i + 2] = img.data[i + 2] * 0.35 + 228 * 0.65
      }
    }
    ctx.putImageData(img, 0, 0)
    const url = c.toDataURL('image/jpeg', 0.85)
    this.thumbCache.set(id, url)
    return url
  }

  async toBlob(type = 'image/jpeg', quality = 0.92): Promise<Blob> {
    const prev = this.showHighlights
    this.showHighlights = false
    this.render()
    const blob = await new Promise<Blob>((resolve, reject) =>
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), type, quality),
    )
    this.showHighlights = prev
    this.render()
    return blob
  }

  /** Renders the current state into a 2D canvas (for exports and transitions). */
  snapshot(withHighlights = false): HTMLCanvasElement {
    const prev = this.showHighlights
    this.showHighlights = withHighlights
    this.render()
    const c = document.createElement('canvas')
    c.width = this.canvas.width
    c.height = this.canvas.height
    c.getContext('2d')!.drawImage(this.canvas, 0, 0)
    this.showHighlights = prev
    this.render()
    return c
  }

  /** Schedules a render on the next animation frame. */
  invalidate() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  render() {
    const { gl, room } = this
    const tex = this.textures
    if (!room || !tex.photo || !tex.ids) return
    if (this.frame) {
      cancelAnimationFrame(this.frame)
      this.frame = 0
    }

    gl.viewport(0, 0, room.width, room.height)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const screen = this.screenQuad(room)

    // 1. Photo
    let p = this.photoProgram
    gl.useProgram(p)
    gl.uniform2f(this.u(p, 'u_size'), room.width, room.height)
    this.bindTexture(0, tex.photo)
    gl.uniform1i(this.u(p, 'u_photo'), 0)
    this.drawBuffer(screen, 6, gl.TRIANGLES)

    // 2. Materials
    p = this.surfaceProgram
    gl.useProgram(p)
    gl.uniform2f(this.u(p, 'u_size'), room.width, room.height)
    gl.uniform1i(this.u(p, 'u_photo'), 0)
    gl.uniform1i(this.u(p, 'u_ids'), 1)
    gl.uniform1i(this.u(p, 'u_shading'), 2)
    gl.uniform1i(this.u(p, 'u_material'), 3)
    this.bindTexture(1, tex.ids)
    this.bindTexture(2, tex.shading ?? tex.photo)
    gl.uniform1i(this.u(p, 'u_hasShading'), tex.shading ? 1 : 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LESS)

    for (const s of this.surfaces.values()) {
      const applied = this.materials.get(s.surface.id)
      if (!applied || !s.patches.length) continue
      const { variant, texture, adjust } = applied
      gl.clear(gl.DEPTH_BUFFER_BIT)
      this.bindTexture(3, texture)
      gl.uniform3f(this.u(p, 'u_idColor'), s.color[0] / 255, s.color[1] / 255, s.color[2] / 255)
      gl.uniform2f(this.u(p, 'u_tileCm'), variant.tileSizeCm.w, variant.tileSizeCm.h)
      gl.uniform1i(this.u(p, 'u_stretch'), variant.tiling === 'stretch' ? 1 : 0)
      gl.uniform1f(this.u(p, 'u_scale'), adjust.scale ?? 1)
      gl.uniform1f(this.u(p, 'u_rotation'), ((adjust.rotation ?? 0) * Math.PI) / 180)
      gl.uniform2f(this.u(p, 'u_offsetCm'), adjust.offsetX ?? 0, adjust.offsetY ?? 0)
      gl.uniform1f(this.u(p, 'u_baseLum'), s.baseLum)
      gl.uniform1f(this.u(p, 'u_gloss'), FINISH_GLOSS[variant.finish])
      for (const patch of s.patches) {
        gl.uniform1i(this.u(p, 'u_useHomography'), patch.toUnit ? 1 : 0)
        if (patch.toUnit) gl.uniformMatrix3fv(this.u(p, 'u_toUnit'), false, patch.toUnit)
        gl.uniform2f(this.u(p, 'u_patchCm'), patch.widthCm, patch.heightCm)
        this.drawBuffer(patch.buffer, patch.count, patch.mode)
      }
    }
    gl.disable(gl.DEPTH_TEST)

    // 3. Highlights
    const hover = this.hoverId ? this.surfaces.get(this.hoverId) : undefined
    const selected = this.selectedId ? this.surfaces.get(this.selectedId) : undefined
    if (this.showHighlights && (hover || selected)) {
      p = this.overlayProgram
      gl.useProgram(p)
      gl.uniform2f(this.u(p, 'u_size'), room.width, room.height)
      gl.uniform1i(this.u(p, 'u_ids'), 1)
      gl.uniform1i(this.u(p, 'u_hasHover'), hover ? 1 : 0)
      gl.uniform1i(this.u(p, 'u_hasSelected'), selected ? 1 : 0)
      if (hover) gl.uniform3f(this.u(p, 'u_hover'), hover.color[0] / 255, hover.color[1] / 255, hover.color[2] / 255)
      if (selected) gl.uniform3f(this.u(p, 'u_selected'), selected.color[0] / 255, selected.color[1] / 255, selected.color[2] / 255)
      gl.uniform1f(this.u(p, 'u_outlinePx'), this.outlinePx)
      gl.uniform3f(this.u(p, 'u_outlineColor'), ...this.outlineColor)
      gl.uniform1f(this.u(p, 'u_dim'), this.dimOthers)
      this.drawBuffer(screen, 6, gl.TRIANGLES)
    }
    gl.disable(gl.BLEND)
  }

  dispose() {
    this.loadToken++
    if (this.frame) cancelAnimationFrame(this.frame)
    const { gl } = this
    for (const t of this.textureCache.values()) t.then((tex) => gl.deleteTexture(tex), () => {})
    this.disposeRoom()
    gl.deleteBuffer(this.screenBuffer)
    for (const prog of [this.photoProgram, this.surfaceProgram, this.overlayProgram]) gl.deleteProgram(prog)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  // ---- internals

  private u(program: WebGLProgram, name: string) {
    let m = this.uniforms.get(program)
    if (!m) this.uniforms.set(program, (m = new Map()))
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(program, name))
    return m.get(name)!
  }

  private idAt(p: Point): string | undefined {
    if (!this.ids || !this.room) return undefined
    const { data, w, h } = this.ids
    const x = Math.floor((p.x / this.room.width) * w)
    const y = Math.floor((p.y / this.room.height) * h)
    if (x < 0 || y < 0 || x >= w || y >= h) return undefined
    const i = (y * w + x) * 4
    const r = data[i], g = data[i + 1], b = data[i + 2]
    for (const s of this.surfaces.values()) {
      if (Math.abs(s.color[0] - r) + Math.abs(s.color[1] - g) + Math.abs(s.color[2] - b) < 40) return s.surface.id
    }
    return undefined
  }

  private analyseSurfaces(room: Room, photo: HTMLImageElement) {
    const { data, w, h } = this.ids!
    const sx = room.width / w, sy = room.height / h
    const photoPx = pixelsOf(photo, w, h)
    const lin = (v: number) => Math.pow(v / 255, 2.2)

    const stats = room.surfaces.map((surface, i) => ({
      surface,
      color: parseHex(surface.idColor ?? autoIdColor(i)),
      minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, n: 0, lum: 0, sumX: 0, sumY: 0,
    }))
    const byKey = new Map<number, (typeof stats)[number]>()
    for (const st of stats) byKey.set((st.color[0] << 16) | (st.color[1] << 8) | st.color[2], st)

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const st = byKey.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
        if (!st) continue
        st.n++
        st.sumX += x
        st.sumY += y
        if (x < st.minX) st.minX = x
        if (x > st.maxX) st.maxX = x
        if (y < st.minY) st.minY = y
        if (y > st.maxY) st.maxY = y
        if ((x & 1) === 0 && (y & 1) === 0) {
          st.lum += 0.2126 * lin(photoPx[i]) + 0.7152 * lin(photoPx[i + 1]) + 0.0722 * lin(photoPx[i + 2])
        }
      }
    }

    for (const st of stats) {
      if (!st.n) continue
      const anchor = st.surface.anchor ?? this.inscribedPoint(st.color, w, h, sx, sy) ?? { x: (st.sumX / st.n) * sx, y: (st.sumY / st.n) * sy }
      this.surfaces.set(st.surface.id, {
        surface: st.surface,
        color: st.color,
        baseLum: st.lum / Math.max(1, st.n / 4),
        bbox: { x: st.minX * sx, y: st.minY * sy, w: (st.maxX - st.minX + 1) * sx, h: (st.maxY - st.minY + 1) * sy },
        anchor,
        coverage: st.n / (w * h),
        patches: st.surface.patches.map((patch) => this.uploadPatch(patch)),
      })
    }
  }

  /** Point deepest inside the region (chamfer distance at reduced resolution). */
  private inscribedPoint(color: [number, number, number], w: number, h: number, sx: number, sy: number): Point | null {
    const f = 4
    const gw = Math.floor(w / f), gh = Math.floor(h / f)
    const d = new Float32Array(gw * gh)
    const { data } = this.ids!
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = ((y * f + f / 2) * w + x * f + f / 2) * 4
      d[y * gw + x] = data[i] === color[0] && data[i + 1] === color[1] && data[i + 2] === color[2] ? 1e9 : 0
    }
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x
      if (d[i]) d[i] = Math.min(d[i], (y ? d[i - gw] : 0) + 1, (x ? d[i - 1] : 0) + 1)
    }
    let best = 0, bx = 0, by = 0
    for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) {
      const i = y * gw + x
      if (!d[i]) continue
      d[i] = Math.min(d[i], (y < gh - 1 ? d[i + gw] : 0) + 1, (x < gw - 1 ? d[i + 1] : 0) + 1)
      if (d[i] > best) { best = d[i]; bx = x; by = y }
    }
    return best ? { x: (bx + 0.5) * f * sx, y: (by + 0.5) * f * sy } : null
  }

  private uploadPatch(patch: TexturePatch): PatchGpu {
    const { gl } = this
    const buffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    if (patch.kind === 'quad') {
      const [a, b, c, d] = patch.quad
      const dep = patch.depth ?? [0.5, 0.5, 0.5, 0.5]
      const v = [a, b, c, a, c, d]
      const di = [0, 1, 2, 0, 2, 3]
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]
      const arr = new Float32Array(6 * 5)
      v.forEach((pt, i) => arr.set([pt.x, pt.y, dep[di[i]], uvs[i][0], uvs[i][1]], i * 5))
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW)
      let toUnit: Float32Array | null = null
      try {
        toUnit = toColumnMajor(quadToSquare(patch.quad))
      } catch {
        toUnit = null
      }
      return { buffer, count: 6, mode: gl.TRIANGLES, toUnit, widthCm: patch.widthCm, heightCm: patch.heightCm }
    }
    const { cols, rows, points } = patch
    const at = (i: number, j: number) => {
      const k = (j * (cols + 1) + i) * 3
      return [points[k], points[k + 1], points[k + 2], i / cols, j / rows]
    }
    const arr = new Float32Array(cols * rows * 6 * 5)
    let o = 0
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        for (const [ii, jj] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) {
          arr.set(at(ii, jj), o)
          o += 5
        }
      }
    }
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW)
    return { buffer, count: cols * rows * 6, mode: gl.TRIANGLES, toUnit: null, widthCm: patch.widthCm, heightCm: patch.heightCm }
  }

  private screenQuad(room: Room) {
    const { gl } = this
    const W = room.width, H = room.height
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0, 0, 0, 0, W, 0, 0, 1, 0, W, H, 0, 1, 1,
      0, 0, 0, 0, 0, W, H, 0, 1, 1, 0, H, 0, 0, 1,
    ]), gl.STATIC_DRAW)
    return this.screenBuffer
  }

  private drawBuffer(buffer: WebGLBuffer, count: number, mode: number) {
    const { gl } = this
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12)
    gl.drawArrays(mode, 0, count)
  }

  private bindTexture(unit: number, tex: WebGLTexture) {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit)
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex)
  }

  private textureFor(variant: Variant): Promise<WebGLTexture> {
    const aspect = variant.tiling === 'stretch' ? 0.74 : variant.tileSizeCm.h / variant.tileSizeCm.w
    const key = `${variant.textureUrl}#${aspect.toFixed(3)}`
    let p = this.textureCache.get(key)
    if (!p) {
      p = loadTextureSource(variant.textureUrl, aspect).then((src) =>
        this.uploadTexture(src, variant.tiling === 'stretch' ? 'clamp' : 'repeat', this.gl.LINEAR, true),
      )
      p.catch(() => this.textureCache.delete(key))
      this.textureCache.set(key, p)
    }
    return p
  }

  private uploadTexture(src: TextureSource, wrap: 'repeat' | 'clamp', filter: number, mipmaps = false): WebGLTexture {
    const { gl } = this
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    const w = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    if (mipmaps) {
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      if (this.anisotropy) {
        gl.texParameterf(gl.TEXTURE_2D, this.anisotropy.ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, this.anisotropy.max))
      }
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    }
    return tex
  }

  private disposeRoom() {
    const { gl } = this
    for (const t of Object.values(this.textures)) if (t) gl.deleteTexture(t)
    this.textures = {}
    for (const s of this.surfaces.values()) for (const p of s.patches) gl.deleteBuffer(p.buffer)
    this.surfaces.clear()
    this.materials.clear()
    this.thumbCache.clear()
    this.ids = null
  }
}
