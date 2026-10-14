"""Swappable soft furnishings built from parametric grids: curtains, blinds, upholstery,
bedding, rugs. Every piece registers texture patches on its surface."""
import math

import numpy as np

from core import frame
from shell import Wall


def _rng(seed):
    return np.random.default_rng(seed)


# ------------------------------------------------------------------ window dressing
def curtain(room, w: Wall, u_left, width, top, drop, offset, folds, depth, mat, surface, seed=1, name='curtain',
            res_u=10, rows=48, sway=0.0, tieback=None):
    """One pleated panel hanging from `top` along the wall. Folds deepen towards the hem.
    `tieback` = (height, pinch 0..1, side -1|1) gathers the panel towards one side at that height."""
    r = _rng(seed)
    cols = max(8, int(folds * res_u))
    amp = 0.8 + 0.4 * r.random(folds + 2)
    ph = r.random(folds + 2) * 0.25
    u = np.linspace(0, 1, cols + 1)
    v = np.linspace(0, 1, rows + 1)
    uu, vv = np.meshgrid(u, v)
    k = np.clip((uu * folds).astype(int), 0, folds + 1)
    a = amp[k]
    phase = 2 * math.pi * (uu * folds + ph[k] * 0.0)
    flare = 1 + 0.45 * vv
    head = np.clip(vv / 0.04, 0.55, 1)  # pinch pleats flatten the top a little
    d = depth * (0.5 - 0.5 * np.cos(phase)) * a * flare * head
    x = u_left + uu * width
    if sway:
        x = x + sway * np.sin(vv * math.pi * 0.9) * (0.5 + 0.5 * np.sin(uu * 3.1 + seed))
    if tieback:
        th, pinch, side = tieback
        # Gather fabric towards `side` around the tie height, blooming below it.
        anchor = 0 if side < 0 else 1
        g = np.exp(-((top - vv * drop) - th) ** 2 / 0.5) * pinch
        x = x + (anchor - uu) * width * g * 0.7
        d = d * (1 + 0.8 * g)
    z = top - vv * drop
    pts = w.origin + w.right * x[..., None] + np.array([0, 0, 1.0]) * z[..., None] + w.inward * (offset + d)[..., None]
    return room.grid(name, pts, mat, surface)


def curtain_rod(room, w: Wall, u0, u1, z, offset, mat, radius=0.012, name='rod', finials=True):
    a = w.at(u0, z, offset)
    b = w.at(u1, z, offset)
    room.tube(name, [a.tolist(), b.tolist()], radius, mat)
    if finials:
        for k, p in enumerate((a, b)):
            room.cylinder(f'{name}-fin{k}', frame(p.tolist(), w.yaw, 0, 90), 0.022, 0.022, 0.03, mat, segments=16)


def curtain_track(room, w: Wall, u0, u1, z, offset, mat, name='track'):
    """Ceiling-fixed track (wave curtains)."""
    m = frame(w.at((u0 + u1) / 2, z - 0.02, offset).tolist(), w.yaw)
    room.box(name, m, (u1 - u0, 0.03, 0.025), mat, bevel=0.003)


def roller_blind(room, w: Wall, opening, lowered, mat, surface, case_mat, inset=0.05, name='roller'):
    """Roller blind inside the reveal, lowered `lowered` (0..1) of the opening's height."""
    u0, u1, z0, z1 = opening
    d = -inset
    bottom = z1 - (z1 - z0) * lowered
    room.quad(f'{name}-fabric', w.at(u0 + 0.02, z1 - 0.06, d), w.at(u1 - 0.02, z1 - 0.06, d), w.at(u1 - 0.02, bottom, d),
              w.at(u0 + 0.02, bottom, d), mat, surface)
    m = frame(w.at((u0 + u1) / 2, z1 - 0.07, d - 0.01).tolist(), w.yaw)
    room.rounded_box(f'{name}-case', m, (u1 - u0 - 0.01, 0.07, 0.07), case_mat, round_=0.02, res=4)
    m = frame(w.at((u0 + u1) / 2, bottom - 0.02, d).tolist(), w.yaw)
    room.rounded_box(f'{name}-bar', m, (u1 - u0 - 0.04, 0.018, 0.022), case_mat, round_=0.008, res=4)


def vertical_blinds(room, w: Wall, u0, u1, top, bottom, offset, mat, surface, head_mat, vane=0.089, angle=35,
                    open_frac=1.0, name='vblind'):
    """Vertical vanes turned `angle` degrees, hanging from a head rail. The whole run shares one
    planar texture patch so patterns continue across vanes, as on real blinds."""
    pitch = vane * 0.82
    n = int((u1 - u0) * open_frac / pitch)
    c = vane / 2 * math.cos(math.radians(angle))
    s = vane / 2 * math.sin(math.radians(angle))
    for k in range(n):
        x = u0 + pitch * (k + 0.5)
        sway = 0.004 * math.sin(k * 1.7)
        tl = w.at(x - c, top, offset - s)
        tr = w.at(x + c, top, offset + s)
        br = w.at(x + c + sway, bottom, offset + s)
        bl = w.at(x - c + sway, bottom, offset - s)
        # A gentle curl across the vane width.
        uu = np.linspace(0, 1, 5)[None, :, None]
        vv = np.linspace(0, 1, 9)[:, None, None]
        top_e = tl + (tr - tl) * uu
        bot_e = bl + (br - bl) * uu
        pts = top_e + (bot_e - top_e) * vv + w.inward * (0.006 * np.sin(math.pi * uu))
        room.grid(f'{name}-{k}', pts, mat, surface, patch=False, uv_size=(vane, top - bottom))
        # Bottom weight.
        m = frame(((bl + br) / 2).tolist(), w.yaw + angle)
        room.box(f'{name}-w{k}', m, (vane * 0.95, 0.004, 0.012), head_mat)
    xr = u0 + pitch * n
    room.quad_patch(surface, w.at(u0, top, offset), w.at(xr, top, offset), w.at(xr, bottom, offset), w.at(u0, bottom, offset))
    m = frame(w.at((u0 + u1) / 2, top, offset).tolist(), w.yaw)
    room.rounded_box(f'{name}-head', m, (u1 - u0, 0.05, 0.035), head_mat, round_=0.008, res=4)


# ------------------------------------------------------------------ upholstery
def _piece(room, base, prefix):
    counter = [0]

    def piece(local, size, mat, surface, yaw=0.0, pitch=0.0, **kw):
        counter[0] += 1
        m = base @ frame(local, yaw, pitch)
        kw.setdefault('faces', 'fblrt')
        return room.rounded_box(f'{prefix}-{counter[0]}', m, size, mat, surface, **kw)

    return piece


def sofa(room, pos, yaw, mat, surface, leg_mat, seats=3, seat_w=0.72, depth=1.0, arm='track', chaise=None,
         back_cushions=True, seat_h=0.44, name='sofa', legs='block', corner=None):
    """Modern sofa: plinth, arms, back, loose seat and back cushions. `chaise` = (side, length)
    extends one end forward; `corner` = (side, seats) adds an L return (a sectional)."""
    base = frame(pos, yaw)
    piece = _piece(room, base, name)
    arm_w = {'track': 0.16, 'slope': 0.2, 'low': 0.22}[arm]
    inner = seat_w * seats
    W = inner + 2 * arm_w
    plinth_h = seat_h - 0.18
    leg_h = 0.06 if legs else 0.0
    back_d = 0.2
    # Plinth under seats.
    piece((0, 0, leg_h), (W, depth, plinth_h - leg_h), mat, surface, round_=0.02, bulge=0.004)
    for side in (-1, 1):
        if chaise and chaise[0] == side:
            continue
        ah = seat_h + (0.2 if arm != 'low' else 0.12)
        piece((side * (W / 2 - arm_w / 2), 0, leg_h), (arm_w, depth, ah - leg_h), mat, surface, round_=0.05, bulge=0.012)
    # Back frame.
    piece((0, depth / 2 - back_d / 2, plinth_h), (inner + (0 if not chaise else arm_w), back_d, 0.42), mat, surface, round_=0.04,
          bulge=0.01)
    for i in range(seats):
        x = -inner / 2 + seat_w * (i + 0.5)
        piece((x, -0.03, plinth_h), (seat_w - 0.01, depth - back_d - 0.02, 0.18), mat, surface, round_=0.05, bulge=0.025,
              sag=0.012)
        if back_cushions:
            piece((x, depth / 2 - back_d - 0.06, seat_h - 0.02), (seat_w - 0.02, 0.2, 0.44), mat, surface, pitch=-11,
                  round_=0.06, bulge=0.022)
    if chaise:
        side, length = chaise
        cx = side * (inner / 2 - seat_w / 2)
        cy = -depth / 2 - length / 2 + 0.02
        piece((cx + side * arm_w / 2, cy, leg_h), (seat_w + arm_w, length, plinth_h - leg_h), mat, surface, round_=0.02,
              bulge=0.004)
        piece((cx + side * arm_w / 2, cy - 0.01, plinth_h), (seat_w + arm_w - 0.01, length, 0.18), mat, surface, round_=0.05,
              bulge=0.025, sag=0.01)
    if legs:
        for sx in (-1, 1):
            for sy in (-1, 1):
                lp = base @ frame((sx * (W / 2 - 0.08), sy * (depth / 2 - 0.08), 0))
                room.box(f'{name}-leg{sx}{sy}', lp, (0.05, 0.05, leg_h), leg_mat, bevel=0.004)
    return W


def armchair(room, pos, yaw, mat, surface, leg_mat, name='armchair', width=0.86, depth=0.86, seat_h=0.44, arm_h=0.62,
             back_h=0.86, leg_h=0.16):
    """A soft modern armchair (slim arms, loose back cushion, tapered legs)."""
    base = frame(pos, yaw)
    piece = _piece(room, base, name)
    arm_w = 0.1
    inner = width - 2 * arm_w
    piece((0, 0, leg_h), (width, depth, seat_h - leg_h - 0.1), mat, surface, round_=0.03, bulge=0.004)
    for side in (-1, 1):
        piece((side * (width / 2 - arm_w / 2), 0, leg_h), (arm_w, depth, arm_h - leg_h), mat, surface, round_=0.045, bulge=0.006)
    piece((0, depth / 2 - 0.08, leg_h), (inner, 0.14, back_h - leg_h), mat, surface, round_=0.05, bulge=0.01)
    piece((0, -0.04, seat_h - 0.1), (inner - 0.01, depth - 0.2, 0.14), mat, surface, round_=0.05, bulge=0.025, sag=0.01)
    piece((0, depth / 2 - 0.22, seat_h + 0.02), (inner - 0.03, 0.18, back_h - seat_h - 0.08), mat, surface, pitch=-10,
          round_=0.07, bulge=0.045)
    for sx in (-1, 1):
        for sy in (-1, 1):
            lp = base @ frame((sx * (width / 2 - 0.06), sy * (depth / 2 - 0.06), 0), 0, sy * 6, -sx * 6)
            room.cylinder(f'{name}-leg{sx}{sy}', lp, 0.018, 0.013, leg_h, leg_mat, segments=12)


def cushion(room, pos, yaw, mat, surface, size=0.48, thick=0.15, lean=-18, name='cushion', roll=0.0):
    m = frame(pos, yaw, lean, roll)
    return room.rounded_box(name, m, (size, thick, size * 0.96), mat, surface, round_=thick * 0.45, bulge=thick * 0.32,
                            res=16, faces='fblrtd')


def bench(room, pos, yaw, mat, surface, leg_mat, length=1.3, depth=0.45, height=0.46, tufted=True, name='bench'):
    base = frame(pos, yaw)
    top_h = 0.14
    m = base @ frame((0, 0, height - top_h))
    room.rounded_box(f'{name}-top', m, (length, depth, top_h), mat, surface, round_=0.05, bulge=0.02, sag=-0.01, res=18,
                     faces='fblrt')
    for sx in (-1, 1):
        for sy in (-1, 1):
            lp = base @ frame((sx * (length / 2 - 0.07), sy * (depth / 2 - 0.06), 0), 0, sy * 4, -sx * 4)
            room.cylinder(f'{name}-leg{sx}{sy}', lp, 0.024, 0.016, height - top_h + 0.01, leg_mat, segments=14)


# ------------------------------------------------------------------ bedroom
def channel_headboard(room, w: Wall, u_mid, width, height, z0, offset, mat, surface, channels=9, depth=0.07, wing=0.0,
                      name='headboard'):
    """Upholstered headboard with vertical channels; `wing` bends the outer edges forward."""
    cols, rows = channels * 10, 30
    u = np.linspace(0, 1, cols + 1)
    v = np.linspace(0, 1, rows + 1)
    uu, vv = np.meshgrid(u, v)
    ch = np.abs(np.sin(math.pi * uu * channels)) ** 0.6
    top_round = np.clip((1 - vv) / 0.08, 0, 1) ** 0.5
    bottom = np.clip(vv / 0.02, 0, 1)
    d = offset + depth * (0.45 + 0.55 * ch) * np.minimum(top_round, 1) * bottom + depth * 0.3
    x = u_mid - width / 2 + uu * width
    if wing:
        e = np.clip((np.abs(uu - 0.5) - 0.38) / 0.12, 0, 1)
        d = d + wing * e ** 2
    z = z0 + height - vv * height + (1 - top_round) * 0.0
    pts = w.origin + w.right * x[..., None] + np.array([0, 0, 1.0]) * z[..., None] + w.inward * d[..., None]
    room.grid(name, pts, mat, surface)
    # Back panel and sides so the edge isn't paper-thin.
    m = frame(w.at(u_mid, z0, offset + 0.02).tolist(), w.yaw)
    room.box(f'{name}-back', m, (width - 0.01, 0.04, height - 0.01), mat)


def tufted_headboard(room, w: Wall, u_mid, width, height, z0, offset, mat, surface, cols_t=7, rows_t=4, depth=0.08,
                     button_mat=None, name='headboard'):
    """Diamond button-tufted headboard with a rounded top edge."""
    cols, rows = cols_t * 12, rows_t * 12
    u = np.linspace(0, 1, cols + 1)
    v = np.linspace(0, 1, rows + 1)
    uu, vv = np.meshgrid(u, v)
    # Diamond grid of dimples: alternate rows offset by half a cell.
    gu, gv = uu * cols_t, vv * rows_t
    dimple = np.zeros_like(uu)
    for j in range(rows_t + 1):
        for i in range(cols_t + 1):
            cx = i + (0.5 if j % 2 else 0.0)
            cy = j
            dd = ((gu - cx) * 1.0) ** 2 + ((gv - cy) * 1.15) ** 2
            dimple = np.maximum(dimple, np.exp(-dd / 0.02))
    margin = np.minimum.reduce([np.clip(uu / 0.04, 0, 1), np.clip((1 - uu) / 0.04, 0, 1), np.clip(vv / 0.03, 0, 1),
                                np.clip((1 - vv) / 0.05, 0, 1)]) ** 0.5
    inner = (gu > 0.3) & (gu < cols_t - 0.3) & (gv > 0.3) & (gv < rows_t - 0.3)
    d = offset + 0.02 + depth * margin * (1 - 0.7 * dimple * inner)
    x = u_mid - width / 2 + uu * width
    z = z0 + height - vv * height
    pts = w.origin + w.right * x[..., None] + np.array([0, 0, 1.0]) * z[..., None] + w.inward * d[..., None]
    room.grid(name, pts, mat, surface)
    m = frame(w.at(u_mid, z0, offset + 0.015).tolist(), w.yaw)
    room.box(f'{name}-back', m, (width - 0.01, 0.03, height - 0.01), mat)


def bed(room, pos, yaw, width, length, frame_mat, sheet_mat, duvet_mat, duvet_surface, pillow_mat, pillow_surface,
        base_h=0.3, mattress_h=0.24, duvet_cover=0.72, overhang=0.28, sheet_surface=None, frame_style='box', name='bed',
        throw=None, wrinkle=1.0, seed=3, pillows=2, euro=0, euro_mat=None, euro_surface=None):
    """Bed base, mattress, a duvet draped over the lower `duvet_cover` of it and pillows.
    Local frame: head of the bed at +y, foot at -y."""
    base = frame(pos, yaw)
    r = _rng(seed)
    hw, hl = width / 2, length / 2
    if frame_style == 'box':
        room.box(f'{name}-base', base @ frame((0, 0, 0.0)), (width + 0.06, length + 0.04, base_h), frame_mat, bevel=0.01)
    else:  # legs + slim frame
        room.box(f'{name}-rail', base @ frame((0, 0, base_h - 0.14)), (width + 0.06, length + 0.04, 0.14), frame_mat, bevel=0.01)
        for sx in (-1, 1):
            for sy in (-1, 1):
                room.box(f'{name}-leg{sx}{sy}', base @ frame((sx * (hw - 0.02), sy * (hl - 0.03), 0)), (0.06, 0.06, base_h - 0.14),
                         frame_mat, bevel=0.005)
    mz = base_h
    room.rounded_box(f'{name}-mattress', base @ frame((0, 0, mz)), (width, length, mattress_h), sheet_mat, sheet_surface,
                     round_=0.05, bulge=0.006, res=10, faces='fblrt', patch=sheet_surface is not None)
    top = mz + mattress_h
    # Duvet: cross-section across x drapes over the sides; runs from the foot to duvet_cover.
    cols, rows = 72, 60
    span = length * duvet_cover
    u = np.linspace(0, 1, cols + 1)
    v = np.linspace(0, 1, rows + 1)
    uu, vv = np.meshgrid(u, v)  # u across the bed (left→right seen from the foot), v from head end → foot
    # Path across: hang on left side, over the top, hang on right side. Parametrise by arc.
    side = overhang + 0.06
    total = 2 * side + width
    s = uu * total
    x = np.where(s < side, -hw - 0.03, np.where(s > side + width, hw + 0.03, -hw + (s - side)))
    z = np.where(s < side, top - (side - s) + 0.03, np.where(s > side + width, top - (s - side - width) + 0.03, top + 0.06))
    # Round the shoulders.
    edge_l = np.clip(1 - np.abs(s - side) / 0.08, 0, 1)
    edge_r = np.clip(1 - np.abs(s - side - width) / 0.08, 0, 1)
    shoulder = np.maximum(edge_l, edge_r)
    x = x + np.where(s < side + width / 2, -1, 1) * 0.02 * shoulder
    z = z - 0.03 * shoulder ** 2
    # Puff in the middle; folds near the foot; random soft wrinkles.
    puff = 0.04 * np.sin(np.clip((s - side) / width, 0, 1) * math.pi)
    z = z + puff
    y = hl - (1 - duvet_cover) * length - vv * span
    # Foot: drape down over the end of the bed.
    foot = np.clip((vv - 0.88) / 0.12, 0, 1)
    y = y - foot * 0.02
    z = z - foot ** 1.5 * (overhang * 0.85)
    wr = np.zeros_like(uu)
    for k in range(6):
        fx, fy, ph = r.uniform(3, 9), r.uniform(2, 6), r.uniform(0, 6.28)
        wr += np.sin(uu * fx * 6.28 + vv * fy * 6.28 + ph) / 6
    z = z + 0.012 * wrinkle * wr
    # Folded-back top edge.
    fold = np.clip(1 - vv / 0.04, 0, 1)
    z = z + 0.03 * fold
    pts = base_points(base, x, y, z)
    room.grid(f'{name}-duvet', pts, duvet_mat, duvet_surface)
    # Pillows against the headboard.
    py = hl - 0.25
    pw = (width - 0.12) / max(pillows, 1)
    for i in range(euro):
        px = -width / 2 + 0.06 + (width - 0.12) * (i + 0.5) / euro
        cushion(room, apply(base, (px, py + 0.06, top - 0.02)), yaw, euro_mat or pillow_mat, euro_surface if euro_surface is not None else pillow_surface,
                size=min(0.62, (width - 0.12) / euro - 0.02), thick=0.17, lean=-20, name=f'{name}-euro{i}')
    for i in range(pillows):
        px = -width / 2 + 0.06 + pw * (i + 0.5)
        m = base @ frame((px, py - (0.12 if euro else 0), top + 0.01), r.uniform(-3, 3), -55 if euro else -30)
        room.rounded_box(f'{name}-pillow{i}', m, (pw - 0.06, 0.12, 0.42), pillow_mat, pillow_surface, round_=0.05, bulge=0.05,
                         res=14, faces='fblrtd')
    if throw:
        tmat, tsurf, tlen = throw
        # A throw folded across the foot of the bed.
        cols, rows = 60, 12
        u = np.linspace(0, 1, cols + 1)
        v = np.linspace(0, 1, rows + 1)
        uu, vv = np.meshgrid(u, v)
        s = uu * (width + 2 * 0.3)
        x = np.where(s < 0.3, -hw - 0.05, np.where(s > 0.3 + width, hw + 0.05, -hw + (s - 0.3)))
        z = np.where(s < 0.3, top + 0.08 - (0.3 - s), np.where(s > 0.3 + width, top + 0.08 - (s - 0.3 - width), top + 0.1))
        z = z + 0.01 * np.sin(uu * 40 + vv * 3)
        y = -hl + 0.15 + tlen * (0.5 - vv)
        room.grid(f'{name}-throw', base_points(base, x, y, z), tmat, tsurf)


def apply(m, p):
    v = np.array(m) @ np.array([p[0], p[1], p[2], 1.0])
    return tuple(v[:3])


def base_points(m, x, y, z):
    mw = np.array(m)
    p = np.stack([x, y, z], axis=-1)
    return np.einsum('ij,rcj->rci', mw[:3, :3], p) + mw[:3, 3]


def rug(room, centre, yaw, width, length, mat, surface, edge_mat=None, thick=0.012, name='rug'):
    """Flat rug (one planar patch) with a slim edge band."""
    m = frame(centre, yaw)
    hw, hl = width / 2, length / 2
    c = lambda x, y: apply(m, (x, y, thick))
    room.quad(f'{name}', c(-hw, hl), c(hw, hl), c(hw, -hl), c(-hw, -hl), mat, surface)
    if edge_mat is not None:
        room.box(f'{name}-edge', m, (width, length, thick - 0.001), edge_mat)
