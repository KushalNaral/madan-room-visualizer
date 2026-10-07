import type { BoxPrompt, DetectOptions, DetectQuality, DetectResult, ModelName, Prompt, RasterImage, RefineResult, SegmentResult, WorkerConfig, WorkerRequest, WorkerResponse } from './protocol'

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void }
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never

/**
 * Promise wrapper around the segmentation worker. The host creates the worker (so its bundler
 * handles the worker file), e.g. in Vite:
 *   import SegmentWorker from '@madan/room-visualizer/editor-worker?worker'
 *   new SegmentClient(() => new SegmentWorker())
 */
export class SegmentClient {
  private worker: Worker | null = null
  private seq = 0
  private pending = new Map<number, Pending>()
  /** Called with download progress (0–100) while a model loads. */
  onProgress: ((model: ModelName, percent: number) => void) | null = null
  /** Called as detection works through the photo's tiles. */
  onStage: ((done: number, total: number) => void) | null = null

  constructor(
    private readonly create: () => Worker,
    private readonly config: WorkerConfig = {},
  ) {}

  private start(): Worker {
    if (this.worker) return this.worker
    const w = this.create()
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        if (msg.stage) return this.onStage?.(msg.stage.done, msg.stage.total)
        return this.onProgress?.(msg.model, msg.progress)
      }
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.type === 'error') p.reject(new Error(msg.message))
      else p.resolve(msg.result)
    }
    w.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'Segmentation worker failed'))
      this.pending.clear()
    }
    this.worker = w
    if (Object.keys(this.config).length) void this.call({ type: 'config', config: this.config })
    return w
  }

  private call<T>(req: DistributiveOmit<WorkerRequest, 'id'>, transfer: Transferable[] = []): Promise<T> {
    const w = this.start()
    const id = ++this.seq
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      w.postMessage({ ...req, id }, transfer)
    })
  }

  /** Semantic segmentation of the whole photo into the given groups of ADE20K classes. */
  detect(image: RasterImage, options: DetectOptions): Promise<DetectResult> {
    return this.call({ type: 'detect', image, options })
  }

  /** Downloads and prepares the models in the background; detect and magic select then start at once. */
  warm(quality: DetectQuality, sam = true): Promise<true> {
    return this.call({ type: 'warm', quality, sam })
  }

  /** SAM masks for a box on the embedded photo (call embed first). */
  refine(prompt: BoxPrompt): Promise<RefineResult> {
    const points = prompt.points.map((p) => ({ x: p.x, y: p.y, positive: p.positive }))
    return this.call({ type: 'refine', prompt: { box: [...prompt.box] as BoxPrompt['box'], points } })
  }

  /** Prepares magic select for a photo (one image embedding). */
  embed(image: RasterImage): Promise<{ width: number; height: number }> {
    return this.call({ type: 'embed', image })
  }

  /** The mask for the clicked points on the embedded photo. */
  segment(prompts: Prompt[]): Promise<SegmentResult> {
    // Plain copies: reactive (Proxy) arrays can't be posted to a worker.
    return this.call({ type: 'segment', prompts: prompts.map((p) => ({ x: p.x, y: p.y, positive: p.positive })) })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    for (const p of this.pending.values()) p.reject(new Error('Segmentation stopped'))
    this.pending.clear()
  }
}

/**
 * Whether the browser already holds a model's weights (transformers.js keeps them in Cache
 * Storage), so the editor knows if "first time only" applies.
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false
    const cache = await caches.open('transformers-cache')
    const keys = await cache.keys()
    return keys.some((r) => r.url.includes(`/${modelId}/`) && r.url.endsWith('.onnx'))
  } catch {
    return false
  }
}
