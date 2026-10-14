/**
 * Khronos PBR Neutral tonemap on linear RGB, the CPU twin of `tonemap()` in
 * shaders.ts (the room exporters use the same curve, so swaps match the photo).
 */
export function tonemap(r: number, g: number, b: number): [number, number, number] {
  const x = Math.min(r, g, b)
  const off = x < 0.08 ? x - 6.25 * x * x : 0.04
  r -= off; g -= off; b -= off
  const peak = Math.max(r, g, b)
  if (peak < 0.76) return [r, g, b]
  const np = 1 - 0.0576 / (peak - 0.52)
  const k = np / peak
  const t = 1 - 1 / (0.15 * (peak - np) + 1)
  return [r * k * (1 - t) + np * t, g * k * (1 - t) + np * t, b * k * (1 - t) + np * t]
}

/**
 * Auto-exposure for room exporters, from the light (irradiance) samples on swappable
 * surfaces: lift the median to a well-lit level, but keep the brightest 5% (sun
 * patches) from blowing out.
 */
export function autoExposure(light: number[]): { exposure: number; median: number } {
  const v = [...light].sort((a, b) => a - b)
  const median = v[v.length >> 1] || 1
  const p95 = v[Math.floor(v.length * 0.95)] || median
  const ex = Math.max(0.55 / median, Math.min(0.8 / median, 2.2 / p95))
  return { exposure: Math.min(6, Math.max(0.5, ex)), median }
}
