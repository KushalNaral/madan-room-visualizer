import { ref, shallowRef } from 'vue'
import type { SegmentClient } from './ai/client'
import { vectorize } from './lib/contours'
import { rasterOf } from './lib/image'
import { components, maskArea, resizeMask, type Mask } from './lib/mask'
import { fitPlane } from './lib/planeFit'
import { presetFor, presetForLabel, type PresetKind } from './lib/presets'
import { nextLabel } from './lib/ids'
import { splitWalls, toGray } from './lib/wallSplit'
import { fitWarp } from './lib/warpFit'
import type { EditorState } from './useEditorState'
import type { MaskTools } from './useMaskTools'

export interface Candidate {
  key: string
  label: string
  kind: PresetKind
  /** At the mask tools' working resolution. */
  mask: Mask
  /** Share of the photo, 0–1. */
  coverage: number
  thumbnail: string
  keep: boolean
}

/** SegFormer works at 512 px; a little more keeps thin things (curtain edges) intact. */
const DETECT_SIDE = 640
/** Ignore regions smaller than this share of the photo. */
const MIN_SHARE = 0.008
const MAX_PER_KIND = 3

/**
 * "Detect surfaces": semantic segmentation of the photo, turned into proposed surfaces the user
 * ticks before anything is added. Walls are split into planes at the room's corners.
 */
export function useDetection(state: EditorState, tools: MaskTools, client: () => SegmentClient | null) {
  const candidates = shallowRef<Candidate[]>([])
  const running = ref(false)
  const error = ref<string | null>(null)
  const ran = ref(false)

  async function detect(photo: HTMLImageElement) {
    const c = client()
    if (!c) return
    running.value = true
    error.value = null
    try {
      const { width: W, height: H } = state.doc.image
      const result = await c.detect(rasterOf(photo, W, H, DETECT_SIDE))
      const work = tools.size.value
      const pixels = rasterOf(photo, W, H, Math.max(work.w, work.h))
      const gray = toGray(pixels.data, work.w, work.h)
      const minArea = Math.round(work.w * work.h * MIN_SHARE)
      const labels: string[] = state.doc.surfaces.map((s) => s.label)
      const out: Candidate[] = []

      // One mask per kind (armchair and sofa both become "Sofa" candidates, kept apart).
      for (const seg of result.segments) {
        const preset = presetForLabel(seg.label)
        if (!preset) continue
        const full = resizeMask({ width: result.width, height: result.height, data: seg.mask }, work.w, work.h)
        const parts = preset.kind === 'wall' ? splitWalls(full, gray, { minShare: MIN_SHARE * 2 }) : components(full, minArea).slice(0, MAX_PER_KIND)
        for (const mask of parts) {
          const area = maskArea(mask)
          if (area < minArea) continue
          out.push({ key: `${preset.kind}-${out.length}`, label: preset.label, kind: preset.kind, mask, coverage: area / (work.w * work.h), thumbnail: thumbnail(photo, mask), keep: true })
        }
      }
      // Number them in the order shown: walls left to right, the rest largest first.
      out.sort((a, b) => order(a.kind) - order(b.kind) || (a.kind === 'wall' ? 0 : b.coverage - a.coverage))
      for (const c of out) {
        c.label = nextLabel(c.label, labels)
        labels.push(c.label)
      }
      candidates.value = out
      ran.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      running.value = false
    }
  }

  function toggle(key: string) {
    candidates.value = candidates.value.map((c) => (c.key === key ? { ...c, keep: !c.keep } : c))
  }

  /** Adds the ticked candidates with a fitted plane (and a warp grid for curved ones). */
  function accept(acceptsFor: (kind: PresetKind) => string[]) {
    const scale = 1 / tools.scale.value
    state.addSurfaces(
      candidates.value
        .filter((c) => c.keep)
        .map((c) => {
          const mask = vectorize(c.mask, { scale })
          const quad = fitPlane(mask.polygons.flat()) ?? []
          const preset = presetFor(c.kind)
          return {
            kind: c.kind,
            accepts: acceptsFor(c.kind),
            init: { label: c.label, mask, quad, warp: preset.curved ? fitWarp(c.mask, 8, 6, scale) : null },
          }
        }),
    )
    candidates.value = []
  }

  function dismiss() {
    candidates.value = []
  }

  return { candidates, running, error, ran, detect, toggle, accept, dismiss }
}

const ORDER: PresetKind[] = ['wall', 'floor', 'curtain', 'blind', 'sofa', 'bed', 'rug', 'cabinet', 'ceiling']
const order = (k: PresetKind) => ORDER.indexOf(k)

/** Small photo with the region tinted, for the checklist. */
function thumbnail(photo: HTMLImageElement, mask: Mask): string {
  const w = 160, h = Math.round((160 * mask.height) / mask.width)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.drawImage(photo, 0, 0, w, h)
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fillRect(0, 0, w, h)
  const m = document.createElement('canvas')
  m.width = mask.width
  m.height = mask.height
  const mctx = m.getContext('2d')!
  const img = mctx.createImageData(mask.width, mask.height)
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue
    img.data.set([234, 88, 12, 255], i * 4)
  }
  mctx.putImageData(img, 0, 0)
  // Show the photo inside the region, tinted, over the darkened rest.
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  const region = document.createElement('canvas')
  region.width = w
  region.height = h
  const rctx = region.getContext('2d')!
  rctx.drawImage(photo, 0, 0, w, h)
  rctx.globalCompositeOperation = 'destination-in'
  rctx.drawImage(m, 0, 0, w, h)
  ctx.drawImage(region, 0, 0)
  ctx.globalAlpha = 0.35
  ctx.drawImage(m, 0, 0, w, h)
  ctx.restore()
  return c.toDataURL('image/jpeg', 0.8)
}
