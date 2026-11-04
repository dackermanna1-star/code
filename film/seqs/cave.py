"""Section 3b: the cave - glowing ores, the diamond chamber and the collapsing bridge over lava."""
import math
import numpy as np
from mathutils import Vector

from mcfilm import blcore as bc, characters as ch, direct as dr, props, worldgen as wg
from mcfilm.direct import keys, ease, seg, lerp, Path, Mover, mix_light, yaw_to
from mcfilm.voxel import B, World
from mcfilm.textures import TILE

A = bc.ANIM
R = math.radians
EAST = math.pi / 2
CV = wg.CV
cy = lambda x: 40 + 5 * math.sin(x / 17.0)
cz = lambda x: 50 + 3 * math.sin(x / 23.0 + 1)
BR_X0, BR_X1 = 126, 141
GRAVEL_X = (131, 132, 133)


def build_world():
    w = wg.cave()
    # a natural stone bridge across the ravine, 2 blocks wide, with a gravel section that collapses
    zb = int(math.floor(cz(133) - 2.2)) - 1
    CV["bridge_z"] = zb + 1
    for x in range(BR_X0, BR_X1 + 1):
        y = int(round(cy(x)))
        for yy in (y, y + 1):
            if x in GRAVEL_X:
                w.b[x, yy, zb] = 0  # gravel blocks are separate falling objects
            else:
                w.b[x, yy, zb] = B["stone"]
                w.b[x, yy, zb - 1] = B["stone"] if (x - BR_X0) % 3 else 0
            for z in range(zb + 1, zb + 5):
                w.b[x, yy, z] = 0
    CV["bridge_y"] = [int(round(cy(x))) for x in GRAVEL_X]
    # lava pockets in the tunnel walls for extra glow
    for (x, y, z) in ((30, 36, 51), (58, 45, 49), (72, 35, 52), (110, 44, 50)):
        w.b[x - 1:x + 1, y - 1:y + 1, z - 1:z + 1] = np.where(w.b[x - 1:x + 1, y - 1:y + 1, z - 1:z + 1] != 0,
                                                             B["lava"], 0)
    return w


def gravel_block(name, x, y, z):
    from mcfilm.textures import tile_uv
    u0, v0, s = tile_uv(TILE["gravel"])
    verts = bc.box_mesh_data(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5)
    uvs = np.tile(np.array([(u0 + .002, v0 + .002), (u0 + s - .002, v0 + .002), (u0 + s - .002, v0 + s - .002),
                            (u0 + .002, v0 + s - .002)]), (6, 1))
    o = bc.quads_mesh(name, verts, uvs, np.ones((24, 3)) * 0.9, np.ones(24) * 0.9, bc.terrain_material())
    o.location = (x + 0.5, y + 0.5, z + 0.5)
    return o


def setup(d, w):
    floor = lambda x, y: w.top_z(x, y, below=int(cz(x) + 2.5))
    steve = d.add_rig(ch.humanoid("steve", ch.steve_skin(worn=0.15)))
    sword = ch.sword("steve_sword")
    steve.attach(sword, "arm_r", (-1 * ch.PX, 0, -9.5 * ch.PX), (0, 0, 0))
    zb = CV["bridge_z"]
    grav = []
    for x in GRAVEL_X:
        y = int(round(cy(x)))
        for yy in (y, y + 1):
            grav.append(gravel_block(f"gravel_{x}_{yy}", x, yy, zb - 1))
    follow = props.point_light("FollowLight", (0.55, 0.65, 1.0), 25, 0.5)
    follow.data.use_shadow = False
    diamond_l = props.point_light("DiamondLight", (0.3, 0.95, 1.0), 0, 0.4)
    lava_ls = []
    for i, x in enumerate((128, 133, 138)):
        l = props.point_light(f"Lava{i}", (1.0, 0.42, 0.1), 9000, 2.0)
        l.location = (x, cy(x) + (i - 1) * 6, 16)
        l.data.use_shadow = i == 1
        lava_ls.append(l)
    for i, (x, y, z) in enumerate(((30, 37, 51.5), (58, 44, 50), (72, 36, 52.5), (110, 43, 51))):
        l = props.point_light(f"Pocket{i}", (1.0, 0.45, 0.12), 120, 0.4)
        l.location = (x, y, z)
        l.data.use_shadow = False
    embers = props.Precip("dust", count=900, box=(18, 30, 40), speed=-1.5, seed=7)
    d.weather["embers"] = embers

    def common(ctx):
        A.set(diamond_l, "location", (93.5, 40.0, 52.0))
        A.set(diamond_l.data, "energy", 600.0 if ctx.sid == "C9" else 150.0)
    d.extra.append(common)

    def follow_light(ctx, loc, energy=25):
        A.set(follow, "location", Vector(loc) + Vector((-1.5, -1.0, 2.6)))
        A.set(follow.data, "energy", energy)

    # ============================================================= C8  tunnels
    xs8 = np.linspace(36, 52, 9)
    p_c8 = Path([(x, cy(x)) for x in xs8], w, ceiling=None)
    p_c8.ground = lambda x, y, r=0.28: float(floor(x, y))
    m_c8 = Mover(steve, p_c8, [(0, 1.0), (0.8, 2.0)], surface="stone")

    def C8(ctx):
        t = ctx.t
        ctx.light("cave")
        loc, yaw, s = ctx.walk(steve, m_c8, extra={"arm_r": 30, "head_yaw": keys(t, [(0, 0), (1.5, -30), (3, 30), (4.5, 0)]),
                                                     "head_pitch": keys(t, [(0, 0), (2, 12), (4, 0)])})
        follow_light(ctx, loc)
        x = loc[0]
        cam = Vector((x - 3.6, cy(x - 3.6) - 0.4, loc[2] + 1.6))
        ctx.camera(cam, Vector(loc) + Vector((2.5, 0, 1.0)), lens=24, shake_amp=0.03, shake_freq=0.7)
        ctx.weather("embers", 0.0)
        ctx.once(0.2, "amb_cave")
        ctx.once(2.0, "drip")
        ctx.once(4.1, "drip")
        ctx.once(5.2, "cave_growl")

    # ============================================================= C9  diamonds
    xs9 = np.linspace(80, 88.5, 6)
    p_c9 = Path([(x, cy(x)) for x in xs9], w)
    p_c9.ground = lambda x, y, r=0.28: float(floor(x, y))
    m_c9 = Mover(steve, p_c9, [(0, 2.0), (2.0, 1.2), (2.9, 0.0)], surface="stone")

    def C9(ctx):
        t = ctx.t
        ctx.light("cave", emit_strength=3.2)
        loc, yaw, s, mv = m_c9.state(t)
        if mv:
            ctx.walk(steve, m_c9, extra={"arm_r": 30})
        else:
            p = {"arm_r": 25, "head_pitch": keys(t, [(2.9, 0), (3.6, 8)]), "head_yaw": keys(t, [(2.9, 0), (3.8, -8)]),
                 "arm_l": keys(t, [(3.6, 0), (4.4, 35)]), "arm_l_out": -6}
            ctx.pose(steve, loc, yaw, p)
        follow_light(ctx, loc, energy=10)
        head = Vector(loc) + Vector((0, 0, 1.6))
        cam = Vector((92.0, cy(92) - 1.4, loc[2] + 1.55)) + Vector((-0.4, 0.1, 0)) * ease(ctx.u)
        ctx.camera(cam, head + Vector((0.4, 0, -0.05)), lens=34, shake_amp=0.01, focus=(cam - head).length, fstop=2.2)
        ctx.once(3.0, "diamond_shimmer")

    # ============================================================= C10  the collapsing bridge
    xs10 = [119, 123, 127, 130.3]
    p10 = Path([(x, cy(x) + 0.95) for x in xs10], w)
    p10.ground = lambda x, y, r=0.28: float(floor(x, y))
    m10 = Mover(steve, p10, [(0, 2.0), (1.2, 2.2)], surface="stone")
    jump_t0, jump_t1 = 1.75, 2.3
    land_x = 134.8

    def C10(ctx):
        t = ctx.t
        ctx.light("cave", emit_strength=2.4, fog_density=0.03, fog_color=(0.06, 0.02, 0.01))
        ctx.weather("embers", 1.0)
        if t < jump_t0:
            loc, yaw, s = ctx.walk(steve, m10, extra={"arm_r": 35, "head_pitch": -18 * seg(t, 0.4, 1.0) + 25 * seg(t, 1.3, 1.6)})
        elif t < jump_t1:
            u = seg(t, jump_t0, jump_t1)
            x0 = m10.state(jump_t0)[0][0]
            x = lerp(x0, land_x, u)
            z = zb + math.sin(math.pi * u) * 1.1
            sp = math.sin(math.pi * u)
            ctx.pose(steve, (x, cy(x) + 0.95, z), EAST, {"leg_r": 50 * sp, "leg_l": -35 * sp, "arm_r": 120 * sp + 20,
                                                         "arm_l": 90 * sp, "lean": 15})
            loc = (x, cy(x) + 0.95, z)
        else:
            tt = t - jump_t1
            x = land_x + 2.0 * tt * (1 - min(1, tt) * 0.3)
            stumble = math.exp(-tt * 5)
            p, _ = dr.gait_pose(x - land_x, "walk", 1.0)
            p.update({"lean": 25 * stumble + 5, "arm_r": 40, "arm_l": 50 * stumble})
            loc = (x, cy(x) + 0.95, zb)
            ctx.pose(steve, loc, EAST, p)
            if abs(tt) < 1.0 / 24:
                ctx.event("land", surface="stone")
        # gravel shakes then falls
        for i, g in enumerate(grav):
            gx = GRAVEL_X[i // 2]
            base = Vector((gx + 0.5, cy(gx) + (i % 2) + 0.3, zb - 0.5))
            tf = 1.85 + 0.07 * i
            if t < tf:
                sh = 0.03 * seg(t, 1.3, 1.5) * math.sin(t * 90 + i)
                A.set(g, "location", base + Vector((sh, sh * 0.5, 0)))
                A.set(g, "rotation_euler", (0, 0, 0))
                props.set_vis(g, True)
            else:
                tt = t - tf
                z = base.z - 0.5 * 22 * tt * tt
                A.set(g, "location", base + Vector((0.2 * tt * (i - 3), 0.3 * tt, z - base.z)))
                A.set(g, "rotation_euler", (tt * (1 + i), tt * 2, 0))
                props.set_vis(g, z > 12.5)
        follow_light(ctx, loc, energy=15)
        cam = keys(t, [(0, Vector((128.5, cy(128) - 11.0, zb + 1.4))), (5, Vector((133.0, cy(133) - 12.5, zb + 0.6)))])
        tgt = keys(t, [(0, Vector(loc) + Vector((0, 0, 1.0))), (5, Vector(loc) + Vector((0, 0, 1.0)))])
        tgt = Vector(loc) + Vector((0.8, 0, 0.6))
        shk = 0.03 + 0.15 * seg(t, 1.3, 1.6) * (1 - seg(t, 2.6, 3.4))
        ctx.camera(cam, tgt, lens=26, shake_amp=shk, shake_freq=3)
        ctx.once(0.0, "amb_lava")
        ctx.once(1.3, "rumble_short")
        ctx.once(1.75, "jump")
        ctx.once(1.9, "gravel_fall")
        ctx.once(3.3, "lava_splash")

    return dict(C8=C8, C9=C9, C10=C10)
