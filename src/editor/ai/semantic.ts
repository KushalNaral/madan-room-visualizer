/**
 * SegFormer post-processing for "Detect surfaces", kept free of the model so it can be tested.
 *
 * The photo (short side = the model's input size) is covered by overlapping square tiles, each
 * run through the model (and mirrored, for the accurate mode). Per tile, class logits become
 * probabilities summed per group (e.g. sofa + armchair + couch), which are upsampled and averaged
 * over the whole photo. Each pixel then goes to the most likely group, or to none when "anything
 * else" is likelier.
 */
import type { DetectedSegment } from './protocol'

const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

/** Class index → group index (-1 for classes no group wants). Names compare trimmed, lowercase. */
export function classGroups(labels: string[], groups: string[][]): Int16Array {
  const out = new Int16Array(labels.length).fill(-1)
  const norm = (s: string) => s.trim().toLowerCase()
  labels.forEach((label, c) => {
    const names = norm(label).split(/,\s*/)
    const g = groups.findIndex((list) => list.some((n) => names.includes(norm(n))))
    out[c] = g
  })
  return out
}

/** Top-left corners of `size`-square tiles covering W×H with at least a third of overlap. */
export function tileOrigins(width: number, height: number, size: number): [number, number][] {
  const axis = (len: number) => {
    if (len <= size) return [0]
    const n = Math.ceil((len - size) / (size * (2 / 3))) + 1
    return Array.from({ length: n }, (_, i) => Math.round(((len - size) * i) / (n - 1)))
  }
  const out: [number, number][] = []
  for (const y of axis(height)) for (const x of axis(width)) out.push([x, y])
  return out
}

/**
 * One tile of an RGBA raster as the model's normalized CHW input. Areas past the raster's edge
 * (photos smaller than a tile) repeat the edge pixels.
 */
export function tilePixels(data: Uint8ClampedArray, width: number, height: number, x0: number, y0: number, size: number, flip: boolean): Float32Array {
  const out = new Float32Array(3 * size * size)
  const plane = size * size
  for (let y = 0; y < size; y++) {
    const sy = Math.min(height - 1, y0 + y)
    for (let x = 0; x < size; x++) {
      const sx = Math.min(width - 1, x0 + (flip ? size - 1 - x : x))
      const i = (sy * width + sx) * 4
      const o = y * size + x
      out[o] = (data[i] / 255 - MEAN[0]) / STD[0]
      out[plane + o] = (data[i + 1] / 255 - MEAN[1]) / STD[1]
      out[2 * plane + o] = (data[i + 2] / 255 - MEAN[2]) / STD[2]
    }
  }
  return out
}

/** Sums of softmax probabilities per group at the logits' resolution; the last channel is "other". */
export function groupProbabilities(logits: Float32Array, classes: number, h: number, w: number, map: Int16Array, groups: number): Float32Array {
  const plane = h * w
  const out = new Float32Array((groups + 1) * plane)
  for (let p = 0; p < plane; p++) {
    let max = -Infinity
    for (let c = 0; c < classes; c++) max = Math.max(max, logits[c * plane + p])
    let sum = 0
    for (let c = 0; c < classes; c++) sum += Math.exp(logits[c * plane + p] - max)
    let grouped = 0
    for (let c = 0; c < classes; c++) {
      const g = map[c]
      if (g < 0) continue
      const prob = Math.exp(logits[c * plane + p] - max) / sum
      out[g * plane + p] += prob
      grouped += prob
    }
    out[groups * plane + p] = Math.max(0, 1 - grouped)
  }
  return out
}

/**
 * Adds a tile's group probabilities (at logits resolution h×w) to the photo-sized accumulator,
 * upsampled bilinearly to the tile and un-mirrored when the tile ran flipped.
 */
export function accumulateTile(
  acc: Float32Array,
  weight: Float32Array,
  width: number,
  height: number,
  probs: Float32Array,
  channels: number,
  h: number,
  w: number,
  x0: number,
  y0: number,
  size: number,
  flip: boolean,
) {
  const plane = h * w
  const photoPlane = width * height
  const sx = w / size, sy = h / size
  for (let y = 0; y < size && y0 + y < height; y++) {
    // Align centres, as PyTorch's interpolate(align_corners=False) does.
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5))
    const ya = Math.floor(fy), yb = Math.min(h - 1, ya + 1), ty = fy - ya
    for (let x = 0; x < size && x0 + x < width; x++) {
      const lx = flip ? size - 1 - x : x
      const fx = Math.min(w - 1, Math.max(0, (lx + 0.5) * sx - 0.5))
      const xa = Math.floor(fx), xb = Math.min(w - 1, xa + 1), tx = fx - xa
      const o = (y0 + y) * width + x0 + x
      const a = ya * w + xa, b = ya * w + xb, c = yb * w + xa, d = yb * w + xb
      for (let g = 0; g < channels; g++) {
        const base = g * plane
        const top = probs[base + a] + (probs[base + b] - probs[base + a]) * tx
        const bottom = probs[base + c] + (probs[base + d] - probs[base + c]) * tx
        acc[g * photoPlane + o] += top + (bottom - top) * ty
      }
      weight[o] += 1
    }
  }
}

/** Each pixel's most likely group; one segment per group that won any pixels. */
export function segmentsFrom(acc: Float32Array, weight: Float32Array, width: number, height: number, names: string[]): DetectedSegment[] {
  const plane = width * height
  const groups = names.length
  const masks = names.map(() => new Uint8Array(plane))
  const score = new Float64Array(groups)
  const count = new Uint32Array(groups)
  for (let p = 0; p < plane; p++) {
    const wgt = weight[p] || 1
    let best = groups, bestP = acc[groups * plane + p]
    for (let g = 0; g < groups; g++) {
      if (acc[g * plane + p] > bestP) [best, bestP] = [g, acc[g * plane + p]]
    }
    if (best === groups) continue
    masks[best][p] = 1
    score[best] += bestP / wgt
    count[best]++
  }
  return names
    .map((label, g) => ({ label, score: count[g] ? score[g] / count[g] : 0, mask: masks[g], n: count[g] }))
    .filter((s) => s.n > 0)
    .map(({ label, score, mask }) => ({ label, score, mask }))
}
