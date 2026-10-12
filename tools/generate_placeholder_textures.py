#!/usr/bin/env python3
"""
Generates the PLACEHOLDER textures for Chaos Unleashed.

Every PNG written by this script is a procedurally generated stand-in. Replace any of them with real art by
simply overwriting the file in src/main/resources/assets/chaosunleashed/textures/ (keep the same size/layout
for entity textures, since the models use fixed UV coordinates).

Usage: python3 tools/generate_placeholder_textures.py
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'main', 'resources', 'assets', 'chaosunleashed', 'textures')
rng = random.Random(1337)


def out(path):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    return full


def save(img, path):
    img.save(out(path))


def clamp(v):
    return max(0, min(255, int(v)))


def shade(color, f):
    return tuple(clamp(c * f) for c in color[:3]) + ((color[3],) if len(color) == 4 else (255,))


def noise_fill(img, box, base, var=0.15, seed=None):
    r = random.Random(seed if seed is not None else rng.random())
    x0, y0, x1, y1 = box
    px = img.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            f = 1.0 + (r.random() - 0.5) * 2 * var
            px[x, y] = shade(base, f)


def metal_panel(size=16, base=(92, 96, 108), seed=1):
    img = Image.new('RGBA', (size, size))
    noise_fill(img, (0, 0, size, size), base, 0.08, seed)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, size - 1, size - 1], outline=shade(base, 0.6))
    d.line([1, 1, size - 2, 1], fill=shade(base, 1.3))
    d.line([1, 1, 1, size - 2], fill=shade(base, 1.2))
    for (x, y) in [(2, 2), (size - 3, 2), (2, size - 3), (size - 3, size - 3)]:
        d.point((x, y), fill=shade(base, 0.5))
    return img


# ------------------------------------------------------------------------------------------------ block
def control_panel():
    side = metal_panel(16, (88, 92, 104), 2)
    d = ImageDraw.Draw(side)
    for y in (6, 10):
        d.line([3, y, 12, y], fill=(40, 42, 50, 255))
    save(side, 'block/chaos_control_panel_side.png')

    top = metal_panel(16, (96, 100, 112), 3)
    d = ImageDraw.Draw(top)
    # keyboard keys
    for row in range(3):
        for col in range(5):
            x = 2 + col * 2 + (row % 2)
            y = 3 + row * 3
            d.rectangle([x, y, x, y + 1], fill=(30, 30, 36, 255))
    d.rectangle([11, 3, 13, 5], fill=(200, 30, 30, 255))   # big red button
    d.point((12, 4), fill=(255, 120, 120, 255))
    d.rectangle([11, 8, 13, 9], fill=(230, 200, 40, 255))
    save(top, 'block/chaos_control_panel_top.png')

    bottom = metal_panel(16, (60, 62, 70), 4)
    save(bottom, 'block/chaos_control_panel_bottom.png')

    front = metal_panel(16, (84, 88, 100), 5)
    d = ImageDraw.Draw(front)
    d.rectangle([2, 2, 13, 13], fill=(20, 20, 26, 255))
    save(front, 'block/chaos_control_panel_front.png')

    # Animated screens (16x16 frames stacked vertically, see .png.mcmeta)
    screens = {
        'idle': ((20, 200, 70), (8, 60, 24)),
        'warning': ((240, 200, 30), (70, 55, 8)),
        'active': ((240, 40, 30), (70, 10, 8)),
    }
    for name, (bright, dark) in screens.items():
        frames = 8
        img = Image.new('RGBA', (16, 16 * frames))
        for f in range(frames):
            fy = f * 16
            for y in range(16):
                for x in range(16):
                    scan = 0.75 + 0.25 * math.sin((y + f * 2) * 1.2)
                    c = tuple(clamp(dark[i] + (bright[i] - dark[i]) * 0.25 * scan) for i in range(3))
                    img.putpixel((x, fy + y), c + (255,))
            d = ImageDraw.Draw(img)
            d.rectangle([0, fy, 15, fy + 15], outline=(10, 10, 12, 255))
            if name == 'idle':
                # heartbeat line
                pts = []
                for x in range(1, 15):
                    yy = 9
                    if (x + f) % 8 == 3:
                        yy = 4
                    elif (x + f) % 8 == 4:
                        yy = 12
                    pts.append((x, fy + yy))
                d.line(pts, fill=bright + (255,))
                d.text((2, fy + 1), '', fill=bright)
            elif name == 'warning':
                on = f % 4 < 2
                col = bright if on else shade(bright, 0.6)[:3]
                d.polygon([(8, fy + 2), (14, fy + 13), (2, fy + 13)], outline=col + (255,))
                d.line([8, fy + 6, 8, fy + 9], fill=col + (255,))
                d.point((8, fy + 11), fill=col + (255,))
            else:
                on = f % 2 == 0
                col = bright if on else shade(bright, 0.5)[:3]
                d.rectangle([2, fy + 2, 13, fy + 13], outline=col + (255,))
                d.line([4, fy + 4, 11, fy + 11], fill=col + (255,))
                d.line([11, fy + 4, 4, fy + 11], fill=col + (255,))
        save(img, 'block/chaos_control_panel_screen_%s.png' % name)
        with open(out('block/chaos_control_panel_screen_%s.png.mcmeta' % name), 'w') as fh:
            fh.write('{\n  "animation": {\n    "frametime": %d,\n    "interpolate": false\n  }\n}\n' % (6 if name == 'idle' else 4))


# ------------------------------------------------------------------------------------------------ items
def item_canvas():
    return Image.new('RGBA', (16, 16), (0, 0, 0, 0))


def outline(img, color=(20, 20, 24, 255)):
    px = img.load()
    w, h = img.size
    add = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] > 0 and px[nx, ny] != color:
                        add.append((x, y))
                        break
    for p in add:
        px[p] = color
    return img


def items():
    # Alien Alloy: a teal-green iridescent ingot
    img = item_canvas()
    d = ImageDraw.Draw(img)
    d.polygon([(2, 9), (8, 5), (14, 8), (8, 12)], fill=(60, 200, 170, 255))
    d.polygon([(2, 9), (8, 12), (8, 14), (2, 11)], fill=(30, 120, 110, 255))
    d.polygon([(8, 12), (14, 8), (14, 10), (8, 14)], fill=(40, 150, 130, 255))
    d.line([(4, 8), (8, 6)], fill=(200, 255, 240, 255))
    d.point((10, 7), fill=(255, 120, 255, 255))
    save(outline(img), 'item/alien_alloy.png')

    # Plasma Pistol
    img = item_canvas()
    d = ImageDraw.Draw(img)
    d.rectangle([3, 5, 13, 8], fill=(150, 160, 175, 255))
    d.rectangle([4, 6, 12, 7], fill=(60, 230, 120, 255))
    d.rectangle([13, 6, 14, 7], fill=(120, 255, 160, 255))
    d.polygon([(4, 8), (7, 8), (6, 13), (3, 13)], fill=(80, 85, 95, 255))
    d.rectangle([2, 4, 4, 6], fill=(110, 115, 125, 255))
    save(outline(img), 'item/plasma_pistol.png')

    # Plasma bolt (projectile sprite)
    img = item_canvas()
    for y in range(16):
        for x in range(16):
            r = math.hypot(x - 7.5, y - 7.5)
            if r < 7.5:
                a = clamp(255 * (1 - r / 7.5) ** 0.7)
                img.putpixel((x, y), (clamp(120 + 135 * (1 - r / 7.5)), 255, clamp(140 + 115 * (1 - r / 7.5)), a))
    save(img, 'item/plasma_bolt.png')

    # Kaiju Scale
    img = item_canvas()
    d = ImageDraw.Draw(img)
    d.polygon([(8, 1), (14, 6), (12, 14), (4, 14), (2, 6)], fill=(40, 110, 70, 255))
    d.polygon([(8, 3), (12, 7), (10, 12), (6, 12), (4, 7)], fill=(60, 150, 95, 255))
    d.line([(8, 3), (8, 12)], fill=(30, 80, 50, 255))
    d.point((6, 6), fill=(160, 240, 190, 255))
    save(outline(img), 'item/kaiju_scale.png')

    # Kaiju Heart
    img = item_canvas()
    d = ImageDraw.Draw(img)
    d.ellipse([2, 3, 9, 10], fill=(200, 60, 30, 255))
    d.ellipse([7, 3, 14, 10], fill=(200, 60, 30, 255))
    d.polygon([(2, 7), (14, 7), (8, 14)], fill=(200, 60, 30, 255))
    d.ellipse([5, 5, 10, 10], fill=(255, 170, 40, 255))
    d.point((6, 6), fill=(255, 250, 200, 255))
    d.line([(9, 2), (11, 0)], fill=(120, 30, 20, 255))
    save(outline(img), 'item/kaiju_heart.png')

    # Stabilizer Core
    img = item_canvas()
    d = ImageDraw.Draw(img)
    d.ellipse([2, 2, 13, 13], fill=(70, 70, 90, 255))
    d.ellipse([4, 4, 11, 11], fill=(150, 90, 255, 255))
    d.ellipse([6, 6, 9, 9], fill=(240, 220, 255, 255))
    d.arc([1, 5, 14, 10], 0, 360, fill=(220, 200, 80, 255))
    save(outline(img), 'item/stabilizer_core.png')

    # Rift Shard
    img = item_canvas()
    d = ImageDraw.Draw(img)
    d.polygon([(9, 1), (12, 6), (9, 15), (5, 9), (6, 4)], fill=(170, 60, 220, 255))
    d.polygon([(9, 3), (10, 6), (8, 12), (7, 8)], fill=(255, 140, 255, 255))
    d.point((8, 5), fill=(255, 255, 255, 255))
    save(outline(img), 'item/rift_shard.png')

    # Anti-Gravity Boots
    img = item_canvas()
    d = ImageDraw.Draw(img)
    d.rectangle([3, 4, 6, 11], fill=(60, 190, 170, 255))
    d.rectangle([9, 4, 12, 11], fill=(60, 190, 170, 255))
    d.rectangle([2, 11, 7, 13], fill=(90, 95, 110, 255))
    d.rectangle([8, 11, 13, 13], fill=(90, 95, 110, 255))
    d.line([(2, 14), (7, 14)], fill=(120, 255, 230, 255))
    d.line([(8, 14), (13, 14)], fill=(120, 255, 230, 255))
    save(outline(img), 'item/anti_gravity_boots.png')

    # Kaiju scale armor set
    green, dark, light = (50, 130, 80, 255), (30, 80, 50, 255), (120, 210, 150, 255)
    img = item_canvas(); d = ImageDraw.Draw(img)
    d.rectangle([3, 3, 12, 9], fill=green); d.rectangle([5, 6, 10, 9], fill=(0, 0, 0, 0)); d.line([(3, 3), (12, 3)], fill=light)
    d.point((7, 4), fill=(255, 160, 40, 255)); d.point((8, 4), fill=(255, 160, 40, 255))
    save(outline(img), 'item/kaiju_scale_helmet.png')
    img = item_canvas(); d = ImageDraw.Draw(img)
    d.rectangle([2, 2, 13, 13], fill=green); d.rectangle([5, 2, 10, 4], fill=(0, 0, 0, 0)); d.rectangle([0, 3, 2, 8], fill=dark); d.rectangle([13, 3, 15, 8], fill=dark)
    for yy in (6, 9, 12):
        d.line([(4, yy), (11, yy)], fill=dark)
    d.point((7, 8), fill=(255, 160, 40, 255))
    save(outline(img), 'item/kaiju_scale_chestplate.png')
    img = item_canvas(); d = ImageDraw.Draw(img)
    d.rectangle([3, 2, 12, 5], fill=green); d.rectangle([3, 5, 6, 14], fill=green); d.rectangle([9, 5, 12, 14], fill=green)
    d.line([(3, 2), (12, 2)], fill=light)
    save(outline(img), 'item/kaiju_scale_leggings.png')
    img = item_canvas(); d = ImageDraw.Draw(img)
    d.rectangle([3, 7, 6, 12], fill=green); d.rectangle([9, 7, 12, 12], fill=green); d.rectangle([2, 12, 7, 14], fill=dark); d.rectangle([8, 12, 13, 14], fill=dark)
    save(outline(img), 'item/kaiju_scale_boots.png')

    # Spawn eggs
    for name, base, spots in (('alien_soldier', (70, 180, 110), (200, 255, 220)),
                              ('bison', (90, 60, 35), (170, 130, 90)),
                              ('shade_stalker', (25, 20, 35), (200, 60, 255))):
        img = item_canvas(); d = ImageDraw.Draw(img)
        d.ellipse([3, 1, 12, 14], fill=base + (255,))
        r = random.Random(name)
        for _ in range(5):
            x, y = r.randint(5, 10), r.randint(3, 12)
            d.rectangle([x, y, x + 1, y + 1], fill=spots + (255,))
        d.point((6, 3), fill=(255, 255, 255, 180))
        save(outline(img), 'item/%s_spawn_egg.png' % name)


# ------------------------------------------------------------------------------------------------ particles
def particles():
    def radial(name, color, size=8, frames=1, hard=False, ring=False, sparkle=False):
        for f in range(frames):
            img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            c = (size - 1) / 2
            maxr = c * (1 - f / (frames + 1) * 0.6)
            for y in range(size):
                for x in range(size):
                    r = math.hypot(x - c, y - c)
                    if ring:
                        a = max(0.0, 1 - abs(r - maxr * 0.7) / (maxr * 0.35))
                    else:
                        a = max(0.0, 1 - r / (maxr + 0.01))
                    if hard:
                        a = 1.0 if a > 0.25 else 0.0
                    if sparkle and (x == round(c) or y == round(c)):
                        a = max(a, 0.9 * max(0.0, 1 - r / (c + 0.5)))
                    if a > 0:
                        img.putpixel((x, y), color[:3] + (clamp(255 * min(1.0, a * 1.3)),))
            suffix = '' if frames == 1 else '_%d' % f
            save(img, 'particle/%s%s.png' % (name, suffix))

    radial('ember', (255, 150, 40), 8, 4)
    radial('blood_mist', (170, 10, 10), 8, 4)
    radial('rift_spark', (255, 120, 255), 8, 4, sparkle=True)
    radial('void_swirl', (150, 80, 255), 8, 4)
    radial('plasma', (110, 255, 150), 8, 4)
    radial('shadow_wisp', (20, 10, 30), 8, 4)
    radial('gravity_mote', (120, 230, 255), 8, 4, sparkle=True)
    radial('beam_spark', (255, 230, 120), 8, 4, sparkle=True)
    # Dust cloud: soft noisy puffs
    for f in range(4):
        img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        r = random.Random(f)
        for _ in range(9):
            cx, cy, rad = r.uniform(4, 12), r.uniform(4, 12), r.uniform(3, 6)
            for y in range(16):
                for x in range(16):
                    dd = math.hypot(x - cx, y - cy)
                    if dd < rad:
                        a = (1 - dd / rad) * 0.6
                        old = img.getpixel((x, y))
                        na = min(255, old[3] + int(a * 255))
                        img.putpixel((x, y), (150 + r.randint(-10, 10), 120 + r.randint(-10, 10), 85, na))
        save(img, 'particle/dust_cloud_%d.png' % f)


def environment():
    # Eclipse moon disk: solid black circle with a soft edge (rendered with alpha blending over the sun).
    size = 64
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            r = math.hypot(x - c, y - c) / c
            a = 1.0 if r < 0.9 else max(0.0, 1 - (r - 0.9) / 0.06)
            if a > 0:
                img.putpixel((x, y), (2, 2, 6, clamp(255 * a)))
    save(img, 'environment/eclipse_disk.png')
    # Corona: additive glow ring with streamers.
    size = 128
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c = (size - 1) / 2
    r0 = 0.41
    for y in range(size):
        for x in range(size):
            dx, dy = x - c, y - c
            r = math.hypot(dx, dy) / c
            ang = math.atan2(dy, dx)
            rays = 0.55 + 0.45 * abs(math.sin(ang * 7 + 0.5)) * abs(math.sin(ang * 3 + 1.3))
            if r < r0 - 0.03:
                v = 0.0
            else:
                v = math.exp(-((r - r0) / (0.05 + 0.25 * rays * max(0.0, r - r0 + 0.02))) ** 2) if r >= r0 else math.exp(-((r0 - r) / 0.012) ** 2)
                v = max(v, 0.7 * math.exp(-max(0.0, r - r0) / (0.12 * rays)))
            if r > 0.98:
                v = 0
            if v > 0.01:
                img.putpixel((x, y), (clamp(255 * v), clamp(240 * v), clamp(215 * v), 255))
    save(img, 'environment/eclipse_corona.png')


# ------------------------------------------------------------------------------------------------ entities
def shade_stalker():
    # Uses the vanilla Enderman model UV layout (64x32): fill everything with drifting shadow noise.
    img = Image.new('RGBA', (64, 32))
    r = random.Random(7)
    px = img.load()
    for y in range(32):
        for x in range(64):
            v = r.randint(4, 18)
            streak = 10 if (x + y * 3) % 11 == 0 else 0
            px[x, y] = (v + streak // 2, v // 2, v + streak + 6, 255)
    save(img, 'entity/shade_stalker/shade_stalker.png')
    eyes = Image.new('RGBA', (64, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(eyes)
    for x0 in (8, 13):
        d.rectangle([x0, 11, x0 + 2, 12], fill=(170, 240, 255, 255))
        d.point((x0 + 1, 12), fill=(255, 255, 255, 255))
    save(eyes, 'entity/shade_stalker/shade_stalker_eyes.png')


def bison():
    # UV layout matches client/model/BisonModel.java (64x64).
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    r = random.Random(11)
    px = img.load()

    def fur(x0, y0, x1, y1, base, var=0.18, shaggy=False):
        for y in range(y0, y1):
            for x in range(x0, x1):
                f = 1 + (r.random() - 0.5) * 2 * var
                if shaggy and (x + y) % 3 == 0:
                    f *= 0.8
                px[x, y] = tuple(clamp(c * f) for c in base) + (255,)

    fur(0, 0, 64, 29, (92, 62, 38))            # body
    fur(0, 0, 64, 12, (70, 45, 28), shaggy=True)  # darker top/front of body faces
    fur(0, 29, 42, 42, (58, 38, 24), shaggy=True)  # hump (shaggy)
    fur(0, 42, 32, 59, (52, 34, 22), shaggy=True)  # head
    fur(32, 42, 48, 56, (64, 44, 30))           # legs
    fur(32, 52, 48, 56, (36, 28, 22))           # hooves
    fur(48, 42, 58, 50, (200, 195, 180), 0.08)  # horns
    fur(42, 29, 54, 34, (40, 28, 18), shaggy=True)  # beard
    # eyes on the head's front face (u=8, v=50, 8x9)
    for ex in (9, 14):
        px[ex, 52] = (20, 16, 12, 255)
        px[ex, 51] = (230, 220, 200, 255)
    # nose
    for nx in range(10, 14):
        px[nx, 56] = (30, 22, 18, 255)
    save(img, 'entity/bison/bison.png')


def rift():
    # Jagged vertical crack: an opaque dark core (translucent layer) and a glowing rim (additive layer).
    w, h = 32, 128
    r = random.Random(21)
    centers, widths = [], []
    cx = w / 2
    for y in range(h):
        cx += r.uniform(-0.9, 0.9)
        cx = max(10, min(w - 10, cx))
        taper = math.sin(math.pi * (y + 0.5) / h) ** 0.7
        centers.append(cx)
        widths.append(max(0.4, 5.5 * taper * (0.55 + 0.45 * r.random())))
    void = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y in range(h):
        for x in range(w):
            d = abs(x + 0.5 - centers[y]) - widths[y]
            if d < 0:
                inner = min(1.0, -d / 2.0)
                void.putpixel((x, y), (clamp(25 - 15 * inner), 0, clamp(40 - 20 * inner), 255))
            g = math.exp(-((d) / 1.6) ** 2) if d > -2 else 0.0
            g = max(g, 0.35 * math.exp(-max(0.0, d) / 4.0) if d > -1 else 0.0)
            if g > 0.02:
                glow.putpixel((x, y), (clamp(255 * g), clamp(255 * g), clamp(255 * g), 255))
    save(void, 'entity/rift/rift_void.png')
    save(glow, 'entity/rift/rift_glow.png')


def black_hole():
    size = 64
    c = (size - 1) / 2
    core = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    halo = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    disk = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    for y in range(size):
        for x in range(size):
            r = math.hypot(x - c, y - c) / c
            if r < 0.86:
                core.putpixel((x, y), (0, 0, 0, 255))
            elif r < 0.98:
                # thin photon ring
                t = 1 - abs(r - 0.9) / 0.08
                core.putpixel((x, y), (clamp(120 * t), clamp(60 * t), clamp(200 * t), clamp(255 * min(1.0, 0.4 + t))))
            g = max(0.0, 1 - r) ** 1.8
            if g > 0.01:
                halo.putpixel((x, y), (clamp(200 * g), clamp(120 * g), clamp(255 * g), 255))
    c2 = 63.5
    for y in range(128):
        for x in range(128):
            r = math.hypot(x - c2, y - c2) / c2
            if 0.32 < r < 1.0:
                ang = math.atan2(y - c2, x - c2)
                band = 0.6 + 0.4 * math.sin(ang * 3 + r * 18)
                inner = (1 - r) / 0.68
                heat = max(0.0, min(1.0, inner * 1.3)) * band
                fade = min(1.0, (r - 0.32) / 0.06) * min(1.0, (1 - r) / 0.25)
                v = heat * fade
                if v > 0.01:
                    disk.putpixel((x, y), (clamp(255 * v), clamp(170 * v * v + 40 * v), clamp(255 * v * v * 0.6 + 60 * v * (1 - v)), 255))
    save(core, 'entity/black_hole/core.png')
    save(halo, 'entity/black_hole/halo.png')
    save(disk, 'entity/black_hole/accretion_disk.png')


def box_uv(u, v, w, h, d):
    """Face rectangles of a model cuboid with the standard box UV layout."""
    return {
        'top': (u + d, v, u + d + w, v + d),
        'bottom': (u + d + w, v, u + d + 2 * w, v + d),
        'right': (u, v + d, u + d, v + d + h),
        'front': (u + d, v + d, u + d + w, v + d + h),
        'left': (u + d + w, v + d, u + 2 * d + w, v + d + h),
        'back': (u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h),
    }


def ufo():
    # UV layout matches client/model/UfoModel.java (256x128).
    img = Image.new('RGBA', (256, 128), (0, 0, 0, 0))
    glow = Image.new('RGBA', (256, 128), (0, 0, 0, 0))
    r = random.Random(31)
    px = img.load()
    gx = glow.load()

    def metal(rect, base, var=0.06, panel=8):
        x0, y0, x1, y1 = rect
        for y in range(y0, y1):
            for x in range(x0, x1):
                f = 1 + (r.random() - 0.5) * 2 * var
                if (x - x0) % panel == 0 or (y - y0) % panel == 0:
                    f *= 0.82
                px[x, y] = tuple(clamp(c * f) for c in base) + (255,)

    for name, (u, v, w, h, d), base in (
            ('rim', (0, 0, 40, 3, 40), (150, 155, 165)),
            ('top', (0, 43, 24, 3, 24), (170, 175, 185)),
            ('bottom', (0, 70, 20, 2, 20), (90, 95, 105)),
            ('emitter', (80, 70, 6, 1, 6), (60, 200, 120)),
            ('light', (144, 43, 2, 2, 2), (255, 240, 120))):
        for face, rect in box_uv(u, v, w, h, d).items():
            metal(rect, base)
    # rim side strip lights
    for face in ('front', 'back', 'left', 'right'):
        x0, y0, x1, y1 = box_uv(0, 0, 40, 3, 40)[face]
        for x in range(x0, x1):
            if x % 5 == 2:
                px[x, y0 + 1] = (255, 230, 120, 255)
                gx[x, y0 + 1] = (255, 230, 120, 255)
    # dome: translucent-looking glass with a little alien silhouette
    for face, rect in box_uv(96, 43, 12, 6, 12).items():
        x0, y0, x1, y1 = rect
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = (120, 220, 200, 255)
                gx[x, y] = (30, 90, 70, 255)
        if face == 'front':
            for y in range(y0 + 2, y1):
                px[x0 + 5, y] = (40, 90, 60, 255)
                px[x0 + 6, y] = (40, 90, 60, 255)
            px[x0 + 5, y0 + 2] = (0, 0, 0, 255)
            px[x0 + 6, y0 + 2] = (0, 0, 0, 255)
    for face, rect in box_uv(80, 70, 6, 1, 6).items():
        x0, y0, x1, y1 = rect
        for y in range(y0, y1):
            for x in range(x0, x1):
                gx[x, y] = (110, 255, 160, 255)
    for face, rect in box_uv(144, 43, 2, 2, 2).items():
        x0, y0, x1, y1 = rect
        for y in range(y0, y1):
            for x in range(x0, x1):
                gx[x, y] = (255, 240, 140, 255)
    save(img, 'entity/ufo/ufo.png')
    save(glow, 'entity/ufo/ufo_glow.png')
    beam = Image.new('RGBA', (16, 64), (0, 0, 0, 0))
    for y in range(64):
        for x in range(16):
            edge = 1 - abs(x - 7.5) / 8
            scan = 0.75 + 0.25 * math.sin(y * 0.8)
            v = edge * scan
            beam.putpixel((x, y), (clamp(255 * v), clamp(255 * v), clamp(255 * v), 255))
    save(beam, 'entity/ufo/beam.png')


def alien_soldier():
    # UV layout matches client/model/AlienSoldierModel.java (64x64).
    img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    glow = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    r = random.Random(41)
    px = img.load()

    def skin(rect, base, var=0.1):
        x0, y0, x1, y1 = rect
        for y in range(y0, y1):
            for x in range(x0, x1):
                f = 1 + (r.random() - 0.5) * 2 * var
                px[x, y] = tuple(clamp(c * f) for c in base) + (255,)

    for rect in box_uv(0, 0, 10, 10, 10).values():
        skin(rect, (120, 190, 140))
    for rect in box_uv(40, 0, 6, 12, 4).values():
        skin(rect, (70, 80, 95))          # armored suit
    for rect in box_uv(0, 20, 3, 14, 3).values():
        skin(rect, (110, 175, 130))
    for rect in box_uv(12, 20, 3, 12, 3).values():
        skin(rect, (70, 80, 95))
    # big black almond eyes on the head front (front face starts at 10,10; 10x10)
    d = ImageDraw.Draw(img)
    gd = ImageDraw.Draw(glow)
    for ex in (11, 16):
        d.polygon([(ex, 14), (ex + 2, 13), (ex + 3, 15), (ex + 1, 16)], fill=(10, 10, 14, 255))
        gd.point((ex + 1, 14), fill=(120, 255, 170, 255))
    # chest light
    d.rectangle([47, 8, 48, 9], fill=(120, 255, 170, 255))
    gd.rectangle([47, 8, 48, 9], fill=(120, 255, 170, 255))
    save(img, 'entity/alien_soldier/alien_soldier.png')
    save(glow, 'entity/alien_soldier/alien_soldier_glow.png')


def armor_layers():
    for name, base, accent in (('alien_alloy', (70, 200, 175), (200, 255, 240)), ('kaiju_scale', (45, 125, 75), (255, 150, 40))):
        for layer in ('humanoid', 'humanoid_leggings'):
            img = Image.new('RGBA', (64, 32), (0, 0, 0, 0))
            r = random.Random(name + layer)
            px = img.load()
            for y in range(32):
                for x in range(64):
                    f = 1 + (r.random() - 0.5) * 0.25
                    if name == 'kaiju_scale' and (x + (y // 2) * 2) % 4 == 0:
                        f *= 0.7
                    px[x, y] = tuple(clamp(c * f) for c in base) + (255,)
            # a few accent pixels
            for _ in range(20):
                px[r.randint(0, 63), r.randint(0, 31)] = accent + (255,)
            save(img, 'entity/equipment/%s/%s.png' % (layer, name))


def kaiju():
    # UV layout matches client/model/KaijuModel.java (128x128).
    img = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    glow = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
    r = random.Random(51)
    px = img.load()
    gx = glow.load()

    def scales(rect, base, belly=None):
        x0, y0, x1, y1 = rect
        for y in range(y0, y1):
            for x in range(x0, x1):
                f = 1 + (r.random() - 0.5) * 0.25
                if (x + (y // 2) * 2) % 4 == 0 or y % 2 == 0 and x % 4 == 1:
                    f *= 0.72
                c = base
                if belly is not None and belly(x - x0, y - y0, x1 - x0, y1 - y0):
                    c = (110, 120, 80)
                px[x, y] = tuple(clamp(v * f) for v in c) + (255,)

    green = (40, 90, 55)
    dark = (28, 62, 40)
    for face, rect in box_uv(0, 0, 20, 30, 16).items():
        scales(rect, green, (lambda x, y, w, h: abs(x - w / 2) < w * 0.3) if face == 'front' else None)
    for rect in box_uv(72, 0, 12, 10, 16).values():
        scales(rect, green)
    for rect in box_uv(72, 26, 10, 3, 14).values():
        scales(rect, dark)
    for rect in box_uv(0, 46, 10, 16, 12).values():
        scales(rect, green)
    for rect in box_uv(44, 46, 8, 20, 9).values():
        scales(rect, dark)
    for rect in box_uv(78, 46, 10, 2, 14).values():
        scales(rect, (30, 30, 30))
    for rect in box_uv(78, 62, 4, 12, 4).values():
        scales(rect, green)
    for rect in box_uv(0, 77, 12, 12, 16).values():
        scales(rect, green)
    for rect in box_uv(56, 78, 8, 8, 16).values():
        scales(rect, green)
    for rect in box_uv(0, 105, 4, 4, 14).values():
        scales(rect, dark)
    for rect in box_uv(104, 78, 2, 6, 4).values():
        scales(rect, (200, 210, 220))
        x0, y0, x1, y1 = rect
        for y in range(y0, y1):
            for x in range(x0, x1):
                gx[x, y] = (60, 140, 255, 255)
    # Eyes on the head front face (box 72,0 12x10x16 -> front at 88,16)
    for ex in (89, 97):
        for dx in range(2):
            px[ex + dx, 19] = (255, 140, 30, 255)
            gx[ex + dx, 19] = (255, 160, 40, 255)
    # Teeth on the jaw front
    fx0, fy0, fx1, fy1 = box_uv(72, 26, 10, 3, 14)['front']
    for x in range(fx0, fx1, 2):
        px[x, fy0] = (230, 230, 210, 255)
    # Glowing weak points: shin fronts and the upper back.
    for face in ('front',):
        x0, y0, x1, y1 = box_uv(44, 46, 8, 20, 9)[face]
        cx, cy = (x0 + x1) // 2, y0 + 8
        for y in range(cy - 2, cy + 3):
            for x in range(cx - 2, cx + 2):
                px[x, y] = (255, 150, 40, 255)
                gx[x, y] = (255, 170, 50, 255)
    x0, y0, x1, y1 = box_uv(0, 0, 20, 30, 16)['back']
    for cy in (y0 + 6, y0 + 14):
        for y in range(cy - 2, cy + 3):
            for x in range((x0 + x1) // 2 - 3, (x0 + x1) // 2 + 3):
                px[x, y] = (255, 150, 40, 255)
                gx[x, y] = (255, 170, 50, 255)
    save(img, 'entity/kaiju/kaiju.png')
    save(glow, 'entity/kaiju/kaiju_glow.png')
    orb = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    for y in range(32):
        for x in range(32):
            d = math.hypot(x - 15.5, y - 15.5) / 15.5
            if d < 1:
                v = (1 - d) ** 1.5
                ring = math.exp(-((d - 0.75) / 0.06) ** 2) * 0.8
                v = min(1.0, v + ring)
                orb.putpixel((x, y), (clamp(255 * v), clamp(150 * v), clamp(40 * v), 255))
    save(orb, 'entity/kaiju/weak_point.png')


def icon():
    img = Image.new('RGBA', (128, 128), (16, 16, 22, 255))
    d = ImageDraw.Draw(img)
    for i in range(64, 0, -2):
        c = clamp(40 + (64 - i) * 3)
        d.ellipse([64 - i, 64 - i, 64 + i, 64 + i], outline=(c, clamp(c * 0.3), clamp(c * 0.6), 255))
    d.ellipse([40, 40, 88, 88], fill=(0, 0, 0, 255))
    d.polygon([(64, 18), (76, 44), (52, 44)], fill=(240, 200, 30, 255))
    d.polygon([(64, 24), (72, 40), (56, 40)], fill=(20, 20, 20, 255))
    d.rectangle([62, 28, 66, 35], fill=(240, 200, 30, 255))
    d.rectangle([62, 37, 66, 39], fill=(240, 200, 30, 255))
    full = os.path.join(ROOT, '..', 'icon.png')
    img.save(full)


if __name__ == '__main__':
    control_panel()
    items()
    particles()
    environment()
    shade_stalker()
    bison()
    rift()
    black_hole()
    ufo()
    alien_soldier()
    armor_layers()
    kaiju()
    icon()
    try:
        import entity_textures  # noqa: F401  (optional second stage)
    except ImportError:
        pass
    print('Placeholder textures written to', os.path.normpath(ROOT))
