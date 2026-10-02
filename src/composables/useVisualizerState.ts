import { computed, reactive, ref, shallowRef, watch } from 'vue'
import type { ProductSource } from '../data/ProductSource'
import { estimate, type Estimate } from '../lib/estimate'
import { parseSelections, serializeSelections } from '../lib/selectionUrl'
import type { LookPreset, Product, Room, Selection, Surface, Variant } from '../types'

export interface AppliedItem {
  surface: Surface
  product: Product
  variant: Variant
  selection: Selection
  estimate: Estimate
}

export interface SavedLook {
  id: string
  name: string
  roomId: string
  createdAt: number
  thumbnail?: string
  selections: Record<string, Selection>
}

export interface VisualizerStateOptions {
  initialRoomId?: string
  /** Mirror room + applied looks into `?room=&look=` so the view can be shared. */
  syncUrl?: boolean
  /** localStorage namespace for saved looks and recents; `false` disables persistence. */
  storageKey?: string | false
}

const ROOM_PARAM = 'room'
const LOOK_PARAM = 'look'
const HISTORY_LIMIT = 60

type Snapshot = Record<string, Selection>

function readStore<T>(key: string | false, fallback: T): T {
  if (!key) return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStore(key: string | false, value: unknown) {
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: persistence is best-effort */
  }
}

export function useVisualizerState(source: ProductSource, opts: VisualizerStateOptions = {}) {
  const storage = opts.storageKey === false ? false : (opts.storageKey ?? 'madan-visualizer')
  const rooms = shallowRef<Room[]>([])
  const room = shallowRef<Room | null>(null)
  const selections = reactive<Record<string, Selection>>({})
  const selectedSurfaceId = ref<string | null>(null)
  /** Surface highlighted from outside the canvas (e.g. hovering a chip in the panel). */
  const previewSurfaceId = ref<string | null>(null)
  const products = reactive(new Map<string, Product>())
  const loadingRoom = ref(false)
  const error = ref<string | null>(null)

  // ---- History
  const past = shallowRef<Snapshot[]>([])
  const future = shallowRef<Snapshot[]>([])
  let coalesceKey: string | null = null
  let coalesceTimer: ReturnType<typeof setTimeout> | undefined

  const snapshot = (): Snapshot => JSON.parse(JSON.stringify(selections))
  function restore(s: Snapshot) {
    for (const k of Object.keys(selections)) delete selections[k]
    Object.assign(selections, JSON.parse(JSON.stringify(s)))
  }
  /** Records the current state before a change. Rapid changes with the same key merge. */
  function record(key?: string) {
    if (key && key === coalesceKey) {
      clearTimeout(coalesceTimer)
      coalesceTimer = setTimeout(() => (coalesceKey = null), 700)
      return
    }
    coalesceKey = key ?? null
    if (key) coalesceTimer = setTimeout(() => (coalesceKey = null), 700)
    past.value = [...past.value.slice(-HISTORY_LIMIT + 1), snapshot()]
    future.value = []
  }
  function undo() {
    const prev = past.value.at(-1)
    if (!prev) return
    future.value = [snapshot(), ...future.value]
    past.value = past.value.slice(0, -1)
    coalesceKey = null
    restore(prev)
  }
  function redo() {
    const next = future.value[0]
    if (!next) return
    past.value = [...past.value, snapshot()]
    future.value = future.value.slice(1)
    coalesceKey = null
    restore(next)
  }
  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  // ---- Derived
  const selectedSurface = computed(
    () => room.value?.surfaces.find((s) => s.id === selectedSurfaceId.value) ?? null,
  )

  const applied = computed<AppliedItem[]>(() => {
    const out: AppliedItem[] = []
    for (const surface of room.value?.surfaces ?? []) {
      const sel = selections[surface.id]
      const product = sel && products.get(sel.productId)
      const variant = product?.variants.find((v) => v.id === sel!.variantId)
      if (product && variant) out.push({ surface, product, variant, selection: sel, estimate: estimate(surface, product, variant) })
    }
    return out
  })
  const appliedBySurface = computed(() => new Map(applied.value.map((a) => [a.surface.id, a])))
  const totalPrice = computed(() => applied.value.reduce((sum, a) => sum + (a.estimate.total ?? 0), 0))

  /** Other surfaces in the same group as the selected one (e.g. all walls). */
  const groupMates = computed(() => {
    const s = selectedSurface.value
    if (!s?.group || !room.value) return []
    return room.value.surfaces.filter((x) => x.group === s.group && x.id !== s.id)
  })

  // ---- Products
  function rememberProduct(product: Product) {
    products.set(product.id, product)
  }
  async function ensureProducts(ids: string[]) {
    const missing = [...new Set(ids)].filter((id) => !products.has(id))
    const fetched = await Promise.all(missing.map((id) => source.getProduct(id)))
    fetched.forEach((p) => p && rememberProduct(p))
  }

  // ---- Recents (persisted)
  const recent = ref<{ productId: string; variantId: string }[]>(readStore(storage && `${storage}:recent`, []))
  watch(recent, (v) => writeStore(storage && `${storage}:recent`, v), { deep: true })
  function pushRecent(productId: string, variantId: string) {
    recent.value = [{ productId, variantId }, ...recent.value.filter((r) => r.variantId !== variantId)].slice(0, 12)
  }

  // ---- Saved looks (persisted)
  const savedLooks = ref<SavedLook[]>(readStore(storage && `${storage}:looks`, []))
  watch(savedLooks, (v) => writeStore(storage && `${storage}:looks`, v), { deep: true })
  const roomLooks = computed(() => savedLooks.value.filter((l) => l.roomId === room.value?.id))

  function saveLook(name: string, thumbnail?: string): SavedLook | undefined {
    if (!room.value) return
    const look: SavedLook = {
      id: Math.random().toString(36).slice(2, 10),
      name: name.trim() || `Look ${roomLooks.value.length + 1}`,
      roomId: room.value.id,
      createdAt: Date.now(),
      thumbnail,
      selections: snapshot(),
    }
    savedLooks.value = [look, ...savedLooks.value].slice(0, 30)
    return look
  }
  function deleteLook(id: string) {
    savedLooks.value = savedLooks.value.filter((l) => l.id !== id)
  }

  // ---- Mutations
  function applyVariant(surfaceId: string, product: Product, variant: Variant, alsoTo: string[] = []) {
    record()
    rememberProduct(product)
    for (const id of [surfaceId, ...alsoTo]) {
      const prev = selections[id]
      // Keep pattern adjustments when switching colourways of the same product.
      const keep = prev?.productId === product.id ? { scale: prev.scale, rotation: prev.rotation, offsetX: prev.offsetX, offsetY: prev.offsetY } : {}
      selections[id] = { productId: product.id, variantId: variant.id, ...keep }
    }
    pushRecent(product.id, variant.id)
  }

  function adjust(surfaceId: string, patch: Partial<Pick<Selection, 'scale' | 'rotation' | 'offsetX' | 'offsetY'>>) {
    const sel = selections[surfaceId]
    if (!sel) return
    record(`adjust:${surfaceId}`)
    selections[surfaceId] = { ...sel, ...patch }
  }

  function resetAdjust(surfaceId: string) {
    const sel = selections[surfaceId]
    if (!sel) return
    record()
    selections[surfaceId] = { productId: sel.productId, variantId: sel.variantId }
  }

  function clearSurface(surfaceId: string) {
    if (!selections[surfaceId]) return
    record()
    delete selections[surfaceId]
  }

  function clearAll() {
    if (!Object.keys(selections).length) return
    record()
    for (const k of Object.keys(selections)) delete selections[k]
  }

  async function applySelections(next: Record<string, Selection>, replace = true) {
    await ensureProducts(Object.values(next).map((s) => s.productId))
    const valid = Object.entries(next).filter(([sid, s]) =>
      room.value?.surfaces.some((x) => x.id === sid) && products.get(s.productId)?.variants.some((v) => v.id === s.variantId),
    )
    record()
    if (replace) for (const k of Object.keys(selections)) delete selections[k]
    for (const [sid, s] of valid) selections[sid] = { ...s }
  }

  const applyPreset = (preset: LookPreset) => applySelections(preset.selections)

  async function loadRoom(id: string, initial: Record<string, Selection> = {}) {
    loadingRoom.value = true
    error.value = null
    try {
      const next = rooms.value.find((r) => r.id === id) ?? (await source.getRoom(id))
      if (!next) throw new Error(`Room "${id}" not found`)
      for (const k of Object.keys(selections)) delete selections[k]
      past.value = []
      future.value = []
      room.value = next
      selectedSurfaceId.value = null
      if (Object.keys(initial).length) {
        await applySelections(initial)
        past.value = []
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loadingRoom.value = false
    }
  }

  async function init() {
    try {
      rooms.value = await source.listRooms()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return
    }
    const params = opts.syncUrl ? new URLSearchParams(window.location.search) : null
    const roomId = params?.get(ROOM_PARAM) ?? opts.initialRoomId ?? rooms.value[0]?.id
    if (roomId) await loadRoom(roomId, parseSelections(params?.get(LOOK_PARAM)))
  }

  function shareUrl(): string {
    const url = new URL(window.location.href)
    if (room.value) url.searchParams.set(ROOM_PARAM, room.value.id)
    const look = serializeSelections(selections)
    if (look) url.searchParams.set(LOOK_PARAM, look)
    else url.searchParams.delete(LOOK_PARAM)
    return url.toString()
  }

  if (opts.syncUrl) {
    watch(
      [room, selections],
      () => {
        if (room.value) window.history.replaceState(window.history.state, '', shareUrl())
      },
      { deep: true },
    )
  }

  function cycleSurface(dir: 1 | -1) {
    const list = room.value?.surfaces ?? []
    if (!list.length) return
    const i = list.findIndex((s) => s.id === selectedSurfaceId.value)
    selectedSurfaceId.value = list[(i + dir + list.length) % list.length].id
  }

  return {
    rooms,
    room,
    selections,
    selectedSurfaceId,
    previewSurfaceId,
    selectedSurface,
    groupMates,
    applied,
    appliedBySurface,
    totalPrice,
    loadingRoom,
    error,
    products,
    recent,
    savedLooks,
    roomLooks,
    canUndo,
    canRedo,
    init,
    loadRoom,
    applyVariant,
    adjust,
    resetAdjust,
    clearSurface,
    clearAll,
    applySelections,
    applyPreset,
    ensureProducts,
    rememberProduct,
    saveLook,
    deleteLook,
    undo,
    redo,
    shareUrl,
    cycleSurface,
  }
}

export type VisualizerState = ReturnType<typeof useVisualizerState>
