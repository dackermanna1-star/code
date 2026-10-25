"""Generates effect, particle, entity, block and GUI textures for Godforge.

Run from the repository root:  python3 tools/gen_fx_textures.py
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from pixelart import hexc, lerp, noise2, save, save_anim  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'main', 'resources', 'assets', 'godforge', 'textures')


def path(*parts):
    return os.path.join(ROOT, *parts)


def to_img(rgba_float):
    arr = np.clip(rgba_float * 255.0, 0, 255).astype(np.uint8)
    return arr


def radial(size):
    y, x = np.mgrid[0:size, 0:size]
    c = (size - 1) / 2.0
    return np.sqrt((x - c) ** 2 + (y - c) ** 2) / c


def white_alpha(alpha):
    """White texture whose alpha carries the shape (tinted by vertex colour in game)."""
    h, w = alpha.shape
    out = np.ones((h, w, 4))
    out[:, :, 3] = np.clip(alpha, 0, 1)
    return to_img(out)


# ------------------------------------------------------------------ effect textures (textures/fx)

def fx_glow():
    r = radial(64)
    a = np.clip(1.0 - r, 0, 1) ** 2.2
    save(white_alpha(a), path('fx', 'glow.png'))


def fx_ring():
    r = radial(64)
    a = np.exp(-((r - 0.82) / 0.07) ** 2) + 0.35 * np.exp(-((r - 0.55) / 0.03) ** 2)
    # dashed segments for a holographic look
    y, x = np.mgrid[0:64, 0:64]
    ang = np.arctan2(y - 31.5, x - 31.5)
    dash = (np.sin(ang * 12) > -0.4).astype(float) * 0.6 + 0.4
    a = a * dash
    a[r > 1.0] = 0
    save(white_alpha(np.clip(a, 0, 1)), path('fx', 'ring.png'))


def fx_flare():
    size = 128
    y, x = np.mgrid[0:size, 0:size]
    c = (size - 1) / 2.0
    dx = (x - c) / c
    dy = (y - c) / c
    r = np.sqrt(dx * dx + dy * dy)
    spikes = np.exp(-np.abs(dx) * 40) * np.clip(1 - np.abs(dy), 0, 1) ** 1.5 + np.exp(-np.abs(dy) * 40) * np.clip(1 - np.abs(dx), 0, 1) ** 1.5
    diag1 = np.exp(-np.abs(dx - dy) * 55) * np.clip(1 - r, 0, 1) ** 2 * 0.5
    diag2 = np.exp(-np.abs(dx + dy) * 55) * np.clip(1 - r, 0, 1) ** 2 * 0.5
    core = np.clip(1 - r * 3.5, 0, 1) ** 2
    a = np.clip(spikes + diag1 + diag2 + core, 0, 1)
    save(white_alpha(a), path('fx', 'flare.png'))


def fx_beam():
    # cross-section brightness along u, tileable streaks along v
    w, h = 32, 128
    u = (np.arange(w) - (w - 1) / 2) / ((w - 1) / 2)
    profile = np.exp(-(u / 0.35) ** 2) * 0.85 + np.exp(-(u / 0.08) ** 2) * 0.6
    n = noise2(11, w, h, octaves=3, base=4)
    streak = 0.7 + 0.3 * n
    a = np.clip(profile[None, :] * streak, 0, 1)
    save(white_alpha(a), path('fx', 'beam.png'))


def fx_plasma():
    n1 = noise2(21, 64, 64, octaves=4, base=4)
    n2 = noise2(22, 64, 64, octaves=3, base=8)
    v = np.clip(n1 * 0.7 + n2 * 0.5, 0, 1)
    v = (v - v.min()) / (v.max() - v.min())
    rgb = np.zeros((64, 64, 4))
    rgb[:, :, 0] = 1.0
    rgb[:, :, 1] = 0.55 + 0.45 * v
    rgb[:, :, 2] = 0.15 + 0.75 * v ** 3
    rgb[:, :, 3] = 0.6 + 0.4 * v
    save(to_img(rgb), path('fx', 'plasma.png'))


def fx_swirl():
    size = 64
    y, x = np.mgrid[0:size, 0:size]
    n = noise2(31, size, size, octaves=4, base=4)
    bands = 0.5 + 0.5 * np.sin((x / size) * math.pi * 8 + n * 6.0)
    v = np.clip(bands * 0.7 + n * 0.5, 0, 1)
    save(white_alpha(0.25 + 0.75 * v), path('fx', 'swirl.png'))


def fx_shock():
    size = 32
    y, x = np.mgrid[0:size, 0:size]
    edge = np.minimum(np.minimum(x, size - 1 - x), np.minimum(y, size - 1 - y)) / (size / 2)
    a = np.clip(1.0 - edge * 3.0, 0, 1) ** 2 + 0.08
    save(white_alpha(np.clip(a, 0, 1)), path('fx', 'shock.png'))


# ------------------------------------------------------------------ particles (textures/particle)

def particle_glow():
    r = radial(16)
    a = np.clip(1.0 - r, 0, 1) ** 1.6
    save(white_alpha(a), path('particle', 'glow.png'))


def particle_star():
    for i, sharp in enumerate((18, 30)):
        size = 16
        y, x = np.mgrid[0:size, 0:size]
        c = 7.5
        dx = (x - c) / c
        dy = (y - c) / c
        r = np.sqrt(dx * dx + dy * dy)
        a = np.exp(-np.abs(dx) * sharp) * np.clip(1 - np.abs(dy), 0, 1) + np.exp(-np.abs(dy) * sharp) * np.clip(1 - np.abs(dx), 0, 1)
        a += np.clip(1 - r * 2.5, 0, 1)
        save(white_alpha(np.clip(a, 0, 1)), path('particle', 'star_%d.png' % i))


def particle_ring():
    r = radial(32)
    a = np.exp(-((r - 0.8) / 0.09) ** 2)
    a[r > 1] = 0
    save(white_alpha(a), path('particle', 'ring.png'))


def particle_shards():
    for i in range(4):
        img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        rng = np.random.default_rng(100 + i)
        cx, cy = 8, 8
        pts = []
        n = 3 + i % 2
        for k in range(n):
            ang = k * 2 * math.pi / n + rng.random() * 0.8
            rad = 3 + rng.random() * 4.5
            pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
        d.polygon(pts, fill=(255, 255, 255, 230))
        d.line(pts + [pts[0]], fill=(255, 255, 255, 255))
        save(np.array(img), path('particle', 'shard_%d.png' % i))


def particle_spark():
    size = 16
    y, x = np.mgrid[0:size, 0:size]
    c = 7.5
    dx = (x - c) / c
    dy = (y - c) / c
    a = np.exp(-(dx / 0.18) ** 2) * np.clip(1 - np.abs(dy), 0, 1) ** 0.7 + np.clip(1 - np.sqrt(dx * dx + dy * dy) * 3, 0, 1)
    save(white_alpha(np.clip(a, 0, 1)), path('particle', 'spark.png'))


def particle_smoke():
    for i in range(8):
        size = 16
        n = noise2(200 + i, size, size, octaves=2, base=4)
        r = radial(size)
        a = np.clip(1.0 - r, 0, 1) ** 1.2 * (0.55 + 0.45 * n)
        a *= 0.85 - i * 0.06
        save(white_alpha(np.clip(a, 0, 1)), path('particle', 'smoke_%d.png' % i))


def particle_plasma():
    for i in range(4):
        size = 16
        n = noise2(300 + i, size, size, octaves=2, base=4)
        r = radial(size)
        a = np.clip(1.0 - r * (1.0 + i * 0.15), 0, 1) ** 1.4 * (0.6 + 0.4 * n)
        save(white_alpha(np.clip(a * 1.4, 0, 1)), path('particle', 'plasma_%d.png' % i))


# ------------------------------------------------------------------ entities

def entity_asteroid():
    size = 64
    n1 = noise2(41, size, size, octaves=5, base=4)
    n2 = noise2(42, size, size, octaves=3, base=8)
    v = n1 * 0.65 + n2 * 0.35
    base = np.zeros((size, size, 4))
    dark = np.array([0.20, 0.16, 0.14])
    light = np.array([0.55, 0.42, 0.33])
    for ch in range(3):
        base[:, :, ch] = dark[ch] + (light[ch] - dark[ch]) * v
    base[:, :, 3] = 1.0
    # craters
    rng = np.random.default_rng(5)
    y, x = np.mgrid[0:size, 0:size]
    for _ in range(14):
        cx, cy, cr = rng.random() * size, rng.random() * size, 2 + rng.random() * 6
        d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / cr
        rim = np.exp(-((d - 1.0) / 0.25) ** 2) * 0.15
        pit = np.clip(1 - d, 0, 1) * -0.18
        base[:, :, :3] += (rim + pit)[:, :, None]
    save(to_img(np.clip(base, 0, 1)), path('entity', 'asteroid.png'))
    # glowing magma cracks (additive overlay)
    cracks = noise2(43, size, size, octaves=4, base=6)
    lines = np.exp(-((cracks - 0.5) / 0.035) ** 2)
    glow = np.zeros((size, size, 4))
    glow[:, :, 0] = 1.0
    glow[:, :, 1] = 0.45 + 0.4 * lines
    glow[:, :, 2] = 0.1 * lines
    glow[:, :, 3] = np.clip(lines * 1.2, 0, 1)
    save(to_img(glow), path('entity', 'asteroid_glow.png'))


def entity_fist():
    size = 32
    n = noise2(51, size, size, octaves=3, base=4)
    y, x = np.mgrid[0:size, 0:size]
    edge = np.minimum(np.minimum(x, size - 1 - x), np.minimum(y, size - 1 - y)) / (size / 2)
    a = 0.35 + 0.35 * n + np.clip(1.0 - edge * 4.0, 0, 1) * 0.6
    hexgrid = (np.abs(np.sin(x * 0.8) * np.sin(y * 0.8 + x * 0.3)) < 0.08).astype(float) * 0.4
    save(white_alpha(np.clip(a + hexgrid, 0, 1)), path('entity', 'kinetic_fist.png'))


# ------------------------------------------------------------------ block: kinetic fracture (animated)

def block_fracture():
    frames = []
    size = 16
    base = noise2(61, size, size, octaves=3, base=4)
    crack = noise2(62, size, size, octaves=3, base=4)
    lines = np.exp(-((crack - 0.5) / 0.06) ** 2)
    for f in range(8):
        img = np.zeros((size, size, 4))
        stone = 0.18 + 0.18 * base
        img[:, :, 0] = stone
        img[:, :, 1] = stone
        img[:, :, 2] = stone + 0.04
        pulse = 0.65 + 0.35 * math.sin(f / 8 * 2 * math.pi)
        glow = np.clip(lines * pulse, 0, 1)
        img[:, :, 0] = img[:, :, 0] * (1 - glow) + glow * 0.45
        img[:, :, 1] = img[:, :, 1] * (1 - glow) + glow * 0.95
        img[:, :, 2] = img[:, :, 2] * (1 - glow) + glow * 1.0
        img[:, :, 3] = 1.0
        frames.append(to_img(img))
    save_anim(frames, path('block', 'kinetic_fracture.png'), frametime=3, interpolate=True)


# ------------------------------------------------------------------ misc: screen cracks overlay, mod icon

def misc_cracks():
    size = 256
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rng = np.random.default_rng(77)
    centers = [(size * 0.5, size * 0.5), (size * 0.2, size * 0.3), (size * 0.8, size * 0.75)]
    for cx, cy in centers:
        for k in range(9):
            ang = rng.random() * 2 * math.pi
            x, y = cx, cy
            width = 3
            for step in range(14):
                ang += (rng.random() - 0.5) * 0.7
                nx = x + math.cos(ang) * (8 + rng.random() * 12)
                ny = y + math.sin(ang) * (8 + rng.random() * 12)
                d.line([(x, y), (nx, ny)], fill=(255, 255, 255, 230), width=max(1, width))
                if rng.random() < 0.25:
                    bang = ang + (rng.random() - 0.5) * 2
                    d.line([(nx, ny), (nx + math.cos(bang) * 14, ny + math.sin(bang) * 14)], fill=(255, 255, 255, 160), width=1)
                x, y = nx, ny
                if step % 4 == 3 and width > 1:
                    width -= 1
    glow = img.filter(ImageFilter.GaussianBlur(2.5))
    out = Image.alpha_composite(glow, img)
    save(np.array(out), path('misc', 'screen_cracks.png'))


def mod_icon():
    # 128x128 icon: the divine core over a starburst
    size = 128
    y, x = np.mgrid[0:size, 0:size]
    c = 63.5
    dx = (x - c) / c
    dy = (y - c) / c
    r = np.sqrt(dx * dx + dy * dy)
    ang = np.arctan2(dy, dx)
    bg = np.zeros((size, size, 4))
    bg[:, :, 0] = 0.06 + 0.05 * (1 - r)
    bg[:, :, 1] = 0.04 + 0.03 * (1 - r)
    bg[:, :, 2] = 0.12 + 0.12 * (1 - r)
    bg[:, :, 3] = 1.0
    rays = np.clip(np.cos(ang * 10) * 0.5 + 0.5, 0, 1) ** 6 * np.clip(1 - r, 0, 1)
    hue = (ang / (2 * math.pi) + 0.5)
    for ch, off in enumerate((0.0, 0.33, 0.66)):
        col = 0.5 + 0.5 * np.cos((hue + off) * 2 * math.pi)
        bg[:, :, ch] += rays * col * 0.9
    dia = np.abs(dx) / 0.42 + np.abs(dy) / 0.62
    gem = dia <= 1.0
    for ch, off in enumerate((0.0, 0.33, 0.66)):
        col = 0.55 + 0.45 * np.cos((hue + off) * 2 * math.pi)
        shade = np.where(dx * dy > 0, 1.0, 0.75)
        bg[:, :, ch] = np.where(gem, col * shade, bg[:, :, ch])
    core = np.clip(1 - dia / 0.35, 0, 1)
    bg[:, :, :3] = bg[:, :, :3] * (1 - core[:, :, None]) + core[:, :, None]
    outline = (dia > 0.93) & (dia <= 1.0)
    bg[outline, :3] = [1.0, 0.95, 0.75]
    img = Image.fromarray(to_img(np.clip(bg, 0, 1)), 'RGBA')
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=22, fill=255)
    img.putalpha(mask)
    os.makedirs(os.path.join(ROOT, '..'), exist_ok=True)
    img.save(os.path.join(ROOT, '..', 'icon.png'))


def main():
    fx_glow()
    fx_ring()
    fx_flare()
    fx_beam()
    fx_plasma()
    fx_swirl()
    fx_shock()
    particle_glow()
    particle_star()
    particle_ring()
    particle_shards()
    particle_spark()
    particle_smoke()
    particle_plasma()
    entity_asteroid()
    entity_fist()
    block_fracture()
    misc_cracks()
    mod_icon()
    print('fx textures written')


if __name__ == '__main__':
    main()
