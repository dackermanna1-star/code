#!/usr/bin/env python3
"""Chinatown vehicles, props, objective pickups, HUD icons and menu art.

Builds (SPEC section 3.3):
  sprites  V*** vehicles (8 rotations; VHEL frames A+B), P*** props
           (8 rotations or rotation 0 as the SPEC table says), I*** pickups
           (rotation 0)                     -> build/ct/lumps/sprites/
  graphics CTIGAS CTIPLG CTITOR (HUD key-item icons, 24x24), M_EPICT
           (menu entry "Chinatown" in the DOOM menu font), CTTITLE (320x200
           title card)                      -> build/ct/lumps/graphics/
  previews contact sheets and per-sprite strips -> build/ct/previews/props/

How it works: this script runs under the system python3 (numpy + PIL). It
unpacks/downloads the CC0 sources into build/ct/cache (prop_ph_*/,
props_src/), draws a few helper textures with PIL, then runs itself under a
Python that has Blender as a module (bpy; path from $CT_BPY) as a worker
that builds each model in a "thing frame" (x forward, y left, z up, 1 Blender
unit = 1 map unit, origin = ground centre) and renders it with Cycles,
orthographic, at SS x the final resolution. Back here the renders are box-
downsampled, alpha-thresholded, darkened on the silhouette edge, quantized
to PLAYPAL (no dithering) and encoded as DOOM pictures.

Rotation convention (checked against src/render/view.js, see
--test-rotations): rotation r (1..8) is the image a viewer sees when looking
along angle pi + (r-1)*pi/4 in the thing's frame, i.e. 1 = front, 3 = the
thing's left side (it faces screen-left), 5 = back, 7 = its right side.

Usage:
  python3 tools/ct/render_props.py                 # everything
  python3 tools/ct/render_props.py --only VPOL,PCON # some sprites (+graphics unless --no-graphics)
  python3 tools/ct/render_props.py --no-render     # re-encode from cached renders
  python3 tools/ct/render_props.py --test-rotations
Env: CT_BPY (python with bpy), CT_CACHE, CT_THREADS (render threads, default 3),
     CT_SAMPLES (Cycles samples, default 20).
"""

import json
import math
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
BUILD = os.path.join(ROOT, 'build', 'ct')
CACHE = os.environ.get('CT_CACHE', os.path.join(BUILD, 'cache'))
SRC = os.path.join(CACHE, 'props_src')
PREV = os.path.join(BUILD, 'previews', 'props')
RAW = os.path.join(PREV, 'raw')
WORK = os.path.join(PREV, 'work')
CREDITS = os.path.join(HERE, 'credits', 'props.md')
DEFAULT_BPY = '/tmp/claude-0/-home-user-code/2139ba89-9871-5bc9-a1b9-3df0ca0d94e2/scratchpad/bpyvenv/bin/python'

UPM = 40.0          # map units per metre for real-size models
SS = 3              # supersampling factor of the renders

KENNEY_ZIP = os.path.join(CACHE, 'veh_kenney_car_kit', 'kenney_car-kit.zip')
KENNEY_DIR = os.path.join(SRC, 'kenney_car_kit')
KENNEY_GLB = os.path.join(KENNEY_DIR, 'Models', 'GLB format')

PH_MODELS = [
    'concrete_road_barrier', 'fire_hydrant', 'metal_trash_can', 'korean_public_payphone_01',
    'street_lamp_01', 'portable_generator', 'vintage_radio_transceiver', 'portable_welding_cart',
    'metal_jerrycan', 'propane_torch_02', 'small_wooden_table_01',
]


def ph_dir(pid):
    return os.path.join(CACHE, 'prop_ph_' + pid)


def ph_gltf(pid):
    return os.path.join(ph_dir(pid), pid + '_1k.gltf')


# ---------------------------------------------------------------------------
# Sprite table. Sizes are map units (1 px = 1 unit).
#   rot: 8 = eight rotations rendered from the side (elevation 0, so the
#        silhouettes also suit the voxelizer); 0 = one view, `el` degrees
#        above the horizon, from `yaw` degrees round from the front.
# ---------------------------------------------------------------------------

def V(name, model, dims, **kw):
    d = dict(name=name, build='kenney', model=model, dims=dims, rot=8)
    d.update(kw)
    return d


SPRITES = [
    # Kenney Car Kit vehicles. paint = (row, col) of the colormap swatch that
    # holds the body paint and the sRGB colour it becomes.
    V('VPOL', 'police', (196, 80, 66), lights='police'),
    V('VAMB', 'ambulance', (236, 92, 106), lights='ambulance', paint=((1, 6), (178, 34, 28))),
    V('VTAX', 'taxi', (190, 78, 66), paint=((1, 4), (226, 168, 28))),
    V('VVAN', 'van', (206, 84, 88), paint=((1, 7), (186, 182, 170))),
    V('VPCK', 'truck', (214, 86, 74), paint=((1, 3), (164, 140, 100))),
    V('VSED', 'sedan', (186, 78, 58), paint=((1, 6), (150, 36, 30))),
    V('VSUV', 'suv', (196, 84, 78), paint=((1, 3), (84, 84, 90))),
    V('VTRK', 'delivery', (300, 100, 138), paint=((1, 3), (196, 190, 176))),
    V('VFTR', 'firetruck', (340, 100, 130), lights='fire', paint=((1, 6), (170, 26, 20))),
    V('VGRB', 'garbage-truck', (320, 104, 132), paint=((1, 3), (196, 196, 186))),
    # Humvee pick-up: what 6 of the map's 9 military vehicles are (NMRiH's
    # car_humvee_pick-up, footprint 190x92 in tools/ct/layout/ref.json); the
    # 290-long cargo truck (build='military') overhung those footprints by 50
    # units at each end.
    V('VMIL', 'truck', (192, 92, 74), build='humvee', mono=(86, 92, 52), wheel=1.08),
    dict(name='VHEL', build='heli', rot=8, frames='AB'),
    # Props
    dict(name='PBAR', build='ph', ph='concrete_road_barrier', rot=8, size=('y', 62), tint=1.0, sat=0.45),
    dict(name='PSAW', build='sawhorse', rot=8),
    dict(name='PCON', build='cone', rot=0, el=14, yaw=-25),
    dict(name='PGEN', build='generator', rot=8),
    dict(name='PRAD', build='radio', rot=8),
    dict(name='PWLD', build='ph', ph='portable_welding_cart', rot=8, size=('z', 64)),
    dict(name='PTRA', build='trashcan', rot=0, el=12, yaw=-20),
    dict(name='PHYD', build='hydrant', rot=0, el=10, yaw=-30),
    dict(name='PPHN', build='payphone', rot=8),
    dict(name='PBEN', build='bench', rot=8),
    dict(name='PLMP', build='lamp', rot=0, el=0, yaw=-90),
    dict(name='PLNT', build='lantern', rot=0, el=0, yaw=0, fullbright=True),
    dict(name='PCRT', build='crate', rot=0, el=16, yaw=-32),
    dict(name='PPAL', build='pallets', rot=0, el=16, yaw=-28),
    # Objective pickups
    dict(name='IGAS', build='ph', ph='metal_jerrycan', rot=0, el=22, yaw=-40, size=('z', 24), tint=1.15, sat=1.2,
         grade=dict(gain=1.1, sat=1.3)),
    dict(name='IPLG', build='plug', rot=0, el=34, yaw=-20),
    dict(name='ITOR', build='torch', rot=0, el=20, yaw=-30, grade=dict(gain=1.1, sat=1.7)),
]

# HUD icons: rendered from the pickup models, 3/4 view from above.
ICONS = [
    dict(name='CTIGAS', of='IGAS', el=28, yaw=-40, grade=dict(gain=1.2, sat=1.35)),
    dict(name='CTIPLG', of='IPLG', el=45, yaw=-20, grade=dict(gain=1.1, sat=1.1)),
    dict(name='CTITOR', of='ITOR', el=24, yaw=-35, roll=-28, grade=dict(gain=1.15, sat=1.7)),
]


# ===========================================================================
# bpy worker
# ===========================================================================

def bpy_worker(job_path):
    import bpy
    import bmesh
    import numpy as np
    from mathutils import Matrix, Vector

    job = json.load(open(job_path))
    G = dict(bpy=bpy)

    # ---------------------------------------------------------------- scene
    def reset():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        sc.render.engine = 'CYCLES'
        sc.cycles.device = 'CPU'
        sc.cycles.samples = int(job.get('samples', 20))
        sc.cycles.use_adaptive_sampling = False
        sc.cycles.use_denoising = False
        sc.cycles.max_bounces = 4
        sc.cycles.diffuse_bounces = 2
        sc.cycles.glossy_bounces = 2
        sc.cycles.transmission_bounces = 2
        sc.cycles.transparent_max_bounces = 8
        sc.cycles.filter_width = 1.0
        sc.render.threads_mode = 'FIXED'
        sc.render.threads = int(job.get('threads', 3))
        sc.render.film_transparent = True
        sc.view_settings.view_transform = 'Standard'
        sc.view_settings.look = 'None'
        sc.render.image_settings.file_format = 'PNG'
        sc.render.image_settings.color_mode = 'RGBA'
        sc.render.image_settings.color_depth = '8'
        w = bpy.data.worlds.new('w')
        sc.world = w
        try:
            w.use_nodes = True
        except Exception:
            pass
        bg = w.node_tree.nodes.get('Background')
        bg.inputs['Color'].default_value = (0.055, 0.06, 0.075, 1)
        bg.inputs['Strength'].default_value = 1.0
        return sc

    def link(o):
        bpy.context.scene.collection.objects.link(o)
        return o

    def meshes():
        return [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.hide_render]

    def import_model(path):
        before = set(bpy.data.objects)
        if path.lower().endswith(('.glb', '.gltf')):
            bpy.ops.import_scene.gltf(filepath=path)
        else:
            bpy.ops.import_scene.fbx(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        # Bake every transform into the mesh data, so all objects sit in
        # world space with identity matrices.
        mws = {o: o.matrix_world.copy() for o in new}
        for o in new:
            if o.type == 'MESH':
                if o.data.users > 1:
                    o.data = o.data.copy()
                o.data.transform(mws[o])
                if mws[o].determinant() < 0:
                    o.data.flip_normals()
        out = []
        for o in new:
            if o.type == 'MESH':
                o.parent = None
                o.matrix_world = Matrix.Identity(4)
                out.append(o)
        for o in new:
            if o.type != 'MESH':
                bpy.data.objects.remove(o, do_unlink=True)
        for o in out:
            fix_materials(o)
        return out

    def fix_materials(o):
        for m in o.data.materials:
            if not m or not m.use_nodes:
                continue
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    if not n.inputs['Alpha'].is_linked:
                        n.inputs['Alpha'].default_value = 1.0
                    for k in ('Transmission Weight', 'Transmission'):
                        if k in n.inputs and not n.inputs[k].is_linked:
                            n.inputs[k].default_value = 0.0

    def verts_of(objs):
        pts = []
        for o in objs:
            me = o.data
            a = np.empty(len(me.vertices) * 3, dtype=np.float64)
            me.vertices.foreach_get('co', a)
            a = a.reshape(-1, 3)
            if o.matrix_world != Matrix.Identity(4):
                M = np.array(o.matrix_world)
                a = a @ M[:3, :3].T + M[:3, 3]
            pts.append(a)
        return np.concatenate(pts) if pts else np.zeros((0, 3))

    def bounds(objs):
        p = verts_of(objs)
        return p.min(0), p.max(0)

    def xform(objs, M):
        for o in objs:
            o.data.transform(M)
            if M.determinant() < 0:
                o.data.flip_normals()

    def T(x=0, y=0, z=0):
        return Matrix.Translation((x, y, z))

    def S(x, y=None, z=None):
        y = x if y is None else y
        z = x if z is None else z
        return Matrix.Diagonal((x, y, z, 1))

    def Rz(deg):
        return Matrix.Rotation(math.radians(deg), 4, 'Z')

    def Rx(deg):
        return Matrix.Rotation(math.radians(deg), 4, 'X')

    def Ry(deg):
        return Matrix.Rotation(math.radians(deg), 4, 'Y')

    def ground_centre(objs, centre_xy=True):
        mn, mx = bounds(objs)
        cx, cy = (mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2
        xform(objs, T(-cx if centre_xy else 0, -cy if centre_xy else 0, -mn[2]))

    def fit(objs, axis, size, front='-Y', centre=True):
        """Scale uniformly so the extent along axis ('x','y','z') is size; turn
        the model's front to +X; put its footprint centre on the origin."""
        if front == '-Y':
            xform(objs, Rz(90))
        elif front == '+Y':
            xform(objs, Rz(-90))
        elif front == '-X':
            xform(objs, Rz(180))
        mn, mx = bounds(objs)
        i = 'xyz'.index(axis)
        k = size / (mx[i] - mn[i])
        xform(objs, S(k))
        if centre:
            ground_centre(objs)
        return k

    def smooth(o, on=True):
        for p in o.data.polygons:
            p.use_smooth = on

    # ------------------------------------------------------------ primitives
    def from_bm(name, bm, mat=None, sm=False):
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        o = link(bpy.data.objects.new(name, me))
        if mat is not None:
            me.materials.append(mat)
        if sm:
            smooth(o)
        return o

    def cube(name, size, loc=(0, 0, 0), mat=None, M=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        X = T(*loc) @ (M or Matrix.Identity(4)) @ S(*size)
        bmesh.ops.transform(bm, matrix=X, verts=bm.verts)
        return from_bm(name, bm, mat)

    def cyl(name, r1, r2, depth, loc=(0, 0, 0), mat=None, M=None, segs=24, sm=True, caps=True):
        """Cylinder/cone along z, centred on loc (before M)."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs,
                              radius1=r1, radius2=r2, depth=depth)
        X = T(*loc) @ (M or Matrix.Identity(4))
        bmesh.ops.transform(bm, matrix=X, verts=bm.verts)
        o = from_bm(name, bm, mat)
        if sm:
            for p in o.data.polygons:
                p.use_smooth = abs(p.normal.z) < 0.7
        return o

    def sphere(name, r, loc=(0, 0, 0), scale=(1, 1, 1), mat=None, u=24, v=16):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
        bmesh.ops.transform(bm, matrix=T(*loc) @ S(*scale), verts=bm.verts)
        return from_bm(name, bm, mat, sm=True)

    def tube(name, pts, r, mat=None, segs=10, closed=False):
        """Sweep a circle of radius r along the polyline pts."""
        pts = [Vector(p) for p in pts]
        bm = bmesh.new()
        rings = []
        n = len(pts)
        for i, p in enumerate(pts):
            if closed:
                t = (pts[(i + 1) % n] - pts[i - 1])
            else:
                t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)])
            t.normalize()
            a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            u = t.cross(a).normalized()
            w = t.cross(u).normalized()
            ring = []
            for k in range(segs):
                ang = 2 * math.pi * k / segs
                ring.append(bm.verts.new(p + r * (math.cos(ang) * u + math.sin(ang) * w)))
            rings.append(ring)
        rng = range(n) if closed else range(n - 1)
        for i in rng:
            a, b = rings[i], rings[(i + 1) % n]
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
        if not closed:
            bm.faces.new(list(reversed(rings[0])))
            bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return from_bm(name, bm, mat, sm=True)

    def loft(name, stations, nring=24, mat=None, cap=True):
        """Superellipse cross-sections along x. stations: list of
        (x, half_width, z_bottom, z_top, exponent)."""
        bm = bmesh.new()
        rings = []
        for (x, hw, zb, zt, ex) in stations:
            zc, hh = (zb + zt) / 2, (zt - zb) / 2
            ring = []
            for k in range(nring):
                ang = 2 * math.pi * k / nring
                c, s = math.cos(ang), math.sin(ang)
                y = hw * math.copysign(abs(c) ** (2 / ex), c)
                z = zc + hh * math.copysign(abs(s) ** (2 / ex), s)
                ring.append(bm.verts.new((x, y, z)))
            rings.append(ring)
        for i in range(len(rings) - 1):
            a, b = rings[i], rings[i + 1]
            for k in range(nring):
                bm.faces.new((a[k], a[(k + 1) % nring], b[(k + 1) % nring], b[k]))
        if cap:
            bm.faces.new(rings[0])
            bm.faces.new(list(reversed(rings[-1])))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return from_bm(name, bm, mat, sm=True)

    # ------------------------------------------------------------- materials
    def srgb2lin(c):
        c = np.asarray(c, dtype=np.float64)
        return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

    def lin(rgb):
        return tuple(float(v) for v in srgb2lin(np.array(rgb[:3]) / 255.0))

    def new_mat(name):
        m = bpy.data.materials.new(name)
        try:
            m.use_nodes = True
        except Exception:
            pass
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        return m, nt, bsdf

    def mat(name, rgb, rough=0.6, metal=0.0, emit=None, strength=0.0, spec=0.5):
        m, nt, b = new_mat(name)
        b.inputs['Base Color'].default_value = (*lin(rgb), 1)
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        if 'Specular IOR Level' in b.inputs:
            b.inputs['Specular IOR Level'].default_value = spec
        if emit is not None:
            b.inputs['Emission Color'].default_value = (*lin(emit), 1)
            b.inputs['Emission Strength'].default_value = strength
        return m

    def node(nt, kind, **inputs):
        n = nt.nodes.new(kind)
        for k, v in inputs.items():
            if k.startswith('_'):
                setattr(n, k[1:], v)
            else:
                n.inputs[k].default_value = v
        return n

    def grime(nt, color_socket, scale=0.07, lo=0.72, z_dirt=None):
        """Multiply a colour by mottled dirt (object space) and darken toward
        the ground below z_dirt."""
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = node(nt, 'ShaderNodeTexNoise', Scale=scale, Detail=4.0)
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mr = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.3, 'From Max': 0.75, 'To Min': lo, 'To Max': 1.0})
        nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
        f = mr.outputs['Result']
        if z_dirt:
            sep = nt.nodes.new('ShaderNodeSeparateXYZ')
            nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
            mz = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': z_dirt, 'To Min': 0.62, 'To Max': 1.0})
            nt.links.new(sep.outputs['Z'], mz.inputs['Value'])
            mm = node(nt, 'ShaderNodeMath', _operation='MULTIPLY')
            nt.links.new(f, mm.inputs[0])
            nt.links.new(mz.outputs['Result'], mm.inputs[1])
            f = mm.outputs['Value']
        vm = node(nt, 'ShaderNodeVectorMath', _operation='SCALE')
        nt.links.new(color_socket, vm.inputs[0])
        nt.links.new(f, vm.inputs['Scale'])
        return vm.outputs['Vector']

    def mat_vcol(name, rough=0.5, z_dirt=None, grime_lo=0.84):
        m, nt, b = new_mat(name)
        a = node(nt, 'ShaderNodeAttribute', _attribute_name='Col')
        out = grime(nt, a.outputs['Color'], scale=0.12, lo=grime_lo, z_dirt=z_dirt)
        nt.links.new(out, b.inputs['Base Color'])
        e = node(nt, 'ShaderNodeAttribute', _attribute_name='emit')
        nt.links.new(e.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = 1.0
        b.inputs['Roughness'].default_value = rough
        # weak specular: grey sky reflections wash dark paint out to brown
        if 'Specular IOR Level' in b.inputs:
            b.inputs['Specular IOR Level'].default_value = 0.22
        return m

    def mat_grimy(name, rgb, rough=0.6, metal=0.0, scale=0.07, lo=0.7, z_dirt=None):
        m, nt, b = new_mat(name)
        rgbn = node(nt, 'ShaderNodeRGB')
        rgbn.outputs[0].default_value = (*lin(rgb), 1)
        out = grime(nt, rgbn.outputs[0], scale=scale, lo=lo, z_dirt=z_dirt)
        nt.links.new(out, b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        return m

    def mat_wood(name, light, dark, axis='X', scale=0.25, rough=0.8):
        """Procedural planks grain: wave bands along `axis` + noise."""
        m, nt, b = new_mat(name)
        tc = nt.nodes.new('ShaderNodeTexCoord')
        wave = node(nt, 'ShaderNodeTexWave', Scale=scale, Distortion=6.0, Detail=3.0)
        wave.wave_type = 'BANDS'
        wave.bands_direction = axis if axis in ('X', 'Y', 'Z') else 'X'
        nt.links.new(tc.outputs['Object'], wave.inputs['Vector'])
        nz = node(nt, 'ShaderNodeTexNoise', Scale=0.35, Detail=5.0)
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mx = node(nt, 'ShaderNodeMath', _operation='MULTIPLY')
        nt.links.new(wave.outputs['Fac'], mx.inputs[0])
        nt.links.new(nz.outputs['Fac'], mx.inputs[1])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (*lin(dark), 1)
        ramp.color_ramp.elements[1].color = (*lin(light), 1)
        ramp.color_ramp.elements[0].position = 0.05
        ramp.color_ramp.elements[1].position = 0.55
        nt.links.new(mx.outputs['Value'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = rough
        return m

    def mat_image(name, path, size, offset=(0, 0, 0), plane='XZ', rough=0.6, emit=0.0, flip_back=True, metal=0.0):
        """Image projected along the third axis in object space; size/offset
        map the image onto the rectangle [offset - size/2, offset + size/2].
        Faces looking the other way get the image mirrored back so text reads
        correctly from both sides."""
        m, nt, b = new_mat(name)
        img = bpy.data.images.load(path, check_existing=True)
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.interpolation = 'Linear'
        tex.extension = 'CLIP'
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
        a0, a1 = plane[0], plane[1]
        ax = {'X': 0, 'Y': 1, 'Z': 2}
        u = node(nt, 'ShaderNodeMapRange', **{'From Min': offset[ax[a0]] - size[0] / 2, 'From Max': offset[ax[a0]] + size[0] / 2})
        v = node(nt, 'ShaderNodeMapRange', **{'From Min': offset[ax[a1]] - size[1] / 2, 'From Max': offset[ax[a1]] + size[1] / 2})
        nt.links.new(sep.outputs[ax[a0]], u.inputs['Value'])
        nt.links.new(sep.outputs[ax[a1]], v.inputs['Value'])
        uo = u.outputs['Result']
        if flip_back:
            # third axis of the normal: < 0 means a back face; mirror u.
            third = 3 - ax[a0] - ax[a1]
            geo = nt.nodes.new('ShaderNodeNewGeometry')
            ns = nt.nodes.new('ShaderNodeSeparateXYZ')
            nt.links.new(geo.outputs['Normal'], ns.inputs['Vector'])
            # Seen from the +third side, screen-right is +a0 for plane YZ but
            # -a0 for plane XZ; mirror u on the faces that would read backwards.
            lt = node(nt, 'ShaderNodeMath', _operation='GREATER_THAN' if plane == 'XZ' else 'LESS_THAN')
            lt.inputs[1].default_value = 0.0
            nt.links.new(ns.outputs[third], lt.inputs[0])
            one_minus = node(nt, 'ShaderNodeMath', _operation='SUBTRACT')
            one_minus.inputs[0].default_value = 1.0
            nt.links.new(uo, one_minus.inputs[1])
            mix = node(nt, 'ShaderNodeMix')
            mix.data_type = 'FLOAT'
            nt.links.new(lt.outputs['Value'], mix.inputs['Factor'])
            nt.links.new(uo, mix.inputs[2])
            nt.links.new(one_minus.outputs['Value'], mix.inputs[3])
            uo = mix.outputs[0]
        cxyz = nt.nodes.new('ShaderNodeCombineXYZ')
        nt.links.new(uo, cxyz.inputs['X'])
        nt.links.new(v.outputs['Result'], cxyz.inputs['Y'])
        nt.links.new(cxyz.outputs['Vector'], tex.inputs['Vector'])
        nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        if emit:
            nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
            b.inputs['Emission Strength'].default_value = emit
        return m

    def mat_box_image(name, path, size, rough=0.75):
        """Image box-projected onto each face of an axis-aligned box of the
        given size centred at the object origin (offset in z by size/2)."""
        m, nt, b = new_mat(name)
        img = bpy.data.images.load(path, check_existing=True)
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.projection = 'BOX'
        tex.projection_blend = 0.0
        tc = nt.nodes.new('ShaderNodeTexCoord')
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (1 / size[0], 1 / size[1], 1 / size[2])
        mp.inputs['Location'].default_value = (0.5, 0.5, 0.0)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        nt.links.new(mp.outputs['Vector'], tex.inputs['Vector'])
        nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = rough
        return m

    def tint_materials(objs, mul=1.0, sat=1.0):
        """Scale the base colour of imported textured materials (darken /
        desaturate) via a Hue/Saturation/Value node."""
        done = set()
        for o in objs:
            for m in o.data.materials:
                if not m or m.name in done or not m.use_nodes:
                    continue
                done.add(m.name)
                nt = m.node_tree
                for b in [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED']:
                    s = b.inputs['Base Color']
                    if not s.is_linked:
                        c = s.default_value
                        s.default_value = (c[0] * mul, c[1] * mul, c[2] * mul, 1)
                        continue
                    src = s.links[0].from_socket
                    hsv = nt.nodes.new('ShaderNodeHueSaturation')
                    hsv.inputs['Saturation'].default_value = sat
                    hsv.inputs['Value'].default_value = mul
                    nt.links.new(src, hsv.inputs['Color'])
                    nt.links.new(hsv.outputs['Color'], s)

    # ---------------------------------------------------- Kenney vehicles
    KCOL = {}

    def kenney_colormap():
        if 'px' not in KCOL:
            img = bpy.data.images.load(os.path.join(job['kenney'], 'Textures', 'colormap.png'))
            w, h = img.size
            px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3]
            KCOL['px'] = srgb2lin(px)
            KCOL['wh'] = (w, h)
            # mean colour of each 8x4 swatch (rows counted from the top)
            means = {}
            for r in range(4):
                for c in range(8):
                    y0 = h - (r + 1) * h // 4
                    sw = KCOL['px'][y0:y0 + h // 4, c * w // 8:(c + 1) * w // 8]
                    means[(r, c)] = sw.reshape(-1, 3).mean(0)
            KCOL['means'] = means
        return KCOL

    def luma(c):
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

    def kenney_vehicle(spec):
        L, W, H = spec['dims']
        objs = import_model(os.path.join(job['kenney'], spec['model'] + '.glb'))
        xform(objs, Rz(90))                     # front -Y -> +X
        wheels = [o for o in objs if o.name.startswith('wheel-') and o.name != 'wheel-back']
        body = [o for o in objs if o not in wheels]
        mn, mx = bounds(objs)
        sx, sy, sz = L / (mx[0] - mn[0]), W / (mx[1] - mn[1]), H / (mx[2] - mn[2])
        cx, cy = (mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2
        xform(objs, T(-cx, -cy, -mn[2]))
        xform(body, S(sx, sy, sz))
        kw = spec.get('wheel', 1.0)
        for o in wheels:
            wmn, wmx = bounds([o])
            c = (wmn + wmx) / 2
            r0 = (wmx[2] - wmn[2]) / 2
            r = r0 * sz * kw
            k = r / r0
            M = T(c[0] * sx, c[1] * sy, r) @ S(k, min(sy, k * 1.15), k) @ T(*(-c))
            xform([o], M)
        kenney_colorize(objs, spec)
        ground_centre(objs)
        return objs

    def kenney_colorize(objs, spec):
        km = kenney_colormap()
        px, (w, h), means = km['px'], km['wh'], km['means']
        mn, mx = bounds(objs)
        hl, H = (mx[0] - mn[0]) / 2, mx[2]
        paint = spec.get('paint')
        mono = spec.get('mono')
        lights = spec.get('lights')
        m = mat_vcol('kenney_' + spec['name'], z_dirt=H * 0.45)
        for o in objs:
            me = o.data
            uvl = me.uv_layers.active.data
            col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
            emi = me.attributes.new('emit', 'FLOAT_COLOR', 'CORNER')
            is_wheel = o.name.startswith('wheel')
            for p in me.polygons:
                us = [uvl[li].uv for li in p.loop_indices]
                uc = sum(u[0] for u in us) / len(us)
                vc = sum(u[1] for u in us) / len(us)
                cell = (min(3, int((1 - vc) * 4)), min(7, int(uc * 8)))
                cen = p.center
                front = cen.x > hl * 0.55
                rear = cen.x < -hl * 0.55
                roof = cen.z > H * 0.8
                for li in p.loop_indices:
                    u, v = uvl[li].uv
                    sxp = min(w - 1, max(0, int(u * w)))
                    syp = min(h - 1, max(0, int(v * h)))
                    c = px[syp, sxp].copy()
                    e = np.zeros(3)
                    if cell == (3, 0) and not is_wheel:            # glass
                        c = np.array(lin((40, 48, 58)))
                    elif cell == (3, 1) and not is_wheel:          # head / indicator lights
                        if front:
                            c = np.array(lin((255, 240, 200)))
                            e = np.array(lin((255, 236, 180))) * 2.5
                        else:
                            c = np.array(lin((255, 150, 40)))
                            e = c * 0.8
                    elif cell == (3, 2) and not is_wheel:          # red: tail lights / light bar
                        c = np.array(lin((230, 30, 20)))
                        if roof:
                            e = np.array(lin((255, 40, 20))) * 4
                        else:
                            e = np.array(lin((255, 30, 15))) * 1.2
                    elif cell == (3, 3) and not is_wheel:          # blue: light bars / strobes
                        if lights == 'police':
                            c = np.array(lin((40, 80, 255)))
                            e = np.array(lin((60, 110, 255))) * (5 if roof else 2)
                        else:
                            c = np.array(lin((240, 40, 25)))
                            e = np.array(lin((255, 50, 25))) * (4 if roof else 2)
                    elif mono is not None and cell not in ((2, 2),) and not is_wheel:
                        f = (luma(c) / 0.35) ** 0.6
                        c = np.array(lin(mono)) * min(f, 1.6)
                    elif paint is not None and cell == tuple(paint[0]):
                        base = means[cell]
                        f = luma(c) / max(1e-4, luma(base))
                        c = np.array(lin(paint[1])) * min(1.4, f)
                    elif cell == (2, 3):                            # dark trim / black paint
                        c = c * 0.55
                    else:
                        g = luma(c)
                        c = (g + (c - g) * 0.8) * 0.92
                    col.data[li].color = (*np.clip(c, 0, 1), 1)
                    emi.data[li].color = (*e, 1)
            o.data.materials.clear()
            o.data.materials.append(m)
            if not is_wheel:
                smooth(o, False)

    def build_kenney(spec):
        kenney_vehicle(spec)

    def build_military(spec):
        objs = kenney_vehicle(spec)
        L, W, H = spec['dims']
        # Cargo bed with a canvas tarp over hoops behind the cab.
        mn, mx = bounds(objs)
        olive = mat_grimy('olive', spec['mono'], rough=0.7, scale=0.12, lo=0.84, z_dirt=H * 0.5)
        canvas = mat_grimy('canvas', (100, 98, 62), rough=0.95, scale=0.08, lo=0.78)
        pts = verts_of(objs)
        # Kenney delivery-flat: the cab is the front 1.15 of 3.25 model units.
        cab_back = mx[0] - L * 1.15 / 3.25
        deck = pts[(pts[:, 0] < cab_back - 4)][:, 2].max()
        x0, x1 = mn[0] + 1, cab_back - 3
        bl = x1 - x0
        side_h = 16
        cube('bed', (bl, W - 4, side_h), ((x0 + x1) / 2, 0, deck + side_h / 2), olive)
        top = H - 2
        zr = deck + side_h
        cube('tarp_box', (bl - 2, W - 6, 14), ((x0 + x1) / 2, 0, zr + 7), canvas)
        r = (W - 6) / 2
        t = cyl('tarp_top', r, r, bl - 2, ((x0 + x1) / 2, 0, zr + 14), canvas,
                M=Ry(90) @ S(1, 1, 1), segs=28)
        xform([t], T((x0 + x1) / 2, 0, zr + 14) @ S(1, 1, (top - zr - 14) / r) @ T(-(x0 + x1) / 2, 0, -(zr + 14)))
        # cut the lower half of the tarp cylinder (hidden inside the box anyway)
        ground_centre(meshes(), centre_xy=False)

    def build_humvee(spec):
        """Olive humvee pick-up: the Kenney pickup squat and wide, a canvas
        cover over the bed, a brush guard, a roof ring and blackout lights."""
        objs = kenney_vehicle(spec)
        L, W, H = spec['dims']
        mn, mx = bounds(objs)
        canvas = mat_grimy('hmv_canvas', (128, 118, 80), rough=0.95, scale=0.08, lo=0.78)
        dark = mat('hmv_dark', (30, 32, 26), rough=0.7, metal=0.2)
        olive = mat_grimy('hmv_olive', spec['mono'], rough=0.75, scale=0.12, lo=0.82, z_dirt=H * 0.5)
        pts = verts_of(objs)
        # Kenney truck: the cab ends 1.72 of the 2.95 model units behind the nose.
        cab_back = mx[0] - L * 1.72 / 2.95
        bed = pts[(pts[:, 0] < cab_back - 4) & (pts[:, 0] > mn[0] + 4)]
        rail = float(bed[:, 2].max())
        x0, x1 = mn[0] + 2, cab_back - 1
        bl, cz0, cz1 = x1 - x0, rail - 3, H * 0.9
        cube('cover', (bl, W - 10, cz1 - cz0 - 6), ((x0 + x1) / 2, 0, (cz0 + cz1 - 6) / 2), canvas)
        r = (W - 10) / 2
        t = cyl('cover_top', r, r, bl, ((x0 + x1) / 2, 0, cz1 - 6), canvas, M=Ry(90), segs=28)
        xform([t], T((x0 + x1) / 2, 0, cz1 - 6) @ S(1, 1, 6 / r) @ T(-(x0 + x1) / 2, 0, -(cz1 - 6)))
        # brush guard in front of the grille
        for y in (-W * 0.3, W * 0.3):
            cube('guard_v%d' % (y > 0), (2.5, 2.5, 20), (mx[0] + 2, y, 24), dark)
        cube('guard_h', (2.5, W * 0.66, 2.5), (mx[0] + 2, 0, 33), dark)
        cube('guard_l', (2.5, W * 0.66, 2.5), (mx[0] + 2, 0, 18), dark)
        # gunner's ring on the cab roof
        cyl('ring', 13, 13, 3, (cab_back + 26, 0, H + 1.5), olive, segs=20)
        cyl('hatch', 10, 10, 4, (cab_back + 26, 0, H + 2), dark, segs=16)
        ground_centre(meshes(), centre_xy=False)

    # --------------------------------------------------------- helicopter
    def build_heli(spec):
        u = UPM
        white = mat_grimy('heli_white', (206, 204, 196), rough=0.35, scale=0.03, lo=0.86)
        red = mat_grimy('heli_red', (196, 52, 26), rough=0.4, scale=0.03, lo=0.8)
        dark = mat('heli_dark', (40, 42, 46), rough=0.5, metal=0.3)
        glass = mat('heli_glass', (30, 44, 60), rough=0.08, spec=0.9)
        metal = mat('heli_metal', (120, 122, 126), rough=0.35, metal=0.8)
        beacon = mat('heli_beacon', (255, 40, 20), emit=(255, 40, 20), strength=6)
        lamp = mat('heli_lamp', (255, 250, 230), emit=(255, 246, 220), strength=6)
        stencil = mat_image('heli_text', job['tex']['heli_text'], (2.0 * u, 0.42 * u), offset=(-0.25 * u, 0, 1.0 * u), plane='XZ', rough=0.4)
        # Fuselage (Bell 206-like), metres -> units
        st = [(-1.60, 0.30, 0.55, 1.75, 2.6), (-1.20, 0.55, 0.42, 2.00, 2.8), (-0.4, 0.66, 0.38, 2.12, 3.0),
              (0.6, 0.66, 0.38, 2.05, 3.0), (1.4, 0.60, 0.42, 1.88, 2.6), (2.0, 0.48, 0.50, 1.62, 2.4),
              (2.4, 0.30, 0.62, 1.38, 2.2), (2.62, 0.08, 0.80, 1.12, 2.0)]
        body = loft('fuselage', [(x * u, w * u, b * u, t * u, e) for x, w, b, t, e in st], 32, white)
        # Glass: canopy region = upper front.
        me = body.data
        me.materials.append(glass)
        me.materials.append(red)
        for p in me.polygons:
            c = p.center / u
            if c.x > 1.15 and c.z > 1.05 and not (abs(c.y) < 0.06 and c.z > 1.6):
                p.material_index = 1
            elif c.x > 0.2 and c.x < 1.1 and c.z > 1.15 and c.z < 1.85 and abs(p.normal.y) > 0.5:
                p.material_index = 1          # side door windows
            elif c.z < 0.62:
                p.material_index = 2          # red belly stripe
        # Engine cowling + exhaust
        loft('cowling', [(x * u, w * u, b * u, t * u, 2.4) for x, w, b, t in
                         [(-1.9, 0.18, 1.7, 2.1), (-1.5, 0.36, 1.7, 2.45), (-0.2, 0.42, 1.9, 2.55), (0.5, 0.36, 1.9, 2.38), (0.9, 0.18, 1.9, 2.15)]], 20, white)
        cyl('exhaust', 0.11 * u, 0.13 * u, 0.4 * u, (-1.85 * u, 0, 2.15 * u), dark, M=Ry(-70))
        # Tail boom, fins
        boom = loft('boom', [(x * u, r * u, (z - r) * u, (z + r) * u, 2.0) for x, r, z in
                             [(-1.6, 0.30, 1.40), (-3.5, 0.20, 1.55), (-5.6, 0.13, 1.70), (-6.0, 0.12, 1.72)]], 16, white)
        boom.data.materials.append(red)
        for p in boom.data.polygons:
            if p.center.x < -4.6 * u:
                p.material_index = 1
        # vertical fin (swept)
        bm = bmesh.new()
        fin = [(-5.55, 1.70), (-6.2, 1.72), (-6.55, 2.75), (-6.2, 2.75)]
        lower = [(-5.7, 1.62), (-6.15, 1.62), (-6.3, 1.0), (-6.1, 1.0)]
        for poly in (fin, lower):
            vs = [bm.verts.new((x * u, 0.04 * u * s, z * u)) for s in (-1, 1) for x, z in poly]
            n = len(poly)
            bm.faces.new(vs[:n])
            bm.faces.new(list(reversed(vs[n:])))
            for k in range(n):
                bm.faces.new((vs[k], vs[(k + 1) % n], vs[n + (k + 1) % n], vs[n + k]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        from_bm('fins', bm, red)
        cube('stab', (0.45 * u, 2.0 * u, 0.05 * u), (-4.7 * u, 0, 1.62 * u), red)
        for s in (-1, 1):
            cube('stabfin%d' % s, (0.4 * u, 0.04 * u, 0.4 * u), (-4.75 * u, s * 1.0 * u, 1.68 * u), red)
        # Skids
        for s in (-1, 1):
            y = s * 0.95 * u
            tube('skid%d' % s, [(-1.5 * u, y, 0.05 * u), (1.6 * u, y, 0.05 * u), (1.95 * u, y, 0.22 * u)], 0.05 * u, metal, segs=8)
            for x in (-0.9, 0.9):
                tube('strut%d%d' % (s, x), [(x * u, y, 0.05 * u), (x * u, y * 0.82, 0.35 * u), (x * u, y * 0.45, 0.55 * u)], 0.045 * u, metal, segs=8)
        # Lights
        sphere('beacon', 0.08 * u, (-1.0 * u, 0, 2.62 * u), mat=beacon)
        sphere('lamp', 0.12 * u, (2.2 * u, 0, 0.55 * u), (1, 1, 0.6), mat=lamp)
        # Text panels on both sides of the cabin ("RESCUE")
        for s in (-1, 1):
            cube('text%d' % s, (2.0 * u, 0.02 * u, 0.42 * u), (-0.25 * u, s * 0.652 * u, 1.0 * u), stencil)
        # Rotor mast + hub
        cyl('mast', 0.08 * u, 0.08 * u, 0.5 * u, (0, 0, 2.78 * u), metal)
        cyl('hub', 0.22 * u, 0.22 * u, 0.12 * u, (0, 0, 3.02 * u), dark)
        # Main rotor: 2 blades (rotated per frame) + a dashed blur disc
        blades = [cube('blade%d' % i, (5.0 * u, 0.3 * u, 0.06 * u), (2.6 * u, 0, 3.05 * u), dark) for i in range(1)]
        b2 = cube('blade_b', (5.0 * u, 0.3 * u, 0.06 * u), (-2.6 * u, 0, 3.05 * u), dark)
        blades.append(b2)
        blur = mat_dashes('rotor_blur', 14, (60, 62, 66))
        disc = cyl('disc', 5.1 * u, 5.1 * u, 0.05 * u, (0, 0, 3.05 * u), blur, segs=96, sm=False)
        # Tail rotor (left side of the boom), 2 blades + blur disc
        tx, tz, ty = -6.15 * u, 1.95 * u, 0.16 * u
        tblur = mat_dashes('tail_blur', 12, (70, 72, 76), axes=('X', 'Z'), centre=(tx, tz))
        tdisc = cyl('tdisc', 0.8 * u, 0.8 * u, 0.03 * u, (0, 0, 0), tblur, M=Rx(90), segs=48, sm=False)
        xform([tdisc], T(tx, ty, tz))
        tbl = cube('tblade', (0.12 * u, 0.04 * u, 1.55 * u), (tx, ty + 0.03 * u, tz), dark)
        G['heli'] = dict(blades=blades, disc=disc, tdisc=tdisc, tbl=tbl, centre=(tx, ty, tz))
        # The mast stays on the origin (the thing's centre); skids on z=0.
        for o in blades + [disc, tdisc, tbl]:
            o['rest'] = [tuple(v.co) for v in o.data.vertices]
            o.visible_shadow = False      # no striped rotor shadows on the body

    def mat_dashes(name, nseg, rgb, axes=('X', 'Y'), centre=(0.0, 0.0)):
        """Angular dash pattern round `centre` in the plane of `axes` (object
        space): opaque/transparent sectors; seen edge-on this gives a dashed
        line, face-on spokes."""
        m, nt, b = new_mat(name)
        b.inputs['Base Color'].default_value = (*lin(rgb), 1)
        b.inputs['Roughness'].default_value = 0.6
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Object'], sep.inputs['Vector'])
        ca = node(nt, 'ShaderNodeMath', _operation='SUBTRACT')
        ca.inputs[1].default_value = centre[0]
        nt.links.new(sep.outputs[axes[0]], ca.inputs[0])
        cb = node(nt, 'ShaderNodeMath', _operation='SUBTRACT')
        cb.inputs[1].default_value = centre[1]
        nt.links.new(sep.outputs[axes[1]], cb.inputs[0])
        at = node(nt, 'ShaderNodeMath', _operation='ARCTAN2')
        nt.links.new(cb.outputs['Value'], at.inputs[0])
        nt.links.new(ca.outputs['Value'], at.inputs[1])
        mul = node(nt, 'ShaderNodeMath', _operation='MULTIPLY')
        mul.inputs[1].default_value = nseg / (2 * math.pi)
        nt.links.new(at.outputs['Value'], mul.inputs[0])
        add = node(nt, 'ShaderNodeMath', _operation='ADD')
        add.name = 'phase'
        add.inputs[1].default_value = 0.0
        nt.links.new(mul.outputs['Value'], add.inputs[0])
        fr = node(nt, 'ShaderNodeMath', _operation='FRACT')
        nt.links.new(add.outputs['Value'], fr.inputs[0])
        lt = node(nt, 'ShaderNodeMath', _operation='LESS_THAN')
        lt.inputs[1].default_value = 0.5
        nt.links.new(fr.outputs['Value'], lt.inputs[0])
        nt.links.new(lt.outputs['Value'], b.inputs['Alpha'])
        return m

    def heli_frame(frame):
        h = G['heli']
        ang = {'A': 25.0, 'B': 115.0}[frame]
        # rotate blades about the hub (x=y=0 after centring)
        mn, mx = bounds([o for o in meshes() if o.name == 'mast'])
        hx, hy = (mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2
        for o in h['blades']:
            rest = o['rest']
            R = Rz(ang)
            for v, r in zip(o.data.vertices, rest):
                p = Vector(r) - Vector((hx, hy, 0))
                v.co = (R @ p) + Vector((hx, hy, 0))
            o.data.update()
        # tail blade about its hub (axis y)
        cx = (bounds([h['tdisc']])[0] + bounds([h['tdisc']])[1]) / 2
        R = Ry(ang * 1.7)
        for v, r in zip(h['tbl'].data.vertices, h['tbl']['rest']):
            p = Vector(r) - Vector(cx)
            v.co = (R @ p) + Vector(cx)
        h['tbl'].data.update()
        for o, ph in ((h['disc'], 0.5), (h['tdisc'], 0.5)):
            add = o.data.materials[0].node_tree.nodes['phase']
            add.inputs[1].default_value = 0.0 if frame == 'A' else ph

    # --------------------------------------------------------- PH props
    def build_ph(spec):
        objs = import_model(job['ph'][spec['ph']])
        keep = spec.get('keep')
        if keep:
            for o in list(objs):
                if not any(o.name.startswith(k) for k in keep):
                    bpy.data.objects.remove(o, do_unlink=True)
            objs = meshes()
        axis, size = spec.get('size', ('z', 40))
        fit(objs, axis, size, front=spec.get('front', '-Y'))
        tint_materials(objs, spec.get('tint', 0.9), spec.get('sat', 0.9))
        return objs

    def build_hydrant(spec):
        objs = import_model(job['ph']['fire_hydrant'])
        for o in list(objs):
            if 'aged' in o.name:
                bpy.data.objects.remove(o, do_unlink=True)
        objs = meshes()
        fit(objs, 'z', 34, front='-Y')
        tint_materials(objs, 0.95, 1.0)

    def build_trashcan(spec):
        objs = import_model(job['ph']['metal_trash_can'])
        for o in list(objs):
            if 'rust' not in o.name:
                bpy.data.objects.remove(o, do_unlink=True)
        objs = meshes()
        # lid: lying against the can -> put it on top
        lid = [o for o in objs if o.name.endswith('_lid')][0]
        can = [o for o in objs if o.name == 'metal_trash_can_rust'][0]
        cmn, cmx = bounds([can])
        lmn, lmx = bounds([lid])
        lc = (lmn + lmx) / 2
        # the lid stands on its rim, rotated about y; lay it flat
        xform([lid], T(-lc[0], -lc[1], -lc[2]))
        lmn2, lmx2 = bounds([lid])
        if (lmx2[2] - lmn2[2]) > (lmx2[0] - lmn2[0]):
            # find rotation that makes it flat: try +/-90 about y, keep the
            # one whose dome points up
            for ang in (90, -90):
                xform([lid], Ry(ang))
                pts = verts_of([lid])
                if pts[:, 2].max() - 0 > -pts[:, 2].min():
                    break
                xform([lid], Ry(-ang))
        lmn3, lmx3 = bounds([lid])
        xform([lid], T((cmn[0] + cmx[0]) / 2, (cmn[1] + cmx[1]) / 2, cmx[2] - lmn3[2] - 2.0 * 0.01))
        objs = meshes()
        fit(objs, 'z', 38, front='-Y')
        tint_materials(objs, 1.1, 0.9)

    def build_lamp(spec):
        objs = import_model(job['ph']['street_lamp_01'])
        for o in objs:
            for i, m in enumerate(o.data.materials):
                if m and ('glass' in m.name or 'bulb' in m.name):
                    o.data.materials[i] = mat('lamp_glow', (255, 226, 160), rough=0.2, emit=(255, 214, 140), strength=3.0)
        fit(objs, 'z', 220, front='-Y')
        tint_materials(objs, 1.0, 1.0)

    def build_cone(spec):
        orange = mat_grimy('cone_orange', (236, 92, 20), rough=0.5, scale=0.25, lo=0.8, z_dirt=8)
        white = mat_grimy('cone_white', (228, 228, 222), rough=0.35, scale=0.25, lo=0.8)
        black = mat('cone_base', (28, 28, 30), rough=0.85)
        cube('base', (20, 20, 2.2), (0, 0, 1.1), black)
        z0, z1, r0, r1 = 2.2, 28.0, 8.0, 1.6
        rad = lambda z: r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        for i, (a, b, m) in enumerate(((z0, 10, orange), (10, 13.5, white), (13.5, 16.5, orange),
                                        (16.5, 19.5, white), (19.5, z1, orange))):
            cyl('cone%d' % i, rad(a), rad(b), b - a, (0, 0, (a + b) / 2), m, segs=28)

    def build_sawhorse(spec):
        blue = mat_grimy('saw_blue', (40, 66, 140), rough=0.7, scale=0.1, lo=0.7, z_dirt=20)
        board = mat_image('saw_board', job['tex']['saw_board'], (92, 12), offset=(0, 0, 37), plane='YZ', rough=0.6)
        # board along y (the barricade blocks sideways), legs splayed in x
        L = 92
        cube('board', (2.2, L, 12), (0, 0, 37), board)
        for s in (-1, 1):
            y = s * (L / 2 - 8)
            for t in (-1, 1):
                # leg from top (x=0) splaying to x = t*13 at the ground
                top = Vector((t * 1.2, y, 42))
                bot = Vector((t * 13.0, y, 0))
                d = top - bot
                ln = d.length
                ang = math.degrees(math.atan2(d.x, d.z))
                cube('leg%d%d' % (s, t), (2.2, 3.2, ln), ((top.x + bot.x) / 2, y, ln / 2 * math.cos(math.radians(ang))), blue, M=Ry(ang))
            cube('brace%d' % s, (20, 1.6, 2.2), (0, y, 12), blue)
        cube('top', (6, L - 6, 2.5), (0, 0, 44), blue)
        ground_centre(meshes())

    def build_generator(spec):
        objs = import_model(job['ph']['portable_generator'])
        fit(objs, 'x', 60, front='-Y', centre=True)
        tint_materials(objs, 0.9, 0.95)
        steel = mat_grimy('trl_steel', (70, 72, 70), rough=0.55, metal=0.5, scale=0.08, lo=0.6)
        tyre = mat('trl_tyre', (24, 24, 24), rough=0.9)
        rim = mat('trl_rim', (150, 150, 145), rough=0.4, metal=0.7)
        deck_z = 22
        xform(objs, T(-10, 0, deck_z + 2))
        cube('deck', (96, 56, 3), (-8, 0, deck_z + 0.5), steel)
        for s in (-1, 1):
            cube('rail%d' % s, (96, 3, 5), (-8, s * 27, deck_z + 4), steel)
            # wheel + fender
            cyl('tyre%d' % s, 12, 12, 7, (0, s * 33, 12), tyre, M=Rx(90), segs=24)
            cyl('rim%d' % s, 6.5, 6.5, 7.6, (0, s * 33, 12), rim, M=Rx(90), segs=16)
            cube('fender%d' % s, (30, 9, 1.6), (0, s * 33, 26), steel)
            cube('fenderf%d' % s, (1.6, 9, 8), (15, s * 33, 22), steel)
            cube('fenderb%d' % s, (1.6, 9, 8), (-15, s * 33, 22), steel)
        # jerrycan-sized fuel tank and a toolbox in front of the generator
        cube('tank', (16, 40, 14), (34, 0, deck_z + 9), mat_grimy('tank', (180, 120, 30), rough=0.5, scale=0.1, lo=0.75))
        # A-frame drawbar to a hitch at the front
        for s in (-1, 1):
            tube('bar%d' % s, [(40, s * 26, deck_z - 1), (72, 0, deck_z - 3)], 1.6, steel, segs=8)
        cyl('hitch', 3, 3, 3, (74, 0, deck_z - 3), steel, segs=12)
        cyl('jack', 1.5, 1.5, 22, (64, 0, 11), steel, segs=10)
        cyl('jackwheel', 3, 3, 2, (64, 0, 3), tyre, M=Rx(90), segs=12)
        ground_centre(meshes())

    def build_radio(spec):
        tbl = import_model(job['ph']['small_wooden_table_01'])
        xform(tbl, Rz(90))
        mn, mx = bounds(tbl)
        xform(tbl, T(-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]))
        mn, mx = bounds(tbl)
        xform(tbl, S(30 / (mx[0] - mn[0]), 44 / (mx[1] - mn[1]), 30 / (mx[2] - mn[2])))
        tint_materials(tbl, 1.0, 0.9)
        rad = import_model(job['ph']['vintage_radio_transceiver'])
        for o in list(rad):
            if 'cable' in o.name or 'morse' in o.name or 'plug' in o.name:
                bpy.data.objects.remove(o, do_unlink=True)
        rad = [o for o in meshes() if o.name.startswith('vintage')]
        xform(rad, Rz(90))
        k = 3.0 * UPM
        xform(rad, S(k))
        mn, mx = bounds(rad)
        xform(rad, T(-(mn[0] + mx[0]) / 2 + 1, -(mn[1] + mx[1]) / 2, 30 - mn[2]))
        tint_materials(rad, 1.15, 1.0)
        ground_centre(meshes())

    def build_payphone(spec):
        objs = import_model(job['ph']['korean_public_payphone_01'])
        fit(objs, 'z', 30, front='-Y', centre=False)
        mn, mx = bounds(objs)
        xform(objs, T(-mn[0] - 3, -(mn[1] + mx[1]) / 2, 36 - mn[2]))
        tint_materials(objs, 1.1, 1.0)
        steel = mat_grimy('pp_steel', (172, 174, 172), rough=0.35, metal=0.8, scale=0.1, lo=0.6, z_dirt=30)
        dark = mat_grimy('pp_dark', (44, 46, 50), rough=0.6, scale=0.1, lo=0.7)
        sign = mat_image('pp_sign', job['tex']['phone_sign'], (34, 9), offset=(0, 0, 84.5), plane='YZ', rough=0.5, emit=0.8)
        cube('post', (6, 6, 36), (-1, 0, 18), dark)
        cube('base', (12, 12, 2), (-1, 0, 1), dark)
        cube('back', (2, 34, 46), (-4, 0, 55), steel)
        for s in (-1, 1):
            cube('wing%d' % s, (9, 1.5, 46), (0.5, s * 16.5, 55), steel)
        cube('roof', (12, 36, 2), (1, 0, 79), steel)
        cube('signbox', (6, 34, 9), (-1, 0, 84.5), sign)
        cube('shelf', (8, 26, 1.5), (3, 0, 34), steel)
        ground_centre(meshes())

    def build_bench(spec):
        wood = mat_wood('bench_wood', (128, 86, 50), (62, 40, 24), axis='Y', scale=0.6)
        iron = mat_grimy('bench_iron', (30, 40, 32), rough=0.5, metal=0.6, scale=0.1, lo=0.7)
        L = 74
        # seat slats along y; sitter faces +x
        for i, x in enumerate((7, 2.5, -2, -6.5)):
            cube('seat%d' % i, (3.6, L, 1.4), (x, 0, 17), wood)
        for i, z in enumerate((22, 26.5, 31)):
            cube('back%d' % i, (1.4, L, 3.4), (-9.5 - (z - 22) * 0.12, 0, z), wood)
        for s in (-1, 1):
            y = s * (L / 2 - 6)
            cube('legf%d' % s, (1.8, 2.0, 17), (8, y, 8.5), iron)
            cube('legb%d' % s, (1.8, 2.0, 32), (-9, y, 16), iron, M=Ry(-6))
            cube('rail%d' % s, (19, 2.0, 1.8), (-0.5, y, 16), iron)
            cube('arm%d' % s, (14, 2.2, 1.6), (2, y, 25), iron)
            cube('armpost%d' % s, (1.6, 2.0, 9), (8, y, 20.5), iron)
        ground_centre(meshes())

    def build_crate(spec):
        m = mat_box_image('crate', job['tex']['crate'], (40, 40, 40), rough=0.85)
        cube('crate', (40, 40, 40), (0, 0, 20), m)
        ground_centre(meshes())

    def build_pallets(spec):
        import random
        rnd = random.Random(7)
        wood = mat_wood('pallet_wood', (150, 120, 84), (78, 60, 40), axis='X', scale=0.5)
        wood2 = mat_wood('pallet_wood2', (128, 104, 76), (64, 52, 38), axis='X', scale=0.5)
        z = 0.0
        for k in range(5):
            m = wood if k % 2 == 0 else wood2
            parts = []
            dx, dy, rz = rnd.uniform(-1.5, 1.5), rnd.uniform(-1.5, 1.5), rnd.uniform(-4, 4)
            for i, y in enumerate((-18, 0, 18)):
                parts.append(cube('blk%d%d' % (k, i), (48, 4, 3.6), (0, y, z + 2.6), m))
            for i, y in enumerate((-18.5, -11, -3.7, 3.7, 11, 18.5)):
                parts.append(cube('top%d%d' % (k, i), (48, 4.6, 1.1), (0, y, z + 4.95), m))
            for i, x in enumerate((-21, 0, 21)):
                parts.append(cube('bot%d%d' % (k, i), (5, 40, 0.9), (x, 0, z + 0.45), m))
            xform(parts, T(dx, dy, 0) @ Rz(rz))
            z += 5.5
        ground_centre(meshes())

    def build_lantern(spec):
        tex = mat_image('lantern_paper', job['tex']['lantern'], (26, 22), offset=(0, 0, 28), plane='YZ',
                        rough=0.7, emit=1.6, flip_back=True)
        gold = mat('lantern_gold', (220, 168, 60), rough=0.35, metal=0.8, emit=(200, 140, 40), strength=0.6)
        black = mat('lantern_cord', (20, 16, 14), rough=0.8)
        tassel = mat('lantern_tassel', (230, 40, 20), rough=0.8, emit=(230, 40, 20), strength=0.8)
        body = sphere('paper', 13, (0, 0, 28), (1, 1, 0.82), mat=tex, u=32, v=20)
        # ribs: slight vertical grooves by scaling vertices radially
        for vtx in body.data.vertices:
            p = vtx.co
            a = math.atan2(p.y, p.x)
            k = 1.0 - 0.035 * (0.5 + 0.5 * math.cos(a * 16))
            p.x *= k
            p.y *= k
        cyl('cap_top', 6, 6, 3, (0, 0, 38.5), gold, segs=20)
        cyl('cap_bot', 6, 6, 3, (0, 0, 17.5), gold, segs=20)
        cyl('knot', 1.5, 1.5, 3, (0, 0, 14.5), gold, segs=10)
        cyl('tassel', 1.4, 3.2, 10, (0, 0, 8), tassel, segs=14)
        # short cord: with the sprite's bottom on the origin its top is
        # ~41 units up, i.e. just inside the ceiling for info.height 40
        cyl('cord', 0.6, 0.6, 4, (0, 0, 42), black, segs=8)
        ground_centre(meshes())

    def build_plug(spec):
        cable = mat_grimy('cable', (214, 110, 24), rough=0.5, scale=0.3, lo=0.75)
        black = mat('plugblack', (34, 34, 36), rough=0.5)
        brass = mat('prong', (220, 190, 110), rough=0.3, metal=0.9)
        # coil: several loops of an orange extension cord lying on the floor
        pts = []
        turns, n = 4, 200
        for i in range(n):
            t = i / (n - 1)
            a = t * turns * 2 * math.pi
            r = 10 + 0.9 * math.sin(a * 0.5) + (t - 0.5) * 1.2
            pts.append((r * math.cos(a), r * 0.92 * math.sin(a), 1.1 + 1.5 * t + 0.6 * math.sin(a * 2.0)))
        # trailing end to the plug
        last = pts[-1]
        pts += [(last[0] + 2, last[1] - 3, 1.2), (7, -16, 1.2), (13, -18, 1.5)]
        tube('cord', pts, 1.1, cable, segs=8)
        cube('plug', (6.5, 5.0, 3.6), (16.6, -18.9, 2.0), black, M=Rz(-15))
        for s in (-1, 1):
            cube('prong%d' % s, (3.4, 0.6, 1.5), (21.0 + 0.45 * s, -19.9 + 1.1 * s, 2.0), brass, M=Rz(-15))
        ground_centre(meshes())

    def build_torch(spec):
        objs = import_model(job['ph']['propane_torch_02'])
        xform(objs, S(1.7, 1.7, 1.0))      # chunkier than life, so it reads at sprite size
        fit(objs, 'z', 30, front='-Y')
        tint_materials(objs, 1.15, 1.15)
        # a blue hot flame at the nozzle would read as "lit": keep it off.

    def build_marker(spec):
        """Asymmetric test object: arrow to +x (front), red block on +y
        (its left), green block on -y (its right), tall post front-left."""
        white = mat('m_white', (220, 220, 220), rough=0.6)
        red = mat('m_red', (230, 30, 20), rough=0.6)
        green = mat('m_green', (30, 200, 40), rough=0.6)
        blue = mat('m_blue', (40, 60, 230), rough=0.6)
        cube('base', (60, 20, 10), (0, 0, 5), white)
        bm = bmesh.new()
        vs = [bm.verts.new(v) for v in ((30, -16, 0), (52, 0, 0), (30, 16, 0), (30, -16, 14), (52, 0, 14), (30, 16, 14))]
        bm.faces.new((vs[0], vs[1], vs[2]))
        bm.faces.new((vs[5], vs[4], vs[3]))
        for a, b in ((0, 1), (1, 2), (2, 0)):
            bm.faces.new((vs[a], vs[b], vs[b + 3], vs[a + 3]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        from_bm('arrow', bm, white)
        cube('left', (16, 14, 26), (-10, 20, 13), red)
        cube('right', (16, 14, 12), (-10, -20, 6), green)
        cube('post', (6, 6, 44), (24, 16, 22), blue)

    BUILDERS = {
        'kenney': build_kenney, 'military': build_military, 'humvee': build_humvee, 'heli': build_heli, 'ph': build_ph,
        'hydrant': build_hydrant, 'trashcan': build_trashcan, 'lamp': build_lamp, 'cone': build_cone,
        'sawhorse': build_sawhorse, 'generator': build_generator, 'radio': build_radio,
        'payphone': build_payphone, 'bench': build_bench, 'crate': build_crate, 'pallets': build_pallets,
        'lantern': build_lantern, 'plug': build_plug, 'torch': build_torch, 'marker': build_marker,
    }

    # ---------------------------------------------------------- rendering
    def look_basis(fwd):
        f = Vector(fwd).normalized()
        up0 = Vector((0, 0, 1))
        r = f.cross(up0)
        if r.length < 1e-6:
            r = Vector((1, 0, 0))
        r.normalize()
        u = r.cross(f).normalized()
        return f, r, u

    def cam_matrix(f, r, u, loc):
        M = Matrix((
            (r.x, u.x, -f.x, loc.x),
            (r.y, u.y, -f.y, loc.y),
            (r.z, u.z, -f.z, loc.z),
            (0, 0, 0, 1)))
        return M

    def setup_lights():
        sc = bpy.context.scene
        key = link(bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN')))
        key.data.energy = job.get('key', 3.0)
        key.data.color = (1.0, 0.97, 0.92)
        key.data.angle = math.radians(3)
        fill = link(bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN')))
        fill.data.energy = job.get('fill', 1.35)
        fill.data.color = (0.92, 0.94, 1.0)
        fill.data.angle = math.radians(20)
        fill.data.use_shadow = False
        return key, fill

    def aim_lights(key, fill, f, r, u):
        # key: from upper front-left of the viewer; fill: from the right
        kfrom = (-0.55 * r - 0.55 * f + 0.65 * u).normalized()
        ffrom = (0.8 * r - 0.1 * f + 0.25 * u).normalized()
        for lt, frm in ((key, kfrom), (fill, ffrom)):
            lt.matrix_world = (Matrix.Translation(frm * 10)) @ (-frm).to_track_quat('-Z', 'Y').to_matrix().to_4x4()

    def render_spec(spec, outdir):
        sc = bpy.context.scene
        os.makedirs(outdir, exist_ok=True)
        cam = link(bpy.data.objects.new('cam', bpy.data.cameras.new('cam')))
        sc.camera = cam
        cam.data.type = 'ORTHO'
        key, fill = setup_lights()
        pts = verts_of(meshes())
        rot = spec.get('rot', 8)
        frames = spec.get('frames', 'A')
        ss = job['ss']
        views = []
        if rot == 8:
            for r in range(1, 9):
                a = math.pi + (r - 1) * math.pi / 4
                views.append((r, Vector((math.cos(a), math.sin(a), 0.0))))
        else:
            el = math.radians(spec.get('el', 0))
            a = math.pi + math.radians(spec.get('yaw', 0))
            views.append((0, Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), -math.sin(el)))))
        # common canvas: horizontal half-width and vertical range over views
        half, vt, vb = 0.0, -1e9, 1e9
        for _, fw in views:
            f, r_, u = look_basis(fw)
            P = np.array(pts)
            uu = P @ np.array(r_)
            vv = P @ np.array(u)
            half = max(half, np.abs(uu).max())
            vt = max(vt, vv.max())
            vb = min(vb, vv.min())
        half = int(math.ceil(half)) + 2
        vt = int(math.ceil(vt)) + 2
        vb = int(math.floor(vb)) - 2
        W, H = 2 * half, vt - vb
        sc.render.resolution_x = W * ss
        sc.render.resolution_y = H * ss
        cam.data.ortho_scale = max(W, H)
        cam.data.sensor_fit = 'AUTO'
        D = float(np.abs(pts).max() * 2 + 500)
        cam.data.clip_start = 1.0
        cam.data.clip_end = D * 2 + 1000
        meta = dict(name=spec['name'], ss=ss, W=W, H=H, half=half, top=vt, rot=rot, frames=frames, views=[])
        for fr in frames:
            if spec['build'] == 'heli':
                heli_frame(fr)
            for r, fw in views:
                f, r_, u = look_basis(fw)
                centre = u * ((vt + vb) / 2.0)
                cam.matrix_world = cam_matrix(f, r_, u, centre - f * D)
                aim_lights(key, fill, f, r_, u)
                fn = '%s%d.png' % (fr, r)
                sc.render.filepath = os.path.join(outdir, fn)
                bpy.ops.render.render(write_still=True)
                meta['views'].append(dict(frame=fr, rot=r, file=fn))
        json.dump(meta, open(os.path.join(outdir, 'meta.json'), 'w'), indent=1)
        return meta

    def render_icon(icon, spec, outdir, size):
        """3/4 view from above, fitted into size x size px (supersampled)."""
        sc = bpy.context.scene
        os.makedirs(outdir, exist_ok=True)
        cam = link(bpy.data.objects.new('cam', bpy.data.cameras.new('cam')))
        sc.camera = cam
        cam.data.type = 'ORTHO'
        key, fill = setup_lights()
        el = math.radians(icon['el'])
        a = math.pi + math.radians(icon['yaw'])
        fw = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), -math.sin(el)))
        f, r_, u = look_basis(fw)
        if icon.get('roll'):
            R = Matrix.Rotation(math.radians(icon['roll']), 3, f)
            r_, u = R @ r_, R @ u
        P = verts_of(meshes())
        uu, vv = P @ np.array(r_), P @ np.array(u)
        cu, cv = (uu.max() + uu.min()) / 2, (vv.max() + vv.min()) / 2
        ext = max(uu.max() - uu.min(), vv.max() - vv.min())
        res = size * 4
        sc.render.resolution_x = sc.render.resolution_y = res
        cam.data.ortho_scale = ext * size / (size - 2.5)
        D = float(np.abs(P).max() * 2 + 500)
        cam.data.clip_end = D * 2 + 1000
        cam.matrix_world = cam_matrix(f, r_, u, r_ * cu + u * cv - f * D)
        aim_lights(key, fill, f, r_, u)
        sc.render.filepath = os.path.join(outdir, icon['name'] + '.png')
        bpy.ops.render.render(write_still=True)

    # ------------------------------------------------------------- tests
    def rotation_test(outdir):
        """Render the marker as sprite rotations, then render it 'in the
        world' (thing yaw psi, camera at a world position) for given cases."""
        spec = dict(name='TEST', build='marker', rot=8)
        reset()
        build_marker(spec)
        render_spec(spec, os.path.join(outdir, 'sprite'))
        res = []
        for case in job['cases']:
            reset()
            build_marker(spec)
            psi = case['thing_angle']
            xform(meshes(), Rz(math.degrees(psi)))
            xform(meshes(), T(case['thing'][0], case['thing'][1], 0))
            sc = bpy.context.scene
            cam = link(bpy.data.objects.new('cam', bpy.data.cameras.new('cam')))
            sc.camera = cam
            cam.data.type = 'ORTHO'
            key, fill = setup_lights()
            meta = json.load(open(os.path.join(outdir, 'sprite', 'meta.json')))
            W, H, top = meta['W'], meta['H'], meta['top']
            sc.render.resolution_x, sc.render.resolution_y = W * job['ss'], H * job['ss']
            cam.data.ortho_scale = max(W, H)
            cam.data.clip_end = 1e5
            tx, ty = case['thing']
            vx, vy = case['viewer']
            f = Vector((tx - vx, ty - vy, 0)).normalized()
            f, r_, u = look_basis(f)
            centre = Vector((tx, ty, (top + (top - H)) / 2.0))
            cam.matrix_world = cam_matrix(f, r_, u, centre - f * 2000)
            aim_lights(key, fill, f, r_, u)
            fn = os.path.join(outdir, 'world_%d.png' % case['id'])
            sc.render.filepath = fn
            bpy.ops.render.render(write_still=True)
            res.append(fn)

    # ------------------------------------------------------------ main
    if job.get('test'):
        rotation_test(job['out'])
        return
    for spec in job['sprites']:
        reset()
        BUILDERS[spec['build']](spec)
        render_spec(spec, os.path.join(job['out'], spec['name']))
        print('RENDERED', spec['name'], flush=True)
    for icon in job.get('icons', []):
        spec = icon['spec']
        reset()
        BUILDERS[spec['build']](spec)
        render_icon(icon, spec, os.path.join(job['out'], '_icons'), icon['size'])
        print('RENDERED', icon['name'], flush=True)


# ===========================================================================
# system-python side: sources, helper textures, post-processing, graphics
# ===========================================================================

def log(*a):
    print('[render_props]', *a, flush=True)


def safe_join(base, rel):
    p = os.path.normpath(os.path.join(base, rel))
    if not p.startswith(os.path.normpath(base) + os.sep):
        raise ValueError('unsafe path in archive/listing: ' + rel)
    return p


def ensure_sources():
    """Unpack the Kenney Car Kit GLBs and download the Poly Haven models
    (1k glTF) that are not cached yet. Downloads are data only; nothing in
    them is executed."""
    import zipfile
    if not os.path.exists(os.path.join(KENNEY_GLB, 'police.glb')):
        if not os.path.exists(KENNEY_ZIP):
            os.makedirs(os.path.dirname(KENNEY_ZIP), exist_ok=True)
            url = 'https://kenney.nl/media/pages/assets/car-kit/kenney_car-kit.zip'
            log('downloading Kenney Car Kit', url)
            subprocess.run(['curl', '-sSfL', '--max-time', '300', '-o', KENNEY_ZIP, url], check=True)
        log('unpacking', KENNEY_ZIP)
        zf = zipfile.ZipFile(KENNEY_ZIP)
        for i in zf.infolist():
            n = i.filename
            if i.is_dir() or not (n.startswith('Models/GLB format/') or n == 'License.txt'):
                continue
            p = safe_join(KENNEY_DIR, n)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, 'wb') as f:
                f.write(zf.read(i))
    for pid in PH_MODELS:
        if os.path.exists(ph_gltf(pid)):
            continue
        log('downloading Poly Haven', pid)
        api = subprocess.run(['curl', '-sSf', '--max-time', '60', 'https://api.polyhaven.com/files/' + pid],
                             check=True, capture_output=True).stdout
        g = json.loads(api)['gltf']['1k']['gltf']
        items = [(os.path.basename(g['url']), g['url'])] + [(k, v['url']) for k, v in g.get('include', {}).items()]
        d = ph_dir(pid)
        os.makedirs(d, exist_ok=True)
        for rel, url in items:
            if not url.startswith('https://dl.polyhaven.org/'):
                raise ValueError('unexpected download host: ' + url)
            p = safe_join(d, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            subprocess.run(['curl', '-sSfL', '--max-time', '300', '-o', p + '.part', url], check=True)
            os.replace(p + '.part', p)


# ------------------------------------------------------------ fonts / text
FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_CJK_FALLBACK = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
MSZ_DIR = os.path.join(CACHE, 'font_ma_shan_zheng', 'x', 'package', 'files')


def cjk_font(ch, size):
    """Ma Shan Zheng (OFL) subset that holds ch, else WenQuanYi Zen Hei."""
    from PIL import ImageFont
    uj = os.path.join(os.path.dirname(MSZ_DIR), 'unicode.json')
    if os.path.exists(uj):
        cp = ord(ch)
        for k, v in json.load(open(uj)).items():
            for part in v.split(','):
                part = part.strip().replace('U+', '')
                if not part:
                    continue
                a, _, b = part.partition('-')
                if int(a, 16) <= cp <= int(b or a, 16):
                    f = os.path.join(MSZ_DIR, 'ma-shan-zheng-%s-400-normal.woff' % k.strip('[]'))
                    if os.path.exists(f):
                        font = ImageFont.truetype(f, size)
                        # the subsets list some traditional characters they
                        # draw as the .notdef box: compare with a surely
                        # missing code point
                        if bytes(font.getmask(ch)) != bytes(font.getmask('\U0010FFFD')):
                            return font
    return ImageFont.truetype(FONT_CJK_FALLBACK, size)


def cjk_fonts(text, size):
    """One font per character, all Ma Shan Zheng when it has every glyph,
    else all WenQuanYi (so a sign never mixes typefaces)."""
    from PIL import ImageFont
    fs = [cjk_font(ch, size) for ch in text]
    if any(f.path == FONT_CJK_FALLBACK for f in fs):
        fs = [ImageFont.truetype(FONT_CJK_FALLBACK, size)] * len(text)
    return fs


def make_textures():
    """Small helper images used by the procedural models."""
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    import numpy as np
    d = os.path.join(WORK, 'tex')
    os.makedirs(d, exist_ok=True)
    rng = np.random.default_rng(11)
    out = {}

    # NYPD-style blue sawhorse board, "POLICE LINE" in white.
    im = Image.new('RGB', (920, 120), (34, 58, 132))
    dr = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT_BOLD, 92)
    txt = 'POLICE LINE'
    bb = dr.textbbox((0, 0), txt, font=f)
    dr.text(((920 - (bb[2] - bb[0])) / 2 - bb[0], (120 - (bb[3] - bb[1])) / 2 - bb[1]), txt, font=f, fill=(236, 236, 230))
    a = np.asarray(im).astype(np.float32) * rng.uniform(0.82, 1.0, (120, 920, 1))
    out['saw_board'] = os.path.join(d, 'saw_board.png')
    Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(out['saw_board'])

    # Payphone sign: "PHONE" white on blue.
    im = Image.new('RGB', (680, 180), (28, 52, 120))
    dr = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT_BOLD, 150)
    bb = dr.textbbox((0, 0), 'PHONE', font=f)
    dr.text(((680 - (bb[2] - bb[0])) / 2 - bb[0], (180 - (bb[3] - bb[1])) / 2 - bb[1]), 'PHONE', font=f, fill=(240, 240, 236))
    out['phone_sign'] = os.path.join(d, 'phone_sign.png')
    im.save(out['phone_sign'])

    # Crate face: boards, frame, diagonal brace.
    S = 256
    base = np.zeros((S, S, 3), np.float32)
    plank = np.array([150, 112, 70], np.float32)
    for i in range(6):
        y0, y1 = i * S // 6, (i + 1) * S // 6
        tone = rng.uniform(0.8, 1.08)
        grain = rng.normal(1.0, 0.05, (1, S, 1)) * (1 + 0.06 * np.sin(np.linspace(0, rng.uniform(10, 30), S)))[None, :, None]
        base[y0:y1] = plank * tone * grain
        base[y1 - 2:y1] *= 0.45
    im = Image.fromarray(base.clip(0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    frame = (112, 80, 46)
    fw = 30
    for r in ((0, 0, S, fw), (0, S - fw, S, S), (0, 0, fw, S), (S - fw, 0, S, S)):
        dr.rectangle(r, fill=frame)
    dr.line([(fw, S - fw), (S - fw, fw)], fill=frame, width=34)
    for r in ((fw - 2, fw - 2, S - fw + 2, S - fw + 2),):
        dr.rectangle(r, outline=(52, 36, 20), width=4)
    for (x, y) in ((14, 14), (S - 15, 14), (14, S - 15), (S - 15, S - 15), (S // 2, 14), (S // 2, S - 15), (14, S // 2), (S - 15, S // 2)):
        dr.ellipse((x - 4, y - 4, x + 4, y + 4), fill=(46, 40, 34))
    a = np.asarray(im).astype(np.float32) * rng.uniform(0.85, 1.0, (S, S, 1))
    out['crate'] = os.path.join(d, 'crate.png')
    Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(out['crate'])

    # Lantern paper: red with a dark 福 and gold bands.
    W, H = 520, 440
    im = Image.new('RGB', (W, H), (226, 34, 18))
    dr = ImageDraw.Draw(im)
    for y in range(0, H, 22):
        dr.line([(0, y), (W, y)], fill=(196, 24, 14), width=3)
    fc = cjk_font('福', 250)
    bb = dr.textbbox((0, 0), '福', font=fc)
    dr.text(((W - (bb[2] - bb[0])) / 2 - bb[0], (H - (bb[3] - bb[1])) / 2 - bb[1]), '福', font=fc, fill=(40, 10, 6))
    im = im.filter(ImageFilter.GaussianBlur(2))
    out['lantern'] = os.path.join(d, 'lantern.png')
    im.save(out['lantern'])

    # Helicopter side panel: white with "RESCUE" in red and a red band.
    im = Image.new('RGB', (800, 168), (206, 204, 196))
    dr = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT_BOLD, 120)
    bb = dr.textbbox((0, 0), 'RESCUE', font=f)
    dr.text(((800 - (bb[2] - bb[0])) / 2 - bb[0], (168 - (bb[3] - bb[1])) / 2 - bb[1]), 'RESCUE', font=f, fill=(196, 40, 22))
    out['heli_text'] = os.path.join(d, 'heli_text.png')
    im.save(out['heli_text'])
    return out


# ------------------------------------------------------------- bpy runner
def bpy_python():
    p = os.environ.get('CT_BPY') or DEFAULT_BPY
    if not os.path.exists(p):
        raise SystemExit('No Python with bpy found: set CT_BPY (pip install bpy==5.2.2 in a python3.13 venv)')
    return p


def run_worker(job):
    os.makedirs(WORK, exist_ok=True)
    jp = os.path.join(WORK, 'job_%d.json' % os.getpid())
    json.dump(job, open(jp, 'w'), indent=1)
    cmd = [bpy_python(), os.path.abspath(__file__), '--bpy-worker', jp]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, cwd=WORK)
    tail = []
    for line in p.stdout:
        tail = (tail + [line])[-60:]
        if line.startswith('RENDERED'):
            log(line.strip())
    if p.wait() != 0:
        sys.stderr.write(''.join(tail))
        raise SystemExit('bpy worker failed')
    os.remove(jp)


def base_job(tex):
    return dict(ss=SS, samples=int(os.environ.get('CT_SAMPLES', 20)), threads=int(os.environ.get('CT_THREADS', 3)),
                kenney=KENNEY_GLB, ph={pid: ph_gltf(pid) for pid in PH_MODELS}, tex=tex, out=RAW)


# ---------------------------------------------------------- post-process
def load_render(path, ss):
    """Box-downsample an RGBA render by ss (premultiplied). Returns sRGB
    colour 0..1 (H, W, 3) and coverage (H, W)."""
    from PIL import Image
    import numpy as np
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255.0
    H, W = a.shape[0] // ss, a.shape[1] // ss
    a = a[:H * ss, :W * ss].reshape(H, ss, W, ss, 4)
    al = a[..., 3]
    pre = (a[..., :3] * al[..., None]).sum((1, 3))
    cov = al.sum((1, 3))
    col = pre / np.maximum(cov, 1e-6)[..., None]
    return col, cov / (ss * ss)


def erode4(m):
    import numpy as np
    e = m.copy()
    e[1:, :] &= m[:-1, :]
    e[:-1, :] &= m[1:, :]
    e[:, 1:] &= m[:, :-1]
    e[:, :-1] &= m[:, 1:]
    return e


def dilate8(m):
    import numpy as np
    d = m.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            d |= np.roll(np.roll(m, dy, 0), dx, 1)
    return d


def grade(col, spec):
    import numpy as np
    g = spec.get('grade', {})
    gain, sat, gamma = g.get('gain', 1.0), g.get('sat', 1.1), g.get('gamma', 1.0)
    lum = (col * np.array([0.299, 0.587, 0.114])).sum(-1, keepdims=True)
    col = lum + (col - lum) * sat
    col = np.clip(col * gain, 0, 1) ** gamma
    return col


def to_picture(col, cov, spec, thr=0.5, outline=0.72):
    """Threshold, darken the silhouette edge, quantize. Returns indices,
    mask (full canvas)."""
    import doomgfx as dg
    import numpy as np
    mask = cov >= thr
    col = grade(col, spec)
    if outline and not spec.get('fullbright'):
        edge = mask & ~erode4(mask)
        col = col.copy()
        col[edge] *= outline
    col = np.clip(col, 0, 1)
    ind = keep_reds(col, dg.quantize(col * 255))
    return ind, mask


# DOOM's COLORMAP keeps the pure red ramp (palette 176-191) red down to the
# darkest light levels, but the brick reds (16-47) that plain nearest-colour
# quantization picks for red paint turn brown at ordinary street distances
# (light 112-160 -> levels ~15-24): the fire truck, ambulance stripes, red
# sedan, gas can and hydrant read brown in game. Strongly saturated red
# pixels are therefore quantized to the pure ramp. (Same rule as
# render_zombies.py.)
RED_RAMP = tuple(range(176, 192))


def keep_reds(c, ind):
    """c: graded sRGB 0..1 (H, W, 3); ind: its plain quantization."""
    import doomgfx as dg
    import numpy as np
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx, mn = c.max(-1), c.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    hue = (g - b) / np.maximum(r - mn, 1e-6)        # x60 deg when red is the max
    red = (r >= mx) & (sat >= 0.6) & (r >= 0.25) & (hue > -0.3) & (hue < 0.22)
    if red.any():
        other = set(range(256)) - set(RED_RAMP)
        ind = ind.copy()
        ind[red] = dg.quantize(c[red][None] * 255.0, exclude=other)[0]
    return ind


def crop(ind, mask):
    import numpy as np
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return None
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return ind[y0:y1, x0:x1], mask[y0:y1, x0:x1], x0, y0


def clear_lumps(ns, prefix):
    d = os.path.join(BUILD, 'lumps', ns)
    if not os.path.isdir(d):
        return
    for f in os.listdir(d):
        if f.upper().startswith(prefix.upper()) and f.endswith('.lmp') and len(f) - 4 in (5, 6, 8):
            os.remove(os.path.join(d, f))


def encode_sprite(spec, info):
    """Turn the renders of one sprite into lumps; returns preview tiles."""
    import doomgfx as dg
    import numpy as np
    sd = os.path.join(RAW, spec['name'])
    meta = json.load(open(os.path.join(sd, 'meta.json')))
    clear_lumps('sprites', spec['name'])
    tiles = []
    for v in meta['views']:
        col, cov = load_render(os.path.join(sd, v['file']), meta['ss'])
        ind, mask = to_picture(col, cov, spec)
        c = crop(ind, mask)
        if c is None:
            raise SystemExit('empty render: %s %s' % (spec['name'], v['file']))
        ci, cm, x0, y0 = c
        h, w = ci.shape
        left = meta['half'] - x0
        if spec.get('rot', 8) == 0 and spec.get('el', 0) > 0:
            top = h           # bottom row on the floor
        else:
            top = meta['top'] - y0
        name = '%s%s%d' % (spec['name'], v['frame'], v['rot'])
        dg.write_lump('sprites', name, dg.encode_picture(ci, cm, left, top))
        info[name] = dict(width=int(w), height=int(h), left=int(left), top=int(top))
        tiles.append((name, ci, cm, left, top))
    return tiles


# --------------------------------------------------------------- previews
def save_strip(path, tiles, scale=2, label=True):
    """Tiles side by side on a dark background, with the origin marked."""
    from PIL import Image, ImageDraw
    import doomgfx as dg
    import numpy as np
    pal = dg.palette()
    pad = 6
    up = max(t[4] for t in tiles)
    down = max(t[1].shape[0] - t[4] for t in tiles)
    H = up + max(down, 0) + 2 * pad + 10
    W = sum(t[1].shape[1] + pad for t in tiles) + pad
    img = np.zeros((H, W, 3), np.uint8)
    img[:] = (38, 36, 44)
    x = pad
    gy = pad + 10 + up
    img[gy, :] = (90, 90, 100)
    for (name, ind, m, left, top) in tiles:
        h, w = ind.shape
        y = gy - top
        sub = img[y:y + h, x:x + w]
        sub[m] = pal[ind[m]]
        img[gy - 1:gy + 2, x + left] = (255, 255, 0)
        x += w + pad
    im = Image.fromarray(img).resize((W * scale, H * scale), Image.NEAREST)
    if label:
        dr = ImageDraw.Draw(im)
        x = pad
        for (name, ind, m, left, top) in tiles:
            dr.text((x * scale, 2), name, fill=(255, 255, 160))
            x += ind.shape[1] + pad
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path)
    return im


def contact_sheet(paths, out, maxw=1800):
    from PIL import Image
    ims = [Image.open(p) for p in paths if os.path.exists(p)]
    if not ims:
        return
    rows, cur, cw = [], [], 0
    for im in ims:
        if cur and cw + im.width > maxw:
            rows.append(cur)
            cur, cw = [], 0
        cur.append(im)
        cw += im.width
    if cur:
        rows.append(cur)
    W = max(sum(i.width for i in r) for r in rows)
    H = sum(max(i.height for i in r) for r in rows)
    sheet = Image.new('RGB', (W, H), (20, 20, 24))
    y = 0
    for r in rows:
        x = 0
        for im in r:
            sheet.paste(im, (x, y))
            x += im.width
        y += max(i.height for i in r)
    sheet.save(out)


# ---------------------------------------------------------------- graphics
def encode_icons(icons, info):
    """24x24 HUD icons with a 1-px black outline round the shape."""
    import doomgfx as dg
    import numpy as np
    tiles = []
    for icon in icons:
        col, cov = load_render(os.path.join(RAW, '_icons', icon['name'] + '.png'), 4)
        spec = dict(grade=icon.get('grade', {}))
        ind, mask = to_picture(col, cov, spec, thr=0.45, outline=0.8)
        ring = dilate8(mask) & ~mask
        black = dg.quantize(np.zeros((1, 1, 3)))[0, 0]
        ind = ind.copy()
        ind[ring] = black
        full = mask | ring
        dg.write_lump('graphics', icon['name'], dg.encode_picture(ind, full, 0, 0))
        h, w = ind.shape
        info[icon['name']] = dict(width=w, height=h, left=0, top=0)
        tiles.append((icon['name'], ind, full, 0, h))
    return tiles


def decode_picture(b):
    import struct
    import numpy as np
    w, h, l, t = struct.unpack_from('<HHhh', b, 0)
    ind = np.zeros((h, w), np.uint8)
    m = np.zeros((h, w), bool)
    for x in range(w):
        p = struct.unpack_from('<I', b, 8 + 4 * x)[0]
        while b[p] != 255:
            top, n = b[p], b[p + 1]
            ind[top:top + n, x] = np.frombuffer(b[p + 3:p + 3 + n], np.uint8)
            m[top:top + n, x] = True
            p += n + 4
    return ind, m, l, t


def menu_letters():
    """Cut single letters out of the IWAD's own menu graphics. Letters touch
    through a shared 1-px dark outline column, so a letter is a run of
    columns holding bright 'core' red, plus one outline column each side."""
    import doomgfx as dg
    import numpy as np

    def letters(lump):
        ind, m, _, _ = decode_picture(dg.read_wad_lump(dg.IWAD, lump))
        core = (m & (ind >= 176) & (ind <= 186)).any(0)
        runs, x = [], 0
        while x < len(core):
            if core[x]:
                s = x
                while x < len(core) and core[x]:
                    x += 1
                runs.append((max(0, s - 1), min(len(core), x + 1)))
            else:
                x += 1
        return [(ind[:, a:b], m[:, a:b]) for a, b in runs]

    skill = letters('M_SKILL')     # C h o o s e  S k i l l ...
    epi1 = letters('M_EPI1')       # K K n e e - D e e p  i n  t h e  D e a d
    loadg = letters('M_LOADG')     # L o a d  g a m e
    ngame = letters('M_NGAME')     # N e w  G a m e
    return {'C': skill[0], 'h': skill[1], 'o': skill[2], 'i': epi1[10], 'n': epi1[11],
            't': epi1[12], 'a': loadg[2], 'w': ngame[2]}


def build_menu_word(word, L):
    import numpy as np
    parts = [L[c] for c in word]
    H = max(p[0].shape[0] for p in parts)
    W = sum(p[0].shape[1] for p in parts) - (len(parts) - 1)
    ind = np.zeros((H, W), np.uint8)
    m = np.zeros((H, W), bool)
    x = 0
    for pi, pm in parts:
        h, w = pi.shape
        sub_i, sub_m = ind[:h, x:x + w], m[:h, x:x + w]
        # shared outline column: keep whichever is opaque (prefer the new letter's core)
        sub_i[pm] = pi[pm]
        sub_m |= pm
        x += w - 1
    return ind, m


def make_m_epict(info):
    import doomgfx as dg
    L = menu_letters()
    ind, m = build_menu_word('Chinatown', L)
    dg.write_lump('graphics', 'M_EPICT', dg.encode_picture(ind, m, 0, 0))
    info['M_EPICT'] = dict(width=int(ind.shape[1]), height=int(ind.shape[0]), left=0, top=0)
    dg.write_preview(os.path.join(PREV, 'M_EPICT.png'), ind, m, scale=4)
    return ind, m


def make_title(info, sprite_tiles):
    """CTTITLE: 320x200 night Chinatown street with the title."""
    from PIL import Image, ImageDraw, ImageFilter
    import doomgfx as dg
    import numpy as np
    rng = np.random.default_rng(5)
    W, H = 320, 200
    pal = dg.palette()
    sky = np.zeros((H, W, 3), np.float32)
    for y in range(H):
        t = y / H
        sky[y] = np.array([10, 10, 26]) * (1 - t) + np.array([52, 26, 40]) * t
    img = Image.fromarray(sky.astype(np.uint8))
    dr = ImageDraw.Draw(img)
    # a few stars and a low orange city glow
    for _ in range(40):
        x, y = int(rng.integers(0, W)), int(rng.integers(0, 90))
        dr.point((x, y), fill=(120, 120, 140))
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((-40, 100, W + 40, 260), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(24))
    img = Image.composite(Image.new('RGB', (W, H), (110, 52, 30)), img, glow.point(lambda v: v * 0.45))
    dr = ImageDraw.Draw(img)

    def building(x0, x1, top, colr, win, lit=0.35, floor_h=14, win_w=4):
        dr.rectangle((x0, top, x1, H), fill=colr)
        for fy in range(top + 6, 160, floor_h):
            for fx in range(x0 + 4, x1 - 4, win_w + 5):
                on = rng.random() < lit
                c = win if on else tuple(int(v * 0.6) for v in colr)
                dr.rectangle((fx, fy, fx + win_w, fy + 6), fill=c)
        dr.rectangle((x0, top - 2, x1, top), fill=tuple(int(v * 0.7) for v in colr))

    # far skyline
    x = 0
    while x < W:
        w = int(rng.integers(14, 34))
        h = int(rng.integers(40, 90))
        dr.rectangle((x, H - 60 - h, x + w, H), fill=(22, 20, 34))
        for fy in range(H - 60 - h + 4, H - 60, 7):
            for fx in range(x + 2, x + w - 2, 5):
                if rng.random() < 0.12:
                    dr.point((fx, fy), fill=(150, 130, 70))
        x += w + int(rng.integers(0, 4))
    # near buildings
    building(0, 70, 64, (58, 30, 26), (210, 170, 80), lit=0.3)
    building(70, 112, 84, (44, 50, 46), (200, 180, 110), lit=0.25)
    building(232, 276, 76, (40, 44, 56), (190, 170, 120), lit=0.3)
    building(276, 320, 58, (64, 34, 28), (220, 160, 70), lit=0.35)
    # vertical neon signs with characters
    def neon(x, y, text, c):
        dr.rectangle((x - 2, y - 2, x + 15, y + 16 * len(text) + 1), fill=(24, 10, 10))
        for i, (ch, f) in enumerate(zip(text, cjk_fonts(text, 15))):
            dr.text((x, y + i * 16), ch, font=f, fill=c)
    neon(48, 90, '酒家', (255, 70, 50))
    neon(286, 80, '藥行', (90, 230, 120))
    # paifang gate (centre)
    gx0, gx1 = 112, 232
    red, dark_red, green, gold = (150, 24, 18), (90, 14, 10), (40, 110, 70), (220, 170, 60)
    for px in (gx0 + 10, gx0 + 40, gx1 - 46, gx1 - 16):
        dr.rectangle((px, 92, px + 6, 168), fill=red)
        dr.rectangle((px + 4, 92, px + 6, 168), fill=dark_red)
    dr.rectangle((gx0 + 4, 92, gx1 - 4, 102), fill=red)
    dr.rectangle((gx0 + 34, 74, gx1 - 34, 86), fill=red)
    dr.rectangle((gx0 + 52, 77, gx1 - 52, 84), fill=(24, 14, 10))
    for i, (ch, f) in enumerate(zip('中華門', cjk_fonts('中華門', 9))):
        dr.text((gx0 + 55 + i * 11, 76), ch, font=f, fill=gold)
    for (y, x0, x1, lift) in ((86, gx0 + 20, gx1 - 20, 7), (66, gx0 + 26, gx1 - 26, 8)):
        dr.polygon([(x0 - 10, y + 6 - lift), (x0 + 8, y), (x1 - 8, y), (x1 + 10, y + 6 - lift),
                    (x1 + 4, y + 8 - lift), (x0 - 4, y + 8 - lift)], fill=green)
        dr.line([(x0 + 8, y), (x1 - 8, y)], fill=(70, 150, 100))
    dr.polygon([(gx0 - 6, 98 - 4), (gx0 + 10, 90), (gx1 - 10, 90), (gx1 + 6, 98 - 4), (gx1, 96), (gx0, 96)], fill=green)
    # street
    for y in range(160, H):
        t = (y - 160) / 40
        dr.line([(0, y), (W, y)], fill=(int(30 + 14 * t), int(28 + 10 * t), int(34 + 8 * t)))
    dr.polygon([(150, 160), (170, 160), (200, H), (120, H)], fill=(44, 40, 44))
    for y in (166, 176, 190):
        dr.line([(158, y), (162, y)], fill=(170, 150, 80), width=1)
    # shambling silhouettes in the gateway, backlit
    def zombie(x, gy, h, lean, reach):
        c = (16, 12, 14)
        hd = h * 0.13
        hx, hy = x + lean, gy - h + hd
        dr.ellipse((hx - hd * 0.8, hy - hd, hx + hd * 0.8, hy + hd), fill=c)
        sh = gy - h * 0.78
        hip = gy - h * 0.45
        dr.polygon([(x + lean * 0.8 - h * 0.13, sh), (x + lean * 0.8 + h * 0.13, sh),
                    (x + h * 0.1, hip), (x - h * 0.1, hip)], fill=c)
        dr.line([(x - h * 0.06, hip), (x - h * 0.12, gy)], fill=c, width=max(2, int(h * 0.09)))
        dr.line([(x + h * 0.06, hip), (x + h * 0.1 + lean * 0.3, gy)], fill=c, width=max(2, int(h * 0.09)))
        for sgn in (-1, 1):
            ax = x + lean * 0.8 + sgn * h * 0.11
            dr.line([(ax, sh + 2), (ax + reach, sh + h * 0.14 + sgn)], fill=c, width=max(2, int(h * 0.07)))
        dr.point((hx + 1, hy), fill=(200, 40, 20))
    zombie(150, 168, 34, 3, 9)
    zombie(178, 166, 28, -2, -8)
    zombie(198, 167, 31, 2, 7)
    img = img.convert('RGB')
    # lantern strings across the street
    for (y0, y1, n) in ((52, 60, 9), (36, 46, 7)):
        pts = [(int(i * W / (n - 1)), int(y0 + (y1 - y0) * math.sin(math.pi * i / (n - 1)))) for i in range(n)]
        dr = ImageDraw.Draw(img)
        dr.line(pts, fill=(30, 20, 20), width=1)
        for (x, y) in pts[1:-1]:
            dr.ellipse((x - 4, y, x + 4, y + 7), fill=(240, 50, 24))
            dr.line([(x - 4, y + 3), (x + 4, y + 3)], fill=(255, 150, 60))
            dr.rectangle((x - 1, y + 7, x + 1, y + 10), fill=(250, 200, 60))
    arr = np.asarray(img).astype(np.float32)
    # paste vehicle sprites: police car and a taxi
    def paste(tiles_name, rot_suffix, cx, gy, scale=1.0):
        for (name, ind, m, left, top) in sprite_tiles.get(tiles_name, []):
            if name.endswith(rot_suffix):
                rgb = pal[ind].astype(np.float32)
                if scale != 1.0:
                    im2 = Image.fromarray(np.dstack([pal[ind], (m * 255).astype(np.uint8)]), 'RGBA')
                    im2 = im2.resize((max(1, int(ind.shape[1] * scale)), max(1, int(ind.shape[0] * scale))), Image.NEAREST)
                    a2 = np.asarray(im2)
                    rgb, m2 = a2[..., :3].astype(np.float32), a2[..., 3] > 127
                    left, top = int(left * scale), int(top * scale)
                else:
                    m2 = m
                h, w = m2.shape
                x0, y0 = cx - left, gy - top
                for yy in range(h):
                    for xx in range(w):
                        X, Y = x0 + xx, y0 + yy
                        if m2[yy, xx] and 0 <= X < W and 0 <= Y < H:
                            arr[Y, X] = rgb[yy, xx] * 0.8
                return
    paste('VPOL', 'A2', 74, 192, 0.62)
    paste('VTAX', 'A8', 262, 190, 0.6)
    img = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    # dark vignette at the top for the title
    a = np.asarray(img).astype(np.float32)
    for y in range(0, 50):
        a[y] *= 0.45 + 0.55 * (y / 50)
    img = Image.fromarray(a.clip(0, 255).astype(np.uint8))
    # title: DOOM menu letters x2 + calligraphy
    L = menu_letters()
    ind, m = build_menu_word('Chinatown', L)
    big = Image.fromarray(np.dstack([pal[ind], (m * 255).astype(np.uint8)]), 'RGBA')
    big = big.resize((big.width * 2, big.height * 2), Image.NEAREST)
    img.paste(big, ((W - big.width) // 2, 8), big)
    # 唐人街 in Ma Shan Zheng, red with a gold edge, under the title
    txt = Image.new('L', (W, 60), 0)
    td = ImageDraw.Draw(txt)
    x = 112
    for ch in '唐人街':
        td.text((x, 0), ch, font=cjk_font(ch, 30), fill=255)
        x += 32
    edge = txt.filter(ImageFilter.MaxFilter(3))
    gold_l = Image.new('RGB', (W, 60), (240, 190, 70))
    red_l = Image.new('RGB', (W, 60), (200, 20, 14))
    region = img.crop((0, 40, W, 100))
    region = Image.composite(gold_l, region, edge)
    region = Image.composite(red_l, region, txt)
    img.paste(region, (0, 40))
    rgb = np.asarray(img.convert('RGB'))
    q = dg.quantize(rgb)
    dg.write_lump('graphics', 'CTTITLE', dg.encode_picture(q, None, 0, 0))
    info['CTTITLE'] = dict(width=W, height=H, left=0, top=0)
    dg.write_preview(os.path.join(PREV, 'CTTITLE.png'), q, None, scale=3)


# ------------------------------------------------------------ verification
VERIFY_JS = r"""
import fs from 'node:fs';
import path from 'node:path';
import { decodePatch } from './src/wad/graphics.js';
const info = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
let ok = 0, bad = [];
for (const [name, d] of Object.entries(info)) {
  const ns = d.ns;
  const f = path.join('build/ct/lumps', ns, name + '.lmp');
  const img = decodePatch(new Uint8Array(fs.readFileSync(f)));
  if (!img) { bad.push(name + ': decodePatch returned null'); continue; }
  if (img.width !== d.width || img.height !== d.height || img.leftOffset !== d.left || img.topOffset !== d.top) {
    bad.push(`${name}: size/offset mismatch ${img.width}x${img.height} ${img.leftOffset},${img.topOffset}`); continue; }
  let n = 0; for (let i = 0; i < img.mask.length; i++) if (img.mask[i]) n++;
  if (!n) { bad.push(name + ': empty'); continue; }
  ok++;
}
console.log(JSON.stringify({ ok, bad }));
"""


def verify(info):
    p = os.path.join(WORK, 'verify_info.json')
    json.dump(info, open(p, 'w'))
    r = subprocess.run(['node', '--input-type=module', '-e', VERIFY_JS, p], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit('verify failed: ' + r.stderr[-2000:])
    res = json.loads(r.stdout.strip().splitlines()[-1])
    log('decodePatch check: %d ok, %d bad' % (res['ok'], len(res['bad'])))
    for b in res['bad']:
        log('  BAD', b)
    if res['bad']:
        raise SystemExit(1)


# --------------------------------------------------------- rotation test
ROT_JS = r"""
import fs from 'node:fs';
import { normAngle } from './src/game/defs.js';
const src = fs.readFileSync('src/render/view.js', 'utf8');
const m = src.match(/rot = (Math\.floor\(normAngle\(ang - mo\.angle[^;]*);/);
if (!m) { console.log(JSON.stringify({ error: 'rotation formula not found in view.js' })); process.exit(0); }
const f = new Function('normAngle', 'ang', 'mo', 'return ' + m[1]);
const cases = JSON.parse(process.argv[1]);
const out = cases.map((c) => {
  // as in view.js: ang = atan2(y - cam.y, x - cam.x) (direction viewer -> thing)
  const ang = Math.atan2(c.thing[1] - c.viewer[1], c.thing[0] - c.viewer[0]);
  return { id: c.id, rot: f(normAngle, ang, { angle: c.thing_angle }) };
});
console.log(JSON.stringify({ expr: m[1], out }));
"""


def test_rotations():
    import numpy as np
    from PIL import Image
    tex = {}
    psi = 3 * math.pi / 4          # a thing facing north-west (map angle 135)
    tx, ty = 1000.0, 500.0
    cases = []
    i = 0
    for k in range(8):
        for off in (0.0, 15.0):
            phi = psi + k * math.pi / 4 + math.radians(off)   # viewer's polar angle round the thing
            cases.append(dict(id=i, thing=[tx, ty], thing_angle=psi,
                              viewer=[tx + 600 * math.cos(phi), ty + 600 * math.sin(phi)], k=k, off=off))
            i += 1
    r = subprocess.run(['node', '--input-type=module', '-e', ROT_JS, json.dumps(cases)], cwd=ROOT,
                       capture_output=True, text=True, check=True)
    eng = json.loads(r.stdout.strip().splitlines()[-1])
    if 'error' in eng:
        raise SystemExit(eng['error'])
    log('engine formula (view.js):', eng['expr'])
    out = os.path.join(PREV, 'rotation_test')
    shutil.rmtree(out, ignore_errors=True)
    job = base_job(tex)
    job.update(test=True, out=out, cases=cases)
    run_worker(job)
    sprites = []
    for rr in range(1, 9):
        c, a = load_render(os.path.join(out, 'sprite', 'A%d.png' % rr), SS)
        sprites.append(np.dstack([c * a[..., None], a]))
    allok = True
    rows = []
    for c, e in zip(cases, eng['out']):
        cc, aa = load_render(os.path.join(out, 'world_%d.png' % c['id']), SS)
        w = np.dstack([cc * aa[..., None], aa])
        diffs = [float(np.abs(w - s).mean()) for s in sprites]
        best = int(np.argmin(diffs))
        ok = best == e['rot']
        allok &= ok
        rows.append('viewer at thing-angle %+4d deg (+%2d): engine picks rotation %d, best-matching image rotation %d, diff %.4f %s'
                    % (k_deg(c), c['off'], e['rot'] + 1, best + 1, diffs[best], 'OK' if ok else 'MISMATCH'))
    for r_ in rows:
        log(r_)
    # side by side picture for the record: world view | chosen sprite
    tiles = []
    for c, e in zip(cases, eng['out']):
        if c['off'] != 0:
            continue
        a = Image.open(os.path.join(out, 'world_%d.png' % c['id'])).convert('RGBA')
        b = Image.open(os.path.join(out, 'sprite', 'A%d.png' % (e['rot'] + 1))).convert('RGBA')
        t = Image.new('RGBA', (a.width + b.width + 8, a.height), (40, 40, 48, 255))
        t.paste(a, (0, 0), a)
        t.paste(b, (a.width + 8, 0), b)
        tiles.append(t)
    sheet = Image.new('RGBA', (tiles[0].width, sum(t.height + 4 for t in tiles)), (0, 0, 0, 255))
    y = 0
    for t in tiles:
        sheet.paste(t, (0, y))
        y += t.height + 4
    sheet.save(os.path.join(out, 'world_vs_sprite.png'))
    log('rotation test', 'PASSED' if allok else 'FAILED', '-> ' + os.path.join(out, 'world_vs_sprite.png'))
    return allok


def k_deg(c):
    return int(round(c['k'] * 45))


# ---------------------------------------------------------------- credits
CREDITS_MD = """# Chinatown: vehicles, props, pickups, menu art (tools/ct/render_props.py)

Everything here is rendered by `tools/ct/render_props.py` with Blender (bpy,
Cycles) and quantized to the DOOM palette. Sources and licences:

| used for | source | licence |
|---|---|---|
| VPOL VAMB VTAX VVAN VPCK VSED VSUV VTRK VFTR VGRB VMIL (humvee body), PCON | Kenney **Car Kit** 3.1 (police, ambulance, taxi, van, truck, sedan, suv, delivery, firetruck, garbage-truck, cone), www.kenney.nl | CC0 1.0 |
| PBAR | Poly Haven `concrete_road_barrier` | CC0 |
| PHYD | Poly Haven `fire_hydrant` (aged variant) | CC0 |
| PTRA | Poly Haven `metal_trash_can` (rust variant) | CC0 |
| PPHN (phone unit) | Poly Haven `korean_public_payphone_01` | CC0 |
| PLMP | Poly Haven `street_lamp_01` | CC0 |
| PGEN (generator) | Poly Haven `portable_generator` | CC0 |
| PRAD | Poly Haven `vintage_radio_transceiver`, `small_wooden_table_01` | CC0 |
| PWLD | Poly Haven `portable_welding_cart` | CC0 |
| IGAS, CTIGAS | Poly Haven `metal_jerrycan` | CC0 |
| ITOR, CTITOR | Poly Haven `propane_torch_02` | CC0 |
| VHEL, VMIL bed cover/brush guard/roof ring, PSAW, PGEN trailer, PPHN hood, PBEN, PCRT, PPAL, PLNT, IPLG, CTIPLG | modelled procedurally in the script (original) | CC0 (this project) |
| text on PSAW / PPHN sign / VHEL | DejaVu Sans Bold (Bitstream Vera licence; rasterized) | permissive |
| 福, 唐人街, 酒家, 藥行, 中華門 | Ma Shan Zheng (Google Fonts, via npm `@fontsource/ma-shan-zheng`), fallback WenQuanYi Zen Hei | SIL OFL 1.1 / GPLv2 with font exception (only rasterized pixels ship) |
| M_EPICT, CTTITLE title letters | cut from the IWAD's own menu graphics (M_SKILL, M_EPI1, M_LOADG, M_NGAME) at build time | id Software (needs the IWAD present; nothing is copied into the repo) |

Download URLs: Kenney Car Kit `https://kenney.nl/assets/car-kit` (cached as
`build/ct/cache/veh_kenney_car_kit/kenney_car-kit.zip`); Poly Haven models
via `https://api.polyhaven.com/files/<id>` -> 1k glTF from
`https://dl.polyhaven.org/file/ph-assets/Models/...` (cached in
`build/ct/cache/prop_ph_<id>/`).
"""


def write_credits():
    os.makedirs(os.path.dirname(CREDITS), exist_ok=True)
    with open(CREDITS, 'w') as f:
        f.write(CREDITS_MD)


# ------------------------------------------------------------------- main
def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--only', help='comma separated sprite names')
    ap.add_argument('--no-render', action='store_true', help='re-encode cached renders only')
    ap.add_argument('--no-graphics', action='store_true')
    ap.add_argument('--test-rotations', action='store_true')
    args = ap.parse_args()
    os.makedirs(PREV, exist_ok=True)
    os.makedirs(WORK, exist_ok=True)
    write_credits()
    if args.test_rotations:
        ensure_sources()
        sys.exit(0 if test_rotations() else 1)
    names = set(args.only.upper().split(',')) if args.only else None
    specs = [s for s in SPRITES if names is None or s['name'] in names]
    ensure_sources()
    tex = make_textures()
    do_graphics = not args.no_graphics
    icons = []
    if do_graphics:
        by = {s['name']: s for s in SPRITES}
        for ic in ICONS:
            if names is None or ic['of'] in names or ic['name'] in names:
                icons.append(dict(ic, spec=by[ic['of']], size=24))
    if not args.no_render and (specs or icons):
        job = base_job(tex)
        job.update(sprites=specs, icons=icons)
        run_worker(job)
    infop = os.path.join(PREV, 'sprites.json')
    info = json.load(open(infop)) if os.path.exists(infop) else {}
    tiles_by = {}
    for s in specs:
        for k in [k for k in info if k.startswith(s['name'])]:
            del info[k]
        si = {}
        tiles = encode_sprite(s, si)
        for k, v in si.items():
            v['ns'] = 'sprites'
        info.update(si)
        tiles_by[s['name']] = tiles
        frames = s.get('frames', 'A')
        if len(frames) == 1:
            save_strip(os.path.join(PREV, 'strip_%s.png' % s['name']), tiles)
        else:
            for fr in frames:
                save_strip(os.path.join(PREV, 'strip_%s_%s.png' % (s['name'], fr)),
                           [t for t in tiles if t[0][4] == fr], scale=1)
        log('encoded', s['name'], len(tiles), 'lumps')
    if do_graphics:
        gi = {}
        if icons:
            it = encode_icons(icons, gi)
            save_strip(os.path.join(PREV, 'strip_icons.png'), it, scale=4)
        make_m_epict(gi)
        # the title card uses some sprites: load them from the lumps
        for nm in ('VPOL', 'VTAX'):
            if nm not in tiles_by:
                tiles_by[nm] = load_tiles(nm)
        make_title(gi, tiles_by)
        for v in gi.values():
            v['ns'] = 'graphics'
        info.update(gi)
    json.dump(info, open(infop, 'w'), indent=1, sort_keys=True)
    verify(info)
    strips = [os.path.join(PREV, 'strip_%s.png' % s['name']) for s in SPRITES]
    contact_sheet([p for p in strips if os.path.basename(p)[6] == 'V'], os.path.join(PREV, 'sheet_vehicles.png'), maxw=4400)
    contact_sheet([os.path.join(PREV, 'strip_VHEL_%s.png' % f) for f in 'AB'], os.path.join(PREV, 'sheet_heli.png'), maxw=8000)
    contact_sheet([p for p in strips if os.path.basename(p)[6] in 'PI'] + [os.path.join(PREV, 'strip_icons.png')],
                  os.path.join(PREV, 'sheet_props.png'))
    log('done; previews in', PREV)


def load_tiles(name):
    """Decode this sprite's lumps back (for the title card / previews)."""
    d = os.path.join(BUILD, 'lumps', 'sprites')
    out = []
    if not os.path.isdir(d):
        return out
    for f in sorted(os.listdir(d)):
        if f.startswith(name) and f.endswith('.lmp'):
            ind, m, l, t = decode_picture(open(os.path.join(d, f), 'rb').read())
            out.append((f[:-4], ind, m, l, t))
    return out


if __name__ == '__main__':
    if '--bpy-worker' in sys.argv:
        bpy_worker(sys.argv[sys.argv.index('--bpy-worker') + 1])
        sys.exit(0)
    main()
