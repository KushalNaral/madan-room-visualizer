/**
 * Clean-up between the segmentation model and the proposed surfaces: sealing cracks, filling
 * small holes, joining cushions to their sofa and merging SAM's sharper outlines.
 */
import { closeMask, combine, fillHoles, iou, maskArea, morph, overlap, type Mask } from './mask'
import { OBJECT_KINDS, type PresetKind } from './presets'

/**
 * Objects (sofas, curtains…) get cracks sealed and holes filled (a throw's pattern, folds read as
 * another class); walls, floors and ceilings keep their holes, which are things in front of them,
 * and only lose specks.
 */
export function cleanRegion(mask: Mask, kind: PresetKind): Mask {
  const side = Math.max(mask.width, mask.height)
  const area = mask.width * mask.height
  if (OBJECT_KINDS.includes(kind)) {
    const sealed = closeMask(mask, Math.max(1, Math.round(side / 400)))
    return fillHoles(sealed, Math.max(16, Math.round(maskArea(sealed) * 0.04)))
  }
  return fillHoles(mask, Math.round(area * 0.0008))
}

/**
 * Joins each cushion blob to the sofa or bed it touches most (cushions are re-covered with it).
 * Blobs touching neither are dropped: on their own they are too small to offer products.
 */
export function attachCushions(cushions: Mask[], targets: { kind: PresetKind; mask: Mask }[]): void {
  const hosts = targets.filter((t) => t.kind === 'sofa' || t.kind === 'bed')
  if (!hosts.length) return
  const r = Math.max(2, Math.round(Math.max(cushions[0]?.width ?? 0, cushions[0]?.height ?? 0) / 160))
  for (const c of cushions) {
    const grown = morph(c, r, 'dilate')
    let best: (typeof hosts)[number] | null = null
    let bestN = 0
    for (const h of hosts) {
      const n = overlap(grown, h.mask)
      if (n > bestN) [best, bestN] = [h, n]
    }
    if (best) best.mask = combine(best.mask, c, 'union')
  }
}

/** The SAM candidate that agrees best with the model's region, if it agrees well enough. */
export function pickRefined(region: Mask, candidates: Mask[], minIou = 0.55): Mask | null {
  let best: Mask | null = null
  let bestIou = minIou
  for (const m of candidates) {
    const v = iou(region, m)
    if (v >= bestIou) [best, bestIou] = [m, v]
  }
  return best
}

/**
 * The region with SAM's outline near its edge: the model's confident core is kept, and within
 * `band` px of its edge SAM decides. SAM can't run off far, so a wrong mask can't grab the room.
 */
export function mergeRefined(region: Mask, sam: Mask, band: number): Mask {
  const core = morph(region, band, 'erode')
  const reach = morph(region, band, 'dilate')
  return combine(combine(sam, reach, 'intersect'), core, 'union')
}
