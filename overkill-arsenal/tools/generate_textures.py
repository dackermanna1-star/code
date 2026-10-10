#!/usr/bin/env python3
"""
Procedurally draws every texture in Overkill Arsenal (weapons, blocks, particles, icon).

Run from the project root:  python3 tools/generate_textures.py
Requires Pillow. Output goes to src/main/resources/assets/overkill/textures (and icon.png).
The weapon sprites are 32x32 pixel art built from shaded parts; guns are drawn with the muzzle at
the top-left (matching their custom hand transforms), melee weapons like swords (tip top-right).
"""
import math
import os
import random

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'main', 'resources', 'assets', 'overkill')
TEX = os.path.join(ROOT, 'textures')


def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(4))


def darken(c, f):
    return (int(c[0] * f), int(c[1] * f), int(c[2] * f), c[3])


def save(img, *path):
    full = os.path.join(TEX, *path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    img.save(full)


# ----------------------------------------------------------------------------------------------
# Sprite toolkit
# ----------------------------------------------------------------------------------------------

class Part:
    """A shaded region: mid colour fill, light top-left rim, dark bottom-right rim."""

    def __init__(self, palette, light_dir=(-1, -1)):
        self.pixels = set()
        self.light, self.mid, self.dark = palette
        self.light_dir = light_dir
        self.overrides = {}

    def add(self, x, y):
        self.pixels.add((x, y))

    def paint(self, x, y, color):
        """Fixed colour that ignores shading (glows, details)."""
        self.pixels.add((x, y))
        self.overrides[(x, y)] = color

    def render(self, sprite):
        lx, ly = self.light_dir
        for (x, y) in self.pixels:
            if (x, y) in self.overrides:
                sprite.set(x, y, self.overrides[(x, y)])
                continue
            lit = (x + lx, y + ly) not in self.pixels
            shadow = (x - lx, y - ly) not in self.pixels
            if lit and not shadow:
                c = self.light
            elif shadow and not lit:
                c = self.dark
            else:
                c = self.mid
            sprite.set(x, y, c)


class Sprite:
    def __init__(self, w=32, h=32):
        self.w, self.h = w, h
        self.px = {}

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            if c is None:
                self.px.pop((x, y), None)
            else:
                self.px[(x, y)] = c

    def get(self, x, y):
        return self.px.get((x, y))

    def outline(self, factor=0.38, keep=()):
        """Darkened copy of the neighbour colour around the silhouette (vanilla-style outline)."""
        additions = {}
        for y in range(self.h):
            for x in range(self.w):
                if (x, y) in self.px:
                    continue
                neighbours = [self.px.get(p) for p in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))]
                neighbours = [n for n in neighbours if n is not None and n[3] == 255 and n not in keep]
                if neighbours:
                    base = min(neighbours, key=lambda c: c[0] + c[1] + c[2])
                    additions[(x, y)] = darken(base, factor)
        self.px.update(additions)

    def image(self):
        img = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        for (x, y), c in self.px.items():
            img.putpixel((x, y), c)
        return img


class Frame:
    """Maps gun-local coordinates (u along the weapon, v across it) to texture pixels."""

    def __init__(self, start, end):
        self.sx, self.sy = start
        dx, dy = end[0] - start[0], end[1] - start[1]
        self.length = math.hypot(dx, dy)
        self.ax, self.ay = dx / self.length, dy / self.length
        # "top" of the weapon: perpendicular to the axis; for guns (muzzle top-left) this is up-right
        self.tx, self.ty = -self.ay, self.ax

    def to_uv(self, x, y):
        px, py = x + 0.5 - self.sx, y + 0.5 - self.sy
        return px * self.ax + py * self.ay, px * self.tx + py * self.ty

    def to_xy(self, u, v):
        return self.sx + u * self.ax + v * self.tx, self.sy + u * self.ay + v * self.ty

    def fill(self, part, inside, w=32, h=32):
        for y in range(h):
            for x in range(w):
                u, v = self.to_uv(x, y)
                if inside(u, v):
                    part.add(x, y)


def poly_inside(points):
    def inside(u, v):
        n = len(points)
        result = False
        j = n - 1
        for i in range(n):
            ui, vi = points[i]
            uj, vj = points[j]
            if (vi > v) != (vj > v) and u < (uj - ui) * (v - vi) / (vj - vi + 1e-12) + ui:
                result = not result
            j = i
        return result
    return inside


def rect(u0, u1, v0, v1):
    return lambda u, v: u0 <= u <= u1 and v0 <= v <= v1


def disc_inside(cu, cv, r):
    return lambda u, v: (u - cu) ** 2 + (v - cv) ** 2 <= r * r


def xy_poly_part(part, pts, w=32, h=32):
    inside = poly_inside(pts)
    for y in range(h):
        for x in range(w):
            if inside(x + 0.5, y + 0.5):
                part.add(x, y)


def draw_line(points_set, x0, y0, x1, y1):
    steps = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
    for i in range(steps + 1):
        t = i / steps
        points_set.add((int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))))


# ----------------------------------------------------------------------------------------------
# Palettes
# ----------------------------------------------------------------------------------------------

IVORY = (hexc('FBF3DA'), hexc('E2D3A6'), hexc('A99566'))
GOLD = (hexc('FFE58A'), hexc('E8B53A'), hexc('9A6A16'))
DARK_METAL = (hexc('6B6F7A'), hexc('464953'), hexc('25272D'))
GUNMETAL = (hexc('8E9AAE'), hexc('5B6577'), hexc('2E333E'))
STEEL = (hexc('DDE5EE'), hexc('9BA8B8'), hexc('56616F'))
COPPER = (hexc('F2A36B'), hexc('C66F38'), hexc('7E3D1B'))
OBSIDIAN = (hexc('4A3D5C'), hexc('2B2236'), hexc('151019'))
PURPLE_TRIM = (hexc('E2C4FF'), hexc('A66BFF'), hexc('5F2FA8'))
SHAFT = (hexc('5A4470'), hexc('3A2B4C'), hexc('1D1526'))
SILVER = (hexc('F0F2F8'), hexc('B4BACA'), hexc('6A7082'))
BLADE = (hexc('4A3866'), hexc('2A1D3D'), hexc('120B1C'))

SUN_GLOW = [hexc('FFFFFF'), hexc('FFF3A6'), hexc('FFC43D'), hexc('FF8A1F')]
CYAN_GLOW = [hexc('F2FFFF'), hexc('9EF1FF'), hexc('3FD0FF'), hexc('1C86C9')]
VOID_GLOW = [hexc('FBEFFF'), hexc('E0B0FF'), hexc('B06BFF'), hexc('6A2BC4')]


# ----------------------------------------------------------------------------------------------
# Weapons
# ----------------------------------------------------------------------------------------------

def sunline_rifle(cooling=False):
    s = Sprite()
    f = Frame((30.5, 30.5), (1.5, 1.5))  # stock -> muzzle; muzzle top-left, top side up-right
    stock = Part(IVORY)
    f.fill(stock, poly_inside([(0.0, -4.5), (0.0, 2.8), (3.0, 3.4), (10.0, 2.2), (10.0, -2.4), (4.0, -5.0)]))
    butt = Part(GOLD)
    f.fill(butt, rect(0.0, 1.3, -4.6, 2.9))
    grip = Part(DARK_METAL)
    f.fill(grip, poly_inside([(10.5, -1.5), (14.5, -1.5), (13.2, -8.0), (9.8, -8.4)]))
    body = Part(IVORY)
    f.fill(body, poly_inside([(9.0, -3.2), (24.0, -2.8), (25.5, -1.6), (25.5, 2.0), (23.0, 3.4), (9.5, 3.6)]))
    trim = Part(GOLD)
    f.fill(trim, lambda u, v: (9.0 <= u <= 25.0 and -3.4 <= v <= -2.3) or (10.0 <= u <= 11.3 and -3.0 <= v <= 3.6))
    mounts = Part(DARK_METAL)
    f.fill(mounts, lambda u, v: (abs(u - 15.0) <= 0.6 or abs(u - 20.5) <= 0.6) and 3.0 <= v <= 4.0)
    scope = Part(DARK_METAL)
    f.fill(scope, poly_inside([(13.0, 3.8), (22.5, 3.8), (23.2, 4.6), (23.2, 5.9), (22.5, 6.4), (13.0, 6.2)]))
    barrel = Part(IVORY)
    f.fill(barrel, rect(25.0, 37.2, -1.6, 1.6))
    rail = Part(GOLD)
    f.fill(rail, rect(26.0, 34.0, -2.5, -1.5))
    rings = Part(GOLD)
    f.fill(rings, lambda u, v: any(abs(u - c) <= 0.65 for c in (28.0, 31.5, 35.0)) and abs(v) <= 2.2)
    fins = Part(GOLD)
    f.fill(fins, lambda u, v: 34.0 <= u <= 38.6 and 1.5 <= abs(v) <= 3.5 and (u - 34.0) * 0.55 > abs(v) - 1.6)
    emitter = Part(DARK_METAL)
    f.fill(emitter, rect(37.0, 40.2, -2.1, 2.1))

    for part in (stock, butt, grip, body, trim, mounts, scope, barrel, rail, rings, fins, emitter):
        part.render(s)

    cell = SUN_GLOW if not cooling else [hexc('B88A4A'), hexc('8A6436'), hexc('6A4A26'), hexc('4A321A')]
    for y in range(32):
        for x in range(32):
            u, v = f.to_uv(x, y)
            if 13.0 <= u <= 22.5 and -1.1 <= v <= 1.7:
                t = abs(v - 0.3) / 1.4
                s.set(x, y, cell[0] if t < 0.3 else cell[1] if t < 0.7 else cell[2])
            elif 25.5 <= u <= 37.0 and abs(v) <= 0.55:
                if not cooling:
                    s.set(x, y, cell[1] if (int(u) % 3) else cell[0])
            elif 38.4 <= u <= 40.3 and abs(v) <= 1.2:
                s.set(x, y, cell[0] if not cooling else cell[3])
            elif 22.4 <= u <= 23.3 and 4.4 <= v <= 6.0:
                s.set(x, y, hexc('9FE9FF'))
    s.outline()
    return s.image()


def worldbreaker(stage=0):
    s = Sprite()
    f = Frame((30.5, 30.5), (1.5, 1.5))
    counter = Part(GUNMETAL)
    f.fill(counter, poly_inside([(0.0, -4.5), (0.0, 4.5), (2.0, 5.8), (8.0, 6.0), (8.0, -5.5), (2.0, -5.4)]))
    grip = Part(DARK_METAL)
    f.fill(grip, poly_inside([(9.0, -5.0), (13.0, -5.0), (12.2, -10.6), (8.6, -11.0)]))
    body = Part(GUNMETAL)
    f.fill(body, poly_inside([(7.0, -6.0), (25.0, -5.2), (26.0, -3.8), (26.0, 4.2), (25.0, 5.6), (7.0, 6.2)]))
    handle = Part(STEEL)
    f.fill(handle, lambda u, v: 10.0 <= u <= 21.0 and 6.0 <= v <= 8.4 and not (12.0 <= u <= 19.0 and 6.6 <= v <= 7.5))
    coils = Part(STEEL)
    f.fill(coils, lambda u, v: any(abs(u - c) <= 0.85 for c in (11.0, 15.5, 20.0)) and abs(v) <= 6.8)
    neck = Part(GUNMETAL)
    f.fill(neck, rect(25.5, 29.8, -3.6, 3.6))
    claws = Part(STEEL)
    f.fill(claws, lambda u, v: (29.0 <= u <= 35.5 and 3.0 <= abs(v) <= 6.8 - (u - 29.0) * 0.4)
           or (34.5 <= u <= 38.4 and 2.2 <= abs(v) <= 4.4 - (u - 34.5) * 0.45))
    for part in (counter, grip, body, handle, coils, neck, claws):
        part.render(s)

    glow_on = stage > 0
    for y in range(32):
        for x in range(32):
            u, v = f.to_uv(x, y)
            if any(abs(u - c) <= 0.35 for c in (11.0, 15.5, 20.0)) and abs(v) <= 5.6:
                s.set(x, y, CYAN_GLOW[1] if glow_on else CYAN_GLOW[3])
            if 8.0 <= u <= 25.5 and abs(v) <= 0.6:
                s.set(x, y, CYAN_GLOW[2] if glow_on else hexc('2B5A78'))
    radius = [2.6, 3.4, 4.2, 5.0][stage]
    cu, cv = 34.4, 0.0
    for y in range(32):
        for x in range(32):
            u, v = f.to_uv(x, y)
            d = math.hypot(u - cu, v - cv)
            if d <= radius:
                t = d / radius
                if stage == 0:
                    c = CYAN_GLOW[1] if t < 0.4 else CYAN_GLOW[2] if t < 0.78 else CYAN_GLOW[3]
                else:
                    c = CYAN_GLOW[0] if t < 0.45 else CYAN_GLOW[1] if t < 0.8 else CYAN_GLOW[2]
                s.set(x, y, c)
    s.outline(keep=tuple(CYAN_GLOW))
    if stage >= 2:
        for y in range(32):
            for x in range(32):
                u, v = f.to_uv(x, y)
                d = math.hypot(u - cu, v - cv)
                if radius < d <= radius + (1.5 if stage == 3 else 1.0) and s.get(x, y) is None:
                    s.set(x, y, hexc('3FD0FF', 120 if stage == 3 else 80))
    return s.image()


def gravemaker(loaded=True):
    s = Sprite()
    f = Frame((30.5, 30.5), (1.5, 1.5))
    stock = Part(OBSIDIAN)
    f.fill(stock, poly_inside([(0.0, -4.0), (0.0, 3.0), (3.0, 3.8), (9.5, 2.8), (9.5, -3.2), (3.0, -4.6)]))
    grip = Part(OBSIDIAN)
    f.fill(grip, poly_inside([(10.0, -2.0), (14.0, -2.0), (13.0, -8.2), (9.6, -8.6)]))
    body = Part(OBSIDIAN)
    f.fill(body, poly_inside([(8.0, -3.8), (23.0, -3.4), (23.5, 3.8), (21.0, 4.6), (8.0, 4.2)]))
    sight = Part(PURPLE_TRIM)
    f.fill(sight, poly_inside([(12.0, 4.0), (19.5, 4.0), (17.5, 6.6), (13.2, 6.6)]))
    trim = Part(PURPLE_TRIM)
    f.fill(trim, lambda u, v: (0.0 <= u <= 9.5 and -4.6 <= v <= -3.7) or (9.0 <= u <= 10.2 and abs(v) <= 4.0)
           or (8.0 <= u <= 23.0 and -3.9 <= v <= -3.0))
    barrel = Part(OBSIDIAN)
    f.fill(barrel, rect(23.0, 31.0, -2.4, 2.4))
    rings = Part(PURPLE_TRIM)
    f.fill(rings, lambda u, v: any(abs(u - c) <= 0.65 for c in (25.5, 28.5)) and abs(v) <= 3.0)
    bell = Part(OBSIDIAN)
    f.fill(bell, lambda u, v: 30.5 <= u <= 37.0 and abs(v) <= 2.8 + (u - 30.5) * 0.55)
    for part in (stock, grip, body, sight, trim, barrel, rings, bell):
        part.render(s)
    for y in range(32):
        for x in range(32):
            u, v = f.to_uv(x, y)
            if 12.0 <= u <= 21.0 and -1.2 <= v <= 2.2 and int(u) % 2 == 0:
                s.set(x, y, VOID_GLOW[2])
            if 32.0 <= u <= 37.0 and abs(v) <= 1.3 + (u - 32.0) * 0.55:
                s.set(x, y, hexc('0A060E') if loaded else VOID_GLOW[3])
    keep = [hexc('FFB45A'), hexc('FF7A2A')]
    if loaded:
        cu, cv, r = 37.4, 0.0, 3.3
        for y in range(32):
            for x in range(32):
                u, v = f.to_uv(x, y)
                d = math.hypot(u - cu, v - cv)
                if d <= r:
                    rim = d >= r - 1.0
                    s.set(x, y, hexc('050308') if not rim else VOID_GLOW[1] if (v - cv) > 0 else VOID_GLOW[2])
        for i in range(64):
            a = i / 64 * math.tau
            u = cu + math.cos(a) * 1.4
            v = cv + math.sin(a) * 5.2
            x, y = f.to_xy(u, v)
            x, y = int(x), int(y)
            front = math.cos(a) > 0
            if front or s.get(x, y) is None:
                s.set(x, y, keep[0] if front else keep[1])
    s.outline(keep=tuple(keep))
    return s.image()


def riftfang():
    s = Sprite()
    shaft = Part(SHAFT, light_dir=(-1, 0))
    pts = set()
    for w in (-0.6, 0.0, 0.6):
        draw_line(pts, 3.5 + w, 28.5 + w, 23.5 + w, 8.5 + w)
    for p in pts:
        shaft.add(*p)
    bindings = Part(SILVER)
    for t in (0.12, 0.42, 0.7):
        bx, by = 3.5 + 20 * t, 28.5 - 20 * t
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if abs(dx + dy) <= 1:
                    bindings.add(int(bx + dx), int(by + dy))
    pommel = Part(SILVER)
    for p in ((2, 29), (1, 30), (3, 30), (2, 30), (1, 31)):
        pommel.add(*p)
    blade = Part(BLADE)
    outer = [(26.5, 4.5), (24.0, 2.2), (20.0, 1.0), (15.0, 1.2), (10.5, 2.8), (6.8, 5.6), (4.0, 9.4), (2.4, 14.0)]
    inner = [(2.4, 14.0), (5.6, 10.6), (9.2, 8.0), (13.2, 6.2), (17.5, 5.6), (21.5, 6.2), (24.5, 8.2)]
    xy_poly_part(blade, outer + inner)
    collar = Part(SILVER)
    xy_poly_part(collar, [(21.0, 5.0), (25.5, 4.0), (27.5, 7.0), (25.0, 10.5), (21.0, 9.0)])
    for part in (shaft, bindings, pommel, blade, collar):
        part.render(s)
    # Glowing cutting edge along the inner arc and a rift crack through the blade.
    edge = set()
    for i in range(len(inner) - 1):
        draw_line(edge, inner[i][0], inner[i][1] - 0.4, inner[i + 1][0], inner[i + 1][1] - 0.4)
    for (x, y) in edge:
        if s.get(x, y) is not None:
            s.set(x, y, VOID_GLOW[1])
    crack = set()
    draw_line(crack, 21.0, 3.0, 16.0, 4.0)
    draw_line(crack, 16.0, 4.0, 12.5, 3.6)
    draw_line(crack, 12.5, 3.6, 8.5, 6.0)
    for (x, y) in crack:
        if s.get(x, y) is not None:
            s.set(x, y, VOID_GLOW[2])
    s.set(23, 7, VOID_GLOW[0])
    s.set(24, 7, VOID_GLOW[1])
    s.set(23, 6, VOID_GLOW[2])
    s.outline(keep=tuple(VOID_GLOW))
    return s.image()


def stormcaller(level=0):
    s = Sprite()
    cuff = Part(STEEL)
    xy_poly_part(cuff, [(1.5, 21.5), (6.5, 17.0), (15.0, 25.5), (10.5, 30.5)])
    arm = Part(COPPER)
    xy_poly_part(arm, [(6.0, 18.5), (13.5, 11.0), (21.0, 18.5), (13.5, 26.0)])
    bands = Part(STEEL)
    xy_poly_part(bands, [(9.0, 16.0), (10.5, 14.5), (18.0, 22.0), (16.5, 23.5)])
    fist = Part(COPPER)
    xy_poly_part(fist, [(12.5, 9.0), (18.0, 3.5), (24.5, 3.0), (29.0, 7.5), (28.5, 14.0), (23.0, 19.5), (16.0, 16.0)])
    knuckles = Part(STEEL)
    for (kx, ky) in ((19, 4), (22, 4), (25, 5), (27, 8)):
        for dx in range(-1, 2):
            for dy in range(-1, 2):
                if abs(dx) + abs(dy) <= 1:
                    knuckles.add(kx + dx, ky + dy)
    thumb = Part(COPPER)
    xy_poly_part(thumb, [(13.5, 11.5), (17.0, 9.0), (19.0, 12.5), (16.0, 15.0)])
    for part in (cuff, arm, bands, fist, thumb, knuckles):
        part.render(s)
    # lightning rods on the knuckles
    rods = [((19, 4), (17, 1)), ((22, 4), (21, 0)), ((25, 5), (26, 1)), ((27, 8), (30, 6))]
    for (a, b) in rods:
        pts = set()
        draw_line(pts, a[0], a[1], b[0], b[1])
        for p in pts:
            if p != a:
                s.set(p[0], p[1], STEEL[1])
        s.set(b[0], b[1], CYAN_GLOW[0] if level >= 2 else CYAN_GLOW[2] if level == 1 else hexc('5C7F92'))
    # core gem on the back of the hand
    gem = [hexc('2F6C82'), hexc('3FD0FF'), hexc('9EF1FF'), hexc('F2FFFF')][level]
    for (dx, dy) in ((0, 0), (1, 0), (0, 1), (1, 1), (-1, 0), (0, -1), (2, 1), (1, 2)):
        s.set(15 + dx, 19 + dy, gem if (dx, dy) != (0, 0) else mix(gem, hexc('FFFFFF'), 0.5))
    s.outline(keep=tuple(CYAN_GLOW))
    if level >= 2:
        # crackling arcs around the fist
        rng = random.Random(level * 31)
        arcs = 2 if level == 2 else 5
        for _ in range(arcs):
            x, y = rng.choice([(29, 3), (30, 10), (26, 16), (14, 4), (31, 6)])
            for _ in range(4):
                if s.get(x, y) is None:
                    s.set(x, y, CYAN_GLOW[0] if level == 3 else CYAN_GLOW[1])
                x += rng.choice((-1, 0, 1))
                y += rng.choice((-1, 0, 1))
                x = max(0, min(31, x))
                y = max(0, min(31, y))
    return s.image()


def marble(white):
    s = Sprite(16, 16)
    for y in range(16):
        for x in range(16):
            d = math.hypot(x + 0.5 - 8, y + 0.5 - 8)
            if d <= 5.2:
                if white:
                    c = mix(hexc('FFFFFF'), hexc('A8E8FF'), max(0.0, (d - 2.5) / 2.7))
                else:
                    c = hexc('06040A') if d < 3.9 else (VOID_GLOW[1] if x + y < 16 else VOID_GLOW[3])
                s.set(x, y, c)
            elif d <= 6.4:
                s.set(x, y, (hexc('9EF1FF', 150) if white else hexc('B06BFF', 140)))
    if not white:
        for i in range(48):
            a = i / 48 * math.tau
            x = int(round(8 + math.cos(a) * 6.8 - 0.5))
            y = int(round(8 + math.sin(a) * 2.2 - 0.5))
            if math.sin(a) > 0 or s.get(x, y) is None or s.get(x, y)[3] < 255:
                s.set(x, y, hexc('FFB45A') if math.cos(a) > 0 else hexc('FF7A2A'))
    else:
        s.set(6, 5, hexc('FFFFFF'))
        s.set(5, 6, hexc('FFFFFF'))
    return s.image()


# ----------------------------------------------------------------------------------------------
# Blocks
# ----------------------------------------------------------------------------------------------

def value_noise(w, h, scale, seed):
    rng = random.Random(seed)
    # grid period == texture size, so block textures tile seamlessly
    gw, gh = max(1, int(round(w / scale))), max(1, int(round(h / scale)))
    grid = [[rng.random() for _ in range(gw)] for _ in range(gh)]

    def sample(x, y):
        fx, fy = x / scale, y / scale
        x0, y0 = int(fx), int(fy)
        tx, ty = fx - x0, fy - y0
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        a = grid[y0 % gh][x0 % gw]
        b = grid[y0 % gh][(x0 + 1) % gw]
        c = grid[(y0 + 1) % gh][x0 % gw]
        d = grid[(y0 + 1) % gh][(x0 + 1) % gw]
        return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty
    return sample


def crack_set(seed, count=5):
    rng = random.Random(seed)
    cracks = set()
    for _ in range(count):
        x, y = rng.randrange(16), rng.randrange(16)
        for _ in range(rng.randint(4, 9)):
            cracks.add((x % 16, y % 16))
            x += rng.choice((-1, 0, 1, 1))
            y += rng.choice((-1, 0, 1))
    return cracks


def scorched_stone(hot):
    img = Image.new('RGBA', (16, 16))
    n1 = value_noise(16, 16, 4, 7)
    n2 = value_noise(16, 16, 2, 8)
    tones = [hexc('17141A'), hexc('241F22'), hexc('312A2A'), hexc('3F3532'), hexc('4C403A')]
    cracks = crack_set(11, 5)
    rng = random.Random(5)
    for y in range(16):
        for x in range(16):
            v = n1(x, y) * 0.7 + n2(x, y) * 0.3
            c = tones[min(4, int(v * 5))]
            if rng.random() < 0.06:
                c = tones[4]
            if (x, y) in cracks:
                c = mix(hexc('FF6A12'), hexc('FFC24A'), rng.random() * 0.6) if hot else hexc('0E0B0D')
            img.putpixel((x, y), c)
    return img


def molten_rock_frames(frames=8):
    img = Image.new('RGBA', (16, 16 * frames))
    rng = random.Random(21)
    seeds = [(rng.uniform(0, 16), rng.uniform(0, 16)) for _ in range(9)]
    for f in range(frames):
        phase = f / frames * math.tau
        for y in range(16):
            for x in range(16):
                dists = []
                for (sx, sy) in seeds:
                    best = min(math.hypot(x + 0.5 - (sx + ox), y + 0.5 - (sy + oy))
                               for ox in (-16, 0, 16) for oy in (-16, 0, 16))
                    dists.append(best)
                dists.sort()
                edge = dists[1] - dists[0]
                pulse = 0.5 + 0.5 * math.sin(phase + (x + y) * 0.35)
                if edge < 1.1:
                    heat = (1.1 - edge) / 1.1
                    c = mix(hexc('B8330A'), hexc('FFD07A'), min(1.0, heat * 0.7 + pulse * 0.4))
                elif edge < 1.9:
                    c = mix(hexc('5A1A0C'), hexc('C8461A'), pulse * 0.6)
                else:
                    c = hexc('3A2219') if (x * 7 + y * 3) % 5 else hexc('2B1913')
                img.putpixel((x, y + 16 * f), c)
    return img


def ash_texture(smoldering, frame=0):
    img = Image.new('RGBA', (16, 16))
    n = value_noise(16, 16, 4, 31)
    rng = random.Random(41)
    if smoldering:
        tones = [hexc('4A4644'), hexc('5A5552'), hexc('6A6460'), hexc('7A746F')]
    else:
        tones = [hexc('8A8580'), hexc('9C9792'), hexc('ADA8A2'), hexc('C2BDB6')]
    ember_rng = random.Random(77 + frame)
    for y in range(16):
        for x in range(16):
            c = tones[min(3, int(n(x, y) * 4))]
            r = rng.random()
            if r < 0.08:
                c = darken(c, 0.75)
            if smoldering and ember_rng.random() < 0.035:
                c = hexc('FFC45A') if ember_rng.random() < 0.4 else hexc('FF7A1F')
            img.putpixel((x, y), c)
    return img


# ----------------------------------------------------------------------------------------------
# Particles (white / grey, tinted in code)
# ----------------------------------------------------------------------------------------------

def radial(size, power=2.0, core=0.0, color=(255, 255, 255)):
    img = Image.new('RGBA', (size, size))
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c) / (size / 2)
            a = max(0.0, 1.0 - d) ** power
            if d < core:
                a = 1.0
            img.putpixel((x, y), (color[0], color[1], color[2], int(255 * min(1.0, a))))
    return img


def blob(size, seed, radius, softness=1.0, grey=255, jag=0.35):
    rng = random.Random(seed)
    img = Image.new('RGBA', (size, size))
    c = (size - 1) / 2
    bumps = [(rng.uniform(0, math.tau), rng.uniform(-jag, jag)) for _ in range(5)]
    for y in range(size):
        for x in range(size):
            dx, dy = x - c, y - c
            ang = math.atan2(dy, dx)
            r = radius * (1 + sum(b * math.cos(ang * (i + 2) + p) for i, (p, b) in enumerate(bumps)) * 0.5)
            d = math.hypot(dx, dy)
            if d <= r:
                a = 1.0 if softness <= 0 else min(1.0, (r - d) / softness + 0.25)
                g = int(grey * (0.85 + 0.15 * rng.random()))
                img.putpixel((x, y), (g, g, g, int(255 * a)))
    return img


def smoke_frame(i, frames=8):
    size = 16
    img = Image.new('RGBA', (size, size))
    rng = random.Random(100 + i)
    n = value_noise(size, size, 3, 200 + i)
    c = (size - 1) / 2
    spread = 0.55 + 0.4 * i / (frames - 1)
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c) / (size / 2) / spread
            a = max(0.0, 1.0 - d) * (0.55 + 0.6 * n(x, y))
            a *= 1.0 - 0.35 * i / (frames - 1)
            g = int(200 + 55 * n(x, y))
            if a > 0.02:
                img.putpixel((x, y), (g, g, g, int(255 * min(1.0, a * 1.4))))
    return img


def flame_frame(i, frames=8):
    size = 16
    img = Image.new('RGBA', (size, size))
    n = value_noise(size, size, 2.5, 300 + i)
    c = (size - 1) / 2
    t = i / (frames - 1)
    radius = 0.45 + 0.5 * min(1.0, t * 2.0)
    for y in range(size):
        for x in range(size):
            dx, dy = (x - c) / (size / 2), (y - c) / (size / 2)
            d = math.hypot(dx, dy * 0.9 + 0.15) / radius
            d += (n(x, y) - 0.5) * 0.55
            if d < 1.0:
                heat = (1.0 - d) * (1.0 - 0.7 * t)
                if heat > 0.6:
                    col = mix(hexc('FFE89A'), hexc('FFFFFF'), (heat - 0.6) / 0.4)
                elif heat > 0.3:
                    col = mix(hexc('FF8A1F'), hexc('FFE89A'), (heat - 0.3) / 0.3)
                else:
                    col = mix(hexc('7A1A0A'), hexc('FF8A1F'), heat / 0.3)
                a = min(1.0, (1.0 - d) * 2.2) * (1.0 - 0.6 * t)
                img.putpixel((x, y), (col[0], col[1], col[2], int(255 * a)))
    return img


def spark(seed):
    img = Image.new('RGBA', (8, 8))
    pts = {(3, 3): 255, (4, 3): 255, (3, 4): 255, (4, 4): 255}
    rng = random.Random(seed)
    for (dx, dy) in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        for k in (1, 2):
            if seed == 0 or k == 1:
                pts[(3 + dx * k if dx < 0 else 4 + dx * k, 3 + dy * k if dy < 0 else 4 + dy * k)] = 200 - 70 * k
    for (x, y), a in pts.items():
        if 0 <= x < 8 and 0 <= y < 8:
            img.putpixel((x, y), (255, 255, 255, max(0, a)))
    if seed == 1:
        for (x, y) in ((2, 2), (5, 5), (2, 5), (5, 2)):
            img.putpixel((x, y), (255, 255, 255, 110))
    return img


def singularity_texture():
    size = 64
    img = Image.new('RGBA', (size, size))
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            dx, dy = (x - c) * 32.0 / size, (y - c) * 32.0 / size
            d = math.hypot(dx, dy)
            beaming = 0.65 + 0.35 * (dx - dy) / (d + 1e-6) if d > 0 else 1.0
            if d < 8.5:
                col = (4, 2, 8, 255)
            elif d < 10.2:
                col = mix(hexc('F6E9FF'), hexc('C27CFF'), (d - 8.5) / 1.7)
                col = (int(col[0] * beaming), int(col[1] * beaming), int(col[2] * min(1.0, beaming + 0.2)), 255)
            elif d < 15.5:
                t = (d - 10.2) / 5.3
                a = (1 - t) ** 1.8 * 0.85
                col = mix(hexc('8A3BE0'), hexc('FF8A3A'), max(0.0, min(1.0, (dx + dy) / 30 + 0.3)))
                col = (col[0], col[1], col[2], int(255 * a))
            else:
                col = (0, 0, 0, 0)
            img.putpixel((x, y), col)
    return img


def orb_texture():
    size = 64
    img = Image.new('RGBA', (size, size))
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c) / (size / 2)
            if d < 0.38:
                a = 1.0
                col = (255, 255, 255)
            else:
                a = max(0.0, 1.0 - (d - 0.38) / 0.62) ** 1.6
                col = (225, 248, 255)
            ring = math.exp(-((d - 0.62) ** 2) / 0.004) * 0.35
            a = min(1.0, a + ring)
            img.putpixel((x, y), (col[0], col[1], col[2], int(255 * a)))
    return img


def shockwave_texture():
    size = 64
    img = Image.new('RGBA', (size, size))
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c) / (size / 2)
            ring = math.exp(-((d - 0.88) ** 2) / 0.0035)
            inner = max(0.0, 1.0 - abs(d - 0.6) / 0.35) * 0.18 if d < 0.9 else 0.0
            a = min(1.0, ring + inner)
            if d > 1.0:
                a = 0.0
            img.putpixel((x, y), (255, 255, 255, int(255 * a)))
    return img


def icon():
    img = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    bg = radial(128, power=1.2, color=(40, 20, 60))
    bg_full = Image.new('RGBA', (128, 128), (14, 10, 22, 255))
    bg_full.alpha_composite(bg)
    img.alpha_composite(bg_full)
    glow = radial(96, power=2.0, color=(120, 220, 255))
    img.alpha_composite(glow, (16, 16))
    cannon = worldbreaker(3).resize((112, 112), Image.NEAREST)
    img.alpha_composite(cannon, (8, 8))
    return img


def main():
    # Weapons
    save(sunline_rifle(), 'item', 'sunline_rifle.png')
    save(sunline_rifle(cooling=True), 'item', 'sunline_rifle_cooling.png')
    for stage in range(4):
        save(worldbreaker(stage), 'item', f'worldbreaker_cannon{"" if stage == 0 else "_charge_" + str(stage)}.png')
    save(gravemaker(True), 'item', 'gravemaker.png')
    save(gravemaker(False), 'item', 'gravemaker_empty.png')
    save(riftfang(), 'item', 'riftfang_scythe.png')
    for level in range(4):
        save(stormcaller(level), 'item', f'stormcaller_gauntlet{"" if level == 0 else "_charged_" + str(level)}.png')
    save(marble(False), 'item', 'singularity_round.png')
    save(marble(True), 'item', 'white_hole_round.png')

    # Blocks
    save(scorched_stone(False), 'block', 'scorched_stone.png')
    save(scorched_stone(True), 'block', 'scorched_stone_hot.png')
    save(molten_rock_frames(), 'block', 'molten_rock.png')
    with open(os.path.join(TEX, 'block', 'molten_rock.png.mcmeta'), 'w') as fh:
        fh.write('{\n  "animation": {\n    "frametime": 4,\n    "interpolate": true\n  }\n}\n')
    frames = [ash_texture(True, f) for f in range(4)]
    strip = Image.new('RGBA', (16, 64))
    for i, fr in enumerate(frames):
        strip.paste(fr, (0, 16 * i))
    save(strip, 'block', 'smoldering_ash.png')
    with open(os.path.join(TEX, 'block', 'smoldering_ash.png.mcmeta'), 'w') as fh:
        fh.write('{\n  "animation": {\n    "frametime": 7\n  }\n}\n')
    save(ash_texture(False), 'block', 'ash_layer.png')

    # Particles
    for i in range(4):
        save(blob(8, 10 + i, 1.4 + 0.35 * i, softness=0.9), 'particle', f'ember_{i}.png')
        save(blob(8, 20 + i, 2.0 + 0.3 * (i % 2), softness=0.0, grey=235, jag=0.55), 'particle', f'ash_{i}.png')
        save(blob(8, 30 + i, 2.2 + 0.3 * (i % 2), softness=0.0, grey=245, jag=0.7), 'particle', f'char_{i}.png')
        save(blob(8, 40 + i, 1.8 + 0.4 * (i % 2), softness=1.2), 'particle', f'magma_{i}.png')
        save(blob(16, 50 + i, 5.0 + i * 0.5, softness=3.0, grey=230, jag=0.3), 'particle', f'dust_{i}.png')
    for i in range(8):
        save(smoke_frame(i), 'particle', f'smoke_{i}.png')
        save(flame_frame(i), 'particle', f'flame_{i}.png')
    save(radial(64, power=2.2, core=0.1), 'particle', 'glow.png')
    save(spark(0), 'particle', 'spark_0.png')
    save(spark(1), 'particle', 'spark_1.png')
    save(radial(8, power=1.5, core=0.2), 'particle', 'mote_0.png')
    save(radial(8, power=2.5, core=0.0), 'particle', 'mote_1.png')
    save(singularity_texture(), 'particle', 'singularity.png')
    save(orb_texture(), 'particle', 'orb_core.png')
    save(shockwave_texture(), 'particle', 'shockwave.png')

    icon().save(os.path.join(ROOT, 'icon.png'))
    print('textures written to', os.path.normpath(TEX))


if __name__ == '__main__':
    main()
