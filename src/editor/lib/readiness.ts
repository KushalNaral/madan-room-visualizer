import { SAM_APPROX_MB, SEGFORMERS, type DetectQuality, type ModelName } from '../ai/protocol'

export interface DeviceInfo {
  audience: 'staff' | 'shopper'
  webgpu: boolean
  /** navigator.deviceMemory in GB, when the browser tells. */
  memory?: number
  saveData?: boolean
}

/**
 * Which detection model suits this device. The accurate one (tiles, mirrored) is only worth it on
 * a GPU with memory to spare; shoppers get it on stronger devices only, since it's 3× the download.
 */
export function pickQuality(d: DeviceInfo): DetectQuality {
  if (!d.webgpu || d.saveData) return 'fast'
  const memory = d.memory ?? 8
  return memory >= (d.audience === 'staff' ? 4 : 8) ? 'accurate' : 'fast'
}

/** What the browser says about itself, for pickQuality. */
export async function deviceInfo(audience: DeviceInfo['audience']): Promise<DeviceInfo> {
  const nav = navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<unknown> }
    deviceMemory?: number
    connection?: { saveData?: boolean }
  }
  const adapter = nav.gpu ? await nav.gpu.requestAdapter().catch(() => null) : null
  return { audience, webgpu: !!adapter, memory: nav.deviceMemory, saveData: nav.connection?.saveData }
}

export function saveData(): boolean {
  return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
}

/**
 * One download percent across the models the job needs, weighted by size. A model that hasn't
 * reported yet counts as 0; null once everything is in (or nothing has started).
 */
export function combinedDownload(downloads: Partial<Record<ModelName, number>>, quality: DetectQuality, withSam: boolean): number | null {
  const parts: [number | undefined, number][] = [[downloads.segformer, SEGFORMERS[quality].approxMb]]
  if (withSam) parts.push([downloads.sam, SAM_APPROX_MB])
  if (parts.every(([p]) => p == null)) return null
  let done = 0, total = 0
  for (const [p, mb] of parts) [done, total] = [done + (p ?? 0) * mb, total + mb]
  const percent = Math.floor(done / total)
  return percent >= 100 ? null : percent
}

/** Share of the bar for each phase of "Detect surfaces": getting ready, scanning, sharpening. */
const SPANS = { model: [0, 40], scan: [40, 85], refine: [85, 100] } as const

/** The whole job as one 0–100 bar. `download` null means the models are in. */
export function overallProgress(phase: keyof typeof SPANS | null, download: number | null, step: { done: number; total: number } | null): number | null {
  if (!phase) return null
  const [from, to] = SPANS[phase]
  const share = phase === 'model' ? (download ?? 100) / 100 : step ? step.done / Math.max(1, step.total) : 0
  return Math.round(from + (to - from) * Math.min(1, share))
}
