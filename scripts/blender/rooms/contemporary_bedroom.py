"""Contemporary bedroom: a wide gridded window with sheers and a rust drape on the left, a mauve
slat panel behind a button-tufted bed with warm LED edges, a tufted bench at the foot, a floral
lounge chair by the window and a herringbone floor (bright afternoon daylight)."""
import math

from core import frame
from shell import Wall, ceiling, downlight, floor, point_light, skirting, wall, window_frame, window_light, world_hdri
from soft import armchair, bed, bench, cushion, curtain, curtain_track, rug, tufted_headboard

W, D, H = 5.4, 5.2, 2.85
X0, X1 = -W / 2, W / 2

META = {
    'name': 'Contemporary bedroom',
    'roomType': 'bedroom',
    'camera': {'pos': (X1 - 0.55, 0.45, 1.3), 'target': (X0 + 1.9, D, 0.95), 'fov': 56},
    'presets': [
        {
            'id': 'clay-rose', 'name': 'Clay & rose',
            'description': 'Blush velvet drapes over white linen sheers, a clay linen duvet and a rose velvet bench.',
            'selections': {
                'drapes': {'productId': 'blackout-velvet', 'variantId': 'blackout-velvet-v4'},
                'sheers': {'productId': 'linen-sheer', 'variantId': 'linen-sheer-v1'},
                'bedding': {'productId': 'washed-linen', 'variantId': 'washed-linen-v2'},
                'bench': {'productId': 'velvet', 'variantId': 'velvet-v4'},
            },
        },
        {
            'id': 'fresh-white', 'name': 'Fresh white',
            'description': 'White percale bedding, a bouclé headboard and a soft grey herringbone floor.',
            'selections': {
                'bedding': {'productId': 'percale-duvet', 'variantId': 'percale-duvet-v1'},
                'headboard': {'productId': 'boucle', 'variantId': 'boucle-v1'},
                'floor': {'productId': 'herringbone', 'variantId': 'herringbone-v3'},
            },
        },
    ],
}


def build(r):
    m = {
        'wall': r.material('wall', color=(0.47, 0.42, 0.44), roughness=0.9, texture='plastered_wall_04', tile=2.0, detail=0.12, normal=0.12),
        'side-wall': r.material('side-wall', color=(0.8, 0.79, 0.77), roughness=0.9, texture='plastered_wall_04', tile=2.0, detail=0.12, normal=0.12),
        'slat': r.material('slat', color=(0.44, 0.39, 0.41), roughness=0.6),
        'slat-back': r.material('slat-back', color=(0.2, 0.18, 0.19), roughness=0.8),
        'ceiling': r.material('ceiling', color=(0.9, 0.89, 0.87), roughness=0.95),
        'floor': r.material('floor', color=(0.5, 0.33, 0.2), roughness=0.4, texture='herringbone_parquet', tile=2.0, keep_texture_color=True, normal=0.4),
        'trim': r.material('trim', color=(0.9, 0.9, 0.89), roughness=0.35),
        'sheesham': r.material('sheesham', color=(0.3, 0.12, 0.05), roughness=0.35, texture='teak_veneer', tile=1.0, detail=0.6, normal=0.2, coat=0.3),
        'headboard': r.material('headboard', color=(0.88, 0.8, 0.6), roughness=0.95, texture='rough_linen', tile=0.3, detail=0.3, normal=0.4, sheen=0.4),
        'duvet': r.material('duvet', color=(0.5, 0.36, 0.3), roughness=0.95, texture='waffle_pique_cotton', tile=0.3, detail=0.25, normal=0.4, sheen=0.4),
        'sheet': r.material('sheet', color=(0.92, 0.9, 0.86), roughness=0.9, texture='rough_linen', tile=0.3, detail=0.2, normal=0.3),
        'pillow': r.material('pillow', color=(0.52, 0.38, 0.33), roughness=0.95, texture='rough_linen', tile=0.3, detail=0.3, normal=0.4, sheen=0.4),
        'bench': r.material('bench', color=(0.42, 0.16, 0.18), roughness=0.7, texture='velour_velvet', tile=0.3, detail=0.3, normal=0.4, sheen=0.8),
        'chair': r.material('chair', color=(0.88, 0.84, 0.76), roughness=0.9, texture='floral_jacquard', tile=0.45, detail=0.5, normal=0.3, sheen=0.3),
        'chair-cushion': r.material('chair-cushion', color=(0.55, 0.2, 0.22), roughness=0.9, texture='velour_velvet', tile=0.3, detail=0.3, normal=0.4, sheen=0.6),
        'sheer': r.material('sheer', color=(0.95, 0.94, 0.92), roughness=0.9, texture='rough_linen', tile=0.25, detail=0.2, normal=0.2, translucent=0.5, alpha=0.62),
        'drape': r.material('drape', color=(0.55, 0.3, 0.2), roughness=0.8, texture='velour_velvet', tile=0.3, detail=0.3, normal=0.4, sheen=0.6, translucent=0.08),
        'rug': r.material('rug', color=(0.62, 0.62, 0.6), roughness=1.0, texture='knitted_fleece', tile=0.4, detail=0.4, normal=0.8),
        'track': r.material('track', color=(0.92, 0.92, 0.91), roughness=0.4),
        'brass': r.material('brass', color=(0.8, 0.62, 0.3), roughness=0.25, metallic=1.0),
        'lamp-base': r.material('lamp-base', color=(0.85, 0.65, 0.12), roughness=0.3, coat=0.6),
        'shade': r.material('shade', color=(0.96, 0.95, 0.9), roughness=0.6, translucent=0.6),
        'black': r.material('black', color=(0.03, 0.03, 0.03), roughness=0.4, metallic=0.5),
        'frame-wood': r.material('frame-wood', color=(0.35, 0.22, 0.12), roughness=0.4),
        'art': r.material('art', color=(0.9, 0.86, 0.8), roughness=0.8),
    }
    s = {
        'slat': r.surface('slat-wall', 'Slat panel', ['paint', 'laminate'], group='walls', kind='wall'),
        'back': r.surface('back-wall', 'Bed wall', ['paint', 'wallpaper'], group='walls', kind='wall'),
        'left': r.surface('window-wall', 'Window wall', ['paint', 'wallpaper'], group='walls', kind='wall'),
        'right': r.surface('right-wall', 'Right wall', ['paint', 'wallpaper'], group='walls', kind='wall'),
        'ceiling': r.surface('ceiling', 'Ceiling', ['paint'], kind='ceiling'),
        'floor': r.surface('floor', 'Floor', ['flooring'], kind='floor'),
        'rug': r.surface('rug', 'Rug', ['rug'], kind='rug'),
        'drapes': r.surface('drapes', 'Drapes', ['curtain'], group='window', kind='curtain'),
        'sheers': r.surface('sheers', 'Sheer curtains', ['curtain'], group='window', kind='curtain'),
        'headboard': r.surface('headboard', 'Headboard', ['upholstery'], group='bed', kind='bed'),
        'bedding': r.surface('bedding', 'Duvet', ['bedding'], group='bed', kind='bed'),
        'pillows': r.surface('pillows', 'Pillows', ['bedding', 'upholstery'], group='bed', kind='bed'),
        'bench': r.surface('bench', 'Bench', ['upholstery'], group='seating', kind='sofa'),
        'chair': r.surface('lounge-chair', 'Lounge chair', ['upholstery'], group='seating', kind='sofa'),
    }

    # ---- Shell: back (bed) wall at y = D, window wall on the left (x = X0), right wall
    win = (1.25, 4.55, 0.4, 2.42)
    back = Wall((X0, D, 0), (1, 0, 0), W, H)
    left = Wall((X0, 0, 0), (0, 1, 0), D, H, [win])
    right = Wall((X1, D, 0), (0, -1, 0), D, H)
    wall(r, back, m['wall'], s['back'])
    wall(r, left, m['side-wall'], s['left'], reveal_mat=m['trim'], reveal=0.22)
    wall(r, right, m['side-wall'], s['right'])
    floor(r, X0, X1, 0, D, m['floor'], s['floor'])
    ceiling(r, X0, X1, 0, D, H, m['ceiling'], s['ceiling'])
    for wl in (back, left, right):
        skirting(r, wl, m['trim'])
    window_frame(r, left, win, m['trim'], depth=0.18, bars=(3, 0), transoms=(0.95, 1.5, 2.0), sill_mat=m['trim'], name='win')
    window_light(r, left, win, strength=55, color=(1.0, 0.96, 0.9), name='sky')
    world_hdri('residential_garden', strength=1.8, rotation=110, camera_strength=1.5)

    # Ceiling soffit along the window wall with a spot track.
    r.box('soffit', frame((X0 + 0.45, D / 2, H - 0.22)), (0.9, D, 0.22), m['ceiling'])
    r.box('spot-track', frame((X0 + 0.95, D / 2 + 0.3, H - 0.03)), (0.05, D - 1.2, 0.03), m['black'])

    # ---- Slat panel behind the bed, warm LED strips at its edges
    bu, bw = 3.25, 3.0  # panel centre along the back wall, width
    u0, u1 = bu - bw / 2, bu + bw / 2
    r.quad('slat-back', back.at(u0, H, 0.004), back.at(u1, H, 0.004), back.at(u1, 0.09, 0.004), back.at(u0, 0.09, 0.004),
           m['slat-back'], s['slat'], patch=False)
    pitch, sw, sd = 0.045, 0.03, 0.03
    n = int(bw / pitch)
    for k in range(n):
        u = u0 + (k + 0.5) * bw / n
        r.box(f'slat{k}', frame(back.at(u, 0.09, 0.004 + sd / 2).tolist(), back.yaw), (sw, sd, H - 0.09), m['slat'], surface=s['slat'])
    r.quad_patch(s['slat'], back.at(u0, H, sd), back.at(u1, H, sd), back.at(u1, 0.09, sd), back.at(u0, 0.09, sd))
    for u in (u0 - 0.03, u1 + 0.03):
        r.box(f'led-cover{u:.1f}', frame(back.at(u, 0.09, 0.012).tolist(), back.yaw), (0.018, 0.02, H - 0.09),
              r.emission('led', (1.0, 0.8, 0.5), 14.0))

    # ---- Bed: sheesham box bed with a button-tufted headboard
    bed_w, bed_l = 1.86, 2.08
    bx = X0 + bu
    tufted_headboard(r, back, bu, bed_w + 0.12, 0.62, 0.62, sd + 0.02, m['headboard'], s['headboard'], cols_t=9, rows_t=3,
                     depth=0.07)
    r.box('headboard-frame', frame(back.at(bu, 0.0, sd + 0.05).tolist(), back.yaw), (bed_w + 0.22, 0.1, 0.64), m['sheesham'], bevel=0.01)
    by = D - sd - 0.1 - bed_l / 2
    bed(r, (bx, by, 0), 0, bed_w, bed_l, m['sheesham'], m['sheet'], m['duvet'], s['bedding'], m['pillow'], s['pillows'],
        base_h=0.34, mattress_h=0.2, duvet_cover=0.74, overhang=0.24, seed=5, pillows=2)
    # Drawer fronts on the storage base.
    for k, x in enumerate((-0.45, 0.45)):
        r.box(f'drawer{k}', frame((bx + x, by - bed_l / 2 - 0.035, 0.08)), (0.8, 0.012, 0.2), m['sheesham'], bevel=0.004)

    # ---- Bedside tables with yellow lamps and slatted side panels
    for k, side in enumerate((-1, 1)):
        nx = bx + side * (bed_w / 2 + 0.42)
        ny = D - 0.3
        r.box(f'nightstand{k}', frame((nx, ny, 0.05)), (0.5, 0.42, 0.5), m['sheesham'], bevel=0.008)
        r.box(f'nightstand-drawer{k}', frame((nx, ny - 0.215, 0.12)), (0.44, 0.012, 0.16), m['sheesham'], bevel=0.003)
        r.box(f'nightstand-drawer{k}b', frame((nx, ny - 0.215, 0.32)), (0.44, 0.012, 0.16), m['sheesham'], bevel=0.003)
        r.cylinder(f'lamp-body{k}', frame((nx, ny, 0.55)), 0.075, 0.06, 0.26, m['lamp-base'], segments=28)
        r.cylinder(f'lamp-shade{k}', frame((nx, ny, 0.8)), 0.15, 0.13, 0.22, m['shade'], segments=36, cap=False)
        point_light(r, (nx, ny, 0.9), 22, color=(1.0, 0.8, 0.55), radius=0.05, name=f'bedlamp{k}')
    r.place('alarm_clock_01', (bx + bed_w / 2 + 0.3, D - 0.42, 0.55), yaw=-20, height=0.12)

    # ---- Window: sheers across, a rust drape gathered at the corner end
    curtain_track(r, left, 0.6, D - 0.05, H - 0.24, 0.2, m['track'])
    curtain(r, left, 0.75, 3.3, H - 0.26, H - 0.28, 0.17, folds=22, depth=0.06, mat=m['sheer'], surface=s['sheers'], seed=21,
            name='sheer', sway=0.01)
    curtain(r, left, D - 0.95, 0.85, H - 0.26, H - 0.27, 0.24, folds=7, depth=0.09, mat=m['drape'], surface=s['drapes'], seed=7,
            name='drape')
    curtain(r, left, 0.25, 0.55, H - 0.26, H - 0.27, 0.24, folds=5, depth=0.09, mat=m['drape'], surface=s['drapes'], seed=8,
            name='drape-l')

    # ---- Tufted bench at the foot, lounge chair and round side table by the window
    bench(r, (bx - 0.05, by - bed_l / 2 - 0.55, 0), 0, m['bench'], s['bench'], m['sheesham'], length=1.4, depth=0.46, height=0.47)
    cx, cy = X0 + 1.15, 1.85
    armchair(r, (cx, cy, 0), 62, m['chair'], s['chair'], m['sheesham'], name='lounge', width=0.82, depth=0.84, back_h=0.92,
             leg_h=0.14)
    cushion(r, (cx + 0.04, cy + 0.06, 0.5), 62, m['chair-cushion'], s['chair'], size=0.4, thick=0.13, lean=-22, name='chair-cushion')
    tx, ty = X0 + 0.55, 1.05
    r.cylinder('side-top', frame((tx, ty, 0.56)), 0.26, 0.26, 0.035, m['sheesham'], segments=40)
    r.cylinder('side-stem', frame((tx, ty, 0.08)), 0.04, 0.06, 0.48, m['sheesham'], segments=20)
    r.cylinder('side-foot', frame((tx, ty, 0.0)), 0.22, 0.2, 0.08, m['sheesham'], segments=32)
    r.place('potted_plant_04', (tx - 0.06, ty + 0.06, 0.595), yaw=10, height=0.36)
    r.place('standing_picture_frame_01', (tx + 0.12, ty - 0.08, 0.595), yaw=-60, height=0.16)

    # ---- Trellis-look rug under the bench, plant in the corner, art over the right wall
    rug(r, (bx - 0.35, by - 0.7, 0), 0, 2.9, 2.3, m['rug'], s['rug'])
    r.place('pachira_aquatica_01', (X0 + 0.55, D - 0.55, 0), yaw=40, height=1.45)
    r.box('art-frame', frame(right.at(2.6, 1.25, 0.015).tolist(), right.yaw), (0.9, 0.03, 0.62), m['frame-wood'])
    r.box('art', frame(right.at(2.6, 1.29, 0.032).tolist(), right.yaw), (0.82, 0.004, 0.54), m['art'])

    for y in (1.4, 2.6, 3.8):
        downlight(r, (X0 + 0.95, y, H - 0.03), strength=18, spot=70)
    for x, y in ((0.3, 1.6), (0.3, 3.4)):
        downlight(r, (x, y, H), strength=22)
