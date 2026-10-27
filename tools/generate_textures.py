#!/usr/bin/env python3
"""Procedurally generates RealWeather's textures (requires numpy and Pillow).

    python3 tools/generate_textures.py

Everything is drawn analytically at high resolution and downsampled, so streaks and flakes are smooth and
anti-aliased. Precipitation textures tile seamlessly in both directions.
"""

import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join("src", "client", "resources", "assets", "realweather")
ENV = os.path.join(ROOT, "textures", "environment")
PARTICLE = os.path.join(ROOT, "textures", "particle")


def save(image, folder, name, blur=False):
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name + ".png")
    image.save(path, optimize=True)
    if blur:
        with open(path + ".mcmeta", "w") as f:
            json.dump({"texture": {"blur": True}}, f, indent=2)
            f.write("\n")
    print(f"  {path}")


def rgba(alpha, rgb):
    h, w = alpha.shape
    out = np.zeros((h, w, 4), dtype=np.float64)
    out[..., 0] = rgb[0]
    out[..., 1] = rgb[1]
    out[..., 2] = rgb[2]
    out[..., 3] = np.clip(alpha, 0.0, 1.0)
    return Image.fromarray((out * 255.0 + 0.5).astype(np.uint8), "RGBA")


def premultiplied_to_image(color, alpha):
    """color is premultiplied (accumulated) RGB; converts to straight alpha."""
    a = np.clip(alpha, 0.0, 1.0)
    safe = np.maximum(a, 1e-6)[..., None]
    rgb = np.clip(color / safe, 0.0, 1.0)
    out = np.concatenate([rgb, a[..., None]], axis=-1)
    return Image.fromarray((out * 255.0 + 0.5).astype(np.uint8), "RGBA")


# ---------------------------------------------------------------------------------------------------------------
# Precipitation sheets
# ---------------------------------------------------------------------------------------------------------------

def rain_sheet(rng, width, height, count, length_range, alpha_range, width_px):
    """Thin, motion-blurred rain streaks, brighter at the leading (lower) end, tiling in both directions."""
    alpha = np.zeros((height, width))
    ys = np.arange(height)[:, None]
    xs = np.arange(width)[None, :]
    for _ in range(count):
        x0 = rng.uniform(0, width)
        y_head = rng.uniform(0, height)
        length = rng.uniform(*length_range)
        a = rng.uniform(*alpha_range)
        w = width_px * rng.uniform(0.7, 1.3)
        for dx in (-width, 0, width):
            dist_x = np.abs(xs - (x0 + dx))
            if dist_x.min() > 4:
                continue
            profile_x = np.exp(-0.5 * (dist_x / (w * 0.5)) ** 2)
            for dy in (-height, 0, height):
                head = y_head + dy
                t = (head - ys) / length  # 0 at the head, 1 at the tail end (above)
                along = np.where((t >= -0.05) & (t <= 1.0), np.clip(1.0 - t, 0.0, 1.0) ** 1.6, 0.0)
                along = along * np.clip((t + 0.05) / 0.08, 0.0, 1.0)
                alpha = np.maximum(alpha, a * along * profile_x)
    return alpha


def snow_sheet(rng, width, height, count, radius_range, alpha_range, streak=0.0):
    """Soft snowflakes of varied size, a few clumped aggregates, optional slight motion blur."""
    scale = 4
    W, H = width * scale, height * scale
    alpha = np.zeros((H, W))
    for _ in range(count):
        cx = rng.uniform(0, W)
        cy = rng.uniform(0, H)
        r = math.exp(rng.uniform(math.log(radius_range[0]), math.log(radius_range[1]))) * scale
        a = rng.uniform(*alpha_range)
        blobs = 1 if rng.uniform() < 0.7 else rng.integers(2, 5)
        for b in range(blobs):
            bx = cx + (rng.uniform(-1, 1) * r * 0.8 if b else 0.0)
            by = cy + (rng.uniform(-1, 1) * r * 0.8 if b else 0.0)
            br = r * (1.0 if b == 0 else rng.uniform(0.5, 0.8))
            stretch = 1.0 + streak * rng.uniform(0.5, 1.5)
            x0, x1 = int(bx - br * 3), int(bx + br * 3) + 1
            y0, y1 = int(by - br * 3 * stretch), int(by + br * 3 * stretch) + 1
            yy, xx = np.mgrid[y0:y1, x0:x1]
            d = np.sqrt(((xx - bx) / br) ** 2 + ((yy - by) / (br * stretch)) ** 2)
            value = a * np.clip(1.15 - d, 0.0, 1.0) ** 1.4
            alpha[yy % H, xx % W] = np.maximum(alpha[yy % H, xx % W], value)
    small = Image.fromarray((np.clip(alpha, 0, 1) * 255).astype(np.uint8), "L").resize((width, height), Image.LANCZOS)
    return np.asarray(small) / 255.0


def fbm(rng, width, height, octaves, base_cells, stretch_y=1.0):
    """Tileable value-noise fbm in [0, 1]."""
    total = np.zeros((height, width))
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        cells_x = base_cells * 2 ** o
        cells_y = max(1, int(base_cells * 2 ** o / stretch_y))
        grid = rng.uniform(size=(cells_y, cells_x))
        ys = np.linspace(0, cells_y, height, endpoint=False)
        xs = np.linspace(0, cells_x, width, endpoint=False)
        y0 = np.floor(ys).astype(int)
        x0 = np.floor(xs).astype(int)
        fy = ys - y0
        fx = xs - x0
        fy = fy * fy * (3 - 2 * fy)
        fx = fx * fx * (3 - 2 * fx)
        y1 = (y0 + 1) % cells_y
        x1 = (x0 + 1) % cells_x
        a = grid[y0][:, x0]
        b = grid[y0][:, x1]
        c = grid[y1][:, x0]
        d = grid[y1][:, x1]
        layer = (a * (1 - fx) + b * fx) * (1 - fy)[:, None] + (c * (1 - fx) + d * fx) * fy[:, None]
        total += amp * layer
        norm += amp
        amp *= 0.55
    return total / norm


def curtain(rng, snow):
    width, height = 256, 256
    streaks = fbm(rng, width, height, 5, 6, stretch_y=6.0 if not snow else 2.0)
    body = fbm(rng, width, height, 3, 2, stretch_y=1.5)
    alpha = np.clip((streaks - 0.35) * 1.8, 0.0, 1.0) * np.clip((body - 0.2) * 1.6, 0.25, 1.0)
    # Soften the left/right edges so the 18-block wide sheets blend into each other.
    edge = np.sin(np.linspace(0, math.pi, width)) ** 0.6
    alpha *= edge[None, :]
    color = (0.93, 0.95, 1.0) if not snow else (1.0, 1.0, 1.0)
    return rgba(alpha * (0.75 if not snow else 0.85), color)


# ---------------------------------------------------------------------------------------------------------------
# Particle sprites
# ---------------------------------------------------------------------------------------------------------------

def supersampled(size, draw_fn, scale=8):
    big = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(big), size * scale)
    return big.resize((size, size), Image.LANCZOS)


def splash_frames():
    frames = []
    specs = [
        # (crown height, crown width, droplet height, droplet spread, alpha)
        (0.10, 0.22, 0.00, 0.00, 1.0),
        (0.28, 0.42, 0.40, 0.30, 1.0),
        (0.40, 0.62, 0.62, 0.42, 0.95),
        (0.26, 0.78, 0.72, 0.55, 0.8),
        (0.10, 0.86, 0.50, 0.62, 0.55),
    ]
    for crown_h, crown_w, drop_h, drop_spread, a in specs:
        def draw(d, s, crown_h=crown_h, crown_w=crown_w, drop_h=drop_h, drop_spread=drop_spread, a=a):
            base = s * 0.92
            cx = s / 2
            alpha = int(255 * a)
            col = (225, 235, 250, alpha)
            # Crown sheet: an open cup of water thrown up around the impact.
            for i in range(7):
                t = i / 6.0
                x = cx + (t - 0.5) * crown_w * s
                h = crown_h * s * (0.65 + 0.35 * math.sin(t * math.pi))
                d.line([(x, base), (x + (t - 0.5) * s * 0.08, base - h)], fill=col, width=max(1, int(s * 0.035)))
            d.ellipse([cx - crown_w * s / 2, base - s * 0.03, cx + crown_w * s / 2, base + s * 0.03], outline=col, width=max(1, int(s * 0.03)))
            if drop_h > 0:
                for k in range(5):
                    t = (k + 0.5) / 5.0
                    x = cx + (t - 0.5) * 2 * drop_spread * s / 2
                    y = base - drop_h * s * (0.75 + 0.25 * math.sin(t * math.pi))
                    r = s * 0.035
                    d.ellipse([x - r, y - r, x + r, y + r], fill=col)
        frames.append(supersampled(16, draw))
    return frames


def droplet():
    def draw(d, s):
        r = s * 0.32
        d.ellipse([s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r], fill=(220, 232, 255, 230))
        hr = r * 0.35
        d.ellipse([s / 2 - r * 0.4 - hr, s / 2 - r * 0.4 - hr, s / 2 - r * 0.4 + hr, s / 2 - r * 0.4 + hr], fill=(255, 255, 255, 255))
    return supersampled(8, draw)


def ripple(double):
    size = 32
    yy, xx = np.mgrid[0:size * 4, 0:size * 4] / 4.0
    d = np.sqrt((xx - size / 2 + 0.125) ** 2 + (yy - size / 2 + 0.125) ** 2)
    ring = np.exp(-0.5 * ((d - size * 0.43) / 0.7) ** 2)
    if double:
        ring = np.maximum(ring, 0.6 * np.exp(-0.5 * ((d - size * 0.29) / 0.6) ** 2))
    alpha = Image.fromarray((np.clip(ring, 0, 1) * 255).astype(np.uint8), "L").resize((size, size), Image.LANCZOS)
    return rgba(np.asarray(alpha) / 255.0 * 0.95, (0.92, 0.95, 1.0))


def snowflake(index, rng):
    size = 16
    s = size * 8
    img = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(img)
    c = s / 2
    if index < 3:
        # Soft rounded aggregates of different sizes.
        r = s * (0.18 + 0.08 * index)
        for _ in range(3 + index):
            ox, oy = rng.uniform(-r * 0.5, r * 0.5, size=2)
            rr = r * rng.uniform(0.55, 0.9)
            d.ellipse([c + ox - rr, c + oy - rr, c + ox + rr, c + oy + rr], fill=255)
        img = img.filter(ImageFilter.GaussianBlur(s * 0.06))
    else:
        # Six-armed dendrite crystals, slightly soft.
        arm = s * (0.40 + 0.03 * index)
        width = max(2, int(s * 0.05))
        rot = rng.uniform(0, math.pi / 3)
        for k in range(6):
            a = rot + k * math.pi / 3
            x1, y1 = c + math.cos(a) * arm, c + math.sin(a) * arm
            d.line([(c, c), (x1, y1)], fill=255, width=width)
            for t in (0.45, 0.7):
                bx, by = c + math.cos(a) * arm * t, c + math.sin(a) * arm * t
                for side in (-1, 1):
                    ba = a + side * math.pi / 3.2
                    bl = arm * (0.32 if t < 0.6 else 0.22)
                    d.line([(bx, by), (bx + math.cos(ba) * bl, by + math.sin(ba) * bl)], fill=255, width=max(1, width - 2))
        img = img.filter(ImageFilter.GaussianBlur(s * 0.025))
    alpha = np.asarray(img.resize((size, size), Image.LANCZOS)) / 255.0
    return rgba(alpha, (1.0, 1.0, 1.0))


def leaf(index, rng):
    size = 16
    s = size * 8
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = s / 2
    length = s * (0.40 + 0.04 * index)
    widthf = s * (0.16 + 0.03 * ((index * 7) % 3))
    angle = rng.uniform(0, math.pi)
    pts = []
    for i in range(40):
        t = i / 39.0
        # Leaf outline: pointed tip, rounded base.
        w = widthf * math.sin(math.pi * t) ** 0.8 * (1.0 - 0.3 * t)
        pts.append((t, w))
    outline = [(c + math.cos(angle) * (t - 0.5) * 2 * length - math.sin(angle) * w, c + math.sin(angle) * (t - 0.5) * 2 * length + math.cos(angle) * w)
               for t, w in pts]
    outline += [(c + math.cos(angle) * (t - 0.5) * 2 * length + math.sin(angle) * w, c + math.sin(angle) * (t - 0.5) * 2 * length - math.cos(angle) * w)
                for t, w in reversed(pts)]
    shade = int(200 + 12 * index)
    d.polygon(outline, fill=(shade, shade, shade, 255))
    vein = int(shade * 0.72)
    d.line([(c - math.cos(angle) * length, c - math.sin(angle) * length), (c + math.cos(angle) * length, c + math.sin(angle) * length)],
           fill=(vein, vein, vein, 255), width=max(2, int(s * 0.03)))
    return img.resize((size, size), Image.LANCZOS)


def mist(index, rng):
    size = 64
    noise = fbm(rng, size, size, 4, 3)
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.sqrt((xx - size / 2 + 0.5) ** 2 + (yy - size / 2 + 0.5) ** 2) / (size / 2)
    falloff = np.clip(1.0 - d, 0.0, 1.0) ** 1.6
    alpha = np.clip(falloff * (0.45 + 0.9 * noise) - 0.05, 0.0, 1.0)
    return rgba(alpha, (1.0, 1.0, 1.0))


# ---------------------------------------------------------------------------------------------------------------
# Icon
# ---------------------------------------------------------------------------------------------------------------

def icon():
    s = 512
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:s, 0:s] / s
    # Stormy gradient background in a rounded square.
    top = np.array([0.20, 0.24, 0.33])
    bottom = np.array([0.42, 0.50, 0.62])
    bg = top[None, None, :] * (1 - yy[..., None]) + bottom[None, None, :] * yy[..., None]
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.18), fill=255)
    base = Image.fromarray((bg * 255).astype(np.uint8), "RGB").convert("RGBA")
    base.putalpha(mask)
    img = Image.alpha_composite(img, base)
    d = ImageDraw.Draw(img)
    # Rain streaks.
    rng = np.random.default_rng(3)
    for _ in range(26):
        x = rng.uniform(0.12, 0.88) * s
        y = rng.uniform(0.58, 0.86) * s
        d.line([(x, y), (x - s * 0.03, y + s * 0.09)], fill=(190, 210, 240, 200), width=int(s * 0.012))
    # Lightning bolt.
    bolt = [(0.56, 0.42), (0.44, 0.64), (0.53, 0.64), (0.42, 0.90), (0.66, 0.56), (0.56, 0.56), (0.64, 0.42)]
    d.polygon([(x * s, y * s) for x, y in bolt], fill=(255, 236, 140, 255))
    # Cloud made of overlapping puffs with a darker underside.
    cloud = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cloud)
    puffs = [(0.30, 0.42, 0.15), (0.46, 0.33, 0.19), (0.64, 0.38, 0.16), (0.78, 0.46, 0.11), (0.20, 0.50, 0.10), (0.50, 0.47, 0.17)]
    for x, y, r in puffs:
        cd.ellipse([(x - r) * s, (y - r) * s, (x + r) * s, (y + r) * s], fill=(238, 241, 246, 255))
    cd.rectangle([0.20 * s, 0.47 * s, 0.82 * s, 0.57 * s], fill=(238, 241, 246, 255))
    shade = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(shade).rectangle([0, 0.48 * s, s, s], fill=(120, 130, 150, 255))
    cloud_alpha = cloud.split()[3]
    under = Image.composite(shade, cloud, Image.fromarray((np.clip((yy - 0.47) * 8, 0, 1) * 255).astype(np.uint8)))
    under.putalpha(cloud_alpha)
    under = under.filter(ImageFilter.GaussianBlur(1.5))
    img = Image.alpha_composite(img, under)
    return img.resize((128, 128), Image.LANCZOS)


def main():
    rng = np.random.default_rng(1221)
    print("Environment:")
    save(rgba(rain_sheet(rng, 128, 512, 34, (40, 120), (0.30, 0.62), 1.5), (0.82, 0.86, 0.93)), ENV, "rain_light", blur=True)
    save(rgba(rain_sheet(rng, 128, 512, 115, (55, 170), (0.30, 0.75), 1.7), (0.84, 0.88, 0.95)), ENV, "rain_heavy", blur=True)
    save(rgba(snow_sheet(rng, 128, 256, 70, (0.8, 2.6), (0.55, 0.95)), (1.0, 1.0, 1.0)), ENV, "snow_light", blur=True)
    save(rgba(snow_sheet(rng, 128, 256, 230, (0.6, 2.2), (0.45, 0.95), streak=0.8), (1.0, 1.0, 1.0)), ENV, "snow_heavy", blur=True)
    save(curtain(rng, False), ENV, "rain_curtain", blur=True)
    save(curtain(rng, True), ENV, "snow_curtain", blur=True)
    print("Particles:")
    for i, frame in enumerate(splash_frames()):
        save(frame, PARTICLE, f"splash_{i}")
    save(droplet(), PARTICLE, "droplet")
    save(ripple(False), PARTICLE, "ripple_0")
    save(ripple(True), PARTICLE, "ripple_1")
    for i in range(6):
        save(snowflake(i, rng), PARTICLE, f"snowflake_{i}")
    for i in range(4):
        save(leaf(i, rng), PARTICLE, f"leaf_{i}")
    for i in range(3):
        save(mist(i, rng), PARTICLE, f"mist_{i}")
    print("Icon:")
    save(icon(), os.path.join("src", "main", "resources", "assets", "realweather"), "icon")


if __name__ == "__main__":
    main()
