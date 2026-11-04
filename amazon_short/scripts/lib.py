"""Shared helpers for every shot script (import with sys.path insert)."""
import bpy, math, os, random
from mathutils import Vector, Euler, Matrix

R = '/home/user/code/amazon_short/'
ASSETS = R + 'assets/'
BLEND = R + 'blend/'


# ------------------------------------------------------------------ scene / render
def new_scene(name='Shot', frames=(1, 100), res=(1080, 1920), fps=30):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene; s.name = name
    s.frame_start, s.frame_end = frames
    s.render.resolution_x, s.render.resolution_y = res
    s.render.fps = fps
    s.view_settings.view_transform = 'AgX'
    s.view_settings.look = 'AgX - Medium High Contrast'
    return s


def setup_cycles(samples=6, pct=50, denoise=True, bounces=(4, 1, 1, 2), motion_blur=True):
    s = bpy.context.scene
    s.render.engine = 'CYCLES'
    c = s.cycles
    c.device = 'CPU'; c.samples = samples; c.use_adaptive_sampling = True; c.adaptive_threshold = 0.04
    c.use_denoising = denoise; c.denoiser = 'OPENIMAGEDENOISE'; c.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    c.denoising_prefilter = 'ACCURATE'
    c.max_bounces, c.diffuse_bounces, c.glossy_bounces = bounces[0], bounces[1], bounces[2]
    c.transmission_bounces = bounces[3]; c.volume_bounces = 0
    c.caustics_reflective = False; c.caustics_refractive = False
    c.blur_glossy = 1.0
    c.use_light_tree = True
    c.texture_limit_render = '1024'; c.adaptive_threshold = 0.08; c.transparent_max_bounces = 6
    s.render.resolution_percentage = pct
    s.render.use_motion_blur = motion_blur; s.render.motion_blur_shutter = 0.5
    s.render.use_persistent_data = True
    s.render.film_transparent = False
    s.render.use_simplify = True; c.use_camera_cull = True; c.camera_cull_margin = 0.2
    c.ao_bounces_render = 1
    return s


# ------------------------------------------------------------------ appending
def append_collection(blend, name, link_to=None):
    with bpy.data.libraries.load(blend, link=False) as (src, dst):
        dst.collections = [name]
    col = dst.collections[0]
    (link_to or bpy.context.scene.collection).children.link(col)
    return col


def append_actions(names=None):
    with bpy.data.libraries.load(BLEND + 'anim_lib.blend', link=False) as (src, dst):
        dst.actions = [a for a in src.actions if names is None or a in names]
    return {a.name: a for a in dst.actions}


def get_character(link_to=None):
    col = append_collection(BLEND + 'char_explorer.blend', 'CH_Explorer', link_to)
    rig = [o for o in col.objects if o.type == 'ARMATURE'][0]
    rig.rotation_mode = 'XYZ'
    return col, rig


def set_condition(col, condition, sweat):
    for o in col.objects:
        if o.type == 'MESH':
            o['condition'] = condition; o['sweat'] = sweat


# ------------------------------------------------------------------ NLA animation
def assign_action(obj, action):
    ad = obj.animation_data or obj.animation_data_create()
    ad.action = action
    try:
        if action.slots: ad.action_slot = action.slots[0]
    except AttributeError: pass


def nla_strip(rig, action, start, repeat=1.0, scale=1.0, blend_in=6, blend_out=6, track=None, influence=None,
              frame_range=None, blend_type='REPLACE', extrapolation='HOLD_FORWARD'):
    ad = rig.animation_data or rig.animation_data_create()
    if track is None:
        track = ad.nla_tracks.new(); track.name = action.name
    st = track.strips.new(action.name, int(start), action)
    try:
        if action.slots and st.action_slot is None: st.action_slot = action.slots[0]
    except AttributeError: pass
    if frame_range:
        st.action_frame_start, st.action_frame_end = frame_range
    st.repeat = repeat; st.scale = scale
    st.blend_in = blend_in; st.blend_out = blend_out
    st.blend_type = blend_type; st.extrapolation = extrapolation
    st.use_auto_blend = False
    if influence is not None:
        st.use_animated_influence = True
        st.influence = influence
    return st, track


def look_at_rot(cam_loc, target):
    d = Vector(target) - Vector(cam_loc)
    return d.to_track_quat('-Z', 'Y').to_euler()


def camera(name, loc, target=None, lens=35, sensor=36, dof_obj=None, fstop=2.8):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.sensor_width = sensor; cd.sensor_fit = 'VERTICAL' if False else 'AUTO'
    cam = bpy.data.objects.new(name, cd); bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    if target is not None: cam.rotation_euler = look_at_rot(loc, target)
    if dof_obj is not None:
        cd.dof.use_dof = True; cd.dof.focus_object = dof_obj; cd.dof.aperture_fstop = fstop
    bpy.context.scene.camera = cam
    return cam


def empty(name, loc=(0, 0, 0), size=0.2):
    e = bpy.data.objects.new(name, None); e.empty_display_size = size; e.location = loc
    bpy.context.scene.collection.objects.link(e); return e


def key(obj, path, frame, value, interp='BEZIER', index=-1):
    if index >= 0:
        getattr(obj, path)[index] = value
    else:
        setattr(obj, path, value)
    obj.keyframe_insert(path, frame=frame, index=index)
    fc = obj.animation_data.action.fcurves
    for f in fc:
        if f.data_path == path:
            for kp in f.keyframe_points:
                if abs(kp.co[0] - frame) < 0.01: kp.interpolation = interp


def handheld(cam, f0, f1, amp=0.004, rot_amp=0.003, seed=1, freq=0.6):
    """Subtle hand-held noise via F-Curve noise modifiers (location + rotation)."""
    if not cam.animation_data or not cam.animation_data.action:
        cam.keyframe_insert('location', frame=f0); cam.keyframe_insert('rotation_euler', frame=f0)
    for i in range(3):
        for path, a in (('location', amp), ('rotation_euler', rot_amp)):
            fc = cam.animation_data.action.fcurves.find(path, index=i)
            if fc is None:
                cam.keyframe_insert(path, index=i, frame=f0); fc = cam.animation_data.action.fcurves.find(path, index=i)
            m = fc.modifiers.new('NOISE'); m.scale = 30 / freq; m.strength = a * 2; m.phase = seed * 13.7 + i * 5.1 + (0 if path == 'location' else 50)
            m.blend_in = 0; m.blend_out = 0
