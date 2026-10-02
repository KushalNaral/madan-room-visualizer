// Flat BVH over triangles with Möller–Trumbore intersection. Built for speed in plain JS.

export interface Hit {
  tri: number
  t: number
  u: number
  v: number
}

export class BVH {
  private nodeMin: Float64Array
  private nodeMax: Float64Array
  /** For leaves: first index into `order`, count > 0. For inner: left child index, count = 0 (right = left+1 via `right`). */
  private nodeStart: Int32Array
  private nodeCount: Int32Array
  private nodeRight: Int32Array
  private order: Int32Array
  private v0: Float64Array
  private e1: Float64Array
  private e2: Float64Array
  private nodes = 0
  private shadowMask: Uint8Array

  constructor(positions: Float64Array | number[], shadowMask: Uint8Array) {
    this.shadowMask = shadowMask
    const n = positions.length / 9
    this.v0 = new Float64Array(n * 3)
    this.e1 = new Float64Array(n * 3)
    this.e2 = new Float64Array(n * 3)
    const centroid = new Float64Array(n * 3)
    const tmin = new Float64Array(n * 3)
    const tmax = new Float64Array(n * 3)
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const a = positions[i * 9 + k], b = positions[i * 9 + 3 + k], c = positions[i * 9 + 6 + k]
        this.v0[i * 3 + k] = a
        this.e1[i * 3 + k] = b - a
        this.e2[i * 3 + k] = c - a
        centroid[i * 3 + k] = (a + b + c) / 3
        tmin[i * 3 + k] = Math.min(a, b, c)
        tmax[i * 3 + k] = Math.max(a, b, c)
      }
    }
    const maxNodes = n * 2 + 1
    this.nodeMin = new Float64Array(maxNodes * 3)
    this.nodeMax = new Float64Array(maxNodes * 3)
    this.nodeStart = new Int32Array(maxNodes)
    this.nodeCount = new Int32Array(maxNodes)
    this.nodeRight = new Int32Array(maxNodes)
    this.order = new Int32Array(n)
    for (let i = 0; i < n; i++) this.order[i] = i
    this.build(0, n, centroid, tmin, tmax)
  }

  private build(start: number, end: number, centroid: Float64Array, tmin: Float64Array, tmax: Float64Array): number {
    const node = this.nodes++
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    let cminX = Infinity, cminY = Infinity, cminZ = Infinity, cmaxX = -Infinity, cmaxY = -Infinity, cmaxZ = -Infinity
    for (let i = start; i < end; i++) {
      const t = this.order[i]
      minX = Math.min(minX, tmin[t * 3]); minY = Math.min(minY, tmin[t * 3 + 1]); minZ = Math.min(minZ, tmin[t * 3 + 2])
      maxX = Math.max(maxX, tmax[t * 3]); maxY = Math.max(maxY, tmax[t * 3 + 1]); maxZ = Math.max(maxZ, tmax[t * 3 + 2])
      cminX = Math.min(cminX, centroid[t * 3]); cminY = Math.min(cminY, centroid[t * 3 + 1]); cminZ = Math.min(cminZ, centroid[t * 3 + 2])
      cmaxX = Math.max(cmaxX, centroid[t * 3]); cmaxY = Math.max(cmaxY, centroid[t * 3 + 1]); cmaxZ = Math.max(cmaxZ, centroid[t * 3 + 2])
    }
    this.nodeMin.set([minX, minY, minZ], node * 3)
    this.nodeMax.set([maxX, maxY, maxZ], node * 3)
    const count = end - start
    if (count <= 4) {
      this.nodeStart[node] = start
      this.nodeCount[node] = count
      return node
    }
    const ext = [cmaxX - cminX, cmaxY - cminY, cmaxZ - cminZ]
    const axis = ext[0] > ext[1] ? (ext[0] > ext[2] ? 0 : 2) : ext[1] > ext[2] ? 1 : 2
    // Binned SAH split.
    const BINS = 12
    const cmin = [cminX, cminY, cminZ][axis]
    const scale = ext[axis] > 0 ? BINS / ext[axis] : 0
    let mid = (start + end) >> 1
    if (scale > 0) {
      const binCount = new Int32Array(BINS)
      const bmin = new Float64Array(BINS * 3).fill(Infinity)
      const bmax = new Float64Array(BINS * 3).fill(-Infinity)
      const binOf = (t: number) => Math.min(BINS - 1, Math.floor((centroid[t * 3 + axis] - cmin) * scale))
      for (let i = start; i < end; i++) {
        const t = this.order[i]
        const b = binOf(t)
        binCount[b]++
        for (let k = 0; k < 3; k++) {
          bmin[b * 3 + k] = Math.min(bmin[b * 3 + k], tmin[t * 3 + k])
          bmax[b * 3 + k] = Math.max(bmax[b * 3 + k], tmax[t * 3 + k])
        }
      }
      const area = (mn: number[], mx: number[]) => {
        const dx = mx[0] - mn[0], dy = mx[1] - mn[1], dz = mx[2] - mn[2]
        return dx < 0 ? 0 : dx * dy + dy * dz + dz * dx
      }
      let bestCost = Infinity
      let bestSplit = -1
      for (let s = 1; s < BINS; s++) {
        const lmn = [Infinity, Infinity, Infinity], lmx = [-Infinity, -Infinity, -Infinity]
        const rmn = [Infinity, Infinity, Infinity], rmx = [-Infinity, -Infinity, -Infinity]
        let lc = 0, rc = 0
        for (let b = 0; b < BINS; b++) {
          if (!binCount[b]) continue
          const [mn, mx] = b < s ? [lmn, lmx] : [rmn, rmx]
          for (let k = 0; k < 3; k++) {
            mn[k] = Math.min(mn[k], bmin[b * 3 + k])
            mx[k] = Math.max(mx[k], bmax[b * 3 + k])
          }
          if (b < s) lc += binCount[b]
          else rc += binCount[b]
        }
        if (!lc || !rc) continue
        const cost = lc * area(lmn, lmx) + rc * area(rmn, rmx)
        if (cost < bestCost) {
          bestCost = cost
          bestSplit = s
        }
      }
      if (bestSplit > 0) {
        let i = start, j = end - 1
        while (i <= j) {
          if (binOf(this.order[i]) < bestSplit) i++
          else {
            const tmp = this.order[i]
            this.order[i] = this.order[j]
            this.order[j] = tmp
            j--
          }
        }
        mid = i
        if (mid === start || mid === end) mid = (start + end) >> 1
      }
    }
    this.nodeCount[node] = 0
    const left = this.build(start, mid, centroid, tmin, tmax)
    this.nodeStart[node] = left
    this.nodeRight[node] = this.build(mid, end, centroid, tmin, tmax)
    return node
  }

  private stack = new Int32Array(128)

  /**
   * Closest hit (or any hit with `shadow`; triangles with shadowMask=0 are skipped then).
   * Returns false when nothing is hit before tMax.
   */
  intersect(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tMax: number, shadow: boolean, out: Hit): boolean {
    const idx = 1 / dx, idy = 1 / dy, idz = 1 / dz
    const { nodeMin, nodeMax, nodeStart, nodeCount, nodeRight, order, v0, e1, e2, shadowMask, stack } = this
    let sp = 0
    stack[sp++] = 0
    let found = false
    let best = tMax
    while (sp > 0) {
      const node = stack[--sp]
      const n3 = node * 3
      let t1 = (nodeMin[n3] - ox) * idx, t2 = (nodeMax[n3] - ox) * idx
      let tn = Math.min(t1, t2), tf = Math.max(t1, t2)
      t1 = (nodeMin[n3 + 1] - oy) * idy; t2 = (nodeMax[n3 + 1] - oy) * idy
      tn = Math.max(tn, Math.min(t1, t2)); tf = Math.min(tf, Math.max(t1, t2))
      t1 = (nodeMin[n3 + 2] - oz) * idz; t2 = (nodeMax[n3 + 2] - oz) * idz
      tn = Math.max(tn, Math.min(t1, t2)); tf = Math.min(tf, Math.max(t1, t2))
      if (tf < Math.max(tn, 0) || tn > best) continue

      const count = nodeCount[node]
      if (count === 0) {
        stack[sp++] = nodeRight[node]
        stack[sp++] = nodeStart[node]
        continue
      }
      const s = nodeStart[node]
      for (let k = s; k < s + count; k++) {
        const t = order[k]
        if (shadow && !shadowMask[t]) continue
        const i3 = t * 3
        const e1x = e1[i3], e1y = e1[i3 + 1], e1z = e1[i3 + 2]
        const e2x = e2[i3], e2y = e2[i3 + 1], e2z = e2[i3 + 2]
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x
        const det = e1x * px + e1y * py + e1z * pz
        if (det > -1e-12 && det < 1e-12) continue
        const inv = 1 / det
        const tx = ox - v0[i3], ty = oy - v0[i3 + 1], tz = oz - v0[i3 + 2]
        const u = (tx * px + ty * py + tz * pz) * inv
        if (u < 0 || u > 1) continue
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x
        const v = (dx * qx + dy * qy + dz * qz) * inv
        if (v < 0 || u + v > 1) continue
        const dist = (e2x * qx + e2y * qy + e2z * qz) * inv
        if (dist > 1e-5 && dist < best) {
          best = dist
          found = true
          out.tri = t
          out.t = dist
          out.u = u
          out.v = v
          if (shadow) return true
        }
      }
    }
    return found
  }
}
