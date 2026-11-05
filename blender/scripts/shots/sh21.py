"""SH21 - "The night is pitch black, except for plankton that glow every time you move."
Night: dark water under a sky of stars; every slow scull of his hands leaves sparks of blue-green light."""
from common import *

def build():
    sc, c, o, sun = setup('SH21', tod='night', ocean='glassy', water_mode='clear', vignette=0.5, water_kw={'near_transmission': 8.0},
                          world_kw={'strength': 0.32, 'camera_sky_boost': 1.8})
    N = sc.frame_end   # 156
    c.condition(wet=1.0, fatigue=0.7, sunburn=0.5, salt=0.4, cold=0.9)
    probe = tread_in_place(c, o, N, depth=-0.22, speed=0.55, effort=0.6, yaw=25, lean=6, breath_bpm=20)
    c.add(ch.shiver(lambda f: 0.7, seed=21))
    c.add_face(lambda f: face('cold', 0.85))
    c.add_face(ch.blinks(seed=21))
    finish(c, o, N, probe)
    glow_particles(c, ('wrist.L', 'wrist.R', 'lowerleg02.L', 'lowerleg02.R', 'foot.L', 'foot.R'), (1, N), rate=420, seed=21)
    # moonlight
    ld = bpy.data.lights.new('Moon', 'SUN'); ld.energy = 0.25; ld.color = (0.6, 0.72, 1.0); ld.angle = math.radians(0.6)
    moon = bpy.data.objects.new('Moon', ld); sc.collection.objects.link(moon); moon.rotation_euler = (math.radians(55), 0, math.radians(140))
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.0
    cam = env.add_camera('Cam', lens=32, dof={'fstop': 2.8})
    aimt = cam_target(c.root, (0, -0.25, -0.15)); env.aim(cam, aimt); cam.data.dof.focus_object = aimt
    for f in range(1, N + 1, 3):
        k = ease((f - 1) / (N - 1))
        env.key_loc(cam, f, Vector((0.8 - 0.2 * k, -1.7 + 0.2 * k, 1.25 - 0.15 * k)))
    ch.ride_swell(cam, probe, 1, N, amount=0.8, min_clear=0.3)
    env.handheld(cam, amp_loc=0.006, amp_rot=0.003, freq=0.4, seed=21)
    return sc
