<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useEventListener, useResizeObserver } from '@vueuse/core'
import type { Point, Quad } from '../types'
import { apply as applyHomography, squareToQuad } from '../render/homography'
import { cn } from '../lib/utils'
import type { EditorState, DraftSurface } from './useEditorState'
import type { MaskTools, Tool } from './useMaskTools'

/**
 * The photo with every surface's mask, the active surface's plane grid and handles, and the
 * editing tools. Coordinates are photo pixels throughout (the SVG viewBox is the photo).
 * Zoom: Ctrl/⌘ + scroll or pinch; pan: Space + drag, middle-drag or the hand tool.
 */
const props = defineProps<{ state: EditorState; tools: MaskTools; tool: Tool; brush: number; softWarp: boolean }>()
const emit = defineEmits<{ selectSurface: [uid: string] }>()

const { state, tools } = props
const doc = state.doc

const viewport = ref<HTMLDivElement>()
const svg = ref<SVGSVGElement>()
const rasterCanvas = ref<HTMLCanvasElement>()
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const fit = ref({ w: 0, h: 0 })
const spaceDown = ref(false)
const hover = ref<Point | null>(null)

const active = computed(() => state.active.value)
const handleR = computed(() => Math.max(doc.image.width, doc.image.height) / 160 / zoom.value)
const showRaster = computed(() => ['magic', 'brush', 'eraser', 'pen'].includes(props.tool) && !!active.value && !doc.idMapUrl)

// ---- Layout: fit the photo in the viewport.
function layout() {
  const el = viewport.value
  if (!el || !doc.image.width) return
  const vw = el.clientWidth, vh = el.clientHeight
  const s = Math.min(vw / doc.image.width, vh / doc.image.height)
  fit.value = { w: doc.image.width * s, h: doc.image.height * s }
}
useResizeObserver(viewport, layout)
watch(() => [doc.image.width, doc.image.height], () => {
  layout()
  resetView()
})

function resetView() {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
}
defineExpose({ resetView, zoomBy: (f: number) => zoomAt(f) })

function zoomAt(factor: number, clientX?: number, clientY?: number) {
  const el = viewport.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const cx = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2
  const cy = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2
  const next = Math.min(12, Math.max(1, zoom.value * factor))
  const k = next / zoom.value
  pan.value = next === 1 ? { x: 0, y: 0 } : { x: cx - (cx - pan.value.x) * k, y: cy - (cy - pan.value.y) * k }
  zoom.value = next
}

function onWheel(e: WheelEvent) {
  if (!(e.ctrlKey || e.metaKey)) {
    if (zoom.value > 1) {
      e.preventDefault()
      pan.value = { x: pan.value.x - e.deltaX, y: pan.value.y - e.deltaY }
    }
    return
  }
  e.preventDefault()
  zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY)
}

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) {
    spaceDown.value = true
    e.preventDefault()
  }
})
useEventListener(window, 'keyup', (e: KeyboardEvent) => e.code === 'Space' && (spaceDown.value = false))

// ---- Pointer helpers
function toImage(e: { clientX: number; clientY: number }): Point {
  const rect = svg.value!.getBoundingClientRect()
  return {
    x: Math.round(((e.clientX - rect.left) / rect.width) * doc.image.width * 10) / 10,
    y: Math.round(((e.clientY - rect.top) / rect.height) * doc.image.height * 10) / 10,
  }
}

let panning: { x: number; y: number; px: number; py: number } | null = null
let painting = false

function onPointerDown(e: PointerEvent) {
  if (!doc.image.url) return
  const target = e.currentTarget as Element
  if (e.button === 1 || spaceDown.value || props.tool === 'hand') {
    panning = { x: e.clientX, y: e.clientY, px: pan.value.x, py: pan.value.y }
    target.setPointerCapture(e.pointerId)
    return
  }
  const s = active.value
  if (!s || e.button > 2) return
  const p = toImage(e)
  if (props.tool === 'brush' || props.tool === 'eraser') {
    if (e.button !== 0) return
    painting = true
    target.setPointerCapture(e.pointerId)
    tools.strokeStart(p, props.brush, props.tool === 'brush' ? 1 : 0)
  } else if (props.tool === 'magic') {
    tools.magicClick(p, e.button === 0 && !e.altKey, e.shiftKey)
  } else if (props.tool === 'pen' && e.button === 0) {
    const first = tools.pen.value[0]
    if (first && tools.pen.value.length >= 3 && Math.hypot(first.x - p.x, first.y - p.y) < handleR.value * 2) tools.penClose(e.altKey)
    else tools.penAdd(p)
  } else if (props.tool === 'plane' && e.button === 0 && s.quad.length < 4) {
    state.update(s.uid, { quad: [...s.quad, p], warp: null })
  }
}

function onPointerMove(e: PointerEvent) {
  if (panning) {
    pan.value = { x: panning.px + e.clientX - panning.x, y: panning.py + e.clientY - panning.y }
    return
  }
  if (!svg.value) return
  const p = toImage(e)
  hover.value = p
  if (painting) tools.strokeMove(p, props.brush, props.tool === 'brush' ? 1 : 0)
}

function onPointerUp() {
  panning = null
  if (painting) {
    painting = false
    tools.strokeEnd()
  }
}

/** Drags one handle; in a warp grid neighbours follow with a smooth falloff. */
function dragHandle(e: PointerEvent, kind: 'quad' | 'warp', index: number) {
  const s = active.value
  if (!s || e.button !== 0 || spaceDown.value) return
  e.stopPropagation()
  const target = e.currentTarget as Element
  target.setPointerCapture(e.pointerId)
  const start = toImage(e)
  const origin = (kind === 'quad' ? s.quad : s.warp!.points).map((p) => ({ ...p }))
  const key = `${kind}:${s.uid}:${Date.now()}`
  const move = (ev: PointerEvent) => {
    const p = toImage(ev)
    const dx = p.x - start.x, dy = p.y - start.y
    if (kind === 'quad') {
      const quad = origin.map((o, i) => (i === index ? { x: o.x + dx, y: o.y + dy } : o))
      state.update(s.uid, { quad, warp: null }, key)
      return
    }
    const { cols, rows } = s.warp!
    const ci = index % (cols + 1), cj = Math.floor(index / (cols + 1))
    const points = origin.map((o, k) => {
      if (!props.softWarp) return k === index ? { x: o.x + dx, y: o.y + dy } : o
      const d = Math.hypot((k % (cols + 1)) - ci, Math.floor(k / (cols + 1)) - cj)
      const w = Math.exp(-(d * d) / 2.2)
      return { x: Math.round((o.x + dx * w) * 10) / 10, y: Math.round((o.y + dy * w) * 10) / 10 }
    })
    state.update(s.uid, { warp: { cols, rows, points } }, key)
  }
  target.addEventListener('pointermove', move as EventListener)
  target.addEventListener('pointerup', () => target.removeEventListener('pointermove', move as EventListener), { once: true })
}

function removeCorner(i: number) {
  const s = active.value
  if (s) state.update(s.uid, { quad: s.quad.filter((_, k) => k !== i), warp: null })
}

// ---- Drawing
const COLORS = ['#ea580c', '#0284c7', '#16a34a', '#9333ea', '#db2777', '#ca8a04', '#0d9488', '#4f46e5', '#dc2626', '#65a30d']
const colorOf = (i: number) => COLORS[i % COLORS.length]

const ring = (r: Point[]) => 'M' + r.map((p) => `${p.x},${p.y}`).join('L') + 'Z'
const maskPath = (s: DraftSurface) => s.mask.polygons.filter((r) => r.length > 2).map(ring).join(' ')
const cutPath = (s: DraftSurface) => (s.mask.cutouts ?? []).filter((r) => r.length > 2).map(ring).join(' ')

const issue = computed(() => (active.value ? state.statuses.value.get(active.value.uid)?.planeIssue ?? null : null))

/** Grid lines showing how a texture will lie on the active surface. */
const grid = computed<string[]>(() => {
  const s = active.value
  if (!s) return []
  if (s.warp) {
    const { cols, rows, points } = s.warp
    const at = (i: number, j: number) => points[j * (cols + 1) + i]
    const out: string[] = []
    for (let j = 0; j <= rows; j++) out.push('M' + Array.from({ length: cols + 1 }, (_, i) => `${at(i, j).x},${at(i, j).y}`).join('L'))
    for (let i = 0; i <= cols; i++) out.push('M' + Array.from({ length: rows + 1 }, (_, j) => `${at(i, j).x},${at(i, j).y}`).join('L'))
    return out
  }
  if (s.quad.length !== 4) return s.quad.length > 1 ? ['M' + s.quad.map((p) => `${p.x},${p.y}`).join('L')] : []
  let H
  try {
    H = squareToQuad(s.quad as Quad)
  } catch {
    return ['M' + s.quad.map((p) => `${p.x},${p.y}`).join('L') + 'Z']
  }
  const n = Math.max(4, Math.min(16, Math.round(Math.max(s.widthCm, s.heightCm) / 50)))
  const out: string[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = applyHomography(H, { x: t, y: 0 }), b = applyHomography(H, { x: t, y: 1 })
    const c = applyHomography(H, { x: 0, y: t }), d = applyHomography(H, { x: 1, y: t })
    out.push(`M${a.x},${a.y}L${b.x},${b.y}`, `M${c.x},${c.y}L${d.x},${d.y}`)
  }
  return out
})

// The working raster of the active surface, tinted, while a mask tool is on.
let frame = 0
function drawRaster() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const c = rasterCanvas.value, m = tools.raster.value
    if (!c || !m) return
    if (c.width !== m.width || c.height !== m.height) Object.assign(c, { width: m.width, height: m.height })
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(m.width, m.height)
    for (let i = 0; i < m.data.length; i++) {
      if (!m.data[i]) continue
      img.data[i * 4] = 234
      img.data[i * 4 + 1] = 88
      img.data[i * 4 + 2] = 12
      img.data[i * 4 + 3] = 110
    }
    ctx.putImageData(img, 0, 0)
  })
}
watch([() => tools.version.value, showRaster, rasterCanvas], drawRaster)
onBeforeUnmount(() => cancelAnimationFrame(frame))

const LABELS = ['TL', 'TR', 'BR', 'BL']
const cursor = computed(() => {
  if (spaceDown.value || props.tool === 'hand') return 'cursor-grab'
  if (props.tool === 'brush' || props.tool === 'eraser') return 'cursor-none'
  return 'cursor-crosshair'
})
</script>

<template>
  <div
    ref="viewport"
    class="relative h-full w-full touch-none select-none overflow-hidden rounded-2xl bg-[repeating-conic-gradient(hsl(var(--muted))_0_25%,hsl(var(--background))_0_50%)] bg-[length:24px_24px]"
    @wheel="onWheel"
  >
    <div
      v-if="doc.image.url"
      class="absolute left-1/2 top-1/2"
      :style="{
        width: `${fit.w}px`,
        height: `${fit.h}px`,
        transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
      }"
    >
      <img :src="doc.image.url" alt="Room photo" class="absolute inset-0 h-full w-full shadow-lg" draggable="false" />
      <img v-if="doc.idMapUrl" :src="doc.idMapUrl" alt="" class="pointer-events-none absolute inset-0 h-full w-full opacity-40 mix-blend-multiply" draggable="false" />
      <canvas v-show="showRaster" ref="rasterCanvas" class="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]" />
      <svg
        ref="svg"
        :class="cn('absolute inset-0 h-full w-full overflow-visible', cursor)"
        :viewBox="`0 0 ${doc.image.width} ${doc.image.height}`"
        preserveAspectRatio="none"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="hover = null"
        @contextmenu.prevent
      >
        <!-- Every surface's mask; click one to select it with the plane/warp tools. -->
        <g v-for="(s, i) in doc.surfaces" :key="s.uid">
          <path
            v-if="!(showRaster && s.uid === active?.uid)"
            :d="maskPath(s)"
            fill-rule="evenodd"
            :fill="colorOf(i)"
            :fill-opacity="s.uid === active?.uid ? 0.32 : 0.14"
            :stroke="colorOf(i)"
            :stroke-opacity="s.uid === active?.uid ? 1 : 0.6"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
            :class="tool === 'plane' || tool === 'warp' ? 'cursor-pointer' : 'pointer-events-none'"
            @pointerdown.stop="emit('selectSurface', s.uid)"
          />
          <path v-if="cutPath(s)" :d="cutPath(s)" fill="#000" fill-opacity="0.35" stroke="#e11d48" stroke-dasharray="4 3" stroke-width="1" vector-effect="non-scaling-stroke" class="pointer-events-none" />
        </g>

        <template v-if="active">
          <path
            v-for="(d, i) in grid"
            :key="`g${i}`"
            :d="d"
            :stroke="issue ? '#f59e0b' : '#0ea5e9'"
            stroke-opacity="0.85"
            fill="none"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
            class="pointer-events-none"
          />

          <!-- Plane corners -->
          <g v-if="tool === 'plane'">
            <g v-for="(p, i) in active.quad" :key="`q${i}`">
              <circle
                :cx="p.x"
                :cy="p.y"
                :r="handleR * 1.25"
                :fill="issue ? '#f59e0b' : '#0ea5e9'"
                stroke="white"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
                class="cursor-move"
                @pointerdown="dragHandle($event, 'quad', i)"
                @contextmenu.prevent.stop="removeCorner(i)"
              />
              <text
                :x="p.x + handleR * 1.8"
                :y="p.y - handleR * 1.8"
                fill="white"
                stroke="black"
                stroke-width="3"
                paint-order="stroke"
                :font-size="handleR * 2.6"
                class="pointer-events-none font-semibold"
              >{{ LABELS[i] }}</text>
            </g>
          </g>

          <!-- Warp grid -->
          <g v-if="tool === 'warp' && active.warp">
            <circle
              v-for="(p, i) in active.warp.points"
              :key="`w${i}`"
              :cx="p.x"
              :cy="p.y"
              :r="handleR * 0.8"
              fill="#0ea5e9"
              stroke="white"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
              class="cursor-move"
              @pointerdown="dragHandle($event, 'warp', i)"
            />
          </g>

          <!-- Pen ring in progress -->
          <g v-if="tool === 'pen' && tools.pen.value.length">
            <path
              :d="'M' + tools.pen.value.map((p) => `${p.x},${p.y}`).join('L') + (hover ? `L${hover.x},${hover.y}` : '')"
              fill="none"
              stroke="#ea580c"
              stroke-width="1.5"
              stroke-dasharray="5 3"
              vector-effect="non-scaling-stroke"
              class="pointer-events-none"
            />
            <circle
              v-for="(p, i) in tools.pen.value"
              :key="`p${i}`"
              :cx="p.x"
              :cy="p.y"
              :r="i === 0 ? handleR * 1.2 : handleR * 0.8"
              :fill="i === 0 ? '#fff' : '#ea580c'"
              stroke="#ea580c"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
              class="pointer-events-none"
            />
          </g>

          <!-- Magic select prompts -->
          <g v-if="tool === 'magic' && tools.magic.value">
            <g v-for="(p, i) in tools.magic.value.prompts" :key="`m${i}`" class="pointer-events-none">
              <circle
                :cx="p.x * doc.image.width"
                :cy="p.y * doc.image.height"
                :r="handleR"
                :fill="p.positive ? '#16a34a' : '#dc2626'"
                stroke="white"
                stroke-width="2"
                vector-effect="non-scaling-stroke"
              />
              <text
                :x="p.x * doc.image.width"
                :y="p.y * doc.image.height + handleR * 0.55"
                text-anchor="middle"
                fill="white"
                :font-size="handleR * 1.6"
                class="font-bold"
              >{{ p.positive ? '+' : '−' }}</text>
            </g>
          </g>

          <!-- Brush outline -->
          <circle
            v-if="hover && (tool === 'brush' || tool === 'eraser')"
            :cx="hover.x"
            :cy="hover.y"
            :r="brush"
            fill="none"
            :stroke="tool === 'brush' ? '#ea580c' : '#e11d48'"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
            class="pointer-events-none"
          />
        </template>
      </svg>
    </div>

    <slot />

    <div v-if="zoom > 1" class="absolute bottom-3 left-3 rounded-md bg-background/90 px-2 py-1 text-xs font-medium tabular-nums shadow">
      {{ Math.round(zoom * 100) }}%
      <button type="button" class="ml-1 underline-offset-2 hover:underline" @click="resetView">Reset</button>
    </div>
  </div>
</template>
