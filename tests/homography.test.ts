import { describe, expect, it } from 'vitest'
import { apply, invert, quadToSquare, squareToQuad, toColumnMajor } from '../src/render/homography'
import type { Quad } from '../src/types'

const UNIT = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]

const quads: Record<string, Quad> = {
  rectangle: [{ x: 400, y: 200 }, { x: 1200, y: 200 }, { x: 1200, y: 650 }, { x: 400, y: 650 }],
  parallelogram: [{ x: 0, y: 0 }, { x: 100, y: 20 }, { x: 130, y: 120 }, { x: 30, y: 100 }],
  perspectiveWall: [{ x: 0, y: 0 }, { x: 400, y: 200 }, { x: 400, y: 650 }, { x: 0, y: 1000 }],
  floorOffImage: [{ x: 700, y: 720 }, { x: 1600, y: 880 }, { x: 2895, y: 4350 }, { x: 0, y: 1000 }],
}

describe('squareToQuad', () => {
  for (const [name, quad] of Object.entries(quads)) {
    it(`maps unit-square corners exactly onto the ${name}`, () => {
      const H = squareToQuad(quad)
      UNIT.forEach((u, i) => {
        const p = apply(H, u)
        expect(p.x).toBeCloseTo(quad[i].x, 6)
        expect(p.y).toBeCloseTo(quad[i].y, 6)
      })
    })

    it(`round-trips through the inverse for the ${name}`, () => {
      const toUnit = quadToSquare(quad)
      for (const u of [{ x: 0.25, y: 0.75 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.1 }]) {
        const back = apply(toUnit, apply(squareToQuad(quad), u))
        expect(back.x).toBeCloseTo(u.x, 9)
        expect(back.y).toBeCloseTo(u.y, 9)
      }
    })
  }

  it('preserves straight lines but not equal spacing under perspective', () => {
    const H = squareToQuad(quads.perspectiveWall)
    const near = apply(H, { x: 0.25, y: 0 }).x - apply(H, { x: 0, y: 0 }).x
    const far = apply(H, { x: 1, y: 0 }).x - apply(H, { x: 0.75, y: 0 }).x
    expect(near).toBeGreaterThan(far)
  })
})

describe('invert', () => {
  it('throws for a degenerate quad', () => {
    const collapsed: Quad = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]
    expect(() => invert(squareToQuad(collapsed))).toThrow()
  })
})

describe('toColumnMajor', () => {
  it('transposes for WebGL', () => {
    expect(Array.from(toColumnMajor([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toEqual([1, 4, 7, 2, 5, 8, 3, 6, 9])
  })
})
