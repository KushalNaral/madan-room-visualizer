import { armchair, backdrop, baseboard, curtains, cushion, downlight, openingLight, plant, sofa, wall, windowFrame, type Opening, type WallSpec } from '../kit.ts'
import { artwork, emissive, fabric, leaves, marble, oakPlanks, plaster, rugPattern, skyView, solid, speckle, wood } from '../materials.ts'
import { hex, mul, norm } from '../math.ts'
import { frame, type SceneBuilder, type SceneDef } from '../scene.ts'

// A lounge built around a wide window: dress curtains and sheers behind a three-seat sofa,
// two armchairs facing each other across the rug.
const W = 6.0, D = 6.4, H = 3.0
const X0 = -W / 2, X1 = W / 2, Z0 = -D

function build(b: SceneBuilder) {
  b.ambient = [0.15, 0.145, 0.14]
  b.sun = { dir: norm([-0.45, 0.55, -0.7]), angularRadius: 0.012, irradiance: [2.4, 2.2, 1.85] }

  const m = {
    backWall: b.material({ albedo: plaster('#d6cfc3') }),
    sideWall: b.material({ albedo: plaster('#e6e2db') }),
    ceiling: b.material({ albedo: plaster('#efede9', 0.02) }),
    floor: b.material({ albedo: oakPlanks('#b08660', '#8f6542') }),
    trim: b.material({ albedo: solid('#f1efea') }),
    sky: b.material({ albedo: [0, 0, 0], emissive: skyView(1.1), castsShadow: false }),
    sofa: b.material({ albedo: fabric('#8f8a82') }),
    chair: b.material({ albedo: fabric('#a7744c', 0.1) }),
    pillowA: b.material({ albedo: fabric('#d2b48c') }),
    pillowB: b.material({ albedo: fabric('#55606e') }),
    drape: b.material({ albedo: fabric('#b9a58c', 0.07) }),
    // Light passes through sheers; a lamp in front (below) gives them their back-lit glow.
    sheer: b.material({ albedo: fabric('#f2efe8', 0.03), castsShadow: false }),
    rug: b.material({ albedo: rugPattern('#ddd3c2', '#7a6551', '#b0977a') }),
    rugEdge: b.material({ albedo: solid('#bcae97') }),
    darkWood: b.material({ albedo: wood('#4a3424', '#2e2016', 1) }),
    oak: b.material({ albedo: wood('#a27a52', '#7e5a39', 2) }),
    marble: b.material({ albedo: marble() }),
    black: b.material({ albedo: solid('#1d1d1f') }),
    brass: b.material({ albedo: solid('#a07a3c') }),
    shade: b.material({ albedo: [0, 0, 0], emissive: emissive('#ffd9a8', 1.2), castsShadow: false }),
    bulb: b.material({ albedo: [0, 0, 0], emissive: emissive('#fff4e0', 4), castsShadow: false }),
    ceramic: b.material({ albedo: speckle('#e8e4dc', 0.1) }),
    leaves: b.material({ albedo: leaves() }),
    bookA: b.material({ albedo: solid('#2f4a5a') }),
    bookB: b.material({ albedo: solid('#c9b48a') }),
    art: b.material({ albedo: artwork(-3.52, 1.25, 1.04, 1.25, ['#ece5d8', '#7d8f7a', '#c8a27a', '#3b4a5c'], 2) }),
    frameOak: b.material({ albedo: solid('#8a6a48') }),
  }

  const s = {
    back: b.surface({ id: 'window-wall', label: 'Window wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    left: b.surface({ id: 'left-wall', label: 'Left wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    right: b.surface({ id: 'art-wall', label: 'Art wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    ceiling: b.surface({ id: 'ceiling', label: 'Ceiling', accepts: ['paint'] }),
    floor: b.surface({ id: 'floor', label: 'Floor', accepts: ['flooring'] }),
    rug: b.surface({ id: 'rug', label: 'Rug', accepts: ['rug'] }),
    drapes: b.surface({ id: 'curtains', label: 'Curtains', accepts: ['curtain'], group: 'window' }),
    sheers: b.surface({ id: 'sheers', label: 'Sheer curtains', accepts: ['curtain'], group: 'window' }),
    sofa: b.surface({ id: 'sofa', label: 'Sofa', accepts: ['upholstery'], group: 'seating' }),
    chairs: b.surface({ id: 'armchairs', label: 'Armchairs', accepts: ['upholstery'], group: 'seating' }),
    cushions: b.surface({ id: 'cushions', label: 'Cushions', accepts: ['upholstery'] }),
  }

  // ---- Shell
  const win: Opening = { u0: 1.25, u1: 4.75, y0: 0.35, y1: 2.65 }
  const backW: WallSpec = { origin: [X0, 0, Z0], right: [1, 0, 0], width: W, height: H, mat: m.backWall, surface: s.back, openings: [win], revealDepth: 0.22, revealMat: m.trim }
  const leftW: WallSpec = { origin: [X0, 0, 0], right: [0, 0, -1], width: D, height: H, mat: m.sideWall, surface: s.left }
  const rightW: WallSpec = { origin: [X1, 0, Z0], right: [0, 0, 1], width: D, height: H, mat: m.sideWall, surface: s.right }
  wall(b, backW)
  wall(b, leftW)
  wall(b, rightW)
  windowFrame(b, backW, win, 0.16, m.trim, { v: 2, h: 1 })
  backdrop(b, backW, 6, m.sky)
  openingLight(b, backW, win, 0.2, [2.2, 2.5, 3.0])

  b.quad([X0, 0, Z0], [X1, 0, Z0], [X1, 0, 0], [X0, 0, 0], m.floor, { surface: s.floor })
  b.quad([X0, H, 0], [X1, H, 0], [X1, H, Z0], [X0, H, Z0], m.ceiling, { surface: s.ceiling })
  for (const [x, z] of [[-1.3, -1.8], [1.3, -1.8], [-1.3, -4.4], [1.3, -4.4]]) downlight(b, [x, H, z], m.bulb, m.trim)
  baseboard(b, backW, 0, W, m.trim)
  baseboard(b, leftW, 0, D, m.trim)
  baseboard(b, rightW, 0, D, m.trim)

  // ---- Window dressing: sheers across the glass, dress curtains gathered either side.
  curtains(b, backW, {
    top: 2.84, drop: 2.82, offset: 0.1, mat: m.sheer, surface: s.sheers,
    panels: [{ u: 1.2, width: 1.8, folds: 16, depth: 0.03 }, { u: 3.0, width: 1.8, folds: 16, depth: 0.03 }],
  })
  curtains(b, backW, {
    top: 2.86, drop: 2.84, offset: 0.2, mat: m.drape, surface: s.drapes, rodMat: m.brass, rod: [0.35, 5.65],
    panels: [{ u: 0.4, width: 1.05, folds: 6, depth: 0.06 }, { u: 4.55, width: 1.05, folds: 6, depth: 0.06 }],
  })
  // Back-light for the sheers: faces the window from just inside the room.
  b.areaLight({ origin: [X0 + 1.25, 0.4, Z0 + 0.75], u: [0, 2.2, 0], v: [3.5, 0, 0], radiance: [0.55, 0.58, 0.62] })

  // ---- Sofa in front of the window, facing the room
  const sz = Z0 + 2.55
  sofa(b, { pos: [0, 0, sz], yaw: 0, seats: 3, mat: m.sofa, surface: s.sofa, legMat: m.darkWood })
  cushion(b, [-0.74, 0.52, sz - 0.12], 12, m.pillowA, s.cushions)
  cushion(b, [0.0, 0.52, sz - 0.14], 0, m.pillowB, s.cushions, 0.42)
  cushion(b, [0.74, 0.52, sz - 0.12], -10, m.pillowA, s.cushions)

  // ---- Rug, coffee table and armchairs
  const rx0 = -1.7, rx1 = 1.7, rz0 = sz + 0.15, rz1 = sz + 2.75, ry = 0.012
  b.quad([rx0, ry, rz0], [rx1, ry, rz0], [rx1, ry, rz1], [rx0, ry, rz1], m.rug, { surface: s.rug })
  b.box(frame([(rx0 + rx1) / 2, 0, (rz0 + rz1) / 2]), [rx1 - rx0, ry, rz1 - rz0], m.rugEdge, { faces: 'flrb' })

  const tz = sz + 1.4
  b.box(frame([0, 0, tz]), [1.2, 0.38, 0.6], m.oak, { faces: 'flrtb' })
  b.box(frame([0, 0.38, tz]), [1.24, 0.03, 0.64], m.marble, { faces: 'flrtb' })
  b.box(frame([0.25, 0.41, tz + 0.05], 14), [0.3, 0.035, 0.22], m.bookA)
  b.box(frame([0.25, 0.445, tz + 0.05], 6), [0.27, 0.03, 0.2], m.bookB)
  b.cylinder(frame([-0.3, 0.41, tz]), 0.07, 0.09, 0.22, m.ceramic, { segments: 32 })

  armchair(b, [-1.95, 0, tz + 0.05], 70, m.chair, m.darkWood, s.chairs)
  armchair(b, [1.95, 0, tz + 0.05], -70, m.chair, m.darkWood, s.chairs)

  // ---- Floor lamp and plant by the window
  const lx = X0 + 0.45, lz = Z0 + 1.6
  b.cylinder(frame([lx, 0, lz]), 0.16, 0.16, 0.02, m.black, { segments: 32 })
  b.cylinder(frame([lx, 0.02, lz]), 0.012, 0.012, 1.45, m.brass, { segments: 12 })
  b.cylinder(frame([lx, 1.4, lz]), 0.24, 0.18, 0.32, m.shade, { segments: 40 })
  b.pointLights.push({ pos: [lx, 1.52, lz], radius: 0.08, intensity: mul(hex('#ffcf96'), 1.3) })

  const px = X1 - 0.45, pz = Z0 + 1.0
  b.cylinder(frame([px, 0, pz]), 0.18, 0.22, 0.46, m.ceramic, { segments: 40 })
  plant(b, [px, 0.46, pz], m.leaves, m.darkWood, 70, 1.3, 11)

  // ---- Artwork on the right wall (faces -x)
  b.box(frame([X1 - 0.015, 1.2, -3.0], -90), [1.1, 1.35, 0.03], m.frameOak)
  b.quad([X1 - 0.032, 2.5, -3.52], [X1 - 0.032, 2.5, -2.48], [X1 - 0.032, 1.25, -2.48], [X1 - 0.032, 1.25, -3.52], m.art)
}

const def: SceneDef = {
  id: 'lounge',
  name: 'Window lounge',
  roomType: 'living',
  camera: { pos: [0.2, 1.38, 0.9], target: [-0.05, 1.12, -6.4], fovY: 52, width: 1600, height: 1000 },
  exposure: 1.4,
  build,
  presets: [
    {
      id: 'soft-linen',
      name: 'Soft linen',
      description: 'White linen sheers, taupe drapes and a bouclé sofa.',
      selections: {
        sheers: { productId: 'linen-sheer', variantId: 'linen-sheer-v1' },
        curtains: { productId: 'blackout-velvet', variantId: 'blackout-velvet-v1' },
        sofa: { productId: 'boucle', variantId: 'boucle-v1' },
        armchairs: { productId: 'belgian-linen', variantId: 'belgian-linen-v3' },
        rug: { productId: 'berber-rug', variantId: 'berber-rug-v1' },
      },
    },
    {
      id: 'velvet-evening',
      name: 'Velvet evening',
      description: 'Blackout velvet drapes, deep velvet seating, walnut floor.',
      selections: {
        curtains: { productId: 'blackout-velvet', variantId: 'blackout-velvet-v2' },
        sheers: { productId: 'linen-sheer', variantId: 'linen-sheer-v2' },
        sofa: { productId: 'velvet', variantId: 'velvet-v1' },
        armchairs: { productId: 'velvet', variantId: 'velvet-v3' },
        cushions: { productId: 'velvet', variantId: 'velvet-v4' },
        'window-wall': { productId: 'velvet-matt', variantId: 'velvet-matt-v4' },
        floor: { productId: 'herringbone', variantId: 'herringbone-v2' },
      },
    },
    {
      id: 'coastal-stripe',
      name: 'Coastal stripe',
      description: 'Navy ticking-stripe drapes, denim weave and jute.',
      selections: {
        curtains: { productId: 'ticking-stripe', variantId: 'ticking-stripe-v1' },
        sofa: { productId: 'performance-weave', variantId: 'performance-weave-v2' },
        armchairs: { productId: 'leather', variantId: 'leather-v1' },
        rug: { productId: 'jute-rug', variantId: 'jute-rug-v1' },
      },
    },
  ],
}

export default def
