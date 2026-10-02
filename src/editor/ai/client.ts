import type { DetectResult, ModelName, Prompt, RasterImage, SegmentResult, WorkerConfig, WorkerRequest, WorkerResponse } from './protocol'

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

  constructor(
    private readonly create: () => Worker,
    private readonly config: WorkerConfig = {},
  ) {}

  private start(): Worker {
    if (this.worker) return this.worker
    const w = this.create()
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') return this.onProgress?.(msg.model, msg.progress)
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

  /** Semantic segmentation of the whole photo (SegFormer ADE20K labels). */
  detect(image: RasterImage): Promise<DetectResult> {
    return this.call({ type: 'detect', image })
  }

  /** Prepares magic select for a photo (one image embedding). */
  embed(image: RasterImage): Promise<{ width: number; height: number }> {
    return this.call({ type: 'embed', image })
  }

  /** The mask for the clicked points on the embedded photo. */
  segment(prompts: Prompt[]): Promise<SegmentResult> {
    return this.call({ type: 'segment', prompts })
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    for (const p of this.pending.values()) p.reject(new Error('Segmentation stopped'))
    this.pending.clear()
  }
}
