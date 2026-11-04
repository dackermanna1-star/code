"""Section 3a: night in the dark forest - zombies, a skeleton, the first fight, the storm and the cave."""
import math
from mathutils import Vector

from mcfilm import blcore as bc, characters as ch, direct as dr, props, worldgen as wg
from mcfilm.direct import keys, ease, seg, lerp, Path, Mover, mix_light, yaw_to

A = bc.ANIM
R = math.radians
EAST = math.pi / 2
WEST = -math.pi / 2
LANE = 100.5


def build_world():
    w = wg.nightforest()
    rng = __import__("numpy").random.default_rng(3)
    from mcfilm.voxel import dark_tree
    dark_tree(w, 48, 103, int(w.h[48, 103]), rng)
    from mcfilm.voxel import clear_foliage, FOLIAGE
    import numpy as np
    # keep the running lane open below the canopy
    for x in range(20, 205):
        for y in range(97, 104):
            gzc = int(w.h[x, y])
            col = w.b[x, y, gzc:gzc + 5]
            if not (x in (60, 61, 74, 75, 88, 89, 100, 101, 140, 141, 152, 153, 170, 171, 48, 49) and y in (97, 98, 103, 104)):
                col[FOLIAGE[col]] = 0
    lane_cams = [(x, 95.6) for x in range(56, 98, 2)] + [(120.9, 114.1, ), (119.5, 111.5), (101.4, 104.6),
                                                       (105.4, 96.2), (104.8, 96.2)] + \
                [(x, 97.5 + (x - 177) * 0.1) for x in range(175, 186)] + [(x, 99.3) for x in range(30, 56, 2)]
    clear_foliage(w, lane_cams, r=2.6)
    clear_foliage(w, [(74.5, 97.5), (121.9, 112.6), (122.6, 112.9), (122.1, 114.3), (123.5, 114.0)], r=3.2)
    clear_foliage(w, [(x, 97.5 + (x - 177) * 0.1) for x in range(172, 190, 2)], r=4.5)
    clear_foliage(w, [(x, 98.3) for x in range(176, 212, 2)], r=3.5)
    wg.clear_plants(w, [(104, 96.4, 1.5), (101.4, 104.6, 1.2)])
    return w


def setup(d, w):
    gz = lambda x, y: w.top_z(x, y)
    steve = d.add_rig(ch.humanoid("steve", ch.steve_skin()))
    sword = ch.sword("steve_sword")
    steve.attach(sword, "arm_r", (-1 * ch.PX, 0, -9.5 * ch.PX), (0, 0, 0))
    zs = [d.add_rig(ch.humanoid(f"zombie{i}", ch.zombie_skin(seed=3 + i))) for i in range(3)]
    skel = d.add_rig(ch.humanoid("skeleton", ch.skeleton_skin(), kind="skeleton"))
    bow = ch.bow("bow")
    skel.attach(bow, "arm_l", (0, -0.5 * ch.PX, -9.5 * ch.PX), (0, 0, 0))
    arrow1 = props.Projectile(ch.arrow("arrow1"))
    arrow2 = props.Projectile(ch.arrow("arrow2"))
    puff = props.Puff()
    rain = props.Precip("rain", count=5000, box=(40, 40, 26), speed=24, seed=4)
    d.weather["rain"] = rain
    bolt1 = props.lightning_bolt("bolt1", (236, 130, 160), (228, 112, 62), seed=2)
    bolt2 = props.lightning_bolt("bolt2", (260, 70, 170), (250, 85, 60), seed=5)
    cx, cy = wg.NF["cave"]
    cave_floor = wg.NF["cave_floor"]

    def common(ctx):
        for a in (arrow1, arrow2):
            if ctx.sid not in ("C4", "C5", "C6"):
                a.fly((0, 0, -500), (0, 0, -500), 0, visible=False)
        if ctx.sid not in ("C6",):
            puff.update((0, 0, 0), 0, visible=False)
        if ctx.sid not in ("C7",):
            props.set_vis(bolt1, False)
            props.set_vis(bolt2, False)
    d.extra.append(common)

    def zombie_walk(ctx, z, mover, t, arms=90, gait="walk"):
        loc, yaw, s, mv = mover.state(t)
        p, _ = dr.gait_pose(s, gait, 0.8 if mv else 0)
        p.update({"arm_r": arms + 4 * math.sin(t * 3), "arm_l": arms + 4 * math.sin(t * 3 + 1),
                  "head_yaw": 6 * math.sin(t * 1.3)})
        ctx.pose(z, loc, yaw, p)
        return loc

    # ============================================================= C1  cautious walk
    p_c1 = Path([(36, LANE), (44, LANE - 0.2), (52, LANE + 0.1)], w)
    m_c1 = Mover(steve, p_c1, [(0, 1.6)], gait="sneak")

    def C1(ctx):
        t = ctx.t
        ctx.light("night")
        loc, yaw, s = ctx.walk(steve, m_c1, extra={"head_yaw": keys(t, [(0, 0), (1.2, 35), (2.4, -30), (3.6, 10), (5, 0)]),
                                                     "arm_r": 25, "head_pitch": 4}, step_vol=0.6)
        cam = Vector(loc) + Vector((-3.2, -1.2, 1.9)) + Vector((0, 0, 0.0))
        ctx.camera(cam, Vector(loc) + Vector((2.0, 0.3, 1.0)), lens=28, shake_amp=0.06, shake_freq=0.8)
        ctx.once(0.3, "amb_night")
        ctx.once(2.6, "zombie_groan", dist=0.6)

    # ============================================================= C2  zombie emerges behind him
    S2 = Vector((54.5, LANE, gz(54.5, LANE)))
    p_z1 = Path([(49.5, 103.6), (50.3, 101.5), (53.0, LANE)], w)
    m_z1 = Mover(zs[0], p_z1, [(0, 0.0), (0.6, 1.0), (4, 1.0)], name="zombie")

    def C2(ctx):
        t = ctx.t
        ctx.light("night")
        turn = ease(seg(t, 1.8, 2.5))
        p = {"head_yaw": keys(t, [(0, 0), (1.2, 0), (1.8, 60), (2.4, 0)]), "arm_r": 25, "lean": 4}
        yaw = lerp(EAST, EAST + math.pi * 0.9, turn)
        if t > 2.4:
            p["arm_r"] = keys(t, [(2.4, 25), (2.9, 70)])
            p["lean"] = -4
        ctx.pose(steve, tuple(S2) if t < 2.6 else tuple(S2 + Vector((0.4 * seg(t, 2.6, 3.0), 0, 0))), yaw, p)
        zombie_walk(ctx, zs[0], m_z1, t)
        cam = S2 + Vector((3.4, -1.4, 1.55)) + Vector((-0.25, 0.1, 0)) * ease(ctx.u)
        ctx.camera(cam, S2 + Vector((-1.2, 0.8, 1.35)), lens=32, shake_amp=0.02, focus=3.5, fstop=2.8)
        ctx.once(0.7, "zombie_groan", dist=0.3)
        ctx.once(1.8, "sting")

    # ============================================================= C3  the chase
    p_c3 = Path([(57, LANE), (70, LANE + 0.4), (84, LANE - 0.3), (95, LANE)], w)
    m_c3 = Mover(steve, p_c3, [(0, 3.0), (0.6, 5.8)], gait="run")
    zpaths = [Path([(47, LANE + 0.6), (60, LANE + 0.2), (90, LANE)], w),
              Path([(42, LANE - 1.5), (60, LANE - 0.8), (90, LANE)], w),
              Path([(38, LANE + 1.8), (60, LANE + 1.0), (90, LANE)], w)]
    zmov = [Mover(z, p, [(0, 4.2 - 0.3 * i)], name="zombie") for i, (z, p) in enumerate(zip(zs, zpaths))]

    def C3(ctx):
        t = ctx.t
        ctx.light("night", fog_density=0.026)
        loc, yaw, s = ctx.walk(steve, m_c3, extra={"head_yaw": keys(t, [(0, 0), (2.6, 0), (3.0, -70), (3.6, 0)])})
        for z, m in zip(zs, zmov):
            zombie_walk(ctx, z, m, t)
        cam = Vector((loc[0] + 1.5, 95.6, gz(loc[0], 95.6) + 1.35))
        ctx.camera(cam, Vector(loc) + Vector((-0.5, 0, 1.0)), lens=26, shake_amp=0.12, shake_freq=2.5)
        ctx.once(0.4, "zombie_groan", dist=0.5)
        ctx.once(3.4, "zombie_groan", dist=0.6)
        ctx.once(0.0, "music_chase")

    # ============================================================= C4  skeleton shoots
    sk = Vector((119.5, 111.5, gz(119.5, 111.5)))
    p_c4 = Path([(92, LANE), (100, LANE)], w)
    m_c4 = Mover(steve, p_c4, [(0, 5.8)], gait="run")
    tgt_c4 = Vector((100.2, LANE + 0.3, gz(100, LANE) + 1.7))

    def C4(ctx):
        t = ctx.t
        ctx.light("night", fog_density=0.022)
        loc, yaw, s = ctx.walk(steve, m_c4, step_vol=0.4)
        aim = yaw_to(sk, loc)
        draw = seg(t, 0.2, 1.0)
        ctx.pose(skel, tuple(sk), aim, {"arm_l": 90, "arm_r": 90 * draw, "arm_r_twist": -25 * draw,
                                         "head_pitch": -6, "body_yaw": 10})
        if t > 1.15:
            u = seg(t, 1.15, 2.0)
            arrow1.fly(sk + Vector((0, -0.6, 1.4)), tgt_c4 + Vector((2.5, 0, 0.4)), u, arc=0.6)
        else:
            arrow1.fly((0, 0, -500), (0, 0, -500), 0, visible=False)
        dvec = (sk - Vector((96, LANE, sk.z))).normalized()
        perp = Vector((-dvec.y, dvec.x, 0))
        cam = sk + dvec * 3.6 + perp * 1.5 + Vector((0, 0, 2.1))
        ctx.camera(cam, Vector(loc) + Vector((0, 0, 1.0)), lens=30, shake_amp=0.03, focus=24, fstop=4)
        ctx.once(0.15, "skeleton_rattle")
        ctx.once(0.3, "bow_draw")
        ctx.once(1.15, "arrow_shoot")

    # ============================================================= C5  arrow thunk
    p_c5 = Path([(96.5, LANE), (104.5, LANE)], w)
    m_c5 = Mover(steve, p_c5, [(0, 5.4), (1.2, 5.0)], gait="run")
    hit = Vector((100.4, 98.98, gz(100, LANE) + 1.75))

    def C5(ctx):
        t = ctx.t
        ctx.light("night", fog_density=0.02)
        duck = keys(t, [(0, 0), (0.75, 0), (0.85, 25), (1.4, 10)])
        loc, yaw, s = ctx.walk(steve, m_c5, extra={"lean": 10 + duck, "head_pitch": -duck * 0.5})
        u = seg(t, 0.55, 0.9)
        if t < 0.9:
            arrow2.fly(hit + Vector((14, 9, 3)), hit, u, arc=0.2)
        else:
            A.set(arrow2.obj, "location", hit + Vector((0.25, 0.16, 0.05)))
            wob = 8 * math.exp(-(t - 0.9) * 6) * math.sin((t - 0.9) * 50)
            dirv = (Vector((0, 0, 0)) - Vector((14, 9, 3))).normalized()
            e = (-dirv).to_track_quat("Y", "Z").to_euler()
            A.set(arrow2.obj, "rotation_euler", (e.x + R(wob), e.y, e.z))
            props.set_vis(arrow2.obj, True)
        cam = Vector((101.6, 104.4, hit.z - 0.1))
        ctx.camera(cam, Vector((100.5, 99.2, hit.z - 0.2)), lens=30, shake_amp=0.03 + 0.08 * seg(t, 0.88, 0.95) * (1 - seg(t, 0.95, 1.3)),
                   shake_freq=3)
        ctx.once(0.55, "arrow_whoosh")
        ctx.once(0.9, "arrow_thunk")

    # ============================================================= C6  the fight
    F6 = Vector((106.0, LANE, gz(106, LANE)))
    swings = (1.7, 3.0)
    m_z2 = Mover(zs[1], Path([(F6.x - 16, LANE + 2), (F6.x - 9, LANE + 0.5)], w), [(0, 1.0)], name="zombie")

    def C6(ctx):
        t, u = ctx.t, ctx.u
        L = mix_light("night", "storm", ease(seg(t, 3.6, 6.0)))
        fl = 0.0
        if 5.15 < t < 5.5:
            fl = 1.0 if (t < 5.25 or 5.35 < t < 5.42) else 0.3
        L["flash"] = fl
        ctx.light(L)
        ctx.weather("rain", 1.0 if t > 4.4 else 0.0)
        # steve turns to face the zombie and swings twice
        yaw = lerp(EAST, WEST, ease(seg(t, 0.0, 0.7)))
        sw = 0
        for ts in swings:
            sw = max(sw, keys(t, [(ts - 0.25, 0), (ts - 0.05, 130), (ts + 0.12, 15), (ts + 0.4, 25)]) if ts - 0.25 < t < ts + 0.4 else 0)
        p = {"arm_r": sw if sw else 30, "lean": -3 + 8 * (sw > 60), "body_yaw": -15 if sw > 60 else 0,
             "leg_r": -12, "leg_l": 12, "head_pitch": -2}
        ctx.pose(steve, tuple(F6 + Vector((-0.25 * seg(t, 0, 0.7), 0, 0))), yaw, p)
        # zombie: approaches, knocked back, approaches, dies
        zx0 = F6.x - 9
        if t < 1.85:
            zx = zx0 + 4.2 * t
            zx = min(zx, F6.x - 1.5)
            kb = 0
        elif t < 3.15:
            tt = t - 1.85
            kb = 2.2 * (1 - math.exp(-tt * 9))
            zx = F6.x - 1.5 - kb + max(0, tt - 0.45) * 2.6
            zx = min(zx, F6.x - 1.5)
        else:
            tt = t - 3.15
            zx = F6.x - 1.5 - 2.8 * (1 - math.exp(-tt * 9))
        hurt = 0.0
        for ts in swings:
            if ts + 0.15 <= t < ts + 0.55:
                hurt = 0.85
        zz = gz(zx, LANE)
        hop = 0.0
        for ts in swings:
            tt = t - (ts + 0.15)
            if 0 <= tt < 0.35:
                hop = math.sin(math.pi * tt / 0.35) * 0.45
        death = seg(t, 3.3, 3.75)
        visible = t < 4.05
        p_z = {"arm_r": 90, "arm_l": 90, "hurt": hurt if t < 3.3 else 0.85, "root_roll": 90 * ease(death)}
        lg, _ = dr.gait_pose(zx, "walk", 0.8 if (t < 3.15 and hurt == 0) else 0)
        p_z.update({k: v for k, v in lg.items() if k.startswith("leg")})
        if visible:
            ctx.pose(zs[0], (zx, LANE, zz + hop), EAST, p_z)
        puff.update(Vector((zx, LANE, zz + 0.5)), seg(t, 3.85, 4.8), visible=3.85 < t < 4.8)
        # a second zombie looms out of the rain
        if t > 4.0:
            zombie_walk(ctx, zs[1], m_z2, t - 4.0)
        shk = 0.04 + 0.12 * sum(math.exp(-max(0, t - (ts + 0.15)) * 8) * (t > ts + 0.15) for ts in swings)
        cam = Vector((F6.x - 0.6, 96.2, F6.z + 0.85)) + Vector((-0.3 * u, 0, 0))
        ctx.camera(cam, Vector((F6.x - 1.4, LANE, F6.z + 1.15)), lens=24, shake_amp=shk, shake_freq=4)
        for ts in swings:
            ctx.once(ts - 0.1, "sword_swing")
            ctx.once(ts + 0.15, "hit")
        ctx.once(0.6, "zombie_groan", dist=0.2)
        ctx.once(2.4, "zombie_groan", dist=0.25)
        ctx.once(3.3, "zombie_death")
        ctx.once(4.3, "rain_start")
        ctx.once(5.15, "thunder", dist=0.2)

    # ============================================================= C7  lightning reveals the cave
    p_c7 = Path([(186, LANE), (196, LANE), (cx - 12.0, cy + 0.5), (cx - 2, cy + 0.5)], w, ceiling=cave_floor + 3)
    m_c7 = Mover(steve, p_c7, [(0, 5.6), (3.2, 5.0), (4.0, 3.5)], gait="run")

    def C7(ctx):
        t = ctx.t
        fl = 0.0
        for tf in (0.45, 2.3):
            if tf < t < tf + 0.35:
                fl = 1.0 if (t < tf + 0.08 or tf + 0.16 < t < tf + 0.24) else 0.25
        ctx.light("storm", flash=fl, exposure=1.7, fog_density=0.03)
        ctx.weather("rain", 1.0)
        props.set_vis(bolt1, 0.45 < t < 0.75)
        props.set_vis(bolt2, 2.3 < t < 2.55)
        loc, yaw, s = ctx.walk(steve, m_c7, surface="grass")
        L = Vector(loc)
        cam = L + Vector((-5.0 + 1.5 * ease(ctx.u), -2.4, 0))
        cam.z = max(L.z, gz(cam.x, cam.y)) + 1.6
        cave_pt = Vector((cx - 6, cy + 0.5, cave_floor + 1.8))
        ctx.camera(cam, L.lerp(cave_pt, 0.3) + Vector((0, 0, 1.0)), lens=26, shake_amp=0.06 + 0.25 * fl, shake_freq=3)
        ctx.once(0.45, "thunder", dist=0.0)
        ctx.once(2.3, "thunder", dist=0.4)

    return dict(C1=C1, C2=C2, C3=C3, C4=C4, C5=C5, C6=C6, C7=C7)
