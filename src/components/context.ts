import { inject, type InjectionKey, type Ref, type ShallowRef } from 'vue'
import type { VisualizerState, AppliedItem } from '../composables/useVisualizerState'
import type { ProductSource } from '../data/ProductSource'
import type { RoomRenderer, SurfaceInfo } from '../render/RoomRenderer'
import type { Product, Variant } from '../types'

export type PanelTab = 'materials' | 'looks' | 'summary'

export interface VisualizerContext {
  state: VisualizerState
  source: ProductSource
  currency: string
  /** Money formatter (the host's `formatPrice` prop, or Intl with `currency`). */
  formatPrice: (value: number) => string
  renderer: ShallowRef<RoomRenderer | null>
  /** Per-surface geometry (bbox, anchor) for the loaded room. */
  surfaceInfo: ShallowRef<Map<string, SurfaceInfo>>
  roomReady: Ref<boolean>
  ui: {
    tab: Ref<PanelTab>
    detailProductId: Ref<string | null>
    compare: Ref<boolean>
    hotspots: Ref<boolean>
    zoom: Ref<number>
  }
  actions: {
    apply(product: Product, variant: Variant, opts?: { toGroup?: boolean }): void
    openProduct(product: Product): void
    addToCart(items: AppliedItem[]): void
    viewProduct(product: Product, variant?: Variant): void
    download(kind?: 'image' | 'moodboard'): Promise<void>
    share(): Promise<void>
    zoomBy(factor: number): void
    resetView(): void
    toggleFullscreen(): void
  }
  isFullscreen: Ref<boolean>
}

export const VISUALIZER: InjectionKey<VisualizerContext> = Symbol('room-visualizer')

export function useVisualizer(): VisualizerContext {
  const ctx = inject(VISUALIZER)
  if (!ctx) throw new Error('useVisualizer() must be used inside <RoomVisualizer>')
  return ctx
}
