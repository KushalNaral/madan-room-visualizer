import type { Point } from '../../types'
import { maskBounds, type Mask } from './mask'

/**
 * A warp grid that follows a curved surface's outline (sofa, curtains, bedding): each grid row
 * spans the mask's left and right edges at that height, so patterns bend with the silhouette
 * instead of starting flat. Coordinates are in raster pixels times `scale`.
 */
export function fitWarp(mask: Mask, cols = 8, rows = 6, scale = 1): { cols: number; rows: number; points: Point[] } | null {
  const b = maskBounds(mask)
  if (!b) return null
  const { width: w, data } = mask
  const span = (y: number): [number, number] | null => {
    // Look a few rows around y so a gap (an arm, a cushion seam) doesn't break the row.
    for (let d = 0; d <= 6; d++) {
      for (const yy of [y - d, y + d]) {
        if (yy < b.minY || yy > b.maxY) continue
        let l = -1, r = -1
        for (let x = b.minX; x <= b.maxX; x++) {
          if (data[yy * w + x]) {
            if (l < 0) l = x
            r = x + 1
          }
        }
        if (l >= 0) return [l, r]
      }
    }
    return null
  }
  const points: Point[] = []
  let last: [number, number] = [b.minX, b.maxX + 1]
  for (let j = 0; j <= rows; j++) {
    const y = b.minY + ((b.maxY + 1 - b.minY) * j) / rows
    const s = span(Math.min(b.maxY, Math.round(y))) ?? last
    last = s
    for (let i = 0; i <= cols; i++) {
      points.push({ x: Math.round((s[0] + ((s[1] - s[0]) * i) / cols) * scale * 10) / 10, y: Math.round(y * scale * 10) / 10 })
    }
  }
  return { cols, rows, points }
}
