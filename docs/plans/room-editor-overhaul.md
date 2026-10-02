# Room editor overhaul: guided UX + auto-select from the photo

## Context
The room editor (`playground/editor/RoomEditor.vue`, one 436-line component) only works for someone who already knows the pipeline. You trace every surface by clicking polygon points, place 4 plane corners by hand in a fixed order, type ids, pick categories, and read the raw JSON. Madan staff need to add rooms without that knowledge. The goal is for the editor to **propose surfaces automatically from the photo**. The user then confirms or fixes each one with a click or a brush, gets a sensible plane and settings for free, and previews or exports. The output format (`Room`, `PolygonMask`, `TexturePatch` in `src/types.ts`) stays the same, so the visualizer and renderer don't change.

**Assumed defaults** (the clarifying question was interrupted; easy to change):
- Auto-select uses in-browser AI through `@huggingface/transformers` (transformers.js, WebGPU with a WASM fallback). Models are lazy-loaded on first use and cached by the browser. No server is needed.
- The editor stays playground-only for now, so nothing is added to the library bundle. The code is split so it can be exported later.

## Approach

### 1. Split the component (no behaviour change first)
`playground/editor/` becomes:
- `RoomEditor.vue`: shell layout and step flow
- `useEditorState.ts`: drafts, active surface, undo/redo (snapshot stack, the same pattern as the history in `src/composables/useVisualizerState.ts`), and autosave to localStorage with the image as a data URL. The autosave uses try/catch and is skipped when the image is too large.
- `EditorCanvas.vue`: the SVG overlay, drag and handles, plus **zoom/pan**. It uses the same Ctrl+scroll / space-drag conventions as `VisualizerStage.vue`.
- `SurfaceList.vue` and `SurfaceInspector.vue`: the side panel
- `lib/`: pure helpers (below), unit-tested

### 2. Auto-detect surfaces (one click after upload)
`playground/editor/ai/segment.ts` runs in a **Web Worker** (`ai/worker.ts`) so the UI stays responsive, and reports progress to show "Downloading model 34%".
- **Semantic pass:** SegFormer ADE20K (`Xenova/segformer-b2-finetuned-ade-512-512`, about 30 MB) through the `image-segmentation` pipeline. It returns label masks.
- **Label → surface preset map** (`lib/presets.ts`):

| ADE label | Surface | accepts | group | default size |
|---|---|---|---|---|
| wall | Wall N | paint, wallpaper, wall-tile | walls | 300×260 |
| floor | Floor | flooring, rug | — | 400×400 |
| ceiling | Ceiling | paint | — | 400×400 |
| sofa / armchair | Sofa | upholstery | — | 200×90 |
| bed | Bed | bedding | — | 200×200 |
| curtain | Curtains | curtain | — | 150×250 |
| rug | Rug | rug | — | 200×300 |
| cabinet / wardrobe / door | Cabinet | laminate | — | 100×200 |

- **Wall splitting:** ADE returns every wall as one mask. Split it into planes by connected components, then by a vertical-edge cut at the room corners. Use Hough-style long near-vertical lines from a Sobel pass inside the wall mask. If that fails, fall back to one wall surface that the user can split with the brush.
- Results appear as a **"Detected surfaces" checklist** with thumbnails and confidence. The user ticks the ones to keep, and nothing is committed until they accept.

### 3. Click-to-select (magic select) + brush refine
- **SAM:** SlimSAM (`Xenova/slimsam-77-uniform`, about 15 MB). The image embedding is computed once per photo in the worker. After that, each click returns a mask in about 100 ms. Left-click adds a positive point and Alt/right-click adds a negative point, and the mask updates live. This replaces manual tracing as the default Mask tool.
- **Brush / eraser:** paint to add to or subtract from the mask, with an adjustable size. This covers what the AI misses.
- **Manual polygon** stays available as the "Pen" tool for precise edges.
- Working masks are kept as **raster bitmaps** (`Uint8Array` at image resolution) while editing. On commit they are vectorised to the existing `PolygonMask`, so the export format is unchanged.

### 4. Pure helpers (`playground/editor/lib/`, unit-tested)
- `contours.ts`: marching-squares contour tracing from mask to rings. Outer rings go to `polygons` and holes go to `cutouts`. Rings are simplified with Douglas–Peucker (tolerance about 1.5 px, adjustable) and specks below a minimum area are dropped.
- `planeFit.ts`: **auto plane** from a mask. Take the convex hull, then reduce it to 4 vertices by repeatedly removing the vertex whose removal adds the least area, and order the corners TL/TR/BR/BL. Floors and ceilings use the same method. If a corner falls outside the frame, the user drags it there (this is already allowed). The current `planeFromMask` bounding box (`RoomEditor.vue:155`) is replaced by this.
- `warpFit.ts` (stretch goal): for upholstery, curtains and bedding, initialise the warp grid by fitting grid rows to the mask's left and right edges per scanline. Curves then start roughly right instead of flat.
- Reuse `squareToQuad`, `applyHomography` and `autoIdColor` from `src/` (already exported).

### 5. Guided, friendlier UX
- **Stepper**: ① Upload → ② Detect & pick surfaces → ③ Refine each surface (mask → plane → optional warp) → ④ Preview & export.
- Each surface card shows a status chip ("Mask ✓ · Plane ✓ · Accepts ✓") and the next action button, so the `issues` list becomes per-card prompts.
- **Ids are generated from labels** (slugified, uniqueness enforced). Id and Group move into an "Advanced" disclosure, along with the JSON textarea.
- **Type picker** instead of raw category chips: choosing "Wall" fills in accepts, group and default size. Chips stay editable underneath.
- **Plane sanity check:** the grid turns amber if the quad is self-intersecting or extremely skewed (reuse the existing `try/catch` around `squareToQuad`).
- **Inline live preview:** a small `RoomRenderer` canvas in step 4 applies a checker or test texture to every surface. It shows mapping errors without switching tabs. The full "Preview in visualizer" stays.
- **Keyboard:** `Ctrl+Z / Ctrl+Shift+Z`, `B` brush, `E` eraser, `M` magic, `P` pen, `[ ]` brush size, `Del` delete selected point, `Esc` finish ring.
- Empty states, a hint bar per tool, and tooltips via the existing `ui/tooltip`.
- Drag-and-drop upload. Large photos are downscaled for the AI models only, never for export coordinates.

### 6. Docs
Update the "Adding real rooms" section of `README.md` and refresh `docs/screenshot-editor.png` with `npm run shoot`.

## Critical files
- `playground/editor/RoomEditor.vue`: rewrite into the shell + subcomponents above
- New: `playground/editor/{useEditorState.ts, EditorCanvas.vue, SurfaceList.vue, SurfaceInspector.vue, DetectPanel.vue}`
- New: `playground/editor/ai/{segment.ts, worker.ts}`, `playground/editor/lib/{contours.ts, planeFit.ts, presets.ts, warpFit.ts}`
- `package.json`: add `@huggingface/transformers` as a **devDependency** (playground only; the library `external` list in `vite.config.ts` is unaffected)
- `tests/editor.test.ts`: contours (square, ring with hole, specks), plane fit (known trapezoid gives the same corners), preset mapping, id slug uniqueness
- `README.md`

## Order of work
1. Split the component and add undo/redo, autosave and zoom/pan (UX wins, no AI)
2. `contours.ts` + `planeFit.ts` + tests; brush/eraser on raster masks
3. Worker + SlimSAM magic select
4. SegFormer auto-detect + presets + wall splitting
5. Stepper / guided UI polish, inline preview, docs

## Verification
- `npm test` (new helper tests plus the existing ones) and `npm run typecheck`
- `npm run dev`, then use the browser pane on the Room editor tab:
  - Upload `public/mock-rooms/living.png` and run Detect. Check that walls, floor, sofa and curtains are proposed with correct accepts/groups.
  - Magic-select the rug with one click, refine with a negative click, and erase a bit with the brush.
  - Check that the auto plane grid looks like even squares on the floor and walls. Undo/redo works, and a reload restores the session.
  - Preview in the visualizer and apply wallpaper, flooring and upholstery to confirm the projection and masks are correct.
  - Compare against the ground truth: the mock rooms ship `*-ids.png` and their JSON patches. Spot-check that detected masks overlap the true id-map regions well (IoU) and that auto quads land near the true quads.
- `npm run build` to confirm the library bundle has no transformers.js in it (grep `dist/`).
