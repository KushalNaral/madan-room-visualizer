import { components, emptyMask, maskBounds, type Mask } from './mask'

/** Grayscale copy of RGBA pixels at the mask's resolution. */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const g = new Float32Array(width * height)
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
  return g
}

/**
 * For each column, the share of the mask's rows in which a strong, mostly vertical edge passes
 * (Sobel inside the mask). A room corner between two walls shows up as a tall peak.
 */
export function verticalEdgeProfile(mask: Mask, gray: Float32Array): Float32Array {
  const { width: w, height: h, data } = mask
  const profile = new Float32Array(w)
  const rows = new Float32Array(w)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (!data[i]) continue
      rows[x]++
      const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1]
      const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
      if (Math.abs(gx) > 24 && Math.abs(gx) > 1.5 * Math.abs(gy)) profile[x]++
    }
  }
  // Corners are rarely perfectly vertical in a photo: spread each column over its neighbours.
  const out = new Float32Array(w)
  for (let x = 0; x < w; x++) {
    let edges = 0, total = 0
    for (let k = -2; k <= 2; k++) {
      const c = x + k
      if (c < 0 || c >= w) continue
      edges += profile[c]
      total = Math.max(total, rows[c])
    }
    out[x] = total ? Math.min(1, edges / total) : 0
  }
  return out
}

function cutAt(mask: Mask, column: number): [Mask, Mask] {
  const left = emptyMask(mask.width, mask.height), right = emptyMask(mask.width, mask.height)
  for (let i = 0; i < mask.data.length; i++) {
    if (!mask.data[i]) continue
    ;((i % mask.width) < column ? left : right).data[i] = 1
  }
  return [left, right]
}

/**
 * Splits the single "wall" mask a segmentation model returns into one mask per wall plane:
 * first by connected parts, then at tall vertical edges (room corners). Falls back to the
 * parts as they are when nothing looks like a corner.
 */
export function splitWalls(wall: Mask, gray: Float32Array, opts: { minShare?: number; maxWalls?: number } = {}): Mask[] {
  const minArea = Math.round(wall.width * wall.height * (opts.minShare ?? 0.01))
  const maxWalls = opts.maxWalls ?? 4
  const queue = components(wall, minArea)
  const out: Mask[] = []
  while (queue.length && out.length + queue.length <= maxWalls * 2) {
    const part = queue.shift()!
    const b = maskBounds(part)!
    const width = b.maxX - b.minX + 1
    if (out.length + queue.length + 1 >= maxWalls || width < wall.width * 0.15) {
      out.push(part)
      continue
    }
    const profile = verticalEdgeProfile(part, gray)
    const margin = Math.round(width * 0.12)
    let best = -1, bestScore = 0.35
    for (let x = b.minX + margin; x <= b.maxX - margin; x++) {
      if (profile[x] > bestScore) [best, bestScore] = [x, profile[x]]
    }
    if (best < 0) {
      out.push(part)
      continue
    }
    // The spread profile is flat-topped around an edge: cut in the middle of the plateau.
    let l = best, r = best
    while (l > b.minX && profile[l - 1] >= bestScore * 0.98) l--
    while (r < b.maxX && profile[r + 1] >= bestScore * 0.98) r++
    best = Math.round((l + r + 1) / 2)
    const halves = cutAt(part, best).flatMap((m) => components(m, minArea))
    if (halves.length < 2) out.push(part)
    else queue.unshift(...halves)
  }
  out.push(...queue)
  // Left to right, as a person reads the room.
  return out.sort((a, b) => maskBounds(a)!.minX - maskBounds(b)!.minX)
}
