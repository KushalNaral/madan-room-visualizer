# @madan/room-visualizer

A drop-in **room visualizer** for the Madan Furnishers Vue 3 storefront. Shoppers pick a room, tap a wall, the floor or a piece of furniture, and see Madan's products and variants (paint, wallpaper, tiles, flooring, rugs, upholstery, curtains, bedding, laminates) applied in perspective with the room's real lighting. Then they can compare, save, share, and add the whole look to the cart.

Built with **Vue 3 + TypeScript + Tailwind + shadcn-vue (reka-ui)** and a small custom **WebGL2** renderer. It has no dependency on Materialo or any other hosted service.

![Living room with the "Moody luxe" look](docs/screenshot-living.png)

## Features

**Shopper experience**
- Click a surface or its hotspot pin to style it. Hover labels show what's applied.
- A quick-swap bar on the stage changes colourways in one click, adjusts the pattern, or removes the material.
- Product browser filtered to what the surface accepts, with search, sort, category chips and recently used swatches.
- Product detail with colourway hover preview, specs, and a per-surface quantity and cost estimate.
- **Pattern controls:** scale, rotation, horizontal/vertical shift.
- **"Apply to all walls"** for grouped surfaces.
- **Curated looks** per room, plus **saved looks** (stored in the browser).
- **Before / after** comparison slider.
- Zoom and pan (Ctrl/⌘ + scroll, pinch, double-click), fullscreen, keyboard shortcuts.
- **Undo / redo** across every change.
- **Summary** with quantities (litres, rolls, m², metres, pieces) including wastage, line totals, and an "add all to cart" button.
- **Share link** (`?room=…&look=…`) that reproduces the exact look, including pattern adjustments.
- **Download** a high-res render or a **moodboard** (room + swatches + product list + total).
- Responsive layout, dark mode, toasts with undo.

**Rendering**
- **ID-map masks:** each surface is one colour in a surface map, so occlusion is exact (a lamp in front of a wall, cushions on a sofa). Edges are anti-aliased with 4-tap coverage.
- **Planar surfaces** use a perspective-correct homography. **Curved surfaces** (sofas, curtains, duvets) use warped meshes with per-patch depth ordering.
- **Exact relighting:** when a room ships a shading map, materials are lit as `tonemap(albedo × irradiance)`, so shadows, sun patches and lamp glow carry over. Plain photos fall back to luminance-ratio relighting.
- Real-world tiling from each variant's `tileSizeCm`, mipmaps plus anisotropic filtering, and crossfade transitions.

## Quick start

```bash
npm install
npm run dev
```

This opens the playground at http://localhost:5173. It contains the visualizer (mock catalog: 34 products, 119 variants, 3 rooms) and a **room editor**.

| Script | What it does |
| --- | --- |
| `npm run dev` | Playground with the mock catalog |
| `npm test` | Unit tests (homography, URL state, history, estimates, room data integrity) |
| `npm run typecheck` | `vue-tsc` |
| `npm run build` | Library build → `dist/` |
| `npm run scenes` | Re-render the mock rooms (multi-threaded path tracer, ~2 min/room) |
| `npm run scenes:preview` | Fast half-res render for iterating on scenes |
| `npm run catalog` | Regenerate the mock catalog JSON |
| `npm run shoot` | Headless screenshot pass of the playground (uses your local Chrome/Edge) |

## Using it in the Madan app

Madan's storefront (`/virtual-vision`) and dashboard (Catalogue → Room visualizer) use this package. The full guide for that integration is `api/DEV.VISUALIZER.README.md` in the Madan workspace. In short:

```json
"@madan/room-visualizer": "github:KushalNaral/madan-room-visualizer#<commit sha>"
```

`dist/` is built by the `prepare` script on install; npm 11 asks once: `npm install-scripts approve @madan/room-visualizer`. While developing next to this checkout, `"file:../madan-room-visualizer"` works too. Add `resolve.dedupe: ['vue']` to the host's Vite config, and limit component auto-import globs to `./src`.

| Entry | For |
|---|---|
| `@madan/room-visualizer` | `RoomVisualizer`, `HttpProductSource`, renderer, state, types |
| `@madan/room-visualizer/editor` | `RoomEditor` and its helpers (dashboard only) |
| `@madan/room-visualizer/editor-worker` | The segmentation worker; bundle it with `?worker` |
| `@madan/room-visualizer/url` | `serializeSelections` / `parseSelections` alone (share links) |
| `@madan/room-visualizer/mock` | Mock catalog (playground and tests only) |
| `@madan/room-visualizer/tailwind-preset` | Tailwind preset |

**1. Tailwind.** The components use shadcn token classes, so they pick up the app's theme automatically. Add the preset and let Tailwind scan the package (drop the preset's `plugins` if the app already registers `tailwindcss-animate`):

```js
// tailwind.config.js
const visualizerPreset = { ...require('@madan/room-visualizer/tailwind-preset').default, plugins: [] }
module.exports = {
  presets: [visualizerPreset],
  content: ['./src/**/*.{vue,ts}', './node_modules/@madan/room-visualizer/dist/**/*.js'],
}
```

**2. Render it** (this is what Madan's storefront does):

```vue
<script setup lang="ts">
import { HttpProductSource, RoomVisualizer, type AppliedItem, type Product, type Variant } from '@madan/room-visualizer'

const source = new HttpProductSource({
  baseUrl: `${import.meta.env.VITE_API_URL}front/visualizer`,
  // Paths → URLs; 'room' images (photo, id map, lighting) must not be resized or re-encoded.
  assetUrl: (path, use) => imagePath(path, use === 'texture' ? 1024 : use === 'thumb' ? 320 : undefined),
})

function addToCart(items: AppliedItem[]) {
  // items[i].estimate.cart is the server quote's cart payload (see ProductSource.quote).
}
function viewProduct(product: Product, variant?: Variant) {
  router.push(`/product/${variant?.slug}`)
}
</script>

<template>
  <RoomVisualizer
    :source="source"
    sync-url
    :format-price="formatMoney"
    :cart-feedback="false"
    @add-to-cart="addToCart"
    @view-product="viewProduct"
  />
</template>
```

| Prop | Default | |
| --- | --- | --- |
| `source` | — | Any `ProductSource` |
| `initialRoomId` | first room | |
| `syncUrl` | `false` | Mirror `?room=&look=` in the address bar |
| `currency` | `'INR'` | Used by the default price format |
| `formatPrice` | Intl with `currency` | Formats every price (summary, cards, moodboard) |
| `cartFeedback` | `true` | Toast after `addToCart`; turn off when the host confirms itself |
| `brand` | `'Madan Furnishers'` | Shown on moodboards |
| `storageKey` | `'madan-visualizer'` | localStorage namespace; `false` disables |
| `toasts` | `true` | Set `false` if the app already mounts a `vue-sonner` `<Toaster>` |

Events: `addToCart(items)`, `viewProduct(product, variant)`, `variantApplied({ surface, product, variant })`, `roomChange(roomId)`.

For lower-level use, the package also exports `RoomRenderer`, `useVisualizerState`, `useCatalog`, `estimate`/`surfaceSize`, `quoteLine` and the homography helpers.

## The API a source talks to

`HttpProductSource` expects these endpoints (shapes in [`src/types.ts`](src/types.ts)); Madan serves them at `/api/front/visualizer`. Responses are the bare shapes (no envelope); use `mapProduct` / `mapRoom` / `mapCategory` if a backend differs.

```
GET  /categories                                          → Category[]
GET  /products?category=a,b&search=&sort=&page=&pageSize= → { items: Product[], total, page, pageSize }
GET  /products/:id                                        → Product
GET  /rooms                                               → Room[]
GET  /rooms/:id                                           → Room
POST /quote   { lines: QuoteLine[] }                      → Quote[]   (optional)
```

What matters per variant:
- `textureUrl`: a **seamless tile** photo or scan of the material.
- `tileSizeCm`: the real size that tile covers.
- `finish`, `tiling: 'stretch'` for one-off designs such as rugs.
- `approximate: true` when the texture is only a stand-in (shown as "Approx.").

**Prices.**
- `Product.pricing.unit` (`litre`, `roll`, `m²`, `sqft`, `metre`, `piece`, `box`), `coverageM2` and `wastage` drive the instant local estimate.
- When the source implements `quote(lines)`, its server prices replace that estimate as soon as they arrive. Each line sends the surface's `sizeCm` (or its largest patch) and `areaM2`.
- A `Quote` may carry an opaque `cart` payload. It reaches the host as `AppliedItem.estimate.cart`.

## Adding real rooms

There are two routes:

1. **Photograph and author** in the **room editor** (playground tab "Room editor", or Madan's dashboard). The steps are ① Photo → ② Detect → ③ Refine → ④ Preview & save.
   - **Detect** runs SegFormer (ADE20K) in a worker. It proposes walls (split into planes at the room's corners), floor, ceiling, curtains, blinds, sofas, beds, rugs and cabinets, each with a fitted plane, a warp grid for curved ones, and suggested categories. Tick the ones to keep.
   - **Magic select** (SlimSAM) selects a thing with one click. Alt/right-click removes a part.
   - **Brush, Eraser and Pen** fix what the models miss.
   - **Plane / Warp**: drag the 4 corners (or the grid). The grid turns amber when the plane is twisted.
   - Each surface takes a type, the categories it offers, the real plane size (pattern scale) and a size for prices.
   - Undo/redo, autosave with restore, zoom/pan and keyboard shortcuts throughout. Preview uses a test pattern, and the editor emits `Room` JSON.

   transformers.js is loaded inside the worker from jsDelivr at first use, so hosts don't install it. Models come from the Hugging Face hub and are cached by the browser. Override the URL with `workerConfig.transformersUrl`.

   ```vue
   <script setup lang="ts">
   import { RoomEditor } from '@madan/room-visualizer/editor'
   import SegmentWorker from '@madan/room-visualizer/editor-worker?worker'
   </script>
   <template>
     <RoomEditor :room="room" :categories="categories" :create-worker="() => new SegmentWorker()" @save="(room, { image }) => save(room, image)" />
   </template>
   ```

   For shoppers' own photos, pass `audience="shopper"` (hides ids, groups, room JSON and the pricing size) and `:max-photo-side="1600"` (phone photos are scaled down on upload). Madan's storefront does this behind "Use your own photo".

   Rooms built this way use polygon masks (even-odd, holes included) and photo-based relighting.
2. **Render.** For the highest fidelity, render rooms the way the mock rooms are made. [`scripts/scene`](scripts/scene) is a small multi-threaded path tracer (BVH, area/sun/lamp lights, AO, edge-aware denoising). It exports the photo, a 2× surface ID map, an exact **shading map**, the per-surface mesh/quad patches projected from 3D, anchors, areas and curated presets. Scenes are plain TypeScript; see [`rooms/living.ts`](scripts/scene/rooms/living.ts). The editor opens these read-only and can convert them to editable masks.

## Architecture

```
src/
  components/
    RoomVisualizer.vue   root: layout, context, shortcuts, toasts, exports
    stage/               WebGL stage (zoom/pan/compare), hotspots, quick bar, toolbar, room strip
    panel/               materials browser, product detail, pattern controls, looks, summary
    ui/                  shadcn-style primitives (button, tabs, slider, tooltip, popover…)
  composables/           useVisualizerState (selections, history, looks, URL, server quotes), useCatalog
  render/                RoomRenderer (WebGL2), shaders, homography, procedural textures
  data/                  ProductSource interface, HttpProductSource, MockProductSource + mock JSON
  lib/                   estimates, share-URL codec, moodboard export
  editor/                RoomEditor shell, canvas, surface list/inspector, detect panel, inline preview,
                         useEditorState (undo, autosave), useMaskTools, useDetection
    ai/                  worker (SegFormer + SlimSAM via transformers.js), client, protocol
    lib/                 masks, contours (marching edges + Douglas–Peucker), plane fit, presets,
                         wall splitting, warp fit, ids
playground/              demo app (visualizer + room editor)
scripts/scene/           offline path tracer that generates the mock rooms
public/mock-rooms/       generated photos, shading maps, ID maps, thumbnails
```

## Screenshots

| Bedroom, "Garden retreat" look | Room editor |
| --- | --- |
| ![Bedroom](docs/screenshot-bedroom.png) | ![Editor](docs/screenshot-editor.png) |
