"""Shot toolkit: timeline lookup, character locomotion on terrain, additive pose layers, render setup."""
import bpy, json, math, random, sys, os
from mathutils import Vector, Euler, Quaternion, Matrix, noise
from lib import *
import env as ENV

TL = json.load(open(R + 'scripts/timeline.json'))
SHOTS = {s['id']: s for s in TL['shots']}
WALK_SPEED = 1.3 / 40.0   # metres per frame for UAL Walk_Loop at 30 fps (from root-motion clip)
CYCLE = {'UAL_Walk_Loop': (40, 1.3), 'UAL_Zombie_Walk_Fwd_Loop': (40, 1.4), 'UAL_Crouch_Fwd_Loop': (60, 1.5),
         'UAL_Walk_Carry_Loop': (60, 1.3), 'UAL_Jog_Fwd_Loop': (28, 5.0 * 0.6), 'UAL_Push_Loop': (80, 0.8)}


def setup(sid, samples=6, pct=50, extra_frames=0):
    sh = SHOTS[sid]
    s = new_scene(sid, (1, sh['frames'] + extra_frames))
    setup_cycles(samples, pct)
    out = f'{R}renders/shots/{sid}/'
    os.makedirs(out, exist_ok=True)
    s.render.filepath = out + 'f_'
    s.render.image_settings.file_format = 'PNG'; s.render.image_settings.color_depth = '8'
    s['shot'] = sid
    return s, sh


def finish(s, sid, save=True):
    if save:
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=f'{BLEND}shots/{sid}.blend', compress=True)


def render_if_requested():
    if '--render' in sys.argv:
        bpy.ops.render.render(animation=True)
    if '--still' in sys.argv:
        f = int(sys.argv[sys.argv.index('--still') + 1])
        s = bpy.context.scene; s.frame_set(f)
        s.render.filepath = f'{R}renders/tests/{s.name}_{f}.png'
        bpy.ops.render.render(write_still=True)


# ------------------------------------------------------------------ character
def character(cond=0.0, sweat=0.0, actions=None):
    col, rig = get_character()
    set_condition(col, cond, sweat)
    acts = append_actions(actions)
    for o in col.objects:
        if o.type == 'MESH': o.cycles.use_motion_blur = True
        if o.name.startswith('PR_Bottle'): o.hide_render = True
    return col, rig, acts


def polyline_eval(pts, d):
    """Point and tangent at arc length d along polyline pts (Vectors)."""
    acc = 0
    for i in range(len(pts) - 1):
        seg = (pts[i + 1] - pts[i]).length
        if acc + seg >= d or i == len(pts) - 2:
            t = (d - acc) / max(seg, 1e-6); t = max(0, min(1, t))
            return pts[i].lerp(pts[i + 1], t), (pts[i + 1] - pts[i]).normalized()
        acc += seg
    return pts[-1], (pts[-1] - pts[-2]).normalized()


def polyline_len(pts):
    return sum((pts[i + 1] - pts[i]).length for i in range(len(pts) - 1))


def smooth_path(pts, iters=3):
    """Chaikin smoothing for natural curved walking paths."""
    P = [Vector((p[0], p[1], 0)) for p in pts]
    for _ in range(iters):
        Q = [P[0]]
        for i in range(len(P) - 1):
            Q += [P[i].lerp(P[i + 1], 0.25), P[i].lerp(P[i + 1], 0.75)]
        Q.append(P[-1]); P = Q
    return P


def heading(tangent):
    # rig faces -Y in rest pose
    return math.atan2(tangent.x, -tangent.y)


def locomote(rig, terrain, pts, f0, f1, action, ease_in=10, ease_out=12, track=None, z_off=0.0, start_d=0.0, blend=6,
             turn_lag=0.85, backward=False):
    """Move rig along pts between f0..f1 with ease, play locomotion clip with stride-matched speed.
    Keys world location + yaw every frame (terrain following)."""
    P = smooth_path(pts)
    Ltot = polyline_len(P) - start_d
    n = f1 - f0
    # ease profile: distance fraction s(t) with linear middle
    def sfrac(t):
        a = ease_in / n; b = ease_out / n
        # piecewise: accelerate, cruise, decelerate (normalised so s(1)=1)
        v = 1.0 / (1 - a / 2 - b / 2)
        if t < a: return v * t * t / (2 * a)
        if t > 1 - b: return 1 - v * (1 - t) ** 2 / (2 * b)
        return v * (t - a / 2)
    yaw_prev = None
    for f in range(f0, f1 + 1):
        t = (f - f0) / n
        d = start_d + Ltot * sfrac(t)
        p, tan = polyline_eval(P, d)
        z = ENV.height_at(terrain, p.x, p.y) + z_off
        yaw = heading(tan) + (math.pi if backward else 0.0)
        if yaw_prev is not None:
            while yaw - yaw_prev > math.pi: yaw -= math.tau
            while yaw - yaw_prev < -math.pi: yaw += math.tau
            yaw = yaw_prev + (yaw - yaw_prev) * turn_lag
        yaw_prev = yaw
        rig.location = (p.x, p.y, z); rig.rotation_euler = (0, 0, yaw)
        rig.keyframe_insert('location', frame=f); rig.keyframe_insert('rotation_euler', frame=f)
    cyc_f, cyc_m = CYCLE[action]
    speed = Ltot / max(1, (n - ease_in / 2 - ease_out / 2))  # m / frame cruise
    scale = (cyc_m / cyc_f) / max(speed, 1e-4)
    return speed, scale


def place(rig, terrain, x, y, yaw_deg, f=None, z_off=0.0):
    rig.location = (x, y, ENV.height_at(terrain, x, y) + z_off); rig.rotation_euler = (0, 0, math.radians(yaw_deg))
    if f is not None:
        rig.keyframe_insert('location', frame=f); rig.keyframe_insert('rotation_euler', frame=f)


def clip(rig, acts, name, start, dur=None, repeat=None, scale=1.0, blend_in=6, blend_out=6, frange=None, influence=None, blend_type='REPLACE', reverse=False):
    a = acts['UAL_' + name] if not name.startswith('UAL_') else acts[name]
    ad = rig.animation_data or rig.animation_data_create()
    tr = ad.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, int(start), a)
    try:
        if a.slots: st.action_slot = a.slots[0]
    except AttributeError: pass
    if frange: st.action_frame_start, st.action_frame_end = frange
    st.scale = scale
    alen = (st.action_frame_end - st.action_frame_start) * scale
    if repeat is None and dur is not None: repeat = max(0.05, dur / alen)
    st.repeat = repeat or 1.0
    st.blend_in = blend_in; st.blend_out = blend_out; st.use_auto_blend = False
    st.blend_type = blend_type; st.extrapolation = 'HOLD_FORWARD' if blend_out == 0 else 'NOTHING'
    st.use_reverse = reverse
    if influence is not None:
        st.use_animated_influence = True
        for f, v in influence:
            st.influence = v; st.keyframe_insert('influence', frame=f)
    return st


def hold_first(rig):
    """First track holds before its start so nothing pops to rest pose."""
    ad = rig.animation_data
    if ad and ad.nla_tracks:
        st = ad.nla_tracks[0].strips[0]; st.extrapolation = 'HOLD'; st.blend_in = 0


# ------------------------------------------------------------------ pose layers (COMBINE = additive for quaternions)
def pose_layer(rig, name, keys, blend='COMBINE', interp='BEZIER'):
    """keys: {bone: [(frame, (x, y, z) degrees), ...]} local-euler offsets -> quaternion action on its own NLA track."""
    act = bpy.data.actions.new(name)
    ad = rig.animation_data or rig.animation_data_create()
    for bone, kl in keys.items():
        path = f'pose.bones["{bone}"].rotation_quaternion'
        fcs = [act.fcurves.new(path, index=i, action_group=bone) for i in range(4)]
        prev = None
        for f, e in kl:
            q = Euler([math.radians(v) for v in e], 'XYZ').to_quaternion()
            if prev is not None and prev.dot(q) < 0: q.negate()
            prev = q
            for i in range(4):
                kp = fcs[i].keyframe_points.insert(f, q[i]); kp.interpolation = interp
    tr = ad.nla_tracks.new(); tr.name = name
    f0 = min(k[0] for kl in keys.values() for k in kl)
    st = tr.strips.new(name, int(f0), act)
    try:
        if act.slots: st.action_slot = act.slots[0]
    except AttributeError: pass
    st.blend_type = blend; st.extrapolation = 'HOLD_FORWARD'; st.blend_in = st.blend_out = 0
    # strip must start at first key; shift action so frame mapping is identity
    st.action_frame_start = f0
    return st


def loc_layer(rig, name, keys, blend='COMBINE'):
    """keys: {bone: [(frame, (x,y,z) metres)]} location offsets."""
    act = bpy.data.actions.new(name); ad = rig.animation_data or rig.animation_data_create()
    for bone, kl in keys.items():
        fcs = [act.fcurves.new(f'pose.bones["{bone}"].location', index=i, action_group=bone) for i in range(3)]
        for f, v in kl:
            for i in range(3): fcs[i].keyframe_points.insert(f, v[i])
    tr = ad.nla_tracks.new(); tr.name = name
    f0 = min(k[0] for kl in keys.values() for k in kl)
    st = tr.strips.new(name, int(f0), act)
    try:
        if act.slots: st.action_slot = act.slots[0]
    except AttributeError: pass
    st.blend_type = blend; st.extrapolation = 'HOLD_FORWARD'; st.action_frame_start = f0
    return st


def look_keys(keys, neck_share=0.4):
    """keys [(frame, yaw, pitch, roll)] -> split between neck_01 and Head. yaw = +Y (turn), pitch = +X (nod down)."""
    nk, hd = [], []
    for f, yaw, pitch, *roll in keys:
        r = roll[0] if roll else 0
        nk.append((f, (pitch * neck_share, yaw * neck_share, r * neck_share)))
        hd.append((f, (pitch * (1 - neck_share), yaw * (1 - neck_share), r * (1 - neck_share))))
    return {'neck_01': nk, 'Head': hd}


def breathing(f0, f1, period=60, amp=2.0, seed=0):
    """Chest rise: spine_03 pitch + clavicle lift oscillation."""
    sp, cl, cr = [], [], []
    f = f0
    while f <= f1:
        ph = 2 * math.pi * (f - f0) / period
        v = math.sin(ph) * amp
        sp.append((f, (-v * 0.6, 0, 0))); cl.append((f, (v * 0.8, 0, 0))); cr.append((f, (v * 0.8, 0, 0)))
        f += max(2, period // 8)
    return {'spine_03': sp, 'clavicle_l': cl, 'clavicle_r': cr}


def shiver(f0, f1, amp=1.2, step=2, seed=0, bones=('spine_02', 'spine_03', 'neck_01', 'upperarm_l', 'upperarm_r', 'clavicle_l', 'clavicle_r')):
    out = {}
    for bi, b in enumerate(bones):
        kl = []
        for f in range(f0, f1 + 1, step):
            n = Vector((noise.noise(Vector((f * 0.45, bi * 3.1, seed))), noise.noise(Vector((f * 0.5 + 9, bi * 1.7, seed))), noise.noise(Vector((f * 0.4 + 19, bi * 2.3, seed)))))
            kl.append((f, tuple(n * amp * (1.6 if 'arm' in b else 1.0))))
        out[b] = kl
    return out


def merge(*dicts):
    out = {}
    for d in dicts:
        for k, v in d.items():
            out.setdefault(k, []).extend(v)
    for k in out: out[k].sort(key=lambda x: x[0])
    # merge duplicates frames by summing rotations
    for k, kl in out.items():
        m = {}
        for f, e in kl:
            if f in m: m[f] = tuple(a + b for a, b in zip(m[f], e))
            else: m[f] = e
        out[k] = sorted(m.items())
    return out


# ------------------------------------------------------------------ props / helpers
def bottle_to_hand(col, rig, f_on=None, visible=True, hand='hand_r', loc=(0.0, 0.08, 0.03), rot=(90, 0, 0)):
    b = col.objects.get('PR_Bottle')
    b.hide_render = not visible
    for c in col.objects:
        if c.name.startswith('PR_Bottle_Cap'): c.hide_render = not visible
    ch = b.constraints[0]; ch.subtarget = hand
    b.location = loc; b.rotation_euler = [math.radians(v) for v in rot]
    return b


def cam_path(cam, keys, interp='BEZIER'):
    """keys [(frame, loc, target)] -> camera location/rotation keys aimed at targets."""
    for f, loc, tgt in keys:
        cam.location = loc; cam.rotation_euler = look_at_rot(loc, tgt)
        cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f)
    for fc in cam.animation_data.action.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = interp


def track_cam(cam, target_obj, bone=None):
    c = cam.constraints.new('DAMPED_TRACK'); c.target = target_obj; c.track_axis = 'TRACK_NEGATIVE_Z'
    if bone: c.subtarget = bone
    return c


def focus_on(cam, obj, bone=None, fstop=2.8):
    cam.data.dof.use_dof = True; cam.data.dof.focus_object = obj; cam.data.dof.aperture_fstop = fstop
    if bone: cam.data.dof.focus_subtarget = bone


def day_light(sun_e=4.5, sun_rot=(35, 0, 200), hdri_s=0.8, hdri_rot=1.0, sun_col=(1.0, 0.93, 0.82), hdri='rainforest_trail_2k.hdr', tint=(1, 1, 1, 1),
              fill=6000, fill_col=(0.85, 1.0, 0.85), exposure=0.6, center=(0, 0)):
    ENV.world_hdri(hdri_s * 1.6, hdri_rot, hdri, tint)
    bpy.context.scene.view_settings.exposure = exposure
    if fill > 0:  # light filtering down through the leaf ceiling (soft, slightly green)
        l = bpy.data.lights.new('CanopyFill', 'AREA'); l.shape = 'SQUARE'; l.size = 30; l.energy = fill; l.color = fill_col
        o = bpy.data.objects.new('LT_CanopyFill', l); o.location = (center[0], center[1], 13); bpy.context.scene.collection.objects.link(o)
    return ENV.sun(sun_e * 1.4, tuple(math.radians(v) for v in sun_rot), sun_col)


def forest_cfg(**kw):
    cfg = dict(center=(0, 0), size=60, seed=3, res=0.3, n_giants=5, n_poles=45, wet=0.3, near=15, far=35, n_lianas=25)
    cfg.update(kw); return cfg


def clear_view(cam_xy, subj_xy, r_cam=2.6, r_line=1.3, r_subj=1.6, n=6):
    """Circles that keep vegetation out of the camera -> subject sight line."""
    a, b = Vector(cam_xy[:2]), Vector(subj_xy[:2])
    out = [(a.x, a.y, r_cam), (b.x, b.y, r_subj)]
    for i in range(1, n):
        p = a.lerp(b, i / n); out.append((p.x, p.y, r_line))
    return out


def wound_decal(col, rig, bone='lowerarm_r', loc=(0.0, 0.14, 0.035), size=0.05, severity=1.0):
    """Red swollen cut: small decal plane wrapped onto the forearm skin."""
    m = bpy.data.materials.new('MAT_Wound'); m.use_nodes = True; nt = m.node_tree; L = nt.links.new; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Location'].default_value = (-0.5, -0.5, 0); mp.inputs['Scale'].default_value = (1, 3.2, 1)
    L(tc.outputs['UV'], mp.inputs[0])
    ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; L(mp.outputs[0], ln.inputs[0])
    cr = nt.nodes.new('ShaderNodeValToRGB'); e = cr.color_ramp.elements
    e[0].position = 0.0; e[0].color = (0.18, 0.015, 0.01, 1); e[1].position = 0.5; e[1].color = (0.7, 0.32, 0.25, 1)
    k = e.new(0.08); k.color = (0.35, 0.03, 0.02, 1); k2 = e.new(0.28); k2.color = (0.62, 0.12, 0.08, 1)
    L(ln.outputs['Value'], cr.inputs[0]); L(cr.outputs[0], b.inputs['Base Color'])
    al = nt.nodes.new('ShaderNodeMapRange'); L(ln.outputs['Value'], al.inputs[0]); al.inputs[1].default_value = 0.32; al.inputs[2].default_value = 0.5
    al.inputs[3].default_value = severity; al.inputs[4].default_value = 0.0; L(al.outputs[0], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = 0.25; b.inputs['Subsurface Weight'].default_value = 0.2
    bu = nt.nodes.new('ShaderNodeBump'); bu.inputs['Strength'].default_value = 0.6; inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 0.5
    L(ln.outputs['Value'], inv.inputs[1]); L(inv.outputs[0], bu.inputs['Height']); L(bu.outputs[0], b.inputs['Normal'])
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=12, y_subdivisions=12, size=size)
    d = bpy.context.active_object; d.name = 'FX_Wound'; d.data.materials.append(m)
    ch = d.constraints.new('CHILD_OF'); ch.target = rig; ch.subtarget = bone; ch.inverse_matrix.identity()
    d.location = loc; d.rotation_euler = (math.radians(90), 0, 0)
    arms = col.objects['CH_Arms']
    sw = d.modifiers.new('wrap', 'SHRINKWRAP'); sw.target = arms; sw.wrap_method = 'NEAREST_SURFACEPOINT'; sw.offset = 0.0015
    return d
