/** A point in room-image pixel space (origin top-left). */
export interface Point {
  x: number
  y: number
}

/** Top-left, top-right, bottom-right, bottom-left — in texture orientation. */
export type Quad = [Point, Point, Point, Point]

export interface Category {
  id: string
  name: string
  /** Lucide icon name hint for UIs (e.g. "paint-roller"). */
  icon?: string
}

export type Finish = 'matte' | 'satin' | 'gloss'

/** How a variant is sold — drives quantity estimates in "Your look". */
export interface Pricing {
  unit: 'litre' | 'roll' | 'm²' | 'metre' | 'piece' | 'box'
  /** m² one unit covers (paint: per litre incl. 2 coats; rolls; boxes). Omit for per-piece items. */
  coverageM2?: number
  /** Extra allowance for cutting/pattern matching, e.g. 0.1 for +10%. */
  wastage?: number
}

export interface Variant {
  id: string
  sku: string
  name: string
  colorHex: string
  /**
   * Seamless tile image (or the whole design for `tiling: 'stretch'`). Either a URL
   * or `procedural:<kind>?base=…&alt=…` for the generated mock textures.
   */
  textureUrl: string
  /** Real-world size one texture tile covers; drives repeat count on a surface. */
  tileSizeCm: { w: number; h: number }
  /** `stretch` maps the image once across the whole patch (rugs, panels). */
  tiling?: 'repeat' | 'stretch'
  finish: Finish
  /** Price per pricing unit. */
  price?: number
  thumbnailUrl?: string
}

export interface Product {
  id: string
  sku: string
  name: string
  categoryId: string
  description?: string
  brand?: string
  badges?: string[]
  pricing?: Pricing
  variants: Variant[]
}

/**
 * Where texture coordinates come from on part of a surface.
 * - quad: a planar region; perspective-correct via homography.
 * - mesh: a warped grid of control points for curved shapes (sofas, curtains).
 * `depth` values (0..1, larger = nearer) order overlapping patches of one surface.
 */
export type TexturePatch =
  | { kind: 'quad'; quad: Quad; depth?: [number, number, number, number]; widthCm: number; heightCm: number }
  | {
      kind: 'mesh'
      cols: number
      rows: number
      /** (cols+1)×(rows+1) row-major control points as flat [x, y, depth, …]. */
      points: number[]
      widthCm: number
      heightCm: number
    }

/** Polygon mask for rooms authored in the editor. Even-odd fill; cut-outs remove occluders. */
export interface PolygonMask {
  polygons: Point[][]
  cutouts?: Point[][]
}

export interface Surface {
  id: string
  label: string
  /** Category ids that may be applied to this surface. */
  accepts: string[]
  /** Surfaces sharing a group can be styled together ("apply to all walls"). */
  group?: string
  /** Colour of this surface in the room's id map (`Room.idMapUrl`). */
  idColor?: string
  /** Alternative to an id map: polygons drawn in the room editor. */
  mask?: PolygonMask
  patches: TexturePatch[]
  /** Paintable/coverable area, for quantity estimates. */
  areaM2?: number
  /** Where to place the hotspot pin. */
  anchor?: Point
}

export interface LookPreset {
  id: string
  name: string
  description?: string
  selections: Record<string, Selection>
}

export interface Room {
  id: string
  name: string
  imageUrl: string
  /**
   * Optional lighting map (sqrt(E/4) encoded irradiance×exposure). When present,
   * materials are relit exactly; otherwise lighting is estimated from the photo.
   */
  shadingUrl?: string
  /** Surface id map; each surface's `idColor` marks its pixels. */
  idMapUrl?: string
  width: number
  height: number
  thumbnailUrl?: string
  surfaces: Surface[]
  presets?: LookPreset[]
}

export interface ProductQuery {
  categoryIds?: string[]
  search?: string
  sort?: 'featured' | 'price-asc' | 'price-desc' | 'name'
  page?: number
  pageSize?: number
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** What is currently applied to a surface, plus pattern adjustments. */
export interface Selection {
  productId: string
  variantId: string
  /** Pattern scale multiplier (1 = true size). */
  scale?: number
  /** Pattern rotation in degrees. */
  rotation?: number
  /** Pattern shift in cm. */
  offsetX?: number
  offsetY?: number
}
