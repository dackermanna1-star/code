"""Scope overlays (ASSET_SPEC 3.7): 512x512, opaque black outside a circular window.

scope_sniper: thin housing edge, duplex crosshair (thick outer posts, fine centre), mil-dots,
              subtle vignette ring inside the window.
scope_acog:   thick machined housing ring, amber illuminated chevron with BDC stadia below.
Rendered with 2x2 supersampling for clean anti-aliased edges.
"""
from __future__ import annotations

import numpy as np

from texlib import save, smoothstep

N = 512
C = 256.0


def render(fn, ss=2):
    ys = (np.arange(N * ss) + 0.5) / ss
    X, Y = np.meshgrid(ys, ys)
    rgba = fn(X, Y)
    a = rgba[..., 3:4] / 255.0
    pre = (rgba[..., :3] * a).reshape(N, ss, N, ss, 3).mean(axis=(1, 3))
    al = a.reshape(N, ss, N, ss, 1).mean(axis=(1, 3))
    rgb = np.where(al > 1e-6, pre / np.maximum(al, 1e-6), 0)
    return np.concatenate([rgb, al * 255], axis=2)


def over(dst, rgb, alpha):
    """Composite a colour layer with per-pixel alpha (0..1) over dst (straight alpha float arrays)."""
    da = dst[..., 3] / 255.0
    oa = alpha + da * (1 - alpha)
    for ch in range(3):
        num = rgb[ch] * alpha + dst[..., ch] * da * (1 - alpha)
        dst[..., ch] = np.where(oa > 1e-6, num / np.maximum(oa, 1e-6), 0)
    dst[..., 3] = oa * 255
    return dst


def line_cov(d, half_w):
    """Coverage of a line of half-width half_w at distance d (1px AA)."""
    return np.clip(half_w + 0.5 - d, 0, 1)


def scope_sniper():
    R = 238.0

    def fn(X, Y):
        dx, dy = X - C, Y - C
        r = np.hypot(dx, dy)
        out = np.zeros(X.shape + (4,))
        # vignette inside the window: darkens toward the rim
        vig = smoothstep(R - 70, R, r) ** 1.6 * 0.88
        over(out, (0, 0, 0), vig)
        # thin bright-ish lens edge reflection ring just inside the housing
        ring = np.exp(-((r - (R - 3)) ** 2) / (2 * 1.2 ** 2)) * 0.25
        over(out, (40, 46, 52), ring)
        # duplex crosshair: thick posts outside r=118, fine lines inside
        thin = 0.9
        thick = 3.2
        hw_h = np.where(np.abs(dx) > 118, thick, thin)
        hw_v = np.where(np.abs(dy) > 118, thick, thin)
        cov = np.maximum(line_cov(np.abs(dy), hw_h), line_cov(np.abs(dx), hw_v))
        # posts taper into the fine wire
        over(out, (0, 0, 0), cov * 0.95)
        # mil-dots every 20px out to 100px on both axes
        dots = np.zeros_like(r)
        for k in range(1, 6):
            for sx, sy in ((k * 20, 0), (-k * 20, 0), (0, k * 20), (0, -k * 20)):
                dd = np.hypot((dx - sx) / 1.0, (dy - sy) / 1.0)
                dots = np.maximum(dots, np.clip(3.0 + 0.5 - dd, 0, 1))
        over(out, (0, 0, 0), dots)
        # fine sub-tension ticks between dots
        ticks = np.zeros_like(r)
        for k in range(1, 5):
            for s in (-1, 1):
                p = s * (k * 20 + 10)
                ticks = np.maximum(ticks, line_cov(np.abs(dx - p), 0.6) * (np.abs(dy) < 3.5))
                ticks = np.maximum(ticks, line_cov(np.abs(dy - p), 0.6) * (np.abs(dx) < 3.5))
        over(out, (0, 0, 0), ticks * 0.9)
        # housing: opaque black outside the window
        outside = np.clip(r - R + 0.5, 0, 1)
        over(out, (0, 0, 0), outside)
        return out

    return render(fn)


def scope_acog():
    R = 196.0      # glass window
    R_ring = 246.0  # outer edge of the machined housing ring

    def fn(X, Y):
        dx, dy = X - C, Y - C
        r = np.hypot(dx, dy)
        out = np.zeros(X.shape + (4,))
        vig = smoothstep(R - 55, R, r) ** 1.5 * 0.9
        over(out, (0, 0, 0), vig)
        # thin horizontal reference wires from the rim inward (TA31 style)
        wire = line_cov(np.abs(dy), 0.9) * (np.abs(dx) > 95)
        over(out, (0, 0, 0), wire * 0.95)
        # BDC stem + stadia (black, fine)
        stem = line_cov(np.abs(dx), 0.9) * (dy > 30) * (dy < 160)
        st = np.zeros_like(r)
        for yy, half in ((52, 34), (80, 26), (108, 19), (136, 13)):
            st = np.maximum(st, line_cov(np.abs(dy - yy), 0.9) * (np.abs(dx) <= half))
        over(out, (0, 0, 0), np.maximum(stem, st) * 0.95)
        # amber chevron with glow
        ax, ay = 0.0, -6.0
        d = np.full(X.shape, 1e9)
        for bx, by in ((-26.0, 26.0), (26.0, 26.0)):
            vx, vy = bx - ax, by - ay
            t = np.clip(((dx - ax) * vx + (dy - ay) * vy) / (vx * vx + vy * vy), 0, 1)
            d = np.minimum(d, np.hypot(dx - (ax + t * vx), dy - (ay + t * vy)))
        glow = np.exp(-(d ** 2) / (2 * 6.0 ** 2)) * 0.45
        over(out, (255, 150, 20), glow)
        chev = line_cov(d, 3.6)
        over(out, (255, 176, 40), chev)
        core = line_cov(d, 1.2)
        over(out, (255, 228, 150), core * 0.85)
        # housing ring: machined dark steel with top-left light, bottom-right shade
        ring_m = np.clip(r - R + 0.5, 0, 1)
        ang = np.arctan2(dy, dx)
        light = 0.5 + 0.5 * np.cos(ang + 2.35)  # light from the top-left
        t = np.clip((r - R) / (R_ring - R), 0, 1)
        base = 34 + 26 * light * (1 - t) + 10 * np.cos(t * np.pi * 3) ** 2
        # inner bevel highlight and fine machined grooves
        bevel = np.exp(-((r - (R + 3)) ** 2) / (2 * 1.6 ** 2)) * 70 * light
        grooves = ((np.floor(r) % 7) == 0) * -8
        g = np.clip(base + bevel + grooves, 0, 255)
        ring_rgb = (g, g * 1.02, g * 1.06)
        over(out, ring_rgb, ring_m)
        outside = np.clip(r - R_ring + 0.5, 0, 1)
        over(out, (0, 0, 0), outside)
        return out

    return render(fn)


def generate():
    save("misc/scope_sniper", scope_sniper(), (512, 512))
    save("misc/scope_acog", scope_acog(), (512, 512))
    return ["misc/scope_sniper", "misc/scope_acog"]
