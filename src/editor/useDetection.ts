import { ref, shallowRef } from 'vue'
import type { SegmentClient } from './ai/client'
import { SEGFORMERS, type DetectQuality } from './ai/protocol'
import { vectorize } from './lib/contours'
import { attachCushions, cleanRegion, mergeRefined, pickRefined } from './lib/detectPost'
import { rasterOf, rasterShortSide } from './lib/image'
import { components, deepestPoint, maskArea, maskBounds, resizeMask, type Mask } from './lib/mask'
import { fitPlane } from './lib/planeFit'
import { CUSHION_LABELS, OBJECT_KINDS, PRESETS, presetFor, type PresetKind } from './lib/presets'
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
  /** How sure the model is, 0–1 (mean probability over the region). */
  confidence: number
  /** The outline was sharpened with SAM. */
  refined: boolean
  thumbnail: string
  keep: boolean
}

/** Ignore regions smaller than this share of the photo. */
const MIN_SHARE = 0.006
const MAX_PER_KIND = 4
/** Below this the region starts unticked: shown, but the user opts in. */
const UNSURE = 0.55

/** What the editor is doing, for the button and progress text. */
export type DetectPhase = 'model' | 'scan' | 'refine' | null

/**
 * "Detect surfaces": semantic segmentation of the photo, turned into proposed surfaces the user
 * ticks before anything is added. Walls are split into planes at the room's corners; cushions
 * join their sofa; object outlines are sharpened with SAM when it's available.
 */
export function useDetection(state: EditorState, tools: MaskTools, client: () => SegmentClient | null, embed: () => Promise<boolean> = async () => false) {
  const candidates = shallowRef<Candidate[]>([])
  const running = ref(false)
  const error = ref<string | null>(null)
  const ran = ref(false)
  const phase = ref<DetectPhase>(null)
  /** Tiles scanned / refined regions, for "Scanning 3 of 8". */
  const step = ref<{ done: number; total: number } | null>(null)

  async function detect(photo: HTMLImageElement, quality: DetectQuality = 'fast') {
    const c = client()
    if (!c) return
    running.value = true
    error.value = null
    phase.value = 'model'
    step.value = null
    c.onStage = (done, total) => {
      phase.value = 'scan'
      step.value = { done, total }
    }
    try {
      const { width: W, height: H } = state.doc.image
      const groups: Record<string, string[]> = Object.fromEntries(PRESETS.map((p) => [p.kind, p.adeLabels]))
      groups.cushion = CUSHION_LABELS
      // SAM's embedding is prepared alongside, so sharpening outlines doesn't wait for it afterwards.
      const embedding = embed().catch(() => false)
      const raster = rasterShortSide(photo, W, H, SEGFORMERS[quality].size)
      const result = await c.detect(raster, { quality, groups })

      const work = tools.size.value
      const area = work.w * work.h
      const pixels = rasterOf(photo, W, H, Math.max(work.w, work.h))
      const gray = toGray(pixels.data, work.w, work.h)
      const minArea = Math.round(area * MIN_SHARE)

      // Model regions at working resolution, cleaned, as parts per kind.
      const regions: { kind: PresetKind; mask: Mask; confidence: number }[] = []
      const cushions: Mask[] = []
      for (const seg of result.segments) {
        const full = resizeMask({ width: result.width, height: result.height, data: seg.mask }, work.w, work.h)
        if (seg.label === 'cushion') {
          cushions.push(...components(full, Math.round(area * 0.0005)))
          continue
        }
        const kind = seg.label as PresetKind
        const cleaned = cleanRegion(full, kind)
        const parts = kind === 'wall' ? splitWalls(cleaned, gray, { minShare: MIN_SHARE * 2 }) : components(cleaned, minArea).slice(0, MAX_PER_KIND)
        for (const mask of parts) regions.push({ kind, mask, confidence: seg.score ?? 1 })
      }
      attachCushions(cushions, regions)

      // Sharper outlines for objects, one SAM prompt per region.
      const refined = new Set<Mask>()
      const objects = regions.filter((r) => OBJECT_KINDS.includes(r.kind))
      if (objects.length && (await embedding)) {
        phase.value = 'refine'
        for (let i = 0; i < objects.length; i++) {
          step.value = { done: i, total: objects.length }
          const r = objects[i]
          const better = await refine(c, r.mask, r.kind)
          if (better) {
            r.mask = better
            refined.add(better)
          }
        }
      }

      const labels: string[] = state.doc.surfaces.map((s) => s.label)
      const out: Candidate[] = []
      for (const r of regions) {
        const px = maskArea(r.mask)
        if (px < minArea) continue
        const preset = presetFor(r.kind)
        out.push({
          key: `${r.kind}-${out.length}`,
          label: preset.label,
          kind: r.kind,
          mask: r.mask,
          coverage: px / area,
          confidence: r.confidence,
          refined: refined.has(r.mask),
          thumbnail: thumbnail(photo, r.mask),
          keep: r.confidence >= UNSURE,
        })
      }
      // Number them in the order shown: walls left to right, the rest largest first.
      out.sort((a, b) => order(a.kind) - order(b.kind) || (a.kind === 'wall' ? 0 : b.coverage - a.coverage))
      for (const cand of out) {
        cand.label = nextLabel(cand.label, labels)
        labels.push(cand.label)
      }
      candidates.value = out
      ran.value = true
    } catch (e) {
      // Failing before the scan means the model never arrived: offline, blocked or out of memory.
      error.value = phase.value === 'model'
        ? 'Couldn’t load surface detection. Check your connection and try again; you can still mark surfaces by hand.'
        : e instanceof Error ? e.message : String(e)
    } finally {
      running.value = false
      phase.value = null
      step.value = null
      c.onStage = null
    }
  }

  /** SAM with the region's box and its deepest point; merged so it only moves the edges. */
  async function refine(c: SegmentClient, region: Mask, kind: PresetKind): Promise<Mask | null> {
    const b = maskBounds(region)
    const inner = deepestPoint(region)
    if (!b || !inner) return null
    const { width: w, height: h } = region
    const pad = 0.01
    const box: [number, number, number, number] = [
      Math.max(0, b.minX / w - pad), Math.max(0, b.minY / h - pad),
      Math.min(1, (b.maxX + 1) / w + pad), Math.min(1, (b.maxY + 1) / h + pad),
    ]
    try {
      const res = await c.refine({ box, points: [{ x: (inner.x + 0.5) / w, y: (inner.y + 0.5) / h, positive: true }] })
      const masks = res.masks.map((data) => resizeMask({ width: res.width, height: res.height, data }, w, h))
      const pick = pickRefined(region, masks)
      if (!pick) return null
      const band = Math.max(2, Math.round(Math.max(w, h) / 90))
      return cleanRegion(mergeRefined(region, pick, band), kind)
    } catch {
      return null
    }
  }

  /** Ticks or unticks every candidate (or only those of one kind). */
  function setAll(keep: boolean, kind?: PresetKind) {
    candidates.value = candidates.value.map((c) => (!kind || c.kind === kind ? { ...c, keep } : c))
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

  return { candidates, running, error, ran, phase, step, detect, toggle, setAll, accept, dismiss }
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
