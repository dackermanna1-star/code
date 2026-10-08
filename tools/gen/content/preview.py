"""Offline terrain preview: evaluates the generated noise_settings density functions with a numpy port of
Minecraft's noise (ImprovedNoise/PerlinNoise/NormalNoise, random seeds differ but the statistics match) and
renders a shaded top-down map + a vertical slice per dimension. Dev tool for iterating on terrain styles.

    cd tools && python3 -m gen.content.preview sporewood gallery_hills ...   (after generate.py)
    -> tools/.cache/preview/<dim>.png
"""
from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RES = os.path.join(ROOT, "src", "main", "resources")
VANILLA = "/tmp/claude-0/ref/vanilla/gen/data/minecraft/worldgen"

GRAD = np.array([[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
                 [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [0, -1, 1], [-1, 1, 0], [0, -1, -1]], float)


def _seed(s):
    h = 2166136261
    for ch in s.encode():
        h = ((h ^ ch) * 16777619) & 0xFFFFFFFF
    return h


class Improved:
    def __init__(self, rng):
        self.o = rng.random(3) * 256
        p = np.arange(256)
        rng.shuffle(p)
        self.p = np.concatenate([p, p]).astype(np.int64)

    def noise(self, x, y, z):
        x = x + self.o[0]
        y = y + self.o[1]
        z = z + self.o[2]
        xi, yi, zi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64), np.floor(z).astype(np.int64)
        xf, yf, zf = x - xi, y - yi, z - zi
        P = self.p
        xi &= 255
        yi &= 255
        zi &= 255
        a = P[xi]
        b = P[xi + 1]
        aa = P[a + yi]
        ab = P[a + yi + 1]
        ba = P[b + yi]
        bb = P[b + yi + 1]

        def g(h, dx, dy, dz):
            v = GRAD[h & 15]
            return v[..., 0] * dx + v[..., 1] * dy + v[..., 2] * dz

        def s(t):
            return t * t * t * (t * (t * 6 - 15) + 10)

        u, v, w = s(xf), s(yf), s(zf)
        n000 = g(P[aa + zi], xf, yf, zf)
        n100 = g(P[ba + zi], xf - 1, yf, zf)
        n010 = g(P[ab + zi], xf, yf - 1, zf)
        n110 = g(P[bb + zi], xf - 1, yf - 1, zf)
        n001 = g(P[aa + zi + 1], xf, yf, zf - 1)
        n101 = g(P[ba + zi + 1], xf - 1, yf, zf - 1)
        n011 = g(P[ab + zi + 1], xf, yf - 1, zf - 1)
        n111 = g(P[bb + zi + 1], xf - 1, yf - 1, zf - 1)
        x00 = n000 + u * (n100 - n000)
        x10 = n010 + u * (n110 - n010)
        x01 = n001 + u * (n101 - n001)
        x11 = n011 + u * (n111 - n011)
        y0 = x00 + v * (x10 - x00)
        y1 = x01 + v * (x11 - x01)
        return y0 + w * (y1 - y0)


class Perlin:
    def __init__(self, rng, first, amps):
        self.amps = amps
        self.levels = [Improved(rng) if a != 0 else None for a in amps]
        n = len(amps)
        self.inf = 2.0 ** first
        self.vf = 2.0 ** (n - 1) / (2.0 ** n - 1)

    def value(self, x, y, z):
        out = 0.0
        f, v = self.inf, self.vf
        for a, lvl in zip(self.amps, self.levels):
            if lvl is not None:
                out = out + a * lvl.noise(x * f, y * f, z * f) * v
            f *= 2
            v /= 2
        return out


class Normal:
    def __init__(self, key, params):
        rng = np.random.default_rng(_seed(key))
        amps = params["amplitudes"]
        first = params["firstOctave"]
        self.a = Perlin(rng, first, amps)
        self.b = Perlin(rng, first, amps)
        nz = [i for i, a in enumerate(amps) if a != 0]
        span = (max(nz) - min(nz)) if nz else 0
        self.vf = 0.16666666666666666 / (0.1 * (1 + 1 / (span + 1)))

    def value(self, x, y, z):
        k = 1.0181268882175227
        return (self.a.value(x, y, z) + self.b.value(x * k, y * k, z * k)) * self.vf


class World:
    def __init__(self, dim):
        self.dim = dim
        self.noises = {}
        self.dfs = {}
        p = os.path.join(RES, "data", "portalgun", "worldgen", "noise_settings", dim + ".json")
        with open(p) as f:
            self.settings = json.load(f)

    def _file(self, kind, key):
        ns, path = key.split(":", 1)
        if ns == "minecraft":
            return os.path.join(VANILLA, kind, path + ".json")
        return os.path.join(RES, "data", ns, "worldgen", kind, path + ".json")

    def noise(self, key):
        if key not in self.noises:
            with open(self._file("noise", key)) as f:
                self.noises[key] = Normal(key, json.load(f))
        return self.noises[key]

    def ev(self, d, X, Y, Z):
        if isinstance(d, (int, float)):
            return np.full(X.shape, float(d))
        if isinstance(d, str):
            if d == "minecraft:y":
                return Y.astype(float)
            if d not in self.dfs:
                with open(self._file("density_function", d)) as f:
                    self.dfs[d] = json.load(f)
            return self.ev(self.dfs[d], X, Y, Z)
        t = d["type"].split(":", 1)[1] if d["type"].startswith("minecraft:") else d["type"]
        e = lambda k: self.ev(d[k], X, Y, Z)  # noqa: E731
        if t in ("interpolated", "flat_cache", "cache_2d", "cache_once", "cache_all_in_cell", "blend_density"):
            return e("argument")
        if t == "add":
            return e("argument1") + e("argument2")
        if t == "mul":
            return e("argument1") * e("argument2")
        if t == "min":
            return np.minimum(e("argument1"), e("argument2"))
        if t == "max":
            return np.maximum(e("argument1"), e("argument2"))
        if t == "abs":
            return np.abs(e("argument"))
        if t == "square":
            a = e("argument")
            return a * a
        if t == "cube":
            a = e("argument")
            return a * a * a
        if t == "half_negative":
            a = e("argument")
            return np.where(a > 0, a, a * 0.5)
        if t == "quarter_negative":
            a = e("argument")
            return np.where(a > 0, a, a * 0.25)
        if t == "invert":
            return 1.0 / e("argument")
        if t == "squeeze":
            a = np.clip(e("argument"), -1, 1)
            return a / 2 - a ** 3 / 24
        if t == "clamp":
            return np.clip(self.ev(d["input"], X, Y, Z), d["min"], d["max"])
        if t == "y_clamped_gradient":
            y0, y1, v0, v1 = d["from_y"], d["to_y"], d["from_value"], d["to_value"]
            tt = np.clip((Y - y0) / (y1 - y0), 0, 1)
            return v0 + (v1 - v0) * tt
        if t == "noise":
            n = self.noise(d["noise"])
            return n.value(X * d["xz_scale"], Y * d["y_scale"], Z * d["xz_scale"])
        if t == "shifted_noise":
            n = self.noise(d["noise"])
            sx = self.ev(d["shift_x"], X, Y, Z) if d["shift_x"] not in ("minecraft:shift_x",) else self._shift(X, Z, 0)
            sz = self.ev(d["shift_z"], X, Y, Z) if d["shift_z"] not in ("minecraft:shift_z",) else self._shift(X, Z, 1)
            s = d["xz_scale"]
            return n.value(X * s + sx, Y * d["y_scale"], Z * s + sz)
        if t == "range_choice":
            i = self.ev(d["input"], X, Y, Z)
            a = self.ev(d["when_in_range"], X, Y, Z)
            b = self.ev(d["when_out_of_range"], X, Y, Z)
            return np.where((i >= d["min_inclusive"]) & (i < d["max_exclusive"]), a, b)
        if t == "spline":
            return self.spline(d["spline"], X, Y, Z)
        if t == "constant":
            return np.full(X.shape, float(d["argument"]))
        if t == "find_top_surface":
            return np.full(X.shape, 64.0)
        # ---- portalgun:* approximations (W2 implements the real ones in Java)
        if t == "portalgun:coord":
            return {"x": X, "y": Y, "z": Z}[d["axis"]] * d["scale"]
        if t == "portalgun:sine":
            return d["amplitude"] * np.sin(e("argument") * d["frequency"])
        if t == "portalgun:terrace":
            a = e("argument")
            st = d["step"]
            q = np.floor(a / st)
            fr = a / st - q
            sm = max(1e-3, d["smoothness"])
            r = np.clip((fr - (1 - sm)) / sm, 0, 1)
            r = r * r * (3 - 2 * r)
            return (q + r) * st
        if t in ("portalgun:cell_shapes", "portalgun:cell_pillars", "portalgun:craters", "portalgun:cells"):
            return self._cell(t, d, X, Y, Z)
        raise KeyError(f"preview: unsupported density function {t}")

    def _shift(self, X, Z, which):
        key = "minecraft:offset"
        n = self.noise(key)
        if which == 0:
            return n.value(X * 0.25, 0 * X, Z * 0.25) * 4
        return n.value(Z * 0.25, X * 0.25, 0 * X) * 4

    def _cell(self, t, d, X, Y, Z):
        cs = float(d["cell_size"])
        seed = _seed(json.dumps(d, sort_keys=True))

        def h(ix, iy, iz, k):
            v = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed + k * 2654435761)
            v = (v ^ (v >> 13)) * 1274126177
            return ((v ^ (v >> 16)) & 0xFFFFFF) / float(0xFFFFFF)

        if t == "portalgun:cells":
            best = np.full(X.shape, 1e9)
            second = np.full(X.shape, 1e9)
            cx, cy, cz = np.floor(X / cs).astype(np.int64), np.floor(Y / cs).astype(np.int64), np.floor(Z / cs).astype(np.int64)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for dz in (-1, 0, 1):
                        ix, iy, iz = cx + dx, cy + dy, cz + dz
                        px = (ix + h(ix, iy, iz, 1)) * cs
                        py = (iy + h(ix, iy, iz, 2)) * cs
                        pz = (iz + h(ix, iy, iz, 3)) * cs
                        dd = np.sqrt((X - px) ** 2 + (Y - py) ** 2 + (Z - pz) ** 2)
                        m = dd < best
                        second = np.where(m, best, np.minimum(second, dd))
                        best = np.where(m, dd, best)
            return (second - best) / 2.0
        if t == "portalgun:craters":
            out = np.zeros(X.shape)
            cx, cz = np.floor(X / cs).astype(np.int64), np.floor(Z / cs).astype(np.int64)
            for dx in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    ix, iz = cx + dx, cz + dz
                    on = h(ix, 0, iz, 4) < d["probability"]
                    r = d["min_radius"] + h(ix, 0, iz, 5) * (d["max_radius"] - d["min_radius"])
                    px = (ix + 0.2 + 0.6 * h(ix, 0, iz, 1)) * cs
                    pz = (iz + 0.2 + 0.6 * h(ix, 0, iz, 3)) * cs
                    q = np.sqrt((X - px) ** 2 + (Z - pz) ** 2) / r
                    sc = 0.4 + 0.6 * np.minimum(1.0, r / d["max_radius"])
                    bowl = np.where(q < 1, -d["depth"] * sc * np.clip(1 - q * q, 0, 1) ** 0.85, 0)
                    rim = d["rim"] * sc * np.exp(-((q - 1.0) / 0.25) ** 2)
                    out = out + np.where(on, bowl + rim, 0)
            return out
        # shapes / pillars
        best = np.full(X.shape, -1.0)
        cx, cz = np.floor(X / cs).astype(np.int64), np.floor(Z / cs).astype(np.int64)
        cy = np.floor(Y / cs).astype(np.int64) if t == "portalgun:cell_shapes" else np.zeros(X.shape, np.int64)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for dy in ((-1, 0, 1) if t == "portalgun:cell_shapes" else (0,)):
                    ix, iy, iz = cx + dx, cy + dy, cz + dz
                    on = h(ix, iy, iz, 4) < d["probability"]
                    r = d["min_radius"] + h(ix, iy, iz, 5) * (d["max_radius"] - d["min_radius"])
                    px = (ix + 0.5) * cs + (h(ix, iy, iz, 1) - 0.5) * np.maximum(0, cs - 2 * r)
                    pz = (iz + 0.5) * cs + (h(ix, iy, iz, 3) - 0.5) * np.maximum(0, cs - 2 * r)
                    if t == "portalgun:cell_shapes":
                        py = (iy + 0.5) * cs + (h(ix, iy, iz, 2) - 0.5) * np.maximum(0, cs - 2 * r)
                        on = on & (py >= d["y_min"]) & (py <= d["y_max"])
                        if d["shape"] == "cube":
                            q = np.maximum(np.maximum(np.abs(X - px), np.abs(Y - py)), np.abs(Z - pz)) / r
                        else:
                            q = np.sqrt((X - px) ** 2 + (Y - py) ** 2 + (Z - pz) ** 2) / r
                    else:
                        top = d["top_min"] + h(ix, 0, iz, 6) * (d["top_max"] - d["top_min"])
                        q = np.sqrt((X - px) ** 2 + (Z - pz) ** 2) / r
                        q = np.where((Y > top) | (Y < d["bottom"]), 2.0, q)
                    v = np.clip(1 - q, -1, 1)
                    best = np.where(on, np.maximum(best, v), best)
        return best

    def spline(self, s, X, Y, Z):
        c = self.ev(s["coordinate"], X, Y, Z)
        pts = s["points"]
        locs = np.array([p["location"] for p in pts])
        ders = np.array([p["derivative"] for p in pts])
        vals = [self.spline(p["value"], X, Y, Z) if isinstance(p["value"], dict) else np.full(X.shape, p["value"]) for p in pts]
        vals = np.stack(vals)
        i = np.searchsorted(locs, c, side="right") - 1
        n = len(locs)
        out = np.zeros(c.shape)
        lo = i < 0
        hi = i >= n - 1
        mid = ~lo & ~hi
        out = np.where(lo, vals[0] + ders[0] * (c - locs[0]), out)
        out = np.where(hi, vals[-1] + ders[-1] * (c - locs[-1]), out)
        ii = np.clip(i, 0, n - 2)
        g, hh = locs[ii], locs[ii + 1]
        k = (c - g) / np.where(hh - g == 0, 1, hh - g)
        idx = np.arange(c.size).reshape(c.shape) if False else None  # noqa
        v0 = np.take_along_axis(vals, ii[None], 0)[0]
        v1 = np.take_along_axis(vals, (ii + 1)[None], 0)[0]
        l, m = ders[ii], ders[ii + 1]
        p = l * (hh - g) - (v1 - v0)
        q = -m * (hh - g) + (v1 - v0)
        midv = v0 + k * (v1 - v0) + k * (1 - k) * (p + k * (q - p))
        return np.where(mid, midv, out)


def render(dim, size=512, step=4, out_dir=None):
    w = World(dim)
    st = w.settings
    nz = st["noise"]
    miny, height = nz["min_y"], nz["height"]
    sea = st["sea_level"]
    fluid = st["default_fluid"]["Name"]
    dens = st["noise_router"]["final_density"]
    xs = np.arange(0, size, step, dtype=float)
    X2, Z2 = np.meshgrid(xs, xs)
    ys = np.arange(miny + height - 4, miny, -6, dtype=float)
    top = np.full(X2.shape, np.nan)
    roofed = st["surface_rule"] and "bedrock_roof" in json.dumps(st["surface_rule"])
    seen_air = np.zeros(X2.shape, bool)
    for y in ys:
        Yv = np.full(X2.shape, y)
        dv = w.ev(dens, X2, Yv, Z2)
        if roofed:
            # cave worlds: first floor below the roof (solid under air)
            solid = (dv > 0) & np.isnan(top) & seen_air
            seen_air |= dv <= 0
        else:
            solid = (dv > 0) & np.isnan(top)
        top[solid] = y
    surf = np.nan_to_num(top, nan=miny)
    # hillshade
    gy, gx = np.gradient(surf, step)
    shade = np.clip(0.75 + (-gx * 0.6 - gy * 0.4) * 0.35, 0.25, 1.3)
    hn = np.clip((surf - miny) / height, 0, 1)
    col = np.stack([0.35 + 0.5 * hn, 0.45 + 0.4 * hn, 0.3 + 0.3 * hn], -1) * shade[..., None]
    void = np.isnan(top)
    water = (surf < sea) & (fluid != "minecraft:air")
    col[water] = np.array([0.15, 0.3, 0.7]) if fluid == "minecraft:water" else np.array([0.85, 0.35, 0.05])
    col[void] = np.array([0.05, 0.05, 0.08])
    img_top = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))
    # vertical slice at z = size/2
    xs2 = np.arange(0, size, 2, dtype=float)
    ys2 = np.arange(miny, miny + height, 2, dtype=float)
    XS, YS = np.meshgrid(xs2, ys2)
    ZS = np.full(XS.shape, size / 2)
    dv = w.ev(dens, XS, YS, ZS)
    sl = np.zeros(XS.shape + (3,))
    sl[dv > 0] = [0.55, 0.5, 0.45]
    sl[(dv <= 0) & (YS < sea) & (fluid != "minecraft:air")] = [0.2, 0.35, 0.8] if fluid == "minecraft:water" else [0.9, 0.4, 0.1]
    sl[(dv <= 0) & ~((YS < sea) & (fluid != "minecraft:air"))] = [0.75, 0.85, 1.0]
    img_slice = Image.fromarray((sl[::-1] * 255).astype(np.uint8))
    W = max(img_top.width * 2, img_slice.width)
    canvas = Image.new("RGB", (W, img_top.height * 2 + img_slice.height + 4), (30, 30, 30))
    canvas.paste(img_top.resize((img_top.width * 2, img_top.height * 2), Image.NEAREST), (0, 0))
    canvas.paste(img_slice, (0, img_top.height * 2 + 4))
    out_dir = out_dir or os.path.join(ROOT, "tools", ".cache", "preview")
    os.makedirs(out_dir, exist_ok=True)
    p = os.path.join(out_dir, dim + ".png")
    canvas.save(p)
    stats = dict(min=float(np.nanmin(top)) if not void.all() else None, max=float(np.nanmax(top)) if not void.all() else None,
                 void=float(void.mean()), water=float(water.mean()))
    return p, stats


def generate_scratch(dims):
    """Build the given dims (gallery included) into a private resource dir so concurrent generate.py runs by other
    people (which wipe src/main/resources/data/portalgun) don't interfere with previews."""
    global RES
    import shutil
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    from gen import content
    scratch = os.path.join(ROOT, "tools", ".cache", "preview_res")
    if os.path.isdir(scratch):
        shutil.rmtree(scratch)
    os.makedirs(scratch)
    content.build(scratch, {}, {}, only=dims, gallery=True)
    RES = scratch


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--gen" in sys.argv:
        generate_scratch(args)
    for d in args:
        p, s = render(d)
        print(d, p, s, flush=True)


def biome_map(dim, size=2048, step=16, out_dir=None):
    """Render the multi_noise biome layout (approximate) - checks patch sizes and that every biome appears."""
    w = World(dim)
    router = w.settings["noise_router"]
    with open(os.path.join(RES, "data", "portalgun", "dimension", dim + ".json")) as f:
        src = json.load(f)["generator"]["biome_source"]
    xs = np.arange(0, size, step, dtype=float)
    X, Z = np.meshgrid(xs, xs)
    Y = np.full(X.shape, 64.0)
    if src["type"] == "minecraft:fixed":
        print(dim, "fixed biome", src["biome"])
        return None
    T = w.ev(router["temperature"], X, Y, Z)
    Hm = w.ev(router["vegetation"], X, Y, Z)
    C = w.ev(router["continents"], X, Y, Z)
    pts = src["biomes"]
    best = np.full(X.shape, 1e9)
    idx = np.zeros(X.shape, int)
    for i, b in enumerate(pts):
        p = b["parameters"]
        d = (T - p["temperature"]) ** 2 + (Hm - p["humidity"]) ** 2 + (C - p["continentalness"]) ** 2
        m = d < best
        best = np.where(m, d, best)
        idx = np.where(m, i, idx)
    pal = np.array([[230, 80, 80], [80, 200, 90], [80, 120, 230], [230, 200, 60], [180, 90, 220], [60, 210, 210],
                    [240, 140, 40], [150, 150, 150]], np.uint8)
    img = Image.fromarray(pal[idx % len(pal)]).resize((512, 512), Image.NEAREST)
    out_dir = out_dir or os.path.join(ROOT, "tools", ".cache", "preview")
    os.makedirs(out_dir, exist_ok=True)
    p = os.path.join(out_dir, dim + "_biomes.png")
    img.save(p)
    share = {pts[i]["biome"]: round(float((idx == i).mean()), 3) for i in range(len(pts))}
    return p, share
