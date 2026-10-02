// Share-link codec on its own, so pages that only link into the visualizer (e.g. a product
// page's "See it in a room") don't load the visualizer itself.
export { parseSelections, serializeSelections } from './lib/selectionUrl'
export type { Selection } from './types'
