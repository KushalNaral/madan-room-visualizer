// Downloads the CC0 Poly Haven assets the Blender rooms use (decor models, base textures,
// window-view HDRIs) into scripts/blender/assets/. Already-downloaded files are skipped.
//   node scripts/blender/fetch_assets.mjs
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'assets')

export const MODELS = [
  'potted_plant_01', 'potted_plant_02', 'potted_plant_04', 'pachira_aquatica_01', 'calathea_orbifolia_01',
  'ceramic_vase_01', 'ceramic_vase_02', 'ceramic_vase_03', 'ceramic_vase_04', 'brass_vase_01',
  'book_encyclopedia_set_01', 'alarm_clock_01', 'wooden_bowl_01',
  'ceiling_fan', 'mid_century_lounge_chair', 'coffee_table_round_01', 'modern_coffee_table_01',
  'side_table_01', 'standing_picture_frame_01', 'wicker_basket_02',
]
export const TEXTURES = [
  'herringbone_parquet', 'wood_floor', 'laminate_floor_02', 'dark_wooden_planks', 'plank_flooring_02',
  'rectangular_parquet', 'marble_01', 'slab_tiles', 'white_stucco', 'plastered_wall_04',
  'rough_linen', 'wool_boucle', 'velour_velvet', 'poly_wool_herringbone', 'caban', 'knitted_fleece',
  'curly_teddy_natural', 'floral_jacquard', 'quatrefoil_jacquard_fabric', 'waffle_pique_cotton',
  'terry_cloth', 'leather_white', 'brown_leather', 'crepe_satin', 'faux_fur_geometric', 'hessian_230',
  'walnut_veneer', 'oak_veneer_01', 'white_oak_veneer', 'teak_veneer', 'black_oak_veneer',
]
export const HDRIS = ['residential_garden', 'cloudy_vondelpark', 'greenwich_park_02', 'hotel_rooftop_balcony', 'modern_buildings_night', 'palermo_park']
const MAPS = { Diffuse: 'diff', nor_gl: 'nor', Rough: 'rough' }

async function download(url, file) {
  if (existsSync(file)) return false
  mkdirSync(dirname(file), { recursive: true })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file + '.part'))
  const { renameSync } = await import('node:fs')
  renameSync(file + '.part', file)
  return true
}

const files = async (id) => {
  const res = await fetch(`https://api.polyhaven.com/files/${id}`)
  if (!res.ok) throw new Error(`${res.status} files/${id}`)
  return res.json()
}

const manifest = { source: 'https://polyhaven.com (CC0)', models: {}, textures: {}, hdris: {} }
let fetched = 0
for (const id of MODELS) {
  const f = (await files(id)).gltf
  const g = (f?.['1k'] ?? f?.['2k'])?.gltf
  if (!g) { console.warn(`skip ${id}: no glTF`); continue }
  const dir = join(out, 'models', id)
  if (await download(g.url, join(dir, `${id}.gltf`))) fetched++
  for (const [path, inc] of Object.entries(g.include ?? {})) if (await download(inc.url, join(dir, path))) fetched++
  manifest.models[id] = `https://polyhaven.com/a/${id}`
}
for (const id of TEXTURES) {
  const f = await files(id)
  for (const [key, name] of Object.entries(MAPS)) {
    const m = f[key]?.['1k']?.jpg
    if (m && (await download(m.url, join(out, 'textures', id, `${name}.jpg`)))) fetched++
  }
  manifest.textures[id] = `https://polyhaven.com/a/${id}`
}
for (const id of HDRIS) {
  const h = (await files(id)).hdri?.['2k']?.hdr
  if (!h) { console.warn(`skip ${id}: no HDRI`); continue }
  if (await download(h.url, join(out, 'hdri', `${id}.hdr`))) fetched++
  manifest.hdris[id] = `https://polyhaven.com/a/${id}`
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Poly Haven assets ready (${fetched} new files) in ${out}`)
