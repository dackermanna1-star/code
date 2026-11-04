"""Section 4c: pushing through the dense jungle."""
import math
from mathutils import Vector

from mcfilm import blcore as bc, characters as ch, direct as dr, props, worldgen as wg
from mcfilm.direct import keys, ease, seg, lerp, Path, Mover
from mcfilm.common import make_steve, EAST

A = bc.ANIM


def build_world():
    w = wg.jungle()
    wg.clear_plants(w, [(x, 96.6, 1.0) for x in range(60, 90, 2)])
    return w


def setup(d, w):
    gz = lambda x, y: w.top_z(x, y)
    steve = make_steve(d, worn=0.55, worn_sword=True)
    birds = [d.add_rig(ch.bird(f"parrot{i}", color=(0.85, 0.12, 0.1) if i % 2 else (0.1, 0.55, 0.85), size=0.12))
             for i in range(4)]
    flock = props.Flock(birds)

    # ============================================================= D6  pushing through
    p6 = Path([(66, 100.5), (72, 100.2), (78, 100.8)], w)
    m6 = Mover(steve, p6, [(0, 1.5)], gait="tired", surface="grass")

    def D6(ctx):
        t = ctx.t
        ctx.light("jungle")
        slash = keys(t, [(1.4, 20), (1.6, 130), (1.8, 10), (2.2, 20)]) if 1.4 < t < 2.2 else 25
        loc, yaw, s = ctx.walk(steve, m6, extra={"arm_r": slash, "arm_l": 55, "arm_l_out": -8,
                                                 "head_yaw": 20 * math.sin(t * 1.1)})
        cam = Vector((loc[0] - 0.6, 96.7, gz(loc[0], 96.7) + 1.5))
        ctx.camera(cam, Vector(loc) + Vector((0.8, 0, 1.0)), lens=30, shake_amp=0.05, shake_freq=1.0)
        ctx.once(0.0, "amb_jungle")
        ctx.once(1.5, "sword_swing")

    # ============================================================= D7  aerial over the canopy
    p7 = Path([(80, 100.5), (86, 100.4)], w)
    m7 = Mover(steve, p7, [(0, 1.5)], gait="tired", surface="grass")

    def D7(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("jungle", fog_density=0.006, fog_start=30)
        loc, yaw, s = ctx.walk(steve, m7, step_vol=0.2)
        cam = Vector((70, 88, gz(80, 100) + 34)) + Vector((10, 2, 2)) * ease(u)
        ctx.camera(cam, Vector(loc) + Vector((4, 0, 0)), lens=26, shake_amp=0.1, shake_freq=0.4)
        flock.update(ctx, (60, 120, gz(80, 100) + 28), (110, 80, gz(80, 100) + 30), 0.0, 3.0)

    return dict(D6=D6, D7=D7)
