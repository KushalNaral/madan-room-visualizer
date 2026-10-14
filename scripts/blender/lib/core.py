"""Scene building blocks for the Blender room renders.

World axes: x to the right, y into the room (away from the default camera), z up; metres.
Swappable surfaces are built from parametric grids so the texture patch sent to the
visualizer is exactly the rendered geometry.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'assets')

# Most patches need far fewer control points than the render mesh.
MAX_PATCH_COLS = 32
MAX_PATCH_ROWS = 24


def frame(origin=(0, 0, 0), yaw=0.0, pitch=0.0, roll=0.0):
    """Local → world matrix. Yaw turns about z (degrees); local -y is the piece's front."""
    return (
        Matrix.Translation(Vector(origin))
        @ Matrix.Rotation(math.radians(yaw), 4, 'Z')
        @ Matrix.Rotation(math.radians(pitch), 4, 'X')
        @ Matrix.Rotation(math.radians(roll), 4, 'Y')
    )


def arc_length(points):
    d = np.diff(points, axis=0)
    return float(np.sum(np.linalg.norm(d, axis=1)))


class Room:
    def __init__(self, room_id):
        self.id = room_id
        self.surfaces = []
        self.patches = []
        self.collection = bpy.context.scene.collection
        self._materials = {}
        self._images = {}

    # ---------------------------------------------------------------- surfaces
    def surface(self, sid, label, accepts, group=None, kind=None):
        self.surfaces.append({'id': sid, 'label': label, 'accepts': accepts, 'group': group, 'kind': kind})
        return len(self.surfaces) - 1

    def surface_index(self, sid):
        return next(i for i, s in enumerate(self.surfaces) if s['id'] == sid)

    # ---------------------------------------------------------------- meshes
    def _link(self, name, mesh, mat, surface):
        obj = bpy.data.objects.new(name, mesh)
        self.collection.objects.link(obj)
        if mat is not None:
            mesh.materials.append(mat)
        obj.pass_index = surface + 1 if surface is not None and surface >= 0 else 0
        return obj

    def grid(self, name, pts, mat, surface=None, patch=True, smooth=True, uv_size=None):
        """Mesh from a (rows+1, cols+1, 3) grid of world points, u → right and v → down as seen
        from the front. UVs are in metres so tiling textures keep their real size."""
        pts = np.asarray(pts, dtype=np.float64)
        rows, cols = pts.shape[0] - 1, pts.shape[1] - 1
        w = uv_size[0] if uv_size else arc_length(pts[rows // 2])
        h = uv_size[1] if uv_size else arc_length(pts[:, cols // 2])
        verts = pts.reshape(-1, 3)
        idx = lambda i, j: j * (cols + 1) + i
        # Counter-clockwise seen from the front (v runs down the image).
        faces = [(idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)) for j in range(rows) for i in range(cols)]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts.tolist(), [], faces)
        uv = mesh.uv_layers.new(name='UVMap')
        loop_uv = []
        for f in faces:
            for k in f:
                i, j = k % (cols + 1), k // (cols + 1)
                loop_uv.append((i / cols * w, (1 - j / rows) * h))
        uv.data.foreach_set('uv', np.array(loop_uv, dtype=np.float32).ravel())
        if smooth:
            mesh.shade_smooth()
        obj = self._link(name, mesh, mat, surface)
        if surface is not None and surface >= 0 and patch:
            self.mesh_patch(surface, pts, w, h)
        return obj

    def mesh_patch(self, surface, pts, w=None, h=None):
        pts = np.asarray(pts, dtype=np.float64)
        rows, cols = pts.shape[0] - 1, pts.shape[1] - 1
        w = w if w is not None else arc_length(pts[rows // 2])
        h = h if h is not None else arc_length(pts[:, cols // 2])
        ci = np.unique(np.round(np.linspace(0, cols, min(cols, MAX_PATCH_COLS) + 1)).astype(int))
        ri = np.unique(np.round(np.linspace(0, rows, min(rows, MAX_PATCH_ROWS) + 1)).astype(int))
        sub = pts[np.ix_(ri, ci)]
        self.patches.append({
            'surface': surface, 'kind': 'mesh', 'cols': len(ci) - 1, 'rows': len(ri) - 1,
            'points': sub.reshape(-1, 3).tolist(), 'widthCm': w * 100, 'heightCm': h * 100,
        })

    def quad_patch(self, surface, tl, tr, br, bl):
        tl, tr, br, bl = (np.asarray(p, dtype=np.float64) for p in (tl, tr, br, bl))
        self.patches.append({
            'surface': surface, 'kind': 'quad', 'corners': [p.tolist() for p in (tl, tr, br, bl)],
            'widthCm': float(np.linalg.norm(tr - tl)) * 100, 'heightCm': float(np.linalg.norm(bl - tl)) * 100,
        })

    def quad(self, name, tl, tr, br, bl, mat, surface=None, patch=True, subdiv=1):
        tl, tr, br, bl = (np.asarray(p, dtype=np.float64) for p in (tl, tr, br, bl))
        n = subdiv
        u = np.linspace(0, 1, n + 1)[None, :, None]
        v = np.linspace(0, 1, n + 1)[:, None, None]
        top = tl + (tr - tl) * u
        bot = bl + (br - bl) * u
        pts = top + (bot - top) * v
        w, h = float(np.linalg.norm(tr - tl)), float(np.linalg.norm(bl - tl))
        obj = self.grid(name, pts, mat, surface, patch=False, smooth=False, uv_size=(w, h))
        if surface is not None and surface >= 0 and patch:
            self.quad_patch(surface, tl, tr, br, bl)
        return obj

    def rounded_box(self, name, m, size, mat, surface=None, round_=0.02, bulge=0.0, res=14, faces='fblrtd', patch=True,
                    sag=0.0):
        """Upholstered block: a box with rounded edges and puffed faces, built as one smooth
        mesh. `m` is the local→world frame of its bottom centre; local -y is the front.
        Each listed face registers its own texture patch."""
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        r = min(round_, hx * 0.95, hy * 0.95, hz * 0.95)
        inner = np.array([hx - r, hy - r, hz - r])
        # face: (centre axis, right axis, down axis) as unit vectors in local box coords, as seen from outside
        defs = {
            'f': ((0, -1, 0), (1, 0, 0), (0, 0, -1)),
            'b': ((0, 1, 0), (-1, 0, 0), (0, 0, -1)),
            'l': ((-1, 0, 0), (0, -1, 0), (0, 0, -1)),
            'r': ((1, 0, 0), (0, 1, 0), (0, 0, -1)),
            't': ((0, 0, 1), (1, 0, 0), (0, -1, 0)),
            'd': ((0, 0, -1), (1, 0, 0), (0, 1, 0)),
        }
        half = np.array([hx, hy, hz])
        all_v, all_f, all_uv, offset = [], [], [], 0
        mw = np.array(m)
        for key in faces:
            n, ra, da = (np.array(a, dtype=np.float64) for a in defs[key])
            ext_r = float(np.abs(ra) @ half)
            ext_d = float(np.abs(da) @ half)
            u = np.linspace(-1, 1, res + 1)
            uu, vv = np.meshgrid(u, u)  # rows = v, cols = u
            p = (n * (np.abs(n) @ half))[None, None, :] + uu[..., None] * ra * ext_r + vv[..., None] * da * ext_d
            # Round: clamp into the inner box and push out by r along the offset.
            c = np.clip(p, -inner, inner)
            off = p - c
            ln = np.linalg.norm(off, axis=-1, keepdims=True)
            ln[ln < 1e-9] = 1e-9
            p = c + off / ln * r
            if bulge:
                fall = (1 - uu ** 2) * (1 - vv ** 2)
                p = p + n * (bulge * fall)[..., None]
            if sag and key == 't':
                p = p - np.array([0, 0, 1.0]) * (sag * (1 - uu ** 2) * (1 - vv ** 2))[..., None]
            p = p + np.array([0, 0, hz])
            world = np.einsum('ij,rcj->rci', mw[:3, :3], p) + mw[:3, 3]
            rows = cols = res
            idx = lambda i, j: offset + j * (cols + 1) + i
            all_v.extend(world.reshape(-1, 3).tolist())
            fw = arc_length(world[rows // 2])
            fh = arc_length(world[:, cols // 2])
            for j in range(rows):
                for i in range(cols):
                    f = (idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j))
                    all_f.append(f)
                    for k in f:
                        kk = k - offset
                        all_uv.append(((kk % (cols + 1)) / cols * fw, (1 - (kk // (cols + 1)) / rows) * fh))
            offset += (rows + 1) * (cols + 1)
            if surface is not None and surface >= 0 and patch:
                self.mesh_patch(surface, world, fw, fh)
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(all_v, [], all_f)
        uv = mesh.uv_layers.new(name='UVMap')
        uv.data.foreach_set('uv', np.array(all_uv, dtype=np.float32).ravel())
        obj = self._link(name, mesh, mat, surface)
        # Weld the shared edges so shading runs smoothly across faces.
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.to_mesh(mesh)
        bm.free()
        mesh.shade_smooth()
        return obj

    def box(self, name, m, size, mat, bevel=0.0, surface=None):
        """Hard-surface block (frames, cabinets, legs). Not a texture patch."""
        hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
        v = [(-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0), (-hx, -hy, 2 * hz), (hx, -hy, 2 * hz), (hx, hy, 2 * hz), (-hx, hy, 2 * hz)]
        f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(v, [], f)
        obj = self._link(name, mesh, mat, surface)
        obj.matrix_world = m
        self._box_uv(obj, size)
        if bevel:
            mod = obj.modifiers.new('bevel', 'BEVEL')
            mod.width = bevel
            mod.segments = 3
            mod.limit_method = 'NONE'
            mod.harden_normals = True
            mesh.shade_smooth()
        return obj

    def _box_uv(self, obj, size):
        mesh = obj.data
        uv = mesh.uv_layers.new(name='UVMap')
        coords = []
        for poly in mesh.polygons:
            n = poly.normal
            ax = max(range(3), key=lambda k: abs(n[k]))
            a, b = [(1, 2), (0, 2), (0, 1)][ax]
            for li in poly.loop_indices:
                co = mesh.vertices[mesh.loops[li].vertex_index].co
                coords.append((co[a], co[b]))
        uv.data.foreach_set('uv', np.array(coords, dtype=np.float32).ravel())

    def cylinder(self, name, m, r0, r1, height, mat, segments=32, cap=True, surface=None):
        verts, faces = [], []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            verts.append((r0 * math.cos(a), r0 * math.sin(a), 0))
            verts.append((r1 * math.cos(a), r1 * math.sin(a), height))
        for k in range(segments):
            a, b = 2 * k, 2 * ((k + 1) % segments)
            faces.append((a, b, b + 1, a + 1))
        if cap:
            faces.append(tuple(2 * k for k in reversed(range(segments))))
            faces.append(tuple(2 * k + 1 for k in range(segments)))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(verts, [], faces)
        obj = self._link(name, mesh, mat, surface)
        obj.matrix_world = m
        uv = mesh.uv_layers.new(name='UVMap')
        coords = []
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                co = mesh.vertices[mesh.loops[li].vertex_index].co
                coords.append((math.atan2(co[1], co[0]) * max(r0, r1), co[2]))
        uv.data.foreach_set('uv', np.array(coords, dtype=np.float32).ravel())
        mesh.shade_smooth()
        if cap:
            for poly in mesh.polygons[-2:]:
                poly.use_smooth = False
        return obj

    def tube(self, name, points, radius, mat, segments=12):
        """Swept circle along a polyline (lamp arms, rods)."""
        curve = bpy.data.curves.new(name, 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = radius
        curve.bevel_resolution = max(2, segments // 4)
        sp = curve.splines.new('POLY')
        sp.points.add(len(points) - 1)
        for p, q in zip(sp.points, points):
            p.co = (q[0], q[1], q[2], 1)
        obj = bpy.data.objects.new(name, curve)
        self.collection.objects.link(obj)
        curve.materials.append(mat)
        return obj

    # ---------------------------------------------------------------- materials
    def image(self, path, colorspace='sRGB'):
        key = (path, colorspace)
        if key not in self._images:
            img = bpy.data.images.load(path, check_existing=True)
            img.colorspace_settings.name = colorspace
            self._images[key] = img
        return self._images[key]

    def material(self, name, color=(0.8, 0.8, 0.8), roughness=0.6, texture=None, tile=1.0, tint_strength=1.0,
                 detail=1.0, normal=0.6, sheen=0.0, sheen_tint=None, metallic=0.0, coat=0.0, specular=0.5,
                 emission=None, emission_strength=0.0, alpha=1.0, translucent=0.0, rotate=0.0, keep_texture_color=False,
                 bump_noise=0.0, noise_scale=400.0):
        """Principled material. With `texture` (a Poly Haven texture id) its luminance detail is
        kept and recoloured to `color` (unless keep_texture_color), tiled every `tile` metres."""
        if name in self._materials:
            return self._materials[name]
        mat = bpy.data.materials.new(name)
        nt = mat.node_tree if mat.node_tree else None
        if nt is None:
            mat.use_nodes = True
            nt = mat.node_tree
        nodes, links = nt.nodes, nt.links
        bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
        out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
        col = tuple(color) + (1.0,) if len(color) == 3 else tuple(color)
        bsdf.inputs['Base Color'].default_value = col
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Specular IOR Level'].default_value = specular
        if sheen:
            bsdf.inputs['Sheen Weight'].default_value = sheen
            bsdf.inputs['Sheen Roughness'].default_value = 0.5
            if sheen_tint:
                bsdf.inputs['Sheen Tint'].default_value = tuple(sheen_tint) + (1.0,)
        if coat:
            bsdf.inputs['Coat Weight'].default_value = coat
            bsdf.inputs['Coat Roughness'].default_value = 0.08
        if emission is not None:
            bsdf.inputs['Emission Color'].default_value = tuple(emission) + (1.0,)
            bsdf.inputs['Emission Strength'].default_value = emission_strength
        tex_dir = os.path.join(ASSETS, 'textures', texture) if texture else None
        if tex_dir and os.path.isdir(tex_dir):
            uvn = nodes.new('ShaderNodeTexCoord')
            mapn = nodes.new('ShaderNodeMapping')
            mapn.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1)
            mapn.inputs['Rotation'].default_value = (0, 0, math.radians(rotate))
            links.new(uvn.outputs['UV'], mapn.inputs['Vector'])
            diff_path = os.path.join(tex_dir, 'diff.jpg')
            if os.path.exists(diff_path):
                diff = nodes.new('ShaderNodeTexImage')
                diff.image = self.image(diff_path)
                links.new(mapn.outputs['Vector'], diff.inputs['Vector'])
                if keep_texture_color:
                    mix = nodes.new('ShaderNodeMix')
                    mix.data_type = 'RGBA'
                    mix.blend_type = 'MULTIPLY'
                    mix.inputs['Factor'].default_value = tint_strength
                    links.new(diff.outputs['Color'], mix.inputs['A'])
                    mix.inputs['B'].default_value = col
                    links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
                else:
                    # Keep the texture's light/dark detail around 1.0, then colour it.
                    bw = nodes.new('ShaderNodeRGBToBW')
                    links.new(diff.outputs['Color'], bw.inputs['Color'])
                    avg = _image_mean_luma(diff.image)
                    gain = nodes.new('ShaderNodeMath')
                    gain.operation = 'MULTIPLY'
                    gain.inputs[1].default_value = 1 / max(avg, 0.02)
                    links.new(bw.outputs['Val'], gain.inputs[0])
                    lerp = nodes.new('ShaderNodeMix')
                    lerp.data_type = 'FLOAT'
                    lerp.inputs['A'].default_value = 1.0
                    lerp.inputs['Factor'].default_value = detail
                    links.new(gain.outputs['Value'], lerp.inputs['B'])
                    mul = nodes.new('ShaderNodeMix')
                    mul.data_type = 'RGBA'
                    mul.blend_type = 'MULTIPLY'
                    mul.inputs['Factor'].default_value = 1.0
                    mul.inputs['A'].default_value = col
                    links.new(lerp.outputs['Result'], mul.inputs['B'])
                    links.new(mul.outputs['Result'], bsdf.inputs['Base Color'])
            rough_path = os.path.join(tex_dir, 'rough.jpg')
            if os.path.exists(rough_path) and roughness is not None:
                rimg = nodes.new('ShaderNodeTexImage')
                rimg.image = self.image(rough_path, 'Non-Color')
                links.new(mapn.outputs['Vector'], rimg.inputs['Vector'])
                # Scale the map so its average lands on `roughness`.
                avg = _image_mean_luma(rimg.image)
                rm = nodes.new('ShaderNodeMath')
                rm.operation = 'MULTIPLY'
                rm.use_clamp = True
                rm.inputs[1].default_value = roughness / max(avg, 0.05)
                links.new(rimg.outputs['Color'], rm.inputs[0])
                links.new(rm.outputs['Value'], bsdf.inputs['Roughness'])
            nor_path = os.path.join(tex_dir, 'nor.jpg')
            if os.path.exists(nor_path) and normal > 0:
                nimg = nodes.new('ShaderNodeTexImage')
                nimg.image = self.image(nor_path, 'Non-Color')
                links.new(mapn.outputs['Vector'], nimg.inputs['Vector'])
                nmap = nodes.new('ShaderNodeNormalMap')
                nmap.inputs['Strength'].default_value = normal
                links.new(nimg.outputs['Color'], nmap.inputs['Color'])
                links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
        elif bump_noise:
            noise = nodes.new('ShaderNodeTexNoise')
            noise.inputs['Scale'].default_value = noise_scale
            noise.inputs['Detail'].default_value = 4
            bump = nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = bump_noise
            links.new(noise.outputs['Fac'], bump.inputs['Height'])
            links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
        surf = bsdf.outputs['BSDF']
        if translucent or alpha < 1:
            # Sheer fabric: diffuse + back-lit translucency + see-through holes.
            tr = nodes.new('ShaderNodeBsdfTranslucent')
            tr.inputs['Color'].default_value = col
            m1 = nodes.new('ShaderNodeMixShader')
            m1.inputs['Fac'].default_value = translucent
            links.new(surf, m1.inputs[1])
            links.new(tr.outputs['BSDF'], m1.inputs[2])
            surf = m1.outputs['Shader']
            if alpha < 1:
                tp = nodes.new('ShaderNodeBsdfTransparent')
                m2 = nodes.new('ShaderNodeMixShader')
                m2.inputs['Fac'].default_value = alpha
                links.new(tp.outputs['BSDF'], m2.inputs[1])
                links.new(surf, m2.inputs[2])
                surf = m2.outputs['Shader']
        links.new(surf, out.inputs['Surface'])
        self._materials[name] = mat
        return mat

    def emission(self, name, color, strength):
        if name in self._materials:
            return self._materials[name]
        mat = bpy.data.materials.new(name)
        if not mat.node_tree:
            mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        for n in list(nodes):
            if n.type == 'BSDF_PRINCIPLED':
                nodes.remove(n)
        out = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
        em = nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = tuple(color) + (1.0,)
        em.inputs['Strength'].default_value = strength
        links.new(em.outputs['Emission'], out.inputs['Surface'])
        self._materials[name] = mat
        return mat

    # ---------------------------------------------------------------- assets
    def place(self, model, location, yaw=0.0, height=None, scale=None, width=None, name=None, tint=None):
        """Imports a Poly Haven glTF model, standing on `location` (its lowest point), turned by
        `yaw`, scaled to `height`/`width` metres (or `scale`). Returns the root empty or None."""
        path = os.path.join(ASSETS, 'models', model, f'{model}.gltf')
        if not os.path.exists(path):
            print(f'[room] missing asset {model}; skipped')
            return None
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        meshes = [o for o in new if o.type == 'MESH']
        bpy.context.view_layer.update()
        corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
        lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
        hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
        size = hi - lo
        s = scale or 1.0
        if height:
            s = height / max(size.z, 1e-6)
        elif width:
            s = width / max(size.x, size.y, 1e-6)
        root = bpy.data.objects.new(name or model, None)
        self.collection.objects.link(root)
        centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
        for o in new:
            if o.parent is None:
                o.parent = root
                o.matrix_parent_inverse = Matrix.Translation(-centre)
        root.matrix_world = frame(location, yaw) @ Matrix.Scale(s, 4)
        for o in meshes:
            o.pass_index = 0
        return root

    def remember(self, **meta):
        self.meta = meta


def _image_mean_luma(img):
    """Average luminance of an image (sampled), for normalising texture detail."""
    try:
        px = np.empty(len(img.pixels), dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)[::97]
        return float(np.mean(px[:, 0] * 0.2126 + px[:, 1] * 0.7152 + px[:, 2] * 0.0722))
    except Exception:
        return 0.5
