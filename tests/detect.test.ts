import { describe, expect, it } from 'vitest'
import { accumulateTile, classGroups, groupProbabilities, segmentsFrom, tileOrigins, tilePixels } from '../src/editor/ai/semantic'
import { attachCushions, cleanRegion, mergeRefined, pickRefined } from '../src/editor/lib/detectPost'
import { closeMask, deepestPoint, emptyMask, fillHoles, maskArea, morph, type Mask } from '../src/editor/lib/mask'

function rect(m: Mask, x0: number, y0: number, x1: number, y1: number, v: 0 | 1 = 1) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m.data[y * m.width + x] = v
}

describe('semantic post-processing', () => {
  it('maps ADE classes to groups by name, ignoring stray spaces', () => {
    const map = classGroups(['wall', 'bed ', 'sofa', 'armchair', 'table'], [['wall'], ['bed'], ['sofa', 'armchair']])
    expect(Array.from(map)).toEqual([0, 1, 2, 2, -1])
  })

  it('covers a wide photo with overlapping tiles that reach both edges', () => {
    const tiles = tileOrigins(1024, 640, 640)
    expect(tiles).toEqual([[0, 0], [384, 0]])
    expect(tileOrigins(500, 400, 512)).toEqual([[0, 0]])
    const wide = tileOrigins(2000, 640, 640)
    expect(wide.at(-1)).toEqual([1360, 0])
    for (let i = 1; i < wide.length; i++) expect(wide[i][0] - wide[i - 1][0]).toBeLessThanOrEqual(640 * (2 / 3) + 1)
  })

  it('normalizes and mirrors tile pixels', () => {
    const data = new Uint8ClampedArray(2 * 1 * 4)
    data.set([255, 0, 0, 255, 0, 0, 255, 255])
    const plain = tilePixels(data, 2, 1, 0, 0, 2, false)
    const flipped = tilePixels(data, 2, 1, 0, 0, 2, true)
    // Red channel of the first pixel: (1 - 0.485) / 0.229
    expect(plain[0]).toBeCloseTo((1 - 0.485) / 0.229, 4)
    expect(flipped[1]).toBeCloseTo(plain[0], 6)
  })

  it('sums class probabilities per group so related classes beat a single rival', () => {
    // One pixel, 3 classes: sofa 0.35, armchair 0.25, table 0.4 → the sofa group wins with 0.6.
    const logits = new Float32Array([Math.log(0.35), Math.log(0.25), Math.log(0.4)])
    const probs = groupProbabilities(logits, 3, 1, 1, Int16Array.from([0, 0, -1]), 1)
    expect(probs[0]).toBeCloseTo(0.6, 5)
    expect(probs[1]).toBeCloseTo(0.4, 5)

    const acc = new Float32Array(2 * 4)
    const weight = new Float32Array(4)
    accumulateTile(acc, weight, 2, 2, probs, 2, 1, 1, 0, 0, 2, false)
    const [seg] = segmentsFrom(acc, weight, 2, 2, ['sofa'])
    expect(seg.label).toBe('sofa')
    expect(Array.from(seg.mask)).toEqual([1, 1, 1, 1])
    expect(seg.score).toBeCloseTo(0.6, 5)
  })

  it('averages overlapping tiles and un-mirrors flipped ones', () => {
    // Left half of a 2-wide logits map says group 0, right half "other".
    const probs = new Float32Array([1, 0, 0, 1])
    const acc = new Float32Array(2 * 4)
    const weight = new Float32Array(4)
    accumulateTile(acc, weight, 4, 1, probs, 2, 1, 2, 0, 0, 4, false)
    // The same tile seen mirrored: its left half is the photo's right half.
    const mirrored = new Float32Array([0, 1, 1, 0])
    accumulateTile(acc, weight, 4, 1, mirrored, 2, 1, 2, 0, 0, 4, true)
    const [seg] = segmentsFrom(acc, weight, 4, 1, ['a'])
    expect(Array.from(seg.mask)).toEqual([1, 1, 0, 0])
    expect(Array.from(weight)).toEqual([2, 2, 2, 2])
  })
})

describe('mask morphology', () => {
  it('dilates and erodes by a square, keeping the image edge', () => {
    const m = emptyMask(10, 10)
    rect(m, 4, 4, 6, 6)
    expect(maskArea(morph(m, 1, 'dilate'))).toBe(16)
    expect(maskArea(morph(morph(m, 1, 'dilate'), 1, 'erode'))).toBe(4)
    const full = emptyMask(6, 6)
    full.data.fill(1)
    expect(maskArea(morph(full, 2, 'erode'))).toBe(36)
  })

  it('closes a crack and fills enclosed holes up to a size, never ones touching the edge', () => {
    const m = emptyMask(20, 20)
    rect(m, 2, 2, 18, 18)
    rect(m, 9, 2, 10, 18, 0) // one-pixel crack down the middle
    expect(maskArea(closeMask(m, 1))).toBe(16 * 16)

    const holey = emptyMask(20, 20)
    rect(holey, 0, 2, 18, 18)
    rect(holey, 5, 5, 8, 8, 0) // 9 px hole
    rect(holey, 10, 5, 16, 15, 0) // 60 px hole
    expect(maskArea(fillHoles(holey, 20))).toBe(maskArea(holey) + 9)
    const open = emptyMask(10, 10)
    rect(open, 0, 0, 10, 10)
    rect(open, 0, 4, 3, 6, 0) // notch at the border is not a hole
    expect(maskArea(fillHoles(open, 100))).toBe(maskArea(open))
  })

  it('finds the point deepest inside a shape', () => {
    const m = emptyMask(30, 12)
    rect(m, 2, 2, 8, 10) // small square
    rect(m, 12, 1, 28, 11) // larger rectangle
    const p = deepestPoint(m)!
    expect(p.x).toBeGreaterThanOrEqual(17)
    expect(p.x).toBeLessThanOrEqual(23)
    expect(p.y).toBeGreaterThanOrEqual(5)
    expect(p.y).toBeLessThanOrEqual(6)
  })
})

describe('detection clean-up', () => {
  it('joins cushions to the sofa they touch and drops lone ones', () => {
    const sofa = emptyMask(100, 60)
    rect(sofa, 10, 30, 90, 55)
    const onSofa = emptyMask(100, 60)
    rect(onSofa, 20, 22, 30, 30)
    const lone = emptyMask(100, 60)
    rect(lone, 2, 2, 6, 6)
    const regions = [{ kind: 'sofa' as const, mask: sofa }]
    attachCushions([onSofa, lone], regions)
    expect(maskArea(regions[0].mask)).toBe(maskArea(sofa) + 80)
  })

  it('fills a pattern hole in a curtain but keeps a wall’s hole where a sofa stands', () => {
    const m = emptyMask(200, 100)
    rect(m, 0, 0, 200, 100)
    rect(m, 80, 40, 120, 70, 0) // 1200 px: something in front
    expect(maskArea(cleanRegion(m, 'wall'))).toBe(maskArea(m))
    const curtain = emptyMask(200, 100)
    rect(curtain, 20, 0, 80, 100)
    rect(curtain, 40, 40, 46, 46, 0) // a dark stripe read as something else
    expect(maskArea(cleanRegion(curtain, 'curtain'))).toBe(60 * 100)
  })

  it('takes SAM’s outline near the edge only, and only when it agrees', () => {
    const region = emptyMask(100, 100)
    rect(region, 20, 20, 80, 80)
    const sharper = emptyMask(100, 100)
    rect(sharper, 22, 18, 78, 82)
    const wrong = emptyMask(100, 100)
    rect(wrong, 0, 0, 100, 100)
    expect(pickRefined(region, [wrong, sharper])).toBe(sharper)
    expect(pickRefined(region, [wrong])).toBeNull()

    const leaky = emptyMask(100, 100)
    rect(leaky, 22, 18, 100, 82) // SAM ran off to the right
    const merged = mergeRefined(region, leaky, 5)
    for (let y = 0; y < 100; y++) expect(merged.data[y * 100 + 95]).toBe(0)
    expect(merged.data[19 * 100 + 50]).toBe(1) // grew 1-2 px up where SAM saw more
    expect(merged.data[50 * 100 + 21]).toBe(0) // shrank on the left with SAM
  })
})
