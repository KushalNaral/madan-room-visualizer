import type { AppliedItem } from '../composables/useVisualizerState'
import { swatchUrl } from '../render/textures'
import { formatPrice } from './utils'

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Room render + swatches + product list in one shareable image. */
export async function renderMoodboard(opts: {
  room: HTMLCanvasElement
  roomName: string
  items: AppliedItem[]
  total: number
  currency: string
  brand?: string
}): Promise<Blob> {
  const { room, items } = opts
  const W = 2400
  const pad = 64
  const imgW = 1560
  const imgH = Math.round((imgW * room.height) / room.width)
  const colX = pad + imgW + 56
  const colW = W - colX - pad
  const H = Math.max(imgH + pad * 2 + 120, 260 + items.length * 132 + 220)

  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#f6f3ee'
  ctx.fillRect(0, 0, W, H)

  const font = (w: number, s: number) => `${w} ${s}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`

  // Header
  ctx.fillStyle = '#1c1a17'
  ctx.font = font(700, 30)
  ctx.fillText((opts.brand ?? 'Madan Furnishers').toUpperCase(), pad, pad + 24)
  ctx.fillStyle = '#7a746b'
  ctx.font = font(500, 26)
  ctx.fillText(`${opts.roomName} · Moodboard`, pad, pad + 64)

  // Room
  const top = pad + 104
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 16
  roundRect(ctx, pad, top, imgW, imgH, 24)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.restore()
  ctx.save()
  roundRect(ctx, pad, top, imgW, imgH, 24)
  ctx.clip()
  ctx.drawImage(room, pad, top, imgW, imgH)
  ctx.restore()

  // Items
  let y = top
  ctx.fillStyle = '#1c1a17'
  ctx.font = font(700, 34)
  ctx.fillText('In this look', colX, y + 30)
  y += 64
  for (const a of items) {
    const sw = await loadImg(swatchUrl(a.variant.textureUrl, a.variant.thumbnailUrl, 200, a.variant.tiling === 'stretch' ? 0.74 : a.variant.tileSizeCm.h / a.variant.tileSizeCm.w))
    ctx.save()
    roundRect(ctx, colX, y, 104, 104, 18)
    ctx.clip()
    ctx.drawImage(sw, colX, y, 104, 104)
    ctx.restore()
    ctx.fillStyle = '#7a746b'
    ctx.font = font(600, 19)
    ctx.fillText(a.surface.label.toUpperCase(), colX + 128, y + 26)
    ctx.fillStyle = '#1c1a17'
    ctx.font = font(650, 27)
    ctx.fillText(a.product.name, colX + 128, y + 60, colW - 128)
    ctx.fillStyle = '#4a4640'
    ctx.font = font(450, 21)
    ctx.fillText(`${a.variant.name} · ${a.variant.sku}`, colX + 128, y + 92, colW - 128)
    if (a.estimate.total) {
      ctx.textAlign = 'right'
      ctx.fillStyle = '#1c1a17'
      ctx.font = font(600, 21)
      ctx.fillText(formatPrice(a.estimate.total, opts.currency), colX + colW, y + 26)
      ctx.textAlign = 'left'
    }
    y += 132
  }

  ctx.strokeStyle = '#ddd6cb'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(colX, y + 8)
  ctx.lineTo(colX + colW, y + 8)
  ctx.stroke()
  ctx.fillStyle = '#7a746b'
  ctx.font = font(500, 22)
  ctx.fillText('Estimated total', colX, y + 56)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#1c1a17'
  ctx.font = font(750, 36)
  ctx.fillText(formatPrice(opts.total, opts.currency), colX + colW, y + 60)
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/jpeg', 0.92))
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
