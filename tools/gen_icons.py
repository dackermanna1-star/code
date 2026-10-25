"""Generates the 32x32 inventory icons (with animation frames) for every Godforge item.

Run from the repository root:  python3 tools/gen_icons.py
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from pixelart import *  # noqa: E402,F401,F403

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'main', 'resources', 'assets', 'godforge', 'textures', 'item')
N = 32
FRAMES = 8


def shade_side(c, b, strength=0.12):
    """Light from the top-left: b<0 side brighter."""
    return scale(c, 1.0 - strength * (b / 4.0))


# ---------------------------------------------------------------- 1. Worldcutter
def worldcutter(f):
    img = new(N, N)
    pulse_a = 20 + (f * 6) % 44

    def px(x, y):
        a, b = diag(x, y)
        ab = abs(b)
        # pommel gem
        if 1 <= a <= 6 and ab + abs(a - 3.5) <= 3:
            return '#ffb0ff' if (b < 0 and a > 3) else ('#ff3df5' if ab + abs(a - 3.5) <= 2 else '#9c1593')
        # grip
        if 6 < a <= 15 and ab <= 1:
            if (a // 2) % 2 == 0:
                return '#e8c25a' if b <= 0 else '#a87c1e'
            return '#3b2350' if b <= 0 else '#25142f'
        # crossguard (swept wings)
        if 15 < a <= 20:
            wing = 7 if a in (17, 18) else (6 if a in (16, 19) else 4)
            if ab <= wing:
                if ab <= 1 and 16 <= a <= 19:
                    return '#d9b8ff' if b < 0 else '#8a4dff'
                t = ab / 7.0
                return lerp('#ffe9a3', '#a8781b', t * 0.7 + (0.3 if b > 0 else 0.0))
        # blade
        if 20 < a <= 61:
            hw = 3 if a < 52 else max(0, int(round(3 * (61 - a) / 9.0)))
            if ab <= hw:
                if ab == 0:
                    bright = abs(a - pulse_a) <= 2
                    return '#ffffff' if bright or (a + f) % 3 else '#9ff9ff'
                if ab == 1:
                    return '#c9a7ff' if b < 0 else '#a07ef0'
                if ab == hw:
                    return '#efe8ff' if b < 0 else '#6d5aa8'
                return '#4b3880' if b < 0 else '#2c1f52'
        # rift sparks drifting off the blade
        for k in range(3):
            sa = 30 + ((k * 11 + f * 3) % 30)
            sb = (5 if k % 2 == 0 else -5) + (1 if (f + k) % 4 < 2 else 0) * (1 if k % 2 == 0 else -1)
            if (a, b) == (sa, sb) or (a, b) == (sa + 1, sb + 1):
                return '#bffcff' if (a, b) == (sa, sb) else None
        return None

    fill_fn(img, px)
    outline(img, '#120a1f')
    return img


# ---------------------------------------------------------------- 2. Laser Beam
def laser(f):
    img = new(N, N)
    pulse = 7 + (f * 3) % 20

    def px(x, y):
        # lens
        if 29 <= x <= 31 and 11 <= y <= 17:
            core = abs(y - 14) <= 1
            glow = 0.6 + 0.4 * math.sin(f / FRAMES * 2 * math.pi)
            return lerp('#ff2a2a', '#ffe0e0', glow if core else glow * 0.4)
        # emitter head
        if 25 <= x <= 28 and 9 <= y <= 19:
            if (x, y) in ((25, 9), (25, 19)):
                return None
            if y in (9, 10):
                return '#5d6678'
            return '#2b3240' if y > 16 else '#3a4354'
        # barrel
        if 7 <= x <= 24 and 11 <= y <= 17:
            if y == 14:
                d = abs(x - pulse)
                return lerp('#ff3b3b', '#ffd2d2', 1 - min(1, d / 3)) if x >= 9 else '#2b3240'
            if y in (13, 15):
                return '#2b3240'
            if y == 11:
                return '#ffffff'
            if y == 12:
                return '#e4e9f0'
            if y == 16:
                return '#a9b2c1'
            return '#7f899a'
        # fins
        if x in (10, 13, 16, 19, 22) and 7 <= y <= 10:
            return '#c9d1dc' if y == 7 else '#5c6575'
        # rear cap
        if 3 <= x <= 6 and 12 <= y <= 16:
            if x == 4 and y == 14:
                return '#ff6060'
            return '#3a4354' if y < 15 else '#2b3240'
        # grip (slanted)
        if 17 < y <= 27:
            off = (y - 17) // 3
            if 9 - off <= x <= 13 - off:
                if x == 13 - off:
                    return '#252b37'
                if y in (20, 21) and x == 11 - off:
                    return '#ff4d4d'
                return '#4a5263' if x == 9 - off else '#3a4150'
        # trigger
        if x == 15 and 18 <= y <= 20:
            return '#2b3240'
        if y == 21 and 14 <= x <= 15:
            return '#2b3240'
        return None

    fill_fn(img, px)
    outline(img, '#11141b')
    return img


# ---------------------------------------------------------------- 3. Orb Eraser
def orb_eraser(f):
    img = new(N, N)
    cx, cy, r = 21.5, 10.5, 7.6

    def px(x, y):
        dx, dy = x + 0.5 - cx, y + 0.5 - cy
        d = math.hypot(dx, dy)
        if d <= r:
            ang = math.atan2(dy, dx) / (2 * math.pi)
            hue = ang + f / FRAMES + d * 0.025
            rn = d / r
            if math.hypot(dx + 2.6, dy + 2.6) < 1.8:
                return '#ffffff'
            v = 1.0 if rn < 0.85 else 0.75
            s = 0.25 + 0.75 * min(1, rn * 1.4)
            if rn < 0.3:
                return lerp('#ffffff', hsv(hue, 0.4, 1.0), rn / 0.3)
            return hsv(hue, s, v)
        a, b = diag(x, y)
        ab = abs(b)
        # prongs gripping the orb
        if 33 <= a <= 40 and 3 <= ab <= 4 and d > r:
            return '#fff1c2' if b < 0 else '#c49a2c'
        # staff
        if a <= 34 and ab <= 1 and a >= 1:
            if a in (10, 11, 22, 23, 32, 33):
                return '#ffd75e' if b <= 0 else '#b8860b'
            if a <= 3:
                return '#ff7ad9' if b <= 0 else '#a8378c'
            return '#fff8e6' if b < 0 else ('#efe1b8' if b == 0 else '#c7b07a')
        # sparkles
        for k in range(4):
            ang = k * math.pi / 2 + f * math.pi / 8
            sx = int(round(cx + math.cos(ang) * (r + 2.5)))
            sy = int(round(cy + math.sin(ang) * (r + 2.5)))
            if (x, y) == (sx, sy):
                return hsv(k / 4 + f / 8, 0.5, 1.0)
        return None

    fill_fn(img, px)
    outline(img, '#1c1530')
    return img


# ---------------------------------------------------------------- 4. Asteroid Gun
def asteroid_gun(f):
    img = new(N, N)
    glow = 0.5 + 0.5 * math.sin(f / FRAMES * 2 * math.pi)

    def px(x, y):
        # muzzle
        if 28 <= x <= 31 and 9 <= y <= 19:
            if 30 <= x and 12 <= y <= 16:
                return lerp('#ff7a00', '#ffd27a', glow)
            return '#23262b' if x == 31 else '#353a42'
        # barrel
        if 10 <= x <= 27 and 10 <= y <= 18:
            if 21 <= x <= 26 and 12 <= y <= 16:
                # chamber with glowing asteroid
                if (x + y) % 3 == 0 or (x == 23 and y == 14):
                    return lerp('#ff8a1f', '#ffe08a', glow)
                return '#6b4a33' if (x * 7 + y * 3) % 5 else '#4a3222'
            if 13 <= x <= 19 and 11 <= y <= 17:
                return '#ff9a1f' if ((x + y) // 2) % 2 == 0 else '#1b1d21'
            if y == 10:
                return '#8f97a3'
            if y == 11:
                return '#6f7783'
            if y >= 17:
                return '#2c3036'
            return '#4a4f58'
        # scope
        if 13 <= x <= 22 and 6 <= y <= 9:
            if x == 22 and 7 <= y <= 8:
                return '#ff2b2b'
            if y == 9 and x in (14, 21):
                return '#2a2d33'
            if y == 9:
                return None
            return '#3a3f47' if y > 6 else '#6f7783'
        # stock
        if 2 <= x <= 9 and 12 <= y <= 17:
            if x == 2 and y in (12, 17):
                return None
            if y == 12:
                return '#ff9a1f'
            return '#3b3f46' if y < 16 else '#26292e'
        # grip
        if 18 < y <= 26:
            off = (y - 18) // 3
            if 11 - off <= x <= 14 - off:
                return '#2f333a' if x > 11 - off else '#4a4f58'
        return None

    fill_fn(img, px)
    outline(img, '#101215')
    return img


# ---------------------------------------------------------------- 5. Black Hole
def black_hole(f):
    img = new(N, N)
    cx, cy = 21.5, 10.5
    tilt = math.radians(-28)

    def disk(x, y):
        dx, dy = x + 0.5 - cx, y + 0.5 - cy
        rx = dx * math.cos(tilt) + dy * math.sin(tilt)
        ry = -dx * math.sin(tilt) + dy * math.cos(tilt)
        e = math.hypot(rx / 10.0, ry / 3.2)
        return e, rx, ry

    def px(x, y):
        dx, dy = x + 0.5 - cx, y + 0.5 - cy
        d = math.hypot(dx, dy)
        e, rx, ry = disk(x, y)
        in_disk = 0.42 <= e <= 1.0
        front = ry > 0
        horizon = d <= 4.6
        if in_disk and (front or not horizon):
            ang = math.atan2(ry, rx)
            clump = 0.5 + 0.5 * math.cos(ang * 3 - f / FRAMES * 2 * math.pi)
            t = (e - 0.42) / 0.58
            col = ramp([(0, '#ffffff'), (0.25, '#ffe9a8'), (0.55, '#ff9d2e'), (1.0, '#a3260f')], t)
            return lerp(col, '#ffffff', clump * 0.35 * (1 - t))
        if horizon:
            if d > 4.0:
                return '#ffe6c2'  # photon ring
            return '#000000' if d < 3.2 else '#140a24'
        a, b = diag(x, y)
        ab = abs(b)
        if 33 <= a <= 38 and 3 <= ab <= 4:
            return '#6a4c93' if b < 0 else '#3b2756'
        if 1 <= a <= 33 and ab <= 1:
            if a in (8, 16, 24) and b == 0:
                return lerp('#7a3dff', '#d6b8ff', 0.5 + 0.5 * math.sin((f + a) / FRAMES * 2 * math.pi))
            if a <= 3:
                return '#7a3dff'
            return '#3a2a52' if b < 0 else ('#2a1d3a' if b == 0 else '#1b1226')
        return None

    fill_fn(img, px)
    outline(img, '#0a0612')
    return img


# ---------------------------------------------------------------- 6. Reality Breaker
CRACKS = None


def reality_head(a, b):
    """Warhammer head: a fractured crystal block lying across the haft (long along b)."""
    da = abs(a - 46)
    return da <= 6 and abs(b) <= 12 and da + abs(b) <= 15


def reality_breaker(f):
    global CRACKS
    img = new(N, N)
    if CRACKS is None:
        rng = random_state
        CRACKS = set()
        # fractures run from the core out to both striking faces, with a few side branches
        for sign in (-1, 1):
            a, b = 46, 4 * sign
            for _ in range(9):
                if reality_head(a, b):
                    CRACKS.add((a, b))
                a += rng.choice([-1, 1])
                b += sign
        for start in [(43, -7), (49, 7)]:
            a, b = start
            for _ in range(3):
                CRACKS.add((a, b))
                a += rng.choice([-1, 1])
                b += rng.choice([-1, 1])
    pulse = (f % FRAMES) / FRAMES

    def px(x, y):
        a, b = diag(x, y)
        ab = abs(b)
        da = a - 46
        if reality_head(a, b):
            core = abs(da) + ab <= 4
            if core:
                if abs(da) + ab <= 1:
                    return '#ffffff'
                glow = 0.5 + 0.5 * math.sin((pulse + ab * 0.08) * 2 * math.pi)
                return lerp('#ff4df0', '#ffd6fb', glow) if (b <= 0 or da > 0) else lerp('#b81fd0', '#ff7cf5', glow)
            if (a, b) in CRACKS:
                return lerp('#ff7cf5', '#ffffff', 0.5 + 0.5 * math.sin((pulse + ab * 0.06) * 2 * math.pi))
            edge = not reality_head(a - 2, b) or not reality_head(a + 2, b) or not reality_head(a, b - 2) or not reality_head(a, b + 2)
            if edge:
                return '#e2b0ff' if (b < 0 or da > 0) else '#3e1466'
            if ab >= 10:
                # striking faces: raw crystal
                facet = ((a - b) // 3) % 2
                return ('#b56cff' if facet else '#9b45e0') if b < 0 else ('#7a2fb8' if facet else '#6a23a3')
            # banded body around the core
            if abs(da) == 4:
                return '#6cf6ff' if b < 0 else '#2fa9c4'
            facet = ((a + b) // 4) % 2
            return ('#8d3ad6' if facet else '#7a2fb8') if b < 0 else ('#5b1d92' if facet else '#4a1778')
        if 1 <= a <= 40 and ab <= 1:
            if b == 0 and a % 8 == 4:
                return lerp('#4ff1ff', '#d5fdff', 0.5 + 0.5 * math.sin((pulse + a / 40) * 2 * math.pi))
            if a <= 3:
                return '#9b45e0'
            if 35 <= a <= 40:
                return '#7a2fb8' if b <= 0 else '#4a1778'
            return '#4c566a' if b < 0 else ('#3b4252' if b == 0 else '#2e3440')
        # shards of broken space drifting off the faces
        shards = [(34, -14), (38, 16), (56, -2), (30, 10)]
        for i, (sa, sb) in enumerate(shards):
            bob = 1 if (f + i * 2) % 8 < 4 else 0
            if (a, b) in ((sa + bob, sb + bob), (sa + 1 + bob, sb + 1 + bob)):
                return '#7cf8ff' if i % 2 else '#ff9cf7'
        return None

    fill_fn(img, px)
    outline(img, '#14081f')
    return img


# ---------------------------------------------------------------- 7. Starfall Bow
def _circle_through(p1, p2, p3):
    ax, ay = p1
    bx, by = p2
    cx, cy = p3
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
    uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
    return ux, uy, math.hypot(ax - ux, ay - uy)


def starfall_bow(f, pull):
    img = new(N, N)
    t1, t2 = (5.0, 3.0), (29.0, 27.0)
    apex = (24.0, 8.0)
    ux, uy, rad = _circle_through(t1, apex, t2)
    a1 = math.atan2(t1[1] - uy, t1[0] - ux)
    a2 = math.atan2(t2[1] - uy, t2[0] - ux)
    # string pull point
    mx, my = (t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2
    pdist = [0, 3.5, 6.0, 8.0][pull]
    px_, py_ = mx - pdist * 0.7071, my + pdist * 0.7071
    shimmer = f / FRAMES

    def on_arc(x, y):
        ang = math.atan2(y - uy, x - ux)

        def between(an):
            lo, hi = sorted((a1, a2))
            return lo <= an <= hi

        if not between(ang):
            return None
        span = abs(a2 - a1)
        t = abs(ang - a1) / span
        thick = 1.3 + 1.6 * math.sin(t * math.pi)
        d = math.hypot(x - ux, y - uy) - rad
        if abs(d) <= thick:
            return t, d, thick
        return None

    def seg_dist(x, y, p, q):
        vx, vy = q[0] - p[0], q[1] - p[1]
        wx, wy = x - p[0], y - p[1]
        tt = max(0, min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
        return math.hypot(x - (p[0] + tt * vx), y - (p[1] + tt * vy)), tt

    def px(x, y):
        X, Y = x + 0.5, y + 0.5
        # star tips
        for tip in (t1, t2):
            if abs(X - tip[0]) + abs(Y - tip[1]) <= 1.6:
                return '#fff6c8'
        if abs(X - apex[0]) + abs(Y - apex[1]) <= 2.2:
            return '#ffffff' if abs(X - apex[0]) + abs(Y - apex[1]) <= 1 else '#ffd25a'
        arc = on_arc(X, Y)
        if arc:
            t, d, thick = arc
            if d > thick - 1.0:
                return '#ffd25a'  # gold outer trim
            star = (int(t * 20) % 5 == 0) and abs(d) < 0.6
            if star:
                return '#bfe3ff'
            return '#2f47a8' if d > -0.4 else '#1b2a6b'
        # arrow (glowing star bolt)
        if pull > 0:
            head = (px_ + 11 * 0.7071, py_ - 11 * 0.7071)
            dd, tt = seg_dist(X, Y, (px_, py_), head)
            if math.hypot(X - head[0], Y - head[1]) <= 1.8:
                return '#ffffff'
            if abs(X - head[0]) <= 0.6 and abs(Y - head[1]) <= 3.2 or abs(Y - head[1]) <= 0.6 and abs(X - head[0]) <= 3.2:
                return '#ffe680'
            if dd <= 0.75:
                return lerp('#7fb8ff', '#fff6c8', tt)
        # string
        for p, q in (((t1[0], t1[1]), (px_, py_)), ((px_, py_), (t2[0], t2[1]))):
            dd, tt = seg_dist(X, Y, p, q)
            if dd <= 0.55:
                return lerp('#cfe9ff', '#ffffff', 0.5 + 0.5 * math.sin((tt + shimmer) * 2 * math.pi))
        return None

    fill_fn(img, px)
    outline(img, '#0a0f2a')
    return img


# ---------------------------------------------------------------- 8. Godfist
def godfist(f):
    img = new(N, N)
    pulse = 0.5 + 0.5 * math.sin(f / FRAMES * 2 * math.pi)
    cyan = lerp('#2fd6ff', '#d9fbff', pulse)

    def px(x, y):
        # cuff
        if 9 <= x <= 22 and 23 <= y <= 30:
            if y in (23, 30):
                return '#fff3c4'
            if 14 <= x <= 17 and 25 <= y <= 28:
                return cyan if (x in (15, 16) and y in (26, 27)) else '#1d6f8a'
            return '#d9a520' if x < 16 else '#b5851a'
        # fist body
        if 5 <= x <= 26 and 6 <= y <= 22:
            if (x, y) in ((5, 6), (26, 6), (5, 22), (26, 22), (5, 7), (26, 7)):
                return None
            # knuckle row
            if y <= 11:
                seg = (x - 5) // 5.5
                local = (x - 5) - seg * 5.5
                if local < 0.8:
                    return cyan  # energy seams between knuckles
                if y == 6:
                    return '#fff8dc'
                if y == 7:
                    return '#ffe9a0'
                return '#f0c43c' if y < 10 else '#c99a1e'
            # thumb across the front
            if 15 <= y <= 19 and 7 <= x <= 20 - (y - 15):
                if y == 15:
                    return '#fff3c4'
                return '#e8b830' if y < 18 else '#a87914'
            if y == 12 or y == 13:
                return cyan if (x % 6 == 2) else '#9c7313'
            return '#d9a520' if x < 16 else '#b5851a'
        # kinetic glow above knuckles
        if y == 4 and x in (8, 13, 19, 24) and pulse > 0.4:
            return '#bff6ff'
        return None

    fill_fn(img, px)
    outline(img, '#2a1d02')
    return img


# ---------------------------------------------------------------- 9. Sunforge
def sunforge(f):
    img = new(N, N)
    cx, cy, r = 21.5, 10.5, 6.2
    rng = np.random.default_rng(7)
    flares = rng.random((FRAMES, 16))

    def px(x, y):
        dx, dy = x + 0.5 - cx, y + 0.5 - cy
        d = math.hypot(dx, dy)
        if d <= r:
            t = d / r
            return ramp([(0, '#ffffff'), (0.35, '#fff6b0'), (0.7, '#ffd23a'), (1.0, '#ff8a12')], t)
        ang = (math.atan2(dy, dx) / (2 * math.pi)) % 1.0
        idx = int(ang * 16) % 16
        flare_len = 1.0 + 2.6 * flares[f % FRAMES][idx]
        if d <= r + flare_len:
            t = (d - r) / flare_len
            return lerp('#ff6a14', '#c4200a', t)
        a, b = diag(x, y)
        ab = abs(b)
        if 32 <= a <= 38 and 3 <= ab <= 5 and d > r:
            return '#ffe27a' if b < 0 else '#b8860b'
        if 1 <= a <= 33 and ab <= 1:
            if a in (12, 13, 24, 25):
                return '#ff5a1a' if b <= 0 else '#a8320a'
            if a <= 3:
                return '#ffb02e'
            return '#ffe27a' if b < 0 else ('#ffd04a' if b == 0 else '#b8860b')
        return None

    fill_fn(img, px)
    outline(img, '#2b1200')
    return img


# ---------------------------------------------------------------- 10. Planet Cracker
def planet_cracker(f):
    img = new(N, N)
    wave = (f * 5) % 46

    def px(x, y):
        a, b = diag(x, y)
        ab = abs(b)
        # muzzle
        if 55 <= a <= 61 and ab <= 5:
            if ab <= 1 and a >= 59:
                return '#c9ffd9'
            if ab <= 2 and a >= 58:
                return '#3dff7a'
            return '#2a2f36' if b >= 0 else '#454c56'
        # barrel with energy coils
        if 14 <= a < 55 and ab <= 4:
            if a in (22, 23, 30, 31, 38, 39, 46, 47):
                hot = abs((a - 14) - wave) <= 4
                return '#c9ffd9' if hot and ab <= 2 else ('#3dff7a' if ab <= 3 else '#1f8f45')
            if b == 0:
                return lerp('#1f8f45', '#7dffa8', 1 - min(1, abs((a - 14) - wave) / 6))
            if b < 0:
                return '#8a95a3' if b == -4 else '#5d6670'
            return '#343a42' if b == 4 else '#464e58'
        if 18 <= a <= 50 and ab == 5 and a % 8 in (6, 7):
            return '#3dff7a'
        # stock / power pack
        if 1 <= a < 14 and ab <= 3:
            if (a, b) in ((9, -3), (10, -2)):
                return '#ff2a2a'
            if a <= 3:
                return '#3dff7a' if ab <= 1 else '#22262c'
            return '#4a525c' if b < 0 else '#2f343c'
        # under-grip
        if 22 <= a <= 28 and 5 <= b <= 9:
            return '#2f343c' if b > 6 else '#3e454f'
        return None

    fill_fn(img, px)
    outline(img, '#0b0d10')
    return img


# ---------------------------------------------------------------- Divine Core
def divine_core(f):
    img = new(N, N)
    cx, cy = 15.5, 15.5

    def px(x, y):
        dx, dy = x + 0.5 - cx, y + 0.5 - cy
        dia = abs(dx) / 9.5 + abs(dy) / 13.0
        if dia <= 1.0:
            ang = math.atan2(dy, dx) / (2 * math.pi)
            if dia < 0.35:
                return lerp('#ffffff', hsv(f / FRAMES, 0.35, 1.0), dia / 0.35)
            facet = ((1 if dx > 0 else 0) + (2 if dy > 0 else 0))
            base = hsv(ang + f / FRAMES, 0.65, [1.0, 0.85, 0.75, 0.6][facet])
            if dia > 0.86:
                return scale(base, 0.75)
            return base
        # orbiting sparks
        for k in range(3):
            ang = k * 2 * math.pi / 3 + f * math.pi / 4
            sx = int(round(cx + math.cos(ang) * 12.5))
            sy = int(round(cy + math.sin(ang) * 6.0))
            if (x, y) == (sx, sy):
                return '#fff6c8'
        return None

    fill_fn(img, px)
    outline(img, '#1a1030')
    return img


def main():
    sheet = []

    def emit(name, fn, frametime=2, interpolate=False):
        frames = [fn(i) for i in range(FRAMES)]
        save_anim(frames, os.path.join(OUT, name + '.png'), frametime=frametime, interpolate=interpolate)
        sheet.append(frames[0])
        sheet.append(frames[FRAMES // 2])

    emit('worldcutter', worldcutter)
    emit('laser_beam', laser)
    emit('orb_eraser', orb_eraser, frametime=3)
    emit('asteroid_gun', asteroid_gun, frametime=3)
    emit('black_hole', black_hole, frametime=2)
    emit('reality_breaker', reality_breaker, frametime=3)
    for pull in range(4):
        name = 'starfall_bow' if pull == 0 else 'starfall_bow_pulling_%d' % (pull - 1)
        emit(name, lambda f, p=pull: starfall_bow(f, p), frametime=3)
    emit('godfist', godfist, frametime=3)
    emit('sunforge', sunforge, frametime=2)
    emit('planet_cracker', planet_cracker, frametime=2)
    emit('divine_core', divine_core, frametime=3)
    contact_sheet(sheet, os.path.join(os.path.dirname(__file__), '..', 'build', 'icon_sheet.png'), factor=8, cols=6)
    print('icons written')


if __name__ == '__main__':
    main()
