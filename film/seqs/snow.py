"""Section 4a: out of the cave into a vast snowy landscape, then a blizzard on the mountain."""
import math
from mathutils import Vector

from mcfilm import blcore as bc, direct as dr, props, worldgen as wg
from mcfilm.direct import keys, ease, seg, lerp, Path, Mover, mix_light
from mcfilm.common import make_steve, EAST

A = bc.ANIM


def build_world():
    return wg.snow()


def setup(d, w):
    gz = lambda x, y: w.top_z(x, y)
    steve = make_steve(d, worn=0.3)
    cx, cy, cfz = wg.SN["cave"]
    snow_near = props.Precip("snow", count=2600, box=(30, 30, 20), speed=3.0, drift=(7.0, 2.0), seed=8)
    d.weather["snow"] = snow_near
    clouds = props.Clouds(center=(200, 130), z=170, color=(0.95, 0.95, 1.0), cover=0.5)

    def common(ctx):
        clouds.update(ctx, speed=1.2)
    d.extra.append(common)

    # ============================================================= D1  emerging from the cave
    p1 = Path([(18, cy + 0.5), (30, cy + 0.5), (44, cy + 0.8)], w, ceiling=cfz + 4)
    m1 = Mover(steve, p1, [(0, 1.7)], gait="walk", surface="stone")

    def D1(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("dawn_exit", exposure=keys(t, [(0, 1.6), (2.5, 0.6), (6, 0.1)]), fog_density=0.0025)
        loc, yaw, s = ctx.walk(steve, m1, extra={"head_pitch": keys(t, [(0, -5), (3, 10), (6, 6)]),
                                                 "arm_l": keys(t, [(0, 0), (1.5, 60), (3.0, 0)]),
                                                 "arm_l_out": -15 * seg(t, 1, 1.5) * (1 - seg(t, 2.5, 3))})
        cam = Vector((15.5, cy + 0.2, cfz + 1.5)) + Vector((3.5, 0.3, 0.2)) * ease(u)
        ctx.camera(cam, Vector((70, cy + 2, cfz + 8)), lens=24, shake_amp=0.02)
        ctx.once(0.0, "amb_wind_soft")
        ctx.once(1.5, "music_journey")

    # ============================================================= D2  aerial, blizzard
    p2 = Path([(196, 129.5), (204, 130.5)], w)
    m2 = Mover(steve, p2, [(0, 1.2)], gait="trudge", surface="snow")

    def D2(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("blizzard", fog_density=0.0055, fog_start=25)
        ctx.weather("snow", 1.0)
        loc, yaw, s = ctx.walk(steve, m2, step_vol=0.3)
        cam = Vector((172, 98, gz(205, 130) + 30)) + Vector((6, 3, -2)) * ease(u)
        ctx.camera(cam, Vector(loc) + Vector((0, 0, 1)), lens=40, shake_amp=0.3, shake_freq=0.8)
        ctx.once(0.0, "amb_blizzard")

    # ============================================================= D3  close trudge
    p3 = Path([(206, 130.2), (211, 130.6)], w)
    m3 = Mover(steve, p3, [(0, 1.1)], gait="trudge", surface="snow")

    def D3(ctx):
        t = ctx.t
        ctx.light("blizzard", fog_density=0.05)
        ctx.weather("snow", 1.0)
        loc, yaw, s = ctx.walk(steve, m3, extra={"head_pitch": -20, "arm_l": 35, "arm_l_out": -10, "head_yaw": -10})
        cam = Vector(loc) + Vector((2.6, -1.9, 1.45))
        cam.z = max(cam.z, gz(cam.x, cam.y) + 0.8)
        ctx.camera(cam, Vector(loc) + Vector((0, 0, 1.25)), lens=32, shake_amp=0.06, shake_freq=2.0)

    return dict(D1=D1, D2=D2, D3=D3)
