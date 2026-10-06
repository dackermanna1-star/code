"""Generates every texture the Gojo Satoru mod uses.

Run from the project root:  python3 tools/gen_textures.py
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src")
ASSETS = os.path.join(ROOT, "main", "resources", "assets", "gojo", "textures")


def save(img, *path):
    out = os.path.join(ASSETS, *path)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)


def clamp(v, lo=0, hi=255):
    return max(lo, min(hi, int(round(v))))


# ---------------------------------------------------------------- skin ---

HAIR = (246, 248, 252)
HAIR_SHADE = (222, 228, 240)
HAIR_DEEP = (194, 204, 224)
HAIR_LIGHT = (255, 255, 255)
SKIN = (247, 223, 206)
SKIN_SHADE = (228, 198, 180)
SKIN_DEEP = (205, 168, 152)
MOUTH = (226, 180, 170)
BAND = (24, 24, 29)
BAND_EDGE = (48, 48, 58)
COAT = (25, 27, 40)
COAT_SHADE = (16, 17, 27)
COAT_LIGHT = (40, 44, 64)
GOLD = (226, 186, 84)
GOLD_SHADE = (170, 128, 52)
PANTS = (27, 29, 43)
SHOE = (16, 16, 19)
SHOE_LIGHT = (44, 44, 50)
LASH = (236, 242, 252)
EYE_DEEP = (36, 140, 255)
EYE_LIGHT = (160, 236, 255)

# Box UV layouts: (u, v, width, height, depth)
HEAD, HAT = (0, 0, 8, 8, 8), (32, 0, 8, 8, 8)
BODY, JACKET = (16, 16, 8, 12, 4), (16, 32, 8, 12, 4)
R_ARM, R_SLEEVE = (40, 16, 4, 12, 4), (40, 32, 4, 12, 4)
L_ARM, L_SLEEVE = (32, 48, 4, 12, 4), (48, 48, 4, 12, 4)
R_LEG, R_PANTS = (0, 16, 4, 12, 4), (0, 32, 4, 12, 4)
L_LEG, L_PANTS = (16, 48, 4, 12, 4), (0, 48, 4, 12, 4)


def face(box, name):
    u, v, w, h, d = box
    return {
        "top": (u + d, v, w, d),
        "bottom": (u + d + w, v, w, d),
        "right": (u, v + d, d, h),
        "front": (u + d, v + d, w, h),
        "left": (u + d + w, v + d, d, h),
        "back": (u + d + w + d, v + d, w, h),
    }[name]


class Skin:
    def __init__(self, seed):
        self.img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        self.rng = random.Random(seed)

    def put(self, x, y, color, jitter=4):
        j = self.rng.randint(-jitter, jitter) if jitter else 0
        self.img.putpixel((x, y), (clamp(color[0] + j), clamp(color[1] + j), clamp(color[2] + j), 255))

    def clear(self, x, y):
        self.img.putpixel((x, y), (0, 0, 0, 0))

    def paint(self, box, name, fn, jitter=4):
        """fn(fx, fy, w, h) returns a color, or None for transparent."""
        x0, y0, w, h = face(box, name)
        for fy in range(h):
            for fx in range(w):
                c = fn(fx, fy, w, h)
                if c is None:
                    self.clear(x0 + fx, y0 + fy)
                else:
                    self.put(x0 + fx, y0 + fy, c, jitter)

    def fill_box(self, box, fn, jitter=4):
        for name in ("top", "bottom", "right", "front", "left", "back"):
            self.paint(box, name, lambda fx, fy, w, h, n=name: fn(n, fx, fy, w, h), jitter)


HAIR_TONES = [HAIR_LIGHT, HAIR, HAIR_SHADE, HAIR_DEEP]


def hair_tone(rng, fx, fy):
    """Soft white hair: lighter on top, cooler shadows lower down, with faint strands."""
    level = 0 if fy == 0 else 1 if fy < 4 else 2 if fy < 7 else 3
    if (fx + fy // 2) % 3 == 0:
        level += 1
    roll = rng.random()
    if roll < 0.12:
        level -= 1
    elif roll > 0.9:
        level += 1
    return HAIR_TONES[max(0, min(len(HAIR_TONES) - 1, level))]


def paint_head(s, eyes_open):
    rng = s.rng

    def front(fx, fy, w, h):
        if fy <= 1:
            return hair_tone(rng, fx, fy)
        if eyes_open:
            if fy == 2:
                return hair_tone(rng, fx, fy) if fx in (0, 1, 3, 6, 7) else SKIN_SHADE
            if fy == 3:
                return LASH if fx in (1, 2, 5, 6) else SKIN
            if fy == 4:
                if fx in (1, 6):
                    return EYE_LIGHT
                if fx in (2, 5):
                    return EYE_DEEP
                return SKIN
        else:
            if fy == 2:
                return BAND_EDGE
            if fy in (3, 4):
                return BAND
        if fy == 5:
            if fx in (0, 7):
                return SKIN_SHADE
            return SKIN_SHADE if fx == 4 else SKIN
        if fy == 6:
            if fx in (0, 7):
                return SKIN_SHADE
            return MOUTH if fx in (3, 4) else SKIN
        return SKIN_SHADE if fx in (0, 7) else SKIN

    def side(mirror):
        def fn(fx, fy, w, h):
            x = (w - 1 - fx) if mirror else fx  # x == 7 is next to the face
            if fy <= 1:
                return hair_tone(rng, fx, fy)
            if fy <= 4 and not eyes_open:
                return BAND_EDGE if fy == 2 else BAND
            if x >= 5:
                return SKIN_DEEP if (x == 5 and fy in (5, 6)) else SKIN
            return HAIR_SHADE if x == 4 else hair_tone(rng, fx, fy)
        return fn

    def back(fx, fy, w, h):
        if 2 <= fy <= 4 and not eyes_open:
            if fx in (3, 4) and fy in (3, 4):
                return BAND_EDGE
            return BAND_EDGE if fy == 2 else BAND
        return hair_tone(rng, fx, fy)

    s.paint(HEAD, "top", lambda fx, fy, w, h: hair_tone(rng, fx, fy))
    s.paint(HEAD, "bottom", lambda fx, fy, w, h: SKIN_SHADE if fy < 4 else HAIR_SHADE)
    s.paint(HEAD, "front", front)
    s.paint(HEAD, "right", side(False))
    s.paint(HEAD, "left", side(True))
    s.paint(HEAD, "back", back)

    # Hat layer: spiky hair volume.
    def hat_top(fx, fy, w, h):
        edge = min(fx, fy, w - 1 - fx, h - 1 - fy)
        return hair_tone(rng, fx, fy) if (edge >= 1 or rng.random() < 0.65) else None

    def hat_front(fx, fy, w, h):
        if fy == 0:
            return hair_tone(rng, fx, fy) if rng.random() < 0.85 else None
        if fy == 1:
            return hair_tone(rng, fx, fy) if fx not in (2, 5) else None
        if fy == 2:
            if eyes_open:
                return HAIR_SHADE if fx in (0, 3, 7) else None
            return HAIR if fx in (1, 6) else None
        if eyes_open and fy == 3 and fx in (0, 7):
            return HAIR_SHADE
        return None

    def hat_side(mirror):
        def fn(fx, fy, w, h):
            x = (w - 1 - fx) if mirror else fx
            if fy <= 1:
                return hair_tone(rng, fx, fy) if rng.random() < 0.9 else None
            if fy == 2:
                return hair_tone(rng, fx, fy) if x < 6 else None
            if 3 <= fy <= 4:
                if eyes_open:
                    return HAIR_SHADE if x < 5 and rng.random() < 0.8 else None
                return None
            if fy <= 6:
                return HAIR_SHADE if x < 3 and rng.random() < 0.7 else None
            return None
        return fn

    def hat_back(fx, fy, w, h):
        if not eyes_open and 3 <= fy <= 4 and 2 <= fx <= 5:
            return None  # blindfold knot shows through
        if fy <= 5:
            return hair_tone(rng, fx, fy) if (fy < 5 or rng.random() < 0.6) else None
        if fy == 6:
            return HAIR_SHADE if fx in (1, 3, 4, 6) else None
        return None

    s.paint(HAT, "top", hat_top)
    s.paint(HAT, "bottom", lambda *a: None, 0)
    s.paint(HAT, "front", hat_front)
    s.paint(HAT, "right", hat_side(False))
    s.paint(HAT, "left", hat_side(True))
    s.paint(HAT, "back", hat_back)


def paint_body(s):
    def body(name, fx, fy, w, h):
        if name in ("top", "bottom"):
            return COAT_SHADE
        if fy <= 1:
            return COAT_LIGHT
        if name == "front":
            if fx == 4 and fy >= 2:
                return COAT_SHADE
            if fy == h - 1:
                return COAT_LIGHT
        if name in ("right", "left") and fy >= h - 2:
            return COAT_SHADE
        return COAT if fy < 8 else COAT_SHADE if (fx + fy) % 7 == 0 else COAT

    s.fill_box(BODY, body, 3)

    def jacket(name, fx, fy, w, h):
        if name in ("top", "bottom"):
            return None
        if fy == 0:
            return COAT_LIGHT
        if fy == 1:
            if name == "front" and fx == 3:
                return GOLD
            if name == "front" and fx == 4:
                return GOLD_SHADE
            return COAT
        return None

    s.fill_box(JACKET, jacket, 2)

    def arm(name, fx, fy, w, h):
        if name == "top":
            return COAT_LIGHT
        if name == "bottom":
            return SKIN_SHADE
        if fy >= 10:
            return SKIN if fy == 10 else SKIN_SHADE
        if fy == 9:
            return COAT_LIGHT
        return COAT if fy > 0 else COAT_LIGHT

    for box in (R_ARM, L_ARM):
        s.fill_box(box, arm, 3)
    for box in (R_SLEEVE, L_SLEEVE):
        s.fill_box(box, lambda *a: None, 0)

    def leg(name, fx, fy, w, h):
        if name == "top":
            return PANTS
        if name == "bottom":
            return SHOE
        if fy >= 10:
            return SHOE_LIGHT if (fy == 10 and name == "front") else SHOE
        return PANTS if fx != 0 or name != "front" else COAT_SHADE

    for box in (R_LEG, L_LEG):
        s.fill_box(box, leg, 3)
    for box in (R_PANTS, L_PANTS):
        s.fill_box(box, lambda *a: None, 0)


def make_skin(eyes_open):
    s = Skin(seed=1989 if not eyes_open else 1990)
    paint_body(s)
    paint_head(s, eyes_open)
    return s.img


def make_eye_glow():
    """Only the eyes, drawn full-bright on top of the Six Eyes skin so they shine in the dark."""
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    x0, y0, _, _ = face(HEAD, "front")
    for fx, color in ((1, (150, 236, 255, 255)), (2, (70, 175, 255, 255)), (5, (70, 175, 255, 255)), (6, (150, 236, 255, 255))):
        img.putpixel((x0 + fx, y0 + 4), color)
    return img


# ------------------------------------------------------------- effects ---

def radial(size, fn):
    img = Image.new("RGBA", (size, size))
    c = (size - 1) / 2.0
    for y in range(size):
        for x in range(size):
            dx, dy = (x - c) / c, (y - c) / c
            r = math.hypot(dx, dy)
            img.putpixel((x, y), fn(r, math.atan2(dy, dx)))
    return img


def glow_px(i):
    """Additive-friendly pixel: brightness lives in RGB and alpha."""
    i = max(0.0, min(1.0, i))
    return (clamp(255 * i), clamp(255 * i), clamp(255 * i), clamp(255 * min(1.0, i * 4)))


def soft_glow():
    return radial(64, lambda r, a: glow_px((1 - r) ** 2.4 if r < 1 else 0))


def core_glow():
    return radial(64, lambda r, a: glow_px(1.0 if r < 0.55 else max(0.0, 1 - (r - 0.55) / 0.45) ** 1.6 if r < 1 else 0))


def swirl(arms, twist):
    def fn(r, a):
        if r >= 1:
            return glow_px(0)
        wave = 0.5 + 0.5 * math.cos(arms * a + twist * r * math.pi)
        fall = (1 - r) ** 1.2 * min(1.0, r * 3)
        return glow_px((wave ** 3) * fall * 1.1)
    return radial(64, fn)


def ring():
    def fn(r, a):
        d = abs(r - 0.82)
        return glow_px(max(0.0, 1 - d / 0.16) ** 2)
    return radial(64, fn)


def particle_dot():
    def fn(r, a):
        i = max(0.0, 1 - r) ** 1.6
        return (255, 255, 255, clamp(255 * i))
    return radial(16, fn)


def particle_spark():
    img = Image.new("RGBA", (16, 16))
    c = 7.5
    for y in range(16):
        for x in range(16):
            dx, dy = abs(x - c), abs(y - c)
            arm = max(0.0, 1 - dx / 1.2) * max(0.0, 1 - dy / 7.5) + max(0.0, 1 - dy / 1.2) * max(0.0, 1 - dx / 7.5)
            core = max(0.0, 1 - math.hypot(dx, dy) / 3.5)
            img.putpixel((x, y), (255, 255, 255, clamp(255 * min(1.0, arm + core))))
    return img


def particle_ring():
    def fn(r, a):
        d = abs(r - 0.75)
        return (255, 255, 255, clamp(255 * max(0.0, 1 - d / 0.25) ** 1.5))
    return radial(16, fn)


# ------------------------------------------------------- domain block ---

def void_block():
    frames = 8
    rng = random.Random(42)
    base = [[(clamp(6 + rng.randint(-3, 3)), clamp(6 + rng.randint(-3, 3)), clamp(16 + rng.randint(-4, 4)))
             for _ in range(16)] for _ in range(16)]
    stars = [(rng.randrange(16), rng.randrange(16), rng.random() * math.tau, rng.choice([0, 0, 1])) for _ in range(9)]
    img = Image.new("RGBA", (16, 16 * frames))
    for f in range(frames):
        for y in range(16):
            for x in range(16):
                img.putpixel((x, y + 16 * f), base[y][x] + (255,))
        for (sx, sy, ph, blue) in stars:
            tw = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(ph + f / frames * math.tau))
            col = (150, 210, 255) if blue else (255, 255, 255)
            px = tuple(clamp(c * tw) for c in col) + (255,)
            img.putpixel((sx, sy + 16 * f), px)
        # one bigger twinkling star per frame set
        bx, by = 11, 4
        tw = 0.5 + 0.5 * math.sin(f / frames * math.tau)
        for (ox, oy, k) in ((0, 0, 1.0), (1, 0, 0.5), (-1, 0, 0.5), (0, 1, 0.5), (0, -1, 0.5)):
            v = clamp(255 * tw * k)
            img.putpixel((bx + ox, by + oy + 16 * f), (v, v, clamp(v * 1.0 + 20), 255))
    return img


# ------------------------------------------------------------- HUD art ---

def orb_icon(inner, outer):
    big = 128
    img = Image.new("RGBA", (big, big))
    c = (big - 1) / 2
    for y in range(big):
        for x in range(big):
            r = math.hypot(x - c, y - c) / (big / 2)
            if r > 1:
                continue
            t = min(1.0, r / 0.85)
            col = tuple(clamp(inner[i] * (1 - t) + outer[i] * t) for i in range(3))
            a = 255 if r < 0.85 else clamp(255 * (1 - (r - 0.85) / 0.15))
            img.putpixel((x, y), col + (a,))
    d = ImageDraw.Draw(img)
    d.ellipse((34, 26, 58, 44), fill=(255, 255, 255, 170))
    return img.resize((32, 32), Image.LANCZOS)


def infinity_icon():
    big = 128
    img = Image.new("RGBA", (big, big))
    d = ImageDraw.Draw(img)
    pts = []
    for i in range(200):
        t = i / 200 * math.tau
        s = 1 + math.sin(t) ** 2
        pts.append((64 + 52 * math.cos(t) / s, 64 + 52 * math.sin(t) * math.cos(t) / s))
    d.line(pts + [pts[0]], fill=(120, 220, 255, 255), width=14)
    d.line(pts + [pts[0]], fill=(230, 250, 255, 255), width=5)
    return img.resize((32, 32), Image.LANCZOS)


def domain_icon():
    big = 128
    img = Image.new("RGBA", (big, big))
    d = ImageDraw.Draw(img)
    d.ellipse((4, 4, 124, 124), fill=(10, 10, 24, 255), outline=(120, 200, 255, 255), width=8)
    # eye
    d.ellipse((24, 44, 104, 84), fill=(235, 245, 255, 255))
    d.ellipse((46, 42, 82, 86), fill=(40, 150, 255, 255))
    d.ellipse((56, 52, 72, 76), fill=(170, 240, 255, 255))
    rng = random.Random(3)
    for _ in range(14):
        x, y = rng.randrange(14, 114), rng.randrange(14, 114)
        if 22 < y < 90:
            continue
        d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(255, 255, 255, 255))
    return img.resize((32, 32), Image.LANCZOS)


def teleport_icon():
    big = 128
    img = Image.new("RGBA", (big, big))
    d = ImageDraw.Draw(img)
    for k in range(3):
        pts = []
        for i in range(60):
            t = i / 60
            ang = t * math.pi * 1.4 + k * math.tau / 3
            rr = 10 + 48 * t
            pts.append((64 + rr * math.cos(ang), 64 + rr * math.sin(ang)))
        d.line(pts, fill=(140, 220, 255, 255), width=10)
    d.ellipse((50, 50, 78, 78), fill=(235, 250, 255, 255))
    return img.resize((32, 32), Image.LANCZOS)


def mod_icon():
    size = 128
    img = Image.new("RGBA", (size, size), (10, 8, 20, 255))
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            dx, dy = x - c, y - c
            r = math.hypot(dx, dy) / (size / 2)
            a = math.atan2(dy, dx)
            glow = max(0.0, 1 - r) ** 1.5
            swirl_v = (0.5 + 0.5 * math.cos(2 * a + r * 9)) * max(0.0, 1 - r) ** 0.8
            pr = 120 * glow + 160 * swirl_v * (0.5 + 0.5 * math.cos(a))
            pg = 40 * glow + 30 * swirl_v
            pb = 220 * glow + 160 * swirl_v * (0.5 - 0.5 * math.cos(a)) + 60 * glow
            core = max(0.0, 1 - r / 0.25)
            base = img.getpixel((x, y))
            img.putpixel((x, y), (clamp(base[0] + pr + 255 * core), clamp(base[1] + pg + 230 * core),
                                  clamp(base[2] + pb + 255 * core), 255))
    return img


def main():
    save(make_skin(False), "entity", "gojo_blindfold.png")
    save(make_skin(True), "entity", "gojo_six_eyes.png")
    save(make_eye_glow(), "entity", "gojo_six_eyes_glow.png")
    save(soft_glow(), "entity", "glow.png")
    save(core_glow(), "entity", "core.png")
    save(swirl(3, 2.2), "entity", "swirl.png")
    save(ring(), "entity", "ring.png")
    save(particle_dot(), "particle", "glow.png")
    save(particle_spark(), "particle", "spark.png")
    save(particle_ring(), "particle", "ring.png")
    save(void_block(), "block", "void_barrier.png")
    save(orb_icon((200, 240, 255), (30, 110, 255)), "gui", "blue.png")
    save(orb_icon((255, 220, 200), (220, 20, 30)), "gui", "red.png")
    save(orb_icon((255, 230, 255), (130, 30, 230)), "gui", "purple.png")
    save(domain_icon(), "gui", "domain.png")
    save(infinity_icon(), "gui", "infinity.png")
    save(teleport_icon(), "gui", "teleport.png")
    icon = mod_icon()
    out = os.path.join(ROOT, "main", "resources", "assets", "gojo", "icon.png")
    icon.save(out)
    print("textures written to", ASSETS)


if __name__ == "__main__":
    main()
