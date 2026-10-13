"""Close-up / insert art drawn in screen space (portraits, eyes, fists, hand
signs). Each takes a local frame: centre (cu, cv) in 0..1 screen units, a
scale `s` (1.0 = head fills ~60% of frame height) and optional roll.

Expressions
  gojo_face  expr: 'smirk' | 'amused' | 'focused' | 'serious' | 'strain' | 'cold'
             eyes: 'blindfold' | 'open' | 'glasses'
  thragg_face expr: 'contempt' | 'analytical' | 'smile' | 'fury' | 'dazed' | 'resolve' | 'defeated'
Injury tags match rig.py ('mouth_blood', 'nosebleed', 'brow_cut', 'eye_blood',
'bruise', 'purple_graze').
"""
from __future__ import annotations

import math

from engine import PAL, clamp, mix_color, shade
from rig import GOJO, THRAGG


class Local:
    def __init__(self, fr, cu, cv, s=1.0, rot=0.0, flip=1):
        self.fr, self.cu, self.cv, self.s, self.rot, self.flip = fr, cu, cv, s, math.radians(rot), flip

    def p(self, x, y):
        """local coords: x right, y DOWN, unit = 0.5 frame heights * s."""
        x *= self.flip
        c, sn = math.cos(self.rot), math.sin(self.rot)
        X, Y = x * c - y * sn, x * sn + y * c
        fr = self.fr
        return (self.cu * fr.W + X * 0.5 * fr.H * self.s, self.cv * fr.H + Y * 0.5 * fr.H * self.s)

    def poly(self, pts, fill):
        self.fr.draw.polygon([self.p(x, y) for x, y in pts], fill=fill)

    def ell(self, x, y, rx, ry, fill=None, outline=None, width=1):
        cx, cy = self.p(x, y)
        k = 0.5 * self.fr.H * self.s
        self.fr.draw.ellipse([cx - rx * k, cy - ry * k, cx + rx * k, cy + ry * k], fill=fill, outline=outline,
                             width=max(1, int(width * self.fr.ss)))

    def line(self, pts, fill, w=0.01):
        self.fr.draw.line([self.p(x, y) for x, y in pts], fill=fill,
                          width=max(1, int(w * 0.5 * self.fr.H * self.s)), joint="curve")

    def glow(self, x, y, r, color):
        cx, cy = self.p(x, y)
        k = r * 0.5 * self.fr.H * self.s
        self.fr.glow.ellipse([cx - k, cy - k, cx + k, cy + k], fill=color)


def _bg(fr, top=(30, 26, 40), bottom=(80, 54, 60), bokeh=True):
    for i in range(24):
        fr.s_rect(0, i / 24, 1, (i + 1) / 24 + 0.002, mix_color(top, bottom, i / 23))
    if bokeh:
        rng = fr.srng("bokeh")
        for i in range(14):
            fr.s_circle(rng.random(), rng.random(), rng.uniform(0.02, 0.07),
                        fill=mix_color(bottom, (200, 140, 100), rng.uniform(0.1, 0.4)))


# --------------------------------------------------------------------------
# Gojo
# --------------------------------------------------------------------------

def gojo_face(fr, cu=0.5, cv=0.55, s=1.0, expr="smirk", eyes="blindfold", injuries=(), rot=0.0, flip=1,
              t=0.0, eye_glow=1.0, hair_wind=0.0, bg=None):
    if bg:
        _bg(fr, *bg)
    L = Local(fr, cu, cv, s, rot, flip)
    skin, shadow = GOJO.skin, shade(GOJO.skin, 0.8)
    hair, hair_sh = GOJO.hair, shade(GOJO.hair, 0.78)
    suit = GOJO.suit
    # neck + high collar
    L.poly([(-0.28, 0.55), (0.22, 0.55), (0.3, 1.2), (-0.4, 1.2)], skin)
    L.poly([(-0.55, 0.7), (0.5, 0.62), (0.62, 1.3), (-0.7, 1.3)], suit)
    L.poly([(-0.42, 0.62), (0.36, 0.56), (0.42, 0.85), (-0.48, 0.92)], shade(suit, 1.3))
    # face (3/4 view, facing screen-right)
    face = [(-0.5, -0.35), (-0.45, 0.15), (-0.3, 0.45), (0.0, 0.66), (0.22, 0.62), (0.42, 0.34), (0.5, 0.0),
            (0.48, -0.4), (0.0, -0.62), (-0.4, -0.58)]
    L.poly(face, skin)
    L.poly([(-0.5, -0.35), (-0.45, 0.15), (-0.3, 0.45), (0.0, 0.66), (-0.12, 0.3), (-0.3, -0.1)], shadow)
    # mouth
    my = 0.38
    if expr in ("smirk", "amused"):
        L.line([(0.02, my + 0.02), (0.18, my), (0.3, my - 0.05)], (140, 80, 80), 0.022)
    elif expr in ("strain",):
        L.line([(0.0, my), (0.28, my - 0.01)], (120, 60, 60), 0.03)
        L.line([(0.04, my + 0.03), (0.26, my + 0.02)], (240, 240, 240), 0.012)
    else:
        L.line([(0.02, my), (0.26, my - 0.01)], (130, 76, 76), 0.02)
    # nose
    L.line([(0.38, 0.0), (0.44, 0.16), (0.36, 0.2)], shade(skin, 0.7), 0.015)
    wind = hair_wind
    if eyes == "blindfold":
        # blindfold band; hair pushed up into tall spikes
        L.poly([(-0.6, -0.28), (0.52, -0.3), (0.52, -0.06), (-0.55, -0.02)], GOJO.accent)
        L.line([(-0.55, -0.27), (0.5, -0.29)], (40, 40, 50), 0.01)
        spikes = [(-0.62, -0.25), (-0.95 - wind, -0.55), (-0.62, -0.62), (-0.92 - wind, -0.98), (-0.45, -0.82),
                  (-0.55 - wind * 0.6, -1.32), (-0.2, -0.95), (-0.12 - wind * 0.4, -1.42), (0.08, -1.0),
                  (0.32 - wind * 0.2, -1.36), (0.3, -0.92), (0.62, -1.18), (0.45, -0.74), (0.78, -0.82),
                  (0.5, -0.5), (0.58, -0.3)]
        L.poly(spikes, hair)
        L.poly([(-0.62, -0.25), (-0.92, -0.98), (-0.45, -0.82), (-0.3, -0.5)], hair_sh)
    else:
        # hair down over the forehead (as when the blindfold comes off)
        L.poly([(-0.66, -0.2), (-0.88 - wind, -0.6), (-0.6, -0.9), (-0.2, -1.05), (0.3, -0.98), (0.64, -0.7),
                (0.62, -0.38), (0.52, -0.1), (0.4, -0.3), (0.3, -0.05), (0.16, -0.32), (0.04, -0.08),
                (-0.1, -0.34), (-0.3, -0.06), (-0.4, -0.3)], hair)
        L.poly([(-0.66, -0.2), (-0.88, -0.6), (-0.6, -0.9), (-0.45, -0.4)], hair_sh)
        if eyes == "glasses":
            L.poly([(-0.06, -0.24), (0.52, -0.26), (0.5, -0.06), (0.0, -0.04)], (10, 10, 14))
        else:
            for ex, sz in ((0.3, 1.0), (-0.12, 0.85)):
                ey = -0.15
                L.ell(ex, ey, 0.12 * sz, 0.07 * sz, fill=(240, 252, 255))
                L.ell(ex + 0.01, ey, 0.065 * sz, 0.065 * sz, fill=(60, 190, 255))
                L.ell(ex + 0.01, ey, 0.03 * sz, 0.03 * sz, fill=(200, 240, 255))
                L.glow(ex, ey, 0.18 * sz * eye_glow, (40, 130, 220))
                # white lashes
                L.line([(ex - 0.13 * sz, ey - 0.06), (ex + 0.13 * sz, ey - 0.08)], hair, 0.014)
            if expr in ("focused", "serious", "cold", "strain"):
                L.line([(0.14, -0.32), (0.46, -0.3)], hair, 0.02)
    for inj in injuries:
        if inj == "nosebleed":
            L.line([(0.36, 0.22), (0.34, 0.34), (0.36, 0.42)], (170, 12, 22), 0.02)
        if inj == "mouth_blood":
            L.line([(0.28, 0.38), (0.3, 0.52)], (170, 12, 22), 0.018)
        if inj == "eye_blood":
            L.line([(0.3, -0.08), (0.31, 0.12)], (160, 10, 20), 0.014)


def gojo_eye_ecu(fr, t=0.0, open_u=1.0, glow=1.0, narrow=0.0):
    """Extreme close-up of a Six Eyes iris - crystalline, many radial facets."""
    fr.draw.rectangle([0, 0, fr.W, fr.H], fill=shade(GOJO.skin, 0.55))
    L = Local(fr, 0.5, 0.5, 1.0)
    h = 0.42 * open_u * (1 - 0.45 * narrow)
    L.poly([(-1.4, 0.0), (-0.6, -h), (0.6, -h * 1.05), (1.4, -0.05), (0.6, h * 0.8), (-0.6, h * 0.85)],
           (236, 246, 252))
    if open_u > 0.15:
        L.ell(0.0, 0.0, 0.42, min(0.42, h * 1.05), fill=(30, 140, 230))
        L.ell(0.0, 0.0, 0.34, min(0.34, h * 0.9), fill=(70, 200, 255))
        for k in range(36):
            a = k * math.tau / 36 + t * 0.2
            r0, r1 = 0.1, 0.34
            L.line([(math.cos(a) * r0, math.sin(a) * r0), (math.cos(a) * r1, math.sin(a) * r1 * min(1, h / 0.34))],
                   (180, 240, 255) if k % 2 else (40, 160, 240), 0.008)
        L.ell(0.0, 0.0, 0.1, min(0.1, h * 0.4), fill=(10, 30, 60))
        L.ell(-0.12, -0.12, 0.05, 0.04, fill=(255, 255, 255))
        L.glow(0.0, 0.0, 0.7 * glow, (30, 120, 220))
    # white lashes top and bottom
    for k in range(14):
        x = -1.1 + k * 0.16
        top = -h * (1 - (x / 1.4) ** 2) - 0.02
        L.line([(x, top), (x + 0.06, top - 0.2)], GOJO.hair, 0.02)


# --------------------------------------------------------------------------
# Thragg
# --------------------------------------------------------------------------

def thragg_face(fr, cu=0.5, cv=0.55, s=1.0, expr="contempt", injuries=(), rot=0.0, flip=-1, t=0.0,
                bg=None, dazed_u=0.0):
    """flip=-1 -> faces screen-left (toward Gojo who is on the right? no:
    Gojo is EAST/screen-right, so Thragg looking at Gojo faces right: flip=1).
    Default -1 is for reverse-angle reaction inserts; pass flip=1 when he
    looks at Gojo."""
    if bg:
        _bg(fr, *bg)
    L = Local(fr, cu, cv, s, rot, flip)
    skin, shadow = THRAGG.skin, shade(THRAGG.skin, 0.74)
    hair, hair_sh = THRAGG.hair, shade(THRAGG.hair, 0.72)
    # massive neck + uniform
    L.poly([(-0.42, 0.5), (0.3, 0.5), (0.46, 1.3), (-0.62, 1.3)], skin)
    L.poly([(-1.1, 0.95), (0.9, 0.9), (1.2, 1.4), (-1.3, 1.4)], THRAGG.suit)
    L.poly([(-1.1, 0.95), (0.9, 0.9), (0.95, 1.08), (-1.1, 1.12)], THRAGG.accent)
    # square, heavy face
    face = [(-0.52, -0.42), (-0.5, 0.2), (-0.36, 0.56), (0.04, 0.74), (0.34, 0.68), (0.52, 0.42), (0.56, 0.0),
            (0.52, -0.46), (0.0, -0.66), (-0.42, -0.62)]
    L.poly(face, skin)
    L.poly([(-0.52, -0.42), (-0.5, 0.2), (-0.36, 0.56), (0.04, 0.74), (-0.1, 0.3), (-0.3, -0.2)], shadow)
    # brow ridge
    brow_y = -0.24 if expr not in ("fury",) else -0.2
    L.poly([(-0.2, brow_y - 0.06), (0.56, brow_y - 0.1), (0.56, brow_y + 0.02), (-0.18, brow_y + 0.04)],
           shade(skin, 0.6))
    # eyes
    if expr == "dazed":
        for ex in (0.34, -0.06):
            L.ell(ex, -0.12, 0.09, 0.06, fill=(235, 230, 230))
            off = 0.03 * math.sin(t * 7 + ex * 10) * (1 - dazed_u)
            L.ell(ex + off, -0.12, 0.035, 0.035, fill=(30, 20, 20))
    else:
        open_h = {"contempt": 0.022, "analytical": 0.035, "smile": 0.02, "fury": 0.05, "resolve": 0.03,
                  "defeated": 0.012}.get(expr, 0.03)
        for ex in (0.34, -0.06):
            L.ell(ex, -0.13, 0.1, open_h + 0.01, fill=(220, 214, 214))
            L.ell(ex + 0.02, -0.13, 0.035, open_h + 0.005, fill=(26, 18, 22))
    # nose
    L.poly([(0.42, -0.1), (0.56, 0.14), (0.46, 0.2), (0.36, 0.16)], shade(skin, 0.85))
    # mustache: thick, drooping horseshoe
    L.poly([(0.6, 0.22), (0.5, 0.18), (0.04, 0.24), (-0.12, 0.34), (-0.16, 0.6), (-0.06, 0.62), (0.02, 0.38),
            (0.4, 0.34), (0.5, 0.58), (0.6, 0.56)], hair)
    L.poly([(0.04, 0.24), (-0.12, 0.34), (-0.16, 0.6), (-0.06, 0.62), (0.02, 0.38)], hair_sh)
    # mouth
    if expr == "smile":
        L.line([(0.06, 0.42), (0.26, 0.45), (0.42, 0.4)], (110, 50, 50), 0.02)
    elif expr == "fury":
        L.poly([(0.06, 0.4), (0.42, 0.38), (0.4, 0.5), (0.08, 0.52)], (60, 20, 24))
        L.line([(0.08, 0.41), (0.4, 0.39)], (235, 230, 220), 0.02)
    elif expr == "dazed" or expr == "defeated":
        L.poly([(0.1, 0.42), (0.38, 0.41), (0.36, 0.47), (0.12, 0.48)], (70, 30, 34))
    else:
        L.line([(0.06, 0.43), (0.42, 0.41)], (110, 54, 54), 0.02)
    # close-cropped jet-black hair: tight to the skull, square hairline
    L.poly([(0.5, -0.46), (0.44, -0.66), (0.12, -0.8), (-0.36, -0.8), (-0.66, -0.62), (-0.72, -0.3),
            (-0.66, 0.02), (-0.56, 0.04), (-0.54, -0.3), (-0.3, -0.56), (0.1, -0.6)], hair)
    for k in range(9):
        x = 0.36 - k * 0.11
        L.line([(x, -0.76 + abs(x) * 0.08), (x - 0.03, -0.62)], shade(hair, 1.6), 0.006)
    for inj in injuries:
        if inj == "mouth_blood":
            L.line([(0.3, 0.45), (0.28, 0.6), (0.3, 0.7)], (160, 10, 20), 0.022)
        elif inj == "brow_cut":
            L.line([(0.16, -0.34), (0.42, -0.42)], (150, 8, 18), 0.022)
            L.line([(0.3, -0.38), (0.3, -0.18)], (150, 8, 18), 0.014)
        elif inj == "eye_blood":
            for ex in (0.34, -0.06):
                L.line([(ex, -0.08), (ex - 0.01, 0.1)], (150, 6, 16), 0.014)
        elif inj == "nosebleed":
            L.line([(0.48, 0.2), (0.47, 0.32)], (160, 10, 20), 0.018)
        elif inj == "bruise":
            L.ell(-0.1, 0.05, 0.16, 0.12, fill=(150, 104, 130))
        elif inj == "purple_graze":
            # cauterised gouge along the jaw/cheek edge from the Purple graze
            L.poly([(-0.52, 0.0), (-0.44, -0.06), (-0.3, 0.18), (-0.38, 0.4), (-0.5, 0.24)], (90, 24, 40))
            L.glow(-0.42, 0.18, 0.2, (60, 20, 90))


def thragg_eyes_ecu(fr, mood="contempt", t=0.0, injuries=()):
    """Extreme close-up band across Thragg's eyes."""
    fr.draw.rectangle([0, 0, fr.W, fr.H], fill=shade(THRAGG.skin, 0.62))
    L = Local(fr, 0.5, 0.5, 1.0)
    L.poly([(-2, -0.62), (2, -0.66), (2, -0.3), (-2, -0.26)], shade(THRAGG.skin, 0.45))   # brow shadow
    L.poly([(-2, -1.2), (2, -1.2), (2, -0.7), (-2, -0.66)], THRAGG.skin)                   # forehead
    for ex in (-0.75, 0.75):                                                                 # heavy black brows
        L.poly([(ex - 0.55, -0.42), (ex + 0.5, -0.5), (ex + 0.52, -0.36), (ex - 0.5, -0.3)], THRAGG.hair)
    h = {"contempt": 0.08, "analytical": 0.13, "fury": 0.18, "dazed": 0.16, "resolve": 0.11, "smile": 0.07}.get(mood, 0.1)
    for ex in (-0.75, 0.75):
        L.poly([(ex - 0.5, 0.0), (ex - 0.2, -h), (ex + 0.25, -h * 1.1), (ex + 0.5, -0.02), (ex + 0.2, h * 0.6),
                (ex - 0.2, h * 0.7)], (228, 222, 220))
        jitter = 0.04 * math.sin(t * 9) if mood == "dazed" else 0.0
        L.ell(ex + 0.05 + jitter, -0.02, 0.15, min(0.15, h * 0.95), fill=(64, 40, 28))   # dark-brown iris
        L.ell(ex + 0.05 + jitter, -0.02, 0.07, min(0.07, h * 0.6), fill=(12, 8, 10))
        L.ell(ex - 0.02, -0.07, 0.025, 0.02, fill=(255, 255, 255))
        if "eye_blood" in injuries:
            L.line([(ex - 0.1, h * 0.7), (ex - 0.12, 0.6)], (150, 6, 16), 0.03)


# --------------------------------------------------------------------------
# hands / fists
# --------------------------------------------------------------------------

def thragg_fist(fr, cu=0.42, cv=0.52, s=1.0, rot=0.0, flip=1, injuries=()):
    """Close-up fist (Thragg's gloved fist in the red accent colour)."""
    L = Local(fr, cu, cv, s, rot, flip)
    glove = THRAGG.accent
    # forearm coming from screen-left
    L.poly([(-2.0, -0.32), (-0.3, -0.36), (-0.25, 0.34), (-2.0, 0.42)], THRAGG.suit)
    L.poly([(-2.0, 0.2), (-0.3, 0.22), (-0.25, 0.34), (-2.0, 0.42)], shade(THRAGG.suit, 0.7))
    # fist block
    L.poly([(-0.36, -0.42), (0.22, -0.46), (0.42, -0.3), (0.46, 0.26), (0.24, 0.42), (-0.36, 0.4)], glove)
    for k in range(4):
        y = -0.36 + k * 0.2
        L.ell(0.36, y + 0.08, 0.1, 0.09, fill=shade(glove, 1.15))
        L.line([(0.1, y + 0.17), (0.4, y + 0.17)], shade(glove, 0.55), 0.012)
    L.poly([(-0.36, 0.2), (0.1, 0.18), (0.2, 0.36), (-0.36, 0.4)], shade(glove, 0.6))  # thumb
    if "bleeding_knuckles" in injuries:
        L.line([(0.42, -0.3), (0.44, 0.2)], (150, 10, 20), 0.03)


def gojo_hand_sign(fr, cu=0.5, cv=0.55, s=1.0, sign="domain", rot=0.0, flip=1, glow=0.0):
    """Gojo's hand close-up. sign='domain' : the Unlimited Void seal
    (index and middle finger crossed, raised before the face).
    sign='point' : index extended (Blue/Red cue)."""
    L = Local(fr, cu, cv, s, rot, flip)
    skin = GOJO.skin
    sh = shade(skin, 0.78)
    # sleeve
    L.poly([(-0.5, 0.9), (0.25, 0.9), (0.38, 1.6), (-0.7, 1.6)], GOJO.suit)
    # palm/back of hand
    L.poly([(-0.36, 0.0), (0.22, -0.04), (0.3, 0.55), (0.06, 0.92), (-0.34, 0.9), (-0.42, 0.4)], skin)
    L.poly([(-0.36, 0.0), (-0.42, 0.4), (-0.34, 0.9), (-0.2, 0.5)], sh)
    # curled ring + little fingers
    L.ell(0.18, 0.12, 0.13, 0.11, fill=sh)
    L.ell(0.2, 0.32, 0.12, 0.1, fill=sh)
    if sign == "domain":
        # index and middle fingers raised and crossed
        L.poly([(-0.26, 0.02), (-0.12, -0.02), (0.18, -0.95), (0.06, -1.0)], skin)          # middle
        L.poly([(-0.1, 0.02), (0.06, 0.0), (-0.22, -0.92), (-0.34, -0.88)], shade(skin, 0.92))  # index crossing over
        L.line([(-0.06, -0.45), (0.06, -0.48)], sh, 0.01)
    else:
        L.poly([(-0.2, 0.02), (-0.06, -0.02), (0.0, -1.0), (-0.14, -1.0)], skin)
    # thumb
    L.poly([(-0.36, 0.3), (-0.62, 0.0), (-0.54, -0.1), (-0.26, 0.12)], skin)
    if glow:
        L.glow(-0.05, -0.6, 0.9 * glow, (40, 110, 220))
