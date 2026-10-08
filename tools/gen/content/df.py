"""Tiny builders for density-function JSON (vanilla 1.21.11 types + the portalgun:* types W2 implements).

Every builder returns plain dicts/floats/strings ready for json.dump. Numbers are valid density functions
(constants). Strings are references to registered density functions (e.g. "minecraft:y").
"""
from __future__ import annotations

Y = "minecraft:y"
SHIFT_X = "minecraft:shift_x"
SHIFT_Z = "minecraft:shift_z"


def _c(v):
    return float(v) if isinstance(v, (int, float)) else v


def add(*args):
    args = [_c(a) for a in args if not (isinstance(a, (int, float)) and a == 0)]
    if not args:
        return 0.0
    out = args[0]
    for a in args[1:]:
        if isinstance(out, float) and isinstance(a, float):
            out = out + a
        else:
            out = {"type": "minecraft:add", "argument1": out, "argument2": a}
    return out


def mul(a, b):
    a, b = _c(a), _c(b)
    if isinstance(a, float) and isinstance(b, float):
        return a * b
    if a == 1.0:
        return b
    if b == 1.0:
        return a
    if a == 0.0 or b == 0.0:
        return 0.0
    return {"type": "minecraft:mul", "argument1": a, "argument2": b}


def sub(a, b):
    return add(a, mul(b, -1.0))


def neg(a):
    return mul(a, -1.0)


def min_(a, b):
    return {"type": "minecraft:min", "argument1": _c(a), "argument2": _c(b)}


def max_(a, b):
    return {"type": "minecraft:max", "argument1": _c(a), "argument2": _c(b)}


def max_all(items):
    items = list(items)
    out = items[0]
    for i in items[1:]:
        out = max_(out, i)
    return out


def min_all(items):
    items = list(items)
    out = items[0]
    for i in items[1:]:
        out = min_(out, i)
    return out


def _mapped(t, a):
    return {"type": f"minecraft:{t}", "argument": _c(a)}


def abs_(a):
    return _mapped("abs", a)


def square(a):
    return _mapped("square", a)


def cube(a):
    return _mapped("cube", a)


def half_neg(a):
    return _mapped("half_negative", a)


def quarter_neg(a):
    return _mapped("quarter_negative", a)


def squeeze(a):
    return _mapped("squeeze", a)


def clamp(a, lo, hi):
    return {"type": "minecraft:clamp", "input": _c(a), "min": float(lo), "max": float(hi)}


def interpolated(a):
    return _mapped("interpolated", a)


def flat_cache(a):
    return _mapped("flat_cache", a)


def cache_2d(a):
    return _mapped("cache_2d", a)


def cache_once(a):
    return _mapped("cache_once", a)


def col(a):
    """Cache a 2D (y-independent) function per column."""
    return flat_cache(cache_2d(a))


def ygrad(y0, y1, v0, v1):
    return {"type": "minecraft:y_clamped_gradient", "from_y": int(y0), "to_y": int(y1),
            "from_value": float(v0), "to_value": float(v1)}


def noise(key, xz=1.0, y=1.0):
    return {"type": "minecraft:noise", "noise": key, "xz_scale": float(xz), "y_scale": float(y)}


def noise2d(key, xz=1.0):
    return noise(key, xz, 0.0)


def shifted(key, xz=1.0, y=0.0):
    return {"type": "minecraft:shifted_noise", "noise": key, "xz_scale": float(xz), "y_scale": float(y),
            "shift_x": SHIFT_X, "shift_y": 0.0, "shift_z": SHIFT_Z}


def range_choice(inp, lo, hi, when_in, when_out):
    return {"type": "minecraft:range_choice", "input": _c(inp), "min_inclusive": float(lo), "max_exclusive": float(hi),
            "when_in_range": _c(when_in), "when_out_of_range": _c(when_out)}


def spline(coord, points):
    """points: list of (location, value, derivative); value may be a float or a nested spline() result."""
    return {"type": "minecraft:spline", "spline": spline_obj(coord, points)}


def spline_obj(coord, points):
    pts = []
    for loc, val, der in sorted(points, key=lambda p: p[0]):
        if isinstance(val, dict) and val.get("type") == "minecraft:spline":
            val = val["spline"]
        pts.append({"location": float(loc), "value": val if isinstance(val, dict) else float(val), "derivative": float(der)})
    return {"coordinate": _c(coord), "points": pts}


def lerp_spline(coord, pairs):
    """Piecewise *linear* spline through (x, y) pairs (derivatives = neighbouring slopes)."""
    pairs = sorted(pairs)
    pts = []
    for i, (x, y) in enumerate(pairs):
        if 0 < i < len(pairs) - 1:
            d = (pairs[i + 1][1] - pairs[i - 1][1]) / (pairs[i + 1][0] - pairs[i - 1][0])
        elif i == 0:
            d = (pairs[1][1] - y) / (pairs[1][0] - x)
        else:
            d = (y - pairs[i - 1][1]) / (x - pairs[i - 1][0])
        pts.append((x, y, d))
    return spline(coord, pts)


def smooth_spline(coord, pairs, end_slopes=(0.0, 0.0)):
    """Spline through (x, y) pairs with zero derivative at every point (S-shaped transitions)."""
    pairs = sorted(pairs)
    pts = [(x, y, 0.0) for x, y in pairs]
    if pts:
        pts[0] = (pts[0][0], pts[0][1], end_slopes[0])
        pts[-1] = (pts[-1][0], pts[-1][1], end_slopes[1])
    return spline(coord, pts)


def staircase(coord, lo, hi, step, smooth=0.2, offset=0.0):
    """Terrace spline: maps coord (already in blocks) to flat steps of height `step` between lo and hi.

    Each step is flat for (1-smooth) of its width with an S-shaped riser in between.
    """
    pts = []
    smooth = min(0.95, max(0.02, smooth))
    k0 = int((lo - offset) // step) - 1
    k1 = int((hi - offset) // step) + 2
    for k in range(k0, k1):
        base = offset + k * step
        x_flat_end = base + step * (1 - smooth)
        pts.append((base, base, 0.0))
        pts.append((x_flat_end, base, 0.0))
    # riser: from (x_flat_end, base) to (base+step, base+step) handled by hermite between points
    return spline(coord, pts + [(offset + k1 * step, offset + k1 * step, 1.0)])


# ------------------------------------------------------------------------------- portalgun:* (Java, W2)
def pg_coord(axis, scale=1.0):
    return {"type": "portalgun:coord", "axis": axis, "scale": float(scale)}


def pg_sine(arg, frequency=1.0, amplitude=1.0):
    return {"type": "portalgun:sine", "argument": _c(arg), "frequency": float(frequency), "amplitude": float(amplitude)}


def pg_terrace(arg, step, smoothness=0.2):
    return {"type": "portalgun:terrace", "argument": _c(arg), "step": float(step), "smoothness": float(smoothness)}


def pg_cell_shapes(noise_key, shape, cell_size, min_r, max_r, y_min, y_max, probability):
    return {"type": "portalgun:cell_shapes", "noise": noise_key, "shape": shape, "cell_size": int(cell_size),
            "min_radius": float(min_r), "max_radius": float(max_r), "y_min": int(y_min), "y_max": int(y_max),
            "probability": float(probability)}


def pg_cell_pillars(noise_key, cell_size, min_r, max_r, probability, top_min, top_max, bottom):
    return {"type": "portalgun:cell_pillars", "noise": noise_key, "cell_size": int(cell_size), "min_radius": float(min_r),
            "max_radius": float(max_r), "probability": float(probability), "top_min": int(top_min), "top_max": int(top_max),
            "bottom": int(bottom)}


def pg_craters(noise_key, cell_size, min_r, max_r, depth, rim, probability):
    return {"type": "portalgun:craters", "noise": noise_key, "cell_size": int(cell_size), "min_radius": float(min_r),
            "max_radius": float(max_r), "depth": float(depth), "rim": float(rim), "probability": float(probability)}


def pg_cells(noise_key, cell_size):
    return {"type": "portalgun:cells", "noise": noise_key, "cell_size": int(cell_size)}
