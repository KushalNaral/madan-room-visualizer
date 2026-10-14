"""Renders a built room with Cycles and writes the visualizer files:
  public/mock-rooms/<id>.png           photo (exposure + PBR Neutral + gamma 2.2, as the viewer's shader)
  public/mock-rooms/<id>-shading.png   per-pixel light E, sqrt(E/4) encoded: the shader relights as tonemap(albedo × E)
  public/mock-rooms/<id>-ids.png       2× surface id map
  public/mock-rooms/<id>-thumb.png     480×300 preview
  src/data/mock/rooms/<id>.json        Room definition (surfaces, projected patches, anchors, presets)
"""
import json
import math
import os
import time

import bpy
import numpy as np
import OpenImageIO as oiio
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

NEAR = 0.1


def id_color(index):
    levels = [48, 112, 176, 240]
    k = index + 1
    return (levels[k % 4], levels[(k // 4) % 4], levels[(k // 16) % 4])


def hex_of(c):
    return '#' + ''.join(f'{v:02x}' for v in c)


def tonemap(c):
    """Khronos PBR Neutral on (..., 3) linear RGB, same as tonemap() in src/render/shaders.ts."""
    x = c.min(-1, keepdims=True)
    c = c - np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    peak = c.max(-1, keepdims=True)
    new_peak = 1 - 0.0576 / np.maximum(peak - 0.52, 1e-6)
    t = 1 - 1 / (0.15 * (peak - new_peak) + 1)
    rolled = c * (new_peak / np.maximum(peak, 1e-6)) * (1 - t) + new_peak * t
    return np.clip(np.where(peak < 0.76, c, rolled), 0, 1)


def auto_exposure(light):
    """Same rule as autoExposure() in src/render/tonemap.ts: well-lit median, sun patches kept in range."""
    if light.size == 0:
        return 1.0, 1.0
    median = float(np.median(light)) or 1.0
    p95 = float(np.percentile(light, 95)) or median
    ex = max(0.55 / median, min(0.8 / median, 2.2 / p95))
    return min(6.0, max(0.5, ex)), median


def to_display(x):
    return np.power(np.clip(x, 0, 1), 1 / 2.2)


def camera(pos, target, fov_y, width, height, shift_y=0.0):
    data = bpy.data.cameras.new('camera')
    data.sensor_fit = 'VERTICAL'
    data.angle_y = math.radians(fov_y)
    data.clip_start = 0.05
    data.shift_y = shift_y
    obj = bpy.data.objects.new('camera', data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = pos
    d = Vector(target) - Vector(pos)
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc = bpy.context.scene
    sc.camera = obj
    sc.render.resolution_x, sc.render.resolution_y = width, height
    sc.render.resolution_percentage = 100
    return obj


def _settings(samples, preview):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.03 if preview else 0.015
    cy.use_denoising = True
    cy.denoiser = 'OPENIMAGEDENOISE'
    cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    cy.denoising_prefilter = 'ACCURATE'
    cy.max_bounces = 6
    cy.diffuse_bounces = 3
    cy.glossy_bounces = 2
    cy.transmission_bounces = 4
    cy.transparent_max_bounces = 12
    cy.volume_bounces = 0
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.sample_clamp_indirect = 8.0
    cy.blur_glossy = 1.0
    sc.render.use_persistent_data = True
    sc.render.film_transparent = False
    vl = sc.view_layers[0]
    vl.use_pass_combined = True
    vl.use_pass_diffuse_color = True
    vl.use_pass_diffuse_direct = True
    vl.use_pass_diffuse_indirect = True
    vl.use_pass_object_index = False
    vl.pass_alpha_threshold = 0.01
    s = sc.render.image_settings
    s.media_type = 'MULTI_LAYER_IMAGE'
    s.file_format = 'OPEN_EXR_MULTILAYER'
    s.color_depth = '32'
    s.exr_codec = 'ZIP'


def _read_exr(path):
    """{pass name: float32 array (h, w, c)} from a multilayer EXR."""
    inp = oiio.ImageInput.open(path)
    out = {}
    i = 0
    while inp.seek_subimage(i, 0):
        spec = inp.spec()
        px = inp.read_image(i, 0, 0, spec.nchannels, 'float')
        names = spec.channelnames
        # Group channels by their pass name ("ViewLayer.<Pass>.<C>").
        groups = {}
        for c, n in enumerate(names):
            parts = n.split('.')
            groups.setdefault(parts[1] if len(parts) >= 3 else parts[0], []).append(c)
        for name, cs in groups.items():
            out[name] = np.asarray(px)[..., cs].reshape(spec.height, spec.width, len(cs))
        i += 1
    inp.close()
    return out


def _write_png(path, rgb_u8):
    h, w, c = rgb_u8.shape
    out = oiio.ImageOutput.create(path)
    out.open(path, oiio.ImageSpec(w, h, c, 'uint8'))
    out.write_image(np.ascontiguousarray(rgb_u8))
    out.close()


def _resize(rgb_u8, w, h):
    buf = oiio.ImageBuf(np.ascontiguousarray(rgb_u8))
    res = oiio.ImageBufAlgo.resize(buf, roi=oiio.ROI(0, w, 0, h, 0, 1, 0, 3))
    return np.asarray(res.get_pixels('uint8')).reshape(h, w, 3)


def _anchor(mask, scale_to_image):
    """Deepest point of a mask (repeated erosion at 1/4 scale)."""
    f = 4
    m = mask[f // 2::f, f // 2::f].copy()
    if not m.any():
        return None
    last = m
    while m.any():
        last = m
        m = m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1)
        m[0, :] = m[-1, :] = False
        m[:, 0] = m[:, -1] = False
    ys, xs = np.nonzero(last)
    cy, cx = ys.mean(), xs.mean()
    k = int(np.argmin((ys - cy) ** 2 + (xs - cx) ** 2))
    return {'x': int(round((xs[k] + 0.5) * f * scale_to_image)), 'y': int(round((ys[k] + 0.5) * f * scale_to_image))}


def _surface_areas(room):
    area = [0.0] * len(room.surfaces)
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or obj.pass_index <= 0:
            continue
        s = obj.pass_index - 1
        mw = obj.matrix_world
        for p in obj.data.polygons:
            vs = [mw @ obj.data.vertices[k].co for k in p.vertices]
            for k in range(1, len(vs) - 1):
                area[s] += (vs[k] - vs[0]).cross(vs[k + 1] - vs[0]).length / 2
    return area


def _clip_quad(p, sc, cam, zmin=0.6):
    """Trims a planar patch to the part in front of the camera (floors and side walls run
    behind it), keeping it a rectangle so its homography stays valid."""
    c = [np.array(q) for q in p['corners']]  # tl, tr, br, bl
    z = [world_to_camera_view(sc, cam, Vector(q.tolist())).z for q in c]
    if min(z) > zmin:
        return p
    if max(z) <= zmin:
        return None
    # z is affine over the rectangle: z = z_tl + a·u + b·v.
    a, b = z[1] - z[0], z[3] - z[0]
    u0, u1, v0, v1 = 0.0, 1.0, 0.0, 1.0
    if abs(a) >= abs(b):
        worst_v = 1.0 if b < 0 else 0.0  # the v that lowers z most
        lim = (zmin - z[0] - b * worst_v) / a
        if a > 0:
            u0 = min(max(lim, 0.0), 1.0)
        else:
            u1 = min(max(lim, 0.0), 1.0)
    else:
        worst_u = 1.0 if a < 0 else 0.0
        lim = (zmin - z[0] - a * worst_u) / b
        if b > 0:
            v0 = min(max(lim, 0.0), 1.0)
        else:
            v1 = min(max(lim, 0.0), 1.0)
    if u1 - u0 < 1e-3 or v1 - v0 < 1e-3:
        return None
    at = lambda u, v: c[0] + (c[1] - c[0]) * u + (c[3] - c[0]) * v
    return {**p, 'corners': [at(u0, v0).tolist(), at(u1, v0).tolist(), at(u1, v1).tolist(), at(u0, v1).tolist()],
            'widthCm': p['widthCm'] * (u1 - u0), 'heightCm': p['heightCm'] * (v1 - v0)}


def render(room, meta, root, samples=128, preview=False, log=print, reuse=False):
    sc = bpy.context.scene
    bpy.context.view_layer.update()  # world matrices, needed for projecting patches
    cam = sc.camera
    W, H = sc.render.resolution_x, sc.render.resolution_y
    work = os.path.join(root, '.blender-out', room.id)
    os.makedirs(work, exist_ok=True)
    img_dir = os.path.join(root, 'public', 'mock-rooms')
    json_dir = os.path.join(root, 'src', 'data', 'mock', 'rooms')
    os.makedirs(img_dir, exist_ok=True)
    os.makedirs(json_dir, exist_ok=True)

    # ---- Beauty + lighting passes
    _settings(samples, preview)
    t0 = time.time()
    sc.render.filepath = os.path.join(work, 'beauty.exr')
    if not (reuse and os.path.exists(sc.render.filepath)):
        bpy.ops.render.render(write_still=True)
    log(f'{room.id}: beauty {time.time() - t0:.0f}s')
    passes = _read_exr(sc.render.filepath)
    C = passes['Combined'][..., :3]
    A = passes['Diffuse Color'][..., :3]
    L = passes['Diffuse Direct'][..., :3] + passes['Diffuse Indirect'][..., :3]

    # ---- Surface ids at 2× (one unfiltered sample per pixel)
    t1 = time.time()
    cy = sc.cycles
    cy.samples = 1
    cy.use_adaptive_sampling = False
    cy.use_denoising = False
    cy.light_sampling_threshold = 0.0
    cy.filter_width = 0.01
    sc.render.resolution_percentage = 200
    vl = sc.view_layers[0]
    vl.use_pass_diffuse_color = vl.use_pass_diffuse_direct = vl.use_pass_diffuse_indirect = False
    vl.use_pass_object_index = True
    sc.render.filepath = os.path.join(work, 'ids.exr')
    if not (reuse and os.path.exists(sc.render.filepath)):
        bpy.ops.render.render(write_still=True)
    sc.render.resolution_percentage = 100
    log(f'{room.id}: ids {time.time() - t1:.0f}s')
    idp = _read_exr(sc.render.filepath)
    surf2 = np.rint(idp['Object Index'][..., 0]).astype(np.int32) - 1  # (2H, 2W), -1 = none

    # ---- Photo and light map
    lum = lambda x: x[..., 0] * 0.2126 + x[..., 1] * 0.7152 + x[..., 2] * 0.0722
    wt = np.clip((lum(A) - 0.015) / 0.05, 0, 1)[..., None]
    E = wt * (C / np.maximum(A, 1e-3)) + (1 - wt) * L
    on_surface = surf2[::2, ::2][:E.shape[0], :E.shape[1]] >= 0
    exposure, median = auto_exposure(lum(E)[on_surface])
    exposure = meta.get('exposure', exposure)
    log(f'{room.id}: exposure {exposure:.2f} (median light {median:.2f})')
    photo = (to_display(tonemap(C * exposure)) * 255 + 0.5).astype(np.uint8)
    shading = (np.sqrt(np.clip(E * exposure / 4, 0, 1)) * 255 + 0.5).astype(np.uint8)
    n = len(room.surfaces)
    lut = np.zeros((n + 1, 3), dtype=np.uint8)
    for s in range(n):
        lut[s + 1] = id_color(s)
    ids = lut[np.clip(surf2 + 1, 0, n)]
    _write_png(os.path.join(img_dir, f'{room.id}.png'), photo)
    _write_png(os.path.join(img_dir, f'{room.id}-shading.png'), shading)
    _write_png(os.path.join(img_dir, f'{room.id}-ids.png'), ids)
    _write_png(os.path.join(img_dir, f'{room.id}-thumb.png'), _resize(photo, 480, 300))

    # ---- Patches projected into the image; keep those that show any of their surface
    def proj(p):
        q = world_to_camera_view(sc, cam, Vector(p))
        return q.x * W, (1 - q.y) * H, 1 - NEAR / max(q.z, 1e-4)

    H2, W2 = surf2.shape

    def shows(surface, grid_xy):
        g = np.asarray(grid_xy)
        rows, cols = g.shape[0] - 1, g.shape[1] - 1
        # Sample the patch densely by bilinear interpolation of its control grid.
        us = np.linspace(0, cols, max(4 * cols, 48) + 1)
        vs = np.linspace(0, rows, max(4 * rows, 48) + 1)
        i0 = np.clip(np.floor(us).astype(int), 0, max(cols - 1, 0))
        j0 = np.clip(np.floor(vs).astype(int), 0, max(rows - 1, 0))
        fu, fv = (us - i0)[None, :, None], (vs - j0)[:, None, None]
        a = g[np.ix_(j0, i0)]
        b = g[np.ix_(j0, np.minimum(i0 + 1, cols))]
        c = g[np.ix_(np.minimum(j0 + 1, rows), i0)]
        d = g[np.ix_(np.minimum(j0 + 1, rows), np.minimum(i0 + 1, cols))]
        p = (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv
        x = np.rint(p[..., 0] * 2).astype(int)
        y = np.rint(p[..., 1] * 2).astype(int)
        ok = (x >= 0) & (y >= 0) & (x < W2) & (y < H2)
        if not ok.any():
            return False
        return bool(np.any(surf2[y[ok], x[ok]] == surface))

    r1 = lambda v: round(float(v), 1)
    r4 = lambda v: round(float(v), 4)
    per_surface = [[] for _ in range(n)]
    for p in room.patches:
        s = p['surface']
        if p['kind'] == 'quad':
            p = _clip_quad(p, sc, cam)
            if p is None:
                continue
            pr = [proj(c) for c in p['corners']]
            tl, tr, br, bl = pr
            grid = [[tl[:2], tr[:2]], [bl[:2], br[:2]]]
            if any(q[2] <= 0 for q in pr) or not shows(s, grid):
                continue
            per_surface[s].append({
                'kind': 'quad', 'quad': [{'x': r1(q[0]), 'y': r1(q[1])} for q in pr], 'depth': [r4(q[2]) for q in pr],
                'widthCm': round(p['widthCm']), 'heightCm': round(p['heightCm']),
            })
        else:
            cols, rows = p['cols'], p['rows']
            pr = [proj(c) for c in p['points']]
            if any(q[2] <= 0 for q in pr):
                continue
            grid = [[pr[j * (cols + 1) + i][:2] for i in range(cols + 1)] for j in range(rows + 1)]
            if not shows(s, grid):
                continue
            pts = []
            for q in pr:
                pts += [r1(q[0]), r1(q[1]), r4(q[2])]
            per_surface[s].append({'kind': 'mesh', 'cols': cols, 'rows': rows, 'points': pts,
                                   'widthCm': round(p['widthCm']), 'heightCm': round(p['heightCm'])})

    area = _surface_areas(room)
    surfaces = []
    for s, d in enumerate(room.surfaces):
        if not per_surface[s] or not np.any(surf2 == s):
            continue
        entry = {'id': d['id'], 'label': d['label'], 'accepts': d['accepts']}
        if d.get('kind'):
            entry['kind'] = d['kind']
        if d.get('group'):
            entry['group'] = d['group']
        entry['idColor'] = hex_of(id_color(s))
        entry['areaM2'] = round(area[s], 1)
        a = _anchor(surf2 == s, 0.5)
        if a:
            entry['anchor'] = a
        entry['patches'] = per_surface[s]
        surfaces.append(entry)

    data = {
        'id': room.id,
        'name': meta['name'],
        **({'roomType': meta['roomType']} if meta.get('roomType') else {}),
        'imageUrl': f'mock-rooms/{room.id}.png',
        'shadingUrl': f'mock-rooms/{room.id}-shading.png',
        'idMapUrl': f'mock-rooms/{room.id}-ids.png',
        'thumbnailUrl': f'mock-rooms/{room.id}-thumb.png',
        'width': W,
        'height': H,
        'surfaces': surfaces,
        'presets': meta.get('presets', []),
    }
    with open(os.path.join(json_dir, f'{room.id}.json'), 'w') as fh:
        fh.write(json.dumps(data, separators=(',', ':')) + '\n')
    log(f'{room.id}: {len(surfaces)} surfaces, {sum(len(s["patches"]) for s in surfaces)} patches, {time.time() - t0:.0f}s total')
