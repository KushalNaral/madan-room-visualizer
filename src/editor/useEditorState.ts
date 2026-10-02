import { computed, reactive, ref, shallowRef, watch } from 'vue'
import type { LookPreset, Point, PolygonMask, Quad, Room, Surface, TexturePatch } from '../types'
import { autoIdColor } from '../render/RoomRenderer'
import { nextLabel, uniqueId } from './lib/ids'
import { planeIssue, type PlaneIssue } from './lib/planeFit'
import { kindFromName, presetFor, type InheritedCategories, type PresetKind } from './lib/presets'

export interface Warp {
  cols: number
  rows: number
  points: Point[]
}

/** A surface while it is being edited. Converted to the library's `Surface` by `toRoom()`. */
export interface DraftSurface {
  /** Stable key for lists; `id` can change. */
  uid: string
  id: string
  label: string
  kind: PresetKind | 'custom'
  accepts: string[]
  group: string
  mask: PolygonMask
  /** 0–4 plane corners, TL → TR → BR → BL. */
  quad: Point[]
  warp: Warp | null
  /** Real size of the plane the quad stands for (tiling). */
  widthCm: number
  heightCm: number
  /** Real size for pricing (window opening, floor…); defaults to the plane size. */
  sizeCm: { w: number; h: number } | null
  /** Coverable area; null = width × height of `sizeCm` or the plane. */
  areaM2: number | null
  /** Colour in a rendered id map (rooms made by the scene renderer). */
  idColor?: string
  /** Patches from an imported room, kept until the plane is edited here. */
  patches?: TexturePatch[]
  anchor?: Point
}

export interface EditorDoc {
  id: string
  name: string
  image: { url: string; width: number; height: number }
  idMapUrl?: string
  shadingUrl?: string
  thumbnailUrl?: string
  surfaces: DraftSurface[]
  presets: LookPreset[]
}

export type SurfaceStep = 'mask' | 'plane' | 'accepts' | null

export interface SurfaceStatus {
  mask: boolean
  plane: boolean
  accepts: boolean
  planeIssue: PlaneIssue
  next: SurfaceStep
}

const HISTORY_LIMIT = 80
const PRESET_KINDS = new Set(['wall', 'floor', 'ceiling', 'sofa', 'bed', 'curtain', 'blind', 'rug', 'cabinet'])
/** Autosaves keep the photo inline only when it is small enough for localStorage. */
const MAX_INLINE_IMAGE = 2_500_000

let uidSeq = 0
const newUid = () => `s${Date.now().toString(36)}${(uidSeq++).toString(36)}`

export function emptyDoc(): EditorDoc {
  return { id: '', name: '', image: { url: '', width: 0, height: 0 }, surfaces: [], presets: [] }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** Room JSON (from the API or a file) → an editable document. */
export function docFromRoom(room: Room): EditorDoc {
  return {
    id: room.id,
    name: room.name,
    image: { url: room.imageUrl, width: room.width, height: room.height },
    idMapUrl: room.idMapUrl,
    shadingUrl: room.shadingUrl,
    thumbnailUrl: room.thumbnailUrl,
    presets: clone(room.presets ?? []),
    surfaces: room.surfaces.map((s) => draftFromSurface(s)),
  }
}

function draftFromSurface(s: Surface): DraftSurface {
  const only = s.patches.length === 1 ? s.patches[0] : null
  const quad = only?.kind === 'quad' ? clone(only.quad) : []
  const warp =
    only?.kind === 'mesh'
      ? { cols: only.cols, rows: only.rows, points: Array.from({ length: only.points.length / 3 }, (_, i) => ({ x: only.points[i * 3], y: only.points[i * 3 + 1] })) }
      : null
  const size = only ?? s.patches[0]
  return {
    uid: newUid(),
    id: s.id,
    label: s.label,
    kind: (PRESET_KINDS.has(s.kind ?? '') ? s.kind : kindFromName(`${s.id} ${s.label}`)) as PresetKind | undefined ?? 'custom',
    accepts: [...s.accepts],
    group: s.group ?? '',
    mask: clone(s.mask ?? { polygons: [], cutouts: [] }),
    quad,
    warp,
    widthCm: size?.widthCm ?? 300,
    heightCm: size?.heightCm ?? 260,
    sizeCm: s.sizeCm ? { ...s.sizeCm } : null,
    areaM2: s.areaM2 ?? null,
    idColor: s.idColor,
    // Multi-patch surfaces (rendered scenes) can't be shown as one plane: keep them as they are.
    patches: only ? undefined : clone(s.patches),
    anchor: s.anchor,
  }
}

export function hasMask(s: DraftSurface, doc: EditorDoc): boolean {
  return (!!doc.idMapUrl && !!s.idColor) || s.mask.polygons.some((r) => r.length >= 3)
}

/** Categories the surface's kind inherits from the host (shown locked in the inspector). */
export function inheritedFor(s: DraftSurface, inherited?: InheritedCategories): string[] {
  return s.kind === 'custom' ? [] : (inherited?.[s.kind] ?? [])
}

export function surfaceStatus(s: DraftSurface, doc: EditorDoc, inherited?: InheritedCategories): SurfaceStatus {
  const mask = hasMask(s, doc)
  const plane = s.quad.length === 4 || !!s.patches?.length
  const accepts = s.accepts.length > 0 || inheritedFor(s, inherited).length > 0
  return {
    mask,
    plane,
    accepts,
    planeIssue: s.quad.length === 4 && !s.warp ? planeIssue(s.quad) : null,
    next: !mask ? 'mask' : !plane ? 'plane' : !accepts ? 'accepts' : null,
  }
}

function surfacePatch(s: DraftSurface): TexturePatch[] {
  if (s.patches?.length) return clone(s.patches)
  if (s.warp) return [{ kind: 'mesh', cols: s.warp.cols, rows: s.warp.rows, points: s.warp.points.flatMap((p) => [p.x, p.y, 0.5]), widthCm: +s.widthCm, heightCm: +s.heightCm }]
  return [{ kind: 'quad', quad: clone(s.quad) as Quad, widthCm: +s.widthCm, heightCm: +s.heightCm }]
}

/** The editable document → Room JSON (only surfaces that have a mask and a plane). */
export function roomFromDoc(doc: EditorDoc): Room {
  const useIdMap = !!doc.idMapUrl
  const surfaces = doc.surfaces
    .filter((s) => {
      const st = surfaceStatus(s, doc)
      return st.mask && st.plane
    })
    .map<Surface>((s, i) => {
      const size = s.sizeCm ?? { w: +s.widthCm, h: +s.heightCm }
      const out: Surface = {
        id: s.id,
        label: s.label,
        ...(s.kind !== 'custom' ? { kind: s.kind } : {}),
        accepts: [...s.accepts],
        patches: surfacePatch(s),
        areaM2: s.areaM2 ?? Math.round((size.w * size.h) / 1000) / 10,
      }
      if (s.group) out.group = s.group
      if (s.sizeCm) out.sizeCm = { ...s.sizeCm }
      if (s.anchor) out.anchor = { ...s.anchor }
      if (useIdMap) out.idColor = s.idColor
      else {
        out.idColor = autoIdColor(i)
        out.mask = clone(s.mask)
      }
      return out
    })
  return {
    id: doc.id,
    name: doc.name,
    imageUrl: doc.image.url,
    width: doc.image.width,
    height: doc.image.height,
    ...(doc.idMapUrl ? { idMapUrl: doc.idMapUrl } : {}),
    ...(doc.shadingUrl ? { shadingUrl: doc.shadingUrl } : {}),
    ...(doc.thumbnailUrl ? { thumbnailUrl: doc.thumbnailUrl } : {}),
    surfaces,
    presets: clone(doc.presets),
  }
}

export interface EditorStateOptions {
  /** localStorage key for autosave; false turns it off. */
  autosaveKey?: string | false
  /** Categories each kind inherits from the host's settings (read on every status check). */
  inherited?: () => InheritedCategories | undefined
}

export interface Autosave {
  savedAt: number
  doc: EditorDoc
}

export function useEditorState(opts: EditorStateOptions = {}) {
  const doc = reactive<EditorDoc>(emptyDoc())
  const activeUid = ref<string | null>(null)
  const past = shallowRef<string[]>([])
  const future = shallowRef<string[]>([])
  const dirty = ref(false)
  let coalesce: string | null = null
  let coalesceTimer: ReturnType<typeof setTimeout> | undefined

  const active = computed(() => doc.surfaces.find((s) => s.uid === activeUid.value) ?? null)
  const room = computed(() => roomFromDoc(doc))
  const statuses = computed(() => new Map(doc.surfaces.map((s) => [s.uid, surfaceStatus(s, doc, opts.inherited?.())])))

  // ---- History: snapshots of the document without the photo.
  const snapshot = () => JSON.stringify({ surfaces: doc.surfaces, presets: doc.presets, idMapUrl: doc.idMapUrl ?? null, name: doc.name, id: doc.id })
  function restore(raw: string) {
    const s = JSON.parse(raw)
    doc.surfaces = s.surfaces
    doc.presets = s.presets
    doc.idMapUrl = s.idMapUrl ?? undefined
    doc.name = s.name
    doc.id = s.id
    if (!doc.surfaces.some((x) => x.uid === activeUid.value)) activeUid.value = doc.surfaces[0]?.uid ?? null
  }
  /** Call before a change. Rapid changes with the same key (typing, dragging) make one step. */
  function record(key?: string) {
    dirty.value = true
    if (key && key === coalesce) {
      clearTimeout(coalesceTimer)
      coalesceTimer = setTimeout(() => (coalesce = null), 800)
      return
    }
    coalesce = key ?? null
    if (key) coalesceTimer = setTimeout(() => (coalesce = null), 800)
    past.value = [...past.value.slice(-HISTORY_LIMIT + 1), snapshot()]
    future.value = []
  }
  function undo() {
    const prev = past.value.at(-1)
    if (!prev) return
    future.value = [snapshot(), ...future.value]
    past.value = past.value.slice(0, -1)
    coalesce = null
    restore(prev)
  }
  function redo() {
    const next = future.value[0]
    if (!next) return
    past.value = [...past.value, snapshot()]
    future.value = future.value.slice(1)
    coalesce = null
    restore(next)
  }
  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  // ---- Loading
  function load(next: EditorDoc) {
    Object.assign(doc, clone(next))
    activeUid.value = doc.surfaces[0]?.uid ?? null
    past.value = []
    future.value = []
    dirty.value = false
  }
  function loadRoom(r: Room) {
    load(docFromRoom(r))
  }
  /** A new photo: everything drawn so far belonged to the old one. */
  function setImage(url: string, width: number, height: number, name?: string) {
    record()
    const sameSize = doc.image.width === width && doc.image.height === height
    doc.image = { url, width, height }
    doc.thumbnailUrl = undefined
    if (!sameSize) {
      doc.surfaces = []
      doc.idMapUrl = undefined
      doc.shadingUrl = undefined
      activeUid.value = null
    }
    if (name && !doc.name) doc.name = name
  }

  // ---- Surfaces
  function makeSurface(kind: PresetKind | 'custom', init: Partial<DraftSurface>, accepts: string[]): DraftSurface {
    const preset = kind === 'custom' ? null : presetFor(kind)
    const label = init.label ?? nextLabel(preset?.label ?? 'Surface', doc.surfaces.map((s) => s.label))
    return {
      uid: newUid(),
      id: uniqueId(label, doc.surfaces.map((x) => x.id)),
      label,
      kind,
      accepts,
      group: preset?.group ?? '',
      mask: { polygons: [], cutouts: [] },
      quad: [],
      warp: null,
      widthCm: preset?.sizeCm.w ?? 300,
      heightCm: preset?.sizeCm.h ?? 260,
      sizeCm: null,
      areaM2: null,
      ...init,
    }
  }

  function addSurface(kind: PresetKind | 'custom', init: Partial<DraftSurface> = {}, accepts: string[] = []): DraftSurface {
    record()
    const s = makeSurface(kind, init, accepts)
    doc.surfaces.push(s)
    activeUid.value = s.uid
    return s
  }

  /** Adds several surfaces (accepted detections) as one undo step. */
  function addSurfaces(list: { kind: PresetKind | 'custom'; init: Partial<DraftSurface>; accepts: string[] }[]) {
    if (!list.length) return
    record()
    for (const item of list) doc.surfaces.push(makeSurface(item.kind, item.init, item.accepts))
    activeUid.value = doc.surfaces[doc.surfaces.length - list.length]?.uid ?? activeUid.value
  }

  function removeSurface(uid: string) {
    record()
    const i = doc.surfaces.findIndex((s) => s.uid === uid)
    if (i < 0) return
    doc.surfaces.splice(i, 1)
    if (activeUid.value === uid) activeUid.value = doc.surfaces[Math.min(i, doc.surfaces.length - 1)]?.uid ?? null
  }

  function moveSurface(uid: string, dir: -1 | 1) {
    const i = doc.surfaces.findIndex((s) => s.uid === uid)
    const j = i + dir
    if (i < 0 || j < 0 || j >= doc.surfaces.length) return
    record()
    const [s] = doc.surfaces.splice(i, 1)
    doc.surfaces.splice(j, 0, s)
  }

  /** Changes a surface; `key` merges a burst of edits (typing, dragging) into one undo step. */
  function update(uid: string, patch: Partial<DraftSurface>, key?: string) {
    const s = doc.surfaces.find((x) => x.uid === uid)
    if (!s) return
    record(key)
    // Editing the plane replaces patches imported from a rendered scene.
    if ('quad' in patch || 'warp' in patch) s.patches = undefined
    Object.assign(s, patch)
  }

  /** Renames and keeps the id in step while it still follows the label. */
  function rename(uid: string, label: string) {
    const s = doc.surfaces.find((x) => x.uid === uid)
    if (!s) return
    const others = doc.surfaces.filter((x) => x.uid !== uid).map((x) => x.id)
    const followed = s.id === uniqueId(s.label, others)
    update(uid, { label, ...(followed ? { id: uniqueId(label, others) } : {}) }, `label:${uid}`)
  }

  /** Switch from a rendered id map to editable polygon masks (they were extracted from it). */
  function detachIdMap(masks: Map<string, PolygonMask>) {
    record()
    for (const s of doc.surfaces) {
      const m = s.idColor ? masks.get(s.idColor) : undefined
      if (m) s.mask = m
      s.idColor = undefined
    }
    doc.idMapUrl = undefined
  }

  // ---- Autosave
  const key = opts.autosaveKey === undefined ? 'madan-room-editor' : opts.autosaveKey
  const restorable = ref<Autosave | null>(null)
  if (key) {
    try {
      const raw = localStorage.getItem(key)
      restorable.value = raw ? (JSON.parse(raw) as Autosave) : null
    } catch {
      restorable.value = null
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    watch(
      () => [dirty.value, snapshot(), doc.image.url],
      () => {
        if (!dirty.value) return
        clearTimeout(timer)
        timer = setTimeout(() => {
          try {
            const saved: Autosave = { savedAt: Date.now(), doc: clone(doc) }
            // blob: URLs die with the page; inline the photo only when it is a small data URL.
            const url = saved.doc.image.url
            if (url.startsWith('blob:') || (url.startsWith('data:') && url.length > MAX_INLINE_IMAGE)) saved.doc.image.url = ''
            localStorage.setItem(key, JSON.stringify(saved))
          } catch {
            /* storage full or blocked: autosave is best-effort */
          }
        }, 600)
      },
    )
  }
  function restoreAutosave(): boolean {
    const saved = restorable.value
    if (!saved) return false
    const keepImage = doc.image.url && (!saved.doc.image.url || saved.doc.image.url === doc.image.url)
    const image = keepImage ? { ...doc.image } : saved.doc.image
    load(saved.doc)
    doc.image = image
    dirty.value = true
    restorable.value = null
    return true
  }
  function clearAutosave() {
    restorable.value = null
    dirty.value = false
    if (!key) return
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }

  return {
    doc,
    room,
    active,
    activeUid,
    statuses,
    dirty,
    canUndo,
    canRedo,
    restorable,
    record,
    undo,
    redo,
    load,
    loadRoom,
    setImage,
    addSurface,
    addSurfaces,
    removeSurface,
    moveSurface,
    update,
    rename,
    detachIdMap,
    restoreAutosave,
    clearAutosave,
  }
}

export type EditorState = ReturnType<typeof useEditorState>
