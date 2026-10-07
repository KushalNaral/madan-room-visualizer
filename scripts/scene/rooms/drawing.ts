import { armchair, backdrop, baseboard, curtains, cushion, downlight, openingLight, plant, sofa, wall, windowFrame, type Opening, type WallSpec } from '../kit.ts'
import { artwork, emissive, fabric, leaves, marble, oakPlanks, plaster, rugPattern, skyView, solid, speckle, wood } from '../materials.ts'
import { hex, mul, norm } from '../math.ts'
import { frame, type SceneBuilder, type SceneDef } from '../scene.ts'

// A formal drawing room: a rolled-arm sofa between two tall curtained windows, a pair of
// armchairs facing each other across a round table.
const W = 5.6, D = 5.8, H = 3.1
const X0 = -W / 2, X1 = W / 2, Z0 = -D

function build(b: SceneBuilder) {
  b.ambient = [0.16, 0.15, 0.145]
  b.sun = { dir: norm([0.35, 0.6, -0.72]), angularRadius: 0.012, irradiance: [2.3, 2.1, 1.8] }

  const m = {
    backWall: b.material({ albedo: plaster('#d9d2c4') }),
    sideWall: b.material({ albedo: plaster('#e7e3dc') }),
    ceiling: b.material({ albedo: plaster('#f0eee9', 0.02) }),
    floor: b.material({ albedo: oakPlanks('#9c7351', '#7a5539', 0.12, 0.9) }),
    trim: b.material({ albedo: solid('#f3f1ec') }),
    sky: b.material({ albedo: [0, 0, 0], emissive: skyView(1.15), castsShadow: false }),
    sofa: b.material({ albedo: fabric('#3f5a55', 0.08) }),
    chair: b.material({ albedo: fabric('#c9b9a0') }),
    pillowA: b.material({ albedo: fabric('#d8c7a4') }),
    pillowB: b.material({ albedo: fabric('#a5553a') }),
    curtain: b.material({ albedo: fabric('#a9886a', 0.07) }),
    rug: b.material({ albedo: rugPattern('#c9b9a0', '#3f5a55', '#8a6a48') }),
    rugEdge: b.material({ albedo: solid('#a8977d') }),
    darkWood: b.material({ albedo: wood('#4a3424', '#2e2016', 1) }),
    marble: b.material({ albedo: marble('#f1efea', '#a8a49d') }),
    brass: b.material({ albedo: solid('#a07a3c') }),
    bulb: b.material({ albedo: [0, 0, 0], emissive: emissive('#fff4e0', 4), castsShadow: false }),
    shade: b.material({ albedo: [0, 0, 0], emissive: emissive('#ffd9a8', 1.15), castsShadow: false }),
    ceramic: b.material({ albedo: speckle('#e8e4dc', 0.1) }),
    leaves: b.material({ albedo: leaves() }),
    art: b.material({ albedo: artwork(-0.75, 1.55, 1.5, 0.95, ['#efe7d8', '#3f5a55', '#c8a27a', '#a5553a', '#d9a441']) }),
    frameGold: b.material({ albedo: solid('#9c7a3e') }),
  }

  const s = {
    back: b.surface({ id: 'feature-wall', label: 'Window wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    left: b.surface({ id: 'left-wall', label: 'Left wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    right: b.surface({ id: 'right-wall', label: 'Right wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    ceiling: b.surface({ id: 'ceiling', label: 'Ceiling', accepts: ['paint'] }),
    floor: b.surface({ id: 'floor', label: 'Floor', accepts: ['flooring'] }),
    rug: b.surface({ id: 'rug', label: 'Rug', accepts: ['rug'] }),
    sofa: b.surface({ id: 'sofa', label: 'Sofa', accepts: ['upholstery'], group: 'seating' }),
    chairs: b.surface({ id: 'armchairs', label: 'Armchairs', accepts: ['upholstery'], group: 'seating' }),
    cushions: b.surface({ id: 'cushions', label: 'Cushions', accepts: ['upholstery'] }),
    curtains: b.surface({ id: 'curtains', label: 'Curtains', accepts: ['curtain'] }),
  }

  // ---- Shell: two tall windows either side of the sofa
  const winL: Opening = { u0: 0.45, u1: 1.4, y0: 0.45, y1: 2.75 }
  const winR: Opening = { u0: 4.2, u1: 5.15, y0: 0.45, y1: 2.75 }
  const backW: WallSpec = { origin: [X0, 0, Z0], right: [1, 0, 0], width: W, height: H, mat: m.backWall, surface: s.back, openings: [winL, winR], revealDepth: 0.24, revealMat: m.trim }
  const leftW: WallSpec = { origin: [X0, 0, 0], right: [0, 0, -1], width: D, height: H, mat: m.sideWall, surface: s.left }
  const rightW: WallSpec = { origin: [X1, 0, Z0], right: [0, 0, 1], width: D, height: H, mat: m.sideWall, surface: s.right }
  wall(b, backW)
  wall(b, leftW)
  wall(b, rightW)
  for (const win of [winL, winR]) {
    windowFrame(b, backW, win, 0.17, m.trim, { v: 1, h: 2 })
    openingLight(b, backW, win, 0.21, [2.3, 2.6, 3.1])
  }
  backdrop(b, backW, 6, m.sky)

  b.quad([X0, 0, Z0], [X1, 0, Z0], [X1, 0, 0], [X0, 0, 0], m.floor, { surface: s.floor })
  b.quad([X0, H, 0], [X1, H, 0], [X1, H, Z0], [X0, H, Z0], m.ceiling, { surface: s.ceiling })
  for (const [x, z] of [[-1.4, -1.6], [1.4, -1.6], [-1.4, -4.3], [1.4, -4.3]]) downlight(b, [x, H, z], m.bulb, m.trim)
  baseboard(b, backW, 0, W, m.trim, 0.14)
  baseboard(b, leftW, 0, D, m.trim, 0.14)
  baseboard(b, rightW, 0, D, m.trim, 0.14)

  // ---- Curtains: a pair on its own pole at each window, floor length
  for (const win of [winL, winR]) {
    curtains(b, backW, {
      top: 2.96, drop: 2.94, offset: 0.2, mat: m.curtain, surface: s.curtains, rodMat: m.brass, rod: [win.u0 - 0.3, win.u1 + 0.3],
      panels: [{ u: win.u0 - 0.27, width: 0.55, folds: 4, depth: 0.055 }, { u: win.u1 - 0.28, width: 0.55, folds: 4, depth: 0.055 }],
    })
  }

  // ---- Sofa against the wall between the windows, art above it
  const sz = Z0 + 0.55
  sofa(b, { pos: [0, 0, sz], yaw: 0, seats: 3, seatW: 0.62, mat: m.sofa, surface: s.sofa, legMat: m.darkWood, rolled: true })
  cushion(b, [-0.68, 0.52, sz - 0.12], 12, m.pillowA, s.cushions)
  cushion(b, [0.0, 0.52, sz - 0.14], 0, m.pillowB, s.cushions, 0.4)
  cushion(b, [0.68, 0.52, sz - 0.12], -12, m.pillowA, s.cushions)
  b.box(frame([0, 1.5, Z0 + 0.015]), [1.6, 1.05, 0.03], m.frameGold)
  b.quad([-0.75, 2.5, Z0 + 0.032], [0.75, 2.5, Z0 + 0.032], [0.75, 1.55, Z0 + 0.032], [-0.75, 1.55, Z0 + 0.032], m.art)

  // ---- Rug, round table and the armchairs facing each other
  const rx0 = -1.9, rx1 = 1.9, rz0 = sz + 0.2, rz1 = sz + 3.0, ry = 0.012
  b.quad([rx0, ry, rz0], [rx1, ry, rz0], [rx1, ry, rz1], [rx0, ry, rz1], m.rug, { surface: s.rug })
  b.box(frame([(rx0 + rx1) / 2, 0, (rz0 + rz1) / 2]), [rx1 - rx0, ry, rz1 - rz0], m.rugEdge, { faces: 'flrb' })
  const tz = sz + 1.55
  b.cylinder(frame([0, 0.012, tz]), 0.16, 0.1, 0.4, m.darkWood, { segments: 32 })
  b.cylinder(frame([0, 0.41, tz]), 0.45, 0.45, 0.03, m.marble, { segments: 64 })
  b.cylinder(frame([0.12, 0.44, tz - 0.05]), 0.06, 0.08, 0.2, m.ceramic, { segments: 28 })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    b.sphere(frame([0.12 + Math.cos(a) * 0.04, 0.7 + (i % 2) * 0.05, tz - 0.05 + Math.sin(a) * 0.04]), [0.05, 0.08, 0.05], m.leaves, { res: 8 })
  }
  armchair(b, [-1.45, 0, tz], 90, m.chair, m.darkWood, s.chairs)
  armchair(b, [1.45, 0, tz], -90, m.chair, m.darkWood, s.chairs)

  // ---- Lamps on side tables at the sofa's ends, a plant in the corner
  for (const x of [-1.55, 1.55]) {
    b.box(frame([x, 0, sz - 0.1]), [0.4, 0.58, 0.4], m.darkWood, { faces: 'flrtb' })
    b.cylinder(frame([x, 0.58, sz - 0.1]), 0.08, 0.06, 0.28, m.ceramic, { segments: 24 })
    b.cylinder(frame([x, 0.86, sz - 0.1]), 0.18, 0.13, 0.24, m.shade, { segments: 32 })
    b.pointLights.push({ pos: [x, 0.98, sz - 0.1], radius: 0.05, intensity: mul(hex('#ffcf96'), 0.7) })
  }
  const px = X0 + 0.4, pz = -1.4
  b.cylinder(frame([px, 0, pz]), 0.17, 0.21, 0.44, m.ceramic, { segments: 40 })
  plant(b, [px, 0.44, pz], m.leaves, m.darkWood, 60, 1.2, 5)
}

const def: SceneDef = {
  id: 'drawing',
  name: 'Drawing room',
  roomType: 'living',
  camera: { pos: [0.15, 1.45, 0.75], target: [0.0, 1.2, -5.8], fovY: 52, width: 1600, height: 1000 },
  exposure: 1.4,
  build,
  presets: [
    {
      id: 'heritage',
      name: 'Heritage',
      description: 'Emerald velvet sofa, taupe curtains and linen armchairs.',
      selections: {
        sofa: { productId: 'velvet', variantId: 'velvet-v1' },
        armchairs: { productId: 'belgian-linen', variantId: 'belgian-linen-v1' },
        curtains: { productId: 'blackout-velvet', variantId: 'blackout-velvet-v1' },
        rug: { productId: 'medallion-rug', variantId: 'medallion-rug-v2' },
      },
    },
    {
      id: 'blush-salon',
      name: 'Blush salon',
      description: 'Blush curtains, rose velvet chairs and a chalk linen sofa.',
      selections: {
        curtains: { productId: 'blackout-velvet', variantId: 'blackout-velvet-v4' },
        sofa: { productId: 'belgian-linen', variantId: 'belgian-linen-v5' },
        armchairs: { productId: 'velvet', variantId: 'velvet-v4' },
        cushions: { productId: 'velvet', variantId: 'velvet-v2' },
      },
    },
    {
      id: 'navy-study',
      name: 'Navy study',
      description: 'Midnight curtains, navy velvet and cognac leather.',
      selections: {
        curtains: { productId: 'blackout-velvet', variantId: 'blackout-velvet-v3' },
        sofa: { productId: 'velvet', variantId: 'velvet-v3' },
        armchairs: { productId: 'leather', variantId: 'leather-v1' },
        'feature-wall': { productId: 'velvet-matt', variantId: 'velvet-matt-v4' },
        floor: { productId: 'herringbone', variantId: 'herringbone-v2' },
      },
    },
  ],
}

export default def
