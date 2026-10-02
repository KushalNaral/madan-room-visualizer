import { describe, expect, it } from 'vitest'
import { signedArea, traceRings, vectorize } from '../src/editor/lib/contours'
import { components, emptyMask, iou, paintDisc, paintStroke, rasterize, type Mask } from '../src/editor/lib/mask'
import { fitPlane, orderCorners, planeIssue } from '../src/editor/lib/planeFit'
import { kindFromName, presetForLabel, suggestAccepts } from '../src/editor/lib/presets'
import { slugify, uniqueId, nextLabel } from '../src/editor/lib/ids'
import { splitWalls } from '../src/editor/lib/wallSplit'
import { fitWarp } from '../src/editor/lib/warpFit'
import type { Point } from '../src/types'

function rect(m: Mask, x0: number, y0: number, x1: number, y1: number, v: 0 | 1 = 1) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m.data[y * m.width + x] = v
}

/** Fills a convex polygon into a mask (test fixture). */
function fillPoly(m: Mask, poly: Point[]) {
  const r = rasterize({ polygons: [poly] }, m.width, m.height)
  for (let i = 0; i < m.data.length; i++) m.data[i] |= r.data[i]
}

describe('contours', () => {
  it('traces a square as one outer ring with its 4 corners', () => {
    const m = emptyMask(20, 20)
    rect(m, 5, 4, 15, 12)
    const rings = traceRings(m)
    expect(rings).toHaveLength(1)
    expect(signedArea(rings[0])).toBe(-80)
    const v = vectorize(m, { minArea: 1 })
    expect(v.cutouts).toEqual([])
    expect(v.polygons).toHaveLength(1)
    expect(new Set(v.polygons[0].map((p) => `${p.x},${p.y}`))).toEqual(new Set(['5,4', '15,4', '15,12', '5,12']))
  })

  it('keeps holes (and islands inside them) as even-odd rings, dropping specks', () => {
    const m = emptyMask(40, 40)
    rect(m, 2, 2, 38, 38)
    rect(m, 10, 10, 24, 24, 0)
    rect(m, 14, 14, 18, 18) // wall seen through a gap in the object in front
    rect(m, 30, 30, 31, 31, 0) // one-pixel hole: a speck
    const v = vectorize(m, { minArea: 4 })
    expect(v.polygons).toHaveLength(3)
    expect(v.cutouts).toEqual([])
    expect(v.polygons.map((r) => Math.sign(signedArea(r)))).toEqual([-1, 1, -1])
    expect(iou(rasterize(v, 40, 40), m)).toBeGreaterThan(0.99)
  })

  it('subtracts cut-outs traced by hand, even where they stick out', () => {
    const mask = rasterize({ polygons: [[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]], cutouts: [[{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }]] }, 20, 20)
    expect(mask.data.reduce((s, v) => s + v, 0)).toBe(75)
  })

  it('round-trips a blob through vectorize and rasterize', () => {
    const m = emptyMask(120, 90)
    paintDisc(m, 50, 45, 30, 1)
    paintStroke(m, { x: 60, y: 20 }, { x: 110, y: 70 }, 8, 1)
    paintDisc(m, 50, 45, 8, 0)
    const poly = vectorize(m, { tolerance: 1 })
    expect(iou(rasterize(poly, 120, 90), m)).toBeGreaterThan(0.97)
  })

  it('scales coordinates from the working raster to the photo', () => {
    const m = emptyMask(10, 10)
    rect(m, 2, 2, 8, 8)
    const v = vectorize(m, { minArea: 1, scale: 2.5 })
    expect(Math.max(...v.polygons[0].map((p) => p.x))).toBe(20)
    expect(iou(rasterize(v, 10, 10, 0.4), m)).toBe(1)
  })

  it('keeps diagonal-touching pixels as valid rings', () => {
    const m = emptyMask(4, 4)
    m.data[1 * 4 + 1] = 1
    m.data[2 * 4 + 2] = 1
    const rings = traceRings(m)
    expect(rings.reduce((s, r) => s + signedArea(r), 0)).toBe(-2)
  })
})

describe('components', () => {
  it('separates parts, largest first, dropping small ones', () => {
    const m = emptyMask(30, 10)
    rect(m, 0, 0, 5, 5)
    rect(m, 10, 0, 30, 10)
    rect(m, 7, 8, 8, 9)
    const parts = components(m, 2)
    expect(parts.map((p) => p.data.reduce((s, v) => s + v, 0))).toEqual([200, 25])
  })
})

describe('plane fit', () => {
  it('recovers a trapezoid (a floor in perspective) from its mask', () => {
    const trapezoid = [{ x: 60, y: 40 }, { x: 140, y: 40 }, { x: 190, y: 110 }, { x: 10, y: 110 }]
    const m = emptyMask(200, 120)
    fillPoly(m, trapezoid)
    const pts: Point[] = []
    for (const ring of vectorize(m).polygons) pts.push(...ring)
    const q = fitPlane(pts)!
    q.forEach((p, i) => {
      expect(Math.abs(p.x - trapezoid[i].x)).toBeLessThan(3)
      expect(Math.abs(p.y - trapezoid[i].y)).toBeLessThan(3)
    })
  })

  it('encloses a wall whose corner is hidden behind a cabinet (notched mask)', () => {
    const m = emptyMask(100, 80)
    rect(m, 10, 10, 90, 70)
    rect(m, 70, 50, 90, 70, 0)
    const pts = vectorize(m).polygons.flat()
    const q = fitPlane(pts)!
    expect(q[2].x).toBeGreaterThanOrEqual(89)
    expect(q[2].y).toBeGreaterThanOrEqual(69)
  })

  it('orders corners TL, TR, BR, BL whatever the input order', () => {
    const q = orderCorners([{ x: 10, y: 90 }, { x: 90, y: 10 }, { x: 5, y: 5 }, { x: 95, y: 95 }])
    expect(q).toEqual([{ x: 5, y: 5 }, { x: 90, y: 10 }, { x: 95, y: 95 }, { x: 10, y: 90 }])
  })

  it('flags bow-tie and squashed planes', () => {
    expect(planeIssue([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }])).toBe('self-intersecting')
    expect(planeIssue([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }])).toBeNull()
    expect(planeIssue([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 5 }, { x: 100, y: 5 }])).toBe('skewed')
  })
})

describe('presets and ids', () => {
  const categories = [
    { id: '3', name: 'Curtains' },
    { id: '5', name: 'Sheer curtains' },
    { id: '8', name: 'Wallpaper' },
    { id: '9', name: 'Carpets' },
    { id: '11', name: 'Sofa fabric' },
  ]
  it('maps SegFormer labels to presets', () => {
    expect(presetForLabel('wall')?.kind).toBe('wall')
    expect(presetForLabel('armchair')?.kind).toBe('sofa')
    expect(presetForLabel('bed ')?.kind).toBe('bed')
    expect(presetForLabel('person')).toBeUndefined()
  })
  it('suggests accepted categories by name, or from the host mapping', () => {
    expect(suggestAccepts('curtain', categories)).toEqual(['3', '5'])
    expect(suggestAccepts('wall', categories)).toEqual(['8'])
    expect(suggestAccepts('floor', categories)).toEqual(['9'])
    expect(suggestAccepts('sofa', categories)).toEqual(['11'])
    expect(suggestAccepts('wall', categories, { wall: ['8', '404'] })).toEqual(['8'])
  })
  it('infers a surface kind from its id or label', () => {
    expect(kindFromName('feature-wall Feature wall')).toBe('wall')
    expect(kindFromName('window-wall')).toBe('wall')
    expect(kindFromName('floor-rug Floor rug')).toBe('rug')
    expect(kindFromName('Armchair')).toBe('sofa')
    expect(kindFromName('Sheer curtains')).toBe('curtain')
    expect(kindFromName('duvet')).toBe('bed')
    expect(kindFromName('bedside lamp')).toBe('bed')
    expect(kindFromName('Lamp shade')).toBeUndefined()
  })
  it('makes unique ids and labels', () => {
    expect(slugify('Feature wall (left)')).toBe('feature-wall-left')
    expect(uniqueId('Wall', ['wall', 'wall-2'])).toBe('wall-3')
    expect(nextLabel('Wall', ['Wall'])).toBe('Wall 2')
  })
})

describe('wall splitting', () => {
  it('cuts one wall mask at the room corner', () => {
    const w = 200, h = 100
    const wall = emptyMask(w, h)
    rect(wall, 0, 10, 200, 80)
    const gray = new Float32Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = x < 120 ? 200 : 120
    const walls = splitWalls(wall, gray)
    expect(walls).toHaveLength(2)
    const widths = walls.map((m) => m.data.reduce((s, v) => s + v, 0) / 70)
    expect(Math.abs(widths[0] - 120)).toBeLessThan(3)
  })
  it('leaves a plain wall whole', () => {
    const wall = emptyMask(100, 60)
    rect(wall, 0, 0, 100, 60)
    expect(splitWalls(wall, new Float32Array(6000).fill(180))).toHaveLength(1)
  })
})

describe('warp fit', () => {
  it('spans each row of the outline', () => {
    const m = emptyMask(100, 60)
    fillPoly(m, [{ x: 30, y: 0 }, { x: 70, y: 0 }, { x: 95, y: 60 }, { x: 5, y: 60 }])
    const g = fitWarp(m, 4, 3)!
    expect(g.points).toHaveLength(20)
    const top = g.points.slice(0, 5), bottom = g.points.slice(15)
    expect(top[4].x - top[0].x).toBeLessThan(bottom[4].x - bottom[0].x)
  })
})
