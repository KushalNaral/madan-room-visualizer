import { backdrop, baseboard, curtains, cushion, downlight, openingLight, plant, sofa, wall, windowFrame, type Opening, type WallSpec } from '../kit.ts'
import { artwork, emissive, fabric, leaves, oakPlanks, plaster, rugPattern, skyView, solid, speckle, wood } from '../materials.ts'
import { hex, mul, norm } from '../math.ts'
import { frame, type SceneBuilder, type SceneDef } from '../scene.ts'

// A family room: an L-shaped sectional along the back wall, a loveseat across from the windows,
// an upholstered ottoman, and two curtained windows on the left wall.
const W = 6.0, D = 5.4, H = 2.8
const X0 = -W / 2, X1 = W / 2, Z0 = -D

function build(b: SceneBuilder) {
  b.ambient = [0.15, 0.145, 0.14]
  b.sun = { dir: norm([-0.8, 0.45, -0.3]), angularRadius: 0.012, irradiance: [2.6, 2.35, 1.95] }

  const m = {
    backWall: b.material({ albedo: plaster('#b9c0b4') }),
    sideWall: b.material({ albedo: plaster('#e4e1da') }),
    ceiling: b.material({ albedo: plaster('#efede9', 0.02) }),
    floor: b.material({ albedo: oakPlanks('#c09a72', '#a07b55', 0.16, 1.4) }),
    trim: b.material({ albedo: solid('#f1efea') }),
    sky: b.material({ albedo: [0, 0, 0], emissive: skyView(1.2), castsShadow: false }),
    sectional: b.material({ albedo: fabric('#c5bcae') }),
    loveseat: b.material({ albedo: fabric('#6d7a86', 0.09) }),
    ottoman: b.material({ albedo: fabric('#8a5a3c', 0.1) }),
    pillowA: b.material({ albedo: fabric('#e3d9c6') }),
    pillowB: b.material({ albedo: fabric('#a5553a') }),
    pillowC: b.material({ albedo: fabric('#97a58c') }),
    curtain: b.material({ albedo: fabric('#e8e2d6', 0.06) }),
    rug: b.material({ albedo: rugPattern('#cfc6b6', '#5b6470', '#8f8676') }),
    rugEdge: b.material({ albedo: solid('#a9a091') }),
    darkWood: b.material({ albedo: wood('#4a3424', '#2e2016', 1) }),
    oak: b.material({ albedo: wood('#a27a52', '#7e5a39', 2) }),
    black: b.material({ albedo: solid('#1d1d1f') }),
    brass: b.material({ albedo: solid('#a07a3c') }),
    bulb: b.material({ albedo: [0, 0, 0], emissive: emissive('#fff4e0', 4), castsShadow: false }),
    shade: b.material({ albedo: [0, 0, 0], emissive: emissive('#ffd9a8', 1.1), castsShadow: false }),
    ceramic: b.material({ albedo: speckle('#e8e4dc', 0.1) }),
    terracotta: b.material({ albedo: speckle('#b06a48', 0.2) }),
    leaves: b.material({ albedo: leaves() }),
    art: b.material({ albedo: artwork(-4.3, 1.2, 1.5, 1.0, ['#efe8dc', '#5b6470', '#d9a441', '#a5553a', '#97a58c'], 2) }),
    frameBlack: b.material({ albedo: solid('#222222') }),
  }

  const s = {
    back: b.surface({ id: 'feature-wall', label: 'Feature wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    left: b.surface({ id: 'window-wall', label: 'Window wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    right: b.surface({ id: 'side-wall', label: 'Side wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    ceiling: b.surface({ id: 'ceiling', label: 'Ceiling', accepts: ['paint'] }),
    floor: b.surface({ id: 'floor', label: 'Floor', accepts: ['flooring'] }),
    rug: b.surface({ id: 'rug', label: 'Rug', accepts: ['rug'] }),
    sectional: b.surface({ id: 'sectional-sofa', label: 'Sectional sofa', accepts: ['upholstery'], group: 'seating' }),
    loveseat: b.surface({ id: 'loveseat', label: 'Loveseat sofa', accepts: ['upholstery'], group: 'seating' }),
    ottoman: b.surface({ id: 'ottoman', label: 'Ottoman', accepts: ['upholstery'] }),
    cushions: b.surface({ id: 'cushions', label: 'Cushions', accepts: ['upholstery'] }),
    curtains: b.surface({ id: 'curtains', label: 'Curtains', accepts: ['curtain'] }),
  }

  // ---- Shell
  const winA: Opening = { u0: 1.2, u1: 2.5, y0: 0.5, y1: 2.35 }
  const winB: Opening = { u0: 3.3, u1: 4.6, y0: 0.5, y1: 2.35 }
  const backW: WallSpec = { origin: [X0, 0, Z0], right: [1, 0, 0], width: W, height: H, mat: m.backWall, surface: s.back }
  const leftW: WallSpec = { origin: [X0, 0, 0], right: [0, 0, -1], width: D, height: H, mat: m.sideWall, surface: s.left, openings: [winA, winB], revealDepth: 0.2, revealMat: m.trim }
  const rightW: WallSpec = { origin: [X1, 0, Z0], right: [0, 0, 1], width: D, height: H, mat: m.sideWall, surface: s.right }
  wall(b, backW)
  wall(b, leftW)
  wall(b, rightW)
  for (const win of [winA, winB]) {
    windowFrame(b, leftW, win, 0.15, m.trim, { v: 1, h: 1 })
    openingLight(b, leftW, win, 0.19, [2.3, 2.6, 3.1])
  }
  backdrop(b, leftW, 6, m.sky)

  b.quad([X0, 0, Z0], [X1, 0, Z0], [X1, 0, 0], [X0, 0, 0], m.floor, { surface: s.floor })
  b.quad([X0, H, 0], [X1, H, 0], [X1, H, Z0], [X0, H, Z0], m.ceiling, { surface: s.ceiling })
  for (const [x, z] of [[-1.2, -1.7], [1.2, -1.7], [-1.2, -3.9], [1.2, -3.9]]) downlight(b, [x, H, z], m.bulb, m.trim)
  baseboard(b, backW, 0, W, m.trim)
  baseboard(b, leftW, 0, D, m.trim)
  baseboard(b, rightW, 0, D, m.trim)

  // ---- Curtains: a pair at each window on one long track
  curtains(b, leftW, {
    top: 2.6, drop: 2.56, offset: 0.16, mat: m.curtain, surface: s.curtains, rodMat: m.black, rod: [0.75, 5.05],
    panels: [
      { u: 0.8, width: 0.55, folds: 4 }, { u: 2.45, width: 0.55, folds: 4 },
      { u: 2.9, width: 0.55, folds: 4 }, { u: 4.55, width: 0.55, folds: 4 },
    ],
  })

  // ---- Sectional along the back wall, chaise on the right
  const sx = -0.7, sz = Z0 + 0.56
  const half = sofa(b, { pos: [sx, 0, sz], yaw: 0, seats: 4, seatW: 0.66, mat: m.sectional, surface: s.sectional, legMat: m.darkWood, chaise: { side: 1, length: 0.95 } })
  cushion(b, [sx - half + 0.45, 0.52, sz - 0.12], 14, m.pillowA, s.cushions)
  cushion(b, [sx - 0.33, 0.52, sz - 0.14], 4, m.pillowB, s.cushions, 0.42)
  cushion(b, [sx + 0.33, 0.52, sz - 0.14], -4, m.pillowA, s.cushions, 0.42)
  cushion(b, [sx + half - 0.5, 0.52, sz - 0.12], -12, m.pillowC, s.cushions)

  // ---- Loveseat on the right, facing the windows
  const lx = X1 - 0.62, lz = -3.55
  sofa(b, { pos: [lx, 0, lz], yaw: -90, seats: 2, mat: m.loveseat, surface: s.loveseat, legMat: m.darkWood, rolled: true })
  cushion(b, [lx + 0.12, 0.52, lz - 0.45], -100, m.pillowA, s.cushions)
  cushion(b, [lx + 0.12, 0.52, lz + 0.45], -80, m.pillowB, s.cushions)

  // ---- Rug and ottoman
  const rx0 = -2.2, rx1 = 1.9, rz0 = -4.5, rz1 = -1.3, ry = 0.012
  b.quad([rx0, ry, rz0], [rx1, ry, rz0], [rx1, ry, rz1], [rx0, ry, rz1], m.rug, { surface: s.rug })
  b.box(frame([(rx0 + rx1) / 2, 0, (rz0 + rz1) / 2]), [rx1 - rx0, ry, rz1 - rz0], m.rugEdge, { faces: 'flrb' })
  const ox = -0.45, oz = -2.6
  b.box(frame([ox, 0.06, oz], 8), [0.95, 0.36, 0.95], m.ottoman, { surface: s.ottoman, bulge: 0.04, round: 0.03, faces: 'flrtb', res: 10 })
  for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) b.cylinder(frame([ox + dx, 0, oz + dz]), 0.022, 0.016, 0.06, m.darkWood, { segments: 10 })
  // A tray on the ottoman
  b.box(frame([ox, 0.42, oz], 8), [0.46, 0.03, 0.32], m.oak)
  b.cylinder(frame([ox - 0.1, 0.45, oz]), 0.05, 0.06, 0.14, m.terracotta, { segments: 24 })

  // ---- Side table and lamp by the sectional's left arm
  const tx = sx - half - 0.35, tz = Z0 + 0.45
  b.cylinder(frame([tx, 0, tz]), 0.2, 0.2, 0.55, m.oak, { segments: 32 })
  b.cylinder(frame([tx, 0.55, tz]), 0.09, 0.07, 0.24, m.ceramic, { segments: 24 })
  b.cylinder(frame([tx, 0.8, tz]), 0.17, 0.13, 0.22, m.shade, { segments: 32 })
  b.pointLights.push({ pos: [tx, 0.9, tz], radius: 0.05, intensity: mul(hex('#ffcf96'), 0.8) })

  // ---- Plant in the window corner, art over the loveseat
  const px = X0 + 0.42, pz = Z0 + 0.45
  b.cylinder(frame([px, 0, pz]), 0.17, 0.21, 0.44, m.ceramic, { segments: 40 })
  plant(b, [px, 0.44, pz], m.leaves, m.darkWood, 60, 1.15, 3)
  b.box(frame([X1 - 0.015, 1.15, -3.55], -90), [1.58, 1.1, 0.03], m.frameBlack)
  b.quad([X1 - 0.032, 2.2, -4.3], [X1 - 0.032, 2.2, -2.8], [X1 - 0.032, 1.2, -2.8], [X1 - 0.032, 1.2, -4.3], m.art)
}

const def: SceneDef = {
  id: 'family',
  name: 'Family room',
  roomType: 'living',
  camera: { pos: [0.75, 1.4, 0.35], target: [-0.75, 0.98, -5.4], fovY: 56, width: 1600, height: 1000 },
  exposure: 1.4,
  build,
  presets: [
    {
      id: 'weekend-easy',
      name: 'Weekend easy',
      description: 'Stone performance weave, denim loveseat and natural sheers.',
      selections: {
        'sectional-sofa': { productId: 'performance-weave', variantId: 'performance-weave-v1' },
        loveseat: { productId: 'performance-weave', variantId: 'performance-weave-v2' },
        ottoman: { productId: 'leather', variantId: 'leather-v1' },
        curtains: { productId: 'linen-sheer', variantId: 'linen-sheer-v2' },
        rug: { productId: 'berber-rug', variantId: 'berber-rug-v1' },
      },
    },
    {
      id: 'jewel-box',
      name: 'Jewel box',
      description: 'Emerald velvet, mustard accents and blush blackout curtains.',
      selections: {
        'sectional-sofa': { productId: 'velvet', variantId: 'velvet-v1' },
        loveseat: { productId: 'velvet', variantId: 'velvet-v2' },
        ottoman: { productId: 'velvet', variantId: 'velvet-v4' },
        cushions: { productId: 'velvet', variantId: 'velvet-v2' },
        curtains: { productId: 'blackout-velvet', variantId: 'blackout-velvet-v4' },
        'feature-wall': { productId: 'arches', variantId: 'arches-v1' },
      },
    },
    {
      id: 'city-loft',
      name: 'City loft',
      description: 'Graphite weave, cognac leather and midnight curtains.',
      selections: {
        'sectional-sofa': { productId: 'performance-weave', variantId: 'performance-weave-v4' },
        loveseat: { productId: 'leather', variantId: 'leather-v1' },
        ottoman: { productId: 'leather', variantId: 'leather-v2' },
        curtains: { productId: 'blackout-velvet', variantId: 'blackout-velvet-v3' },
        floor: { productId: 'herringbone', variantId: 'herringbone-v2' },
      },
    },
  ],
}

export default def
