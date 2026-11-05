"""SH06 - "So you swim, toward nothing."  Tracking shot alongside a frantic front crawl, water flying off his arms."""
from common import *

def build():
    sc, c, o, sun = setup('SH06', tod='day', ocean='moderate', water_mode='clear', vignette=0.3, sun_rot=math.radians(40))
    N = sc.frame_end   # 63
    c.condition(wet=1.0)
    sw = ch.swim_crawl(c, rate=0.95, breathe_every=2, effort=1.2)
    c.add(sw)
    c.add_face(expression([(1, face('effort', 1.0)), (63, face('effort', 1.0))]))
    c.add_face(lambda f: {'eyeBlinkLeft': 0.7, 'eyeBlinkRight': 0.7})
    speed = 0.95   # m/s, frantic but untrained
    xy = lambda f: (0.0, -speed * f / 30.0)
    c.pivot_fn = lambda f: (Vector((0, 0, -0.05 + 0.03 * math.sin(f * 0.4))), compose(R('Z', sw.roll(f) * 0.55), R('X', 84)))  # roll about the long axis)
    probe = finish(c, o, N, xy_fn=xy, inertia=(0.3, 0.6), radius=0.9)
    droplets(c, frames=(1, N), rate=220, speed=1.8)
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.6
    o['mat'].node_tree.nodes['ripple_amp'].outputs[0].default_value = 2.0
    cam = env.add_camera('Cam', lens=30, dof={'fstop': 3.2})
    aimt = cam_target(c.root, (0, 0.25, 0.1)); env.aim(cam, aimt); cam.data.dof.focus_object = aimt
    for f in range(1, N + 1, 2):
        x, y = xy(f)
        env.key_loc(cam, f, Vector((2.2, y - 1.0 - 0.4 * f / N, 0.62)))
    ch.ride_swell(cam, probe, 1, N, amount=0.85, min_clear=0.18)
    env.handheld(cam, amp_loc=0.02, amp_rot=0.008, freq=0.9, seed=6)
    return sc
