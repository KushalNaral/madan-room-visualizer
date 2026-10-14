"""Sectional living: three tall windows with roller blinds and long sheers, a white L-sectional,
an arc floor lamp and dark plank floor (soft overcast daylight)."""
from core import frame
from shell import Wall, ceiling, downlight, floor, point_light, skirting, wall, window_frame, window_light, world_hdri
from soft import cushion, curtain, curtain_track, roller_blind, rug, sofa

W, D, H = 6.4, 6.2, 2.9
X0, X1 = -W / 2, W / 2

META = {
    'name': 'Sectional living',
    'roomType': 'living',
    'camera': {'pos': (0.35, 0.25, 1.22), 'target': (-0.05, 6.2, 1.05), 'fov': 50},
    'presets': [
        {
            'id': 'soft-grey', 'name': 'Soft grey',
            'description': 'Grey screen blinds, white linen sheers and a pale linen sectional.',
            'selections': {
                'blinds': {'productId': 'roller-screen', 'variantId': 'roller-screen-v2'},
                'sheers': {'productId': 'linen-sheer', 'variantId': 'linen-sheer-v1'},
                'sofa': {'productId': 'belgian-linen', 'variantId': 'belgian-linen-v1'},
            },
        },
        {
            'id': 'warm-oatmeal', 'name': 'Warm oatmeal',
            'description': 'Oatmeal blackout blinds, bouclé sectional and an oak floor.',
            'selections': {
                'blinds': {'productId': 'roller-blackout', 'variantId': 'roller-blackout-v1'},
                'sofa': {'productId': 'boucle', 'variantId': 'boucle-v1'},
                'floor': {'productId': 'oak-plank', 'variantId': 'oak-plank-v1'},
            },
        },
    ],
}


def build(r):
    m = {
        'wall': r.material('wall', color=(0.5, 0.5, 0.49), roughness=0.9, texture='plastered_wall_04', tile=2.0, detail=0.15, normal=0.15),
        'ceiling': r.material('ceiling', color=(0.85, 0.85, 0.84), roughness=0.95),
        'floor': r.material('floor', color=(0.27, 0.26, 0.255), roughness=0.35, texture='laminate_floor_02', tile=2.0, keep_texture_color=True, normal=0.4),
        'trim': r.material('trim', color=(0.86, 0.86, 0.85), roughness=0.35),
        'sofa': r.material('sofa', color=(0.8, 0.79, 0.76), roughness=0.95, texture='rough_linen', tile=0.35, detail=0.35, normal=0.5, sheen=0.4),
        'cushion': r.material('cushion', color=(0.72, 0.72, 0.7), roughness=0.95, texture='caban', tile=0.3, detail=0.3, normal=0.5, sheen=0.4),
        'cushion2': r.material('cushion2', color=(0.86, 0.86, 0.85), roughness=0.95, texture='rough_linen', tile=0.3, detail=0.3, normal=0.5, sheen=0.4),
        'sheer': r.material('sheer', color=(0.93, 0.93, 0.92), roughness=0.9, texture='rough_linen', tile=0.25, detail=0.2, normal=0.2, translucent=0.45, alpha=0.42),
        'blind': r.material('blind', color=(0.42, 0.42, 0.41), roughness=0.85, texture='hessian_230', tile=0.2, detail=0.3, normal=0.4, translucent=0.08),
        'blindcase': r.material('blindcase', color=(0.8, 0.8, 0.8), roughness=0.4),
        'rug': r.material('rug', color=(0.55, 0.54, 0.52), roughness=1.0, texture='knitted_fleece', tile=0.4, detail=0.4, normal=0.8),
        'black': r.material('black', color=(0.025, 0.025, 0.025), roughness=0.35, metallic=0.6),
        'shade': r.material('shade', color=(0.95, 0.95, 0.93), roughness=0.6, translucent=0.6),
        'chrome': r.material('chrome', color=(0.9, 0.9, 0.9), roughness=0.15, metallic=1.0),
        'track': r.material('track', color=(0.9, 0.9, 0.9), roughness=0.4),
        'paper': r.material('paper', color=(0.85, 0.84, 0.8), roughness=0.7),
        'book1': r.material('book1', color=(0.18, 0.22, 0.26), roughness=0.6),
        'book2': r.material('book2', color=(0.62, 0.6, 0.55), roughness=0.6),
        'book3': r.material('book3', color=(0.25, 0.24, 0.22), roughness=0.6),
    }
    s = {
        'back': r.surface('window-wall', 'Window wall', ['paint', 'wallpaper'], group='walls', kind='wall'),
        'left': r.surface('left-wall', 'Left wall', ['paint', 'wallpaper'], group='walls', kind='wall'),
        'right': r.surface('right-wall', 'Right wall', ['paint', 'wallpaper'], group='walls', kind='wall'),
        'ceiling': r.surface('ceiling', 'Ceiling', ['paint'], kind='ceiling'),
        'floor': r.surface('floor', 'Floor', ['flooring'], kind='floor'),
        'rug': r.surface('rug', 'Rug', ['rug'], kind='rug'),
        'blinds': r.surface('blinds', 'Roller blinds', ['blind'], group='window', kind='blind'),
        'sheers': r.surface('sheers', 'Sheer curtains', ['curtain'], group='window', kind='curtain'),
        'sofa': r.surface('sofa', 'Sectional sofa', ['upholstery'], group='seating', kind='sofa'),
        'cushions': r.surface('cushions', 'Cushions', ['upholstery'], kind='sofa'),
    }

    # ---- Shell
    wins = [(0.62, 1.92, 0.55, 2.48), (2.55, 3.85, 0.55, 2.48), (4.48, 5.78, 0.55, 2.48)]
    back = Wall((X0, D, 0), (1, 0, 0), W, H, wins)
    left = Wall((X0, 0, 0), (0, 1, 0), D, H)
    right = Wall((X1, D, 0), (0, -1, 0), D, H)
    wall(r, back, m['wall'], s['back'], reveal_mat=m['trim'], reveal=0.25)
    wall(r, left, m['wall'], s['left'])
    wall(r, right, m['wall'], s['right'])
    floor(r, X0, X1, 0, D, m['floor'], s['floor'])
    ceiling(r, X0, X1, 0, D, H, m['ceiling'], s['ceiling'])
    for wl in (back, left, right):
        skirting(r, wl, m['trim'])
    for k, o in enumerate(wins):
        window_frame(r, back, o, m['trim'], depth=0.16, bars=(1, 0), transoms=(o[3] - 0.45,), sill_mat=m['trim'], name=f'win{k}')
        window_light(r, back, o, strength=35, name=f'sky{k}')
        roller_blind(r, back, o, 0.42, m['blind'], s['blinds'], m['blindcase'], inset=0.07, name=f'roller{k}')
    world_hdri('cloudy_vondelpark', strength=1.4, rotation=40, camera_strength=2.2)

    # ---- Sheers on a ceiling track, gathered at the piers between the windows
    curtain_track(r, back, 0.1, W - 0.1, H, 0.16, m['track'])
    for k, (u, wdt) in enumerate([(0.05, 0.95), (1.85, 0.8), (3.78, 0.8), (5.55, 0.8)]):
        curtain(r, back, u, wdt, H - 0.04, H - 0.05, 0.16, folds=9, depth=0.07, mat=m['sheer'], surface=s['sheers'], seed=11 + k,
                name=f'sheer{k}', sway=0.01)

    # ---- L-sectional with the chaise on the right
    sy = D - 1.85
    sofa(r, (-0.15, sy, 0), 0, m['sofa'], s['sofa'], m['chrome'], seats=3, seat_w=0.78, depth=1.02, arm='low',
         chaise=(1, 0.85), seat_h=0.42, name='sectional')
    for k, (x, ang, mat) in enumerate([(-1.05, 8, 'cushion'), (-0.5, -4, 'cushion2'), (0.25, 5, 'cushion'), (0.62, -7, 'cushion2')]):
        cushion(r, (x, sy + 0.22, 0.47), ang, m[mat], s['cushions'], size=0.46, thick=0.15, lean=-20, name=f'cushion{k}')
    # A magazine on the seat.
    r.box('magazine', frame((-0.75, sy - 0.18, 0.445), 18), (0.28, 0.21, 0.008), m['paper'])

    # ---- Rug in front
    rug(r, (-0.2, sy - 1.55, 0), 0, 2.6, 1.7, m['rug'], s['rug'])

    # ---- Arc floor lamp on the left: base, arc, cone shade
    import math
    bx, by = X0 + 0.75, sy + 0.1
    r.cylinder('lamp-base', frame((bx, by, 0)), 0.17, 0.17, 0.025, m['black'], segments=40)
    arc = [(bx, by, 0.02)]
    for k in range(1, 21):
        t = k / 20
        arc.append((bx + 0.95 * math.sin(t * math.pi / 2) ** 1.4, by - 0.25 * t, 0.02 + 1.95 * math.sin(t * math.pi * 0.62) + 0.1 * t))
    r.tube('lamp-arc', arc, 0.009, m['black'])
    ex, ey, ez = arc[-1]
    r.cylinder('lamp-shade', frame((ex + 0.04, ey, ez - 0.32), 0, 0, 0), 0.2, 0.02, 0.3, m['shade'], segments=40, cap=False)
    point_light(r, (ex + 0.04, ey, ez - 0.24), 40, color=(1.0, 0.82, 0.6), radius=0.04, name='arc-lamp')

    # ---- Books on the floor by the lamp
    z = 0.0
    for k, (mat, t, ang) in enumerate([('book1', 0.035, 4), ('book2', 0.03, -6), ('book3', 0.04, 2), ('book2', 0.025, 9), ('book1', 0.03, -3)]):
        r.box(f'book{k}', frame((bx + 0.45, by - 0.55, z), ang), (0.28, 0.21, t), m[mat], bevel=0.002)
        z += t
    # ---- Decor
    r.place('potted_plant_02', (X1 - 0.55, D - 0.6, 0), yaw=30, height=1.35)
    r.place('coffee_table_round_01', (-0.35, sy - 1.5, 0.012), yaw=0, width=0.9)
    for x in (-1.6, 1.6):
        downlight(r, (x, 2.0, H), strength=25)
        downlight(r, (x, 4.6, H), strength=25)
