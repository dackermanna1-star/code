"""Painter functions ("materials") for hatkit boxes. A painter maps a Texel to an RGBA tuple (or None)."""
import math

from lib import hash01, jitter, mix, rgb, shade


def fabric(base, var=0.05, edge=0.86, top_light=1.06, seed=0):
    """Matte fabric/felt: per-texel noise, slightly lighter top faces, darker face borders."""
    base = rgb(base) if isinstance(base, str) else base

    def p(t):
        c = jitter(base, var, t.x, t.y, t.z, seed)
        if t.face == "up":
            c = shade(c, top_light)
        if edge < 1 and t.w > 2 and t.h > 2 and t.edge():
            c = shade(c, edge)
        return c
    return p


def metal(base, light=1.35, dark=0.7, seed=0):
    """Shiny metal: diagonal highlight streaks and darker lower texels."""
    base = rgb(base) if isinstance(base, str) else base

    def p(t):
        diag = (t.x * 0.7 + t.y + t.z * 0.5) * 0.9
        streak = 0.5 + 0.5 * math.sin(diag)
        f = dark + (light - dark) * (0.35 + 0.65 * streak * (0.6 + 0.4 * t.fv if t.side else 1.0))
        if t.side:
            f *= 1.0 - 0.18 * t.fv
        c = shade(base, f)
        c = jitter(c, 0.03, t.x, t.y, t.z, seed)
        if t.w > 2 and t.h > 2 and t.edge():
            c = shade(c, 0.85)
        return c
    return p


def solid(color):
    color = rgb(color) if isinstance(color, str) else color
    return lambda t: color


def bands(levels, default):
    """levels: list of (y0, y1, painter) by head-space y; first match wins."""
    def p(t):
        for y0, y1, painter in levels:
            if y0 <= t.y < y1:
                return painter(t)
        return default(t)
    return p


def by_face(mapping, default):
    def p(t):
        return mapping.get(t.face, default)(t)
    return p


def knit(base, rib=True, seed=0):
    """Knitted wool: alternating rib columns or 'V' stitch pattern."""
    base = rgb(base) if isinstance(base, str) else base

    def p(t):
        if t.side:
            u = t.i
            v = t.j
            if rib:
                f = 1.0 if u % 2 == 0 else 0.86
            else:
                f = 1.0 if (u + v) % 2 == 0 else 0.9
        else:
            f = 1.04 if (t.i + t.j) % 2 == 0 else 0.94
        return jitter(shade(base, f), 0.04, t.x, t.y, t.z, seed)
    return p


def fluffy(base, seed=0):
    base = rgb(base) if isinstance(base, str) else base

    def p(t):
        r = hash01(t.x, t.y, t.z, seed, 7)
        f = 0.82 + 0.3 * r
        if t.face == "up":
            f += 0.06
        return shade(base, f)
    return p


def dots(painter, color, spacing=3, seed=0):
    color = rgb(color) if isinstance(color, str) else color

    def p(t):
        if (t.i + (t.j // spacing) * 2) % spacing == 0 and t.j % spacing == 1:
            return color
        return painter(t)
    return p


def gem(color):
    """Faceted gem: bright top-left, dark bottom-right, white glint."""
    color = rgb(color) if isinstance(color, str) else color

    def p(t):
        if t.w >= 2 and t.h >= 2 and t.i == 0 and t.j == 0:
            return mix(color, rgb("#ffffff"), 0.75)
        f = 1.25 - 0.5 * (t.fu * 0.5 + t.fv * 0.5)
        if t.face == "up":
            f += 0.15
        return shade(color, f)
    return p


def stripes_diag(a, b, period=3.0, slope=1.0):
    """Diagonal/spiral stripes around a cone by height + angle (used by the party hat)."""
    a = rgb(a) if isinstance(a, str) else a
    b = rgb(b) if isinstance(b, str) else b

    def p(t):
        ang = math.atan2(t.z, t.x) / (2 * math.pi) * 8.0
        v = (t.y * slope + ang) / period
        c = a if int(math.floor(v)) % 2 == 0 else b
        return jitter(c, 0.04, t.x, t.y, t.z)
    return p
