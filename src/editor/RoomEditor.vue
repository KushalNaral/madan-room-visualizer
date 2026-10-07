<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { onKeyStroke, useEventListener } from '@vueuse/core'
import {
  Brush,
  Check,
  Download,
  Eraser,
  Eye,
  Grid3x3,
  Hand,
  Loader2,
  PenTool,
  Redo2,
  Save,
  Sparkles,
  Square,
  Undo2,
  Upload,
  Wand2,
} from 'lucide-vue-next'
import type { Category, Room } from '../types'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Slider } from '../components/ui/slider'
import { TooltipProvider } from '../components/ui/tooltip'
import Tip from '../components/ui/tooltip/Tip.vue'
import { isModelCached, SegmentClient } from './ai/client'
import { SEGFORMERS, type DetectQuality, type ModelName, type WorkerConfig } from './ai/protocol'
import DetectPanel from './DetectPanel.vue'
import EditorCanvas from './EditorCanvas.vue'
import InlinePreview from './InlinePreview.vue'
import SurfaceInspector from './SurfaceInspector.vue'
import SurfaceList from './SurfaceList.vue'
import { fitScale, loadImage, masksFromIdMap, rasterOf } from './lib/image'
import { rasterize } from './lib/mask'
import { fitPlane } from './lib/planeFit'
import { suggestAccepts, type InheritedCategories, type PresetKind } from './lib/presets'
import { fitWarp } from './lib/warpFit'
import { useDetection } from './useDetection'
import { combinedDownload, deviceInfo, overallProgress, pickQuality, saveData } from './lib/readiness'
import { useEditorState, type SurfaceStep } from './useEditorState'
import { useMaskTools, type Tool } from './useMaskTools'

/**
 * Room editor: upload a photo, detect or select its surfaces, fit each one's plane, say what it
 * offers, preview and save. Produces the visualizer's `Room` JSON.
 */
const props = withDefaults(
  defineProps<{
    /** Room to edit; omit to start from a photo. */
    room?: Room | null
    /** Categories surfaces can offer (the host's catalogue). */
    categories?: Category[]
    /** Preset kind → category ids, instead of matching category names. */
    presetCategories?: Partial<Record<PresetKind, string[]>>
    /**
     * Categories every surface of a kind offers (the host's settings, applied on top of each
     * surface's own). Shown locked on surfaces; new surfaces then start without extra picks.
     */
    inheritedCategories?: InheritedCategories
    /** Creates the segmentation worker (auto-detect and magic select). Without it those tools are off. */
    createWorker?: () => Worker
    workerConfig?: WorkerConfig
    /** localStorage key for autosave; false turns it off. */
    autosaveKey?: string | false
    saving?: boolean
    saveLabel?: string
    /** 'shopper' hides staff-only parts (ids, groups, room JSON, preview with products). */
    audience?: 'staff' | 'shopper'
    /** Photos larger than this (long side, px) are scaled down on upload; 0 keeps them as they are. */
    maxPhotoSide?: number
    /** Force a detection model; by default it's picked from the device (GPU, memory, data saver). */
    detectQuality?: DetectQuality
    /** Run "Detect surfaces" as soon as a new photo is opened; 'auto' does unless the browser asks to save data. */
    autoDetect?: boolean | 'auto'
  }>(),
  { room: null, categories: () => [], autosaveKey: 'madan-room-editor', saving: false, saveLabel: 'Save room', audience: 'staff', maxPhotoSide: 0, autoDetect: 'auto' },
)
const emit = defineEmits<{
  save: [room: Room, files: { image?: File }]
  preview: [room: Room]
  dirty: [dirty: boolean]
}>()

const state = useEditorState({ autosaveKey: props.autosaveKey, inherited: () => props.inheritedCategories })

/** What a new surface of a kind offers by itself: nothing when the kind inherits categories. */
function defaultAccepts(kind: PresetKind): string[] {
  if (props.inheritedCategories?.[kind]?.length) return []
  return suggestAccepts(kind, props.categories, props.presetCategories)
}

type Step = 'photo' | 'detect' | 'refine' | 'preview'
const step = ref<Step>('photo')
// Magic select needs one image embedding per photo.
const embeddedFor = ref<string | null>(null)
const embedding = ref(false)
const embedError = ref<string | null>(null)

// ---- Segmentation worker (lazy: created on first use)
let client: SegmentClient | null = null
/** Latest download percent per model (both load at once). */
const downloads = ref<Partial<Record<ModelName, number>>>({})
function getClient(): SegmentClient | null {
  if (!props.createWorker) return null
  if (!client) {
    client = new SegmentClient(props.createWorker, props.workerConfig)
    client.onProgress = (model, percent) => {
      downloads.value = { ...downloads.value, [model]: percent }
    }
  }
  return client
}
onBeforeUnmount(() => client?.dispose())

const tools = useMaskTools(state, getClient, () => ensureEmbedding())
const detection = useDetection(state, tools, getClient, () => ensureEmbedding())

// ---- Detection model: picked for this device and loaded in the background, so it's ready by
// the time a photo is chosen. Nobody has to choose a model or wait on a separate download.
const quality = ref<DetectQuality>(props.detectQuality ?? 'fast')
const qualityReady: Promise<DetectQuality> = props.detectQuality
  ? Promise.resolve(props.detectQuality)
  : deviceInfo(props.audience === 'shopper' ? 'shopper' : 'staff').then(pickQuality).catch(() => 'fast' as const)
const firstRun = ref(false)
const download = computed(() => combinedDownload(downloads.value, quality.value, true))
// Before any model has reported, "getting ready" starts the bar at 0 rather than done.
const overall = computed(() => overallProgress(detection.phase.value, Object.keys(downloads.value).length ? download.value : 0, detection.step.value))

onMounted(() => {
  if (!props.createWorker) return
  void qualityReady.then(async (q) => {
    quality.value = q
    firstRun.value = !(await isModelCached(SEGFORMERS[q].id))
    // Data saver: nothing loads until someone asks for it.
    if (saveData()) return
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const start = () => void getClient()?.warm(q).catch(() => {
      /* detect retries the load and reports the error then */
    })
    if (idle) idle(start, { timeout: 2000 })
    else setTimeout(start, 500)
  })
})

async function runDetection(img: HTMLImageElement) {
  quality.value = await qualityReady
  await detection.detect(img, quality.value)
  firstRun.value = false
}

// ---- Photo
const photo = shallowRef<HTMLImageElement | null>(null)
const imageFile = shallowRef<File | null>(null)
const photoError = ref<string | null>(null)
watch(
  () => state.doc.image.url,
  async (url) => {
    photo.value = null
    embeddedFor.value = null
    if (!url) return
    try {
      photo.value = await loadImage(url)
    } catch (e) {
      photoError.value = e instanceof Error ? e.message : String(e)
    }
  },
  { immediate: true },
)

/** Scales a large photo down (phone photos are often 12 MP) and re-encodes it as JPEG. */
async function shrink(file: File, img: HTMLImageElement): Promise<{ file: File; width: number; height: number }> {
  const max = props.maxPhotoSide
  const s = max ? fitScale(img.naturalWidth, img.naturalHeight, max) : 1
  if (s >= 1) return { file, width: img.naturalWidth, height: img.naturalHeight }
  const c = document.createElement('canvas')
  c.width = Math.round(img.naturalWidth * s)
  c.height = Math.round(img.naturalHeight * s)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.88))
  if (!blob) return { file, width: img.naturalWidth, height: img.naturalHeight }
  return { file: new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }), width: c.width, height: c.height }
}

function openFile(file: File | undefined | null) {
  if (!file || !file.type.startsWith('image/')) return
  const original = URL.createObjectURL(file)
  const img = new Image()
  img.onload = async () => {
    const out = await shrink(file, img)
    const url = out.file === file ? original : URL.createObjectURL(out.file)
    if (url !== original) URL.revokeObjectURL(original)
    imageFile.value = out.file
    state.setImage(url, out.width, out.height, file.name.replace(/\.[^.]+$/, ''))
    photoError.value = null
    step.value = 'detect'
    autoDetectPending = (props.autoDetect === 'auto' ? !saveData() : props.autoDetect) && !!props.createWorker
  }
  img.onerror = () => (photoError.value = 'That file is not an image the browser can read.')
  img.src = original
}
const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)
function onDrop(e: DragEvent) {
  dragging.value = false
  openFile(e.dataTransfer?.files?.[0])
}

// A new photo starts detecting as soon as it has loaded.
let autoDetectPending = false
watch(photo, (img) => {
  if (!img || !autoDetectPending) return
  autoDetectPending = false
  if (!detection.running.value) void runDetection(img)
})

// ---- Loading the room to edit
watch(
  () => props.room,
  (r) => {
    if (r) state.loadRoom(r)
    imageFile.value = null
    step.value = r?.surfaces.length ? 'refine' : r?.imageUrl ? 'detect' : 'photo'
  },
  { immediate: true },
)
watch(state.dirty, (d) => emit('dirty', d))

// ---- Steps and tools
const STEPS: { id: Step; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'detect', label: 'Detect' },
  { id: 'refine', label: 'Refine' },
  { id: 'preview', label: 'Preview & save' },
]
const tool = ref<Tool>(props.createWorker ? 'magic' : 'pen')
const brush = ref(24)
const softWarp = ref(true)
const canvasRef = ref<InstanceType<typeof EditorCanvas>>()

const TOOLS = computed(() => [
  { id: 'magic' as Tool, label: 'Magic select', key: 'M', icon: Wand2, off: !props.createWorker, hint: 'Click a surface to select it. Alt- or right-click to remove a part. Shift-click starts another region.' },
  { id: 'brush' as Tool, label: 'Brush', key: 'B', icon: Brush, hint: 'Paint to add to the area. [ and ] change the size.' },
  { id: 'eraser' as Tool, label: 'Eraser', key: 'E', icon: Eraser, hint: 'Paint to remove from the area (e.g. a lamp in front of the wall).' },
  { id: 'pen' as Tool, label: 'Pen', key: 'P', icon: PenTool, hint: 'Click points around an edge; click the first point or press Enter to close. Alt+Enter cuts it out.' },
  { id: 'plane' as Tool, label: 'Plane', key: 'L', icon: Square, hint: 'Drag the 4 corners to the plane’s corners (they can lie outside the photo). The grid should look like even squares.' },
  { id: 'warp' as Tool, label: 'Warp', key: 'W', icon: Grid3x3, off: !state.active.value?.warp, hint: 'Drag grid points to follow curves (cushions, folds).' },
  { id: 'hand' as Tool, label: 'Pan', key: 'H', icon: Hand, hint: 'Drag to move around. Ctrl/⌘ + scroll zooms.' },
])
const activeTool = computed(() => TOOLS.value.find((t) => t.id === tool.value))
const maskLocked = computed(() => !!state.doc.idMapUrl && ['magic', 'brush', 'eraser', 'pen'].includes(tool.value))

watch(tool, (t, before) => {
  if (before === 'pen' && tools.pen.value.length >= 3) tools.penClose()
  if (t !== 'magic') tools.endMagic()
})
watch(state.activeUid, () => {
  tools.endMagic()
  if (tool.value === 'warp' && !state.active.value?.warp) tool.value = 'plane'
})

// ---- Magic select embedding
let embeddingJob: Promise<boolean> | null = null
async function ensureEmbedding(): Promise<boolean> {
  const c = getClient()
  const img = photo.value
  if (!c || !img) return false
  if (embeddedFor.value === state.doc.image.url) return true
  embeddingJob ??= embed(c, img).finally(() => (embeddingJob = null))
  return embeddingJob
}
async function embed(c: SegmentClient, img: HTMLImageElement): Promise<boolean> {
  embedding.value = true
  embedError.value = null
  try {
    const url = state.doc.image.url
    await c.embed(rasterOf(img, state.doc.image.width, state.doc.image.height, 1024))
    embeddedFor.value = url
    return true
  } catch (e) {
    embedError.value = e instanceof Error ? e.message : String(e)
    return false
  } finally {
    embedding.value = false
  }
}

// ---- Surface actions
function addSurface(kind: PresetKind | 'custom') {
  const accepts = kind === 'custom' ? [] : defaultAccepts(kind)
  state.addSurface(kind, {}, accepts)
  tool.value = props.createWorker ? 'magic' : 'pen'
  step.value = 'refine'
}

function autoPlane(uid = state.activeUid.value) {
  const s = state.doc.surfaces.find((x) => x.uid === uid)
  if (!s) return
  const quad = fitPlane(s.mask.polygons.flat())
  if (quad) state.update(s.uid, { quad, warp: null })
  tool.value = 'plane'
}

function makeWarp() {
  const s = state.active.value
  if (!s || s.quad.length !== 4) return
  const w = tools.size.value
  const mask = rasterize(s.mask, w.w, w.h, tools.scale.value)
  const warp = fitWarp(mask, 8, 6, 1 / tools.scale.value)
  if (warp) state.update(s.uid, { warp })
  tool.value = 'warp'
}

function onNext(uid: string, next: Exclude<SurfaceStep, null>) {
  state.activeUid.value = uid
  step.value = 'refine'
  if (next === 'mask') tool.value = props.createWorker ? 'magic' : 'pen'
  else if (next === 'plane') autoPlane(uid)
  else document.getElementById('surface-accepts')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const detaching = ref(false)
async function detachIdMap() {
  const url = state.doc.idMapUrl
  if (!url) return
  detaching.value = true
  try {
    const colors = state.doc.surfaces.map((s) => s.idColor).filter((c): c is string => !!c)
    state.detachIdMap(await masksFromIdMap(url, colors, state.doc.image.width))
  } finally {
    detaching.value = false
  }
}

function runDetect() {
  if (photo.value) void runDetection(photo.value)
}
function acceptDetected() {
  detection.accept(defaultAccepts)
  step.value = 'refine'
  // Start with the first surface that still needs something.
  const next = state.doc.surfaces.find((s) => {
    const st = state.statuses.value.get(s.uid)
    return st && (!st.mask || !st.plane || !st.accepts)
  })
  if (next) state.activeUid.value = next.uid
}

// ---- Output
const room = computed(() => state.room.value)
const problems = computed(() => {
  const out: string[] = []
  if (!state.doc.image.url) out.push('Upload a photo of the room.')
  if (!state.doc.surfaces.length) out.push('Add at least one surface.')
  for (const s of state.doc.surfaces) {
    const st = state.statuses.value.get(s.uid)!
    if (!st.mask) out.push(`${s.label}: select its area.`)
    else if (!st.plane) out.push(`${s.label}: fit its plane.`)
    else if (!st.accepts) out.push(`${s.label}: choose the products it offers.`)
    if (st.planeIssue) out.push(`${s.label}: the plane corners look wrong.`)
  }
  const ids = state.doc.surfaces.map((s) => s.id)
  if (new Set(ids).size !== ids.length && props.audience === 'staff') out.push('Two surfaces have the same id (Advanced).')
  return out
})
const canSave = computed(() => !!state.doc.image.url && room.value.surfaces.length > 0 && !props.saving)

function save() {
  emit('save', room.value, imageFile.value ? { image: imageFile.value } : {})
}
function downloadJson() {
  const blob = new Blob([JSON.stringify(room.value, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${room.value.id || 'room'}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** The host calls this after it saved, so the autosave is dropped. */
function markSaved() {
  state.clearAutosave()
}
defineExpose({ markSaved, state })

// ---- Keyboard
function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}
const root = ref<HTMLElement>()
onKeyStroke((e) => {
  if (typing(e) || !root.value?.isConnected) return
  const mod = e.metaKey || e.ctrlKey
  const k = e.key.toLowerCase()
  if (mod && k === 'z') {
    e.preventDefault()
    e.shiftKey ? state.redo() : state.undo()
    return
  }
  if (mod && k === 'y') {
    e.preventDefault()
    state.redo()
    return
  }
  if (mod || !state.doc.image.url) return
  const t = TOOLS.value.find((x) => x.key.toLowerCase() === k && !x.off)
  if (t) tool.value = t.id
  else if (k === '[') brush.value = Math.max(2, Math.round(brush.value / 1.25))
  else if (k === ']') brush.value = Math.min(400, Math.round(brush.value * 1.25))
  else if (k === 'enter' && tool.value === 'pen') tools.penClose(e.altKey)
  else if (k === 'escape') {
    if (tools.pen.value.length) tools.pen.value = []
    else tools.endMagic()
  } else if ((k === 'delete' || k === 'backspace') && tool.value === 'pen' && tools.pen.value.length) tools.penUndoPoint()
  else if (k === '0') canvasRef.value?.resetView()
})

// Paste a photo from the clipboard.
useEventListener(window, 'paste', (e: ClipboardEvent) => {
  const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
  if (file && step.value === 'photo') openFile(file)
})

const brushMax = computed(() => Math.round(Math.max(state.doc.image.width, state.doc.image.height) / 8) || 200)
const workingNote = computed(() => {
  const s = fitScale(state.doc.image.width || 1, state.doc.image.height || 1, 1280)
  return s < 1 ? `Areas are edited at ${Math.round(s * 100)}% of the photo; the saved outline is in full photo pixels.` : ''
})
</script>

<template>
  <TooltipProvider>
    <div ref="root" class="room-editor flex h-full min-h-[640px] flex-col gap-3 text-foreground">
      <!-- Steps and actions -->
      <div class="flex flex-wrap items-center gap-2">
        <ol class="flex flex-wrap items-center gap-1 rounded-xl bg-muted p-1 text-sm">
          <li v-for="(s, i) in STEPS" :key="s.id">
            <button
              type="button"
              :disabled="s.id !== 'photo' && !state.doc.image.url"
              :class="cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-40', step === s.id ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground')"
              @click="step = s.id"
            >
              <span :class="cn('flex h-5 w-5 items-center justify-center rounded-full text-[11px]', step === s.id ? 'bg-primary text-primary-foreground' : 'bg-background')">{{ i + 1 }}</span>
              {{ s.label }}
            </button>
          </li>
        </ol>
        <div class="ml-auto flex items-center gap-1">
          <Tip text="Undo (Ctrl+Z)">
            <Button size="icon" variant="ghost" :disabled="!state.canUndo.value" aria-label="Undo" @click="state.undo()"><Undo2 /></Button>
          </Tip>
          <Tip text="Redo (Ctrl+Shift+Z)">
            <Button size="icon" variant="ghost" :disabled="!state.canRedo.value" aria-label="Redo" @click="state.redo()"><Redo2 /></Button>
          </Tip>
          <Button :disabled="!canSave" @click="save">
            <Loader2 v-if="saving" class="animate-spin" /><Save v-else /> {{ saveLabel }}
          </Button>
        </div>
      </div>

      <div v-if="state.restorable.value" class="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
        <span>Unsaved work from {{ new Date(state.restorable.value.savedAt).toLocaleString() }} was found.</span>
        <Button size="sm" variant="secondary" class="ml-auto" @click="state.restoreAutosave()">Restore</Button>
        <Button size="sm" variant="ghost" @click="state.clearAutosave()">Discard</Button>
      </div>

      <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <!-- Photo and tools -->
        <section class="flex min-h-[420px] min-w-0 flex-col gap-2">
          <div v-if="state.doc.image.url" class="flex flex-wrap items-center gap-2">
            <div class="flex rounded-lg bg-muted p-1">
              <Tip v-for="t in TOOLS" :key="t.id" :text="`${t.label} (${t.key})`">
                <button
                  type="button"
                  :disabled="t.off"
                  :aria-pressed="tool === t.id"
                  :aria-label="t.label"
                  :class="cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors disabled:opacity-40', tool === t.id ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground')"
                  @click="tool = t.id"
                >
                  <component :is="t.icon" class="h-4 w-4" />
                  <span class="hidden xl:inline">{{ t.label }}</span>
                </button>
              </Tip>
            </div>
            <label v-if="tool === 'brush' || tool === 'eraser'" class="flex w-48 items-center gap-2 text-xs text-muted-foreground">
              Size
              <Slider :model-value="[brush]" :min="2" :max="brushMax" :step="1" class="flex-1" @update:model-value="(v) => v && (brush = v[0])" />
            </label>
            <label v-if="tool === 'warp'" class="flex items-center gap-1.5 text-xs text-muted-foreground"><input v-model="softWarp" type="checkbox" /> Soft drag</label>
            <Button v-if="tool === 'pen' && tools.pen.value.length >= 3" size="sm" variant="secondary" @click="tools.penClose()">Close shape</Button>
            <span v-if="tool === 'magic' && (embedding || tools.magicBusy.value)" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 class="h-3.5 w-3.5 animate-spin" />
              {{ embedding ? ((downloads.sam ?? 100) < 100 ? `Getting magic select ready… ${downloads.sam}%` : 'Getting the photo ready…') : 'Selecting…' }}
            </span>
          </div>

          <div
            class="relative min-h-0 flex-1"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <EditorCanvas
              v-if="state.doc.image.url"
              ref="canvasRef"
              :state="state"
              :tools="tools"
              :tool="tool"
              :brush="brush"
              :soft-warp="softWarp"
              @select-surface="(uid) => (state.activeUid.value = uid)"
            />
            <button
              v-else
              type="button"
              class="flex h-full min-h-[420px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-background text-center transition-colors hover:bg-accent/40"
              @click="fileInput?.click()"
            >
              <Upload class="h-8 w-8 text-muted-foreground" />
              <span class="font-medium">Drop a room photo here, paste it, or click to choose</span>
              <span class="max-w-sm text-sm text-muted-foreground">A straight-on, evenly lit photo works best. Wide angle is fine.</span>
            </button>
            <div v-if="dragging" class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-primary bg-primary/10 text-sm font-medium">Drop to use this photo</div>
          </div>

          <p v-if="state.doc.image.url" class="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <template v-if="maskLocked">This room’s areas come from a rendered surface map. Use <strong>Make masks editable</strong> (Advanced) to change them.</template>
            <template v-else-if="!state.active.value && tool !== 'hand'">Pick a surface on the right, or add one, to start.</template>
            <template v-else><strong class="text-foreground">{{ activeTool?.label }}:</strong> {{ activeTool?.hint }}</template>
            <span v-if="tools.magicError.value || embedError" class="block text-destructive">{{ tools.magicError.value || embedError }}</span>
          </p>
          <p v-if="photoError" class="text-sm text-destructive" role="alert">{{ photoError }}</p>
        </section>

        <!-- Side panel -->
        <aside class="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-background p-4">
          <template v-if="step === 'photo'">
            <div class="space-y-2">
              <h3 class="text-sm font-semibold">1. The photo</h3>
              <p class="text-sm text-muted-foreground">Use a photo of a real room, at least 1600 px wide. Everything you draw is in this photo’s pixels.</p>
              <Button class="w-full" variant="secondary" @click="fileInput?.click()"><Upload /> {{ state.doc.image.url ? 'Replace photo' : 'Choose photo' }}</Button>
              <p v-if="state.doc.image.url" class="text-xs text-muted-foreground">{{ state.doc.image.width }} × {{ state.doc.image.height }} px. A photo of a different size clears the surfaces.</p>
            </div>
            <Button v-if="state.doc.image.url" class="w-full" @click="step = 'detect'">Next: detect surfaces →</Button>
          </template>

          <template v-else-if="step === 'detect'">
            <DetectPanel
              :candidates="detection.candidates.value"
              :running="detection.running.value"
              :ran="detection.ran.value"
              :error="detection.error.value"
              :phase="detection.phase.value"
              :download="download"
              :overall="overall"
              :first-run="firstRun"
              :available="!!createWorker && !!photo"
              @detect="runDetect"
              @toggle="detection.toggle"
              @set-all="detection.setAll"
              @accept="acceptDetected"
              @dismiss="detection.dismiss"
            />
            <SurfaceList :state="state" @add="addSurface" @next="onNext" />
            <Button v-if="state.doc.surfaces.length" class="w-full" variant="secondary" @click="step = 'refine'">Next: refine →</Button>
          </template>

          <template v-else-if="step === 'refine'">
            <SurfaceList :state="state" @add="addSurface" @next="onNext" />
            <div v-if="state.active.value" class="border-t border-border pt-4">
              <SurfaceInspector
                :state="state"
                :surface="state.active.value"
                :categories="categories"
                :preset-categories="presetCategories"
                :inherited="state.active.value.kind === 'custom' ? [] : (inheritedCategories?.[state.active.value.kind] ?? [])"
                :audience="audience"
                @auto-plane="autoPlane()"
                @warp="makeWarp"
                @remove-warp="state.update(state.active.value!.uid, { warp: null }); tool = 'plane'"
                @detach-id-map="detachIdMap"
              />
              <p v-if="detaching" class="mt-2 text-xs text-muted-foreground">Reading the surface map…</p>
            </div>
            <Button class="w-full" variant="secondary" @click="step = 'preview'">Next: preview →</Button>
          </template>

          <template v-else>
            <div class="space-y-2">
              <h3 class="text-sm font-semibold">Test pattern</h3>
              <InlinePreview :room="room" />
              <p class="text-xs text-muted-foreground">Squares should look square and lie flat on each wall and the floor.</p>
            </div>
            <ul v-if="problems.length" class="space-y-1 rounded-xl bg-amber-500/10 p-3 text-xs">
              <li v-for="p in problems" :key="p">{{ p }}</li>
            </ul>
            <p v-else class="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <Check class="h-4 w-4" /> Every surface is ready.
            </p>
            <div class="grid gap-2">
              <Button v-if="audience === 'staff'" :disabled="!room.surfaces.length" variant="secondary" @click="emit('preview', room)"><Eye /> Try it with real products</Button>
              <Button :disabled="!canSave" @click="save"><Loader2 v-if="saving" class="animate-spin" /><Save v-else /> {{ saveLabel }}</Button>
            </div>
            <details v-if="audience === 'staff'" class="rounded-xl border border-border p-3 text-xs">
              <summary class="cursor-pointer font-semibold">Room JSON</summary>
              <Button size="sm" variant="outline" class="mt-2" @click="downloadJson"><Download /> Download</Button>
              <textarea readonly class="mt-2 h-40 w-full rounded-lg border border-input bg-muted p-2 font-mono text-[11px]" :value="JSON.stringify(room, null, 2)" />
            </details>
          </template>

          <p v-if="workingNote && step !== 'photo' && audience === 'staff'" class="mt-auto flex items-start gap-1.5 text-[11px] text-muted-foreground"><Sparkles class="mt-px h-3 w-3 shrink-0" /> {{ workingNote }}</p>
        </aside>
      </div>

      <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" class="hidden" @change="openFile(($event.target as HTMLInputElement).files?.[0]); ($event.target as HTMLInputElement).value = ''" />
    </div>
  </TooltipProvider>
</template>
