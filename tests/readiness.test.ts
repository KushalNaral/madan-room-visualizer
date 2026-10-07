import { describe, expect, it } from 'vitest'
import { combinedDownload, overallProgress, pickQuality } from '../src/editor/lib/readiness'

describe('detection readiness', () => {
  it('picks the accurate model only on a GPU with memory to spare', () => {
    expect(pickQuality({ audience: 'staff', webgpu: true, memory: 8 })).toBe('accurate')
    expect(pickQuality({ audience: 'staff', webgpu: true })).toBe('accurate')
    expect(pickQuality({ audience: 'staff', webgpu: false, memory: 16 })).toBe('fast')
    expect(pickQuality({ audience: 'staff', webgpu: true, memory: 2 })).toBe('fast')
    expect(pickQuality({ audience: 'staff', webgpu: true, memory: 8, saveData: true })).toBe('fast')
    expect(pickQuality({ audience: 'shopper', webgpu: true, memory: 4 })).toBe('fast')
    expect(pickQuality({ audience: 'shopper', webgpu: true, memory: 8 })).toBe('accurate')
  })

  it('reports one download percent across both models, weighted by size', () => {
    expect(combinedDownload({}, 'fast', true)).toBeNull()
    // SegFormer-B2 (~30 MB) half done, SAM (~14 MB) not started yet.
    expect(combinedDownload({ segformer: 50 }, 'fast', true)).toBe(34)
    expect(combinedDownload({ segformer: 100, sam: 50 }, 'fast', true)).toBe(84)
    expect(combinedDownload({ segformer: 100, sam: 100 }, 'fast', true)).toBeNull()
    expect(combinedDownload({ segformer: 100 }, 'fast', false)).toBeNull()
  })

  it('turns the phases into one bar that only moves forward', () => {
    const seen = [
      overallProgress('model', 0, null),
      overallProgress('model', 50, null),
      overallProgress('model', null, null),
      overallProgress('scan', null, { done: 0, total: 4 }),
      overallProgress('scan', null, { done: 4, total: 4 }),
      overallProgress('refine', null, { done: 1, total: 2 }),
    ]
    expect(seen).toEqual([0, 20, 40, 40, 85, 93])
    expect(overallProgress(null, null, null)).toBeNull()
  })
})
