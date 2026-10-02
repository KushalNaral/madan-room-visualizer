// Texture tiles. `procedural:<kind>?base=#hex&alt=#hex&extra=#hex` URLs are drawn on a
// canvas so the mock catalog needs no image assets; anything else is fetched.
// Repeating kinds are seamless at the canvas size; rug kinds are one-off designs.

type Ctx = CanvasRenderingContext2D
interface GenArgs {
  ctx: Ctx
  W: number
  H: number
  base: string
  alt: string
  extra: string
  rand: () => number
}
type Generator = (a: GenArgs) => void

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Parses `#rrggbb` or `rgb(r,g,b)` (generators chain mix/shade, which return rgb()). */
function rgb(color: string): [number, number, number] {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  const n = parseInt(color.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const f = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${f(r1, r2)},${f(g1, g2)},${f(b1, b2)})`
}

function shade(c: string, k: number) {
  return k >= 0 ? mix(c, '#ffffff', k) : mix(c, '#000000', -k)
}

function noise(a: GenArgs, amount: number) {
  const { ctx, W, H, rand } = a
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

/** Draws `fn` at the tile and its wrapped neighbours so shapes crossing an edge tile seamlessly. */
function wrapped(a: GenArgs, fn: () => void) {
  for (const dx of [-a.W, 0, a.W]) {
    for (const dy of [-a.H, 0, a.H]) {
      a.ctx.save()
      a.ctx.translate(dx, dy)
      fn()
      a.ctx.restore()
    }
  }
}

function fill(a: GenArgs, color: string) {
  a.ctx.fillStyle = color
  a.ctx.fillRect(0, 0, a.W, a.H)
}

/** Soft low-frequency mottling (wrapped radial blobs). */
function mottle(a: GenArgs, color: string, count: number, rMin: number, rMax: number, alpha: number) {
  const blobs = Array.from({ length: count }, () => ({
    x: a.rand() * a.W, y: a.rand() * a.H, r: rMin + a.rand() * (rMax - rMin), al: alpha * (0.4 + a.rand() * 0.6),
  }))
  wrapped(a, () => {
    for (const b of blobs) {
      const g = a.ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r)
      g.addColorStop(0, color)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      a.ctx.globalAlpha = b.al
      a.ctx.fillStyle = g
      a.ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2)
    }
  })
  a.ctx.globalAlpha = 1
}

function weaveLines(a: GenArgs, step: number, colA: string, colB: string, alphaMin: number, alphaVar: number) {
  const { ctx, W, H, rand } = a
  for (let i = 0; i < Math.max(W, H); i += step) {
    ctx.globalAlpha = alphaMin + rand() * alphaVar
    ctx.fillStyle = rand() > 0.5 ? colA : colB
    if (i < H) ctx.fillRect(0, i, W, 1)
    ctx.globalAlpha = alphaMin + rand() * alphaVar
    ctx.fillStyle = rand() > 0.5 ? colA : colB
    if (i < W) ctx.fillRect(i, 0, 1, H)
  }
  ctx.globalAlpha = 1
}

const generators: Record<string, Generator> = {
  paint(a) {
    fill(a, a.base)
    mottle(a, shade(a.base, -0.06), 10, 60, 180, 0.25)
    noise(a, 5)
  },

  laminate(a) {
    fill(a, a.base)
    mottle(a, shade(a.base, -0.04), 8, 100, 240, 0.2)
    noise(a, 3)
  },

  stripe(a) {
    const { ctx, W, H } = a
    fill(a, a.base)
    ctx.fillStyle = a.alt
    for (let x = 0; x < W; x += W / 4) {
      ctx.fillRect(x, 0, W / 8, H)
      ctx.fillRect(x + W * 0.17, 0, W * 0.008, H)
      ctx.fillRect(x + W * 0.2, 0, W * 0.008, H)
    }
    noise(a, 5)
  },

  trellis(a) {
    const { ctx, W, H } = a
    fill(a, a.base)
    ctx.strokeStyle = a.alt
    ctx.fillStyle = a.alt
    ctx.lineWidth = W * 0.022
    ctx.lineJoin = 'round'
    const cx = W / 2, cy = H / 2
    for (let y = 0; y < H; y += cy) {
      for (let x = 0; x < W; x += cx) {
        ctx.beginPath()
        ctx.moveTo(x + cx / 2, y)
        ctx.quadraticCurveTo(x + cx, y, x + cx, y + cy / 2)
        ctx.quadraticCurveTo(x + cx, y + cy, x + cx / 2, y + cy)
        ctx.quadraticCurveTo(x, y + cy, x, y + cy / 2)
        ctx.quadraticCurveTo(x, y, x + cx / 2, y)
        ctx.stroke()
      }
    }
    wrapped(a, () => {
      for (let y = 0; y <= H; y += cy) for (let x = 0; x <= W; x += cx) {
        ctx.beginPath()
        ctx.arc(x, y, W * 0.028, 0, Math.PI * 2)
        ctx.fill()
      }
    })
    noise(a, 5)
  },

  grasscloth(a) {
    const { ctx, W, H, rand } = a
    fill(a, a.base)
    for (let y = 0; y < H; y += 1 + Math.floor(rand() * 2)) {
      ctx.globalAlpha = 0.25 + rand() * 0.5
      ctx.fillStyle = rand() > 0.5 ? a.alt : shade(a.base, 0.18)
      ctx.fillRect(0, y, W, 1 + (rand() > 0.85 ? 1 : 0))
    }
    ctx.globalAlpha = 0.18
    ctx.fillStyle = shade(a.alt, -0.3)
    for (let x = 0; x < W; x += W / 24) ctx.fillRect(x + rand() * 2, 0, 1, H)
    ctx.globalAlpha = 1
    noise(a, 14)
  },

  linen(a) {
    fill(a, a.base)
    weaveLines(a, 2, a.alt, shade(a.base, 0.22), 0.15, 0.35)
    mottle(a, shade(a.base, -0.08), 6, 80, 200, 0.2)
    noise(a, 12)
  },

  sheer(a) {
    fill(a, a.base)
    weaveLines(a, 3, a.alt, shade(a.base, 0.3), 0.1, 0.25)
    noise(a, 8)
  },

  percale(a) {
    fill(a, a.base)
    weaveLines(a, 2, a.alt, shade(a.base, 0.15), 0.06, 0.12)
    mottle(a, shade(a.base, -0.05), 6, 80, 220, 0.25)
    noise(a, 4)
  },

  weave(a) {
    const { ctx, W, H, rand } = a
    fill(a, a.base)
    const s = W / 16
    for (let y = 0; y < H; y += s) {
      for (let x = 0; x < W; x += s) {
        const horiz = (Math.round(x / s) + Math.round(y / s)) % 2 === 0
        const g = horiz ? ctx.createLinearGradient(0, y, 0, y + s) : ctx.createLinearGradient(x, 0, x + s, 0)
        g.addColorStop(0, shade(a.alt, -0.15))
        g.addColorStop(0.5, shade(a.base, 0.12))
        g.addColorStop(1, shade(a.alt, -0.15))
        ctx.fillStyle = g
        ctx.fillRect(x + 1, y + 1, s - 2, s - 2)
        ctx.globalAlpha = 0.25
        ctx.fillStyle = shade(a.alt, -0.3)
        for (let k = 2; k < s - 2; k += 3) {
          if (horiz) ctx.fillRect(x + 1, y + k + rand(), s - 2, 0.6)
          else ctx.fillRect(x + k + rand(), y + 1, 0.6, s - 2)
        }
        ctx.globalAlpha = 1
      }
    }
    noise(a, 8)
  },

  ticking(a) {
    const { ctx, W, H } = a
    fill(a, a.base)
    weaveLines(a, 2, shade(a.base, -0.06), shade(a.base, 0.1), 0.1, 0.2)
    ctx.fillStyle = a.alt
    for (let x = 0; x < W; x += W / 4) {
      ctx.fillRect(x, 0, W * 0.035, H)
      ctx.fillRect(x + W * 0.055, 0, W * 0.012, H)
    }
    noise(a, 8)
  },

  botanical(a) {
    const { ctx, W, H, rand } = a
    fill(a, a.base)
    const leaves = Array.from({ length: 9 }, () => ({
      x: rand() * W, y: rand() * H, ang: rand() * Math.PI * 2, len: W * (0.28 + rand() * 0.16), dark: rand() > 0.5,
    }))
    wrapped(a, () => {
      for (const l of leaves) {
        const col = l.dark ? shade(a.alt, -0.2) : a.alt
        ctx.save()
        ctx.translate(l.x, l.y)
        ctx.rotate(l.ang)
        ctx.strokeStyle = col
        ctx.lineWidth = W * 0.006
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(l.len * 0.5, -l.len * 0.08, l.len, 0)
        ctx.stroke()
        ctx.fillStyle = col
        for (let i = 3; i < 22; i++) {
          const t = i / 22
          const px = l.len * t, py = -l.len * 0.08 * 4 * t * (1 - t)
          const fl = l.len * 0.32 * Math.sin(Math.PI * t) + l.len * 0.04
          for (const side of [-1, 1]) {
            ctx.beginPath()
            ctx.moveTo(px, py)
            ctx.quadraticCurveTo(px + fl * 0.35, py + side * fl * 0.6, px + fl * 0.55, py + side * fl)
            ctx.quadraticCurveTo(px + fl * 0.2, py + side * fl * 0.55, px - l.len * 0.012, py)
            ctx.fill()
          }
        }
        ctx.restore()
      }
    })
    noise(a, 6)
  },

  arches(a) {
    const { ctx, W, H } = a
    fill(a, a.base)
    const cw = W / 3, rows = 2, rh = H / rows
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < 4; c++) {
        const x = c * cw + (r % 2 ? cw / 2 : 0) + cw / 2
        const yb = (r + 1) * rh - rh * 0.08
        const R = cw * 0.4
        ctx.fillStyle = a.alt
        ctx.beginPath()
        ctx.moveTo(x - R, yb)
        ctx.arc(x, yb - rh * 0.42, R, Math.PI, 0)
        ctx.lineTo(x + R, yb)
        ctx.fill()
        ctx.fillStyle = a.extra
        ctx.beginPath()
        ctx.arc(x, yb - rh * 0.42, R * 0.5, Math.PI, 0)
        ctx.lineTo(x + R * 0.5, yb)
        ctx.lineTo(x - R * 0.5, yb)
        ctx.fill()
      }
    }
    noise(a, 7)
  },

  subway(a) {
    const { ctx, W, H, rand } = a
    fill(a, a.alt)
    const rows = 4, cols = 2
    const th = H / rows, tw = W / cols, g = Math.max(2, W * 0.006)
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c <= cols; c++) {
        const x = c * tw + (r % 2 ? tw / 2 : 0)
        const tone = shade(a.base, (rand() - 0.5) * 0.08)
        const grad = ctx.createLinearGradient(0, r * th, 0, (r + 1) * th)
        grad.addColorStop(0, shade(tone, 0.12))
        grad.addColorStop(0.15, tone)
        grad.addColorStop(0.85, tone)
        grad.addColorStop(1, shade(tone, -0.1))
        ctx.fillStyle = grad
        ctx.fillRect(x + g / 2, r * th + g / 2, tw - g, th - g)
      }
    }
    noise(a, 5)
  },

  zellige(a) {
    const { ctx, W, H, rand } = a
    fill(a, shade(a.base, 0.4))
    const n = 4, t = W / n, g = Math.max(2, W * 0.008)
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const tone = mix(a.base, a.alt, rand())
        const grad = ctx.createRadialGradient(c * t + t * (0.3 + rand() * 0.4), r * t + t * (0.3 + rand() * 0.4), 0, c * t + t / 2, r * t + t / 2, t * 0.8)
        grad.addColorStop(0, shade(tone, 0.22))
        grad.addColorStop(0.6, tone)
        grad.addColorStop(1, shade(tone, -0.18))
        ctx.fillStyle = grad
        const j = () => (rand() - 0.5) * g
        ctx.beginPath()
        ctx.moveTo(c * t + g / 2 + j(), r * t + g / 2 + j())
        ctx.lineTo((c + 1) * t - g / 2 + j(), r * t + g / 2 + j())
        ctx.lineTo((c + 1) * t - g / 2 + j(), (r + 1) * t - g / 2 + j())
        ctx.lineTo(c * t + g / 2 + j(), (r + 1) * t - g / 2 + j())
        ctx.fill()
      }
    }
    void H
    noise(a, 8)
  },

  hex(a) {
    const { ctx, W, rand } = a
    fill(a, shade(a.alt, -0.1))
    const r = W / 6, h = Math.sqrt(3) * r
    const g = Math.max(1.5, W * 0.006)
    wrapped(a, () => {
      for (let c = 0; c < 4; c++) {
        for (let k = 0; k < 2; k++) {
          const cx = c * 1.5 * r
          const cy = k * h + (c % 2 ? h / 2 : 0)
          ctx.fillStyle = shade(a.base, (rand() - 0.5) * 0.08)
          ctx.beginPath()
          for (let i = 0; i < 6; i++) {
            const ang = (Math.PI / 3) * i
            const px = cx + (r - g) * Math.cos(ang), py = cy + (r - g) * Math.sin(ang)
            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.fill()
        }
      }
    })
    noise(a, 6)
  },

  plank(a) {
    const { ctx, W, H, rand } = a
    const w = W / 4
    for (let col = 0; col < 4; col++) {
      const x = col * w
      const joint = Math.floor(rand() * H)
      for (const [y0, y1] of [[0, joint], [joint, H]]) {
        ctx.fillStyle = mix(a.base, a.alt, rand())
        ctx.fillRect(x, y0, w, y1 - y0)
      }
      ctx.strokeStyle = mix(a.alt, '#000000', 0.25)
      ctx.globalAlpha = 0.22
      ctx.lineWidth = 1
      for (let g = 0; g < 16; g++) {
        const gx = x + 4 + rand() * (w - 8)
        const amp = 1 + rand() * 3
        const periods = 1 + Math.floor(rand() * 3)
        ctx.beginPath()
        for (let y = 0; y <= H; y += 8) {
          const px = gx + amp * Math.sin((y / H) * Math.PI * 2 * periods)
          if (y === 0) ctx.moveTo(px, y)
          else ctx.lineTo(px, y)
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 0.6
      ctx.fillStyle = mix(a.alt, '#000000', 0.45)
      ctx.fillRect(x, 0, 2, H)
      ctx.fillRect(x, joint, w, 2)
      ctx.globalAlpha = 1
    }
    noise(a, 8)
  },

  herringbone(a) {
    const { ctx, W, H, rand } = a
    fill(a, a.base)
    const colW = W / 4
    const h = H / 8
    for (let col = 0; col < 4; col++) {
      const x = col * colW
      const rise = col % 2 === 0 ? colW / 2 : -colW / 2
      for (let y = -2 * h; y < H + 2 * h; y += h) {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + colW, y + rise)
        ctx.lineTo(x + colW, y + rise + h)
        ctx.lineTo(x, y + h)
        ctx.closePath()
        const tone = mix(a.base, a.alt, rand())
        const g = ctx.createLinearGradient(x, y, x + colW, y + rise)
        g.addColorStop(0, shade(tone, 0.05))
        g.addColorStop(1, shade(tone, -0.05))
        ctx.fillStyle = g
        ctx.fill()
        ctx.strokeStyle = mix(a.alt, '#000000', 0.45)
        ctx.globalAlpha = 0.6
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
    noise(a, 10)
  },

  tile(a) {
    const { ctx, W, H, rand } = a
    const tw = W / 2, th = H / 2
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(tx * tw, ty * th, tw, th)
        ctx.clip()
        ctx.fillStyle = mix(a.base, a.alt, rand() * 0.12)
        ctx.fillRect(tx * tw, ty * th, tw, th)
        ctx.strokeStyle = a.alt
        for (let v = 0; v < 6; v++) {
          ctx.globalAlpha = 0.12 + rand() * 0.35
          ctx.lineWidth = 0.5 + rand() * 2.2
          ctx.beginPath()
          let px = tx * tw + rand() * tw
          let py = ty * th
          ctx.moveTo(px, py)
          while (py < (ty + 1) * th) {
            px += (rand() - 0.5) * 40
            py += 10 + rand() * 20
            ctx.lineTo(px, py)
          }
          ctx.stroke()
        }
        ctx.restore()
      }
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = mix(a.alt, '#000000', 0.2)
    for (const p of [0, tw]) ctx.fillRect(p, 0, 2, H)
    for (const p of [0, th]) ctx.fillRect(0, p, W, 2)
    noise(a, 4)
  },

  terrazzo(a) {
    const { ctx, W, H, rand } = a
    fill(a, a.base)
    const cols = [a.alt, a.extra, shade(a.base, -0.25), shade(a.alt, 0.3), '#8c8c8c']
    const chips = Array.from({ length: 260 }, () => ({
      x: rand() * W, y: rand() * H, r: 2 + rand() ** 2 * 14, c: cols[Math.floor(rand() * cols.length)], rot: rand() * 6, sides: 4 + Math.floor(rand() * 3),
    }))
    wrapped(a, () => {
      for (const ch of chips) {
        ctx.fillStyle = ch.c
        ctx.beginPath()
        for (let i = 0; i < ch.sides; i++) {
          const ang = ch.rot + (i / ch.sides) * Math.PI * 2
          const rr = ch.r * (0.6 + ((i * 7919) % 5) / 10)
          const px = ch.x + Math.cos(ang) * rr, py = ch.y + Math.sin(ang) * rr
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.fill()
      }
    })
    ctx.fillStyle = shade(a.base, -0.12)
    ctx.fillRect(0, 0, W, 2)
    ctx.fillRect(0, 0, 2, H)
    noise(a, 6)
  },

  checker(a) {
    const { ctx, W, H, rand } = a
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      ctx.fillStyle = shade((r + c) % 2 ? a.alt : a.base, (rand() - 0.5) * 0.05)
      ctx.fillRect(c * W / 2, r * H / 2, W / 2, H / 2)
    }
    ctx.fillStyle = 'rgba(120,120,120,0.6)'
    for (const p of [0, W / 2]) ctx.fillRect(p, 0, 2, H)
    for (const p of [0, H / 2]) ctx.fillRect(0, p, W, 2)
    noise(a, 6)
  },

  boucle(a) {
    const { ctx, W, H, rand } = a
    fill(a, a.base)
    const loops = Array.from({ length: Math.round((W * H) / 100) }, () => ({
      x: rand() * W, y: rand() * H, r: 2 + rand() * 4, c: rand() > 0.5 ? a.alt : shade(a.base, 0.3), al: 0.3 + rand() * 0.5,
    }))
    ctx.lineWidth = 1.6
    wrapped(a, () => {
      for (const l of loops) {
        ctx.globalAlpha = l.al
        ctx.strokeStyle = l.c
        ctx.beginPath()
        ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2)
        ctx.stroke()
      }
    })
    ctx.globalAlpha = 1
    noise(a, 10)
  },

  velvet(a) {
    fill(a, a.base)
    mottle(a, a.alt, 20, a.W * 0.12, a.W * 0.3, 0.35)
    mottle(a, shade(a.base, -0.25), 10, a.W * 0.1, a.W * 0.25, 0.25)
    noise(a, 7)
  },

  leather(a) {
    const { ctx, W, H, rand } = a
    fill(a, a.base)
    mottle(a, a.alt, 14, W * 0.1, W * 0.3, 0.4)
    const cells = Array.from({ length: 900 }, () => ({ x: rand() * W, y: rand() * H, r: 3 + rand() * 5 }))
    wrapped(a, () => {
      for (const c of cells) {
        ctx.globalAlpha = 0.18
        ctx.strokeStyle = shade(a.base, -0.35)
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
        ctx.stroke()
      }
    })
    ctx.globalAlpha = 1
    mottle(a, shade(a.base, 0.25), 6, W * 0.08, W * 0.18, 0.15)
    noise(a, 6)
  },

  veneer(a) {
    const { ctx, W, H, rand } = a
    fill(a, a.base)
    for (let i = 0; i < 70; i++) {
      const x0 = rand() * W
      const amp = 4 + rand() * 14
      const periods = 1 + Math.floor(rand() * 2)
      ctx.strokeStyle = rand() > 0.5 ? a.alt : shade(a.base, 0.12)
      ctx.globalAlpha = 0.2 + rand() * 0.4
      ctx.lineWidth = 0.6 + rand() * 2.5
      ctx.beginPath()
      for (let y = 0; y <= H; y += 6) {
        const x = x0 + amp * Math.sin((y / H) * Math.PI * 2 * periods + i)
        if (y === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    noise(a, 6)
  },

  fluted(a) {
    const { ctx, W, H } = a
    const n = 8, rw = W / n
    for (let i = 0; i < n; i++) {
      const g = ctx.createLinearGradient(i * rw, 0, (i + 1) * rw, 0)
      g.addColorStop(0, shade(a.alt, -0.35))
      g.addColorStop(0.3, shade(a.base, 0.12))
      g.addColorStop(0.65, a.base)
      g.addColorStop(1, shade(a.alt, -0.3))
      ctx.fillStyle = g
      ctx.fillRect(i * rw, 0, rw, H)
    }
    generators.veneer({ ...a, ctx: overlayCtx(a, 0.35) })
    noise(a, 5)
  },

  // ---- Rugs: one design per canvas (stretch tiling)
  berber(a) {
    const { ctx, W, H } = a
    fill(a, a.base)
    rugTexture(a)
    ctx.strokeStyle = a.alt
    ctx.lineWidth = W * 0.004
    ctx.globalAlpha = 0.75
    const m = W * 0.06
    const cw = (W - 2 * m) / 7, chh = (H - 2 * m) / 5
    for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) {
      const cx = m + cw * (c + 0.5), cy = m + chh * (r + 0.5)
      ctx.beginPath()
      ctx.moveTo(cx, cy - chh / 2)
      ctx.lineTo(cx + cw / 2, cy)
      ctx.lineTo(cx, cy + chh / 2)
      ctx.lineTo(cx - cw / 2, cy)
      ctx.closePath()
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    fringe(a, shade(a.base, -0.05))
  },

  medallion(a) {
    const { ctx, W, H, rand } = a
    fill(a, a.base)
    const b1 = W * 0.05, b2 = W * 0.1
    ctx.fillStyle = a.alt
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = a.extra
    ctx.fillRect(b1 * 0.5, b1 * 0.5, W - b1, H - b1)
    ctx.fillStyle = a.alt
    ctx.fillRect(b1 * 0.7, b1 * 0.7, W - b1 * 1.4, H - b1 * 1.4)
    // Border motifs
    ctx.fillStyle = a.extra
    for (let x = b1; x < W - b1; x += W * 0.035) {
      for (const y of [b1 * 1.1, H - b1 * 1.1]) {
        ctx.beginPath()
        ctx.arc(x, y, W * 0.008, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.fillStyle = a.base
    ctx.fillRect(b2, b2, W - 2 * b2, H - 2 * b2)
    // Medallion
    const cx = W / 2, cy = H / 2
    const layers: [string, number][] = [[a.alt, 0.34], [a.extra, 0.28], [a.base, 0.22], [a.alt, 0.15], [a.extra, 0.08]]
    for (const [col, s] of layers) {
      ctx.fillStyle = col
      ctx.beginPath()
      for (let i = 0; i <= 64; i++) {
        const ang = (i / 64) * Math.PI * 2
        const wob = 1 + 0.12 * Math.cos(ang * 8)
        const px = cx + Math.cos(ang) * W * s * wob, py = cy + Math.sin(ang) * H * s * 0.95 * wob
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.fill()
    }
    // Corner spandrels
    ctx.fillStyle = a.alt
    for (const [x, y] of [[b2, b2], [W - b2, b2], [b2, H - b2], [W - b2, H - b2]]) {
      ctx.beginPath()
      ctx.arc(x, y, W * 0.14, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = a.base
    ctx.fillRect(0, 0, b2 * 0.999, H)
    ctx.fillRect(W - b2 * 0.999, 0, b2, H)
    ctx.fillRect(0, 0, W, b2 * 0.999)
    ctx.fillRect(0, H - b2 * 0.999, W, b2)
    generators.medallionBorder(a)
    // Vintage wash
    mottle({ ...a, rand }, shade(a.extra, 0.3), 30, W * 0.05, W * 0.18, 0.35)
    rugTexture(a)
    fringe(a, shade(a.extra, 0.2))
  },

  medallionBorder(a) {
    const { ctx, W, H } = a
    const b1 = W * 0.05, b2 = W * 0.1
    ctx.fillStyle = a.alt
    ctx.fillRect(0, 0, W, b2)
    ctx.fillRect(0, H - b2, W, b2)
    ctx.fillRect(0, 0, b2, H)
    ctx.fillRect(W - b2, 0, b2, H)
    ctx.strokeStyle = a.extra
    ctx.lineWidth = W * 0.006
    ctx.strokeRect(b1 * 0.6, b1 * 0.6, W - b1 * 1.2, H - b1 * 1.2)
    ctx.strokeRect(b2 * 0.92, b2 * 0.92, W - b2 * 1.84, H - b2 * 1.84)
    ctx.fillStyle = a.extra
    for (let x = b2; x < W - b2; x += W * 0.04) {
      for (const y of [b2 * 0.5, H - b2 * 0.5]) {
        ctx.beginPath()
        ctx.moveTo(x, y - b1 * 0.35)
        ctx.lineTo(x + W * 0.012, y)
        ctx.lineTo(x, y + b1 * 0.35)
        ctx.lineTo(x - W * 0.012, y)
        ctx.fill()
      }
    }
  },

  jute(a) {
    const { ctx, W, H, rand } = a
    fill(a, a.base)
    const s = W / 60
    for (let y = 0; y < H; y += s) {
      for (let x = 0; x < W; x += s * 2) {
        const up = Math.floor(y / (s * 3)) % 2 === 0
        ctx.strokeStyle = shade(a.base, (rand() - 0.5) * 0.3)
        ctx.lineWidth = s * 0.7
        ctx.beginPath()
        ctx.moveTo(x, y + (up ? s : 0))
        ctx.lineTo(x + s, y + (up ? 0 : s))
        ctx.lineTo(x + 2 * s, y + (up ? s : 0))
        ctx.stroke()
      }
    }
    const b = W * 0.035
    ctx.fillStyle = a.alt
    ctx.fillRect(0, 0, W, b)
    ctx.fillRect(0, H - b, W, b)
    ctx.fillRect(0, 0, b, H)
    ctx.fillRect(W - b, 0, b, H)
    noise(a, 18)
  },

  kilim(a) {
    const { ctx, W, H } = a
    fill(a, a.base)
    const bands = 7
    for (let i = 0; i < bands; i++) {
      const y0 = (H / bands) * i
      const col = i % 2 ? a.alt : a.base
      ctx.fillStyle = col
      ctx.fillRect(0, y0, W, H / bands)
      ctx.fillStyle = i % 2 ? a.extra : a.alt
      const dw = W / 9
      for (let k = 0; k < 9; k++) {
        const cx = dw * (k + 0.5), cy = y0 + H / bands / 2, r = (H / bands) * 0.36
        ctx.beginPath()
        ctx.moveTo(cx, cy - r)
        ctx.lineTo(cx + r * 0.9, cy)
        ctx.lineTo(cx, cy + r)
        ctx.lineTo(cx - r * 0.9, cy)
        ctx.fill()
        ctx.fillStyle = col
        ctx.fillRect(cx - r * 0.18, cy - r * 0.18, r * 0.36, r * 0.36)
        ctx.fillStyle = i % 2 ? a.extra : a.alt
      }
    }
    rugTexture(a)
    fringe(a, shade(a.base, 0.3))
  },

  striperug(a) {
    const { ctx, W, H } = a
    fill(a, a.base)
    ctx.fillStyle = a.alt
    const n = 9
    for (let i = 0; i < n; i++) if (i % 2) ctx.fillRect(0, (H / n) * i, W, H / n)
    const b = W * 0.03
    ctx.strokeStyle = a.alt
    ctx.lineWidth = b
    ctx.strokeRect(b / 2, b / 2, W - b, H - b)
    rugTexture(a)
  },
}

function overlayCtx(a: GenArgs, alpha: number): Ctx {
  a.ctx.globalAlpha = alpha
  return a.ctx
}

function rugTexture(a: GenArgs) {
  a.ctx.globalAlpha = 1
  const { ctx, W, H, rand } = a
  ctx.globalAlpha = 0.12
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = rand() > 0.5 ? '#000' : '#fff'
    ctx.fillRect(0, y, W, 1)
  }
  ctx.globalAlpha = 1
  noise(a, 16)
}

function fringe(a: GenArgs, color: string) {
  const { ctx, W, H, rand } = a
  ctx.fillStyle = color
  for (let y = 0; y < H; y += 5) {
    ctx.fillRect(0, y, W * 0.012 * (0.6 + rand() * 0.6), 2)
    ctx.fillRect(W - W * 0.012 * (0.6 + rand() * 0.6), y, W * 0.012, 2)
  }
}

const RUGS = new Set(['berber', 'medallion', 'jute', 'kilim', 'striperug'])

function generate(url: string, aspect = 1): HTMLCanvasElement {
  const [kind, query = ''] = url.slice('procedural:'.length).split('?')
  const params = new URLSearchParams(query)
  const base = params.get('base') ?? '#cccccc'
  const alt = params.get('alt') ?? base
  const extra = params.get('extra') ?? alt
  const gen = generators[kind] ?? generators.paint
  const canvas = document.createElement('canvas')
  const W = RUGS.has(kind) ? 1024 : 512
  canvas.width = W
  canvas.height = Math.max(64, Math.round(W * aspect))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  gen({ ctx, W, H: canvas.height, base, alt, extra, rand: mulberry32(hashString(url)) })
  ctx.globalAlpha = 1
  return canvas
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image ${url}`))
    img.src = url
  })
}

export type TextureSource = HTMLCanvasElement | HTMLImageElement

const sourceCache = new Map<string, Promise<TextureSource>>()

/** `aspect` = tile height / width; procedural tiles are drawn at that ratio so pixels stay square. */
export function loadTextureSource(url: string, aspect = 1): Promise<TextureSource> {
  const key = `${url}#${aspect.toFixed(3)}`
  let p = sourceCache.get(key)
  if (!p) {
    p = url.startsWith('procedural:') ? Promise.resolve(generate(url, aspect)) : loadImage(url)
    p.catch(() => sourceCache.delete(key))
    sourceCache.set(key, p)
  }
  return p
}

const thumbCache = new Map<string, string>()

/**
 * Swatch image for a variant: its thumbnail, the texture URL, or a generated preview.
 * `zoom` < 1 shows several repeats (useful for small-scale patterns).
 */
export function swatchUrl(textureUrl: string, thumbnailUrl?: string, size = 160, aspect = 1): string {
  if (thumbnailUrl) return thumbnailUrl
  if (!textureUrl.startsWith('procedural:')) return textureUrl
  const key = `${textureUrl}#${size}#${aspect.toFixed(3)}`
  let cached = thumbCache.get(key)
  if (!cached) {
    const src = generate(textureUrl, aspect)
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')!
    const s = Math.max(size / src.width, size / src.height)
    ctx.drawImage(src, (size - src.width * s) / 2, (size - src.height * s) / 2, src.width * s, src.height * s)
    cached = c.toDataURL('image/jpeg', 0.85)
    thumbCache.set(key, cached)
  }
  return cached
}

export { loadImage }
