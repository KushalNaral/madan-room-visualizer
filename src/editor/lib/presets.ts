import type { Category } from '../../types'

export type PresetKind = 'wall' | 'floor' | 'ceiling' | 'sofa' | 'bed' | 'curtain' | 'blind' | 'rug' | 'cabinet'

export interface SurfacePreset {
  kind: PresetKind
  label: string
  /** ADE20K class names (SegFormer labels) detected as this surface. */
  adeLabels: string[]
  /** Category-name keywords used to suggest what the surface accepts. */
  keywords: string[]
  group?: string
  /** Typical real size, for tiling and quotes until the user measures. */
  sizeCm: { w: number; h: number }
  /** Curved surfaces start with a warp grid fitted to their outline. */
  curved?: boolean
}

export const PRESETS: SurfacePreset[] = [
  { kind: 'wall', label: 'Wall', adeLabels: ['wall'], keywords: ['wallpaper', 'wall paper', 'paint', 'wall'], group: 'walls', sizeCm: { w: 300, h: 260 } },
  { kind: 'floor', label: 'Floor', adeLabels: ['floor', 'flooring'], keywords: ['floor', 'carpet', 'tile', 'laminate', 'vinyl', 'wood'], sizeCm: { w: 400, h: 400 } },
  { kind: 'ceiling', label: 'Ceiling', adeLabels: ['ceiling'], keywords: ['paint', 'ceiling'], sizeCm: { w: 400, h: 400 } },
  { kind: 'sofa', label: 'Sofa', adeLabels: ['sofa', 'armchair', 'couch', 'swivel chair'], keywords: ['sofa', 'upholstery', 'fabric', 'couch'], sizeCm: { w: 200, h: 90 }, curved: true },
  { kind: 'bed', label: 'Bed', adeLabels: ['bed', 'bed '], keywords: ['bed', 'duvet', 'sheet', 'bedding'], sizeCm: { w: 200, h: 200 }, curved: true },
  { kind: 'curtain', label: 'Curtains', adeLabels: ['curtain'], keywords: ['curtain', 'drape', 'sheer'], sizeCm: { w: 150, h: 250 }, curved: true },
  { kind: 'blind', label: 'Blind', adeLabels: ['blind', 'screen'], keywords: ['blind', 'roller'], sizeCm: { w: 120, h: 150 } },
  { kind: 'rug', label: 'Rug', adeLabels: ['rug', 'carpet'], keywords: ['rug', 'carpet'], sizeCm: { w: 200, h: 300 } },
  { kind: 'cabinet', label: 'Cabinet', adeLabels: ['cabinet', 'wardrobe', 'door', 'chest of drawers'], keywords: ['laminate', 'veneer', 'cabinet', 'wardrobe'], sizeCm: { w: 100, h: 200 } },
]

export const presetFor = (kind: PresetKind) => PRESETS.find((p) => p.kind === kind)!

/** The preset for a SegFormer label, if the visualizer can style that kind of surface. */
export function presetForLabel(label: string): SurfacePreset | undefined {
  const l = label.trim().toLowerCase()
  return PRESETS.find((p) => p.adeLabels.some((a) => l === a.trim() || l.split(/,\s*/).includes(a.trim())))
}

/**
 * Categories a new surface of this kind should accept: the host's explicit mapping when given,
 * otherwise categories whose name contains one of the preset's keywords.
 */
export function suggestAccepts(kind: PresetKind, categories: Category[], mapping?: Partial<Record<PresetKind, string[]>>): string[] {
  const mapped = mapping?.[kind]
  if (mapped) return categories.filter((c) => mapped.includes(c.id)).map((c) => c.id)
  const words = presetFor(kind).keywords
  return categories.filter((c) => words.some((w) => c.name.toLowerCase().includes(w))).map((c) => c.id)
}
