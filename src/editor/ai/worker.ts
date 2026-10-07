/// <reference lib="webworker" />
/**
 * Segmentation worker for the room editor. Runs in-browser models through transformers.js:
 * - SegFormer (ADE20K) proposes walls, floor, sofa, curtains… for "Detect surfaces", over
 *   overlapping tiles at the model's own resolution (see semantic.ts).
 * - SlimSAM computes one image embedding per photo; each click then returns a mask quickly.
 * transformers.js is imported from a CDN at first use (configurable), and the models are
 * downloaded from the Hugging Face hub and cached by the browser.
 */
import {
  DEFAULT_TRANSFORMERS_URL,
  MODELS,
  SEGFORMERS,
  type BoxPrompt,
  type DetectOptions,
  type DetectQuality,
  type DetectResult,
  type ModelName,
  type RasterImage,
  type RefineResult,
  type SegmentResult,
  type WorkerConfig,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol'
import { accumulateTile, classGroups, groupProbabilities, segmentsFrom, tileOrigins, tilePixels } from './semantic'

type Transformers = typeof import('@huggingface/transformers')
type Device = 'webgpu' | 'wasm'

declare const self: DedicatedWorkerGlobalScope

let config: WorkerConfig = {}
let lib: Promise<Transformers> | null = null
type Segformer = { model: any; labels: string[]; device: Device }
const segformers: Partial<Record<DetectQuality, Promise<Segformer>>> = {}
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

function loadSegformer(id: number, quality: DetectQuality, devices?: Device[]): Promise<Segformer> {
  const { id: name } = SEGFORMERS[quality]
  return withFallback(async (device) => {
    const t = await transformers()
    const model = await t.AutoModelForSemanticSegmentation.from_pretrained(name, {
      device,
      // Half precision halves the WebGPU download; quantized weights are the fast choice on CPU.
      dtype: device === 'webgpu' ? 'fp16' : 'q8',
      progress_callback: progress(id, 'segformer'),
    })
    const map = (model.config as { id2label?: Record<string, string> }).id2label ?? {}
    const labels = Object.keys(map).sort((x, y) => Number(x) - Number(y)).map((k) => map[k])
    return { model, labels, device }
  }, devices)
}

async function runTile(seg: Segformer, pixels: Float32Array, size: number) {
  const t = await transformers()
  const out = await seg.model({ pixel_values: new t.Tensor('float32', pixels, [1, 3, size, size]) })
  const [, classes, h, w] = out.logits.dims as number[]
  return { logits: out.logits.data as Float32Array, classes, h, w }
}

/** The SegFormer for a quality, loaded once. A failed load is forgotten so the next try retries. */
function segformer(id: number, quality: DetectQuality): Promise<Segformer> {
  segformers[quality] ??= loadSegformer(id, quality).then((seg) => {
    post({ id, type: 'progress', model: 'segformer', progress: 100 })
    return seg
  }).catch((e) => {
    delete segformers[quality]
    throw e
  })
  return segformers[quality]!
}

/** The accurate model can fail to load on a weak GPU or low memory; the fast one stands in. */
async function bestSegformer(id: number, quality: DetectQuality): Promise<[Segformer, DetectQuality]> {
  try {
    return [await segformer(id, quality), quality]
  } catch (e) {
    if (quality === 'fast') throw e
    return [await segformer(id, 'fast'), 'fast']
  }
}

async function warm(id: number, quality: DetectQuality, withSam: boolean): Promise<true> {
  await Promise.all([bestSegformer(id, quality), withSam ? samModel(id) : null])
  return true
}

async function detect(id: number, img: RasterImage, options: DetectOptions): Promise<DetectResult> {
  let [seg, quality] = await bestSegformer(id, options.quality ?? 'fast')
  const { size } = SEGFORMERS[quality]

  const names = Object.keys(options.groups)
  const map = classGroups(seg.labels, names.map((n) => options.groups[n]))
  const { width: W, height: H, data } = img
  const acc = new Float32Array((names.length + 1) * W * H)
  const weight = new Float32Array(W * H)
  const origins = tileOrigins(W, H, size)
  const passes = origins.flatMap(([x, y]) => (quality === 'accurate' ? [false, true] : [false]).map((flip) => ({ x, y, flip })))

  for (let i = 0; i < passes.length; i++) {
    const { x, y, flip } = passes[i]
    const pixels = tilePixels(data, W, H, x, y, size, flip)
    let out = await runTile(seg, pixels, size)
    // Some GPUs overflow in half precision; redo on the CPU when that happens.
    if (seg.device === 'webgpu' && out.logits.some((v) => !Number.isFinite(v))) {
      segformers[quality] = loadSegformer(id, quality, ['wasm'])
      seg = await segformers[quality]!
      out = await runTile(seg, pixels, size)
    }
    const probs = groupProbabilities(out.logits, out.classes, out.h, out.w, map, names.length)
    accumulateTile(acc, weight, W, H, probs, names.length + 1, out.h, out.w, x, y, size, flip)
    post({ id, type: 'progress', model: 'segformer', progress: 100, stage: { done: i + 1, total: passes.length } })
  }
  return { width: W, height: H, segments: segmentsFrom(acc, weight, W, H, names) }
}

async function samModel(id: number) {
  const t = await transformers()
  sam ??= withFallback(async (device) => {
    const onProgress = progress(id, 'sam')
    const model = await t.SamModel.from_pretrained(MODELS.sam, { device, dtype: device === 'webgpu' ? 'fp16' : 'q8', progress_callback: onProgress })
    const processor = await t.AutoProcessor.from_pretrained(MODELS.sam, { progress_callback: onProgress })
    post({ id, type: 'progress', model: 'sam', progress: 100 })
    return { model, processor, device }
    // SAM's fp16 WebGPU encoder crashed the tab on test machines; the quantized WASM one is
    // slower to prepare (once per photo) but each click is quick either way.
  }, ['wasm']).catch((e) => {
    sam = null
    throw e
  })
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

/** SAM's three masks for a box (plus optional points) on the embedded photo. */
async function refine(id: number, prompt: BoxPrompt): Promise<RefineResult> {
  if (!embedding) throw new Error('No photo loaded for magic select yet.')
  const t = await transformers()
  const { model, processor } = await samModel(id)
  const { inputs, embeddings } = embedding
  const [rh, rw] = inputs.reshaped_input_sizes[0] as [number, number]
  const [x0, y0, x1, y1] = prompt.box
  const input_boxes = new t.Tensor('float32', [x0 * rw, y0 * rh, x1 * rw, y1 * rh], [1, 1, 4])
  const pts = prompt.points
  if (!pts.length) throw new Error('A box prompt needs a point inside it.')
  const input_points = new t.Tensor('float32', pts.flatMap((p) => [p.x * rw, p.y * rh]), [1, 1, pts.length, 2])
  const input_labels = new t.Tensor('int64', pts.map((p) => BigInt(p.positive ? 1 : 0)), [1, 1, pts.length])
  const outputs = await model({ ...embeddings, input_boxes, input_points, input_labels })
  const masks = await processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes)
  const [, n, h, w] = masks[0].dims as number[]
  const data = masks[0].data as Uint8Array
  const out: Uint8Array[] = []
  for (let k = 0; k < n; k++) {
    const m = new Uint8Array(w * h)
    for (let i = 0; i < m.length; i++) m[i] = data[k * w * h + i] ? 1 : 0
    out.push(m)
  }
  return { width: w, height: h, masks: out, scores: Array.from(outputs.iou_scores.data as Float32Array).slice(0, n) }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  try {
    switch (req.type) {
      case 'config':
        config = { ...config, ...req.config }
        return post({ id: req.id, type: 'result', result: true })
      case 'detect': {
        const result = await detect(req.id, req.image, req.options)
        return post({ id: req.id, type: 'result', result }, result.segments.map((s) => s.mask.buffer))
      }
      case 'warm':
        return post({ id: req.id, type: 'result', result: await warm(req.id, req.quality, req.sam) })
      case 'embed':
        return post({ id: req.id, type: 'result', result: await embed(req.id, req.image) })
      case 'refine': {
        const result = await refine(req.id, req.prompt)
        return post({ id: req.id, type: 'result', result }, result.masks.map((m) => m.buffer))
      }
      case 'segment': {
        const result = await segment(req.id, req.prompts)
        return post({ id: req.id, type: 'result', result }, [result.mask.buffer])
      }
    }
  } catch (err) {
    post({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
