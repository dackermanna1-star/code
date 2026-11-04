"""Sections 1 & 2: Spawn at sunrise, then the journey through forest, river, hills, village and dusk."""
import math
from mathutils import Vector

from mcfilm import blcore as bc, characters as ch, direct as dr, props, worldgen as wg
from mcfilm.direct import keys, ease, seg, lerp, Path, Mover, mix_light, yaw_to
from mcfilm import timeline as tl

A = bc.ANIM
R = math.radians
EAST = math.pi / 2  # yaw that faces +x


def build_world():
    w = wg.overworld()
    sx, sy = wg.OW["spawn"]
    wg.clear_plants(w, [(sx, sy, 1.2), (sx + 9, sy - 5.2, 2.5), (320.5, 127.2, 3.0), (sx + 2.4, sy - 1.0, 1.2),
                        (sx - 1.6, sy - 0.75, 1.0)])
    return w


def setup(d, w):
    OW = wg.OW
    S = Vector((*OW["spawn"], w.top_z(*OW["spawn"])))
    gz = lambda x, y: w.top_z(x, y)

    steve = d.add_rig(ch.humanoid("steve", ch.steve_skin()))
    sword = ch.sword("steve_sword")
    steve.attach(sword, "arm_r", (-1 * ch.PX, 0, -9.5 * ch.PX), (0, 0, 0))
    smith = d.add_rig(ch.villager("smith", robe=(0.32, 0.3, 0.3), apron=(0.1, 0.1, 0.11), seed=8))
    smith_sword = ch.sword("smith_sword")
    smith.attach(smith_sword, "arms", (0, -4.5 * ch.PX, 1 * ch.PX), (0, 0, 0))
    robes = [(0.42, 0.3, 0.2), (0.85, 0.85, 0.82), (0.5, 0.25, 0.2), (0.3, 0.45, 0.3), (0.55, 0.45, 0.25)]
    villagers = [d.add_rig(ch.villager(f"vill{i}", robe=robes[i % len(robes)], seed=20 + i)) for i in range(6)]
    sheep = [d.add_rig(ch.quadruped(f"sheep{i}", "sheep", seed=30 + i)) for i in range(4)]
    pigs = [d.add_rig(ch.quadruped(f"pig{i}", "pig", seed=40 + i)) for i in range(2)]
    cows = [d.add_rig(ch.quadruped(f"cow{i}", "cow", seed=50 + i)) for i in range(2)]
    birds = [d.add_rig(ch.bird(f"bird{i}")) for i in range(6)]
    flock = props.Flock(birds)
    sparkles = props.Sparkles()
    clouds = props.Clouds(center=(320, 128), z=122)

    F = tl.frames()
    handover_t = tl.start_time("B5") + 3.0

    def common(ctx):
        has = ctx.tg >= handover_t
        props.set_vis(sword, has)
        props.set_vis(smith_sword, (not has) and ctx.sid in ("B4", "B5"))
        speed = 0.9
        extra = 0.0
        if ctx.sid == "B6":
            extra = (ctx.t ** 2) * 6.0
        if ctx.sid in ("B7", "B8"):
            extra = 7 * 7 * 6.0 / 2
        clouds.update(ctx, speed=speed, extra=extra)
        if ctx.sid != "A2":
            sparkles.update(S, 0, visible=False)
    d.extra.append(common)

    # ------------------------------------------------------------- ambient animals
    sheep_spots = [(S.x + 7, S.y + 9), (S.x + 11, S.y + 12), (S.x + 4, S.y + 14), (S.x + 13, S.y + 7)]

    def animals(ctx):
        for i, (r, (x, y)) in enumerate(zip(sheep, sheep_spots)):
            t = ctx.tg + i * 3.1
            dx = 0.6 * math.sin(t * 0.21 + i)
            yaw = R(40 + 80 * i) + 0.3 * math.sin(t * 0.13)
            graze = 30 + 25 * math.sin(t * 0.9 + i) if (int(t / 4) % 2 == 0) else 0
            walk = abs(math.cos(t * 0.21 + i)) * 0.6 > 0.4
            lg = 18 * math.sin(t * 6) if walk else 0
            ctx.pose(r, (x + dx, y, gz(x + dx, y)), yaw,
                     {"head_pitch": -graze, "leg_fl": lg, "leg_br": lg, "leg_fr": -lg, "leg_bl": -lg})

    def farm_animals(ctx):
        spots = [(384, 157), (388, 159), (446, 160), (449, 157)]
        for i, (r, (x, y)) in enumerate(zip(pigs + cows, spots)):
            t = ctx.tg + i * 2.3
            xx = x + 1.5 * math.sin(t * 0.3 + i)
            yaw = R(90) + 0.5 * math.sin(t * 0.2 + i)
            lg = 15 * math.sin(t * 5) if math.cos(t * 0.3 + i) > 0.3 else 0
            ctx.pose(r, (xx, y, gz(xx, y)), yaw, {"head_pitch": -10 * math.sin(t), "leg_fl": lg, "leg_br": lg,
                                                  "leg_fr": -lg, "leg_bl": -lg})

    vpaths = [
        [(372, 129), (392, 129), (404, 129)], [(414, 100), (414.5, 118), (414, 140), (414.5, 156)],
        [(455, 128.2), (440, 128.5), (420, 129.5)], [(395, 141), (395, 130), (405, 129.5)],
        [(437, 151), (437, 140), (436, 130)], [(408, 112), (418, 113), (430, 112.5)],
    ]
    vmovers = [Mover(v, Path(p, w), [(0, 1.0 + 0.1 * i)], name=f"vill{i}", surface="path") for i, (v, p) in
               enumerate(zip(villagers, vpaths))]
    vt0 = tl.start_time("B4")

    def village(ctx):
        t = ctx.tg - vt0
        for i, (v, m) in enumerate(zip(villagers, vmovers)):
            tt = t + 3 + i
            L = m.path.length / (1.0 + 0.1 * i)
            # walk the path, pause, walk back
            cyc = (tt % (2 * L + 6))
            if cyc < L:
                loc, yaw, s, mv = m.state(cyc)
                p, _ = dr.gait_pose(s, "walk", 0.7)
            elif cyc < L + 3:
                loc, yaw, s, mv = m.state(L)
                p = {"head_yaw": 30 * math.sin(tt)}
            elif cyc < 2 * L + 3:
                loc, yaw, s, mv = m.state(2 * L + 3 - cyc)
                yaw += math.pi
                p, _ = dr.gait_pose(s, "walk", 0.7)
            else:
                loc, yaw, s, mv = m.state(0)
                yaw += math.pi
                p = {"head_yaw": -25 * math.sin(tt)}
            p.pop("arm_r", None); p.pop("arm_l", None)
            ctx.pose(v, loc, yaw, p)
        farm_animals(ctx)

    def idle(t, k=1.0):
        return {"arm_r_out": 2.5 + 1.5 * math.sin(t * 1.7) * k, "arm_l_out": 2.5 + 1.5 * math.sin(t * 1.7 + 1) * k,
                "head_pitch": 2 * math.sin(t * 0.7) * k, "bob": 0.004 * math.sin(t * 1.7)}

    # ============================================================= A1  sunrise aerial
    def A1(ctx):
        t, u = ctx.t, ctx.u
        el = lerp(1.0, 4.0, u)
        ctx.light("sunrise", sun_el=el)
        cam = Vector((34, 84, 70)).lerp(Vector((64, 104, 60)), ease(u * 0.9 + 0.05))
        tgt = Vector((280, 150, 52)).lerp(Vector((250, 138, 44)), ease(u))
        ctx.camera(cam, tgt, lens=24, shake_amp=0.15, shake_freq=0.25)
        flock.update(ctx, (40, 150, 58), (150, 105, 64), 0.0, 7.0)
        animals(ctx)
        ctx.once(0.0, "amb_dawn")

    # ============================================================= A2  spawn
    def A2(ctx):
        t = ctx.t
        ctx.light("sunrise", sun_el=4.2, fade=keys(t, [(0, 0), (1.55, 0.3), (1.62, 2.6), (2.4, 0)]))
        cam = S + Vector((4.8, -4.2, 1.0)) + Vector((-0.6, 0.5, 0.1)) * ease(ctx.u)
        ctx.camera(cam, S + Vector((0, 0, 1.0)), lens=32, shake_amp=0.02)
        pop = 1.62
        if t < pop:
            sparkles.update(S, ease(t / pop))
            steve.pose((S.x, S.y, S.z), EAST, {}, visible=False)
            ctx.posed.add(steve)
        else:
            tt = t - pop
            sparkles.update(S, 1.0, burst=min(1.0, tt / 0.8), visible=tt < 0.8)
            sq = keys(tt, [(0, 0.3), (0.08, 1.12), (0.2, 0.96), (0.32, 1.0)])
            p = idle(t)
            p.update({"head_pitch": keys(tt, [(0, -25), (0.9, -25), (1.8, 0)]), "squash": sq})
            ctx.pose(steve, (S.x, S.y, S.z), EAST, p)
        ctx.once(0.05, "spawn_shimmer")
        ctx.once(pop, "spawn_pop")
        animals(ctx)

    # ============================================================= A3  close-up looking around
    def A3(ctx):
        t = ctx.t
        ctx.light("sunrise", sun_el=4.6)
        cam = S + Vector((2.45, -1.0, 1.68)) + Vector((-0.1, 0.03, 0.0)) * t
        ctx.camera(cam, S + Vector((0, 0.05, 1.5)), lens=42, shake_amp=0.01, focus=2.6, fstop=2.8)
        hy = keys(t, [(0, 0), (0.6, 0), (1.3, 55), (2.3, 55), (3.0, -48), (3.7, -48), (4.2, 0)])
        hp = keys(t, [(0, 0), (3.9, 0), (4.6, 20)])
        p = idle(t)
        p.update({"head_yaw": hy, "head_pitch": hp, "body_yaw": hy * 0.12})
        ctx.pose(steve, (S.x, S.y, S.z), EAST, p)
        animals(ctx)

    # ============================================================= A4  examining hands
    def A4(ctx):
        t = ctx.t
        ctx.light("sunrise", sun_el=5.0)
        cam = S + Vector((-1.0, -1.15, 2.35)) + Vector((0.04, 0.0, -0.02)) * t
        ctx.camera(cam, S + Vector((0.85, -0.1, 0.95)), lens=28, shake_amp=0.008, focus=2.2, fstop=4)
        ar = keys(t, [(0, 0), (0.7, 0), (1.5, 62), (4.2, 62), (5.0, 20)])
        al = keys(t, [(0, 0), (0.9, 0), (1.7, 58), (4.0, 58), (4.9, 18)])
        tw = 25 * math.sin(max(0, t - 2.0) * 2.2) * seg(t, 1.8, 2.4) * (1 - seg(t, 4.0, 4.4))
        p = {"arm_r": ar, "arm_l": al, "arm_r_out": -10 * seg(t, 0.7, 1.5), "arm_l_out": -10 * seg(t, 0.9, 1.7),
             "arm_r_twist": tw, "arm_l_twist": -tw, "head_pitch": keys(t, [(0, 0), (0.5, -35), (4.4, -35), (5, -5)]),
             "head_yaw": 8 * math.sin(t * 1.3) * seg(t, 1.5, 2)}
        ctx.pose(steve, (S.x, S.y, S.z), EAST, p)
        animals(ctx)

    # ============================================================= A5  crane reveal
    def A5(ctx):
        t, u = ctx.t, ctx.u
        ctx.light(mix_light("sunrise", "morning", ease(u)))
        cam = keys(t, [(0, S + Vector((-2.6, -1.5, 1.5))), (7, S + Vector((-17, -19, 15)))], fn=dr.ease_io)
        tgt = keys(t, [(0, S + Vector((0, 0, 1.4))), (7, S + Vector((14, 9, 2.5)))], fn=dr.ease_io)
        ctx.camera(cam, tgt, lens=lerp(28, 22, ease(u)), shake_amp=0.05, shake_freq=0.3)
        p = idle(t)
        p.update({"head_yaw": keys(t, [(0, 0), (1.5, 25), (4, 25), (5.5, 0)]),
                  "head_pitch": keys(t, [(0, 0), (1.5, 10), (5.5, 4)])})
        ctx.pose(steve, (S.x, S.y, S.z), EAST, p)
        flock.update(ctx, (S.x - 30, S.y + 30, S.z + 18), (S.x + 60, S.y + 10, S.z + 26), 0.5, 9)
        animals(ctx)

    # ============================================================= A6  starts walking
    p_a6 = Path([(S.x, S.y), (S.x + 8, S.y - 0.3), (S.x + 18, S.y - 0.2)], w)
    m_a6 = Mover(steve, p_a6, [(0, 0), (1.1, 0), (1.8, 2.1), (7, 2.1)])

    def A6(ctx):
        t = ctx.t
        ctx.light("morning")
        loc, yaw, s = ctx.walk(steve, m_a6, extra={"head_yaw": keys(t, [(0, 0), (0.6, -15), (1.4, 0)])})
        cam = Vector((S.x + 9, S.y - 5.2, gz(S.x + 9, S.y - 5.2) + 0.85))
        ctx.camera(cam, Vector(loc) + Vector((0.4, 0, 1.0)), lens=30, shake_amp=0.015)
        animals(ctx)

    # ============================================================= B1  forest tracking
    p_b1 = Path([(158, 128.5), (168, 128.2), (178, 128.6)], w)
    m_b1 = Mover(steve, p_b1, [(0, 2.3)])

    def B1(ctx):
        t = ctx.t
        ctx.light("morning", sun_el=16, sun_az=-20)
        loc, yaw, s = ctx.walk(steve, m_b1, extra={"head_yaw": 18 * math.sin(t * 0.8), "head_pitch": 8})
        cam = Vector((loc[0] - 0.8, 121.2, gz(loc[0], 121) + 1.7))
        ctx.camera(cam, Vector(loc) + Vector((1.2, 0, 1.1)), lens=32, shake_amp=0.03)
        ctx.once(0.0, "amb_forest")

    # ============================================================= B2  river stones
    stones = OW["stones"]
    rc = float(wg.river_center(128.5))
    bank_w = stones[0] - 2.5
    bank_e = stones[-1] + 3.0
    hops = [(bank_w, gz(bank_w, 128.5))] + [(x + 0.5, 32.0) for x in stones] + [(bank_e, gz(bank_e, 128.5))]
    hop_dt = 0.5

    def B2(ctx):
        t = ctx.t
        ctx.light("day", sun_az=60)
        t0 = 0.4
        k = int((t - t0) // hop_dt)
        p = {}
        if t < t0:
            x0, z0 = hops[0][0] - (t0 - t) * 2.2, hops[0][1]
            loc = (x0, 128.5, z0)
            p, _ = dr.gait_pose(x0, "walk")
        elif k >= len(hops) - 1:
            x0 = hops[-1][0] + (t - t0 - (len(hops) - 1) * hop_dt) * 2.2
            loc = (x0, 128.5, gz(x0, 128.5))
            p, _ = dr.gait_pose(x0, "walk")
        else:
            u = ((t - t0) % hop_dt) / hop_dt
            (xa, za), (xb, zb) = hops[k], hops[k + 1]
            x = lerp(xa, xb, u)
            z = lerp(za, zb, u) + math.sin(math.pi * u) * 0.75
            loc = (x, 128.5, z)
            sp = math.sin(math.pi * u)
            p = {"leg_r": 35 * sp, "leg_l": -25 * sp, "arm_r": -20 * sp, "arm_l": 25 * sp, "arm_r_out": 15 * sp,
                 "arm_l_out": 15 * sp, "lean": 8}
            if abs(((t - t0) % hop_dt)) < 1.0 / 24:
                ctx.event("hop", surface="stone")
            if abs(((t - t0) % hop_dt) - hop_dt + 0.02) < 1.0 / 24:
                ctx.event("land", surface="stone")
        ctx.pose(steve, loc, EAST, p)
        cam = Vector((rc - 3 + t * 0.9, 121.8, 32.75))
        ctx.camera(cam, Vector((loc[0] + 0.6, 128.5, 32.8)), lens=24, shake_amp=0.02)
        ctx.once(0.0, "amb_river")

    # ============================================================= B3  hill climb hero shot
    p_b3 = Path([(305, 128.5), (310, 128.6), (316.5, 128.4)], w)
    m_b3 = Mover(steve, p_b3, [(0, 2.4)], hop_height=0.5)

    def B3(ctx):
        t = ctx.t
        ctx.light("day", sun_az=200, sun_el=40)
        loc, yaw, s = ctx.walk(steve, m_b3, extra={"head_pitch": 10})
        cx = 319.5
        cam = Vector((cx, 127.4, gz(cx, 127.4) + 0.6))
        ctx.camera(cam, Vector(loc) + Vector((0, 0, 1.25)), lens=24, shake_amp=0.02)

    # ============================================================= B4  village establishing
    p_b4 = Path([(364, 128.5), (372, 128.6), (382, 128.4)], w)
    m_b4 = Mover(steve, p_b4, [(0, 2.1)], surface="path")

    def B4(ctx):
        t, u = ctx.t, ctx.u
        ctx.light("day", sun_az=120)
        ctx.walk(steve, m_b4, extra={"head_yaw": 20 * math.sin(t * 0.7)})
        cam = Vector((396, 96, 66)).lerp(Vector((402, 99, 62)), ease(u))
        ctx.camera(cam, Vector((410, 130, 46)).lerp(Vector((404, 129, 46)), u), lens=28, shake_amp=0.04,
                   shake_freq=0.3)
        village(ctx)
        ctx.once(0.0, "amb_village")

    # ============================================================= B5  the sword
    sm = Vector(OW["smith"])
    p_b5 = Path([(427.6, 128.6), (429.8, 128.9), (431.4, 131.4)], w)
    m_b5 = Mover(steve, p_b5, [(0, 2.2), (2.2, 2.2), (2.4, 0)], surface="path")

    def B5(ctx):
        t = ctx.t
        ctx.light("day", sun_az=150, sun_el=40)
        loc, yaw, s, mv = m_b5.state(t)
        face_smith = yaw_to(loc, sm)
        yaw = lerp(yaw, face_smith, ease(seg(t, 1.9, 2.3)))
        p, _ = dr.gait_pose(s, "walk", 1.0 if mv else 0.0)
        if mv:
            ctx.walk(steve, m_b5)
        arm = keys(t, [(0, None), (2.4, 0), (2.85, 55), (3.2, 40), (3.7, 88), (4.5, 88), (5, 60)], fn=ease) \
            if t > 2.4 else None
        p2 = idle(t)
        if arm is not None:
            p2["arm_r"] = arm
        p2["head_pitch"] = keys(t, [(0, 0), (2.4, 0), (2.8, -12), (3.6, 10), (4.6, 10), (5, 0)])
        p2["head_yaw"] = keys(t, [(0, 0), (3.6, 0), (4.0, -12), (5, -5)])
        if not mv:
            ctx.pose(steve, loc, yaw, p2)
        # smith offers the sword
        arms_fwd = keys(t, [(0, 0), (1.8, 0), (2.5, -35), (3.0, -35), (3.4, 0)])
        A.set(smith.parts["arms"], "rotation_euler", (R(arms_fwd), 0, 0))
        nod = 12 * math.sin(max(0, t - 3.3) * 7) * seg(t, 3.3, 3.5) * (1 - seg(t, 4.2, 4.5))
        ctx.pose(smith, tuple(sm), 0.0, {"head_pitch": -nod, "head_yaw": keys(t, [(0, 25), (1.5, 0)])})
        cam = Vector((434.2, 129.0, sm.z + 1.7)) + Vector((-0.06, 0.03, 0)) * t
        ctx.camera(cam, Vector((431.4, 132.3, sm.z + 1.25)), lens=30, shake_amp=0.01, focus=4.0, fstop=4.0)
        ctx.once(3.0, "sword_get")
        village(ctx)

    # ============================================================= B6  time-lapse
    p_b6 = Path([(468, 128.5), (478, 128.4), (490, 128.6)], w)
    m_b6 = Mover(steve, p_b6, [(0, 2.3)])

    def B6(ctx):
        t, u = ctx.t, ctx.u
        L = mix_light("afternoon", "dusk", ease(u))
        L["sun_az"] = lerp(140, 190, u)
        ctx.light(L)
        ctx.walk(steve, m_b6)
        cam = Vector((472, 117, 51))
        ctx.camera(cam, Vector((488, 131, 46)), lens=24, shake_amp=0.01)
        farm_animals(ctx)

    # ============================================================= B7  silhouette on the ridge
    rz = gz(OW["ridge_x"], 128.5)
    p_b7 = Path([(586.6, 128.5), (589, 128.6), (591.0, 128.5)], w)
    m_b7 = Mover(steve, p_b7, [(0, 2.0), (3.0, 2.0)])

    def B7(ctx):
        t = ctx.t
        ctx.light("dusk", sun_az=180, sun_el=4)
        loc, yaw, s, mv = m_b7.state(t)
        if mv:
            ctx.walk(steve, m_b7, extra={"head_pitch": 5})
        else:
            p = idle(t)
            ctx.pose(steve, loc, EAST, p)
        cam = Vector((595.6, 127.0, gz(595.6, 127.0) + 0.9))
        ctx.camera(cam, Vector((591.0, 128.5, rz + 1.6)), lens=35, shake_amp=0.02)

    # ============================================================= B8  OTS: the dark forest
    def B8(ctx):
        t, u = ctx.t, ctx.u
        L = mix_light("dusk", "night", 0.25 + 0.35 * u)
        L["sun_az"], L["sun_el"] = 180, 3
        L["moon"] = False
        ctx.light(L)
        loc = (591.0, 128.5, rz)
        p = idle(t)
        p["head_pitch"] = -6
        ctx.pose(steve, loc, EAST, p)
        cam = Vector((588.9, 127.25, rz + 2.15)) + Vector((0.25, 0.02, 0)) * ease(u)
        ctx.camera(cam, Vector((626, 131, rz - 7)), lens=32, shake_amp=0.01)
        ctx.once(0.2, "ominous")

    return dict(A1=A1, A2=A2, A3=A3, A4=A4, A5=A5, A6=A6, B1=B1, B2=B2, B3=B3, B4=B4, B5=B5, B6=B6, B7=B7,
                B8=B8)
