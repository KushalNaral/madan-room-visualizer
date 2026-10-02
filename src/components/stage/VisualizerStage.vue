<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { Loader2 } from 'lucide-vue-next'
import { RoomRenderer, type SurfaceInfo } from '../../render/RoomRenderer'
import type { Point, Surface } from '../../types'
import { useVisualizer } from '../context'
import Hotspots from './Hotspots.vue'

const ctx = useVisualizer()
const { state, renderer, surfaceInfo, roomReady, ui } = ctx
const { room, applied, selectedSurfaceId, previewSurfaceId } = state

const container = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const fade = ref<HTMLCanvasElement>()
const error = ref<string | null>(null)
const hovered = shallowRef<Surface | null>(null)
const pointer = ref<{ x: number; y: number } | null>(null)
const split = ref(50)
const pan = ref({ x: 0, y: 0 })
const dragging = ref(false)

const { width: cw, height: ch } = useElementSize(container)

/** Fit the room image inside the stage with a small margin. */
const fit = computed(() => {
  const r = room.value
  if (!r || !cw.value || !ch.value) return { w: 0, h: 0, dy: 0 }
  const margin = cw.value < 640 ? 12 : 28
  // Keep the floating toolbar clear of the image.
  const top = 64
  const s = Math.min((cw.value - margin * 2) / r.width, (ch.value - margin - top) / r.height)
  return { w: Math.max(0, r.width * s), h: Math.max(0, r.height * s), dy: (top - margin) / 2 }
})

/** Pins shrink a little on small stages. */
const pinScale = computed(() => Math.max(0.55, Math.min(1, fit.value.w / 820)))

const hoverApplied = computed(() => (hovered.value ? state.appliedBySurface.value.get(hovered.value.id) : undefined))

// ---- Renderer lifecycle

onMounted(() => {
  try {
    renderer.value = new RoomRenderer(canvas.value!)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})
onBeforeUnmount(() => renderer.value?.dispose())

let syncing: Promise<void> = Promise.resolve()

async function syncMaterials(animate: boolean) {
  const r = renderer.value
  if (!r || r.currentRoom !== room.value || !roomReady.value) return
  if (animate && fade.value && canvas.value) {
    const f = fade.value
    f.width = canvas.value.width
    f.height = canvas.value.height
    f.getContext('2d')!.drawImage(canvas.value, 0, 0)
    f.style.transition = 'none'
    f.style.opacity = '1'
  }
  const wanted = new Map(applied.value.map((a) => [a.surface.id, a]))
  await Promise.all(
    room.value!.surfaces.map((s) => {
      const a = wanted.get(s.id)
      return r.setMaterial(s.id, a?.variant ?? null, a?.selection)
    }),
  )
  r.render()
  if (animate && fade.value) {
    requestAnimationFrame(() => {
      fade.value!.style.transition = 'opacity 320ms ease'
      fade.value!.style.opacity = '0'
    })
  }
}

watch(
  [renderer, room],
  async ([r, rm]) => {
    if (!r || !rm) return
    roomReady.value = false
    error.value = null
    ui.zoom.value = 1
    pan.value = { x: 0, y: 0 }
    try {
      await r.setRoom(rm)
      if (r.currentRoom !== rm) return
      surfaceInfo.value = new Map(r.allSurfaceInfo().map((i) => [i.surface.id, i]))
      roomReady.value = true
      syncing = syncMaterials(false)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  },
  { immediate: true },
)

watch(applied, () => {
  // Serialise updates so quick clicks don't interleave snapshots.
  syncing = syncing.then(() => syncMaterials(true))
})

watch([hovered, previewSurfaceId, selectedSurfaceId, () => ui.compare.value], () => {
  const r = renderer.value
  if (!r) return
  r.hoverId = ui.compare.value ? null : (previewSurfaceId.value ?? hovered.value?.id ?? null)
  r.selectedId = ui.compare.value ? null : selectedSurfaceId.value
  r.invalidate()
})

watch([fit, () => ui.zoom.value], () => {
  const r = renderer.value
  if (!r || !room.value || !fit.value.w) return
  r.outlinePx = (2.5 * room.value.width) / (fit.value.w * ui.zoom.value)
  r.invalidate()
})

watch(
  () => ui.zoom.value,
  (z) => {
    if (z <= 1) pan.value = { x: 0, y: 0 }
    else clampPan()
  },
)

// ---- Pointer interaction

function toImage(clientX: number, clientY: number): Point | null {
  const el = canvas.value
  if (!room.value || !el) return null
  const rect = el.getBoundingClientRect()
  return {
    x: ((clientX - rect.left) / rect.width) * room.value.width,
    y: ((clientY - rect.top) / rect.height) * room.value.height,
  }
}

function clampPan() {
  const z = ui.zoom.value
  const mx = (fit.value.w * (z - 1)) / 2 + 40
  const my = (fit.value.h * (z - 1)) / 2 + 40
  pan.value = { x: Math.max(-mx, Math.min(mx, pan.value.x)), y: Math.max(-my, Math.min(my, pan.value.y)) }
}

function zoomAt(factor: number, clientX?: number, clientY?: number) {
  const prev = ui.zoom.value
  const next = Math.min(4, Math.max(1, prev * factor))
  if (next === prev) return
  if (clientX !== undefined && clientY !== undefined && container.value) {
    const rect = container.value.getBoundingClientRect()
    const cx = clientX - rect.left - rect.width / 2
    const cy = clientY - rect.top - rect.height / 2
    // Keep the point under the cursor fixed.
    pan.value = {
      x: cx - ((cx - pan.value.x) * next) / prev,
      y: cy - ((cy - pan.value.y) * next) / prev,
    }
  } else {
    pan.value = { x: (pan.value.x * next) / prev, y: (pan.value.y * next) / prev }
  }
  ui.zoom.value = next
  clampPan()
}

const pointers = new Map<number, { x: number; y: number }>()
let downAt: { x: number; y: number; panX: number; panY: number } | null = null
let pinchStart: { dist: number; zoom: number } | null = null
let moved = false

function onPointerDown(e: PointerEvent) {
  if (ui.compare.value) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  moved = false
  if (pointers.size === 1) downAt = { x: e.clientX, y: e.clientY, panX: pan.value.x, panY: pan.value.y }
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]
    pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: ui.zoom.value }
  }
}

function onPointerMove(e: PointerEvent) {
  if (ui.compare.value) return
  const rect = container.value!.getBoundingClientRect()
  pointer.value = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const target = Math.min(4, Math.max(1, (pinchStart.zoom * dist) / pinchStart.dist))
    zoomAt(target / ui.zoom.value, (a.x + b.x) / 2, (a.y + b.y) / 2)
    moved = true
    return
  }
  if (downAt && pointers.size === 1) {
    const dx = e.clientX - downAt.x, dy = e.clientY - downAt.y
    if (!moved && Math.hypot(dx, dy) > 5) moved = true
    if (moved && ui.zoom.value > 1) {
      dragging.value = true
      pan.value = { x: downAt.panX + dx, y: downAt.panY + dy }
      clampPan()
      hovered.value = null
      return
    }
  }
  const p = toImage(e.clientX, e.clientY)
  const hit = p ? renderer.value?.hitTest(p) ?? null : null
  if (hit?.id !== hovered.value?.id) hovered.value = hit
}

function onPointerUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinchStart = null
  if (pointers.size === 0) {
    if (!moved && !ui.compare.value) {
      const p = toImage(e.clientX, e.clientY)
      const hit = p ? renderer.value?.hitTest(p) : undefined
      selectedSurfaceId.value = hit?.id ?? null
      if (hit) {
        ui.tab.value = 'materials'
        ui.detailProductId.value = null
      }
    }
    downAt = null
    dragging.value = false
  }
}

function onLeave() {
  hovered.value = null
  pointer.value = null
}

function onWheel(e: WheelEvent) {
  if (!(e.ctrlKey || e.metaKey) && ui.zoom.value === 1) return
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY)
  else {
    pan.value = { x: pan.value.x - e.deltaX, y: pan.value.y - e.deltaY }
    clampPan()
  }
}

function onDblClick(e: MouseEvent) {
  if (ui.compare.value) return
  if (ui.zoom.value > 1.05) ctx.actions.resetView()
  else zoomAt(2.2, e.clientX, e.clientY)
}

function onSplitDrag(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  const move = (ev: PointerEvent) => {
    const rect = canvas.value!.getBoundingClientRect()
    split.value = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100))
  }
  move(e)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true })
}

function infoFor(id: string): SurfaceInfo | undefined {
  return surfaceInfo.value.get(id)
}
defineExpose({ zoomAt, infoFor })
</script>

<template>
  <div
    ref="container"
    class="relative h-full w-full select-none overflow-hidden"
    @wheel="onWheel"
  >
    <!-- Room frame -->
    <div
      class="absolute left-1/2 top-1/2 will-change-transform"
      :class="dragging ? '' : 'transition-transform duration-200 ease-out'"
      :style="{
        width: `${fit.w}px`,
        height: `${fit.h}px`,
        transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y + fit.dy}px)) scale(${ui.zoom.value})`,
      }"
    >
      <div class="absolute inset-0 overflow-hidden rounded-xl bg-muted shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
        <canvas
          ref="canvas"
          class="absolute inset-0 h-full w-full transition-opacity duration-500"
          :class="[
            roomReady ? 'opacity-100' : 'opacity-0',
            ui.compare.value ? '' : dragging ? 'cursor-grabbing' : hovered ? 'cursor-pointer' : ui.zoom.value > 1 ? 'cursor-grab' : 'cursor-default',
          ]"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @pointerleave="onLeave"
          @dblclick="onDblClick"
        />
        <canvas ref="fade" class="pointer-events-none absolute inset-0 h-full w-full opacity-0" />

        <!-- Before/after: original photo revealed left of the handle -->
        <template v-if="room && ui.compare.value">
          <img
            :src="room.imageUrl"
            alt="Original room"
            class="pointer-events-none absolute inset-0 h-full w-full"
            :style="{ clipPath: `inset(0 ${100 - split}% 0 0)` }"
            draggable="false"
          />
          <div
            class="absolute inset-y-0 z-10 flex w-10 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center"
            :style="{ left: `${split}%` }"
            @pointerdown="onSplitDrag"
          >
            <div class="h-full w-0.5 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.35)]" />
            <div class="absolute flex h-9 w-9 items-center justify-center rounded-full bg-white text-neutral-700 shadow-lg ring-1 ring-black/10">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18-6-6 6-6M15 6l6 6-6 6" /></svg>
            </div>
          </div>
          <span class="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur">Before</span>
          <span class="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur">After</span>
        </template>

        <!-- Loading -->
        <Transition leave-active-class="transition-opacity duration-500" leave-to-class="opacity-0">
          <div v-if="!roomReady && !error" class="absolute inset-0 overflow-hidden">
            <img v-if="room?.thumbnailUrl" :src="room.thumbnailUrl" alt="" class="absolute inset-0 h-full w-full scale-105 object-cover blur-xl" />
            <div class="absolute inset-0 bg-background/30" />
            <div class="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="flex items-center gap-2 rounded-full bg-background/85 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur">
                <Loader2 class="h-4 w-4 animate-spin text-primary" /> Preparing room…
              </div>
            </div>
          </div>
        </Transition>
        <div v-if="error" class="absolute inset-0 flex items-center justify-center bg-muted p-6 text-center text-sm text-destructive">
          {{ error }}
        </div>
      </div>

      <Hotspots v-if="roomReady && ui.hotspots.value && !ui.compare.value"   :zoom="ui.zoom.value / pinScale" @hover="(s) => (hovered = s)" />
    </div>

    <!-- Hover label -->
    <Transition enter-from-class="opacity-0 translate-y-1" enter-active-class="transition duration-150" leave-active-class="transition duration-100" leave-to-class="opacity-0">
      <div
        v-if="hovered && pointer && !ui.compare.value && !dragging"
        class="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap rounded-lg bg-foreground/90 px-2.5 py-1.5 text-xs text-background shadow-lg backdrop-blur"
        :style="{ left: `${pointer.x}px`, top: `${pointer.y}px` }"
      >
        <span class="font-semibold">{{ hovered.label }}</span>
        <span v-if="hoverApplied" class="opacity-75"> · {{ hoverApplied.product.name }} — {{ hoverApplied.variant.name }}</span>
        <span v-else class="opacity-75"> · click to style</span>
      </div>
    </Transition>

    <slot />
  </div>
</template>
