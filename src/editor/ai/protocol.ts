/** Messages between the editor and its segmentation worker (see worker.ts). */

export interface RasterImage {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface WorkerConfig {
  /** ES module URL of transformers.js; loaded at runtime so hosts don't install it. */
  transformersUrl?: string
  /** Force a backend; by default WebGPU when available, else WASM. */
  device?: 'webgpu' | 'wasm'
}

export interface Prompt {
  /** 0..1 across the image. */
  x: number
  y: number
  positive: boolean
}

/** 'fast': SegFormer-B2, one pass. 'accurate': SegFormer-B5 over overlapping tiles, mirrored too. */
export type DetectQuality = 'fast' | 'accurate'

export interface DetectOptions {
  quality?: DetectQuality
  /**
   * Group name → ADE20K class names. Each pixel goes to the group with the highest summed
   * probability (or to none), so sofa + armchair + couch count together against "table".
   */
  groups: Record<string, string[]>
}

/** A box (0..1 across the image) plus at least one point (SAM's decoder needs one), for refining a region. */
export interface BoxPrompt {
  box: [number, number, number, number]
  points: Prompt[]
}

export interface RefineResult {
  width: number
  height: number
  /** SAM's three candidate masks for the prompt. */
  masks: Uint8Array[]
  scores: number[]
}

export type WorkerRequest =
  | { id: number; type: 'config'; config: WorkerConfig }
  | { id: number; type: 'detect'; image: RasterImage; options: DetectOptions }
  /** Loads the models ahead of time so the first detection doesn't wait for the download. */
  | { id: number; type: 'warm'; quality: DetectQuality; sam: boolean }
  | { id: number; type: 'refine'; prompt: BoxPrompt }
  | { id: number; type: 'embed'; image: RasterImage }
  | { id: number; type: 'segment'; prompts: Prompt[] }

export interface DetectedSegment {
  /** The group name from DetectOptions.groups. */
  label: string
  /** Mean probability of the group over its pixels, 0–1. */
  score: number | null
  mask: Uint8Array
}

export interface DetectResult {
  width: number
  height: number
  segments: DetectedSegment[]
}

export interface SegmentResult {
  width: number
  height: number
  mask: Uint8Array
  score: number
}

export type ModelName = 'segformer' | 'sam'

export type WorkerResponse =
  | { id: number; type: 'progress'; model: ModelName; progress: number; file?: string; stage?: { done: number; total: number } }
  | { id: number; type: 'result'; result: unknown }
  | { id: number; type: 'error'; message: string }

export const MODELS: Record<ModelName, string> = {
  segformer: 'Xenova/segformer-b2-finetuned-ade-512-512',
  sam: 'Xenova/slimsam-77-uniform',
}

/** SegFormer checkpoints per detection quality, with the square input each was trained on. */
export const SEGFORMERS: Record<DetectQuality, { id: string; size: number; approxMb: number }> = {
  fast: { id: 'Xenova/segformer-b2-finetuned-ade-512-512', size: 512, approxMb: 30 },
  accurate: { id: 'Xenova/segformer-b5-finetuned-ade-640-640', size: 640, approxMb: 90 },
}

/** SlimSAM's encoder + decoder, roughly, for weighting the combined download progress. */
export const SAM_APPROX_MB = 14

export const DEFAULT_TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js'
