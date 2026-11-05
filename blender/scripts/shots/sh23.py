"""SH23 - "Some survivors have seen ships and land that weren't there."
Misty morning, over his shoulder: a cargo ship materialises on the hazy horizon, shimmers... and dissolves."""
from common import *
import marine

def build():
    sc, c, o, sun = setup('SH23', tod='misty', ocean='calm', water_mode='opaque', vignette=0.42, grade='overcast')
    N = sc.frame_end   # 102
    c.condition(wet=1.0, fatigue=0.9, sunburn=0.6, salt=0.65)
    probe = tread_in_place(c, o, N, depth=-0.25, speed=0.5, effort=0.35, yaw=180, lean=3)
    c.add(KeyPoses([(1, {'head': [('X', 8)]}), (30, {'head': [('X', -4)], 'neck01': [('X', -4)]}), (102, {'head': [('X', -2)]})]))
    finish(c, o, N, probe)
    objs = marine.import_glb('cargoship', 'Props')
    ship = marine.make_root(objs, 'Ship')
    ship.location = (140, 1100, -40.5); ship.rotation_euler = (0, 0, math.radians(15))
    # mirage: every ship material fades in/out and shimmers
    for o_ in objs:
        if o_.type != 'MESH': continue
        for sl in o_.material_slots:
            m = sl.material
            if m is None or m.get('mirage'): continue
            m['mirage'] = True
            nt = m.node_tree; out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
            src = out.inputs['Surface'].links[0].from_socket
            tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader'); mx.name = 'fade'
            nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(src, mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs['Surface'])
            for f in range(1, N + 1, 2):
                base = ease((f - 8) / 25) * (1 - ease((f - 58) / 30))
                v = base * (0.75 + 0.25 * math.sin(f * 1.7) * math.sin(f * 0.53))
                mx.inputs[0].default_value = max(0.0, min(1.0, v)); mx.inputs[0].keyframe_insert('default_value', frame=f)
    for f in range(1, N + 1, 2):
        ship.scale = (1.0, 1.0, 1.0 + 0.05 * math.sin(f * 0.9)); ship.keyframe_insert('scale', frame=f)
    o['mat'].node_tree.nodes['haze_amount'].outputs[0].default_value = 1.0
    cam = env.add_camera('Cam', lens=90, dof={'fstop': 4.0, 'dist': 400.0}, clip=(0.1, 80000))
    aimt = cam_target(None, (120, 1100, 14)); env.aim(cam, aimt)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((-0.25, -0.75 - 0.1 * k, 0.32)))
    ch.ride_swell(cam, probe, 1, N, amount=0.85, min_clear=0.15)
    env.handheld(cam, amp_loc=0.005, amp_rot=0.002, freq=0.4, seed=23)
    return sc
