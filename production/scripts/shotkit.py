"""Shot framework: one Blender scene per shot on the global timeline, shared set collections,
per-shot characters/cameras/lights/FX and a compositor grade."""
import bpy, json, math, random
from mathutils import Vector, Euler, Matrix
import ylib as Y

TL = json.load(open("/home/user/code/production/timeline.json"))
SHOT = {s["id"]: s for s in TL["shots"]}
RES = (576, 1024)
_sets = {}


def work_scene():
    sc = bpy.data.scenes.get("WORK") or bpy.context.scene
    sc.name = "WORK"
    return sc


def get_set(name, builder, **kw):
    key = name
    if key in _sets:
        return _sets[key]
    c = bpy.data.collections.new("SET_" + name)
    anchors = builder(c, **kw)
    _sets[key] = (c, anchors)
    return _sets[key]


def new_shot(sid, set_coll=None, samples=4):
    s = SHOT[sid]
    sc = bpy.data.scenes.new(sid)
    Y.setup_render(sc, res=RES, samples=samples)
    sc.frame_start, sc.frame_end = s["f0"], s["f1"]
    sc.render.fps = 30
    if set_coll is not None:
        sc.collection.children.link(set_coll)
    shot_c = bpy.data.collections.new(sid + "_SHOT")
    sc.collection.children.link(shot_c)
    sc["desc"] = s["desc"]
    sc.render.filepath = f"/home/user/code/production/renders/{sid}/####"
    sc.view_layers[0].use_pass_mist = True
    return sc, shot_c, s["f0"], s["f1"]


def sun(name, c, azimuth_deg, elevation_deg, energy=4.0, color=(1.0, 0.95, 0.88), angle=0.8):
    o = Y.light(name, 'SUN', (0, 0, 50), energy, color=color, size=angle, c=c)
    az, el = math.radians(azimuth_deg), math.radians(elevation_deg)
    d = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))  # direction TO the sun
    o.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    return o


def world(sc, name, hdri, strength=1.0, rot=0.0, tint=(1, 1, 1, 1), sat=1.0, mist=(5, 400)):
    w = Y.world_hdri(name, hdri, strength, rot, tint, sat)
    sc.world = w
    w.mist_settings.start = mist[0]
    w.mist_settings.depth = mist[1]
    w.mist_settings.falloff = 'QUADRATIC'
    return w


def comp(sc, fog=(0.75, 0.78, 0.82), fog_amt=0.35, bloom=0.35, lift=(1, 1, 1), gamma=(1, 1, 1), gain=(1, 1, 1),
         vignette=0.35, sat=1.0, exposure_keys=None, dispersion=0.004, contrast=0.0):
    # bloom / vignette / dispersion are applied in the numpy post pass (post.py) for speed;
    # store them on the scene so post.py can read them.
    sc["post_bloom"] = bloom
    sc["post_vignette"] = vignette
    bloom = 0
    vignette = 0
    dispersion = 0
    sc.use_nodes = True
    nt = sc.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new("CompositorNodeRLayers"); rl.scene = sc
    # mist fog
    mr = nt.nodes.new("CompositorNodeMapRange")
    mr.inputs["From Min"].default_value = 0; mr.inputs["From Max"].default_value = 1
    mr.inputs["To Min"].default_value = 0; mr.inputs["To Max"].default_value = fog_amt
    nt.links.new(rl.outputs["Mist"], mr.inputs["Value"])
    mix = nt.nodes.new("CompositorNodeMixRGB"); mix.blend_type = 'MIX'
    nt.links.new(mr.outputs[0], mix.inputs[0])
    nt.links.new(rl.outputs["Image"], mix.inputs[1])
    mix.inputs[2].default_value = (*fog, 1)
    last = mix.outputs[0]
    # exposure (animated for flashes / fades)
    ex = nt.nodes.new("CompositorNodeExposure")
    ex.name = "Exposure"
    nt.links.new(last, ex.inputs[0]); last = ex.outputs[0]
    if exposure_keys:
        for f, v in exposure_keys:
            ex.inputs[1].default_value = v
            ex.inputs[1].keyframe_insert("default_value", frame=f)
    if bloom > 0:
        g = nt.nodes.new("CompositorNodeGlare")
        g.glare_type = 'BLOOM'
        g.quality = 'MEDIUM'
        try:
            g.inputs["Strength"].default_value = bloom
            g.inputs["Threshold"].default_value = 0.85
            g.inputs["Size"].default_value = 0.6
        except Exception:
            g.mix = bloom - 1
            g.threshold = 0.85
        nt.links.new(last, g.inputs[0]); last = g.outputs[0]
    if dispersion:
        ld = nt.nodes.new("CompositorNodeLensdist")
        try:
            ld.inputs["Dispersion"].default_value = dispersion
            ld.inputs["Distortion"].default_value = 0.0
        except Exception:
            pass
        nt.links.new(last, ld.inputs[0]); last = ld.outputs[0]
    cb = nt.nodes.new("CompositorNodeColorBalance")
    cb.correction_method = 'LIFT_GAMMA_GAIN'
    cb.lift = lift; cb.gamma = gamma; cb.gain = gain
    nt.links.new(last, cb.inputs[1]); last = cb.outputs[0]
    hs = nt.nodes.new("CompositorNodeHueSat")
    try:
        hs.inputs["Saturation"].default_value = sat
    except Exception:
        pass
    nt.links.new(last, hs.inputs[0] if hs.inputs[0].name == "Image" else hs.inputs["Image"]); last = hs.outputs[0]
    if contrast:
        bc = nt.nodes.new("CompositorNodeBrightContrast")
        bc.inputs["Contrast"].default_value = contrast
        nt.links.new(last, bc.inputs[0]); last = bc.outputs[0]
    if vignette:
        em = nt.nodes.new("CompositorNodeEllipseMask")
        try:
            em.inputs["Size"].default_value = (0.95, 0.75)
        except Exception:
            em.width, em.height = 0.95, 0.75
        bl = nt.nodes.new("CompositorNodeBlur"); bl.filter_type = 'FAST_GAUSS'
        try:
            bl.inputs["Size"].default_value = (200, 300)
        except Exception:
            bl.size_x, bl.size_y = 200, 300
        nt.links.new(em.outputs[0], bl.inputs[0])
        vm = nt.nodes.new("CompositorNodeMixRGB"); vm.blend_type = 'MULTIPLY'
        inv = nt.nodes.new("CompositorNodeMapRange")
        inv.inputs["To Min"].default_value = 1 - vignette; inv.inputs["To Max"].default_value = 1
        nt.links.new(bl.outputs[0], inv.inputs[0])
        nt.links.new(inv.outputs[0], vm.inputs[0])
        nt.links.new(last, vm.inputs[1])
        vm.inputs[2].default_value = (0, 0, 0, 1)
        # MULTIPLY by black with fac -> darkens edges: use fac = 1 - mask
        sub = nt.nodes.new("CompositorNodeMath"); sub.operation = 'SUBTRACT'; sub.inputs[0].default_value = 1.0
        nt.links.new(inv.outputs[0], sub.inputs[1])
        nt.links.new(sub.outputs[0], vm.inputs[0])
        last = vm.outputs[0]
    out = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(last, out.inputs[0])
    return nt


def shake(cam, f0, f1, amp=0.01, rot_amp=0.3, freq=0.25, seed=1, envelope=None):
    """Handheld / impact shake: noise modifiers on the camera's own location/rotation fcurves."""
    if not cam.animation_data or not cam.animation_data.action:
        cam.keyframe_insert("location", frame=f0)
        cam.keyframe_insert("rotation_euler", frame=f0)
    rnd = random.Random(seed)
    for fc in Y._fcurves(cam.animation_data.action):
        if fc.data_path not in ("location", "rotation_euler"):
            continue
        md = fc.modifiers.new('NOISE')
        md.scale = 1 / freq * 3
        md.strength = (rot_amp * math.pi / 180 if fc.data_path == "rotation_euler" else amp) * 2
        md.phase = rnd.uniform(0, 100)
        md.blend_type = 'ADD'
        md.use_restricted_range = True
        md.frame_start, md.frame_end = f0, f1
        md.blend_in = md.blend_out = 3
    return cam


def track_cam(cam, target_obj, bone=None):
    con = cam.constraints.new('DAMPED_TRACK')
    con.target = target_obj
    if bone:
        con.subtarget = bone
    con.track_axis = 'TRACK_NEGATIVE_Z'
    return con


def keycam(cam, keys, lens_keys=None):
    """keys: (frame, loc, target)."""
    for f, loc, tgt in keys:
        cam.location = loc
        Y.look_at(cam, tgt)
        cam.keyframe_insert("location", frame=f)
        cam.keyframe_insert("rotation_euler", frame=f)
    if lens_keys:
        for f, l in lens_keys:
            cam.data.lens = l
            cam.data.keyframe_insert("lens", frame=f)
    for fc in Y._fcurves(cam.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.easing = 'AUTO'
            kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'


def focus_empty(name, c, parent=None, bone=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    c.objects.link(e)
    if parent:
        e.parent = parent
        if bone:
            e.parent_type = 'BONE'
            e.parent_bone = bone
    e.location = loc
    return e
