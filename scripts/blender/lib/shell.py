"""Room shell: walls with openings, windows, floor, ceiling, trim and lights."""
import math
import os

import bpy
import numpy as np
from mathutils import Vector

from core import ASSETS, frame

UP = np.array([0.0, 0.0, 1.0])


class Wall:
    """A wall seen from inside: `origin` is its bottom-left corner, `right` runs along it."""

    def __init__(self, origin, right, width, height, openings=()):
        self.origin = np.asarray(origin, dtype=np.float64)
        self.right = np.asarray(right, dtype=np.float64) / np.linalg.norm(right)
        self.inward = np.cross(self.right, UP)
        self.width, self.height = width, height
        self.openings = list(openings)  # (u0, u1, z0, z1)

    def at(self, u, z, d=0.0):
        """Point `u` metres along, `z` up, `d` into the room."""
        return self.origin + self.right * u + UP * z + self.inward * d

    @property
    def yaw(self):
        """Yaw of a piece whose front faces into the room from this wall."""
        return math.degrees(math.atan2(self.right[1], self.right[0]))


def wall(room, w: Wall, mat, surface=None, reveal_mat=None, reveal=0.2, name='wall'):
    us = sorted({0.0, w.width, *[o[0] for o in w.openings], *[o[1] for o in w.openings]})
    k = 0
    for a, b in zip(us[:-1], us[1:]):
        mid = (a + b) / 2
        cuts = sorted((o[2], o[3]) for o in w.openings if o[0] <= mid <= o[1])
        z = 0.0
        spans = []
        for z0, z1 in cuts:
            if z0 > z:
                spans.append((z, z0))
            z = max(z, z1)
        if z < w.height:
            spans.append((z, w.height))
        for z0, z1 in spans:
            room.quad(f'{name}-{k}', w.at(a, z1), w.at(b, z1), w.at(b, z0), w.at(a, z0), mat, surface, patch=False)
            k += 1
    if surface is not None:
        room.quad_patch(surface, w.at(0, w.height), w.at(w.width, w.height), w.at(w.width, 0), w.at(0, 0))
    if reveal_mat is not None:
        for (u0, u1, z0, z1) in w.openings:
            d = -reveal
            room.quad(f'{name}-rev-t', w.at(u0, z1, 0), w.at(u1, z1, 0), w.at(u1, z1, d), w.at(u0, z1, d), reveal_mat)
            room.quad(f'{name}-rev-l', w.at(u0, z1, d), w.at(u0, z1, 0), w.at(u0, z0, 0), w.at(u0, z0, d), reveal_mat)
            room.quad(f'{name}-rev-r', w.at(u1, z1, 0), w.at(u1, z1, d), w.at(u1, z0, d), w.at(u1, z0, 0), reveal_mat)
            if z0 > 0.01:
                room.quad(f'{name}-rev-b', w.at(u0, z0, d), w.at(u1, z0, d), w.at(u1, z0, 0), w.at(u0, z0, 0), reveal_mat)


def window_frame(room, w: Wall, opening, mat, depth=0.12, bars=(1, 0), profile=0.065, sill_mat=None, name='win',
                 transoms=()):
    """Frame + mullions set `depth` back in the reveal. bars=(vertical mullions, horizontal);
    `transoms` are explicit heights for horizontal bars."""
    u0, u1, z0, z1 = opening
    d = -depth
    yaw = w.yaw
    t = profile

    def bar(cu, cz, sw, sh, k):
        m = frame(w.at(cu, cz, d), yaw)
        room.box(f'{name}-{k}', m, (sw, 0.06, sh), mat, bevel=0.006)

    bar((u0 + u1) / 2, z1 - t, u1 - u0, t, 'top')
    bar((u0 + u1) / 2, z0, u1 - u0, t, 'bot')
    bar(u0 + t / 2, z0, t, z1 - z0, 'l')
    bar(u1 - t / 2, z0, t, z1 - z0, 'r')
    nv, nh = bars
    for i in range(1, nv + 1):
        bar(u0 + (u1 - u0) * i / (nv + 1), z0, t * 0.9, z1 - z0, f'v{i}')
    hs = list(transoms) + [z0 + (z1 - z0) * i / (nh + 1) for i in range(1, nh + 1)]
    for i, hz in enumerate(hs):
        bar((u0 + u1) / 2, hz - t * 0.45, u1 - u0, t * 0.9, f'h{i}')
    if sill_mat is not None and z0 > 0.05:
        m = frame(w.at((u0 + u1) / 2, z0 - 0.03, 0.03), yaw)
        room.box(f'{name}-sill', m, (u1 - u0 + 0.12, 0.08 + depth, 0.03), sill_mat, bevel=0.004)
    # Thin glass: reflects a little, lets light and shadows through.
    glass = room.material('glass', color=(1, 1, 1), roughness=0.02, alpha=0.06)
    room.quad(f'{name}-glass', w.at(u0, z1, d - 0.01), w.at(u1, z1, d - 0.01), w.at(u1, z0, d - 0.01), w.at(u0, z0, d - 0.01), glass)


def window_light(room, w: Wall, opening, strength=60.0, color=(1.0, 0.98, 0.96), depth=0.25, name='skylight'):
    """Invisible area light filling the opening, facing into the room: the soft daylight."""
    u0, u1, z0, z1 = opening
    c = w.at((u0 + u1) / 2, (z0 + z1) / 2, -depth)
    data = bpy.data.lights.new(name, 'AREA')
    data.shape = 'RECTANGLE'
    data.size, data.size_y = u1 - u0, z1 - z0
    data.energy = strength * (u1 - u0) * (z1 - z0)
    data.color = color
    obj = bpy.data.objects.new(name, data)
    room.collection.objects.link(obj)
    # Area lights shine along local -z; point it along the wall's inward normal.
    n = Vector(w.inward.tolist())
    obj.rotation_euler = (-n).to_track_quat('Z', 'Y').to_euler()
    obj.location = Vector(c.tolist())
    obj.visible_camera = False
    obj.visible_glossy = False
    return obj


def floor(room, x0, x1, y0, y1, mat, surface=None):
    return room.quad('floor', (x0, y1, 0), (x1, y1, 0), (x1, y0, 0), (x0, y0, 0), mat, surface)


def ceiling(room, x0, x1, y0, y1, h, mat, surface=None):
    return room.quad('ceiling', (x0, y0, h), (x1, y0, h), (x1, y1, h), (x0, y1, h), mat, surface)


def skirting(room, w: Wall, mat, u0=0.0, u1=None, h=0.09, name='skirt'):
    u1 = w.width if u1 is None else u1
    m = frame(w.at((u0 + u1) / 2, 0, 0.006), w.yaw)
    room.box(name, m, (u1 - u0, 0.012, h), mat, bevel=0.002)


def downlight(room, pos, strength=40.0, color=(1.0, 0.86, 0.68), spot=110, name='downlight'):
    """Recessed spot: a small bright disc in the ceiling plus a spot light below it."""
    x, y, z = pos
    trim = room.material('downlight-trim', color=(0.95, 0.95, 0.94), roughness=0.3)
    bulb = room.emission('downlight-bulb', (1.0, 0.92, 0.8), 30.0)
    room.cylinder(f'{name}-trim', frame((x, y, z - 0.004)), 0.05, 0.05, 0.004, trim, segments=24)
    room.cylinder(f'{name}-bulb', frame((x, y, z - 0.006)), 0.035, 0.035, 0.002, bulb, segments=24)
    data = bpy.data.lights.new(name, 'SPOT')
    data.energy = strength
    data.color = color
    data.spot_size = math.radians(spot)
    data.spot_blend = 0.6
    data.shadow_soft_size = 0.03
    obj = bpy.data.objects.new(name, data)
    room.collection.objects.link(obj)
    obj.location = (x, y, z - 0.02)
    return obj


def point_light(room, pos, strength, color=(1.0, 0.8, 0.55), radius=0.05, name='lamp'):
    data = bpy.data.lights.new(name, 'POINT')
    data.energy = strength
    data.color = color
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    room.collection.objects.link(obj)
    obj.location = pos
    return obj


def strip_light(room, a, b, strength, color=(1.0, 0.78, 0.5), name='strip'):
    """LED strip: a thin emissive bar between two points (cove and shelf lighting)."""
    a, b = np.asarray(a), np.asarray(b)
    mat = room.emission(f'{name}-mat', color, strength)
    d = b - a
    length = float(np.linalg.norm(d))
    yaw = math.degrees(math.atan2(d[1], d[0]))
    m = frame(((a + b) / 2).tolist(), yaw)
    return room.box(name, m, (length, 0.012, 0.01), mat)


def sun(room, azimuth, elevation, strength=3.0, color=(1.0, 0.93, 0.82), angle=1.5):
    data = bpy.data.lights.new('sun', 'SUN')
    data.energy = strength
    data.color = color
    data.angle = math.radians(angle)
    obj = bpy.data.objects.new('sun', data)
    room.collection.objects.link(obj)
    # Light travels along local -z; aim it from (azimuth, elevation) towards the room.
    az, el = math.radians(azimuth), math.radians(elevation)
    to_sun = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
    obj.rotation_euler = to_sun.to_track_quat('Z', 'Y').to_euler()
    return obj


def world_hdri(name, strength=1.0, rotation=0.0, camera_strength=None):
    """Outdoor HDRI as the world: lights the room through openings and is what the windows show."""
    world = bpy.data.worlds.new('world')
    bpy.context.scene.world = world
    if not world.node_tree:
        world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    bg = next(n for n in nodes if n.type == 'BACKGROUND')
    out = next(n for n in nodes if n.type == 'OUTPUT_WORLD')
    path = os.path.join(ASSETS, 'hdri', f'{name}.hdr')
    if not os.path.exists(path):
        bg.inputs['Color'].default_value = (0.75, 0.82, 0.9, 1)
        bg.inputs['Strength'].default_value = strength
        return world
    env = nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(path, check_existing=True)
    coord = nodes.new('ShaderNodeTexCoord')
    mapn = nodes.new('ShaderNodeMapping')
    mapn.inputs['Rotation'].default_value = (0, 0, math.radians(rotation))
    links.new(coord.outputs['Generated'], mapn.inputs['Vector'])
    links.new(mapn.outputs['Vector'], env.inputs['Vector'])
    links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    if camera_strength is not None:
        # The view through the window can be brighter than the light it casts (overexposed look).
        bg2 = nodes.new('ShaderNodeBackground')
        links.new(env.outputs['Color'], bg2.inputs['Color'])
        bg2.inputs['Strength'].default_value = camera_strength
        lp = nodes.new('ShaderNodeLightPath')
        mix = nodes.new('ShaderNodeMixShader')
        links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
        links.new(bg.outputs['Background'], mix.inputs[1])
        links.new(bg2.outputs['Background'], mix.inputs[2])
        links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return world
