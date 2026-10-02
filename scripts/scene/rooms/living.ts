import { backdrop, baseboard, downlight, openingLight, plant, wall, windowFrame, type Opening, type WallSpec } from '../kit.ts'
import { artwork, emissive, fabric, leaves, marble, oakPlanks, plaster, rugPattern, skyView, solid, speckle, wood } from '../materials.ts'
import { hex, mul, norm, type Vec3 } from '../math.ts'
import { frame, type SceneBuilder, type SceneDef } from '../scene.ts'

const W = 5.6, D = 6.2, H = 2.9
const X0 = -W / 2, X1 = W / 2, Z0 = -D

function build(b: SceneBuilder) {
  b.ambient = [0.15, 0.145, 0.14]
  b.sun = { dir: norm([-0.78, 0.5, -0.38]), angularRadius: 0.012, irradiance: [2.7, 2.42, 2.0] }

  // ---- Materials
  const m = {
    backWall: b.material({ albedo: plaster('#c9c2b6') }),
    sideWall: b.material({ albedo: plaster('#e3dfd8') }),
    ceiling: b.material({ albedo: plaster('#efede9', 0.02) }),
    floor: b.material({ albedo: oakPlanks() }),
    trim: b.material({ albedo: solid('#f1efea') }),
    sky: b.material({ albedo: [0, 0, 0], emissive: skyView(1.2), castsShadow: false }),
    sofa: b.material({ albedo: fabric('#a9a59e') }),
    pillowA: b.material({ albedo: fabric('#b5653f') }),
    pillowB: b.material({ albedo: fabric('#8c9a7d') }),
    armchair: b.material({ albedo: fabric('#7a4b2c', 0.12) }),
    curtain: b.material({ albedo: fabric('#e9e4da', 0.06) }),
    rug: b.material({ albedo: rugPattern('#d8cdb8', '#6f5a45', '#a48a6d') }),
    rugEdge: b.material({ albedo: solid('#b9ab93') }),
    oak: b.material({ albedo: wood('#a27a52', '#7e5a39', 2) }),
    darkWood: b.material({ albedo: wood('#4a3424', '#2e2016', 1) }),
    marble: b.material({ albedo: marble() }),
    black: b.material({ albedo: solid('#1d1d1f') }),
    brass: b.material({ albedo: solid('#a07a3c') }),
    shade: b.material({ albedo: [0, 0, 0], emissive: emissive('#ffd9a8', 1.25), castsShadow: false }),
    bulb: b.material({ albedo: [0, 0, 0], emissive: emissive('#fff4e0', 4), castsShadow: false }),
    ceramic: b.material({ albedo: speckle('#e8e4dc', 0.1) }),
    terracotta: b.material({ albedo: speckle('#b06a48', 0.2) }),
    leaves: b.material({ albedo: leaves() }),
    bookA: b.material({ albedo: solid('#2f4a5a') }),
    bookB: b.material({ albedo: solid('#c9b48a') }),
    bookC: b.material({ albedo: solid('#8a3b2e') }),
    art: b.material({ albedo: artwork(-0.8, 1.33, 1.3, 0.86, ['#e7dfd0', '#c56b3f', '#33475b', '#d9a441', '#8fa58a']) }),
    frameBlack: b.material({ albedo: solid('#222222') }),
  }

  // ---- Surfaces
  const s = {
    back: b.surface({ id: 'feature-wall', label: 'Feature wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    left: b.surface({ id: 'window-wall', label: 'Window wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    right: b.surface({ id: 'side-wall', label: 'Side wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    ceiling: b.surface({ id: 'ceiling', label: 'Ceiling', accepts: ['paint'] }),
    floor: b.surface({ id: 'floor', label: 'Floor', accepts: ['flooring'] }),
    rug: b.surface({ id: 'rug', label: 'Rug', accepts: ['rug'] }),
    sofa: b.surface({ id: 'sofa', label: 'Sofa', accepts: ['upholstery'], group: 'seating' }),
    armchair: b.surface({ id: 'armchair', label: 'Armchair', accepts: ['upholstery'], group: 'seating' }),
    pillows: b.surface({ id: 'cushions', label: 'Cushions', accepts: ['upholstery'] }),
    curtains: b.surface({ id: 'curtains', label: 'Curtains', accepts: ['curtain'] }),
  }

  // ---- Shell
  const win: Opening = { u0: 1.85, u1: 3.75, y0: 0.55, y1: 2.45 }
  const backW: WallSpec = { origin: [X0, 0, Z0], right: [1, 0, 0], width: W, height: H, mat: m.backWall, surface: s.back }
  const leftW: WallSpec = {
    origin: [X0, 0, 0], right: [0, 0, -1], width: D, height: H, mat: m.sideWall, surface: s.left,
    openings: [win], revealDepth: 0.22, revealMat: m.trim,
  }
  const rightW: WallSpec = { origin: [X1, 0, Z0], right: [0, 0, 1], width: D, height: H, mat: m.sideWall, surface: s.right }
  wall(b, backW)
  wall(b, leftW)
  wall(b, rightW)
  windowFrame(b, leftW, win, 0.16, m.trim, { v: 1, h: 1 })
  backdrop(b, leftW, 6, m.sky)
  openingLight(b, leftW, win, 0.2, [2.4, 2.7, 3.2])

  b.quad([X0, 0, Z0], [X1, 0, Z0], [X1, 0, 0], [X0, 0, 0], m.floor, { surface: s.floor })
  b.quad([X0, H, 0], [X1, H, 0], [X1, H, Z0], [X0, H, Z0], m.ceiling, { surface: s.ceiling })
  for (const [x, z] of [[-1.2, -2], [1.2, -2], [-1.2, -4.4], [1.2, -4.4]]) downlight(b, [x, H, z], m.bulb, m.trim)

  baseboard(b, backW, 0, W, m.trim)
  baseboard(b, leftW, 0, D, m.trim)
  baseboard(b, rightW, 0, D, m.trim)

  // ---- Rug
  const rx0 = -1.5, rx1 = 1.2, rz0 = -5.1, rz1 = -2.95, ry = 0.012
  b.quad([rx0, ry, rz0], [rx1, ry, rz0], [rx1, ry, rz1], [rx0, ry, rz1], m.rug, { surface: s.rug })
  b.box(frame([(rx0 + rx1) / 2, 0, (rz0 + rz1) / 2]), [rx1 - rx0, ry, rz1 - rz0], m.rugEdge, { faces: 'flrb' })

  // ---- Sofa (front faces +z)
  const sx = -0.15, sz = Z0 + 0.52
  const sofa = (p: Vec3, size: Vec3, opts: { bulge?: number; round?: number; pitch?: number; faces?: string } = {}) =>
    b.box(frame([sx + p[0], p[1], sz + p[2]], 0, opts.pitch ?? 0), size, m.sofa, {
      surface: s.sofa, bulge: opts.bulge, round: opts.round, faces: opts.faces ?? 'flrtb', res: 10,
    })
  sofa([0, 0.1, 0], [2.3, 0.3, 0.98], { round: 0.01 })
  sofa([-1.06, 0.4, 0], [0.18, 0.24, 0.98], { bulge: 0.02, round: 0.02 })
  sofa([1.06, 0.4, 0], [0.18, 0.24, 0.98], { bulge: 0.02, round: 0.02 })
  sofa([0, 0.4, -0.4], [1.94, 0.42, 0.18], { bulge: 0.015 })
  for (const dx of [-0.645, 0, 0.645]) {
    sofa([dx, 0.4, 0.08], [0.64, 0.15, 0.78], { bulge: 0.035, round: 0.025 })
    sofa([dx, 0.53, -0.26], [0.62, 0.48, 0.2], { bulge: 0.05, round: 0.03, pitch: -12 })
  }
  for (const dx of [-1.02, 1.02]) for (const dz of [-0.4, 0.4]) {
    b.cylinder(frame([sx + dx, 0, sz + dz]), 0.025, 0.018, 0.1, m.darkWood, { segments: 12 })
  }
  // Throw cushions
  b.box(frame([sx - 0.72, 0.52, sz - 0.12], 12, -18), [0.46, 0.44, 0.13], m.pillowA, { surface: s.pillows, bulge: 0.07, round: 0.04, res: 10 })
  b.box(frame([sx + 0.74, 0.52, sz - 0.12], -10, -16), [0.46, 0.44, 0.13], m.pillowB, { surface: s.pillows, bulge: 0.07, round: 0.04, res: 10 })

  // ---- Artwork
  b.box(frame([-0.15, 1.3, Z0 + 0.015]), [1.36, 0.92, 0.03], m.frameBlack)
  b.quad([-0.8, 2.19, Z0 + 0.032], [0.5, 2.19, Z0 + 0.032], [0.5, 1.33, Z0 + 0.032], [-0.8, 1.33, Z0 + 0.032], m.art)

  // ---- Coffee table + decor
  const tx = -0.15, tz = -4.0
  b.cylinder(frame([tx, 0.012, tz]), 0.2, 0.13, 0.36, m.darkWood, { segments: 40 })
  b.cylinder(frame([tx, 0.372, tz]), 0.52, 0.52, 0.035, m.marble, { segments: 64 })
  b.box(frame([tx + 0.12, 0.407, tz + 0.05], 18), [0.3, 0.035, 0.22], m.bookA)
  b.box(frame([tx + 0.12, 0.442, tz + 0.05], 10), [0.27, 0.03, 0.2], m.bookB)
  b.cylinder(frame([tx - 0.22, 0.407, tz - 0.08]), 0.07, 0.09, 0.2, m.ceramic, { segments: 32 })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    b.sphere(frame([tx - 0.22 + Math.cos(a) * 0.04, 0.68 + (i % 2) * 0.05, tz - 0.08 + Math.sin(a) * 0.04]), [0.05, 0.08, 0.05], m.leaves, { res: 8 })
  }

  // ---- Armchair (faces the sofa diagonally)
  const ax = 1.55, az = -3.55, yaw = -55
  const chair = (p: Vec3, size: Vec3, opts: { bulge?: number; round?: number; pitch?: number } = {}) => {
    const f0 = frame([0, 0, 0], yaw)
    const off = f0.dir(p)
    b.box(frame([ax + off[0], p[1], az + off[2]], yaw, opts.pitch ?? 0), size, m.armchair, {
      surface: s.armchair, bulge: opts.bulge, round: opts.round, faces: 'flrtb', res: 10,
    })
  }
  chair([0, 0.14, 0], [0.82, 0.28, 0.82], { round: 0.015 })
  chair([0, 0.42, 0.06], [0.58, 0.13, 0.66], { bulge: 0.035, round: 0.025 })
  chair([0, 0.42, -0.33], [0.82, 0.5, 0.16], { bulge: 0.03, round: 0.02, pitch: -8 })
  chair([-0.34, 0.42, 0.02], [0.14, 0.24, 0.78], { bulge: 0.015, round: 0.02 })
  chair([0.34, 0.42, 0.02], [0.14, 0.24, 0.78], { bulge: 0.015, round: 0.02 })
  for (const dx of [-0.35, 0.35]) for (const dz of [-0.35, 0.35]) {
    const off = frame([0, 0, 0], yaw).dir([dx, 0, dz])
    b.cylinder(frame([ax + off[0], 0, az + off[2]]), 0.022, 0.016, 0.14, m.darkWood, { segments: 12 })
  }

  // ---- Floor lamp (back-left corner)
  const lx = -2.15, lz = -5.55
  b.cylinder(frame([lx, 0, lz]), 0.16, 0.16, 0.02, m.black, { segments: 32 })
  b.cylinder(frame([lx, 0.02, lz]), 0.012, 0.012, 1.4, m.brass, { segments: 12 })
  b.cylinder(frame([lx, 1.36, lz]), 0.25, 0.19, 0.32, m.shade, { segments: 40 })
  b.pointLights.push({ pos: [lx, 1.48, lz], radius: 0.08, intensity: mul(hex('#ffcf96'), 2.2) })

  // ---- Sideboard on the right wall (front faces -x)
  const bx = X1 - 0.23, bz = -3.55
  const sb = frame([bx, 0.1, bz], -90)
  b.box(sb, [1.9, 0.62, 0.44], m.oak, { faces: 'flrtb' })
  for (const dz of [-0.85, 0.85]) for (const dx of [-0.15, 0.15]) {
    b.cylinder(frame([bx + dx, 0, bz + dz]), 0.02, 0.015, 0.1, m.darkWood, { segments: 10 })
  }
  for (const dz of [-0.32, 0.32]) b.box(frame([bx - 0.225, 0.12, bz + dz], -90), [0.008, 0.58, 0.006], m.darkWood)
  // Table lamp
  b.sphere(frame([bx, 0.72 + 0.11, bz - 0.55]), 0.11, m.ceramic, { res: 14 })
  b.cylinder(frame([bx, 0.93, bz - 0.55]), 0.16, 0.12, 0.2, m.shade, { segments: 32 })
  b.pointLights.push({ pos: [bx, 1.02, bz - 0.55], radius: 0.05, intensity: mul(hex('#ffcf96'), 0.9) })
  // Books + vase
  b.box(frame([bx, 0.72, bz + 0.2], -90), [0.24, 0.05, 0.3], m.bookC)
  b.box(frame([bx, 0.77, bz + 0.2], -80), [0.22, 0.04, 0.28], m.bookA)
  b.cylinder(frame([bx, 0.72, bz + 0.62]), 0.06, 0.09, 0.32, m.terracotta, { segments: 28 })

  // ---- Plant (back-right corner)
  const px = 2.15, pz = -5.55
  b.cylinder(frame([px, 0, pz]), 0.17, 0.22, 0.46, m.ceramic, { segments: 40 })
  plant(b, [px, 0.46, pz], m.leaves, m.darkWood, 70, 1.25)

  // ---- Curtains on the window wall (front faces +x; panels run toward -z)
  b.box(frame([X0 + 0.12, H - 0.16, -2.8]), [0.03, 0.03, 2.9], m.brass, { faces: 'flrtd' })
  const panel = (zStart: number, width: number) =>
    b.curtain(frame([X0 + 0.12, H - 0.18, zStart], 90), width, H - 0.2, 5, 0.045, m.curtain, { surface: s.curtains })
  panel(-1.35, 0.72)
  panel(-3.53, 0.72)
}

const def: SceneDef = {
  id: 'living',
  name: 'Living room',
  camera: { pos: [0.3, 1.36, 0.95], target: [-0.18, 1.08, -6.2], fovY: 50, width: 1600, height: 1000 },
  exposure: 1.4,
  build,
  presets: [
    {
      id: 'scandi-calm',
      name: 'Scandi calm',
      description: 'Pale oak, soft sage and bouclé texture.',
      selections: {
        'feature-wall': { productId: 'silk-emulsion', variantId: 'silk-emulsion-v2' },
        floor: { productId: 'oak-plank', variantId: 'oak-plank-v3' },
        rug: { productId: 'berber-rug', variantId: 'berber-rug-v1' },
        sofa: { productId: 'boucle', variantId: 'boucle-v1' },
        armchair: { productId: 'belgian-linen', variantId: 'belgian-linen-v1' },
        curtains: { productId: 'linen-sheer', variantId: 'linen-sheer-v1' },
      },
    },
    {
      id: 'moody-luxe',
      name: 'Moody luxe',
      description: 'Ink walls, emerald velvet and walnut parquet.',
      selections: {
        'feature-wall': { productId: 'velvet-matt', variantId: 'velvet-matt-v4' },
        'window-wall': { productId: 'velvet-matt', variantId: 'velvet-matt-v4' },
        'side-wall': { productId: 'velvet-matt', variantId: 'velvet-matt-v4' },
        floor: { productId: 'herringbone', variantId: 'herringbone-v2' },
        sofa: { productId: 'velvet', variantId: 'velvet-v1' },
        armchair: { productId: 'velvet', variantId: 'velvet-v2' },
        cushions: { productId: 'velvet', variantId: 'velvet-v4' },
        rug: { productId: 'medallion-rug', variantId: 'medallion-rug-v2' },
        curtains: { productId: 'blackout-velvet', variantId: 'blackout-velvet-v2' },
      },
    },
    {
      id: 'desert-modern',
      name: 'Desert modern',
      description: 'Terracotta, cane-texture wallpaper and jute.',
      selections: {
        'feature-wall': { productId: 'arches', variantId: 'arches-v1' },
        sofa: { productId: 'belgian-linen', variantId: 'belgian-linen-v1' },
        armchair: { productId: 'leather', variantId: 'leather-v1' },
        cushions: { productId: 'belgian-linen', variantId: 'belgian-linen-v3' },
        rug: { productId: 'jute-rug', variantId: 'jute-rug-v1' },
        floor: { productId: 'terrazzo', variantId: 'terrazzo-v1' },
      },
    },
  ],
}

export default def
