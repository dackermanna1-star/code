"""Dimension / dimension_type / timeline / noise_settings / noise / carver emitter (W1).

TERRAIN STYLES (dsl.TERRAIN_STYLES) and their Terrain.params knobs
===================================================================
Shared Terrain fields: height = typical surface y, amplitude = typical vertical variation (blocks),
scale = horizontal stretch (>1 broader), roughness = 0..1 strength of 3D noise (overhangs, crags),
caves = noise caves + vanilla cave/canyon carvers, sea_level/fluid = global fluid level & block.
Noise is normalised so N(...) is ~[-1, 1] (95%). Lengths below are in blocks unless noted.

Params understood by every style:
  biome_size (320)      typical biome patch size
  peak_block, peak_y    surface (top) block above peak_y - snow caps, gilded summits ...
  beach_block, beach_height (3)   top+under block from sea_level-2 up to sea_level+beach_height
  cliffs (style default) True/False: steep slopes show `cliff_block` (default: biome stone / dimension stone)
  cliff_block           block for steep slopes
  ceiling_block         block used on ceilings/overhang undersides (default: biome `under` unless it falls)
  floating_debris (0)   0..1 small floating rocks above the terrain (any ground style)

hills        rolling hills.            rivers (0.5) river channel width 0..1 (0 = none); detail (0.3) small bumps
mountains    ridged ranges + valleys.  coverage (0.55) fraction of mountainous land; peaks (0.6) ridge sharpness;
                                       rivers (0); cliffs default True
flat         plains/salt flats/swamp.  ponds (0.3) 0..1 how many shallow pools dip below sea_level
islands      archipelago.              coverage (0.35) land fraction; depth (20) ocean depth; island_height (amplitude);
                                       set beach_block (e.g. "minecraft:sand") for sandy shores; beach_height (3)
ocean        deep ocean + atolls.      depth (34) sea floor depth below sea_level; atolls (0.08) island fraction;
                                       ridges (0.5) sea-floor ridge strength
sky_islands  floating islands in void. layers (2) island tiers; coverage (0.38) island fraction per tier;
                                       thickness (30) underside depth; spacing (72) between tiers; island_size (1.0);
                                       debris (0.3) small satellite islets (0 = none)
caves        nether-like cavern world (roof + bedrock ceiling, cardinal light = nether).  openness (0.5) 0..1 size of
                                       caverns; pillars (0.3) floor-to-ceiling columns; shelves (0.3) cave ledges.
                                       Default height range when left at -64/384: min_y 0, height 256.
planetoids   tiny planets in space.    cell_size (72); min_radius (7); max_radius (22); probability (0.55);
                                       y_min/y_max (height-70 .. height+70); shape ("sphere"|"blob")
pillars      spires above a low floor. coverage (0.22) pillar fraction; pillar_height (3*amplitude);
                                       pillar_size (1.0) horizontal size multiplier; round (True) round pillars (Java)
terraces     stepped hills.            step (6) terrace height; smoothness (0.25) 0..1 riser softness; rivers (0.3)
canyons      plateau cut by canyons.   depth (amplitude*1.5); width (0.5) 0..1 canyon width; step (7) wall terraces
                                       (0 = smooth walls); rivers - canyon floors below sea_level hold water
sponge       holey cheese terrain.     holes (0.5) 0..1 amount of voids; hole_size (1.0)
inverted     upside-down world.        ceiling (height+95) underside base y; hang (amplitude*2.2) hanging mountain depth;
                                       holes (0.22) fraction of open sky in the stone ceiling;
                                       floor (0.3) coverage of walkable islands at `height`; roof always on
cubes        voxel mesas (crisp 4x4-block columns, not interpolated) + floating cubes (Java cell_shapes).
                                       step (8) mesa step; cell_size (36); min_size (4); max_size (11) cube half-size;
                                       probability (0.45) cube chance per cell; floating (True); y_min/y_max cube band
craters      cratered plains (moon).   cell_size (96); min_radius (10); max_radius (38); depth (0.45) bowl depth
                                       ratio; rim (0.25) rim height ratio; probability (0.6)
dunes        dune seas.                wavelength (56); direction (35 deg); dune_height (amplitude); cross (0.25)
spikes       spike/thorn forests.      density (0.35) 0..1 spike count; spike_height (3*amplitude); thin (0.5)
blobs        organic blobby terrain.   blobbiness (0.7) 3D lump strength; floating (0.3) floating lumps; squash (1.0)
cells        3D honeycomb chambers.    cell_size (30); wall (3.5) wall thickness; roof (True); open (0.0) 0..1
                                       removes upper walls (open-topped hive)
layers       stacked floating strata.  count (4); spacing (34); thickness (9); holes (0.35) 0..1; wobble (6);
                                       columns (0.15) connecting pillars

portalgun:* density functions (W2, Java) are used when the Java side registers them (common.java_caps()):
cell_shapes (planetoids, cubes), cell_pillars (pillars), craters (craters), cells (cells), coord+sine (dunes).
Otherwise each style falls back to a vanilla-only approximation so worlds always load.
"""
from __future__ import annotations

import json
import math
import os
from statistics import NormalDist

from . import df
from .common import (NS, full_id, has_java, hex_argb, hex_rgb, mix_hex, scale_hex, state, warn, write_json)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
_ND = NormalDist(0, 0.6)          # distribution of a normalised 2D noise (std ~0.6)

TIMES = {"day": 3000, "morning": 1500, "noon": 6000, "afternoon": 9500, "dusk": 12800, "sunset": 12800,
         "dawn": 23200, "sunrise": 23200, "night": 15500, "midnight": 18000}

ROOF_STYLES = {"caves", "inverted"}
VOID_STYLES = {"sky_islands", "planetoids", "inverted", "layers"}
FALLING = {"minecraft:sand", "minecraft:red_sand", "minecraft:gravel", "minecraft:suspicious_sand",
           "minecraft:suspicious_gravel"}

STYLE_DEFAULTS = {
    "hills": dict(rivers=0.5, detail=0.3),
    "mountains": dict(coverage=0.55, peaks=0.6, rivers=0.0, cliffs=True),
    "flat": dict(ponds=0.3),
    "islands": dict(coverage=0.35, depth=20, beach_height=3),
    "ocean": dict(depth=34, atolls=0.08, ridges=0.5),
    "sky_islands": dict(layers=2, coverage=0.38, thickness=30, spacing=72, debris=0.3, island_size=1.0),
    "caves": dict(openness=0.5, pillars=0.3, shelves=0.3),
    "planetoids": dict(cell_size=72, min_radius=7, max_radius=22, probability=0.55, shape="sphere"),
    "pillars": dict(coverage=0.22, pillar_size=1.0, round=True, cliffs=True),
    "terraces": dict(step=6, smoothness=0.25, rivers=0.3),
    "canyons": dict(width=0.5, step=7, cliffs=True),
    "sponge": dict(holes=0.5, hole_size=1.0),
    "inverted": dict(floor=0.3, holes=0.22),
    "cubes": dict(step=8, cell_size=36, min_size=4, max_size=11, probability=0.45, floating=True),
    "craters": dict(cell_size=96, min_radius=10, max_radius=38, depth=0.45, rim=0.25, probability=0.6),
    "dunes": dict(wavelength=56, direction=35, cross=0.25),
    "spikes": dict(density=0.35, thin=0.5),
    "blobs": dict(blobbiness=0.7, floating=0.3, squash=1.0),
    "cells": dict(cell_size=30, wall=3.5, roof=True, open=0.0),
    "layers": dict(count=4, spacing=34, thickness=9, holes=0.35, wobble=6, columns=0.15),
}


def q(frac_above):
    """Threshold t such that a normalised noise exceeds t on `frac_above` of the area."""
    frac_above = min(0.98, max(0.02, frac_above))
    return _ND.inv_cdf(1.0 - frac_above)


def world_range(t):
    """(min_y, height) actually used for a Terrain (caves-style defaults shrink to 0..256)."""
    if t.style == "caves" and t.min_y == -64 and t.total_height == 384:
        return 0, 256
    return t.min_y, t.total_height


def has_roof(t):
    if t.style in ROOF_STYLES or t.bedrock_roof:
        return True
    if t.style == "cells":
        return bool({**STYLE_DEFAULTS["cells"], **t.params}.get("roof", True))
    return False


def default_arrival(t):
    if t.style in ("caves", "inverted") or (t.style == "cells" and has_roof(t)):
        return "cave"
    if t.style in ("sky_islands", "planetoids", "layers"):
        return "void"
    return "surface"


# =============================================================================================== terrain
class Terrain:
    """Builds the noise router for one dimension. Results: final_density, preliminary surface, continents."""

    def __init__(self, dim):
        self.dim = dim
        self.t = dim.terrain
        self.P = {**STYLE_DEFAULTS.get(self.t.style, {}), **(self.t.params or {})}
        self.min_y, self.height = world_range(self.t)
        self.top = self.min_y + self.height
        self.noises = {}          # key -> params
        self.xz = 1.0 / max(0.05, self.t.scale)
        self.roof = has_roof(self.t)
        self.crisp = None         # non-interpolated extra density (sharp shapes)

    # --------------------------------------------------------------------------------- noise helpers
    def key(self, name, first, amps):
        k = f"{NS}:{self.dim.id}/{name}"
        self.noises[k] = {"firstOctave": int(first), "amplitudes": [float(a) for a in amps]}
        return k

    def N(self, name, first, amps, xz=1.0):
        """Normalised 2D noise (~[-1,1])."""
        return df.mul(df.noise2d(self.key(name, first, amps), self.xz * xz), 2.0)

    def N3(self, name, first, amps, xz=1.0, y=1.0):
        return df.mul(df.noise(self.key(name, first, amps), self.xz * xz, y), 2.0)

    def rough(self, k=1.0, y_scale=0.7):
        """3D displacement in blocks."""
        t = self.t
        r = t.roughness * k * (0.8 * t.amplitude + 8.0)
        if r <= 0.01:
            return 0.0
        return df.mul(self.N3("rough", -6, [1, 1, 0.5], 1.0, y_scale), r)

    def surface(self, H, rough=1.0, y_scale=0.7):
        """Density (blocks) of a heightmap terrain."""
        return df.add(df.sub(H, df.Y), self.rough(rough, y_scale))

    def rivers(self, H, width):
        if width <= 0:
            return H
        t = self.t
        r = df.abs_(self.N("river", -8, [1, 1], 0.9))
        hw = 0.03 + 0.07 * width
        f = df.smooth_spline(r, [(0.0, 1.0), (hw * 0.55, 1.0), (hw * 2.4, 0.0)])
        target = t.sea_level - 3
        carved = df.add(H, df.mul(f, df.sub(float(target), H)))
        return df.min_(H, carved)

    # --------------------------------------------------------------------------------- styles
    def build(self):
        st = self.t.style
        fn = getattr(self, "_caves_style" if st == "caves" else "_" + st, None)
        if fn is None:
            raise ValueError(f"unknown terrain style {st!r}")
        res = fn()
        D, H = res.get("D"), res.get("H")
        P = self.P
        ground = st not in VOID_STYLES and st not in ("caves", "cells")
        # floating debris for ground styles
        if ground and P.get("floating_debris", 0) > 0:
            D = df.max_(D, self._debris(P["floating_debris"], (H if H is not None else self.t.height)))
        # noise caves
        if self.t.caves and st not in ("caves", "cells"):
            D = df.min_(D, self._noise_caves(H))
        # keep the floor solid / the sky clear / the roof closed
        if ground:
            D = df.max_(D, df.ygrad(self.min_y, self.min_y + 5, 40, -40))
        if self.roof:
            D = df.max_(D, df.ygrad(self.top - 6, self.top - 1, -40, 40))
        else:
            D = df.min_(D, df.ygrad(self.top - 20, self.top - 3, 60, -60))
        final = df.interpolated(df.mul(D, 1.0 / 16.0))
        if self.crisp is not None:
            final = df.max_(final, self.crisp)
        prelim = H if H is not None else float(self.t.height)
        cont = 0.0
        if H is not None:
            cont = df.clamp(df.mul(df.sub(H, float(self.t.height)), 1.0 / (self.t.amplitude * 1.2 + 4)), -1, 1)
        return {"final": final, "prelim": prelim, "continents": cont, "H": H}

    def _debris(self, amount, H):
        n = self.N3("debris", -4, [1, 0.5], 1.0, 1.4)
        thr = 1.25 - amount * 0.45
        band = df.min_(df.ygrad(self.t.height + 6, self.t.height + 22, -30, 0),
                       df.ygrad(self.t.height + self.t.amplitude * 2 + 40, self.t.height + self.t.amplitude * 2 + 60, 0, -30))
        return df.add(df.mul(df.sub(n, thr), 30.0), band)

    def _noise_caves(self, H):
        a = df.noise(self.key("cave_a", -7, [1]), self.xz, 1.0)
        b = df.noise(self.key("cave_b", -7, [1]), self.xz, 1.0)
        spaghetti = df.mul(df.sub(df.max_(df.abs_(a), df.abs_(b)), 0.045), 140.0)
        cheese_n = df.noise(self.key("cave_cheese", -8, [1, 1, 0.5]), self.xz, 1.5)
        cheese = df.mul(df.sub(0.42, cheese_n), 60.0)
        c = df.min_(spaghetti, cheese)
        if H is not None:
            # no noise caves in the top ~10 blocks below the surface (carvers still make entrances)
            c = df.max_(c, df.clamp(df.add(df.sub(df.Y, H), 10.0), -60, 60))
        c = df.max_(c, df.ygrad(self.min_y + 1, self.min_y + 12, 40, -40))
        return c

    def _hills(self):
        t, P = self.t, self.P
        A = t.amplitude
        H = df.add(float(t.height),
                   df.mul(self.N("hills", -7, [1, 1, 0.5]), 0.7 * A),
                   df.mul(self.N("base", -9, [1, 1, 1, 0.5]), 0.5 * A),
                   df.mul(self.N("detail", -5, [1, 0.5]), P["detail"] * 0.3 * A))
        H = df.col(self.rivers(H, P["rivers"]))
        return {"D": self.surface(H), "H": H}

    def _mountains(self):
        t, P = self.t, self.P
        A = t.amplitude
        mask = df.clamp(df.add(0.5 + (P["coverage"] - 0.5) * 2.2, df.mul(self.N("mask", -9, [1, 1]), 1.25)), 0, 1)
        ridge = df.sub(1.0, df.abs_(self.N("ridge", -8, [1, 0.6, 0.3])))
        ridge = df.clamp(ridge, 0, 1)
        sharp = df.add(df.mul(df.square(ridge), 1 - P["peaks"]), df.mul(df.cube(ridge), P["peaks"]))
        hills = self.N("hills", -7, [1, 1, 0.5])
        # jagged high-frequency crags that only show up on the ridges
        jag = df.mul(df.abs_(self.N("jag", -5, [1, 1])), df.mul(df.mul(mask, sharp), 0.35 * A))
        H = df.add(float(t.height),
                   df.mul(hills, 0.3 * A),
                   df.mul(mask, df.add(df.mul(sharp, 1.9 * A), df.mul(hills, 0.25 * A))),
                   jag,
                   df.mul(self.N("detail", -5, [1, 0.5]), 0.08 * A),
                   -0.25 * A)
        H = df.col(self.rivers(H, P["rivers"]))
        alt = df.ygrad(t.height, t.height + A, 0.35, 1.0)
        D = df.add(df.sub(H, df.Y), df.mul(self.rough(1.0, 0.6), alt) if t.roughness > 0 else 0.0)
        return {"D": D, "H": H}

    def _flat(self):
        t, P = self.t, self.P
        A = t.amplitude
        H = df.add(float(t.height), df.mul(self.N("hills", -7, [1, 1]), 0.6 * A),
                   df.mul(self.N("detail", -5, [1, 0.5]), 0.4 * A))
        if P["ponds"] > 0 and t.fluid != "minecraft:air":
            p = self.N("ponds", -6, [1, 0.5])
            th = q(P["ponds"] * 0.35)
            depth = max(2.0, t.height - t.sea_level + 2.5)
            H = df.sub(H, df.smooth_spline(p, [(th - 0.02, 0.0), (th + 0.12, depth), (th + 0.5, depth + 1.5)]))
        H = df.col(H)
        return {"D": self.surface(H, 0.5), "H": H}

    def _islands(self):
        t, P = self.t, self.P
        A = t.amplitude
        sea = float(t.sea_level)
        ih = float(P.get("island_height", A))
        depth = float(P["depth"])
        c = self.N("islands", -8, [1, 1, 0.5])
        t0 = q(P["coverage"])
        base = df.lerp_spline(c, [(-2.0, sea - depth - 4), (t0 - 0.4, sea - depth), (t0 - 0.1, sea - 5), (t0, sea - 1),
                                  (t0 + 0.05, sea + 1), (t0 + 0.12, sea + 2 + P["beach_height"] * 0.4),
                                  (t0 + 0.45, sea + ih * 0.65), (2.0, sea + ih * 1.2)])
        land = df.clamp(df.mul(df.sub(c, t0 + 0.05), 4.0), 0, 1)
        H = df.col(df.add(base, df.mul(land, df.mul(self.N("hills", -6, [1, 1]), ih * 0.35)),
                          df.mul(self.N("detail", -5, [1]), 1.5)))
        return {"D": self.surface(H, 0.6), "H": H}

    def _ocean(self):
        t, P = self.t, self.P
        A = t.amplitude
        sea = float(t.sea_level)
        floor = df.add(sea - P["depth"], df.mul(self.N("hills", -7, [1, 1]), 0.5 * A),
                       df.mul(self.N("detail", -5, [1, 0.5]), 0.2 * A),
                       df.mul(df.square(df.clamp(df.sub(1.0, df.abs_(self.N("ridge", -8, [1, 0.5]))), 0, 1)),
                              P["ridges"] * A))
        H = floor
        if P["atolls"] > 0:
            c = self.N("islands", -8, [1, 0.6])
            t0 = q(P["atolls"])
            d = float(P["depth"])
            bump = df.lerp_spline(c, [(t0 - 0.25, 0.0), (t0, d * 0.75), (t0 + 0.06, d + 1.0), (t0 + 0.2, d + 3.0),
                                      (2.0, d + 5.0)])
            H = df.add(H, df.max_(bump, 0.0))
        H = df.col(H)
        return {"D": self.surface(H, 0.5), "H": H}

    def _sky_islands(self):
        t, P = self.t, self.P
        A = t.amplitude
        layers = max(1, int(P["layers"]))
        sz = 1.0 / max(0.2, P["island_size"])
        Ds = []
        for i in range(layers):
            base = t.height + (i - (layers - 1) / 2.0) * P["spacing"]
            fields = [("island", -8, [1, 1, 0.5], P["coverage"], float(P["thickness"]), 8.0, 1.25, 0.0)]
            if P["debris"] > 0:
                fields.append(("islet", -6, [1, 0.5], P["debris"] * 0.22, float(P["thickness"]) * 0.45, 3.0, 2.5, 22.0))
            for kind, first, amps, cov, thick, dome, sharp, spread in fields:
                m = self.N(f"{kind}{i}", first, amps, sz)
                t0 = q(cov)
                inside = df.sub(m, t0)
                mm = df.clamp(df.mul(inside, sharp), 0, 1)
                b = df.add(base, df.mul(self.N(f"{kind}off{i}", -7, [1]), spread)) if spread else float(base)
                top = df.col(df.add(b, df.mul(self.N(f"top{i}", -6, [1, 1]), 0.3 * A), df.mul(mm, dome)))
                drip = df.mul(df.abs_(self.N(f"drip{i}", -4, [1, 0.5])), 0.35)
                depth = df.mul(df.add(df.mul(mm, df.sub(2.0, mm)), df.mul(drip, mm)), thick)
                bottom = df.col(df.sub(df.sub(b, 2.0), depth))
                Ds.append(df.min_all([df.sub(top, df.Y), df.sub(df.Y, bottom), df.mul(inside, 60.0)]))
        D = df.add(df.max_all(Ds), self.rough(0.8, 1.0))
        return {"D": D, "H": None}

    def _caves_style(self):
        t, P = self.t, self.P
        big = self.N3("cavern", -7, [1, 1, 0.5], 1.0, 1.6)
        mid = self.N3("cavern_mid", -5, [1, 0.5], 1.0, 1.4)
        D = df.add(0.35 - P["openness"] * 0.75, df.mul(big, 0.8), df.mul(mid, 0.3))
        if P["pillars"] > 0:
            pil = self.N("pillar", -5, [1, 0.5])
            D = df.add(D, df.mul(df.clamp(df.mul(df.sub(pil, 1.05 - P["pillars"] * 0.5), 5.0), 0, 1), 2.0))
        if P["shelves"] > 0:
            sh = self.N3("shelf", -4, [1], 1.0, 4.0)
            D = df.add(D, df.mul(df.clamp(df.sub(sh, 0.6), 0, 1), P["shelves"] * 2.0))
        floor = df.ygrad(self.min_y, self.min_y + 28, 2.2, 0)
        roof = df.ygrad(self.top - 36, self.top, 0, 2.5)
        D = df.add(D, floor, roof)
        return {"D": df.mul(D, 24.0), "H": None}

    def _planetoids(self):
        t, P = self.t, self.P
        y0 = int(P.get("y_min", t.height - 70))
        y1 = int(P.get("y_max", t.height + 70))
        rmax = float(P["max_radius"])
        if has_java("cell_shapes"):
            k = self.key("planets", -4, [1])
            shape = df.pg_cell_shapes(k, "sphere" if P["shape"] != "blob" else "blob", P["cell_size"], P["min_radius"],
                                      rmax, y0, y1, P["probability"])
            D = df.add(df.mul(shape, rmax), self.rough(0.4, 1.0))
        else:
            n = self.N3("planets", -5, [1, 0.5], 1.0, 1.0)
            band = df.min_(df.ygrad(y0, y0 + 20, -40, 0), df.ygrad(y1 - 20, y1, 0, -40))
            D = df.add(df.mul(df.sub(n, 0.95), 26.0), band)
        return {"D": D, "H": None}

    def _pillars(self):
        t, P = self.t, self.P
        A = t.amplitude
        ph = float(P.get("pillar_height", A * 3))
        ground = df.col(df.add(float(t.height), df.mul(self.N("hills", -7, [1, 1]), 0.3 * A),
                               df.mul(self.N("detail", -5, [1]), 2.0)))
        if P["round"] and has_java("cell_pillars"):
            k = self.key("pillars", -4, [1])
            cs = int(28 * P["pillar_size"])
            pil = df.pg_cell_pillars(k, cs, 4 * P["pillar_size"], 10 * P["pillar_size"], P["coverage"] * 2.2,
                                     int(t.height + ph * 0.6), int(t.height + ph), int(t.height - 10))
            D = df.max_(self.surface(ground, 0.5), df.add(df.mul(pil, 10.0 * P["pillar_size"]), self.rough(0.6, 0.4)))
            return {"D": D, "H": ground}
        p = self.N("pillar", -5, [1, 0.5], 1.0 / max(0.3, P["pillar_size"]))
        thr = q(P["coverage"])
        var = df.add(0.75, df.mul(self.N("pheight", -8, [1]), 0.25))
        rise = df.lerp_spline(p, [(thr - 0.03, 0.0), (thr + 0.03, 0.6), (thr + 0.09, 0.88), (thr + 0.3, 1.0), (2.0, 1.08)])
        H = df.col(df.add(ground, df.mul(df.mul(rise, var), ph)))
        return {"D": self.surface(H, 0.8, 0.35), "H": H}

    def _terraces(self):
        t, P = self.t, self.P
        A = t.amplitude
        raw = df.add(float(t.height), df.mul(self.N("hills", -7, [1, 1, 0.5]), 0.75 * A),
                     df.mul(self.N("base", -9, [1, 1]), 0.5 * A))
        raw = self.rivers(raw, P["rivers"])
        H = df.col(df.staircase(raw, t.height - 2.2 * A - 10, t.height + 2.2 * A + 10, P["step"], P["smoothness"]))
        return {"D": self.surface(H, 0.35), "H": H}

    def _canyons(self):
        t, P = self.t, self.P
        A = t.amplitude
        depth = float(P.get("depth", A * 1.5))
        plateau = df.add(float(t.height), df.mul(self.N("hills", -7, [1, 1]), 0.18 * A), df.mul(self.N("detail", -5, [1]), 2.5))
        c = df.abs_(self.N("canyon", -8, [1, 0.5]))
        hw = 0.05 + 0.1 * P["width"]
        cut = df.smooth_spline(c, [(0.0, 1.0), (hw * 0.5, 0.97), (hw, 0.6), (hw * 1.5, 0.2), (hw * 2.3, 0.0)])
        raw = df.sub(plateau, df.mul(cut, depth))
        if P["step"] and P["step"] > 0:
            raw = df.staircase(raw, t.height - depth - 20, t.height + A + 20, P["step"], 0.12)
        H = df.col(raw)
        return {"D": self.surface(H, 0.5, 0.3), "H": H}

    def _sponge(self):
        t, P = self.t, self.P
        A = t.amplitude
        H = df.col(df.add(float(t.height), df.mul(self.N("hills", -7, [1, 1, 0.5]), 0.65 * A),
                          df.mul(self.N("base", -9, [1, 1]), 0.4 * A)))
        base = self.surface(H, 0.6)
        hs = max(0.3, P["hole_size"])
        h3 = self.N3("holes", -5, [1, 0.5], 1.0 / hs, 1.0 / hs)
        thr = 1.05 - P["holes"] * 0.8
        holes = df.mul(df.sub(thr, h3), 14.0 * hs)
        return {"D": df.min_(base, holes), "H": H}

    def _inverted(self):
        t, P = self.t, self.P
        A = t.amplitude
        ceil_y = float(P.get("ceiling", min(self.top - 30, t.height + 95)))
        hang = float(P.get("hang", A * 2.2))
        ridge = df.square(df.clamp(df.sub(1.0, df.abs_(self.N("ridge", -8, [1, 0.6]))), 0, 1))
        mask = df.clamp(df.add(0.5, df.mul(self.N("mask", -9, [1, 1]), 1.2)), 0, 1)
        Hc = df.col(df.sub(ceil_y, df.add(df.mul(df.add(1.0, self.N("hills", -7, [1, 1])), 0.45 * A),
                                          df.mul(df.mul(ridge, mask), hang))))
        Dc = df.add(df.sub(df.Y, Hc), self.rough(1.0, 0.6))
        if P["holes"] > 0:
            # gaps in the stone sky let daylight (and rain) through
            hole = self.N("holes", -7, [1, 1])
            Dc = df.min_(Dc, df.mul(df.sub(q(P["holes"]), hole), 60.0))
        D = Dc
        if P["floor"] > 0:
            m = self.N("floor", -7, [1, 1, 0.5])
            t0 = q(P["floor"])
            inside = df.sub(m, t0)
            mm = df.clamp(df.mul(inside, 2.2), 0, 1)
            top = df.col(df.add(float(t.height), df.mul(self.N("ftop", -6, [1]), 0.25 * A), df.mul(mm, 4.0)))
            bottom = df.col(df.sub(float(t.height) - 2.0, df.mul(df.mul(mm, df.sub(2.0, mm)), 24.0)))
            Df = df.min_all([df.sub(top, df.Y), df.sub(df.Y, bottom), df.mul(inside, 60.0)])
            D = df.max_(D, df.add(Df, self.rough(0.6, 1.0)))
        return {"D": D, "H": None}

    def _cubes(self):
        t, P = self.t, self.P
        A = t.amplitude
        raw = df.add(float(t.height), df.mul(self.N("hills", -7, [1, 1]), 0.8 * A), df.mul(self.N("base", -9, [1]), 0.4 * A))
        H = df.col(df.staircase(raw, t.height - 2 * A - 10, t.height + 2 * A + 10, P["step"], 0.04))
        # evaluated per block (not interpolated): flat_cache holds H per 4x4 column -> crisp voxel mesas
        crisp = df.mul(df.sub(H, df.Y), 1.0 / 16.0)
        if P["floating"] and has_java("cell_shapes"):
            k = self.key("cubes", -4, [1])
            y0 = int(P.get("y_min", t.height - 10))
            y1 = int(P.get("y_max", t.height + 2 * A + 70))
            mx = float(P["max_size"])
            cubes = df.pg_cell_shapes(k, "cube", P["cell_size"], P["min_size"], mx, y0, y1, P["probability"])
            crisp = df.max_(crisp, df.range_choice(df.Y, y0 - mx - 2, y1 + mx + 2, cubes, -1.0))
        self.crisp = crisp
        return {"D": -40.0, "H": H}

    def _craters(self):
        t, P = self.t, self.P
        A = t.amplitude
        H0 = df.add(float(t.height), df.mul(self.N("hills", -7, [1, 1]), 0.45 * A), df.mul(self.N("base", -9, [1]), 0.35 * A),
                    df.mul(self.N("detail", -5, [1, 0.5]), 0.12 * A))
        if has_java("craters"):
            k = self.key("craters", -4, [1])
            mr = float(P["max_radius"])
            cr = df.pg_craters(k, P["cell_size"], P["min_radius"], mr, P["depth"] * mr, P["rim"] * mr * 0.5, P["probability"])
            # a second, denser field of small craters
            k2 = self.key("craters_small", -4, [1])
            sr = float(max(5, P["min_radius"]))
            cr2 = df.pg_craters(k2, max(24, int(P["cell_size"]) // 3), 3, sr, P["depth"] * sr, P["rim"] * sr * 0.5, 0.5)
            H = df.col(df.add(H0, cr, cr2))
        else:
            c = self.N("crater", -6, [1, 0.3])
            th = q(0.75)
            dep = P["max_radius"] * P["depth"] * 0.5
            rim = P["max_radius"] * P["rim"] * 0.3
            cr = df.smooth_spline(c, [(-2.0, -dep), (th - 0.35, -dep), (th - 0.08, -dep * 0.3), (th, rim), (th + 0.12, 0.0)])
            H = df.col(df.add(H0, cr))
        return {"D": self.surface(H, 0.4), "H": H}

    def _dunes(self):
        t, P = self.t, self.P
        A = t.amplitude
        dh = float(P.get("dune_height", A))
        lam = float(P["wavelength"]) * t.scale
        if has_java("sine") and has_java("coord"):
            a = math.radians(P["direction"])
            u = df.add(df.pg_coord("x", math.cos(a)), df.pg_coord("z", math.sin(a)),
                       df.mul(self.N("warp", -8, [1, 1]), lam * 0.6))
            s = df.pg_sine(u, 2 * math.pi / lam, 1.0)
            main = df.square(df.add(df.mul(s, 0.5), 0.5))
            v = df.add(df.pg_coord("x", -math.sin(a)), df.pg_coord("z", math.cos(a)), df.mul(self.N("warp2", -8, [1]), lam))
            cross = df.square(df.add(df.mul(df.pg_sine(v, 2 * math.pi / (lam * 2.3), 1.0), 0.5), 0.5))
            dune = df.add(df.mul(main, 1 - P["cross"]), df.mul(cross, P["cross"]))
        else:
            dune = df.square(df.clamp(df.sub(1.0, df.abs_(self.N("dune", -6, [1, 0.3], 64.0 / max(8.0, lam)))), 0, 1))
        amp = df.add(0.65, df.mul(self.N("dmask", -9, [1]), 0.35))
        H = df.col(df.add(float(t.height), df.mul(self.N("base", -9, [1, 1]), 0.4 * A), df.mul(df.mul(dune, amp), dh)))
        return {"D": self.surface(H, 0.3), "H": H}

    def _spikes(self):
        t, P = self.t, self.P
        A = t.amplitude
        sh = float(P.get("spike_height", A * 3))
        ground = df.add(float(t.height), df.mul(self.N("hills", -7, [1, 1]), 0.4 * A), df.mul(self.N("detail", -5, [1]), 2.0))
        s = self.N("spike", -4, [1, 0.5], 1.0 + P["thin"] * 0.6)
        thr = q(P["density"] * 0.45)
        prof = df.lerp_spline(s, [(thr, 0.0), (thr + 0.08, 0.14), (thr + 0.2, 0.42), (thr + 0.4, 0.78), (thr + 0.7, 1.0), (3.0, 1.15)])
        var = df.add(0.6, df.mul(self.N("sheight", -7, [1]), 0.4))
        H = df.col(df.add(ground, df.mul(df.mul(prof, var), sh)))
        return {"D": self.surface(H, 0.4, 0.3), "H": H}

    def _blobs(self):
        t, P = self.t, self.P
        A = t.amplitude
        H = df.col(df.add(float(t.height), df.mul(self.N("hills", -7, [1, 1]), 0.5 * A)))
        b3 = self.N3("blob", -5, [1, 0.6], 1.0, P["squash"])
        D = df.add(df.sub(H, df.Y), df.mul(b3, P["blobbiness"] * (A * 1.1 + 6)))
        if P["floating"] > 0:
            f3 = self.N3("fblob", -5, [1], 1.0, 1.0)
            lo, hi = t.height + A * 1.2, t.height + A * 3.5 + 20
            band = df.min_(df.ygrad(lo, lo + 12, -40, 0), df.ygrad(hi - 12, hi, 0, -40))
            D = df.max_(D, df.add(df.mul(df.sub(f3, 1.15 - P["floating"] * 0.45), 34.0), band))
        return {"D": D, "H": H}

    def _cells(self):
        t, P = self.t, self.P
        cs = float(P["cell_size"])
        if has_java("cells"):
            k = self.key("cells", -4, [1])
            w = df.pg_cells(k, int(cs))
            D = df.sub(float(P["wall"]), w)
        else:
            n1 = df.noise(self.key("cellA", -5, [1]), self.xz * 32.0 / cs, 32.0 / cs)
            D = df.mul(df.sub(0.05 * P["wall"] / 3.5, df.abs_(n1)), 70.0)
        floor = df.ygrad(self.min_y, self.min_y + 26, 40, 0)
        D = df.add(D, floor)
        if P["open"] > 0:
            D = df.sub(D, df.ygrad(t.height, t.height + 60, 0, 40 * P["open"]))
        if self.roof:
            D = df.add(D, df.ygrad(self.top - 30, self.top, 0, 40))
        return {"D": D, "H": None}

    def _layers(self):
        t, P = self.t, self.P
        n = max(2, int(P["count"]))
        sp = float(P["spacing"])
        lowest = t.height - (n - 1) / 2.0 * sp
        ground = df.col(df.add(lowest, df.mul(self.N("lw0", -7, [1, 1]), P["wobble"])))
        Ds = [self.surface(ground, 0.5)]
        th = q(1.0 - P["holes"])
        for i in range(1, n):
            c = df.col(df.add(lowest + i * sp, df.mul(self.N(f"lw{i}", -7, [1, 1]), P["wobble"])))
            slab = df.sub(P["thickness"] / 2.0, df.abs_(df.sub(df.Y, c)))
            solid = df.mul(df.sub(self.N(f"lh{i}", -6, [1, 1]), th), 30.0)
            Ds.append(df.add(df.min_(slab, solid), self.rough(0.4, 1.0)))
        D = df.max_all(Ds)
        if P["columns"] > 0:
            cn = self.N("columns", -5, [1])
            col_d = df.mul(df.sub(cn, 1.55 - P["columns"]), 24.0)
            band = df.ygrad(lowest + (n - 1) * sp, lowest + (n - 1) * sp + 6, 0, -60)
            D = df.max_(D, df.add(col_d, band))
        return {"D": D, "H": ground}


# =============================================================================================== surface rules
def _cond(c, r):
    return {"type": "minecraft:condition", "if_true": c, "then_run": r}


def _seq(rules):
    rules = [r for r in rules if r is not None]
    if len(rules) == 1:
        return rules[0]
    return {"type": "minecraft:sequence", "sequence": rules}


def _block(ref):
    return {"type": "minecraft:block", "result_state": state(ref)}


def _depth(offset=0, add_surface=False, secondary=0, surface="floor"):
    return {"type": "minecraft:stone_depth", "offset": int(offset), "add_surface_depth": bool(add_surface),
            "secondary_depth_range": int(secondary), "surface_type": surface}


def _y_above(y, mult=0, add_stone=False):
    return {"type": "minecraft:y_above", "anchor": {"absolute": int(y)}, "surface_depth_multiplier": int(mult),
            "add_stone_depth": bool(add_stone)}


def _water(offset=-1, mult=0, add_stone=False):
    return {"type": "minecraft:water", "offset": int(offset), "surface_depth_multiplier": int(mult), "add_stone_depth": bool(add_stone)}


def _not(c):
    return {"type": "minecraft:not", "invert": c}


def _vgrad(name, true_below, false_above):
    return {"type": "minecraft:vertical_gradient", "random_name": name, "true_at_and_below": true_below,
            "false_at_and_above": false_above}


def is_falling(ctx, ref):
    fid = full_id(ref)
    if fid in FALLING or fid.endswith("_concrete_powder"):
        return True
    return ctx.kind(ref) == "sand"


def surface_rule(ctx, dim, terrain: Terrain, noise_keys: dict):
    t = dim.terrain
    P = terrain.P
    rules = []
    if t.bedrock_floor:
        rules.append(_cond(_vgrad(f"{NS}:{dim.id}/bedrock_floor", {"above_bottom": 0}, {"above_bottom": 5}),
                           _block("minecraft:bedrock")))
    if terrain.roof:
        rules.append(_cond(_not(_vgrad(f"{NS}:{dim.id}/bedrock_roof", {"below_top": 5}, {"below_top": 0})),
                           _block("minecraft:bedrock")))
    floor0 = _depth(0, False, 0, "floor")
    floorN = _depth(0, True, 0, "floor")
    ceil0 = _depth(0, False, 0, "ceiling")
    ceilN = _depth(0, True, 0, "ceiling")
    cliffs = P.get("cliffs", False)
    inverted = t.style == "inverted"
    sea = t.sea_level
    patch_i = 0
    for b in dim.biomes:
        br = []
        top, under = b.top, b.under
        uw = b.underwater or b.under
        stone_b = b.stone or t.stone
        if cliffs:
            cliff = P.get("cliff_block") or stone_b
            br.append(_cond({"type": "minecraft:steep"}, _cond(floorN, _block(cliff))))
        if P.get("peak_block"):
            py = int(P.get("peak_y", t.height + t.amplitude))
            br.append(_cond(_y_above(py, 1, False), _cond(floor0, _block(P["peak_block"]))))
        if P.get("beach_block") and t.fluid != "minecraft:air":
            bh = int(P.get("beach_height", 3))
            br.append(_cond(_y_above(sea - 3, 0), _cond(_not(_y_above(sea + bh, 1)), _cond(floorN, _block(P["beach_block"])))))
        top_seq = []
        for (blk, thr) in b.surface_noise:
            k = f"{NS}:{dim.id}/patch_{patch_i}"
            noise_keys[k] = {"firstOctave": -5, "amplitudes": [1.0, 1.0, 0.5]}
            patch_i += 1
            top_seq.append(_cond({"type": "minecraft:noise_threshold", "noise": k, "min_threshold": float(thr),
                                  "max_threshold": 1.0e10}, _block(blk)))
        top_seq.append(_cond(_water(-1, 0), _block(top)))
        top_seq.append(_block(uw))
        br.append(_cond(floor0, _seq(top_seq)))
        br.append(_cond(floorN, _seq([_cond(_water(-1, 0), _block(under)), _block(uw)])))
        if inverted:
            br.append(_cond(ceil0, _block(top)))
            br.append(_cond(ceilN, _block(under)))
        else:
            ceil_blk = P.get("ceiling_block") or (under if not is_falling(ctx, under) else stone_b)
            if not is_falling(ctx, ceil_blk):
                br.append(_cond(ceil0, _block(ceil_blk)))
        if b.stone:
            br.append(_cond(_depth(14, True, 8, "floor"), _block(b.stone)))
        rules.append(_cond({"type": "minecraft:biome", "biome_is": [f"{NS}:{b.id}"]}, _seq(br)))
    if t.deepslate:
        rules.append(_cond(_vgrad(f"{NS}:{dim.id}/deepslate", {"absolute": 0}, {"absolute": 8}), _block(t.deepslate)))
    return _seq(rules) if rules else _block(t.stone)


# =============================================================================================== emitters
def climate_noise(terrain: Terrain, name, first, amps):
    P = terrain.P
    size = float(P.get("biome_size", 320))
    k = terrain.key(name, first, amps)
    return df.mul(df.shifted(k, 400.0 / max(32.0, size), 0.0), 2.2)


def emit_noise_settings(ctx, dim):
    terrain = Terrain(dim)
    res = terrain.build()
    t = dim.terrain
    temperature = climate_noise(terrain, "temperature", -9, [1.5, 0, 1])
    humidity = climate_noise(terrain, "humidity", -9, [1, 1, 0])
    aquifers = bool(t.caves and t.fluid != "minecraft:air" and res["H"] is not None and t.style not in VOID_STYLES)
    router = {
        "barrier": df.noise("minecraft:aquifer_barrier", 1.0, 0.5) if aquifers else 0.0,
        "fluid_level_floodedness": df.noise("minecraft:aquifer_fluid_level_floodedness", 1.0, 0.67) if aquifers else 0.0,
        "fluid_level_spread": df.noise("minecraft:aquifer_fluid_level_spread", 1.0, 0.7142857142857143) if aquifers else 0.0,
        "lava": df.noise("minecraft:aquifer_lava", 1.0, 1.0) if aquifers else 0.0,
        "temperature": temperature,
        "vegetation": humidity,
        "continents": res["continents"],
        "erosion": 0.0,
        "depth": 0.0,
        "ridges": 0.0,
        "preliminary_surface_level": res["prelim"],
        "final_density": res["final"],
        "vein_toggle": 0.0,
        "vein_ridged": 0.0,
        "vein_gap": 0.0,
    }
    noise_keys = dict(terrain.noises)
    rule = surface_rule(ctx, dim, terrain, noise_keys)
    min_y, height = terrain.min_y, terrain.height
    settings = {
        "sea_level": int(t.sea_level),
        "disable_mob_generation": False,
        "aquifers_enabled": aquifers,
        "ore_veins_enabled": False,
        "legacy_random_source": False,
        "default_block": state(t.stone),
        "default_fluid": state(t.fluid),
        "noise": {"min_y": min_y, "height": height, "size_horizontal": 1, "size_vertical": 2},
        "noise_router": router,
        "spawn_target": [],
        "surface_rule": rule,
    }
    write_json(ctx.data("worldgen", "noise_settings", dim.id + ".json"), settings)
    for k, params in noise_keys.items():
        path = k.split(":", 1)[1]
        write_json(ctx.data("worldgen", "noise", path + ".json"), params)
    return terrain, res


def emit_carvers(ctx, dim, terrain):
    t = dim.terrain
    if not t.caves or t.style in VOID_STYLES or t.style in ("caves", "cells"):
        return []
    tag = f"#{NS}:carver_replaceables/{dim.id}"
    lava = {"above_bottom": 8} if (t.fluid == "minecraft:lava" or "heat" in dim.effects) else {"above_bottom": 0}
    top_y = min(terrain.top - 16, t.height + int(t.amplitude * 2) + 20)
    ids = []
    cave = {"type": "minecraft:cave", "config": {
        "probability": 0.12, "replaceable": tag, "lava_level": lava,
        "y": {"type": "minecraft:uniform", "min_inclusive": {"above_bottom": 8}, "max_inclusive": {"absolute": int(top_y)}},
        "yScale": {"type": "minecraft:uniform", "min_inclusive": 0.1, "max_exclusive": 0.9},
        "horizontal_radius_multiplier": {"type": "minecraft:uniform", "min_inclusive": 0.7, "max_exclusive": 1.4},
        "vertical_radius_multiplier": {"type": "minecraft:uniform", "min_inclusive": 0.8, "max_exclusive": 1.3},
        "floor_level": {"type": "minecraft:uniform", "min_inclusive": -1.0, "max_exclusive": -0.4}}}
    write_json(ctx.data("worldgen", "configured_carver", f"{dim.id}_cave.json"), cave)
    ids.append(f"{NS}:{dim.id}_cave")
    if t.style not in ("ocean",):
        canyon = {"type": "minecraft:canyon", "config": {
            "probability": 0.01, "replaceable": tag, "lava_level": lava,
            "y": {"type": "minecraft:uniform", "min_inclusive": {"absolute": int(max(terrain.min_y + 10, t.sea_level - 50))},
                  "max_inclusive": {"absolute": int(max(terrain.min_y + 20, t.sea_level + 4))}},
            "yScale": 3.0,
            "vertical_rotation": {"type": "minecraft:uniform", "min_inclusive": -0.125, "max_exclusive": 0.125},
            "shape": {"distance_factor": {"type": "minecraft:uniform", "min_inclusive": 0.75, "max_exclusive": 1.0},
                      "thickness": {"type": "minecraft:trapezoid", "min": 0.0, "max": 6.0, "plateau": 2.0},
                      "width_smoothness": 3,
                      "horizontal_radius_factor": {"type": "minecraft:uniform", "min_inclusive": 0.75, "max_exclusive": 1.0},
                      "vertical_radius_default_factor": 1.0, "vertical_radius_center_factor": 0.0}}}
        write_json(ctx.data("worldgen", "configured_carver", f"{dim.id}_canyon.json"), canyon)
        ids.append(f"{NS}:{dim.id}_canyon")
    # replaceable tag: dimension stone + every biome surface block + vanilla overworld replaceables
    tag_id = f"{NS}:carver_replaceables/{dim.id}"
    blocks = {t.stone} | ({t.deepslate} if t.deepslate else set())
    for b in dim.biomes:
        blocks |= {b.top, b.under}
        if b.stone:
            blocks.add(b.stone)
        if b.underwater:
            blocks.add(b.underwater)
    for r in sorted(full_id(x) for x in blocks):
        ctx.tags.add("block", tag_id, r)
    ctx.tags.add("block", tag_id, "#minecraft:overworld_carver_replaceables")
    return ids


def ore_replace_tag(ctx, dim):
    tag_id = f"{NS}:ore_replaceables/{dim.id}"
    t = dim.terrain
    blocks = {t.stone}
    for b in dim.biomes:
        if b.stone:
            blocks.add(b.stone)
    for r in sorted(full_id(x) for x in blocks):
        ctx.tags.add("block", tag_id, r)
    if t.deepslate:
        ctx.tags.add("block", f"{NS}:deep_ore_replaceables/{dim.id}", full_id(t.deepslate))
    return tag_id


# ----------------------------------------------------------------------------------------------- sky / time
_DAY = None


def _day():
    global _DAY
    if _DAY is None:
        with open(os.path.join(DATA_DIR, "vanilla_day_timeline.json")) as f:
            _DAY = json.load(f)
    return _DAY


def _bezier(controls, x):
    x1, y1, x2, y2 = controls
    # solve bx(s) = x by bisection, return by(s)
    lo, hi = 0.0, 1.0
    for _ in range(40):
        s = (lo + hi) / 2
        bx = 3 * (1 - s) ** 2 * s * x1 + 3 * (1 - s) * s * s * x2 + s ** 3
        if bx < x:
            lo = s
        else:
            hi = s
    s = (lo + hi) / 2
    return 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s * s * y2 + s ** 3


def _parse_val(v):
    """-> ('color', [a,r,g,b]) | ('num', float) | ('bool', b) | ('str', s)"""
    if isinstance(v, bool):
        return "bool", v
    if isinstance(v, (int, float)):
        return "num", float(v)
    if isinstance(v, str) and v.startswith("#"):
        h = v[1:]
        if len(h) == 6:
            h = "ff" + h
        return "color", [int(h[i:i + 2], 16) for i in (0, 2, 4, 6)]
    return "str", v


def _fmt_color(argb, with_alpha):
    a, r, g, b = [max(0, min(255, int(round(c)))) for c in argb]
    return ("#%02x%02x%02x%02x" % (a, r, g, b)) if with_alpha else ("#%02x%02x%02x" % (r, g, b))


def sample_track(track, period, tick):
    """Sample a vanilla timeline track at `tick` (periodic). Returns a JSON value of the same type."""
    kfs = track["keyframes"]
    ease = track.get("ease", "linear")
    raw = kfs[0]["value"]
    kind, _ = _parse_val(raw)
    is_int_color = isinstance(raw, int) and not isinstance(raw, bool) and track.get("modifier") == "multiply" and abs(raw) > 1000 or raw == -1
    tick = tick % period
    # build periodic segments
    segs = []
    first, last = kfs[0], kfs[-1]
    segs.append((last["ticks"] - period, last["value"], first["ticks"], first["value"]))
    for a, b in zip(kfs, kfs[1:]):
        segs.append((a["ticks"], a["value"], b["ticks"], b["value"]))
    segs.append((last["ticks"], last["value"], first["ticks"] + period, first["value"]))
    for t0, v0, t1, v1 in segs:
        if t0 <= tick < t1 or (t1 == t0 and tick == t0):
            break
    else:
        t0, v0, t1, v1 = segs[-1]
    f = 0.0 if t1 == t0 else (tick - t0) / (t1 - t0)
    if ease == "constant" or kind in ("bool", "str"):
        return v0 if f < 1.0 else v1
    if isinstance(ease, dict) and "cubic_bezier" in ease:
        f = _bezier(ease["cubic_bezier"], f)
    if kind == "num" and not is_int_color:
        return float(v0) + (float(v1) - float(v0)) * f
    if kind == "num" and is_int_color:
        c0 = [(int(v0) >> s) & 255 for s in (24, 16, 8, 0)]
        c1 = [(int(v1) >> s) & 255 for s in (24, 16, 8, 0)]
        c = [x + (y - x) * f for x, y in zip(c0, c1)]
        return _fmt_color(c, True)
    _, c0 = _parse_val(v0)
    _, c1 = _parse_val(v1)
    c = [x + (y - x) * f for x, y in zip(c0, c1)]
    return _fmt_color(c, len(str(v0)) == 9)


def fixed_tick(sky):
    if isinstance(sky.time, (int, float)):
        return int(sky.time) % 24000
    return TIMES.get(str(sky.time), 6000)


def emit_timeline(ctx, dim):
    """Returns the dimension_type 'timelines' value (tag string or list of ids) + whether time is fixed."""
    sky = dim.sky
    day = _day()
    if sky.time == "cycle":
        if not sky.sunrise_color and not sky.moon_phase:
            return "#minecraft:in_overworld", False
        tls = ["minecraft:villager_schedule"]   # (a list may not contain tags; this is #minecraft:universal)
        if sky.sunrise_color:
            custom = json.loads(json.dumps(day))
            col = hex_argb(sky.sunrise_color)
            ca = int(col[1:3], 16) / 255.0
            tr = custom["tracks"]["minecraft:visual/sunrise_sunset_color"]
            for kf in tr["keyframes"]:
                _, (a, r, g, b) = _parse_val(kf["value"])
                rgb = mix_hex("#%02x%02x%02x" % (r, g, b), "#" + col[3:], 0.75)
                kf["value"] = "#%02x" % int(a * ca) + rgb[1:]
            write_json(ctx.data("timeline", f"{dim.id}_day.json"), custom)
            tls.append(f"{NS}:{dim.id}_day")
        else:
            tls.append("minecraft:day")
        if not sky.moon_phase:
            tls.append("minecraft:moon")
        tls.append("minecraft:early_game")
        return tls, False
    tick = fixed_tick(sky)
    tracks = {}
    for name, tr in day["tracks"].items():
        if name in ("minecraft:visual/sky_color", "minecraft:visual/fog_color"):
            continue   # fixed-time worlds show Sky.sky_color / fog_color exactly as specified (no day/night dimming)
        v = sample_track(tr, day.get("period_ticks", 24000), tick)
        if name == "minecraft:visual/sunrise_sunset_color" and sky.sunrise_color:
            v = hex_argb(sky.sunrise_color)
        if name == "minecraft:visual/star_brightness" and sky.star_brightness is not None:
            v = max(float(v), float(sky.star_brightness))
        entry = {"keyframes": [{"ticks": 0, "value": v}]}
        if "modifier" in tr:
            entry["modifier"] = tr["modifier"]
        tracks[name] = entry
    write_json(ctx.data("timeline", f"{dim.id}.json"), {"tracks": tracks})
    return [f"{NS}:{dim.id}", "minecraft:villager_schedule"], True


def bed_rule(ctx, dim, fixed):
    hot = "heat" in dim.effects or dim.terrain.fluid == "minecraft:lava"
    if hot:
        return {"can_sleep": "never", "can_set_spawn": "never", "explodes": True}
    rule = {"can_set_spawn": "always" if dim.danger <= 3 else "never", "explodes": False}
    if fixed:
        rule["can_sleep"] = "never"
        rule["error_message"] = {"translate": f"message.{NS}.bed.time_frozen"}
        ctx.lang[f"message.{NS}.bed.time_frozen"] = "Time stands still here - there is no night to sleep through"
    elif dim.danger >= 4:
        rule["can_sleep"] = "never"
        rule["error_message"] = {"translate": f"message.{NS}.bed.too_dangerous"}
        ctx.lang[f"message.{NS}.bed.too_dangerous"] = "You can't rest here - something is watching you"
    else:
        rule["can_sleep"] = "when_dark"
        rule["error_message"] = {"translate": "block.minecraft.bed.no_sleep"}
    return rule


def music_entry(sound, replace=False):
    m = {"sound": sound, "min_delay": 12000, "max_delay": 24000}
    if replace:
        m["replace_current_music"] = True
    return m


def ambient_entry(ctx, loop, additions=None):
    out = {"mood": {"sound": "minecraft:ambient.cave", "tick_delay": 6000, "block_search_extent": 8, "offset": 2.0}}
    if loop:
        ev = f"{NS}:ambient.{loop}"
        if ctx.sound_table and f"ambient.{loop}" not in ctx.sound_table:
            warn(f"ambient loop {loop!r} has no sound event in sounds.json")
        out["loop"] = ev
    if additions:
        out["additions"] = {"sound": additions, "tick_chance": 0.0111}
    return out


AMBIENT_ADDITIONS = {
    "alien_hum": "minecraft:ambient.warped_forest.additions",
    "eerie_choir": "minecraft:ambient.soul_sand_valley.additions",
    "volcanic_rumble": "minecraft:ambient.basalt_deltas.additions",
    "dark_void": "minecraft:ambient.crimson_forest.additions",
    "deep_ocean": "minecraft:ambient.underwater.loop.additions",
    "wet_squelch": "minecraft:ambient.nether_wastes.additions",
}


def emit_dimension_type(ctx, dim, terrain):
    t, sky = dim.terrain, dim.sky
    timelines, fixed = emit_timeline(ctx, dim)
    hot = "heat" in dim.effects or t.fluid == "minecraft:lava"
    attrs = {
        "minecraft:visual/sky_color": hex_rgb(sky.sky_color),
        "minecraft:visual/fog_color": hex_rgb(sky.fog_color),
        "minecraft:visual/cloud_height": float(sky.cloud_height),
        "minecraft:visual/cloud_color": hex_argb(sky.cloud_color) if sky.cloud_color else "#00000000",
        "minecraft:gameplay/bed_rule": bed_rule(ctx, dim, fixed),
        "minecraft:gameplay/respawn_anchor_works": bool(hot or dim.danger >= 4),
        "minecraft:gameplay/can_start_raid": False,
        "minecraft:gameplay/nether_portal_spawns_piglin": False,
        "minecraft:audio/ambient_sounds": ambient_entry(ctx, dim.ambient, AMBIENT_ADDITIONS.get(dim.ambient or "")),
    }
    music = dim.music or "minecraft:music.game"
    attrs["minecraft:audio/background_music"] = {"default": music_entry(music), "creative": music_entry(dim.music or "minecraft:music.creative")}
    if sky.water_fog_color:
        attrs["minecraft:visual/water_fog_color"] = hex_rgb(sky.water_fog_color)
    if sky.fog_start is not None:
        attrs["minecraft:visual/fog_start_distance"] = float(sky.fog_start)
    if sky.fog_end is not None:
        attrs["minecraft:visual/fog_end_distance"] = float(sky.fog_end)
        if sky.fog_end < 400:
            attrs["minecraft:visual/sky_fog_end_distance"] = float(max(32.0, sky.fog_end * 1.5))
            attrs["minecraft:visual/cloud_fog_end_distance"] = float(max(64.0, sky.fog_end * 2.5))
    if sky.star_brightness is not None:
        attrs["minecraft:visual/star_brightness"] = float(max(0.0, min(1.0, sky.star_brightness)))
    if sky.sky_light_color:
        attrs["minecraft:visual/sky_light_color"] = hex_rgb(sky.sky_light_color)
    if sky.sky_light_factor is not None:
        attrs["minecraft:visual/sky_light_factor"] = float(max(0.0, min(1.0, sky.sky_light_factor)))
    if sky.moon_phase:
        attrs["minecraft:visual/moon_phase"] = sky.moon_phase
    if hot:
        attrs["minecraft:gameplay/water_evaporates"] = True
        attrs["minecraft:gameplay/fast_lava"] = True
        attrs["minecraft:gameplay/snow_golem_melts"] = True
        attrs["minecraft:visual/default_dripstone_particle"] = {"type": "minecraft:dripping_dripstone_lava"}
    if not sky.has_skylight:
        attrs["minecraft:gameplay/sky_light_level"] = 0.0
    light_max = {1: 7, 2: 7, 3: 8, 4: 10, 5: 11}.get(int(dim.danger), 7)
    dt = {
        "has_fixed_time": fixed,
        "has_skylight": bool(sky.has_skylight),
        "has_ceiling": bool(terrain.roof),
        "coordinate_scale": 1.0,
        "min_y": terrain.min_y,
        "height": terrain.height,
        "logical_height": terrain.height,
        "infiniburn": "#minecraft:infiniburn_nether" if hot else "#minecraft:infiniburn_overworld",
        "ambient_light": float(sky.ambient_light),
        "monster_spawn_light_level": {"type": "minecraft:uniform", "min_inclusive": 0, "max_inclusive": light_max},
        "monster_spawn_block_light_limit": 0,
        "skybox": sky.skybox,
        "cardinal_light": "nether" if t.style == "caves" else "default",
        "attributes": dict(sorted(attrs.items())),
        "timelines": timelines,
    }
    write_json(ctx.data("dimension_type", dim.id + ".json"), dt)


def emit_dimension(ctx, dim, biome_points):
    if len(biome_points) == 1:
        src = {"type": "minecraft:fixed", "biome": biome_points[0]["biome"]}
    else:
        src = {"type": "minecraft:multi_noise", "biomes": biome_points}
    write_json(ctx.data("dimension", dim.id + ".json"), {
        "type": f"{NS}:{dim.id}",
        "generator": {"type": "minecraft:noise", "settings": f"{NS}:{dim.id}", "biome_source": src},
    })


def biome_points(dim):
    pts = []
    use_elev = any(b.elevation is not None for b in dim.biomes)
    for b in dim.biomes:
        p = {"temperature": float(b.temperature), "humidity": float(b.humidity),
             "continentalness": float(b.elevation if b.elevation is not None else 0.0) if use_elev else 0.0,
             "erosion": 0.0, "depth": 0.0, "weirdness": 0.0, "offset": 0.0}
        pts.append({"biome": f"{NS}:{b.id}", "parameters": p})
    return pts
