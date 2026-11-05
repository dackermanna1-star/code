"""Shared river-bank set S31–S33: forest edge opening onto a wide brown river (south, -Y) at golden hour."""
from shotlib import *
import creatures as CR
RY = -6.0   # river edge line
def build(cam_xy, seed=311, extra_clear=()):
    cfg = forest_cfg(seed=seed, cam=(cam_xy[0], cam_xy[1], 1.2), center=(0, 6), size=70, density=1.15, clear=list(extra_clear),
                     river=dict(y=RY, level=-0.95), giants=[(-7, 6, 1.5), (8, 9, 1.3), (-15, 3, 1.2)], n_poles=55, wet=0.5, near=20, far=45)
    E = ENV.build_env(cfg)
    import aerial as AE
    far = AE.build_aerial(dict(center=(0, -930), size=1640, res=4.0, seed=seed, mist=0.0, mist_levels=[], bank_north=-112))
    far['canopy'].location.z = -2.0
    west = AE.build_aerial(dict(center=(-640, 560), size=1200, res=4.0, seed=seed + 1, mist=0.0, mist_levels=[], bank_south=-8))
    west['canopy'].name = 'AER_WestBank'; west['canopy'].location.z = -2.0
    rm = bpy.data.materials.get('MAT_River')
    if rm:
        b = rm.node_tree.nodes['Principled BSDF']; b.inputs['Transmission Weight'].default_value = 0.0; b.inputs['Roughness'].default_value = 0.06
    rp = bpy.data.objects.get('ENV_RiverWater')
    if rp: rp.scale = (3000, 3000, 1); rp.location = (0, RY - 1500, rp.location.z)
    ENV.world_hdri(0.9, 0.6, 'qwantani_sunset_puresky_2k.hdr', (0.7, 0.85, 1.05, 1))
    bpy.context.scene.view_settings.exposure = 0.35
    sun = ENV.sun(3.5, (math.radians(78), 0, math.radians(-35)), (1.0, 0.66, 0.38), 1.0)
    fl = bpy.data.lights.new('CanopyFill', 'AREA'); fl.size = 30; fl.energy = 3500; fl.color = (1.0, 0.85, 0.7)
    fo = bpy.data.objects.new('LT_CanopyFill', fl); fo.location = (0, 6, 13); bpy.context.scene.collection.objects.link(fo)
    return E


def boat_with_driver(path_keys, wave_frames=None):
    """Dugout with long-tail motor + seated driver (Boatwoman). path_keys [(frame, (x,y), yaw_deg)]."""
    boat = CR.dugout_boat('PR_Boat', length=6.5)
    for f, (x, y), yaw in path_keys:
        boat.location = (x, y, -0.78); boat.rotation_euler = (0, 0, math.radians(yaw))
        boat.keyframe_insert('location', frame=f); boat.keyframe_insert('rotation_euler', frame=f)
    # gentle bob
    for i in (0, 1):
        fc = boat.animation_data.action.fcurves.find('rotation_euler', index=i)
        m = fc.modifiers.new('NOISE'); m.scale = 25; m.strength = 0.025; m.phase = i * 7
    fc = boat.animation_data.action.fcurves.find('location', index=2); m = fc.modifiers.new('NOISE'); m.scale = 20; m.strength = 0.03
    col = append_collection(BLEND + 'char_boatwoman.blend', 'CH_Boatwoman')
    rig = [o for o in col.objects if o.type == 'ARMATURE'][0]; rig.rotation_mode = 'XYZ'
    for o in col.objects:
        if o.name.startswith('PR_Bottle'): o.hide_render = True
    set_condition(col, 0.05, 0.1)
    rig.parent = boat; rig.location = (-2.4, 0, -0.05); rig.rotation_euler = (0, 0, math.radians(90))
    acts = append_actions(['UAL_Sitting_Idle_Loop'])
    clip(rig, acts, 'Sitting_Idle_Loop', 1, dur=400, blend_in=0, blend_out=0)
    if wave_frames:
        f0, f1 = wave_frames; keys = [(1, (0, 0, 0)), (f0, (0, 0, 0))]; lk = [(1, (0, 0, 0)), (f0, (0, 0, 0))]
        f = f0 + 8; k = 0
        while f < f1:
            keys.append((f, (15, 0, -135 + (15 if k % 2 else -15)))); lk.append((f, (0, 0, -30))); f += 10; k += 1
        pose_layer(rig, 'wave', {'upperarm_r': keys, 'lowerarm_r': lk})
    # wake foam strip behind the boat
    wk = bpy.data.materials.new('MAT_Wake'); wk.use_nodes = True; b = wk.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.8, 0.76, 0.66, 1); b.inputs['Alpha'].default_value = 0.35; b.inputs['Roughness'].default_value = 0.4
    return boat, rig
