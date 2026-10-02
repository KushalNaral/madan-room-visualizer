/// <reference lib="webworker" />
/**
 * Segmentation worker for the room editor. Runs in-browser models through transformers.js:
 * - SegFormer (ADE20K) proposes walls, floor, sofa, curtains… for "Detect surfaces".
 * - SlimSAM computes one image embedding per photo; each click then returns a mask quickly.
 * transformers.js is imported from a CDN at first use (configurable), and the models are
 * downloaded from the Hugging Face hub and cached by the browser.
 */
import { DEFAULT_TRANSFORMERS_URL, MODELS, type DetectResult, type ModelName, type RasterImage, type SegmentResult, type WorkerConfig, type WorkerRequest, type WorkerResponse } from './protocol'

type Transformers = typeof import('@huggingface/transformers')
type Device = 'webgpu' | 'wasm'

declare const self: DedicatedWorkerGlobalScope

let config: WorkerConfig = {}
let lib: Promise<Transformers> | null = null
type Segmenter = (image: unknown) => Promise<{ label: string; score: number | null; mask: { data: Uint8Array | Uint8ClampedArray; width: number; height: number } }[]>
let segmenter: Promise<Segmenter> | null = null
let sam: Promise<{ model: any; processor: any; device: Device }> | null = null
let embedding: { inputs: any; embeddings: any } | null = null

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer)

function transformers(): Promise<Transformers> {
  lib ??= (import(/* @vite-ignore */ config.transformersUrl ?? DEFAULT_TRANSFORMERS_URL) as Promise<Transformers>).then((t) => {
    t.env.allowLocalModels = false
    return t
  })
  return lib
}

async function devices(): Promise<Device[]> {
  if (config.device) return [config.device]
  const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null
  return adapter ? ['webgpu', 'wasm'] : ['wasm']
}

/** Reports download progress across a model's files as one percentage. */
function progress(id: number, model: ModelName) {
  const files = new Map<string, { loaded: number; total: number }>()
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file) return
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
    let loaded = 0, total = 0
    for (const f of files.values()) [loaded, total] = [loaded + f.loaded, total + f.total]
    post({ id, type: 'progress', model, progress: total ? Math.round((loaded / total) * 100) : 0, file: p.file })
  }
}

async function withFallback<T>(load: (device: Device) => Promise<T>, prefer?: Device[]): Promise<T> {
  let last: unknown
  const available = await devices()
  const order = prefer && !config.device ? prefer.filter((d) => available.includes(d)) : available
  for (const device of order) {
    try {
      return await load(device)
    } catch (e) {
      last = e
    }
  }
  throw last
}

function rawImage(t: Transformers, img: RasterImage) {
  return new t.RawImage(new Uint8ClampedArray(img.data), img.width, img.height, 4)
}

async function detect(id: number, img: RasterImage): Promise<DetectResult> {
  const t = await transformers()
  segmenter ??= withFallback((device) =>
    t.pipeline('image-segmentation', MODELS.segformer, { device, dtype: device === 'webgpu' ? 'fp32' : 'q8', progress_callback: progress(id, 'segformer') }),
  ) as unknown as Promise<Segmenter>
  const run = await segmenter
  const out = await run(rawImage(t, img))
  const segments = out.map((s) => {
    // Pipeline masks are 0/255 at the input size; the editor wants 0/1.
    const mask = new Uint8Array(s.mask.width * s.mask.height)
    for (let i = 0; i < mask.length; i++) mask[i] = s.mask.data[i] > 127 ? 1 : 0
    return { label: s.label, score: s.score ?? null, mask }
  })
  return { width: img.width, height: img.height, segments }
}

async function samModel(id: number) {
  const t = await transformers()
  sam ??= withFallback(async (device) => {
    const onProgress = progress(id, 'sam')
    const model = await t.SamModel.from_pretrained(MODELS.sam, { device, dtype: device === 'webgpu' ? 'fp16' : 'q8', progress_callback: onProgress })
    const processor = await t.AutoProcessor.from_pretrained(MODELS.sam, { progress_callback: onProgress })
    return { model, processor, device }
    // SAM's fp16 WebGPU encoder crashed the tab on test machines; the quantized WASM one is
    // slower to prepare (once per photo) but each click is quick either way.
  }, ['wasm'])
  return sam
}

async function embed(id: number, img: RasterImage): Promise<{ width: number; height: number }> {
  const t = await transformers()
  const { model, processor } = await samModel(id)
  const inputs = await processor(rawImage(t, img))
  embedding = { inputs, embeddings: await model.get_image_embeddings(inputs) }
  return { width: img.width, height: img.height }
}

async function segment(id: number, prompts: { x: number; y: number; positive: boolean }[]): Promise<SegmentResult> {
  if (!embedding) throw new Error('No photo loaded for magic select yet.')
  const t = await transformers()
  const { model, processor } = await samModel(id)
  const { inputs, embeddings } = embedding
  const [rh, rw] = inputs.reshaped_input_sizes[0] as [number, number]
  const points = prompts.flatMap((p) => [p.x * rw, p.y * rh])
  const input_points = new t.Tensor('float32', points, [1, 1, prompts.length, 2])
  const input_labels = new t.Tensor('int64', prompts.map((p) => BigInt(p.positive ? 1 : 0)), [1, 1, prompts.length])
  const outputs = await model({ ...embeddings, input_points, input_labels })
  const masks = await processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes)
  const [, n, h, w] = masks[0].dims as number[]
  const scores = Array.from(outputs.iou_scores.data as Float32Array)
  const best = scores.slice(0, n).reduce((b, s, i) => (s > scores[b] ? i : b), 0)
  const data = masks[0].data as Uint8Array
  const mask = new Uint8Array(w * h)
  const offset = best * w * h
  for (let i = 0; i < mask.length; i++) mask[i] = data[offset + i] ? 1 : 0
  return { width: w, height: h, mask, score: scores[best] }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  try {
    switch (req.type) {
      case 'config':
        config = { ...config, ...req.config }
        return post({ id: req.id, type: 'result', result: true })
      case 'detect': {
        const result = await detect(req.id, req.image)
        return post({ id: req.id, type: 'result', result }, result.segments.map((s) => s.mask.buffer))
      }
      case 'embed':
        return post({ id: req.id, type: 'result', result: await embed(req.id, req.image) })
      case 'segment': {
        const result = await segment(req.id, req.prompts)
        return post({ id: req.id, type: 'result', result }, [result.mask.buffer])
      }
    }
  } catch (err) {
    post({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
