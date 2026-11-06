"""SH07 - "Exhaustion is one of the biggest killers out here," Drone tracking from behind and above as his stroke
slows; the camera climbs and falls back until he is a small figure in an endless sea."""
from common import *

def build():
    sc, c, o, sun = setup('SH07', tod='day', ocean='moderate', water_mode='opaque', vignette=0.3, sun_rot=math.radians(40))
    N = sc.frame_end   # 96
    c.condition(wet=1.0, fatigue=0.15)
    sw = ch.swim_crawl(c, rate=0.7, breathe_every=1, effort=0.8)
    c.add(sw)
    c.add_face(lambda f: dict(face('effort', 1.0), eyeBlinkLeft=0.7, eyeBlinkRight=0.7))
    speed = 0.6
    xy = lambda f: (0.0, -speed * f / 30.0)
    # legs ride a little lower (body tilted 74 deg, thighs dropped) so the kicking feet stay under the opaque surface
    # instead of breaking it as a detached foot behind him
    c.add(lambda f: {'upperleg01.L': R('X', -8), 'upperleg01.R': R('X', -8)})
    c.pivot_fn = lambda f: (Vector((0, 0, -0.07)), compose(R('Z', sw.roll(f) * 0.5), R('X', 74)))
    probe = finish(c, o, N, xy_fn=xy, inertia=(0.3, 0.6), radius=0.9)
    droplets(c, frames=(1, N), rate=90, speed=1.2)
    o['mat'].node_tree.nodes['collar_foam'].outputs[0].default_value = 0.4
    cam = env.add_camera('Cam', lens=28, clip=(0.3, 80000))
    aimt = cam_target(c.root, (0, -1.0, 0)); env.aim(cam, aimt)
    for f in range(1, N + 1, 2):
        k = ease((f - 1) / (N - 1))
        x, y = xy(f)
        env.key_loc(cam, f, Vector((1.5 + 3 * k, y + 6 + 22 * k, 6 + 34 * k)))
    env.handheld(cam, amp_loc=0.05, amp_rot=0.003, freq=0.3, seed=7)
    return sc
