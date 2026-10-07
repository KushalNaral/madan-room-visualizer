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
  { kind: 'sofa', label: 'Sofa', adeLabels: ['sofa', 'armchair', 'couch', 'ottoman'], keywords: ['sofa', 'upholstery', 'fabric', 'couch'], sizeCm: { w: 200, h: 90 }, curved: true },
  { kind: 'bed', label: 'Bed', adeLabels: ['bed', 'blanket'], keywords: ['bed', 'duvet', 'sheet', 'bedding'], sizeCm: { w: 200, h: 200 }, curved: true },
  { kind: 'curtain', label: 'Curtains', adeLabels: ['curtain'], keywords: ['curtain', 'drape', 'sheer'], sizeCm: { w: 150, h: 250 }, curved: true },
  { kind: 'blind', label: 'Blind', adeLabels: ['blind'], keywords: ['blind', 'roller'], sizeCm: { w: 120, h: 150 } },
  { kind: 'rug', label: 'Rug', adeLabels: ['rug', 'carpet'], keywords: ['rug', 'carpet'], sizeCm: { w: 200, h: 300 } },
  { kind: 'cabinet', label: 'Cabinet', adeLabels: ['cabinet', 'wardrobe', 'door', 'chest of drawers'], keywords: ['laminate', 'veneer', 'cabinet', 'wardrobe'], sizeCm: { w: 100, h: 200 } },
]

export const presetFor = (kind: PresetKind) => PRESETS.find((p) => p.kind === kind)!

/** Loose cushions and pillows: detected on their own, then joined to the sofa or bed they sit on. */
export const CUSHION_LABELS = ['cushion', 'pillow']

/** Kinds with crisp outlines in front of the room (refined with SAM); walls, floors and ceilings aren't. */
export const OBJECT_KINDS: PresetKind[] = ['sofa', 'bed', 'curtain', 'blind', 'rug', 'cabinet']

/** Most specific first: "floor rug" is a rug, "window wall" a wall. */
const NAME_KINDS: [PresetKind, RegExp][] = [
  ['curtain', /curtain|drape|sheer/],
  ['blind', /blind/],
  ['rug', /\brug|carpet/],
  ['bed', /\bbed|duvet|quilt|pillow/],
  ['sofa', /sofa|couch|armchair|chair|ottoman|loveseat|upholster|cushion/],
  ['cabinet', /cabinet|wardrobe|door|drawer|sideboard|cupboard/],
  ['ceiling', /ceiling/],
  ['wall', /wall/],
  ['floor', /floor/],
]

/** A surface's kind from its id or label, for rooms saved before surfaces had one. */
export function kindFromName(text: string): PresetKind | undefined {
  const t = text.toLowerCase().replace(/[-_]+/g, ' ')
  return NAME_KINDS.find(([, re]) => re.test(t))?.[0]
}

/** Categories a kind inherits from the host's settings, applied on top of a surface's own. */
export type InheritedCategories = Partial<Record<PresetKind, string[]>>

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
