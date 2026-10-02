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

export type WorkerRequest =
  | { id: number; type: 'config'; config: WorkerConfig }
  | { id: number; type: 'detect'; image: RasterImage }
  | { id: number; type: 'embed'; image: RasterImage }
  | { id: number; type: 'segment'; prompts: Prompt[] }

export interface DetectedSegment {
  label: string
  /** null when the model gives no per-class score (SegFormer). */
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
  | { id: number; type: 'progress'; model: ModelName; progress: number; file?: string }
  | { id: number; type: 'result'; result: unknown }
  | { id: number; type: 'error'; message: string }

export const MODELS: Record<ModelName, string> = {
  segformer: 'Xenova/segformer-b2-finetuned-ade-512-512',
  sam: 'Xenova/slimsam-77-uniform',
}

export const DEFAULT_TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js'
