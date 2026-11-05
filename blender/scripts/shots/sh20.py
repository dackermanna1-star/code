"""SH20 - "In cold seas, hypothermia can kill within hours." Tight close-up in the last blue light: lips gone
pale-blue, jaw chattering, breath shuddering."""
from common import *

def build():
    sc, c, o, sun = setup('SH20', res=(648, 1152), tod='dusk', ocean='calm', water_mode='clear', vignette=0.48, sun_toward=(0.8, -0.6), grade='night')
    N = sc.frame_end   # 123
    c.condition(wet=1.0, fatigue=0.65, sunburn=0.5, salt=0.35, cold=0.85)
    tw = ch.tread_water(c, 1, N, speed=0.6, effort=0.3)
    c.add(lambda f: {k: v for k, v in tw(f).items() if 'leg' in k or 'foot' in k})
    c.add(KeyPoses([(1, ch.hug_shiver_pose()), (N, ch.hug_shiver_pose())]))
    c.add(lambda f: {'neck01': R('X', -12), 'head': R('X', -8)})
    c.add(ch.shiver(lambda f: 1.2, seed=20))
    c.add(ch.breathing(rate_bpm=30, depth=1.4))
    c.add_face(lambda f: dict(face('cold', 1.0), jawOpen=0.03 + 0.05 * abs(ch.smooth_noise(f / 30, 7, 13))))
    c.add_face(lambda f: {'eyeSquintLeft': -0.22, 'eyeSquintRight': -0.22, 'eyeWideLeft': 0.18, 'eyeWideRight': 0.18})   # eyes read, not slits
    c.add_face(ch.blinks(seed=20, mean_gap=2.0))
    c.add(ch.look(ch.saccades(seed=20, spread=7, hold=(15, 35))))
    c.pivot_fn = lambda f: (Vector((0, 0, -0.21)), compose(R('X', 7), R('Z', 25)))      # water at the collarbones: hides the neckline
    probe = finish(c, o, N, inertia=(0.25, 0.55))
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.25
    cam = env.add_camera('Cam', lens=85, dof={'fstop': 1.8})
    cam.data.dof.focus_object = cam_target(c.rig, (0, 0, 0), bone='eye.L')
    aimt = cam_target(c.root, (0, -0.07, 0.19)); env.aim(cam, aimt)
    # small cool fill near the lens: a catchlight in the eyes and a little shape on the face in the last light
    lt = bpy.data.lights.new('EyeFill', 'POINT'); lt.energy = 4.0; lt.shadow_soft_size = 0.08; lt.color = (0.8, 0.88, 1.0)
    lo = bpy.data.objects.new('EyeFill', lt); sc.collection.objects.link(lo); lo.parent = cam; lo.location = (0.12, 0.1, 0.0)
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((0.6 - 0.1 * k, -1.5 + 0.2 * k, 0.2)))
    ch.ride_swell(cam, probe, 1, N, amount=0.9, min_clear=0.2)
    env.handheld(cam, amp_loc=0.004, amp_rot=0.002, freq=0.4, seed=20)
    return sc
