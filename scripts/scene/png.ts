// Minimal PNG encoder (RGB/RGBA, 8-bit) with per-row adaptive filtering.
import { deflateSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

export function encodePng(width: number, height: number, pixels: Uint8Array, channels: 3 | 4): Buffer {
  const stride = width * channels
  const raw = new Uint8Array((stride + 1) * height)
  const candidate = new Uint8Array(stride)
  const best = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null
    let bestType = 0
    let bestScore = Infinity
    for (let type = 0; type < 5; type++) {
      let score = 0
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? row[i - channels] : 0
        const b = prev ? prev[i] : 0
        const c = prev && i >= channels ? prev[i - channels] : 0
        const pred = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : paeth(a, b, c)
        const v = (row[i] - pred) & 0xff
        candidate[i] = v
        score += v < 128 ? v : 256 - v
      }
      if (score < bestScore) {
        bestScore = score
        bestType = type
        best.set(candidate)
      }
    }
    raw[y * (stride + 1)] = bestType
    raw.set(best, y * (stride + 1) + 1)
  }

  const header = new Uint8Array(13)
  const dv = new DataView(header.buffer)
  dv.setUint32(0, width)
  dv.setUint32(4, height)
  header[8] = 8
  header[9] = channels === 4 ? 6 : 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}
