"""Section 4b: the desert under a scorching sun."""
import math
from mathutils import Vector

from mcfilm import blcore as bc, direct as dr, props, worldgen as wg
from mcfilm.direct import keys, ease, seg, lerp, Path, Mover
from mcfilm.common import make_steve, EAST

A = bc.ANIM


def build_world():
    w = wg.desert()
    return w


def setup(d, w):
    gz = lambda x, y: w.top_z(x, y)
    steve = make_steve(d, worn=0.5, worn_sword=True)
    dust = props.Precip("dust", count=500, box=(30, 30, 10), speed=0.6, drift=(3.0, 0.5), seed=11)
    d.weather["dust"] = dust

    # ============================================================= D4  extreme wide
    p4 = Path([(196, 130.5), (203, 130.2)], w)
    m4 = Mover(steve, p4, [(0, 1.5)], gait="tired", surface="sand")

    def D4(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("desert")
        loc, yaw, s = ctx.walk(steve, m4, step_vol=0.3)
        cam = Vector((150, 70, gz(150, 70) + 38)) + Vector((6, 2, -1)) * ease(u)
        ctx.camera(cam, Vector(loc) + Vector((6, 0, 0)), lens=30, shake_amp=0.05, shake_freq=0.4)
        ctx.once(0.0, "amb_desert")

    # ============================================================= D5  exhausted close-up
    p5 = Path([(205, 130.5), (209.5, 130.4)], w)
    m5 = Mover(steve, p5, [(0, 1.2), (2.2, 1.0), (2.8, 0.2)], gait="tired", surface="sand")

    def D5(ctx):
        t = ctx.t
        ctx.light("desert", exposure=0.0)
        ctx.weather("dust", 1.0)
        loc, yaw, s = ctx.walk(steve, m5, extra={"head_pitch": keys(t, [(0, -15), (1.6, -18), (2.4, 12), (3, 8)]),
                                                 "arm_l": keys(t, [(0, 0), (1.8, 0), (2.4, 75), (3, 75)]),
                                                 "arm_l_out": -18 * seg(t, 1.8, 2.4)})
        cam = Vector(loc) + Vector((2.6, -0.9, 0.75))
        cam.z = max(cam.z, gz(cam.x, cam.y) + 0.6)
        ctx.camera(cam, Vector(loc) + Vector((0, 0, 1.45)), lens=38, shake_amp=0.02, focus=2.8, fstop=2.8)
        ctx.once(2.0, "exhale")

    return dict(D4=D4, D5=D5)
