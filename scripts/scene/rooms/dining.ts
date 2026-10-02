import { backdrop, baseboard, downlight, openingLight, plant, wall, windowFrame, type Opening, type WallSpec } from '../kit.ts'
import { artwork, emissive, fabric, floorTiles, leaves, marble, plaster, rugPattern, skyView, solid, speckle, subwayTiles, wood } from '../materials.ts'
import { hex, mul, norm } from '../math.ts'
import { frame, type SceneBuilder, type SceneDef } from '../scene.ts'

const W = 6.0, D = 5.8, H = 2.8
const X0 = -W / 2, X1 = W / 2, Z0 = -D

function build(b: SceneBuilder) {
  b.ambient = [0.15, 0.145, 0.14]
  b.sun = { dir: norm([0.82, 0.48, -0.3]), angularRadius: 0.012, irradiance: [2.5, 2.25, 1.85] }

  const m = {
    wallM: b.material({ albedo: plaster('#d7d1c6') }),
    sideWall: b.material({ albedo: plaster('#e6e2db') }),
    ceiling: b.material({ albedo: plaster('#efede9', 0.02) }),
    floor: b.material({ albedo: floorTiles() }),
    trim: b.material({ albedo: solid('#f1efea') }),
    sky: b.material({ albedo: [0, 0, 0], emissive: skyView(1.3), castsShadow: false }),
    cabinet: b.material({ albedo: plaster('#e9e5dd', 0.015) }),
    upper: b.material({ albedo: plaster('#e9e5dd', 0.015) }),
    carcass: b.material({ albedo: solid('#d8d3ca') }),
    counter: b.material({ albedo: marble('#efeeea', '#a8a7a2') }),
    splash: b.material({ albedo: subwayTiles() }),
    oven: b.material({ albedo: solid('#151517') }),
    steel: b.material({ albedo: solid('#8d8f91') }),
    brass: b.material({ albedo: solid('#a07a3c') }),
    oak: b.material({ albedo: wood('#a57c53', '#7c5a3a', 0) }),
    oakZ: b.material({ albedo: wood('#a57c53', '#7c5a3a', 2) }),
    seat: b.material({ albedo: fabric('#6e6a62') }),
    curtain: b.material({ albedo: fabric('#e9e4da', 0.05) }),
    rug: b.material({ albedo: rugPattern('#d4cab9', '#55606a', '#8f9aa0') }),
    rugEdge: b.material({ albedo: solid('#b9b0a0') }),
    globe: b.material({ albedo: [0, 0, 0], emissive: emissive('#ffe2b8', 2.2), castsShadow: false }),
    bulb: b.material({ albedo: [0, 0, 0], emissive: emissive('#fff4e0', 4), castsShadow: false }),
    black: b.material({ albedo: solid('#1d1d1f') }),
    ceramic: b.material({ albedo: speckle('#e6e1d8', 0.1) }),
    leaves: b.material({ albedo: leaves('#3f6436', '#6f9550') }),
    art: b.material({ albedo: artwork(-3.1, 1.25, 1.0, 1.2, ['#ece6da', '#2f4a5a', '#c56b3f', '#e3b34a', '#7f9a83'], 2, true) }),
    frame: b.material({ albedo: solid('#c9a46a') }),
  }

  const s = {
    back: b.surface({ id: 'kitchen-wall', label: 'Kitchen wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    left: b.surface({ id: 'art-wall', label: 'Art wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    right: b.surface({ id: 'window-wall', label: 'Window wall', accepts: ['paint', 'wallpaper'], group: 'walls' }),
    ceiling: b.surface({ id: 'ceiling', label: 'Ceiling', accepts: ['paint'] }),
    floor: b.surface({ id: 'floor', label: 'Floor', accepts: ['flooring'] }),
    splash: b.surface({ id: 'backsplash', label: 'Backsplash', accepts: ['wall-tile'] }),
    base: b.surface({ id: 'base-cabinets', label: 'Base cabinets', accepts: ['laminate'], group: 'cabinets' }),
    upper: b.surface({ id: 'wall-cabinets', label: 'Wall cabinets', accepts: ['laminate'], group: 'cabinets' }),
    seats: b.surface({ id: 'chair-seats', label: 'Chair seats', accepts: ['upholstery'] }),
    rug: b.surface({ id: 'rug', label: 'Rug', accepts: ['rug'] }),
    curtains: b.surface({ id: 'curtains', label: 'Curtains', accepts: ['curtain'] }),
  }

  // ---- Shell
  const win: Opening = { u0: 1.3, u1: 3.6, y0: 0.85, y1: 2.45 }
  const backW: WallSpec = { origin: [X0, 0, Z0], right: [1, 0, 0], width: W, height: H, mat: m.wallM, surface: s.back }
  const leftW: WallSpec = { origin: [X0, 0, 0], right: [0, 0, -1], width: D, height: H, mat: m.sideWall, surface: s.left }
  const rightW: WallSpec = {
    origin: [X1, 0, Z0], right: [0, 0, 1], width: D, height: H, mat: m.sideWall, surface: s.right,
    openings: [win], revealDepth: 0.22, revealMat: m.trim,
  }
  wall(b, backW)
  wall(b, leftW)
  wall(b, rightW)
  windowFrame(b, rightW, win, 0.16, m.trim, { v: 2, h: 0 })
  backdrop(b, rightW, 6, m.sky)
  openingLight(b, rightW, win, 0.2, [2.4, 2.7, 3.2])
  b.quad([X0, 0, Z0], [X1, 0, Z0], [X1, 0, 0], [X0, 0, 0], m.floor, { surface: s.floor })
  b.quad([X0, H, 0], [X1, H, 0], [X1, H, Z0], [X0, H, Z0], m.ceiling, { surface: s.ceiling })
  for (const [x, z] of [[-1.8, -4.9], [-0.6, -4.9], [1.6, -1.5]]) downlight(b, [x, H, z], m.bulb, m.trim)
  baseboard(b, leftW, 0, D, m.trim)
  baseboard(b, rightW, 0, D, m.trim)
  baseboard(b, backW, 3.75, W, m.trim)

  // ---- Kitchen run along the back wall: x from X0 to kx1
  const kx1 = 0.75
  const runW = kx1 - X0
  const baseH = 0.88, baseD = 0.6
  b.box(frame([(X0 + kx1) / 2, 0, Z0 + baseD / 2 - 0.01]), [runW, 0.1, baseD - 0.06], m.carcass, { faces: 'f' })
  b.box(frame([(X0 + kx1) / 2, 0.1, Z0 + baseD / 2]), [runW, baseH - 0.1, baseD], m.carcass, { faces: 'r' })
  const doorW = runW / 6
  for (let i = 0; i < 6; i++) {
    const xc = X0 + doorW * (i + 0.5)
    const isOven = i === 3
    if (isOven) {
      b.box(frame([xc, 0.1, Z0 + baseD + 0.01]), [doorW - 0.006, baseH - 0.14, 0.02], m.oven, { faces: 'flrt' })
      b.box(frame([xc, baseH - 0.17, Z0 + baseD + 0.04]), [doorW - 0.12, 0.018, 0.02], m.steel)
      continue
    }
    // Drawer + door
    b.box(frame([xc, baseH - 0.2, Z0 + baseD + 0.01]), [doorW - 0.006, 0.16, 0.02], m.cabinet, { surface: s.base, faces: 'flrt' })
    b.box(frame([xc, 0.1, Z0 + baseD + 0.01]), [doorW - 0.006, baseH - 0.31, 0.02], m.cabinet, { surface: s.base, faces: 'flrt' })
    b.box(frame([xc, baseH - 0.13, Z0 + baseD + 0.035]), [0.16, 0.012, 0.015], m.brass)
    b.box(frame([xc + (i % 2 ? -1 : 1) * (doorW / 2 - 0.05), 0.42, Z0 + baseD + 0.035]), [0.012, 0.16, 0.015], m.brass)
  }
  // Counter
  b.box(frame([(X0 + kx1) / 2 + 0.01, baseH - 0.04, Z0 + baseD / 2 + 0.02]), [runW + 0.02, 0.04, baseD + 0.04], m.counter, { faces: 'frt' })
  // Backsplash band (own surface) between counter and wall cabinets
  const splashTop = 1.5
  b.quad([X0, splashTop, Z0 + 0.004], [kx1, splashTop, Z0 + 0.004], [kx1, baseH, Z0 + 0.004], [X0, baseH, Z0 + 0.004], m.splash, { surface: s.splash })
  // Wall cabinets
  const upD = 0.35, upY = splashTop + 0.02, upH = 0.78
  b.box(frame([(X0 + kx1) / 2, upY, Z0 + upD / 2]), [runW, upH, upD], m.carcass, { faces: 'rd' })
  for (let i = 0; i < 6; i++) {
    const xc = X0 + doorW * (i + 0.5)
    b.box(frame([xc, upY, Z0 + upD + 0.01]), [doorW - 0.006, upH, 0.02], m.upper, { surface: s.upper, faces: 'flrd' })
    b.box(frame([xc + (i % 2 ? -1 : 1) * (doorW / 2 - 0.05), upY + 0.04, Z0 + upD + 0.035]), [0.012, 0.16, 0.015], m.brass)
  }
  // Counter decor
  b.cylinder(frame([X0 + 0.5, baseH, Z0 + 0.25]), 0.09, 0.1, 0.16, m.ceramic, { segments: 28 })
  b.box(frame([-0.9, baseH, Z0 + 0.18], 8), [0.4, 0.32, 0.025], m.oak)
  plant(b, [kx1 - 0.35, baseH + 0.22, Z0 + 0.3], m.leaves, m.oak, 26, 0.35, 5)
  b.cylinder(frame([kx1 - 0.35, baseH, Z0 + 0.3]), 0.09, 0.11, 0.22, m.ceramic, { segments: 28 })

  // ---- Art on the left wall
  b.box(frame([X0 + 0.012, 1.22, -2.6], 90), [1.06, 1.26, 0.024], m.frame)
  b.quad([X0 + 0.026, 2.45, -2.1], [X0 + 0.026, 2.45, -3.1], [X0 + 0.026, 1.25, -3.1], [X0 + 0.026, 1.25, -2.1], m.art)

  // ---- Rug + dining table
  const tx = 0.3, tz = -2.75
  b.quad([tx - 1.5, 0.012, tz - 1.15], [tx + 1.5, 0.012, tz - 1.15], [tx + 1.5, 0.012, tz + 1.15], [tx - 1.5, 0.012, tz + 1.15], m.rug, { surface: s.rug })
  b.box(frame([tx, 0, tz]), [3.0, 0.012, 2.3], m.rugEdge, { faces: 'flrb' })
  b.box(frame([tx, 0.72, tz]), [2.0, 0.045, 0.95], m.oak)
  for (const dx of [-0.9, 0.9]) for (const dz of [-0.38, 0.38]) b.box(frame([tx + dx, 0.012, tz + dz]), [0.06, 0.708, 0.06], m.oakZ)
  b.box(frame([tx, 0.62, tz]), [1.75, 0.09, 0.03], m.oak, { faces: 'fb' })
  // Table decor
  b.cylinder(frame([tx - 0.1, 0.765, tz]), 0.08, 0.06, 0.22, m.ceramic, { segments: 28 })
  plant(b, [tx - 0.1, 0.96, tz], m.leaves, m.oak, 18, 0.22, 9)
  b.cylinder(frame([tx + 0.45, 0.765, tz + 0.1]), 0.15, 0.17, 0.05, m.ceramic, { segments: 32 })

  // ---- Chairs: two per long side, one at each end
  const chairs: [number, number, number][] = [
    [tx - 0.5, tz - 0.72, 0], [tx + 0.5, tz - 0.72, 0],
    [tx - 0.5, tz + 0.72, 180], [tx + 0.5, tz + 0.72, 180],
    [tx - 1.25, tz, 90], [tx + 1.25, tz, -90],
  ]
  for (const [cx, cz, yaw] of chairs) {
    const f0 = frame([0, 0, 0], yaw)
    const at = (lx: number, ly: number, lz: number) => {
      const o = f0.dir([lx, 0, lz])
      return [cx + o[0], ly, cz + o[2]] as [number, number, number]
    }
    for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) b.box(frame(at(lx, 0, lz), yaw), [0.035, 0.43, 0.035], m.oak)
    b.box(frame(at(0, 0.41, 0), yaw), [0.46, 0.03, 0.46], m.oak)
    b.box(frame(at(0, 0.44, 0.01), yaw), [0.44, 0.06, 0.42], m.seat, { surface: s.seats, bulge: 0.02, round: 0.015, faces: 'flrtb', res: 8 })
    for (const lx of [-0.2, 0.2]) b.box(frame(at(lx, 0.44, -0.205), yaw, -6), [0.035, 0.46, 0.035], m.oak)
    b.box(frame(at(0, 0.6, -0.235), yaw, -6), [0.42, 0.26, 0.05], m.seat, { surface: s.seats, bulge: 0.015, round: 0.012, faces: 'fblrt', res: 8 })
  }

  // ---- Pendants over the table
  for (const dx of [-0.6, 0, 0.6]) {
    const px = tx + dx
    b.cylinder(frame([px, 1.72, tz]), 0.004, 0.004, H - 1.72, m.black, { segments: 6, caps: false })
    b.sphere(frame([px, 1.62, tz]), 0.12, m.globe, { res: 16 })
    b.pointLights.push({ pos: [px, 1.6, tz], radius: 0.06, intensity: mul(hex('#ffd7a3'), 0.7) })
  }

  // ---- Curtains on the window wall (faces -x, panels run toward +z)
  b.box(frame([X1 - 0.12, H - 0.15, Z0 + (win.u0 + win.u1) / 2]), [0.03, 0.03, win.u1 - win.u0 + 1.2], m.brass, { faces: 'flrtd' })
  const panel = (zStart: number) =>
    b.curtain(frame([X1 - 0.12, H - 0.17, zStart], -90), 0.7, H - 0.19, 5, 0.045, m.curtain, { surface: s.curtains })
  panel(Z0 + win.u0 - 0.5)
  panel(Z0 + win.u1 - 0.2)

  // ---- Tall plant front-left
  b.cylinder(frame([X0 + 0.45, 0, -0.8]), 0.2, 0.24, 0.5, m.black, { segments: 36 })
  plant(b, [X0 + 0.45, 0.5, -0.8], m.leaves, m.oak, 70, 1.3, 21)
}

const def: SceneDef = {
  id: 'dining',
  name: 'Kitchen & dining',
  camera: { pos: [0.75, 1.48, 1.0], target: [-0.35, 1.0, -5.8], fovY: 52, width: 1600, height: 1000 },
  exposure: 1.35,
  build,
  presets: [
    {
      id: 'sage-kitchen',
      name: 'Sage kitchen',
      description: 'Sage fronts, zellige splash and terrazzo.',
      selections: {
        'base-cabinets': { productId: 'matte-laminate', variantId: 'matte-laminate-v2' },
        'wall-cabinets': { productId: 'matte-laminate', variantId: 'matte-laminate-v1' },
        backsplash: { productId: 'zellige', variantId: 'zellige-v1' },
        floor: { productId: 'terrazzo', variantId: 'terrazzo-v1' },
        'chair-seats': { productId: 'belgian-linen', variantId: 'belgian-linen-v1' },
      },
    },
    {
      id: 'walnut-bistro',
      name: 'Walnut bistro',
      description: 'Walnut, navy and herringbone floors.',
      selections: {
        'base-cabinets': { productId: 'walnut-veneer', variantId: 'walnut-veneer-v1' },
        'wall-cabinets': { productId: 'matte-laminate', variantId: 'matte-laminate-v4' },
        backsplash: { productId: 'subway', variantId: 'subway-v2' },
        floor: { productId: 'herringbone', variantId: 'herringbone-v1' },
        'kitchen-wall': { productId: 'silk-emulsion', variantId: 'silk-emulsion-v4' },
        'chair-seats': { productId: 'leather', variantId: 'leather-v1' },
      },
    },
  ],
}

export default def
