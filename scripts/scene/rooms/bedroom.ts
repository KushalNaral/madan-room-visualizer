import { backdrop, baseboard, downlight, openingLight, plant, wall, windowFrame, type Opening, type WallSpec } from '../kit.ts'
import { artwork, emissive, fabric, leaves, oakPlanks, plaster, rugPattern, skyView, solid, speckle, wood } from '../materials.ts'
import { hex, mul, norm, type Vec3 } from '../math.ts'
import { frame, type SceneBuilder, type SceneDef } from '../scene.ts'

const W = 4.8, D = 5.6, H = 2.8
const X0 = -W / 2, X1 = W / 2, Z0 = -D

function build(b: SceneBuilder) {
  b.ambient = [0.15, 0.145, 0.14]
  b.sun = { dir: norm([0.8, 0.45, -0.4]), angularRadius: 0.012, irradiance: [2.4, 2.15, 1.8] }

  const m = {
    backWall: b.material({ albedo: plaster('#b9b2a6') }),
    sideWall: b.material({ albedo: plaster('#e4e0d9') }),
    ceiling: b.material({ albedo: plaster('#efede9', 0.02) }),
    floor: b.material({ albedo: oakPlanks('#9c7752', '#7c5a3b', 0.16, 1.4) }),
    trim: b.material({ albedo: solid('#f1efea') }),
    sky: b.material({ albedo: [0, 0, 0], emissive: skyView(1.4), castsShadow: false }),
    headboard: b.material({ albedo: fabric('#8b8f86') }),
    bedFrame: b.material({ albedo: fabric('#8b8f86') }),
    linen: b.material({ albedo: fabric('#f2efe9', 0.05) }),
    duvet: b.material({ albedo: fabric('#e8e3da', 0.05) }),
    throw: b.material({ albedo: fabric('#b0643f', 0.1) }),
    cushionA: b.material({ albedo: fabric('#d2b48c') }),
    cushionB: b.material({ albedo: fabric('#5f6f5c') }),
    bench: b.material({ albedo: fabric('#c9b9a0') }),
    curtain: b.material({ albedo: fabric('#ece7de', 0.05) }),
    rug: b.material({ albedo: rugPattern('#cfc6b6', '#8d7d68', '#ad9c84') }),
    rugEdge: b.material({ albedo: solid('#b5aa98') }),
    walnut: b.material({ albedo: wood('#5d4330', '#3f2c1f', 0) }),
    wardrobe: b.material({ albedo: plaster('#d8d2c8', 0.02) }),
    brass: b.material({ albedo: solid('#a07a3c') }),
    shade: b.material({ albedo: [0, 0, 0], emissive: emissive('#ffd9a8', 1.3), castsShadow: false }),
    bulb: b.material({ albedo: [0, 0, 0], emissive: emissive('#fff4e0', 4), castsShadow: false }),
    ceramic: b.material({ albedo: speckle('#d9d3c7', 0.12) }),
    leaves: b.material({ albedo: leaves('#4b6b3a', '#7a9455') }),
    art1: b.material({ albedo: artwork(-0.42, 1.55, 0.5, 0.62, ['#efe9de', '#9fae95', '#c88a5c', '#2f3e46', '#e2c799']) }),
    art2: b.material({ albedo: artwork(0.52, 1.55, 0.5, 0.62, ['#efe9de', '#c88a5c', '#2f3e46', '#9fae95', '#e2c799']) }),
    frame: b.material({ albedo: solid('#2a241f') }),
  }

  const s = {
    back: b.surface({ id: 'feature-wall', label: 'Headboard wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    left: b.surface({ id: 'left-wall', label: 'Wardrobe wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    right: b.surface({ id: 'window-wall', label: 'Window wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    ceiling: b.surface({ id: 'ceiling', label: 'Ceiling', accepts: ['paint'] }),
    floor: b.surface({ id: 'floor', label: 'Floor', accepts: ['flooring'] }),
    rug: b.surface({ id: 'rug', label: 'Rug', accepts: ['rug'] }),
    headboard: b.surface({ id: 'headboard', label: 'Headboard', accepts: ['upholstery'], group: 'bed' }),
    bedFrame: b.surface({ id: 'bed-base', label: 'Bed base', accepts: ['upholstery'], group: 'bed' }),
    duvet: b.surface({ id: 'duvet', label: 'Duvet cover', accepts: ['bedding'] }),
    throw: b.surface({ id: 'throw', label: 'Throw', accepts: ['bedding', 'upholstery'] }),
    cushions: b.surface({ id: 'cushions', label: 'Cushions', accepts: ['upholstery'] }),
    bench: b.surface({ id: 'bench', label: 'Bench', accepts: ['upholstery'] }),
    wardrobe: b.surface({ id: 'wardrobe', label: 'Wardrobe fronts', accepts: ['laminate'] }),
    curtains: b.surface({ id: 'curtains', label: 'Curtains', accepts: ['curtain'] }),
  }

  // ---- Shell
  const win: Opening = { u0: 1.7, u1: 3.4, y0: 0.75, y1: 2.4 }
  const backW: WallSpec = { origin: [X0, 0, Z0], right: [1, 0, 0], width: W, height: H, mat: m.backWall, surface: s.back }
  const leftW: WallSpec = { origin: [X0, 0, 0], right: [0, 0, -1], width: D, height: H, mat: m.sideWall, surface: s.left }
  const rightW: WallSpec = {
    origin: [X1, 0, Z0], right: [0, 0, 1], width: D, height: H, mat: m.sideWall, surface: s.right,
    openings: [win], revealDepth: 0.22, revealMat: m.trim,
  }
  wall(b, backW)
  wall(b, leftW)
  wall(b, rightW)
  windowFrame(b, rightW, win, 0.16, m.trim, { v: 1, h: 0 })
  backdrop(b, rightW, 6, m.sky)
  openingLight(b, rightW, win, 0.2, [2.3, 2.6, 3.1])
  b.quad([X0, 0, Z0], [X1, 0, Z0], [X1, 0, 0], [X0, 0, 0], m.floor, { surface: s.floor })
  b.quad([X0, H, 0], [X1, H, 0], [X1, H, Z0], [X0, H, Z0], m.ceiling, { surface: s.ceiling })
  for (const [x, z] of [[-0.9, -1.8], [1.1, -1.8], [-0.9, -4], [1.1, -4]]) downlight(b, [x, H, z], m.bulb, m.trim)
  baseboard(b, backW, 0, W, m.trim)
  baseboard(b, rightW, 0, D, m.trim)
  baseboard(b, leftW, 0, D, m.trim)

  // ---- Bed (headboard against the back wall, centred at bx)
  const bx = 0.25
  const channels = 7, hbW = 1.95, hbH = 1.3
  for (let i = 0; i < channels; i++) {
    const cw = hbW / channels
    b.box(frame([bx - hbW / 2 + cw * (i + 0.5), 0.06, Z0 + 0.07]), [cw, hbH, 0.1], m.headboard, {
      surface: s.headboard, bulge: 0.028, round: 0.012, faces: 'ft', res: 10,
    })
  }
  b.box(frame([bx, 0.06, Z0 + 0.07]), [hbW, hbH, 0.1], m.headboard, { surface: s.headboard, faces: 'lr' })
  const bedZ = Z0 + 0.12 + 1.07
  b.box(frame([bx, 0.08, bedZ]), [1.86, 0.3, 2.14], m.bedFrame, { surface: s.bedFrame, faces: 'flrt', round: 0.01, res: 10 })
  for (const dx of [-0.88, 0.88]) for (const dz of [-1, 1]) b.cylinder(frame([bx + dx, 0, bedZ + dz]), 0.025, 0.02, 0.08, m.walnut, { segments: 10 })
  b.box(frame([bx, 0.38, bedZ]), [1.76, 0.2, 2.04], m.linen, { bulge: 0.01, round: 0.02, faces: 'flrt', res: 8 })
  // Duvet: top + hanging sides
  const dz0 = bedZ - 0.55, dLen = 1.6, dTop = 0.6
  b.box(frame([bx, dTop, dz0 + dLen / 2 - 0.02]), [1.98, 0.06, dLen], m.duvet, { surface: s.duvet, bulge: 0.04, round: 0.015, faces: 't', res: 14 })
  b.curtain(frame([bx - 0.99, dTop + 0.03, dz0 + dLen], 0), 1.98, 0.33, 4, 0.012, m.duvet, { surface: s.duvet })
  b.curtain(frame([bx - 0.99, dTop + 0.03, dz0], -90), dLen, 0.33, 3, 0.012, m.duvet, { surface: s.duvet })
  b.curtain(frame([bx + 0.99, dTop + 0.03, dz0 + dLen], 90), dLen, 0.33, 3, 0.012, m.duvet, { surface: s.duvet })
  // Throw across the foot
  b.box(frame([bx, dTop + 0.06, dz0 + dLen - 0.28]), [2.0, 0.04, 0.42], m.throw, { surface: s.throw, bulge: 0.02, faces: 'tf', res: 12 })
  // Pillows + cushions
  for (const dx of [-0.45, 0.45]) {
    b.box(frame([bx + dx, 0.6, Z0 + 0.35], 0, -55), [0.72, 0.48, 0.16], m.linen, { bulge: 0.07, round: 0.04, res: 10 })
  }
  b.box(frame([bx - 0.3, 0.64, Z0 + 0.55], 6, -35), [0.48, 0.44, 0.14], m.cushionA, { surface: s.cushions, bulge: 0.06, round: 0.04, res: 10 })
  b.box(frame([bx + 0.3, 0.64, Z0 + 0.55], -6, -35), [0.48, 0.44, 0.14], m.cushionB, { surface: s.cushions, bulge: 0.06, round: 0.04, res: 10 })
  b.box(frame([bx, 0.66, Z0 + 0.72], 0, -25), [0.45, 0.3, 0.12], m.cushionA, { surface: s.cushions, bulge: 0.05, round: 0.03, res: 10 })

  // ---- Nightstands + lamps
  for (const side of [-1, 1]) {
    const nx = bx + side * 1.32
    b.box(frame([nx, 0.12, Z0 + 0.3]), [0.5, 0.42, 0.42], m.walnut)
    for (const dx of [-0.21, 0.21]) for (const dz of [-0.17, 0.17]) b.cylinder(frame([nx + dx, 0, Z0 + 0.3 + dz]), 0.015, 0.012, 0.12, m.walnut, { segments: 8 })
    b.box(frame([nx, 0.2, Z0 + 0.515]), [0.4, 0.004, 0.01], m.brass)
    b.cylinder(frame([nx - 0.05, 0.54, Z0 + 0.28]), 0.06, 0.07, 0.24, m.ceramic, { segments: 28 })
    b.cylinder(frame([nx - 0.05, 0.78, Z0 + 0.28]), 0.15, 0.11, 0.2, m.shade, { segments: 32 })
    b.pointLights.push({ pos: [nx - 0.05, 0.86, Z0 + 0.28], radius: 0.05, intensity: mul(hex('#ffcf96'), 0.75) })
  }

  // ---- Art above the bed
  b.box(frame([bx - 0.42 + 0.25 - 0.25, 1.53, Z0 + 0.012]), [0.54, 0.66, 0.024], m.frame)
  b.quad([-0.42, 2.17, Z0 + 0.026], [0.08, 2.17, Z0 + 0.026], [0.08, 1.55, Z0 + 0.026], [-0.42, 1.55, Z0 + 0.026], m.art1)
  b.box(frame([0.77, 1.53, Z0 + 0.012]), [0.54, 0.66, 0.024], m.frame)
  b.quad([0.52, 2.17, Z0 + 0.026], [1.02, 2.17, Z0 + 0.026], [1.02, 1.55, Z0 + 0.026], [0.52, 1.55, Z0 + 0.026], m.art2)

  // ---- Rug
  const rx0 = bx - 1.45, rx1 = bx + 1.45, rz0 = Z0 + 1.5, rz1 = Z0 + 4.1, ry = 0.012
  b.quad([rx0, ry, rz0], [rx1, ry, rz0], [rx1, ry, rz1], [rx0, ry, rz1], m.rug, { surface: s.rug })
  b.box(frame([bx, 0, (rz0 + rz1) / 2]), [rx1 - rx0, ry, rz1 - rz0], m.rugEdge, { faces: 'flrb' })

  // ---- Bench at the foot
  const benchZ = bedZ + 1.07 + 0.38
  b.box(frame([bx, 0.3, benchZ]), [1.35, 0.14, 0.42], m.bench, { surface: s.bench, bulge: 0.03, round: 0.025, faces: 'flrtb', res: 12 })
  b.box(frame([bx, 0.27, benchZ]), [1.3, 0.03, 0.38], m.walnut)
  for (const dx of [-0.6, 0.6]) for (const dz of [-0.15, 0.15]) b.cylinder(frame([bx + dx, 0, benchZ + dz]), 0.02, 0.016, 0.27, m.walnut, { segments: 10 })

  // ---- Wardrobe along the left wall (doors face +x)
  const wz0 = -4.9, wz1 = -2.3, wDepth = 0.6, wH = 2.4
  b.box(frame([X0 + wDepth / 2, 0.06, (wz0 + wz1) / 2], 90), [wz1 - wz0, wH - 0.06, wDepth], m.walnut, { faces: 'lrt' })
  b.box(frame([X0 + wDepth / 2 - 0.01, 0, (wz0 + wz1) / 2], 90), [wz1 - wz0 - 0.02, 0.06, wDepth - 0.04], m.trim, { faces: 'f' })
  const doors = 4
  const dw = (wz1 - wz0 - 0.02) / doors
  for (let i = 0; i < doors; i++) {
    const zc = wz1 - 0.01 - dw * (i + 0.5)
    b.box(frame([X0 + wDepth + 0.01, 0.07, zc], 90), [dw - 0.006, wH - 0.08, 0.02], m.wardrobe, { surface: s.wardrobe, faces: 'flrt' })
    const handleZ = i % 2 === 0 ? zc - dw / 2 + 0.06 : zc + dw / 2 - 0.06
    b.box(frame([X0 + wDepth + 0.035, 0.95, handleZ], 90), [0.012, 0.42, 0.02], m.brass)
  }

  // ---- Curtains (window wall faces -x, panels run toward +z)
  b.box(frame([X1 - 0.12, H - 0.15, -1.25 - 2.55 / 2 - 0.6]), [0.03, 0.03, 2.7], m.brass, { faces: 'flrtd' })
  const panel = (zStart: number, width: number) =>
    b.curtain(frame([X1 - 0.12, H - 0.17, zStart], -90), width, H - 0.19, 5, 0.045, m.curtain, { surface: s.curtains })
  panel(Z0 + win.u0 - 0.5, 0.68)
  panel(Z0 + win.u1 - 0.18, 0.68)

  // ---- Plant in the front-right corner
  b.cylinder(frame([X1 - 0.4, 0, -0.9]), 0.18, 0.2, 0.42, m.ceramic, { segments: 36 })
  plant(b, [X1 - 0.4, 0.42, -0.9], m.leaves, m.walnut, 60, 1.1, 11)
}

const def: SceneDef = {
  id: 'bedroom',
  name: 'Bedroom',
  camera: { pos: [-0.75, 1.38, 0.95], target: [0.55, 0.95, -5.6], fovY: 52, width: 1600, height: 1000 },
  exposure: 1.4,
  build,
  presets: [
    {
      id: 'soft-neutrals',
      name: 'Soft neutrals',
      description: 'Layered linen, bouclé and pale oak.',
      selections: {
        'feature-wall': { productId: 'grasscloth', variantId: 'grasscloth-v1' },
        headboard: { productId: 'boucle', variantId: 'boucle-v1' },
        'bed-base': { productId: 'boucle', variantId: 'boucle-v1' },
        duvet: { productId: 'washed-linen', variantId: 'washed-linen-v1' },
        throw: { productId: 'belgian-linen', variantId: 'belgian-linen-v1' },
        floor: { productId: 'oak-plank', variantId: 'oak-plank-v3' },
        rug: { productId: 'berber-rug', variantId: 'berber-rug-v1' },
      },
    },
    {
      id: 'hotel-noir',
      name: 'Hotel noir',
      description: 'Charcoal walls, navy velvet and smoked oak.',
      selections: {
        'feature-wall': { productId: 'velvet-matt', variantId: 'velvet-matt-v2' },
        headboard: { productId: 'velvet', variantId: 'velvet-v3' },
        'bed-base': { productId: 'velvet', variantId: 'velvet-v3' },
        duvet: { productId: 'percale-duvet', variantId: 'percale-duvet-v1' },
        throw: { productId: 'velvet', variantId: 'velvet-v2' },
        floor: { productId: 'oak-plank', variantId: 'oak-plank-v2' },
        wardrobe: { productId: 'walnut-veneer', variantId: 'walnut-veneer-v1' },
        curtains: { productId: 'blackout-velvet', variantId: 'blackout-velvet-v3' },
      },
    },
    {
      id: 'garden-retreat',
      name: 'Garden retreat',
      description: 'Botanical wallpaper with sage and blush.',
      selections: {
        'feature-wall': { productId: 'botanical', variantId: 'botanical-v1' },
        headboard: { productId: 'belgian-linen', variantId: 'belgian-linen-v4' },
        'bed-base': { productId: 'belgian-linen', variantId: 'belgian-linen-v4' },
        duvet: { productId: 'percale-duvet', variantId: 'percale-duvet-v3' },
        cushions: { productId: 'velvet', variantId: 'velvet-v4' },
        wardrobe: { productId: 'matte-laminate', variantId: 'matte-laminate-v2' },
      },
    },
  ],
}

export default def
