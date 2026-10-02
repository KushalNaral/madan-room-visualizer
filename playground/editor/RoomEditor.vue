<script setup lang="ts">
import { computed, onMounted, reactive, ref, shallowRef } from 'vue'
import { Download, Eye, Grid3x3, Plus, Scissors, Square, Trash2, Upload, Waypoints } from 'lucide-vue-next'
import type { Category, Point, ProductSource, Quad, Room, Surface, TexturePatch } from '../../src'
import { applyHomography, autoIdColor, squareToQuad } from '../../src'
import { Button } from '../../src/components/ui/button'
import { Input } from '../../src/components/ui/input'
import { cn } from '../../src/lib/utils'

/**
 * Authoring tool for real room photos. For each surface:
 *  1. Mask — trace the visible region(s); add cut-outs for things in front of it.
 *  2. Plane — click the 4 perspective corners of the surface's plane (TL→TR→BR→BL).
 *  3. Warp (optional) — turn the plane into a grid and drag points to follow curves
 *     (sofa cushions, curtains).
 * Exports the Room JSON a ProductSource returns.
 */
const props = defineProps<{ source: ProductSource }>()
const emit = defineEmits<{ preview: [room: Room] }>()

interface Draft {
  id: string
  label: string
  accepts: string[]
  group: string
  polygons: Point[][]
  cutouts: Point[][]
  quad: Point[]
  warp: { cols: number; rows: number; points: Point[] } | null
  widthCm: number
  heightCm: number
}

type Mode = 'mask' | 'cutout' | 'plane' | 'warp'

const categories = shallowRef<Category[]>([])
const image = reactive({ url: '', width: 0, height: 0 })
const meta = reactive({ id: 'my-room', name: 'My room' })
const surfaces = ref<Draft[]>([])
const activeIndex = ref(0)
const mode = ref<Mode>('mask')
const falloff = ref(true)
const svg = ref<SVGSVGElement>()

const active = computed(() => surfaces.value[activeIndex.value])
const QUAD_LABELS = ['TL', 'TR', 'BR', 'BL']
const r = computed(() => Math.max(image.width, image.height) / 170)

onMounted(async () => {
  categories.value = await props.source.listCategories()
})

function blank(n: number): Draft {
  return { id: `surface-${n}`, label: `Surface ${n}`, accepts: [], group: '', polygons: [[]], cutouts: [], quad: [], warp: null, widthCm: 300, heightCm: 260 }
}

function onUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    Object.assign(image, { url, width: img.naturalWidth, height: img.naturalHeight })
    const base = file.name.replace(/\.[^.]+$/, '')
    meta.id = base.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    meta.name = base
    surfaces.value = [blank(1)]
    activeIndex.value = 0
    mode.value = 'mask'
  }
  img.src = url
}

function addSurface() {
  surfaces.value.push(blank(surfaces.value.length + 1))
  activeIndex.value = surfaces.value.length - 1
  mode.value = 'mask'
}

function removeSurface(i: number) {
  surfaces.value.splice(i, 1)
  activeIndex.value = Math.max(0, Math.min(activeIndex.value, surfaces.value.length - 1))
}

function toImage(e: { clientX: number; clientY: number }): Point {
  const rect = svg.value!.getBoundingClientRect()
  return {
    x: Math.round(((e.clientX - rect.left) / rect.width) * image.width),
    y: Math.round(((e.clientY - rect.top) / rect.height) * image.height),
  }
}

function currentRing(): Point[] | undefined {
  const s = active.value
  if (!s) return
  return mode.value === 'cutout' ? s.cutouts.at(-1) : s.polygons.at(-1)
}

function onCanvasClick(e: MouseEvent) {
  const s = active.value
  if (!s) return
  const p = toImage(e)
  if (mode.value === 'mask' || mode.value === 'cutout') {
    if (mode.value === 'cutout' && !s.cutouts.length) s.cutouts.push([])
    currentRing()!.push(p)
  } else if (mode.value === 'plane' && s.quad.length < 4) {
    s.quad.push(p)
    s.warp = null
  }
}

function newRing() {
  const s = active.value
  if (!s) return
  if (mode.value === 'cutout') s.cutouts.push([])
  else {
    mode.value = 'mask'
    s.polygons.push([])
  }
}

/** Drag a control point; in warp mode neighbours follow with a smooth falloff. */
function startDrag(e: PointerEvent, list: Point[], index: number, isWarp = false) {
  e.stopPropagation()
  const target = e.currentTarget as Element
  target.setPointerCapture(e.pointerId)
  const start = toImage(e)
  const origin = list.map((p) => ({ ...p }))
  const s = active.value
  const move = (ev: Event) => {
    const p = toImage(ev as PointerEvent)
    const dx = p.x - start.x, dy = p.y - start.y
    if (!isWarp || !falloff.value || !s?.warp) {
      list[index].x = origin[index].x + dx
      list[index].y = origin[index].y + dy
      return
    }
    const { cols } = s.warp
    const ci = index % (cols + 1), cj = Math.floor(index / (cols + 1))
    origin.forEach((o, k) => {
      const d = Math.hypot((k % (cols + 1)) - ci, Math.floor(k / (cols + 1)) - cj)
      const w = Math.exp(-(d * d) / 2.2)
      list[k].x = o.x + dx * w
      list[k].y = o.y + dy * w
    })
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', () => target.removeEventListener('pointermove', move), { once: true })
}

function removePoint(list: Point[], index: number) {
  list.splice(index, 1)
}

function planeFromMask() {
  const s = active.value
  const pts = s?.polygons.flat()
  if (!s || !pts?.length) return
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  s.quad = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  s.warp = null
}

function makeWarp(cols = 8, rows = 6) {
  const s = active.value
  if (!s || s.quad.length !== 4) return
  const H = squareToQuad(s.quad as Quad)
  const points: Point[] = []
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) points.push(applyHomography(H, { x: i / cols, y: j / rows }))
  s.warp = { cols, rows, points }
  mode.value = 'warp'
}

const pts = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(' ')

/** Grid lines showing how texture will be projected. */
function gridPaths(s: Draft): string[] {
  if (s.warp) {
    const { cols, rows, points } = s.warp
    const at = (i: number, j: number) => points[j * (cols + 1) + i]
    const out: string[] = []
    for (let j = 0; j <= rows; j++) out.push('M' + Array.from({ length: cols + 1 }, (_, i) => `${at(i, j).x},${at(i, j).y}`).join('L'))
    for (let i = 0; i <= cols; i++) out.push('M' + Array.from({ length: rows + 1 }, (_, j) => `${at(i, j).x},${at(i, j).y}`).join('L'))
    return out
  }
  if (s.quad.length !== 4) return []
  let H
  try {
    H = squareToQuad(s.quad as Quad)
  } catch {
    return []
  }
  const out: string[] = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    const a = applyHomography(H, { x: t, y: 0 }), b = applyHomography(H, { x: t, y: 1 })
    const c = applyHomography(H, { x: 0, y: t }), d = applyHomography(H, { x: 1, y: t })
    out.push(`M${a.x},${a.y}L${b.x},${b.y}`, `M${c.x},${c.y}L${d.x},${d.y}`)
  }
  return out
}

const issues = computed(() => {
  const out: string[] = []
  for (const s of surfaces.value) {
    if (!s.polygons.some((p) => p.length >= 3)) out.push(`${s.label}: trace its mask (3+ points)`)
    if (s.quad.length !== 4) out.push(`${s.label}: place the 4 plane corners`)
    if (!s.accepts.length) out.push(`${s.label}: choose what it accepts`)
  }
  const ids = surfaces.value.map((s) => s.id)
  if (new Set(ids).size !== ids.length) out.push('Surface ids must be unique')
  return out
})

const room = computed<Room>(() => ({
  id: meta.id,
  name: meta.name,
  imageUrl: image.url,
  width: image.width,
  height: image.height,
  surfaces: surfaces.value
    .filter((s) => s.polygons.some((p) => p.length >= 3) && s.quad.length === 4)
    .map<Surface>((s, i) => {
      const patch: TexturePatch = s.warp
        ? { kind: 'mesh', cols: s.warp.cols, rows: s.warp.rows, points: s.warp.points.flatMap((p) => [p.x, p.y, 0.5]), widthCm: +s.widthCm, heightCm: +s.heightCm }
        : { kind: 'quad', quad: s.quad.map((p) => ({ ...p })) as Quad, widthCm: +s.widthCm, heightCm: +s.heightCm }
      return {
        id: s.id,
        label: s.label,
        accepts: [...s.accepts],
        ...(s.group ? { group: s.group } : {}),
        idColor: autoIdColor(i),
        mask: {
          polygons: s.polygons.filter((p) => p.length >= 3).map((p) => p.map((q) => ({ ...q }))),
          cutouts: s.cutouts.filter((p) => p.length >= 3).map((p) => p.map((q) => ({ ...q }))),
        },
        patches: [patch],
        areaM2: Math.round((s.widthCm * s.heightCm) / 1000) / 10,
      }
    }),
}))

const json = computed(() =>
  JSON.stringify({ ...room.value, imageUrl: image.url.startsWith('blob:') ? 'REPLACE_WITH_HOSTED_IMAGE_URL' : image.url }, null, 2),
)

function downloadJson() {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([json.value], { type: 'application/json' }))
  a.download = `${room.value.id}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function toggleAccept(s: Draft, id: string) {
  s.accepts = s.accepts.includes(id) ? s.accepts.filter((x) => x !== id) : [...s.accepts, id]
}

const MODES: { id: Mode; label: string; icon: unknown; hint: string }[] = [
  { id: 'mask', label: 'Mask', icon: Waypoints, hint: 'Click to trace the visible outline of the surface. Start another region for separate parts.' },
  { id: 'cutout', label: 'Cut-out', icon: Scissors, hint: 'Trace objects in front of the surface (lamps, frames) to exclude them.' },
  { id: 'plane', label: 'Plane', icon: Square, hint: 'Click the plane corners TL → TR → BR → BL. They may lie outside the photo. The blue grid should look like even squares.' },
  { id: 'warp', label: 'Warp', icon: Grid3x3, hint: 'Drag grid points to follow curves. Neighbours follow smoothly unless “soft” is off.' },
]
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
    <section class="flex min-w-0 flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <label class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
          <Upload class="h-4 w-4" /> Upload room photo
          <input type="file" accept="image/*" class="hidden" @change="onUpload" />
        </label>
        <div v-if="image.url" class="flex rounded-lg bg-muted p-1">
          <button
            v-for="m in MODES"
            :key="m.id"
            type="button"
            :disabled="m.id === 'warp' && !active?.warp"
            :class="cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors disabled:opacity-40', mode === m.id ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground')"
            @click="mode = m.id"
          >
            <component :is="m.icon" class="h-4 w-4" /> {{ m.label }}
          </button>
        </div>
      </div>

      <div v-if="!image.url" class="flex aspect-[16/10] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-background text-center">
        <Upload class="h-8 w-8 text-muted-foreground" />
        <p class="font-medium">Upload a photo of a room</p>
        <p class="max-w-sm text-sm text-muted-foreground">Then trace each surface and mark its perspective so materials can be projected onto it.</p>
      </div>

      <div v-else class="relative w-full overflow-hidden rounded-2xl bg-muted shadow-lg" :style="{ aspectRatio: `${image.width} / ${image.height}` }">
        <img :src="image.url" class="absolute inset-0 h-full w-full" draggable="false" alt="Room photo" />
        <svg ref="svg" class="absolute inset-0 h-full w-full cursor-crosshair" :viewBox="`0 0 ${image.width} ${image.height}`" preserveAspectRatio="none" @click="onCanvasClick">
          <g v-for="(s, i) in surfaces" :key="i" :opacity="i === activeIndex ? 1 : 0.55">
            <path
              :d="[...s.polygons, ...s.cutouts].filter((p) => p.length > 1).map((p) => 'M' + pts(p).replaceAll(' ', 'L') + 'Z').join(' ')"
              fill-rule="evenodd"
              :fill="i === activeIndex ? 'rgba(234,88,12,0.22)' : 'rgba(255,255,255,0.14)'"
              :stroke="i === activeIndex ? '#ea580c' : 'white'"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </g>

          <template v-if="active">
            <path
              v-for="(d, i) in gridPaths(active)"
              :key="`g${i}`"
              :d="d"
              stroke="#0ea5e9"
              stroke-opacity="0.75"
              fill="none"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
              class="pointer-events-none"
            />
            <!-- Mask / cut-out handles -->
            <template v-if="mode === 'mask' || mode === 'cutout'">
              <g v-for="(ring, ri) in mode === 'mask' ? active.polygons : active.cutouts" :key="`r${ri}`">
                <circle
                  v-for="(p, i) in ring"
                  :key="i"
                  :cx="p.x"
                  :cy="p.y"
                  :r="r"
                  :fill="mode === 'cutout' ? '#e11d48' : '#ea580c'"
                  stroke="white"
                  stroke-width="2"
                  vector-effect="non-scaling-stroke"
                  class="cursor-move"
                  @pointerdown="startDrag($event, ring, i)"
                  @click.stop
                  @contextmenu.prevent="removePoint(ring, i)"
                />
              </g>
            </template>
            <!-- Plane corners -->
            <g v-if="mode === 'plane'">
              <g v-for="(p, i) in active.quad" :key="`q${i}`">
                <circle :cx="p.x" :cy="p.y" :r="r * 1.2" fill="#0ea5e9" stroke="white" stroke-width="2" vector-effect="non-scaling-stroke" class="cursor-move" @pointerdown="startDrag($event, active.quad, i)" @click.stop @contextmenu.prevent="removePoint(active.quad, i)" />
                <text :x="p.x + r * 1.8" :y="p.y - r * 1.8" fill="white" stroke="black" stroke-width="3" paint-order="stroke" :font-size="r * 2.6" class="pointer-events-none font-semibold">{{ QUAD_LABELS[i] }}</text>
              </g>
            </g>
            <!-- Warp grid -->
            <g v-if="mode === 'warp' && active.warp">
              <circle
                v-for="(p, i) in active.warp.points"
                :key="`w${i}`"
                :cx="p.x"
                :cy="p.y"
                :r="r * 0.8"
                fill="#0ea5e9"
                stroke="white"
                stroke-width="1.5"
                vector-effect="non-scaling-stroke"
                class="cursor-move"
                @pointerdown="startDrag($event, active.warp.points, i, true)"
                @click.stop
              />
            </g>
          </template>
        </svg>
      </div>
      <p v-if="image.url" class="rounded-xl bg-background p-3 text-sm text-muted-foreground ring-1 ring-border">
        <strong class="text-foreground">{{ MODES.find((m) => m.id === mode)?.label }}:</strong>
        {{ MODES.find((m) => m.id === mode)?.hint }} Drag points to adjust · right-click to delete.
      </p>
    </section>

    <aside v-if="image.url" class="flex flex-col gap-4 rounded-2xl border border-border bg-background p-4">
      <div class="grid grid-cols-2 gap-2">
        <label class="text-xs font-medium">Room id<Input v-model="meta.id" class="mt-1 h-8" /></label>
        <label class="text-xs font-medium">Name<Input v-model="meta.name" class="mt-1 h-8" /></label>
      </div>

      <div>
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-sm font-semibold">Surfaces</h3>
          <Button size="sm" variant="outline" @click="addSurface"><Plus /> Add</Button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <Button v-for="(s, i) in surfaces" :key="i" size="sm" :variant="i === activeIndex ? 'default' : 'secondary'" @click="activeIndex = i">{{ s.label }}</Button>
        </div>
      </div>

      <div v-if="active" class="space-y-3 rounded-xl border border-border p-3">
        <div class="flex flex-wrap gap-1.5">
          <Button v-if="mode === 'mask' || mode === 'cutout'" size="sm" variant="secondary" @click="newRing">
            <Plus /> New {{ mode === 'cutout' ? 'cut-out' : 'region' }}
          </Button>
          <Button size="sm" variant="ghost" :disabled="!active.polygons.flat().length" @click="planeFromMask">Plane from mask</Button>
          <Button size="sm" variant="ghost" :disabled="active.quad.length !== 4" @click="makeWarp()"><Grid3x3 /> {{ active.warp ? 'Reset warp' : 'Warp grid' }}</Button>
          <Button v-if="active.warp" size="sm" variant="ghost" @click="active.warp = null; mode = 'plane'">Remove warp</Button>
        </div>
        <label v-if="mode === 'warp'" class="flex items-center gap-2 text-xs"><input v-model="falloff" type="checkbox" /> Soft drag (neighbours follow)</label>
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs font-medium">Id<Input v-model="active.id" class="mt-1 h-8" /></label>
          <label class="text-xs font-medium">Label<Input v-model="active.label" class="mt-1 h-8" /></label>
          <label class="text-xs font-medium">Plane width (cm)<Input v-model.number="active.widthCm" type="number" class="mt-1 h-8" /></label>
          <label class="text-xs font-medium">Plane height (cm)<Input v-model.number="active.heightCm" type="number" class="mt-1 h-8" /></label>
          <label class="col-span-2 text-xs font-medium">Group (e.g. walls)<Input v-model="active.group" class="mt-1 h-8" /></label>
        </div>
        <fieldset>
          <legend class="mb-1 text-xs font-medium">Accepts</legend>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="c in categories"
              :key="c.id"
              type="button"
              :class="cn('rounded-full border px-2.5 py-0.5 text-xs font-medium', active.accepts.includes(c.id) ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-accent')"
              @click="toggleAccept(active, c.id)"
            >
              {{ c.name }}
            </button>
          </div>
        </fieldset>
        <Button size="sm" variant="ghost" class="text-destructive" @click="removeSurface(activeIndex)"><Trash2 /> Delete surface</Button>
      </div>

      <ul v-if="issues.length" class="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
        <li v-for="m in issues" :key="m">{{ m }}</li>
      </ul>

      <div class="flex gap-2">
        <Button size="sm" class="flex-1" :disabled="!room.surfaces.length" @click="emit('preview', room)"><Eye /> Preview</Button>
        <Button size="sm" variant="outline" class="flex-1" @click="downloadJson"><Download /> Export JSON</Button>
      </div>
      <textarea readonly class="h-40 w-full rounded-lg border border-input bg-muted p-2 font-mono text-[11px]" :value="json" />
    </aside>
  </div>
</template>
