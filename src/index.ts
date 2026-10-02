export { default as RoomVisualizer } from './components/RoomVisualizer.vue'
export { default as Swatch } from './components/Swatch.vue'
export { useVisualizer, VISUALIZER, type VisualizerContext } from './components/context'

export { useVisualizerState, type AppliedItem, type SavedLook, type VisualizerState } from './composables/useVisualizerState'
export { useCatalog } from './composables/useCatalog'

export type { ProductSource } from './data/ProductSource'
export { HttpProductSource, type HttpProductSourceOptions } from './data/HttpProductSource'

export { RoomRenderer, autoIdColor, type SurfaceInfo, type PatternAdjust } from './render/RoomRenderer'
export { squareToQuad, quadToSquare, invert, apply as applyHomography } from './render/homography'
export { swatchUrl, loadTextureSource } from './render/textures'
export { parseSelections, serializeSelections } from './lib/selectionUrl'
export { estimate, type Estimate } from './lib/estimate'

export type * from './types'
