// Regenerates src/data/mock/{categories,products}.json — run with `node scripts/gen-mock-products.cjs`.
// Variant ids are `<productId>-v<n>`; room presets reference them, so append rather than reorder.
const fs = require('fs')
const path = require('path')

const categories = [
  { id: 'paint', name: 'Paint', icon: 'paint-roller' },
  { id: 'wallpaper', name: 'Wallpaper', icon: 'wallpaper' },
  { id: 'wall-tile', name: 'Wall tiles', icon: 'grid-3x3' },
  { id: 'flooring', name: 'Flooring', icon: 'layers' },
  { id: 'rug', name: 'Rugs', icon: 'rectangle-horizontal' },
  { id: 'upholstery', name: 'Upholstery', icon: 'sofa' },
  { id: 'curtain', name: 'Curtains', icon: 'blinds' },
  { id: 'bedding', name: 'Bedding', icon: 'bed-double' },
  { id: 'laminate', name: 'Laminates', icon: 'panels-top-left' },
]

const PRICING = {
  paint: { unit: 'litre', coverageM2: 5, wastage: 0.05 },
  wallpaper: { unit: 'roll', coverageM2: 5.3, wastage: 0.15 },
  'wall-tile': { unit: 'm²', coverageM2: 1, wastage: 0.1 },
  flooring: { unit: 'm²', coverageM2: 1, wastage: 0.1 },
  rug: { unit: 'piece' },
  upholstery: { unit: 'metre', coverageM2: 1.1, wastage: 0.25 },
  curtain: { unit: 'metre', coverageM2: 1.4, wastage: 0.1 },
  bedding: { unit: 'piece' },
  laminate: { unit: 'm²', coverageM2: 1, wastage: 0.15 },
}

function product(p) {
  const { id, sku, name, categoryId, description, kind, tile, finish, price, variants, tiling, badges, brand } = p
  return {
    id,
    sku,
    name,
    categoryId,
    description,
    brand: brand ?? 'Madan Furnishers',
    ...(badges ? { badges } : {}),
    pricing: PRICING[categoryId],
    variants: variants.map(([vname, base, alt, extra], i) => {
      const params = new URLSearchParams({ base })
      if (alt) params.set('alt', alt)
      if (extra) params.set('extra', extra)
      return {
        id: `${id}-v${i + 1}`,
        sku: `${sku}-${String(i + 1).padStart(2, '0')}`,
        name: vname,
        colorHex: base,
        textureUrl: `procedural:${kind}?${params}`,
        tileSizeCm: tile,
        ...(tiling ? { tiling } : {}),
        finish,
        price: Array.isArray(price) ? price[i % price.length] : price,
      }
    }),
  }
}

const products = [
  // ---- Paint
  product({ id: 'silk-emulsion', sku: 'MF-PNT-SE', name: 'Silk Emulsion', categoryId: 'paint', kind: 'paint', tile: { w: 100, h: 100 }, finish: 'satin', price: 520, badges: ['Bestseller'],
    description: 'Washable low-sheen interior emulsion with a soft, velvety finish. Low VOC.',
    variants: [['Ivory Dawn', '#efe6d4'], ['Sage Mist', '#a9b8a0'], ['Terracotta', '#c0694a'], ['Ink Blue', '#2f4058'], ['Blush', '#e5bfb4'], ['Greige', '#bdb3a4'], ['Butter', '#efd9a0'], ['Pebble', '#a7a39b']] }),
  product({ id: 'velvet-matt', sku: 'MF-PNT-VM', name: 'Velvet Matt', categoryId: 'paint', kind: 'paint', tile: { w: 100, h: 100 }, finish: 'matte', price: 640,
    description: 'Ultra-flat, chalky matt for deep, colour-rich walls.',
    variants: [['Forest', '#33493b'], ['Charcoal', '#3b3b3d'], ['Ochre', '#c99a3b'], ['Midnight Ink', '#252d3f'], ['Clay', '#a8664d'], ['Olive', '#6b6b3f']] }),
  // ---- Wallpaper
  product({ id: 'regency-stripe', sku: 'MF-WP-RS', name: 'Regency Stripe', categoryId: 'wallpaper', kind: 'stripe', tile: { w: 53, h: 53 }, finish: 'matte', price: 3200,
    description: 'Classic two-tone stripe on a non-woven base. Paste-the-wall.',
    variants: [['Champagne', '#e8dcc3', '#d4c3a1'], ['Duck Egg', '#bfd3d1', '#a6bfbc'], ['Noir', '#2c2c2e', '#3e3e42'], ['Rosewater', '#ead2c8', '#d9b6a9']] }),
  product({ id: 'trellis', sku: 'MF-WP-TR', name: 'Moroccan Trellis', categoryId: 'wallpaper', kind: 'trellis', tile: { w: 53, h: 53 }, finish: 'matte', price: 3650,
    description: 'Geometric lattice inspired by Moorish screens.',
    variants: [['Gold on Cream', '#efe7d6', '#bf9b52'], ['White on Teal', '#2f6d6a', '#e9ece6'], ['Grey on Linen', '#ece6db', '#8b8a86']] }),
  product({ id: 'grasscloth', sku: 'MF-WP-GC', name: 'Natural Grasscloth', categoryId: 'wallpaper', kind: 'grasscloth', tile: { w: 45, h: 45 }, finish: 'matte', price: 5400, badges: ['Eco'],
    description: 'Hand-woven natural fibres on paper backing — warm and textural.',
    variants: [['Sand', '#cdb894', '#b39d78'], ['Moss', '#8d906a', '#767856'], ['Indigo', '#3d4a66', '#2f3a52']] }),
  product({ id: 'botanical', sku: 'MF-WP-BO', name: 'Botanica', categoryId: 'wallpaper', kind: 'botanical', tile: { w: 64, h: 64 }, finish: 'matte', price: 4800, badges: ['New'],
    description: 'Painterly palm leaves for a relaxed, garden feel.',
    variants: [['Sage on Ivory', '#efe9dc', '#8ea683'], ['Jungle', '#20352c', '#4f7a5a'], ['Blush Leaf', '#f0e0d8', '#c99a8c']] }),
  product({ id: 'arches', sku: 'MF-WP-AR', name: 'Sol Arches', categoryId: 'wallpaper', kind: 'arches', tile: { w: 60, h: 60 }, finish: 'matte', price: 4200,
    description: 'Mid-century arches in sun-baked tones.',
    variants: [['Terracotta', '#e9dccb', '#c0714f', '#e1a85a'], ['Sage & Ochre', '#ece6d8', '#8fa58a', '#d1a246'], ['Navy', '#eae4d8', '#2f4058', '#c56b3f']] }),
  // ---- Wall tiles
  product({ id: 'subway', sku: 'MF-WT-SB', name: 'Metro Subway 7.5×30', categoryId: 'wall-tile', kind: 'subway', tile: { w: 60, h: 30 }, finish: 'gloss', price: 1650,
    description: 'Glazed ceramic brick tiles. Classic running bond.',
    variants: [['Gloss White', '#f2f0eb', '#c9c4ba'], ['Sage', '#a8b8a0', '#8b9884'], ['Navy', '#2d3c57', '#1d2738'], ['Blush', '#e5c4b9', '#c9a69a']] }),
  product({ id: 'zellige', sku: 'MF-WT-ZL', name: 'Zellige 10×10', categoryId: 'wall-tile', kind: 'zellige', tile: { w: 40, h: 40 }, finish: 'gloss', price: 4900, badges: ['Handmade'],
    description: 'Hand-cut glazed terracotta with lively tonal variation.',
    variants: [['Sage', '#9fb39b', '#7f9580'], ['Chalk', '#ece9e1', '#d5d0c4'], ['Ocean', '#2f5d6b', '#244a56'], ['Terracotta', '#c0714f', '#a65c3d']] }),
  product({ id: 'hex-mosaic', sku: 'MF-WT-HX', name: 'Hex Mosaic', categoryId: 'wall-tile', kind: 'hex', tile: { w: 30, h: 17.32 }, finish: 'satin', price: 2900,
    description: 'Matt porcelain hexagon mosaic sheets.',
    variants: [['White', '#efede8', '#c7c2b8'], ['Charcoal', '#3b3b3d', '#2a2a2c'], ['Mint', '#bcd4c6', '#9fbbaa']] }),
  // ---- Flooring
  product({ id: 'oak-plank', sku: 'MF-FL-OP', name: 'European Oak Plank', categoryId: 'flooring', kind: 'plank', tile: { w: 76, h: 120 }, finish: 'satin', price: 4100, badges: ['Bestseller'],
    description: 'Engineered oak, 190 mm boards, brushed and oiled.',
    variants: [['Natural Oak', '#b98b5a', '#9c7046'], ['Smoked Oak', '#6e4e35', '#56392a'], ['Whitewash', '#d9cbb5', '#c3b398'], ['Honey', '#c99a5e', '#ad7f45']] }),
  product({ id: 'herringbone', sku: 'MF-FL-HB', name: 'Herringbone Parquet', categoryId: 'flooring', kind: 'herringbone', tile: { w: 60, h: 60 }, finish: 'satin', price: 5600,
    description: 'Solid oak blocks laid in a classic herringbone.',
    variants: [['Honey', '#c2925c', '#a87a49'], ['Walnut', '#6b4a33', '#553826'], ['Ash', '#cbbba3', '#b3a287']] }),
  product({ id: 'marble-tile', sku: 'MF-FL-MT', name: 'Marble Porcelain 60×60', categoryId: 'flooring', kind: 'tile', tile: { w: 120, h: 120 }, finish: 'gloss', price: 3800,
    description: 'Polished porcelain with a natural marble look.',
    variants: [['Carrara', '#eeeeec', '#c9c9c9'], ['Nero', '#2a2a2c', '#5a5a5e'], ['Calacatta', '#f2efe8', '#c8ab7a']] }),
  product({ id: 'terrazzo', sku: 'MF-FL-TZ', name: 'Terrazzo 60×60', categoryId: 'flooring', kind: 'terrazzo', tile: { w: 60, h: 60 }, finish: 'satin', price: 4600, badges: ['New'],
    description: 'Venetian-style terrazzo with marble chips.',
    variants: [['Bianco', '#e8e4dc', '#a59c8f', '#c0714f'], ['Rosa', '#e9d6cc', '#b98576', '#6b6b6b'], ['Verde', '#d8dfd5', '#5f7a65', '#c9a46a']] }),
  product({ id: 'checker', sku: 'MF-FL-CK', name: 'Checkerboard Tile', categoryId: 'flooring', kind: 'checker', tile: { w: 60, h: 60 }, finish: 'satin', price: 3300,
    description: 'Bold 30×30 two-tone checkerboard.',
    variants: [['Black & White', '#efede8', '#2a2a2c'], ['Sage & Cream', '#ece6d8', '#8fa58a'], ['Terracotta & Sand', '#e2d3bb', '#b56a4a']] }),
  // ---- Rugs (stretch: one design per rug)
  product({ id: 'berber-rug', sku: 'MF-RG-BB', name: 'Atlas Berber Rug', categoryId: 'rug', kind: 'berber', tile: { w: 270, h: 200 }, tiling: 'stretch', finish: 'matte', price: [24500, 26500],
    description: 'Hand-knotted wool with a soft diamond lattice.', badges: ['Handmade'],
    variants: [['Ivory', '#ece6da', '#3b3631'], ['Charcoal', '#4a4744', '#d9d3c7']] }),
  product({ id: 'medallion-rug', sku: 'MF-RG-MD', name: 'Heirloom Medallion Rug', categoryId: 'rug', kind: 'medallion', tile: { w: 270, h: 200 }, tiling: 'stretch', finish: 'matte', price: 38500,
    description: 'Traditional medallion design with a worn, vintage wash.',
    variants: [['Rust & Indigo', '#a8553d', '#2f3c58', '#e1c9a0'], ['Navy & Gold', '#22304a', '#c49a4d', '#e7dcc6'], ['Faded Rose', '#c79a92', '#6f7a8a', '#efe2d2']] }),
  product({ id: 'jute-rug', sku: 'MF-RG-JT', name: 'Natural Jute Rug', categoryId: 'rug', kind: 'jute', tile: { w: 270, h: 200 }, tiling: 'stretch', finish: 'matte', price: 12800, badges: ['Eco'],
    description: 'Chunky herringbone-weave jute with a cotton border.',
    variants: [['Natural', '#c4a77a', '#ece6da'], ['Bleached', '#d9cbb0', '#3b3631']] }),
  product({ id: 'kilim-rug', sku: 'MF-RG-KL', name: 'Anatolia Kilim', categoryId: 'rug', kind: 'kilim', tile: { w: 270, h: 200 }, tiling: 'stretch', finish: 'matte', price: 21900,
    description: 'Flat-woven kilim with bold tribal motifs.',
    variants: [['Spice', '#b5583a', '#2f3c58', '#e2c48d'], ['Sage', '#8fa58a', '#3b4a3f', '#ece6d8']] }),
  product({ id: 'stripe-rug', sku: 'MF-RG-ST', name: 'Coastal Stripe Rug', categoryId: 'rug', kind: 'striperug', tile: { w: 270, h: 200 }, tiling: 'stretch', finish: 'matte', price: 15600,
    description: 'Washable flat-weave in a breezy stripe.',
    variants: [['Navy', '#ece6da', '#2f4058'], ['Ochre', '#ece6da', '#c99a3b'], ['Sage', '#ece6da', '#8fa58a']] }),
  // ---- Upholstery
  product({ id: 'belgian-linen', sku: 'MF-UP-BL', name: 'Belgian Linen', categoryId: 'upholstery', kind: 'linen', tile: { w: 14, h: 14 }, finish: 'matte', price: 1850, badges: ['Bestseller'],
    description: 'Heavy-weight upholstery linen, 40,000 rubs.',
    variants: [['Oatmeal', '#cbbda4', '#b5a68b'], ['Slate', '#6d7277', '#5a5f64'], ['Rust', '#a5553a', '#8c4630'], ['Sage', '#97a58c', '#82927a'], ['Chalk', '#e6e1d7', '#d2ccc0']] }),
  product({ id: 'boucle', sku: 'MF-UP-BC', name: 'Cloud Bouclé', categoryId: 'upholstery', kind: 'boucle', tile: { w: 10, h: 10 }, finish: 'matte', price: 2600, badges: ['New'],
    description: 'Looped texture with a soft, cocooning hand-feel.',
    variants: [['Snow', '#efebe4', '#d9d3c8'], ['Caramel', '#b88a5a', '#9e7246'], ['Pebble', '#a19a90', '#8a837a']] }),
  product({ id: 'velvet', sku: 'MF-UP-VV', name: 'Cotton Velvet', categoryId: 'upholstery', kind: 'velvet', tile: { w: 30, h: 30 }, finish: 'satin', price: 2950,
    description: 'Rich short-pile velvet with a gentle lustre.',
    variants: [['Emerald', '#1f5a4a', '#2c7360'], ['Mustard', '#c3912d', '#d6a640'], ['Navy', '#1f2b4a', '#2c3b61'], ['Rose', '#b97a80', '#cc8f95'], ['Teal', '#1d5560', '#2a6d79'], ['Terracotta', '#a5553a', '#bd6847']] }),
  product({ id: 'leather', sku: 'MF-UP-LT', name: 'Aniline Leather', categoryId: 'upholstery', kind: 'leather', tile: { w: 30, h: 30 }, finish: 'satin', price: 4800,
    description: 'Full-grain aniline leather that patinas beautifully.',
    variants: [['Cognac', '#8a4b26', '#6f3a1c'], ['Espresso', '#3d2a20', '#2a1d16'], ['Black', '#1e1e20', '#2c2c2e'], ['Tan', '#b07a4a', '#94643a']] }),
  product({ id: 'performance-weave', sku: 'MF-UP-PW', name: 'Performance Weave', categoryId: 'upholstery', kind: 'weave', tile: { w: 12, h: 12 }, finish: 'matte', price: 1450, badges: ['Pet friendly'],
    description: 'Stain-resistant, easy-clean basketweave.',
    variants: [['Stone', '#b5aea2', '#9d968a'], ['Denim', '#4d6077', '#3d4f64'], ['Olive', '#7a7a52', '#666643'], ['Graphite', '#55585c', '#45484c']] }),
  // ---- Curtains
  product({ id: 'linen-sheer', sku: 'MF-CU-LS', name: 'Linen Sheer', categoryId: 'curtain', kind: 'sheer', tile: { w: 20, h: 20 }, finish: 'matte', price: 980,
    description: 'Light-filtering linen voile.',
    variants: [['White', '#f3f1ec', '#e2ded6'], ['Natural', '#ddd2bf', '#c9bca6'], ['Mist', '#c9cfcf', '#b4bbbb']] }),
  product({ id: 'blackout-velvet', sku: 'MF-CU-BV', name: 'Blackout Velvet', categoryId: 'curtain', kind: 'velvet', tile: { w: 30, h: 30 }, finish: 'satin', price: 2400,
    description: 'Lined velvet drapery with full blackout.',
    variants: [['Taupe', '#8c7e6e', '#a09282'], ['Emerald', '#1f5a4a', '#2c7360'], ['Midnight', '#202838', '#2c3548'], ['Blush', '#d4a9a0', '#e2bab2']] }),
  product({ id: 'ticking-stripe', sku: 'MF-CU-TS', name: 'Ticking Stripe', categoryId: 'curtain', kind: 'ticking', tile: { w: 20, h: 20 }, finish: 'matte', price: 1350,
    description: 'Cotton-linen ticking, cottage classic.',
    variants: [['Navy', '#efebe3', '#2f4058'], ['Red', '#efebe3', '#a8443a'], ['Charcoal', '#efebe3', '#3b3b3d']] }),
  // ---- Bedding
  product({ id: 'percale-duvet', sku: 'MF-BD-PC', name: 'Percale Duvet Cover', categoryId: 'bedding', kind: 'percale', tile: { w: 40, h: 40 }, finish: 'matte', price: 5200,
    description: '300TC organic cotton percale, crisp and cool. King.',
    variants: [['White', '#f4f2ee', '#e7e3dc'], ['Sage', '#b7c2ad', '#a5b19b'], ['Blush', '#ebcdc4', '#dcbab0'], ['Charcoal', '#4a4a4c', '#3a3a3c']] }),
  product({ id: 'washed-linen', sku: 'MF-BD-WL', name: 'Washed Linen Duvet Cover', categoryId: 'bedding', kind: 'linen', tile: { w: 20, h: 20 }, finish: 'matte', price: 7400, badges: ['Bestseller'],
    description: 'Stone-washed French linen with a relaxed, rumpled look. King.',
    variants: [['Oat', '#d8ccb6', '#c7b9a1'], ['Clay', '#c08a72', '#ad7760'], ['Ocean', '#7c93a3', '#6a8191']] }),
  product({ id: 'stripe-duvet', sku: 'MF-BD-ST', name: 'Hotel Stripe Duvet Cover', categoryId: 'bedding', kind: 'ticking', tile: { w: 24, h: 24 }, finish: 'matte', price: 4600,
    description: 'Fine woven stripe in long-staple cotton. King.',
    variants: [['Blue', '#f2f0eb', '#5b7896'], ['Sage', '#f2f0eb', '#7f9a83']] }),
  // ---- Laminates
  product({ id: 'matte-laminate', sku: 'MF-LM-MT', name: 'Super-Matt Laminate', categoryId: 'laminate', kind: 'laminate', tile: { w: 120, h: 120 }, finish: 'matte', price: 1450,
    description: 'Anti-fingerprint super-matt finish for doors and shutters.',
    variants: [['Warm White', '#ece8df'], ['Sage', '#9aab95'], ['Clay', '#b98a72'], ['Navy', '#2c3a52'], ['Graphite', '#3c3d40']] }),
  product({ id: 'walnut-veneer', sku: 'MF-LM-WV', name: 'Walnut Veneer', categoryId: 'laminate', kind: 'veneer', tile: { w: 60, h: 120 }, finish: 'satin', price: 3800,
    description: 'Book-matched American walnut veneer.',
    variants: [['Walnut', '#6a4a33', '#4f3524'], ['Light Oak', '#c9a77c', '#b08d62']] }),
  product({ id: 'fluted-oak', sku: 'MF-LM-FO', name: 'Fluted Oak Panel', categoryId: 'laminate', kind: 'fluted', tile: { w: 30, h: 60 }, finish: 'matte', price: 4400, badges: ['New'],
    description: 'Reeded oak-look panel for a tactile, architectural front.',
    variants: [['Natural', '#c19a6b', '#a07d52'], ['Black', '#2a2827', '#1c1b1a']] }),
]

const outDir = path.join(__dirname, '..', 'src', 'data', 'mock')
fs.writeFileSync(path.join(outDir, 'categories.json'), JSON.stringify(categories, null, 2) + '\n')
fs.writeFileSync(path.join(outDir, 'products.json'), JSON.stringify(products, null, 2) + '\n')
console.log(`${categories.length} categories, ${products.length} products, ${products.reduce((n, p) => n + p.variants.length, 0)} variants`)
