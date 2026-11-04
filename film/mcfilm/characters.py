"""Blocky characters: procedural skins (Minecraft box-UV layout), rigs built from boxes, items."""
import math
import numpy as np
import bpy

from . import blcore as bc

PX = 1.0 / 16.0 * 0.9375  # metres per skin pixel (Steve ~1.8 m tall)


# ====================================================================== skin painting
def regions(u, v, w, h, d):
    return {
        "top": (u + d, v, w, d), "bottom": (u + d + w, v, w, d),
        "right": (u, v + d, d, h), "front": (u + d, v + d, w, h),
        "left": (u + d + w, v + d, d, h), "back": (u + 2 * d + w, v + d, w, h),
    }


class Skin:
    def __init__(self, w=64, h=64, seed=0):
        self.img = np.zeros((h, w, 4))
        self.rng = np.random.default_rng(seed)
        self.W, self.H = w, h

    def fill(self, reg, color, var=0.06, alpha=1.0):
        x, y, w, h = reg
        c = np.asarray(color, float)
        n = self.rng.uniform(-var, var, (h, w, 1))
        self.img[y:y + h, x:x + w, :3] = np.clip(c[None, None] * (1 + n), 0, 1)
        self.img[y:y + h, x:x + w, 3] = alpha

    def px(self, reg, x, y, color, w=1, h=1):
        rx, ry, rw, rh = reg
        self.img[ry + y:ry + y + h, rx + x:rx + x + w, :3] = color
        self.img[ry + y:ry + y + h, rx + x:rx + x + w, 3] = 1

    def box(self, uv, dims, color, var=0.06, faces=None):
        R = regions(*uv, *dims)
        for k, reg in R.items():
            if faces is None or k in faces:
                self.fill(reg, color, var)
        return R

    def band(self, R, y0, y1, color, var=0.06, faces=("front", "back", "left", "right")):
        for k in faces:
            x, y, w, h = R[k]
            self.fill((x, y + y0, w, y1 - y0), color, var)

    def image(self, name):
        return bc.make_image(name, self.img)


SKIN_TONE = (0.72, 0.52, 0.4)
HAIR = (0.24, 0.15, 0.08)
SHIRT = (0.0, 0.62, 0.64)
PANTS = (0.24, 0.22, 0.62)
SHOES = (0.32, 0.32, 0.34)


def paint_humanoid_head(s, uv, hair=HAIR, skin=SKIN_TONE, eye_white=(0.95, 0.95, 0.95),
                        pupil=(0.32, 0.25, 0.65), mouth=(0.42, 0.24, 0.16), beard=True, zombie=False):
    R = s.box(uv, (8, 8, 8), skin)
    s.fill(R["top"], hair)
    s.fill(R["back"], hair)
    for k in ("left", "right"):
        x, y, w, h = R[k]
        s.fill((x, y, w, 2), hair)
        s.fill((x + (4 if k == "left" else 0), y + 2, 4, 2), hair)
    f = R["front"]
    s.fill((f[0], f[1], 8, 2), hair)
    s.px(f, 0, 2, hair); s.px(f, 7, 2, hair)
    if zombie:
        s.px(f, 1, 4, (0.05, 0.08, 0.05), 2, 1); s.px(f, 5, 4, (0.05, 0.08, 0.05), 2, 1)
        s.px(f, 2, 6, (0.18, 0.3, 0.15), 4, 1)
    else:
        s.px(f, 1, 4, eye_white); s.px(f, 2, 4, pupil)
        s.px(f, 5, 4, pupil); s.px(f, 6, 4, eye_white)
        s.px(f, 3, 5, (skin[0] * .85, skin[1] * .8, skin[2] * .8), 2, 1)
        if beard:
            s.px(f, 2, 6, mouth, 4, 1)
            s.px(f, 2, 7, (mouth[0] * 1.2, mouth[1] * 1.2, mouth[2] * 1.2), 4, 1)
    return R


def steve_skin(worn=0.0, seed=1):
    s = Skin(seed=seed)
    paint_humanoid_head(s, (0, 0))
    R = s.box((16, 16), (8, 12, 4), SHIRT)
    s.band(R, 0, 1, (SHIRT[0], SHIRT[1] * .85, SHIRT[2] * .85))
    x, y, w, h = R["front"]
    s.px(R["front"], 3, 0, SKIN_TONE, 2, 1)  # collar
    s.band(R, 10, 12, (PANTS[0] * 1.1, PANTS[1] * 1.1, PANTS[2] * 1.1))
    for uv in ((40, 16), (32, 48)):
        Ra = s.box(uv, (4, 12, 4), SKIN_TONE)
        s.band(Ra, 0, 4, SHIRT)
        s.fill(Ra["top"], SHIRT)
    for uv in ((0, 16), (16, 48)):
        Rl = s.box(uv, (4, 12, 4), PANTS)
        s.band(Rl, 9, 12, SHOES)
        s.fill(Rl["bottom"], SHOES)
    if worn > 0:
        dirt = s.rng.random((64, 64)) < 0.12 * worn
        s.img[dirt, :3] *= np.array([0.65, 0.6, 0.55])
        tear = s.rng.random((64, 64)) < 0.04 * worn
        s.img[tear, :3] *= 0.5
        s.img[:, :, :3] = s.img[:, :, :3] * (1 - 0.18 * worn) + 0.18 * worn * np.array([0.45, 0.4, 0.33])
    return s


def zombie_skin(seed=3):
    s = Skin(seed=seed)
    green = (0.3, 0.52, 0.27)
    paint_humanoid_head(s, (0, 0), hair=(0.22, 0.4, 0.2), skin=green, zombie=True)
    R = s.box((16, 16), (8, 12, 4), SHIRT, var=0.12)
    s.band(R, 10, 12, PANTS)
    for uv in ((40, 16), (32, 48)):
        Ra = s.box(uv, (4, 12, 4), green, var=0.1)
        s.band(Ra, 0, 4, SHIRT, var=0.12)
    for uv in ((0, 16), (16, 48)):
        Rl = s.box(uv, (4, 12, 4), PANTS, var=0.1)
        s.band(Rl, 9, 12, (0.25, 0.25, 0.27))
    return s


def skeleton_skin(seed=4):
    s = Skin(seed=seed)
    bone = (0.78, 0.78, 0.76)
    dark = (0.25, 0.25, 0.25)
    R = s.box((0, 0), (8, 8, 8), bone)
    f = R["front"]
    s.px(f, 1, 3, dark, 2, 2); s.px(f, 5, 3, dark, 2, 2)
    s.px(f, 3, 5, (0.4, 0.4, 0.4), 2, 1)
    s.px(f, 1, 6, dark, 6, 1)
    for i in range(1, 7, 2):
        s.px(f, i, 6, bone)
    R = s.box((16, 16), (8, 12, 4), dark)
    for k in ("front", "back"):
        s.px(R[k], 3, 0, bone, 2, 12)
        for yy in (1, 3, 5, 7):
            s.px(R[k], 1, yy, bone, 6, 1)
        s.px(R[k], 1, 10, bone, 6, 2)
    for uv in ((40, 16), (32, 48), (0, 16), (16, 48)):
        s.box(uv, (2, 12, 2), bone, var=0.08)
    return s


def villager_skin(robe=(0.42, 0.3, 0.2), apron=None, seed=5):
    s = Skin(seed=seed)
    skin = (0.68, 0.5, 0.38)
    R = s.box((0, 0), (8, 10, 8), skin)
    s.fill(R["top"], (0.4, 0.28, 0.18))
    f = R["front"]
    s.px(f, 0, 2, (0.32, 0.22, 0.15), 8, 1)  # unibrow
    s.px(f, 1, 3, (0.95, 0.95, 0.95)); s.px(f, 2, 3, (0.12, 0.45, 0.15))
    s.px(f, 5, 3, (0.12, 0.45, 0.15)); s.px(f, 6, 3, (0.95, 0.95, 0.95))
    s.px(f, 2, 7, (0.45, 0.3, 0.22), 4, 1)
    s.box((24, 0), (2, 4, 2), (skin[0] * .92, skin[1] * .88, skin[2] * .85))
    Rb = s.box((16, 20), (8, 12, 6), robe)
    Rr = s.box((0, 38), (8, 8, 6), robe)
    if apron:
        for RR in (Rb, Rr):
            x, y, w, h = RR["front"]
            s.fill((x + 1, y + (4 if RR is Rb else 0), 6, h - (4 if RR is Rb else 0)), apron)
    s.box((28, 52), (12, 4, 4), robe)          # crossed arms
    s.box((44, 22), (4, 8, 4), robe)            # upper arms
    s.box((0, 22), (4, 12, 4), (0.3, 0.22, 0.16))  # legs
    return s


# ====================================================================== mesh for a box part
def part_mesh(name, box, uv, dims, tex_size, mat, scale=PX):
    """box=(x0,y0,z0,x1,y1,z1) in px relative to pivot; uv=(u,v) skin offset; dims=(w,h,d)."""
    from .voxel import FACES, LOCAL
    TW, TH = tex_size
    R = regions(*uv, *dims)
    fmap = {(1, 0, 0): "left", (-1, 0, 0): "right", (0, 1, 0): "back", (0, -1, 0): "front",
            (0, 0, 1): "top", (0, 0, -1): "bottom"}
    x0, y0, z0, x1, y1, z1 = box
    V, UV = [], []
    for n, corners, _, _ in FACES:
        rx, ry, rw, rh = R[fmap[tuple(n)]]
        for c, (a, b) in zip(corners, LOCAL):
            V.append(((x0 if c[0] == 0 else x1) * scale, (y0 if c[1] == 0 else y1) * scale,
                      (z0 if c[2] == 0 else z1) * scale))
            pxu = rx + a * rw
            pyv = ry + (1 - b) * rh
            UV.append((pxu / TW, 1 - pyv / TH))
    return bc.quads_mesh(name, np.array(V), np.array(UV), mat=mat)


# ====================================================================== rigs
class Rig:
    def __init__(self, name):
        self.name = name
        self.root = bc.empty(name)
        self.parts = {}
        self.meshes = []
        self.items = {}
        self.base = {}
        self.scale = 1.0

    def add(self, pname, parent, pivot, box=None, uv=None, dims=None, tex=None, mat=None, scale=PX):
        par = self.root if parent is None else self.parts[parent]
        if box is not None:
            o = part_mesh(f"{self.name}_{pname}", box, uv, dims, tex, mat, scale)
            o.parent = par
            self.meshes.append(o)
            o["hurt"] = 0.0
        else:
            o = bc.empty(f"{self.name}_{pname}", parent=par)
        o.location = tuple(p * scale for p in pivot)
        self.base[pname] = tuple(p * scale for p in pivot)
        o.rotation_mode = "XYZ"
        self.parts[pname] = o
        return o

    # p: dict of angles in degrees
    def pose(self, loc, yaw, p=None, visible=True):
        p = p or {}
        A = bc.ANIM
        A.set(self.root, "location", loc)
        A.set(self.root, "rotation_euler", (math.radians(p.get("root_pitch", 0)),
                                            math.radians(p.get("root_roll", 0)), yaw))
        A.set(self.root, "scale", (self.scale * p.get("squash", 1.0),) * 3 if visible else (1e-4,) * 3)
        r = math.radians
        if "hips" in self.parts:
            bx, by, bz = self.base["hips"]
            A.set(self.parts["hips"], "location", (bx, by, bz + p.get("bob", 0.0)))
            A.set(self.parts["hips"], "rotation_euler", (r(p.get("lean", 0)), r(p.get("body_roll", 0)),
                                                         r(p.get("body_yaw", 0))))
        if "head" in self.parts:
            A.set(self.parts["head"], "rotation_euler", (r(-p.get("head_pitch", 0)), r(p.get("head_roll", 0)),
                                                         r(p.get("head_yaw", 0))))
        for side, sgn in (("r", 1), ("l", -1)):
            if f"arm_{side}" in self.parts:
                A.set(self.parts[f"arm_{side}"], "rotation_euler",
                      (r(-p.get(f"arm_{side}", 0)), r(sgn * p.get(f"arm_{side}_out", 0)),
                       r(p.get(f"arm_{side}_twist", 0))))
            if f"leg_{side}" in self.parts:
                A.set(self.parts[f"leg_{side}"], "rotation_euler",
                      (r(-p.get(f"leg_{side}", 0)), r(sgn * p.get(f"leg_{side}_out", 0)), 0))
        for k in ("leg_fl", "leg_fr", "leg_bl", "leg_br", "wing_l", "wing_r", "neck"):
            if k in self.parts and k in p:
                ax = 1 if k.startswith("wing") else 0
                rot = [0, 0, 0]
                rot[ax] = r(-p[k]) if ax == 0 else r(p[k] if k == "wing_l" else -p[k])
                A.set(self.parts[k], "rotation_euler", tuple(rot))
        if "hurt" in p or True:
            for m in self.meshes:
                A.set(m, '["hurt"]', p.get("hurt", 0.0))

    def attach(self, item, part="arm_r", loc=(0, 0, 0), rot=(0, 0, 0), key=None):
        item.parent = self.parts[part]
        item.location = loc
        item.rotation_euler = tuple(math.radians(a) for a in rot)
        self.items[key or item.name] = item
        return item


def humanoid(name, skin, kind="steve", tex_size=(64, 64)):
    img = skin.image(name + "_skin")
    mat = bc.skin_material(name + "_mat", img)
    rig = Rig(name)
    rig.add("hips", None, (0, 0, 12))
    rig.add("body", "hips", (0, 0, 0), (-4, -2, 0, 4, 2, 12), (16, 16), (8, 12, 4), tex_size, mat)
    rig.add("head", "hips", (0, 0, 12), (-4, -4, 0, 4, 4, 8), (0, 0), (8, 8, 8), tex_size, mat)
    if kind == "skeleton":
        rig.add("arm_r", "hips", (-5, 0, 10), (-1, -1, -10, 1, 1, 2), (40, 16), (2, 12, 2), tex_size, mat)
        rig.add("arm_l", "hips", (5, 0, 10), (-1, -1, -10, 1, 1, 2), (32, 48), (2, 12, 2), tex_size, mat)
        rig.add("leg_r", None, (-2, 0, 12), (-1, -1, -12, 1, 1, 0), (0, 16), (2, 12, 2), tex_size, mat)
        rig.add("leg_l", None, (2, 0, 12), (-1, -1, -12, 1, 1, 0), (16, 48), (2, 12, 2), tex_size, mat)
    else:
        rig.add("arm_r", "hips", (-5, 0, 10), (-3, -2, -10, 1, 2, 2), (40, 16), (4, 12, 4), tex_size, mat)
        rig.add("arm_l", "hips", (5, 0, 10), (-1, -2, -10, 3, 2, 2), (32, 48), (4, 12, 4), tex_size, mat)
        rig.add("leg_r", None, (-2, 0, 12), (-2, -2, -12, 2, 2, 0), (0, 16), (4, 12, 4), tex_size, mat)
        rig.add("leg_l", None, (2, 0, 12), (-2, -2, -12, 2, 2, 0), (16, 48), (4, 12, 4), tex_size, mat)
    rig.mat = mat
    return rig


def villager(name, robe=(0.42, 0.3, 0.2), apron=None, seed=5):
    s = villager_skin(robe, apron, seed)
    img = s.image(name + "_skin")
    mat = bc.skin_material(name + "_mat", img)
    T = (64, 64)
    rig = Rig(name)
    rig.add("hips", None, (0, 0, 12))
    rig.add("body", "hips", (0, 0, 0), (-4, -3, 0, 4, 3, 12), (16, 20), (8, 12, 6), T, mat)
    rig.add("robe", "hips", (0, 0, 0), (-4.2, -3.2, -8, 4.2, 3.2, 0), (0, 38), (8, 8, 6), T, mat)
    rig.add("head", "hips", (0, 0, 12), (-4, -4, 0, 4, 4, 10), (0, 0), (8, 10, 8), T, mat)
    rig.add("nose", "head", (0, -4, 2), (-1, -2, -1, 1, 0, 3), (24, 0), (2, 4, 2), T, mat)
    rig.add("arms", "hips", (0, -3, 8), (-6, -4, -4, 6, 0, 0), (28, 52), (12, 4, 4), T, mat)
    rig.add("leg_r", None, (-2, 0, 12), (-2, -2, -12, 2, 2, 0), (0, 22), (4, 12, 4), T, mat)
    rig.add("leg_l", None, (2, 0, 12), (-2, -2, -12, 2, 2, 0), (0, 22), (4, 12, 4), T, mat)
    rig.mat = mat
    return rig


def quadruped(name, kind="sheep", seed=6):
    """Sheep / pig / cow built from coloured boxes (simple textures painted on the skin)."""
    cfg = {
        "sheep": dict(body=(6, 16, 8), body_col=(0.92, 0.91, 0.88), head=(6, 6, 8), head_col=(0.75, 0.68, 0.6),
                      leg=(4, 12, 4), leg_col=(0.8, 0.72, 0.62), face=(0.2, 0.15, 0.12)),
        "pig": dict(body=(8, 16, 8), body_col=(0.93, 0.62, 0.6), head=(8, 8, 8), head_col=(0.93, 0.62, 0.6),
                    leg=(4, 6, 4), leg_col=(0.88, 0.56, 0.55), face=(0.2, 0.1, 0.1)),
        "cow": dict(body=(10, 18, 12), body_col=(0.35, 0.25, 0.18), head=(8, 6, 8), head_col=(0.35, 0.25, 0.18),
                    leg=(4, 12, 4), leg_col=(0.35, 0.25, 0.18), face=(0.1, 0.1, 0.1)),
    }[kind]
    s = Skin(seed=seed)
    bw, bl, bh = cfg["body"]
    hw, hh, hd = cfg["head"]
    lw, lh, ld = cfg["leg"]
    Rb = s.box((0, 32), (bw, bl, bh), cfg["body_col"], var=0.1)
    Rh = s.box((0, 0), (hw, hh, hd), cfg["head_col"])
    f = Rh["front"]
    s.px(f, 0, 2, (0.95, 0.95, 0.95)); s.px(f, 1, 2, cfg["face"])
    s.px(f, hw - 2, 2, cfg["face"]); s.px(f, hw - 1, 2, (0.95, 0.95, 0.95))
    if kind == "pig":
        s.px(f, 2, 4, (0.85, 0.48, 0.5), 4, 3); s.px(f, 3, 5, (0.4, 0.2, 0.2)); s.px(f, 4, 5, (0.4, 0.2, 0.2))
    if kind == "cow":
        for _ in range(6):
            k = list(Rb.keys())[s.rng.integers(0, 6)]
            x, y, w, h = Rb[k]
            xx, yy = s.rng.integers(0, max(1, w - 3)), s.rng.integers(0, max(1, h - 3))
            s.fill((x + xx, y + yy, 4, 3), (0.92, 0.92, 0.9))
        s.px(f, 2, 4, (0.75, 0.6, 0.55), 4, 2)
    if kind == "sheep":
        s.fill((f[0], f[1], hw, 1), (0.92, 0.91, 0.88))
    Rl = s.box((40, 0), (lw, lh, ld), cfg["leg_col"])
    if kind == "sheep":
        s.band(Rl, 0, 5, (0.92, 0.91, 0.88))
    img = s.image(name + "_skin")
    mat = bc.skin_material(name + "_mat", img)
    T = (64, 64)
    rig = Rig(name)
    lz = lh
    # body lies horizontally: depth along y = body length
    rig.add("hips", None, (0, 0, lz))
    rig.add("body", "hips", (0, 0, 0), (-bw / 2, -bl / 2, 0, bw / 2, bl / 2, bh), (0, 32), (bw, bl, bh), T, mat)
    rig.add("head", "hips", (0, -bl / 2, bh * 0.75), (-hw / 2, -hd, -hh / 2, hw / 2, 0, hh / 2), (0, 0),
            (hw, hh, hd), T, mat)
    for k, (sx, sy) in {"leg_fl": (1, -1), "leg_fr": (-1, -1), "leg_bl": (1, 1), "leg_br": (-1, 1)}.items():
        rig.add(k, None, (sx * (bw / 2 - lw / 2), sy * (bl / 2 - ld / 2 - 0.5), lz),
                (-lw / 2, -ld / 2, -lh, lw / 2, ld / 2, 0), (40, 0), (lw, lh, ld), T, mat)
    rig.mat = mat
    return rig


def bird(name, color=(0.15, 0.15, 0.18), size=0.09):
    mat = bc.vcol_material("VCol")
    rig = Rig(name)
    rig.add("hips", None, (0, 0, 0))
    body = bc.boxes_mesh(name + "_body", [(-1, -3, -1, 1, 3, 1)], [color], mat)
    body.parent = rig.parts["hips"]
    for o in (body,):
        o.scale = (size,) * 3
    for side, sx in (("wing_l", 1), ("wing_r", -1)):
        piv = bc.empty(f"{name}_{side}", parent=rig.parts["hips"], loc=(sx * size, 0, 0))
        w = bc.boxes_mesh(f"{name}_{side}m", [(0 if sx > 0 else -5, -1.5, -0.2, 5 if sx > 0 else 0, 1.5, 0.2)],
                          [color], mat)
        w.parent = piv
        w.scale = (size,) * 3
        piv.rotation_mode = "XYZ"
        rig.parts[side] = piv
    return rig


def shadow_figure(name):
    """The ambiguous colossal figure glimpsed in the Far Lands fog: tall, thin, featureless."""
    mat = bc.flat_material("ShadowFigure", (0.015, 0.012, 0.02))
    eye = bc.flat_material("ShadowEyes", (0.8, 0.5, 1.0), emission=3.0, fog=True)
    rig = Rig(name)
    rig.add("hips", None, (0, 0, 30))
    b = bc.boxes_mesh(name + "_torso", [(-4, -2, 0, 4, 2, 14)], [(0.02, 0.02, 0.03)], mat)
    b.parent = rig.parts["hips"]
    hd = bc.empty(name + "_headpiv", parent=rig.parts["hips"], loc=(0, 0, 14))
    h = bc.boxes_mesh(name + "_head", [(-4, -4, 0, 4, 4, 8)], [(0.02, 0.02, 0.03)], mat)
    h.parent = hd
    e = bc.boxes_mesh(name + "_eyes", [(-3, -4.1, 3.5, -1, -3.9, 4.5), (1, -4.1, 3.5, 3, -3.9, 4.5)],
                      [(1, 1, 1)] * 2, eye)
    e.parent = hd
    rig.parts["head"] = hd
    for side, sx in (("arm_r", -1), ("arm_l", 1)):
        p = bc.empty(f"{name}_{side}", parent=rig.parts["hips"], loc=(sx * 5, 0, 13))
        a = bc.boxes_mesh(f"{name}_{side}m", [(-1, -1, -28, 1, 1, 0)], [(0.02, 0.02, 0.03)], mat)
        a.parent = p
        rig.parts[side] = p
    for side, sx in (("leg_r", -1), ("leg_l", 1)):
        p = bc.empty(f"{name}_{side}", parent=rig.root, loc=(sx * 2, 0, 30))
        a = bc.boxes_mesh(f"{name}_{side}m", [(-1, -1, -30, 1, 1, 0)], [(0.02, 0.02, 0.03)], mat)
        a.parent = p
        rig.parts[side] = p
    for o in rig.parts.values():
        o.rotation_mode = "XYZ"
    rig.base = {k: tuple(v.location) for k, v in rig.parts.items()}
    return rig


# ====================================================================== item sprites
def sprite_mesh(name, art, palette, px=PX, depth=1.0, emission=0.0):
    """art: list of strings (rows, top first); palette: char -> rgb. Pivot = grip pixel '@' if present."""
    boxes, cols = [], []
    grip = None
    rows = len(art)
    for j, row in enumerate(art):
        for i, ch in enumerate(row):
            if ch == "@":
                grip = (i, j)
    gi, gj = grip if grip else (0, rows - 1)
    for j, row in enumerate(art):
        for i, ch in enumerate(row):
            if ch in " .":
                continue
            c = palette.get(ch, palette.get("@"))
            y = -(i - gi)
            z = (gj - j)
            boxes.append((-depth / 2 * px, (y - 0.5) * px, (z - 0.5) * px, depth / 2 * px, (y + 0.5) * px,
                          (z + 0.5) * px))
            cols.append(c)
    mat = bc.vcol_material("VColEmit", emission=emission) if emission else bc.vcol_material("VCol")
    o = bc.boxes_mesh(name, boxes, cols, mat)
    o["hurt"] = 0.0
    return o


SWORD = [
    "..............ok",
    ".............obk",
    "............obbk",
    "...........obbk.",
    "..........obbk..",
    ".........obbk...",
    "........obbk....",
    ".......obbk.....",
    "......obbk......",
    ".gg..obbk.......",
    ".gggobbk........",
    "..gghbk.........",
    "...h@g..........",
    "..hhgg..........",
    ".pp..gg.........",
    "pp..............",
]
SWORD_PAL = {"o": (0.3, 0.3, 0.33), "b": (0.86, 0.86, 0.88), "k": (0.55, 0.55, 0.6), "g": (0.22, 0.2, 0.2),
             "h": (0.42, 0.28, 0.14), "@": (0.42, 0.28, 0.14), "p": (0.3, 0.2, 0.1)}
SWORD_WORN_PAL = dict(SWORD_PAL, b=(0.62, 0.6, 0.58), k=(0.42, 0.4, 0.4))

BOW = [
    "......kkk.......",
    ".....k..s.......",
    "....k...s.......",
    "...k....s.......",
    "..k.....s.......",
    "..k.....s.......",
    ".k......s.......",
    ".@......s.......",
    ".k......s.......",
    "..k.....s.......",
    "..k.....s.......",
    "...k....s.......",
    "....k...s.......",
    ".....k..s.......",
    "......kkk.......",
]
BOW_PAL = {"k": (0.45, 0.3, 0.15), "@": (0.35, 0.22, 0.1), "s": (0.85, 0.85, 0.85)}

ARROW = ["f.......", ".s......", "..s.....", "...s....", "....s...", ".....s..", "......t@", ".......t"]
ARROW_PAL = {"f": (0.85, 0.85, 0.85), "s": (0.45, 0.32, 0.18), "t": (0.6, 0.6, 0.6), "@": (0.6, 0.6, 0.6)}

TORCH = ["..ff..", ".fyyf.", "..yy..", "..ww..", "..ww..", "..ww..", "..@w..", "..ww.."]
TORCH_PAL = {"f": (1.0, 0.6, 0.15), "y": (1.0, 0.92, 0.5), "w": (0.45, 0.32, 0.18), "@": (0.45, 0.32, 0.18)}


def sword(name="sword", worn=False):
    art = [list(r) for r in SWORD]
    if worn:
        for (j, i) in ((2, 13), (5, 11), (7, 9)):
            art[j][i] = "."
    return sprite_mesh(name, ["".join(r) for r in art], SWORD_WORN_PAL if worn else SWORD_PAL)


def bow(name="bow"):
    return sprite_mesh(name, BOW, BOW_PAL)


def arrow(name="arrow"):
    return sprite_mesh(name, ARROW, ARROW_PAL)


def torch(name="torch"):
    return sprite_mesh(name, TORCH, TORCH_PAL, emission=0.0)
