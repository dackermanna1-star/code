"""Section 4d + 5: the desolate plain, then the world begins to break; first sight of the endless wall."""
import math
from mathutils import Vector

from mcfilm import blcore as bc, direct as dr, props, worldgen as wg
from mcfilm.direct import keys, ease, seg, lerp, Path, Mover, mix_light
from mcfilm.common import make_steve, breathe, idle, EAST

A = bc.ANIM
LANE = 150.5


def build_world():
    w = wg.edge()
    return w


def setup(d, w):
    gz = lambda x, y: w.top_z(x, y)
    steve = make_steve(d, worn=0.7, worn_sword=True)
    dust = props.Precip("dust", count=700, box=(34, 34, 16), speed=0.4, drift=(1.5, 0.6), seed=12)
    d.weather["dust"] = dust
    rx = wg.ED["ridge_x"]

    # ============================================================= D8  desolate plain
    p8 = Path([(96, LANE), (104, LANE + 0.2)], w)
    m8 = Mover(steve, p8, [(0, 1.3)], gait="tired", surface="grass")

    def D8(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("desolate", fog_density=0.0028, fog_hamt=0.3)
        loc, yaw, s = ctx.walk(steve, m8, step_vol=0.2)
        cam = Vector((66, 118, gz(66, 118) + 16)) + Vector((3, 1, -1)) * ease(u)
        ctx.camera(cam, Vector(loc) + Vector((10, 2, 0)), lens=30, shake_amp=0.05, shake_freq=0.3)
        ctx.once(0.0, "amb_empty")

    # ============================================================= D9  the worn sword
    p9 = Path([(128, LANE), (133, LANE)], w)
    m9 = Mover(steve, p9, [(0, 1.25)], gait="tired", surface="grass")

    def D9(ctx):
        t = ctx.t
        ctx.light("desolate")
        loc, yaw, s = ctx.walk(steve, m9, extra={"arm_r": 6 + 6 * math.sin(t * 4), "head_pitch": -15})
        L = Vector(loc)
        tgt = L + Vector((0.3, -0.34, 0.9))
        cam = L + Vector((0.8, -1.95, 1.05))
        ctx.camera(cam, tgt, lens=40, shake_amp=0.012, focus=(cam - tgt).length, fstop=2.2)

    # ============================================================= D10  strange shapes on the horizon
    p10 = Path([(196, LANE), (201.5, LANE)], w)
    m10 = Mover(steve, p10, [(0, 1.3), (2.6, 1.3), (3.2, 0.0)], gait="tired", surface="grass")

    def D10(ctx):
        t, u = ctx.t, ctx.u
        ctx.light(mix_light("desolate", "broken", 0.25 + 0.15 * u))
        loc, yaw, s, mv = m10.state(t)
        if mv:
            ctx.walk(steve, m10)
        else:
            p = idle(t)
            p.update({"head_pitch": keys(t, [(3.2, -8), (4.2, 10)]), "head_yaw": keys(t, [(3.4, 0), (4.4, 8)])})
            ctx.pose(steve, loc, EAST, p)
        L = Vector(loc)
        cam = L + Vector((-2.6, 0.9, 1.9)) + Vector((0.8, 0, 0)) * ease(u)
        ctx.camera(cam, Vector((330, LANE - 6, 52)), lens=40, shake_amp=0.01)
        ctx.once(0.0, "music_strange")

    # ============================================================= E1  stretched pillars
    pe1 = Path([(246, LANE), (252, LANE + 0.5), (259, LANE)], w)
    me1 = Mover(steve, pe1, [(0, 1.5)], gait="walk", surface="gravel")

    def E1(ctx):
        t, u = ctx.t, ctx.u
        ctx.light(mix_light("desolate", "broken", 0.55 + 0.2 * u))
        loc, yaw, s = ctx.walk(steve, me1, extra={"head_pitch": 14 + 6 * math.sin(t * 0.6),
                                                  "head_yaw": 30 * math.sin(t * 0.5)})
        L = Vector(loc)
        cam = Vector((262, LANE - 7.5, gz(262, LANE - 7.5) + 0.7)) + Vector((-1.5, 0, 0)) * u
        ctx.camera(cam, L + Vector((0, 0, 4.0)), lens=18, shake_amp=0.02)
        ctx.weather("dust", 1.0)

    # ============================================================= E2  broken chunks, fog gathers
    pe2 = Path([(326, LANE), (334, LANE + 1.5), (340, 156.5), (342.5, 159.0)], w)
    me2 = Mover(steve, pe2, [(0, 1.5), (5.6, 1.5), (6.4, 0.0)], gait="walk", surface="gravel")

    def E2(ctx):
        t, u = ctx.t, ctx.u
        L0 = mix_light("broken", "broken", 0)
        L0["fog_hamt"] = lerp(0.6, 1.0, u)
        L0["fog_h0"] = lerp(34, 44, u)
        L0["fog_density"] = lerp(0.008, 0.014, u)
        ctx.light(L0)
        loc, yaw, s, mv = me2.state(t)
        if mv:
            ctx.walk(steve, me2, extra={"head_yaw": 15 * math.sin(t)})
        else:
            p = idle(t)
            p.update({"head_pitch": keys(t, [(6.4, 0), (7.2, -40)]), "lean": 4})
            ctx.pose(steve, loc, yaw, p)
        L = Vector(loc)
        cam = Vector((345.5, 179.5, gz(342, 150) + 7.5)) + Vector((-1.5, -1.0, -1.0)) * ease(u)
        ctx.camera(cam, L + Vector((0, 1.5, 0.6)), lens=24, shake_amp=0.03, shake_freq=0.5)
        ctx.weather("dust", 1.0)
        ctx.once(6.6, "void_hum")

    # ============================================================= E3  climbing the ridge
    crest0 = max((gz(x / 2.0, LANE), x / 2.0) for x in range(2 * (rx - 12), 2 * (rx + 8)))[1]
    pe3 = Path([(rx - 22, LANE), (rx - 12, LANE + 0.3), (crest0 + 0.5, LANE)], w)
    me3 = Mover(steve, pe3, [(0, 2.4)], gait="walk", surface="stone", hop_height=0.55)

    def E3(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("broken", fog_hamt=0.95)
        loc, yaw, s = ctx.walk(steve, me3, extra={"lean": 10, "head_pitch": 12})
        L = Vector(loc)
        cam = Vector((rx - 30, LANE - 14, gz(rx - 22, LANE) + 3.5)) + Vector((8, 2, 5)) * ease(u)
        ctx.camera(cam, L + Vector((0, 0, 1.2)), lens=30, shake_amp=0.03)
        ctx.weather("dust", 1.0)
        ctx.once(0.0, "music_build")

    # ============================================================= E4  close: pause at the edge
    crest_x = max((gz(x / 2.0, LANE), x / 2.0) for x in range(2 * (rx - 12), 2 * (rx + 8)))[1]
    top = Vector((crest_x + 0.5, LANE, gz(crest_x + 0.5, LANE)))

    def E4(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("broken", fog_hamt=0.95)
        p = breathe(t, 2.0, 0.6)
        p.update({"head_pitch": keys(t, [(0, -6), (2.0, 4), (5, 6)]), "head_yaw": keys(t, [(0, 0), (2.5, -6), (5, 0)])})
        ctx.pose(steve, tuple(top), EAST, p)
        cam = top + Vector((2.3, -0.9, 1.55)) + Vector((-0.3, 0.1, 0.05)) * ease(u)
        cam.z = max(cam.z, gz(cam.x, cam.y) + 0.6)
        ctx.camera(cam, top + Vector((0, 0, 1.58)), lens=45, shake_amp=0.01, focus=(cam - top).length - 0.3, fstop=2.8)
        ctx.weather("dust", 1.0)
        ctx.once(0.5, "wind_gust")

    # ============================================================= E5  OTS: the endless wall
    def E5(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("broken", fog_hamt=0.95, sun_el=6, fog_density=0.0042, fog_start=40)
        p = idle(t)
        p["head_pitch"] = 8
        ctx.pose(steve, tuple(top), EAST, p)
        cam = keys(t, [(0, top + Vector((-1.9, 1.0, 1.95))), (11, top + Vector((-4.6, 3.3, 3.2)))], fn=dr.ease_io)
        tgt = keys(t, [(0, Vector((790, LANE - 4, top.z + 4))), (11, Vector((790, LANE - 8, top.z + 22)))], fn=dr.ease_io)
        ctx.camera(cam, tgt, lens=lerp(24, 22, ease(u)), shake_amp=0.02, shake_freq=0.4)
        ctx.weather("dust", 1.0)
        ctx.once(0.0, "reveal_wall")

    return dict(D8=D8, D9=D9, D10=D10, E1=E1, E2=E2, E3=E3, E4=E4, E5=E5)
