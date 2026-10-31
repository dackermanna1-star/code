"""Tiny orthographic software renderer for 64x64 player skins (preview only).

Renders base + second layer cuboids with painter's algorithm so skins can be
eyeballed from several angles without launching the game.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw

# (u, v, w, h, d, x0, y0, z0, inflate)  world: X = character's left, Y up, Z = facing direction
def parts(extra_arms=False):
    p = [
        # base layer
        ("head", 0, 0, 8, 8, 8, -4, 24, -4, 0.0),
        ("body", 16, 16, 8, 12, 4, -4, 12, -2, 0.0),
        ("rarm", 40, 16, 4, 12, 4, -8, 12, -2, 0.0),
        ("larm", 32, 48, 4, 12, 4, 4, 12, -2, 0.0),
        ("rleg", 0, 16, 4, 12, 4, -4, 0, -2, 0.0),
        ("lleg", 16, 48, 4, 12, 4, 0, 0, -2, 0.0),
        # second layer
        ("hat", 32, 0, 8, 8, 8, -4, 24, -4, 0.5),
        ("jacket", 16, 32, 8, 12, 4, -4, 12, -2, 0.25),
        ("rsleeve", 40, 32, 4, 12, 4, -8, 12, -2, 0.25),
        ("lsleeve", 48, 48, 4, 12, 4, 4, 12, -2, 0.25),
        ("rpants", 0, 32, 4, 12, 4, -4, 0, -2, 0.25),
        ("lpants", 0, 48, 4, 12, 4, 0, 0, -2, 0.25),
    ]
    if extra_arms:  # Heian Sukuna: a second pair of arms reusing arm UVs, slightly lower/behind
        p += [
            ("rarm2", 40, 16, 4, 12, 4, -8.6, 9.5, -1.2, 0.0),
            ("larm2", 32, 48, 4, 12, 4, 4.6, 9.5, -1.2, 0.0),
            ("rsleeve2", 40, 32, 4, 12, 4, -8.6, 9.5, -1.2, 0.25),
            ("lsleeve2", 48, 48, 4, 12, 4, 4.6, 9.5, -1.2, 0.25),
        ]
    return p


def _faces(u, v, w, h, d, x0, y0, z0, inf):
    """Yield (normal, texel_rect, corner_fn) for each face.
    corner_fn(i, j) -> 3D point of texel corner (i along tex x, j along tex y)."""
    X0, Y0, Z0 = x0 - inf, y0 - inf, z0 - inf
    sx = (w + 2 * inf) / w
    sy = (h + 2 * inf) / h
    sz = (d + 2 * inf) / d
    W, H, D = w * sx, h * sy, d * sz
    yield ((0, 0, 1), (u + d, v + d, w, h),
           lambda i, j: (X0 + i * sx, Y0 + H - j * sy, Z0 + D))  # front
    yield ((0, 0, -1), (u + 2 * d + w, v + d, w, h),
           lambda i, j: (X0 + W - i * sx, Y0 + H - j * sy, Z0))  # back
    yield ((-1, 0, 0), (u, v + d, d, h),
           lambda i, j: (X0, Y0 + H - j * sy, Z0 + i * sz))  # right (-X)
    yield ((1, 0, 0), (u + d + w, v + d, d, h),
           lambda i, j: (X0 + W, Y0 + H - j * sy, Z0 + D - i * sz))  # left (+X)
    yield ((0, 1, 0), (u + d, v, w, d),
           lambda i, j: (X0 + i * sx, Y0 + H, Z0 + j * sz))  # top
    yield ((0, -1, 0), (u + d + w, v, w, d),
           lambda i, j: (X0 + i * sx, Y0, Z0 + D - j * sz))  # bottom


def render(skin: np.ndarray, yaw_deg=25.0, pitch_deg=12.0, scale=10, extra_arms=False,
           bg=(40, 40, 48), shade=True, size=None):
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    cy, sy_ = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)

    def xf(p):
        x, y, z = p
        # rotate about Y (yaw): positive yaw turns the character to show its right side (-X)
        x1 = x * cy + z * sy_
        z1 = -x * sy_ + z * cy
        # pitch: camera looks slightly down
        y2 = y * cp - z1 * sp
        z2 = y * sp + z1 * cp
        return x1, y2, z2

    quads = []
    light = np.array([-0.45, 0.75, 0.5])
    light /= np.linalg.norm(light)
    for (_, u, v, w, h, d, x0, y0, z0, inf) in parts(extra_arms):
        for normal, (tx, ty, tw, th), cf in _faces(u, v, w, h, d, x0, y0, z0, inf):
            n = xf(normal)
            if n[2] <= 1e-6:  # back-face cull (camera looks along -Z)
                continue
            lam = 1.0
            if shade:
                lam = 0.62 + 0.38 * max(0.0, float(np.dot(normal, light)))
            for j in range(th):
                for i in range(tw):
                    px = skin[ty + j, tx + i]
                    if px[3] == 0:
                        continue
                    cs = [xf(cf(i, j)), xf(cf(i + 1, j)), xf(cf(i + 1, j + 1)), xf(cf(i, j + 1))]
                    depth = sum(c[2] for c in cs) / 4 + inf * 0.01
                    col = tuple(int(min(255, c * lam)) for c in px[:3])
                    quads.append((depth, [(c[0], c[1]) for c in cs], col))
    quads.sort(key=lambda q: q[0])
    if size is None:
        size = (int(26 * scale), int(40 * scale))
    W, H = size
    img = Image.new("RGBA", (W, H), bg + (255,))
    dr = ImageDraw.Draw(img)
    ox, oy = W / 2, H * 0.92
    for _, pts, col in quads:
        dr.polygon([(ox + x * scale, oy - y * scale) for x, y in pts], fill=col + (255,))
    return img


def turnaround(skin, path, extra_arms=False, scale=9):
    views = [(0, 0), (35, 12), (90, 0), (180, 0), (-35, 12), (-90, 0), (150, 25)]
    ims = [render(skin, y, p, scale, extra_arms) for y, p in views]
    W = sum(i.width for i in ims)
    H = max(i.height for i in ims)
    sheet = Image.new("RGBA", (W, H), (40, 40, 48, 255))
    x = 0
    for im in ims:
        sheet.paste(im, (x, 0))
        x += im.width
    sheet.save(path)
    return path


def face_closeup(skin, path, scale=18):
    ims = [render(skin, 0, 0, scale, size=(int(12 * scale), int(14 * scale))),
           render(skin, 40, 10, scale, size=(int(12 * scale), int(14 * scale))),
           render(skin, -40, 10, scale, size=(int(12 * scale), int(14 * scale)))]
    # shift view to the head: re-render with head centered by cropping a tall render
    out = []
    for yaw, pitch in [(0, 0), (40, 10), (-40, 10), (180, 0)]:
        im = render(skin, yaw, pitch, scale, size=(int(16 * scale), int(40 * scale)))
        out.append(im.crop((0, 0, im.width, int(14 * scale))))
    W = sum(i.width for i in out)
    sheet = Image.new("RGBA", (W, out[0].height), (40, 40, 48, 255))
    x = 0
    for im in out:
        sheet.paste(im, (x, 0))
        x += im.width
    sheet.save(path)
    return path
