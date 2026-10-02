import { computed, ref, shallowRef, watch } from 'vue'
import type { Point } from '../types'
import type { Prompt } from './ai/protocol'
import type { SegmentClient } from './ai/client'
import { vectorize } from './lib/contours'
import { fitScale } from './lib/image'
import { combine, emptyMask, paintStroke, rasterize, resizeMask, type Mask } from './lib/mask'
import type { EditorState } from './useEditorState'

export type Tool = 'magic' | 'brush' | 'eraser' | 'pen' | 'plane' | 'warp' | 'hand'

/** Masks are edited as rasters at most this many pixels on the long side, then vectorized. */
export const WORK_SIDE = 1280

/**
 * Raster editing of the active surface's mask. The surface stores polygons; while you paint or
 * magic-select, a raster copy at working resolution is edited and vectorized back on each commit,
 * so the saved format never changes.
 */
export function useMaskTools(state: EditorState, client: () => SegmentClient | null) {
  const scale = computed(() => fitScale(state.doc.image.width || 1, state.doc.image.height || 1, WORK_SIDE))
  const size = computed(() => ({ w: Math.max(1, Math.round(state.doc.image.width * scale.value)), h: Math.max(1, Math.round(state.doc.image.height * scale.value)) }))

  /** The active surface's mask as a raster; `version` bumps on every change to redraw. */
  const raster = shallowRef<Mask | null>(null)
  const version = ref(0)
  let rasterKey = ''

  const maskKey = () => {
    const s = state.active.value
    return s ? `${s.uid}|${size.value.w}x${size.value.h}|${JSON.stringify(s.mask)}` : ''
  }

  /** Re-rasterize when the surface, the photo or the mask changed outside the tools (undo…). */
  function sync() {
    const key = maskKey()
    if (key === rasterKey) return
    rasterKey = key
    const s = state.active.value
    raster.value = s ? rasterize(s.mask, size.value.w, size.value.h, scale.value) : null
    version.value++
    magic.value = null
  }
  watch(maskKey, sync, { immediate: true })

  function commit(key?: string) {
    const s = state.active.value
    const m = raster.value
    if (!s || !m) return
    state.update(s.uid, { mask: vectorize(m, { scale: 1 / scale.value }) }, key)
    rasterKey = maskKey()
  }

  const toRaster = (p: Point): Point => ({ x: p.x * scale.value, y: p.y * scale.value })

  // ---- Brush / eraser
  let last: Point | null = null
  function strokeStart(p: Point, radius: number, value: 0 | 1) {
    if (!raster.value) return
    last = toRaster(p)
    paintStroke(raster.value, last, last, radius * scale.value, value)
    version.value++
  }
  function strokeMove(p: Point, radius: number, value: 0 | 1) {
    if (!raster.value || !last) return
    const next = toRaster(p)
    paintStroke(raster.value, last, next, radius * scale.value, value)
    last = next
    version.value++
  }
  function strokeEnd() {
    if (!last) return
    last = null
    commit()
  }

  // ---- Magic select (SAM): one session = one undo step; Shift starts a new region.
  const magic = ref<{ base: Mask; prompts: Prompt[]; key: string } | null>(null)
  const magicBusy = ref(false)
  const magicError = ref<string | null>(null)
  let magicSeq = 0

  async function magicClick(p: Point, positive: boolean, newRegion: boolean) {
    const c = client()
    if (!c || !raster.value || !state.active.value) return
    if (!magic.value || newRegion) {
      magic.value = { base: { ...raster.value, data: raster.value.data.slice() }, prompts: [], key: `magic:${Date.now()}` }
    }
    const session = magic.value
    session.prompts.push({ x: p.x / state.doc.image.width, y: p.y / state.doc.image.height, positive })
    const mine = ++magicSeq
    magicBusy.value = true
    magicError.value = null
    try {
      const res = await c.segment(session.prompts)
      if (mine !== magicSeq || magic.value !== session) return
      const picked = resizeMask({ width: res.width, height: res.height, data: res.mask }, size.value.w, size.value.h)
      raster.value = combine(session.base, picked, 'union')
      version.value++
      commit(session.key)
    } catch (e) {
      magicError.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (mine === magicSeq) magicBusy.value = false
    }
  }
  function endMagic() {
    magic.value = null
  }

  // ---- Pen: trace a ring point by point; closing adds it (or, with Alt, cuts it out).
  const pen = ref<Point[]>([])
  function penAdd(p: Point) {
    pen.value = [...pen.value, p]
  }
  function penUndoPoint() {
    pen.value = pen.value.slice(0, -1)
  }
  function penClose(subtract = false) {
    if (pen.value.length < 3 || !raster.value) {
      pen.value = []
      return
    }
    const ring = rasterize({ polygons: [pen.value] }, size.value.w, size.value.h, scale.value)
    raster.value = combine(raster.value, ring, subtract ? 'subtract' : 'union')
    pen.value = []
    version.value++
    commit()
  }

  function clearMask() {
    if (!raster.value) return
    raster.value = emptyMask(size.value.w, size.value.h)
    version.value++
    commit()
  }

  return {
    scale,
    size,
    raster,
    version,
    commit,
    strokeStart,
    strokeMove,
    strokeEnd,
    magic,
    magicBusy,
    magicError,
    magicClick,
    endMagic,
    pen,
    penAdd,
    penUndoPoint,
    penClose,
    clearMask,
  }
}

export type MaskTools = ReturnType<typeof useMaskTools>
