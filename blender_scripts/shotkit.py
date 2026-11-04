"""Shared infrastructure for building shot groups."""
import bpy, math, json, os, random, sys
sys.path.insert(0, '/opt/work/scripts')
from mathutils import Vector, Euler
import animlib as A
import scene_lib as L
from props import *

FPS = 30
def F(t): return int(round(t * FPS)) + 1

SFX_CUES = []      # (frame, file, gain_db, pan)
OVERLAYS = []      # dicts consumed by post

class Ctx:
    def __init__(self):
        self.scene = bpy.context.scene
        self.chars = {}
        self.cams = []
        self.rnd = random.Random(11)

    # ------------------------------------------------ characters
    def char(self, name, alias=None):
        alias = alias or name
        if alias not in self.chars:
            rig, body, objs = L.load_char(name, alias)
            self.chars[alias] = (rig, body, objs)
            # hide by default (shown per shot)
            for o in objs:
                o.hide_render = True
        return self.chars[alias]

    def actor(self, alias, f0, f1, name=None, seed=None):
        rig, body, objs = self.char(name or alias, alias)
        a = A.Actor(rig, body, seed=seed if seed is not None else (hash(alias) % 97))
        a.setup_arm_ik()
        a.f0, a.f1 = f0, f1
        self.show(alias, f0, f1)
        return a

    def show(self, alias, f0, f1):
        rig, body, objs = self.chars[alias]
        for o in objs:
            if o.type != 'MESH': continue
            # keep visibility keys: hidden before/after, visible in [f0, f1]
            o.hide_render = True; o.keyframe_insert('hide_render', frame=f0 - 1)
            o.hide_render = False; o.keyframe_insert('hide_render', frame=f0)
            o.hide_render = False; o.keyframe_insert('hide_render', frame=f1)
            o.hide_render = True; o.keyframe_insert('hide_render', frame=f1 + 1)
        for o in objs:
            ad = o.animation_data
            if ad and ad.action:
                for fc in ad.action.fcurves:
                    if fc.data_path == 'hide_render':
                        for k in fc.keyframe_points: k.interpolation = 'CONSTANT'

    # ------------------------------------------------ cameras
    def camera(self, name, f0, f1, keys, fstop=None, focus=None, shake=0.0, clip=(0.05, 400)):
        """keys: list of (frame, cam_loc, target_loc, lens)."""
        cam = bpy.data.cameras.new(name); co = bpy.data.objects.new(name, cam)
        self.scene.collection.objects.link(co)
        cam.sensor_width = 36; cam.clip_start, cam.clip_end = clip
        tg = bpy.data.objects.new(name + '_tgt', None); self.scene.collection.objects.link(tg)
        con = co.constraints.new('TRACK_TO'); con.target = tg; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
        for k in keys:
            fr, loc, tgt, lens = k[:4]
            co.location = loc; co.keyframe_insert('location', frame=fr)
            tg.location = tgt; tg.keyframe_insert('location', frame=fr)
            cam.lens = lens; cam.keyframe_insert('lens', frame=fr)
        for ob in (co, tg, cam):
            ad = ob.animation_data
            if ad and ad.action:
                for fc in ad.action.fcurves:
                    for kp in fc.keyframe_points:
                        kp.interpolation = 'BEZIER'; kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
        if fstop:
            cam.dof.use_dof = True; cam.dof.aperture_fstop = fstop
            if isinstance(focus, bpy.types.Object): cam.dof.focus_object = focus
            elif focus is not None: cam.dof.focus_distance = focus
            else: cam.dof.focus_object = tg
        if shake > 0:
            ad = tg.animation_data
            for fc in ad.action.fcurves:
                if fc.data_path == 'location':
                    m = fc.modifiers.new('NOISE'); m.scale = 40; m.strength = shake; m.phase = self.rnd.uniform(0, 100)
        mk = self.scene.timeline_markers.new(name, frame=f0); mk.camera = co
        self.cams.append((name, f0, f1, co))
        return co, tg

    # ------------------------------------------------ helpers
    def sfx(self, f, name, gain=0.0, pan=0.0):
        SFX_CUES.append((f, name, gain, pan))

    def overlay(self, **kw):
        OVERLAYS.append(kw)

    def key_vis(self, obj, f, vis):
        objs = [obj] + list(obj.children_recursive)
        for o in objs:
            o.hide_render = not vis; o.keyframe_insert('hide_render', frame=f)
            ad = o.animation_data
            for fc in ad.action.fcurves:
                if fc.data_path == 'hide_render':
                    for k in fc.keyframe_points: k.interpolation = 'CONSTANT'

    def only_in(self, obj, f0, f1):
        self.key_vis(obj, 0, False); self.key_vis(obj, f0, True); self.key_vis(obj, f1 + 1, False)

    def grey(self, alias, f, amount):
        """Animate hero hair greyness (GreyAmt value nodes)."""
        rig, body, objs = self.chars[alias]
        for o in objs:
            if o.type != 'MESH': continue
            for ms in o.material_slots:
                m = ms.material
                if m and m.use_nodes and 'GreyAmt' in m.node_tree.nodes:
                    n = m.node_tree.nodes['GreyAmt']; n.outputs[0].default_value = amount * (0.55 if 'oustache' in m.name else 1.0)
                    n.outputs[0].keyframe_insert('default_value', frame=f)
                    for fc in m.node_tree.animation_data.action.fcurves:
                        for k in fc.keyframe_points: k.interpolation = 'CONSTANT'

# ---------------------------------------------------------- light presets for the terminal
def terminal_light(f, preset):
    P = {
        'day':     dict(area=900, sun=3.5, world=1.0, disc=9.0, glow=1.2, area_col=(1.0, 0.91, 0.8), sun_rot=(58, 0, 25)),
        'morning': dict(area=500, sun=1.6, world=0.55, disc=7.0, glow=0.6, area_col=(0.85, 0.92, 1.0), sun_rot=(80, 0, -20)),
        'evening': dict(area=650, sun=2.2, world=0.5, disc=9.0, glow=1.4, area_col=(1.0, 0.8, 0.6), sun_rot=(80, 0, 70)),
        'night':   dict(area=110, sun=0.0, world=0.05, disc=2.5, glow=0.25, area_col=(0.75, 0.82, 1.0), sun_rot=(80, 0, 25)),
        'modern':  dict(area=1000, sun=2.0, world=0.8, disc=12.0, glow=1.0, area_col=(0.95, 0.97, 1.0), sun_rot=(60, 0, 40)),
    }[preset]
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.name.startswith('CeilArea'):
            o.data.energy = P['area']; o.data.color = P['area_col']
            o.data.keyframe_insert('energy', frame=f); o.data.keyframe_insert('color', frame=f)
    sun = bpy.data.objects.get('Sun')
    if sun:
        sun.data.energy = P['sun']; sun.data.keyframe_insert('energy', frame=f)
        sun.rotation_euler = tuple(R(a) for a in P['sun_rot']); sun.keyframe_insert('rotation_euler', frame=f)
    w = bpy.context.scene.world
    bg = w.node_tree.nodes.get('BG')
    if bg:
        bg.inputs['Strength'].default_value = P['world']; bg.inputs['Strength'].keyframe_insert('default_value', frame=f)
    m = bpy.data.materials.get('CeilLight')
    if m:
        e = [n for n in m.node_tree.nodes if n.type == 'EMISSION'][0]
        e.inputs['Strength'].default_value = P['disc']; e.inputs['Strength'].keyframe_insert('default_value', frame=f)
    m = bpy.data.materials.get('ShopGlow')
    if m:
        e = [n for n in m.node_tree.nodes if n.type == 'EMISSION'][0]
        e.inputs['Strength'].default_value = P['glow']; e.inputs['Strength'].keyframe_insert('default_value', frame=f)

def set_clock(f, hours):
    """Key the hero clock hands to show `hours` (float, can exceed 12 for spinning)."""
    hp = bpy.data.objects.get('ClockHourPivot'); mp = bpy.data.objects.get('ClockMinPivot')
    if not hp: return
    hp.rotation_euler = (0, R(hours * 30.0), 0); hp.keyframe_insert('rotation_euler', frame=f)
    mp.rotation_euler = (0, R(hours * 360.0), 0); mp.keyframe_insert('rotation_euler', frame=f)

# ---------------------------------------------------------- crowd
PAX = ['Pax1', 'Pax2', 'Pax3', 'Pax4', 'Pax5', 'Pax6', 'Pax7', 'Pax8']

def crowd(ctx, f0, f1, lanes, seed=1, speed_mul=1.0, names=None, suitcases=True):
    """lanes: list of (y, direction(+1/-1), x_start, x_end, start_offset_frames)."""
    rnd = random.Random(seed)
    names = names or PAX
    actors = []
    for i, ln in enumerate(lanes):
        nm = names[i % len(names)]
        y, d, xs, xe, off = ln
        a = ctx.actor(nm, f0, f1, seed=seed * 13 + i)
        spd = rnd.uniform(1.25, 1.5) * speed_mul
        st = dict(arm=rnd.uniform(12, 18), bob=rnd.uniform(0.018, 0.026), lean=rnd.uniform(2, 6))
        pull = suitcases and rnd.random() < 0.45
        if pull: st['carry'] = 'R'
        stride = rnd.uniform(0.66, 0.76) * (1 if speed_mul < 2 else 1.0)
        start = f0 + off
        length = abs(xe - xs)
        # extend path so walkers never stop on screen
        a.walk(start, f1 + 2, [(xs, y), (xs + d * (length + 30), y + rnd.uniform(-0.3, 0.3))], speed=spd, stride=stride, ease=0, style=st, phase0=rnd.random())
        if start > f0:
            # before starting: stand off-screen at start point (hidden anyway)
            a.place(f0, xs, y, 0, math.degrees(math.atan2(d, 0)))
        a.idle.key(f0, 0.6)
        a.face(f0, mouthSmileLeft=rnd.uniform(0, 0.2), mouthSmileRight=rnd.uniform(0, 0.2))
        a.blinks(f0, f1)
        if pull:
            rig = a.rig
            tgt = a.ik_targets['R'][0]
            case = bpy.data.objects.get('Pull_' + nm)
            if case is None:
                import set_terminal as T
                cols = [(0.05, 0.05, 0.06), (0.35, 0.05, 0.05), (0.1, 0.15, 0.35), (0.25, 0.25, 0.27)]
                case = T.suitcase(None, coll('PROPS'), 'Pull_' + nm, (0.4, 0.23, 0.6), rnd.choice(cols), (0, 0, 0))
                hm = mat_color('CaseHandle', (0.03, 0.03, 0.03), rough=0.5)
                rod = cyl('Pull_' + nm + '_rod', 0.008, 0.45, loc=(0, 0, 0.5), mat=hm, c=coll('PROPS'), verts=6); rod.parent = case
                case.parent = tgt
                case.location = (0.0, 0.42, -0.55); case.rotation_euler = (R(-38), 0, R(90))
            ctx.only_in(case, f0, f1)
        a.bake(f0, f1)
        actors.append(a)
    return actors

# ---------------------------------------------------------- prop helpers
def _compile_actor(a):
    for c in a.obj_loc + [a.obj_rot]: c.compile()
    for ch in a.hand_ch.values():
        for c in ch: c.compile()

def char_to_world(a, f, p):
    """Character-space point -> world at frame f (uses the actor's placement channels)."""
    _compile_actor(a)
    ox, oy, oz = (c(f) if c.keys else 0.0 for c in a.obj_loc)
    rz = math.radians(a.obj_rot(f)) if a.obj_rot.keys else 0.0
    cs, sn = math.cos(rz), math.sin(rz)
    return Vector((ox + p[0] * cs - p[1] * sn, oy + p[0] * sn + p[1] * cs, oz + p[2])), rz

def hand_world(a, side, f, offset=(0, 0, 0)):
    _compile_actor(a)
    ch = a.hand_ch[side]
    dy = 0.0
    if 'root' in a.loc:
        a.loc['root'][1].compile(); dy = a.loc['root'][1](f)
    p = (ch[0](f) + offset[0], ch[1](f) + offset[1] + dy, ch[2](f) + offset[2])
    return char_to_world(a, f, p)

def key_prop_path(obj, frames_pos, rot=None):
    """frames_pos: list of (frame, Vector, rz or None)"""
    for f, p, rz in frames_pos:
        obj.location = p; obj.keyframe_insert('location', frame=f)
        if rz is not None and rot is not None:
            obj.rotation_euler = (rot[0], rot[1], rz + rot[2]); obj.keyframe_insert('rotation_euler', frame=f)
    if obj.animation_data and obj.animation_data.action:
        for fc in obj.animation_data.action.fcurves:
            for k in fc.keyframe_points: k.interpolation = 'LINEAR'

def follow_hand(obj, a, side, f0, f1, offset=(0, 0, 0), rot=(0, 0, 0), step=1):
    seq = []
    for f in range(f0, f1 + 1, step):
        p, rz = hand_world(a, side, f, offset)
        seq.append((f, p, rz))
    key_prop_path(obj, seq, rot)

def flash(ctx, f, loc, energy=500):
    """Press camera flash: a point light pulse."""
    name = 'Flash_%d' % f
    l = bpy.data.lights.new(name, 'POINT'); l.color = (0.92, 0.96, 1.0); l.shadow_soft_size = 0.05; l.use_shadow = False
    o = bpy.data.objects.new(name, l); ctx.scene.collection.objects.link(o); o.location = loc
    for fr, e in ((f - 1, 0), (f, energy), (f + 1, energy * 0.35), (f + 2, 0)):
        l.energy = e; l.keyframe_insert('energy', frame=fr)
    for fc in l.animation_data.action.fcurves:
        for k in fc.keyframe_points: k.interpolation = 'LINEAR'
