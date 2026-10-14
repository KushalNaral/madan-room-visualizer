import { describe, expect, it } from 'vitest'
import { autoExposure, tonemap } from '../src/render/tonemap'
import { surfaceFragment } from '../src/render/shaders'

describe('tonemap (PBR Neutral)', () => {
  it('keeps mid tones as they are, so a fabric shows as its swatch', () => {
    const [r, g, b] = tonemap(0.5, 0.3, 0.2)
    expect(r).toBeCloseTo(0.46, 2)
    expect(g).toBeCloseTo(0.26, 2)
    expect(b).toBeCloseTo(0.16, 2)
  })

  it('rolls highlights off below white instead of clipping', () => {
    const [r] = tonemap(3, 3, 3)
    expect(r).toBeGreaterThan(0.9)
    expect(r).toBeLessThan(1)
  })

  it('is the curve the shader uses', () => {
    expect(surfaceFragment).toContain('toSrgb(tonemap(lit))')
    expect(surfaceFragment).toContain('0.0576 / (peak - 0.52)')
  })
})

describe('autoExposure', () => {
  it('lifts a dim room to a well-lit median', () => {
    const light = Array.from({ length: 100 }, (_, i) => 0.1 + i * 0.002)
    const { exposure, median } = autoExposure(light)
    expect(median * exposure).toBeCloseTo(0.8, 2)
  })

  it('holds back when sun patches would blow out, but never below a floor', () => {
    const light = [...Array(90).fill(0.2), ...Array(10).fill(3)]
    expect(autoExposure(light).exposure * 0.2).toBeCloseTo(0.55, 2)
  })
})
