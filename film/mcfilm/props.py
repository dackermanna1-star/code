"""Reusable animated props: Minecraft clouds, spawn sparkles, smoke puffs, birds, arrows, lightning."""
import math
import numpy as np
import bpy
from mathutils import Vector

from . import blcore as bc
from .noise import value2, hash01

A = bc.ANIM
HIDE = (1e-4, 1e-4, 1e-4)


def set_vis(obj, visible, scale=1.0):
    A.set(obj, "scale", (scale,) * 3 if visible else HIDE)


class Clouds:
    """Flat blocky cloud layer (12x12x4 block cells) that drifts along +x."""

    def __init__(self, center=(300, 128), z=120, extent=1800, cell=12, seed=5, cover=0.58, color=(1, 1, 1)):
        n = extent // cell
        xs, ys = np.meshgrid(np.arange(n), np.arange(n), indexing="ij")
        m = value2(xs / 5.0, ys / 5.0, seed=seed) * 0.7 + value2(xs / 1.7, ys / 1.7, seed=seed + 1) * 0.3
        mask = m > cover
        boxes, cols = [], []
        x0 = center[0] - extent / 2
        y0 = center[1] - extent / 2
        for i, j in np.argwhere(mask):
            boxes.append((x0 + i * cell, y0 + j * cell, 0, x0 + (i + 1) * cell, y0 + (j + 1) * cell, 4))
            cols.append(color)
        mat = bc.flat_material("CloudMat", (1, 1, 1), emission=0.0, alpha=0.82)
        self.obj = bc.boxes_mesh("clouds", boxes, cols, mat)
        self.obj.data.materials.clear()
        self.obj.data.materials.append(mat)
        self.obj.visible_shadow = False
        self.z = z
        self.offset = 0.0

    def update(self, ctx, speed=0.8, extra=0.0, z=None):
        A.set(self.obj, "location", (ctx.tg * speed + extra, 0, self.z if z is None else z))


class Sparkles:
    """Glittering cubes that spiral in to a point (spawn effect)."""

    def __init__(self, n=40, seed=3, color=(1.0, 0.95, 0.75)):
        rng = np.random.default_rng(seed)
        mat = bc.flat_material("SparkleMat", color, emission=9.0, fog=False)
        self.objs = []
        self.params = rng.uniform(0, 1, size=(n, 4))
        for i in range(n):
            s = 0.035 + 0.03 * self.params[i, 3]
            o = bc.boxes_mesh(f"sparkle{i}", [(-s, -s, -s, s, s, s)], [color], mat)
            o.visible_shadow = False
            self.objs.append(o)

    def update(self, center, u, burst=0.0, visible=True):
        """u: 0..1 progress of the inward spiral; burst>0 pushes them outward after the pop."""
        c = Vector(center)
        for i, o in enumerate(self.objs):
            p = self.params[i]
            if not visible:
                set_vis(o, False)
                continue
            ang = p[0] * 6.283 + u * (4 + 3 * p[1])
            r = (1 - u) * (1.6 + 1.6 * p[2]) + burst * (0.8 + 2.5 * p[2])
            z = 0.2 + 1.8 * p[1] * (1 - u) + u * 0.95 + burst * (0.6 + p[3])
            pos = c + Vector((math.cos(ang) * r, math.sin(ang) * r, z))
            A.set(o, "location", pos)
            fade = (1 - burst) if burst else min(1, u * 3)
            A.set(o, "scale", (max(1e-4, fade * (0.6 + 0.6 * math.sin(i + u * 30) ** 2)),) * 3)


class Puff:
    """Minecraft-style death smoke: grey/white cubes that expand and fade."""

    def __init__(self, name="puff", n=14, seed=9):
        rng = np.random.default_rng(seed)
        mat = bc.flat_material("PuffMat", (0.85, 0.85, 0.85), emission=0.4)
        self.objs = []
        self.dirs = rng.normal(size=(n, 3)) * np.array([1, 1, 0.6]) + np.array([0, 0, 0.8])
        for i in range(n):
            s = 0.12
            c = 0.6 + 0.35 * rng.random()
            o = bc.boxes_mesh(f"{name}{i}", [(-s, -s, -s, s, s, s)], [(c, c, c)], mat)
            o.visible_shadow = False
            self.objs.append(o)

    def update(self, center, u, visible=True):
        c = Vector(center)
        for i, o in enumerate(self.objs):
            if not visible or u <= 0 or u >= 1:
                set_vis(o, False)
                continue
            d = Vector(self.dirs[i])
            A.set(o, "location", c + d * (0.25 + 0.9 * u) + Vector((0, 0, 0.6 * u)))
            A.set(o, "scale", (max(1e-4, (1.2 + u) * (1 - u)),) * 3)


class Flock:
    def __init__(self, rigs):
        self.rigs = rigs

    def update(self, ctx, start, end, t0, t1, height_wobble=1.2, spread=4.0):
        u = (ctx.t - t0) / max(1e-6, t1 - t0)
        for i, r in enumerate(self.rigs):
            off = Vector(((i % 3) * spread * 0.7 - spread * 0.7, (i * 1.7) % spread - spread / 2, (i % 2) * 1.5))
            uu = u + 0.02 * i
            p = Vector(start).lerp(Vector(end), uu) + off
            p.z += math.sin(ctx.tg * 2 + i) * height_wobble
            d = Vector(end) - Vector(start)
            yaw = math.atan2(d.x, -d.y)
            flap = 55 * math.sin(ctx.tg * 14 + i * 1.3)
            ctx.pose(r, tuple(p), yaw, {"wing_l": flap, "wing_r": flap})


class Projectile:
    def __init__(self, obj):
        self.obj = obj

    def fly(self, p0, p1, u, arc=0.4, visible=True):
        if not visible:
            set_vis(self.obj, False)
            return
        p0, p1 = Vector(p0), Vector(p1)
        p = p0.lerp(p1, u)
        p.z += math.sin(math.pi * min(u, 1)) * arc
        d = (p1 - p0).normalized()
        A.set(self.obj, "location", p)
        # sprite points along -y (local) -> align -Y to direction
        A.set(self.obj, "rotation_euler", (-d).to_track_quat("Y", "Z").to_euler())
        set_vis(self.obj, True)


def lightning_bolt(name, top, bottom, seed=1):
    rng = np.random.default_rng(seed)
    top, bottom = Vector(top), Vector(bottom)
    n = 14
    boxes, cols = [], []
    pts = [top.lerp(bottom, i / n) + Vector((rng.normal() * 2.2, rng.normal() * 2.2, 0)) * (0 < i < n) for i in range(n + 1)]
    for a, b in zip(pts, pts[1:]):
        steps = 6
        for k in range(steps):
            p = a.lerp(b, k / steps)
            s = 0.25
            boxes.append((p.x - s, p.y - s, p.z - s * 4, p.x + s, p.y + s, p.z + s * 4))
            cols.append((0.85, 0.9, 1.0))
    mat = bc.flat_material("BoltMat", (0.85, 0.9, 1.0), emission=40.0, fog=False)
    o = bc.boxes_mesh(name, boxes, cols, mat)
    o.visible_shadow = False
    return o


def point_light(name, color=(1, 0.7, 0.4), energy=50, radius=0.2):
    ld = bpy.data.lights.new(name, "POINT")
    ld.color = color
    ld.energy = energy
    ld.shadow_soft_size = radius
    o = bpy.data.objects.new(name, ld)
    bc.link(o)
    return o

from .direct import Precip  # noqa: E402,F401
