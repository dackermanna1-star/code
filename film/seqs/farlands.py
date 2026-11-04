"""Sections 6 & 7: the Far Lands - reveal, approach, climb, orbit, the colossal pull-back, and the ending."""
import math
from mathutils import Vector

from mcfilm import blcore as bc, characters as ch, direct as dr, props, worldgen as wg
from mcfilm.direct import keys, ease, seg, lerp, Path, Mover, mix_light
from mcfilm.common import make_steve, breathe, idle, EAST

A = bc.ANIM
LANE = 210.5
FL = wg.FL


def build_world():
    return wg.farlands()


def setup(d, w):
    gz = lambda x, y: w.top_z(x, y, below=80)
    steve = make_steve(d, worn=0.8, worn_sword=True)
    fig = d.add_rig(ch.shadow_figure("figure"))
    dust = props.Precip("dust", count=900, box=(40, 40, 20), speed=0.35, drift=(0.8, 1.2), seed=13)
    d.weather["dust"] = dust
    fall = props.Precip("dust", count=700, box=(24, 24, 40), speed=7.0, seed=14)
    d.weather["fall"] = fall
    wx = FL["wall_x"]
    rx0, rx1 = FL["ridge"]
    clouds = props.Clouds(center=(280, 210), z=205, color=(0.7, 0.55, 0.6), cover=0.6)

    def common(ctx):
        clouds.update(ctx, speed=1.5)
    d.extra.append(common)

    top_x = rx0 + 3.5
    top = Vector((top_x, LANE, gz(top_x, LANE)))

    # ============================================================= F1  the reveal
    def F1(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("farlands")
        cam = keys(t, [(0, Vector((30, 196, gz(30, 196) + 1.4))), (10, Vector((52, 186, gz(30, 196) + 26)))],
                   fn=dr.ease_io)
        tgt = keys(t, [(0, Vector((200, 205, gz(30, 196) + 16))), (10, Vector((300, 214, 96)))], fn=dr.ease_io)
        ctx.camera(cam, tgt, lens=lerp(22, 20, ease(u)), shake_amp=0.04, shake_freq=0.3)
        ctx.weather("dust", 1.0)
        ctx.once(0.0, "music_farlands")

    # ============================================================= F2  walking toward the boundary
    p2 = Path([(147, LANE), (152, LANE + 0.3), (158, LANE)], w)
    m2 = Mover(steve, p2, [(0, 1.0), (1.0, 1.4)], gait="tired", surface="grass")

    def F2(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("farlands")
        loc, yaw, s = ctx.walk(steve, m2, extra={"head_pitch": 18})
        cam = Vector((140, LANE - 6.5, gz(140, LANE - 6.5) + 0.55)) + Vector((2.5, 0, 0)) * ease(u)
        ctx.camera(cam, Vector((wx + 40, LANE + 6, 92)), lens=22, shake_amp=0.02)
        ctx.weather("dust", 1.0)

    # ============================================================= F3  close: awe
    s3 = Vector((160.0, LANE, gz(160, LANE)))

    def F3(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("farlands")
        p = breathe(t, 1.6, 0.25)
        p.update({"head_pitch": keys(t, [(0, 10), (2.5, 34), (6, 38)]), "head_yaw": keys(t, [(0, 0), (3.5, 10), (6, -4)]),
                  "lean": -4})
        ctx.pose(steve, tuple(s3), EAST, p)
        cam = s3 + Vector((-1.0, -1.9, 0.55)) + Vector((0.25, -0.1, -0.05)) * ease(u)
        ctx.camera(cam, s3 + Vector((5.0, 1.6, 5.5)), lens=22, shake_amp=0.01)
        ctx.weather("dust", 1.0)
        ctx.once(1.0, "awe_swell")

    # ============================================================= F4  climbing the ridge
    p4 = Path([(163, LANE), (175, LANE + 0.4), (top_x, LANE)], w)
    m4 = Mover(steve, p4, [(0, 2.2), (7.0, 2.0), (8.0, 1.2)], gait="walk", surface="stone", hop_height=0.55)

    def F4(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("farlands")
        loc, yaw, s = ctx.walk(steve, m4, extra={"lean": 10, "head_pitch": 10})
        L = Vector(loc)
        cam = Vector((176, LANE - 17, gz(178, LANE - 16) + 4)) + Vector((8, 1, 4)) * ease(u)
        ctx.camera(cam, L + Vector((7, 0, 5)), lens=22, shake_amp=0.02)
        ctx.weather("dust", 1.0)

    # ============================================================= F5  orbit on the ridge
    def F5(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("farlands")
        p = idle(t)
        p["head_pitch"] = 14
        p["head_yaw"] = 8 * math.sin(t * 0.4)
        ctx.pose(steve, tuple(top), EAST, p)
        ang = math.radians(lerp(200, 470, dr.ease_io(u, 1.6)))
        r = lerp(5.0, 7.5, u)
        cam = top + Vector((math.cos(ang) * r, math.sin(ang) * r, lerp(1.6, 3.2, u)))
        tgt = top + Vector((0, 0, 1.3 + 1.2 * u))
        ctx.camera(cam, tgt, lens=24, shake_amp=0.02, shake_freq=0.4)
        ctx.weather("dust", 1.0)

    # ============================================================= F6  the pull-back
    def F6(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("farlands")
        p = idle(t)
        p["head_pitch"] = 14
        ctx.pose(steve, tuple(top), EAST, p)
        k = dr.ease_io(u, 2.2)
        cam = keys(t, [(0, top + Vector((-3.0, -1.2, 2.2))), (14, top + Vector((-150, -95, 95)))], fn=lambda x: dr.ease_io(x, 2.2))
        tgt = keys(t, [(0, top + Vector((20, 1, 6))), (14, Vector((wx + 30, LANE + 10, 95)))], fn=lambda x: dr.ease_io(x, 2.2))
        ctx.camera(cam, tgt, lens=lerp(30, 34, k), shake_amp=0.03, shake_freq=0.25)
        ctx.weather("dust", 1.0 if k < 0.3 else 0.0)
        ctx.once(4.0, "silence")

    # ============================================================= G1  stepping closer, a rumble
    p7 = Path([(top_x, LANE), (top_x + 9, LANE + 0.3), (top_x + 19, LANE)], w)
    m7 = Mover(steve, p7, [(0, 1.0), (4.0, 1.2), (4.6, 0.0)], gait="walk", surface="stone")

    def G1(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("farlands", fog_density=0.005)
        loc, yaw, s, mv = m7.state(t)
        if mv:
            ctx.walk(steve, m7, extra={"head_pitch": 16})
        else:
            p = idle(t)
            p.update({"head_pitch": 16, "lean": -3, "arm_r": 30})
            ctx.pose(steve, loc, EAST, p)
        L = Vector(loc)
        rum = seg(t, 3.6, 4.2) * (1 - seg(t, 5.2, 6.0))
        cam = L + Vector((-3.4, -1.6, 1.4))
        cam.z = max(cam.z, gz(cam.x, cam.y) + 1.2)
        ctx.camera(cam, L + Vector((8, 1, 4)), lens=26, shake_amp=0.02 + 0.12 * rum, shake_freq=6)
        ctx.weather("dust", 1.0)
        ctx.weather("fall", 1.0 if t > 3.9 else 0.0)
        ctx.once(3.6, "rumble_long")

    # ============================================================= G2  something moves in the fog
    g_end = Vector((top_x + 19, LANE, gz(top_x + 19, LANE)))
    fig_path = Path([(318, 268), (330, 250), (342, 232)], z=37)

    def G2(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("farlands", fog_density=0.0072)
        p = idle(t)
        p.update({"head_pitch": 12, "head_yaw": keys(t, [(0, 0), (2.5, 8), (6, 10)]), "arm_r": 30})
        ctx.pose(steve, tuple(g_end), EAST, p)
        s = lerp(0.0, fig_path.length * 0.55, u)
        fx, fy = fig_path.at(s)
        ph = s / 9.0 * 2 * math.pi
        ctx.pose(fig, (fx, fy, 37), math.atan2(12, 18), {"leg_r": 18 * math.sin(ph), "leg_l": -18 * math.sin(ph),
                                               "arm_r": -10 * math.sin(ph), "arm_l": 10 * math.sin(ph)})
        cam = g_end + Vector((-1.5, -1.5, 2.35))
        ctx.camera(cam, Vector((330, 250, 62)), lens=lerp(50, 58, u), shake_amp=0.01)
        ctx.weather("dust", 1.0)
        ctx.once(1.5, "distant_thud")
        ctx.once(3.3, "distant_thud")

    # ============================================================= G3  push into the fog, fade out
    def G3(ctx):
        t, u = ctx.t, ctx.u
        fade = -9.0 * ease(seg(t, 6.0, 7.9))
        ctx.light("farlands", fog_density=0.0055, fade=fade)
        p = idle(t)
        p.update({"head_pitch": 10, "arm_r": 30})
        ctx.pose(steve, tuple(g_end), EAST, p)
        cam = keys(t, [(0, g_end + Vector((-2.8, 0.6, 1.6))), (8, g_end + Vector((6.0, -0.2, 3.0)))], fn=dr.ease_io)
        ctx.camera(cam, Vector((330, 250, 56)), lens=lerp(28, 36, u), shake_amp=0.015)
        ctx.weather("dust", 1.0)
        ctx.once(0.0, "music_final")

    return dict(F1=F1, F2=F2, F3=F3, F4=F4, F5=F5, F6=F6, G1=G1, G2=G2, G3=G3)
