"""Procedural creature anatomy (module C). One builder per archetype turns dsl.Creature.body knobs into a Part tree.

See the knob reference at the top of creatures.py. Every builder returns (root, info) where info carries
{"head": Part or None, "movement_hint": ..., "eye_part": ...}. Geometry conventions: see creature_geo.py
(model px, y down, ground at y=24, the creature faces -z).

Materials used by the painter (creature_paint.py):
  body      primary colour, gets the body pattern
  belly     lighter mix of primary/secondary (undersides, chest, inner ears)
  second    secondary colour (shells, manes, caps, fins)
  accent    accent colour (spots, crests, horns tips, glow bits)
  dark      darkened primary (hooves, claws, nostrils, joints)
  horn      bone/ivory tinted by accent
  eye       eyeball cube (whole cube painted as an eye)
  glow      accent colour, also emitted by the glow overlay
  wing      secondary, membrane/feather texture
  membrane  translucent-looking insect wing (holes + veins)
  teeth     off-white
  inner     mouth interior (dark red-ish)
  shell     secondary with growth rings
  cap       mushroom cap (secondary with accent spots)
"""
from __future__ import annotations

import math
import random

from .creature_geo import Part

PI = math.pi


class Knobs:
    def __init__(self, d, seed):
        self.d = dict(d or {})
        self.R = random.Random(seed)

    def has(self, k):
        return k in self.d and self.d[k] not in (None, False, 0, "none")

    def get(self, k, default=None):
        return self.d.get(k, default)

    def num(self, k, default, lo=None, hi=None):
        try:
            v = float(self.d.get(k, default))
        except (TypeError, ValueError):
            v = float(default)
        if lo is not None:
            v = max(lo, v)
        if hi is not None:
            v = min(hi, v)
        return v

    def int(self, k, default, lo=None, hi=None):
        v = self.d.get(k, default)
        if isinstance(v, bool):
            v = int(v) if k not in ("eyes",) else default
        try:
            v = int(round(float(v)))
        except (TypeError, ValueError):
            v = int(default)
        if lo is not None:
            v = max(lo, v)
        if hi is not None:
            v = min(hi, v)
        return v

    def flag(self, k, default=False):
        v = self.d.get(k, default)
        if isinstance(v, str):
            return v not in ("", "none", "false", "no", "0")
        return bool(v)

    def str(self, k, default):
        v = self.d.get(k, default)
        if v is True:
            return default if default not in (None, "none") else "yes"
        if v is False or v is None:
            return "none"
        return str(v)


def ev(v):
    """Round to an even integer (keeps centred boxes on the pixel grid)."""
    return int(max(2, 2 * round(v / 2.0)))


# --------------------------------------------------------------------------------------------- shared head
def face_spec(K, default_eyes=2, default_size=2, default_style="round", default_mouth="none"):
    return {
        "eyes": K.int("eyes", default_eyes, 0, 8),
        "eye_size": K.int("eye_size", default_size, 1, 4),
        "eye_style": K.str("eye_style", default_style),
        "mouth": K.str("mouth", default_mouth),
        "brows": K.flag("brows", K.str("eye_style", default_style) == "angry"),
        "blush": K.flag("blush", False),
    }


def build_head(parent, name, pivot, w, h, d, K, opts=None):
    """A head part at pivot (the neck joint). The head box sits in front of the pivot (toward -z) and its
    vertical centre is at the pivot. Adds snout, jaw, ears, horns, antennae, cap, beak... per knobs."""
    o = dict(opts or {})
    w, h, d = ev(w), max(2, int(round(h))), max(2, int(round(d)))
    head = parent.child(name, pivot)
    head.anim("look", amp=o.get("look", 1.0))
    back = o.get("back", 1)
    y0 = -h // 2
    z0 = -d + back
    face = face_spec(K, o.get("eyes", 2), o.get("eye_size", 2 if w >= 6 else 1), o.get("eye_style", "round"),
                     o.get("mouth", "none"))
    snout = K.num("snout", o.get("snout", 0), 0, 10)
    beak = K.num("beak", o.get("beak", 0), 0, 10) if K.get("beak") is not True else max(2, d // 2)
    jaw = K.flag("jaw", o.get("jaw", False)) or face["mouth"] == "maw"
    head_face = dict(face)
    if snout or beak or jaw:
        head_face["mouth"] = "none"
    hb = head.box(-w / 2, y0, z0, w, h, d, "body", face=head_face, tag="head")
    front_z = z0
    # snout / muzzle
    if snout:
        sw = ev(max(2, w * 0.6))
        sh = max(2, int(round(h * 0.45)))
        sl = int(round(snout))
        head.box(-sw / 2, y0 + h - sh, front_z - sl, sw, sh, sl, "belly",
                 face={"nostrils": True, "mouth": face["mouth"] if not jaw else "none"}, pattern=False)
    if beak:
        bw = ev(max(2, w * 0.4))
        bl = int(round(beak))
        bh = max(1, int(round(h * 0.3)))
        head.box(-bw / 2, y0 + h * 0.45, front_z - bl, bw, bh, bl, "beak", pattern=False)
        if o.get("hooked") or K.flag("hooked"):
            head.box(-bw / 2, y0 + h * 0.45 + bh, front_z - bl, bw, 1, 1, "beak_dark", pattern=False)
        head.box(-max(1, bw - 2) / 2, y0 + h * 0.45 + bh, front_z - bl + 1, max(1, bw - 2), 1, bl - 1, "beak_dark",
                 pattern=False)
    if jaw:
        jw = ev(max(2, w - 2))
        jh = max(1, h // 3)
        jd = d - 1 + int(snout)
        jp = head.child(name + "_jaw", (0, y0 + h, z0 + d - 1))
        jp.box(-jw / 2, 0, -jd, jw, jh, jd, "belly", pattern=False, face={"teeth_top": True})
        jp.anim("jaw", amp=0.35, speed=0.25)
    # ears
    ears = K.str("ears", o.get("ears", "none"))
    ex = w / 2 - 1
    if ears == "pointy":
        for s in (-1, 1):
            e = head.child(f"{name}_ear{'l' if s < 0 else 'r'}", (s * (ex - 0.5), y0, z0 + d * 0.6), rot=(0, 0, s * 0.25), nohit=True)
            e.box(-1, -3, -0.5, 2, 3, 1, "body")
            e.box(-0.5, -4, -0.5, 1, 1, 1, "dark")
            e.anim("sway", axis="z", amp=0.08, speed=0.1, phase=0 if s < 0 else 1.6)
    elif ears == "round":
        for s in (-1, 1):
            e = head.child(f"{name}_ear{'l' if s < 0 else 'r'}", (s * ex, y0, z0 + d * 0.6), nohit=True)
            e.box(-1.5, -2, -0.5, 3, 2, 1, "body", face={"inner_ear": True})
    elif ears in ("floppy", "long", "bunny"):
        ln = 6 if ears == "floppy" else 7
        for s in (-1, 1):
            if ears == "floppy":
                e = head.child(f"{name}_ear{'l' if s < 0 else 'r'}", (s * (w / 2), y0 + 1, z0 + d * 0.5), rot=(0, 0, s * 0.35), nohit=True)
                e.box(-0.5 + (0.5 if s > 0 else -0.5), 0, -1.5, 1, ln - 2, 3, "second")
                e.anim("sway", axis="z", amp=0.15, speed=0.12, phase=0 if s < 0 else 2)
            else:
                e = head.child(f"{name}_ear{'l' if s < 0 else 'r'}", (s * (ex - 1), y0, z0 + d * 0.6), rot=(-0.15, 0, s * 0.18), nohit=True)
                e.box(-1, -ln, -0.5, 2, ln, 1, "body", face={"inner_ear": True})
                e.anim("sway", axis="x", amp=0.12, speed=0.1, phase=0 if s < 0 else 1.2)
    elif ears == "fin":
        for s in (-1, 1):
            e = head.child(f"{name}_ear{'l' if s < 0 else 'r'}", (s * (w / 2), y0 + 1, z0 + d * 0.5), rot=(0, s * 0.5, 0), nohit=True)
            e.box(0 if s > 0 else 0, -1, 0, 0, 4, 4, "second")
            e.anim("sway", axis="y", amp=0.2, speed=0.15, phase=0 if s < 0 else 1)
    # horns
    horns = K.str("horns", o.get("horns", "none"))
    hx = w / 2 - 1.5
    hz = z0 + 2
    if horns in ("small", "yes"):
        for s in (-1, 1):
            hp = head.child(f"{name}_horn{'l' if s < 0 else 'r'}", (s * hx, y0, hz), rot=(-0.2, 0, s * 0.3), nohit=True)
            hp.box(-0.5, -3, -0.5, 1, 3, 1, "horn")
    elif horns in ("long", "twin"):
        for s in (-1, 1):
            hp = head.child(f"{name}_horn{'l' if s < 0 else 'r'}", (s * hx, y0, hz + 1), rot=(-0.5, 0, s * 0.35), nohit=True)
            hp.box(-1, -4, -1, 2, 4, 2, "horn")
            hp.box(-0.5, -7, -0.5, 1, 3, 1, "horn_tip")
    elif horns == "curved":
        for s in (-1, 1):
            hp = head.child(f"{name}_horn{'l' if s < 0 else 'r'}", (s * (w / 2), y0 + 1, hz + 1), rot=(0, 0, s * 1.2), nohit=True)
            hp.box(-1, -4, -1, 2, 4, 2, "horn")
            hp2 = hp.child(f"{name}_horn{'l' if s < 0 else 'r'}2", (0, -4, 0), rot=(0, 0, -s * 1.0))
            hp2.box(-0.5, -3, -0.5, 1, 3, 1, "horn_tip")
    elif horns == "ram":
        for s in (-1, 1):
            hp = head.child(f"{name}_horn{'l' if s < 0 else 'r'}", (s * (w / 2), y0 + 1, z0 + d * 0.5), nohit=True)
            hp.box(-1.5 + s * 1.0, -1, -2, 3, 3, 4, "horn")
            hp.box(-1 + s * 1.5, 1, -3, 2, 3, 2, "horn_tip")
    elif horns in ("unicorn", "spiral"):
        hp = head.child(f"{name}_horn", (0, y0, z0 + 1), rot=(0.55, 0, 0), nohit=True)
        hp.box(-1, -3, -1, 2, 3, 2, "horn")
        hp.box(-0.5, -6, -0.5, 1, 3, 1, "horn_tip")
        hp.box(-0.5, -7, -0.5, 1, 1, 1, "glow")
    elif horns == "antlers":
        for s in (-1, 1):
            hp = head.child(f"{name}_antler{'l' if s < 0 else 'r'}", (s * (hx - 0.5), y0, hz + 1), rot=(0, 0, s * 0.35), nohit=True)
            hp.box(-0.5, -5, -0.5, 1, 5, 1, "horn")
            hp.box(-0.5 + s * 1, -4, -0.5, 2, 1, 1, "horn")
            hp.box(-0.5 + s * 2, -7, -0.5, 1, 3, 1, "horn")
            hp.box(-0.5 - s * 1, -8, -0.5, 1, 3, 1, "horn")
            hp.box(-0.5, -9, -0.5, 1, 4, 1, "horn_tip")
    # tusks
    if K.flag("tusks", o.get("tusks", False)):
        tz = (front_z - snout) if snout else front_z
        for s in (-1, 1):
            head.box(s * (w / 2 - 1.5) - 0.5, y0 + h - 2, tz + 0.5, 1, 3, 1, "horn", pattern=False)
    # mandibles
    if K.flag("mandibles", o.get("mandibles", False)):
        for s in (-1, 1):
            mp = head.child(f"{name}_mandible{'l' if s < 0 else 'r'}", (s * (w / 2 - 1), y0 + h - 1, z0), rot=(0, s * 0.4, 0), nohit=True)
            mp.box(-0.5, -0.5, -3, 1, 1, 3, "dark")
            mp.box(-0.5 - s * 1, -0.5, -4, 1, 1, 1, "dark")
            mp.anim("sway", axis="y", amp=0.25, speed=0.6, phase=0 if s < 0 else PI)
    # antennae
    ant = K.num("antennae", o.get("antennae", 0), 0, 12)
    if ant:
        ln = int(ant) if ant > 1 else 5
        for s in (-1, 1):
            ap = head.child(f"{name}_antenna{'l' if s < 0 else 'r'}", (s * (w / 2 - 1.5), y0, z0 + 1), rot=(0.45, 0, -s * 0.35), nohit=True)
            ap.box(-0.5, -ln, -0.5, 1, ln, 1, "dark")
            ap.box(-1, -ln - 2, -1, 2, 2, 2, "glow" if K.flag("glow_tips", True) else "accent")
            ap.anim("sway", axis="x", amp=0.12, speed=0.2, phase=0 if s < 0 else 1.3)
    # crest / mohawk
    if K.flag("crest", o.get("crest", False)):
        for i in range(max(1, d // 2)):
            head.box(-0.5, y0 - 2 + (i % 2), z0 + 1 + i * 2, 1, 2 - (i % 2), 2, "accent", pattern=False, nohit=True)
    # whiskers
    if K.flag("whiskers", False):
        wz = (front_z - snout) if snout else front_z
        for s in (-1, 1):
            head.box(s * (w / 2) - (3 if s < 0 else 0), y0 + h - 2, wz + 1, 3, 0, 1, "dark", pattern=False, nohit=True)
    # mushroom cap on the head
    cap = K.str("head", "") in ("cap", "mushroom_cap", "mushroom") or K.flag("cap", False)
    if cap:
        cw = ev(w + 6)
        cd = d + 6 - (d % 2)
        ch_ = 3
        hc = head.child(name + "_cap", (0, y0, z0 + d / 2))
        hc.box(-cw / 2, -ch_, -cd / 2, cw, ch_, cd, "cap", pattern=False)
        hc.box(-(cw - 4) / 2, -ch_ - 2, -(cd - 4) / 2, cw - 4, 2, cd - 4, "cap", pattern=False)
        hc.box(-(cw - 2) / 2, 0, -(cd - 2) / 2, cw - 2, 1, cd - 2, "gills", pattern=False)
        hc.anim("sway", axis="z", amp=0.06, speed=0.12)
    # eyestalks on the head
    stalks = K.int("eyestalks", o.get("eyestalks", 0), 0, 6)
    for i in range(stalks):
        t = (i + 0.5) / stalks - 0.5
        sp = head.child(f"{name}_stalk{i}", (t * (w - 2), y0, z0 + 2), rot=(-0.2, 0, t * 0.9), nohit=True)
        sp.box(-0.5, -4, -0.5, 1, 4, 1, "body")
        sp.box(-1, -6, -1, 2, 2, 2, "eye", pattern=False)
        sp.anim("sway", axis="z", amp=0.15, speed=0.15, phase=i * 1.7)
    return head, hb


# --------------------------------------------------------------------------------------------- common bits
def add_spikes(part, x0, x1, y, z0, z1, n, K, mat="accent", size=2, row="dorsal"):
    """Row of spikes/plates on top of a box (y = top surface)."""
    if n <= 0:
        return
    plates = K.flag("plates", False)
    for i in range(n):
        t = (i + 0.5) / n
        z = z0 + (z1 - z0) * t
        if plates:
            hgt = size + 1 + (1 if 0.25 < t < 0.75 else 0)
            part.box(-0.5, y - hgt, z - 1.5, 1, hgt, 3, mat, pattern=False, nohit=True)
        else:
            part.box(-0.5 if size < 2 else -1, y - size, z - (0.5 if size < 2 else 1), 1 if size < 2 else 2, size, 1 if size < 2 else 2, mat, pattern=False, nohit=True)
            part.box(-0.5, y - size - 1, z - 0.5, 1, 1, 1, "horn_tip", pattern=False, nohit=True)


def add_tail(parent, name, pivot, K, default_segs=1, default_len=6, width=2, droop=-0.5, kind=None):
    segs = K.int("tail", default_segs, 0, 10)
    if segs <= 0:
        return None
    seg_len = K.num("tail_len", default_len, 1, 16)
    kind = kind or K.str("tail_kind", "thin")
    if kind == "curl":
        seg_len = min(seg_len, 3)
    p = parent
    first = None
    piv = pivot
    for i in range(segs):
        rot = (droop if i == 0 else (0.25 if kind == "curl" else 0.08 * (1 if droop > 0 else -1)), 0, 0)
        t = p.child(f"{name}{i}", piv, rot=rot, nohit=True)
        first = first or t
        wv = max(1, width - (i * width) // (segs + 1)) if kind not in ("bushy", "fluffy") else width + (1 if i == segs - 1 else 0)
        mat = "body"
        if kind == "bushy" and i == segs - 1:
            mat = "belly"
        if kind == "ringed" and i % 2 == 1:
            mat = "second"
        t.cbox(0, 0, seg_len / 2, wv, wv, seg_len, mat)
        t.anim("tail", axis="y", amp=0.18 + 0.05 * i, speed=0.12, phase=-0.7 * i)
        piv = (0, 0, seg_len)
        p = t
    # tail tips
    if kind == "club":
        p.cbox(0, 0, seg_len + 1.5, width + 3, width + 2, 3, "second")
        for s in (-1, 1):
            p.box(s * (width / 2 + 1.5) - 0.5, -0.5, seg_len, 1, 1, 2, "horn_tip", pattern=False)
    elif kind == "fluke":
        p.box(-width * 2 - 1, -0.5, seg_len - 1, width * 4 + 2, 1, 4, "second")
    elif kind in ("fan", "feather"):
        p.box(-3, -0.5, seg_len - 1, 6, 1, 5, "second", pattern=False)
    elif kind == "stinger":
        p.cbox(0, 0, seg_len + 1.5, width + 1, width + 1, 3, "accent", pattern=False)
        p.box(-0.5, -0.5 - 2, seg_len + 2.5, 1, 2, 1, "horn_tip", pattern=False)
    elif kind == "rattle":
        for j in range(3):
            p.cbox(0, 0, seg_len + 0.5 + j * 1.5, width + 1, width + 1, 1, "accent", pattern=False)
    elif kind == "flame":
        p.cbox(0, 0, seg_len + 1, width + 1, width + 2, 2, "glow", pattern=False)
    elif kind == "spade":
        p.box(-2, -0.5, seg_len, 4, 1, 3, "accent", pattern=False)
    elif kind in ("puff", "pom"):
        p.cbox(0, 0, seg_len + 1, width + 2, width + 2, 3, "belly", pattern=False)
    return first


def leg(parent, name, pivot, length, w, K, phase, amp=1.0, mat="body", foot=True, rot=(0, 0, 0), axis="x", d=None):
    lp = parent.child(name, pivot, rot=rot)
    d = d or w
    lp.box(-w / 2, 0, -d / 2, w, length, d, mat)
    if foot and length >= 4:
        fm = "dark" if K.flag("hooves", False) else None
        if fm:
            lp.box(-w / 2, length - 1, -d / 2, w, 1, d, fm, inflate=0.05, pattern=False)
        if K.flag("claws", False):
            lp.box(-w / 2, length - 1, -d / 2 - 1, w, 1, 1, "horn", pattern=False)
    lp.anim("leg", axis=axis, amp=amp, speed=1.0, phase=phase)
    return lp


def add_wings(parent, name, y, z, span, chord, K, kind="feather", pairs=1, flap_amp=0.7, flap_speed=0.6, dz_pair=None):
    """Wings attach at (±x_attach, y, z) on parent. Wings are flat (h=0/1) boxes extending sideways."""
    out = []
    for p_i in range(pairs):
        zz = z + p_i * (dz_pair if dz_pair is not None else chord * 0.9)
        for s in (-1, 1):
            wp = parent.child(f"{name}{p_i}{'l' if s < 0 else 'r'}", (s * K.get('_wing_x', 2), y, zz), nohit=True)
            sp = int(round(span * (0.8 if p_i else 1.0)))
            ch = int(round(chord * (0.8 if p_i else 1.0)))
            mat = {"feather": "wing", "membrane": "membrane_dark", "insect": "membrane", "paper": "paper",
                   "moth": "mothwing", "leaf": "leaf"}.get(kind, "wing")
            if kind in ("feather",):
                wp.box(0 if s > 0 else -sp, 0, -ch / 2, sp, 1, ch, mat, pattern=False)
                wp.box((sp - 2) if s > 0 else -sp, 0.5, -ch / 2 + ch, 2, 0, 2, mat, pattern=False)
            elif kind == "membrane":
                # bat/dragon: an arm bone + membrane
                wp.box(0 if s > 0 else -sp, -1, -0.5, sp, 1, 1, "dark", pattern=False)
                wp.box(0 if s > 0 else -sp, 0, -0.5, sp, 0, ch, mat, pattern=False)
            elif kind == "moth":
                wp.box(0 if s > 0 else -sp, 0, -ch * 0.7, sp, 0, ch, mat, pattern=False)
                wp.box(0 if s > 0 else -int(sp * 0.7), 0.1, ch * 0.3, int(sp * 0.7), 0, int(ch * 0.7), mat, pattern=False)
            else:
                wp.box(0 if s > 0 else -sp, 0, -ch / 2, sp, 0, ch, mat, pattern=False)
            wp.anim("wing", axis="z", amp=flap_amp * (-1 if s < 0 else 1), speed=flap_speed, phase=p_i * 0.9)
            out.append(wp)
    return out


# --------------------------------------------------------------------------------------------- archetypes
def build_quadruped(c, K):
    root = Part("root")
    legs = K.int("legs", 4, 2, 8)
    if legs % 2:
        legs += 1
    L = K.num("leg_len", 7, 2, 24)
    lw = K.int("leg_w", 3 if L < 10 else 4, 1, 6)
    bw = ev(K.num("body_w", 10, 4, 24))
    bh = K.int("body_h", 8, 3, 20)
    bl = K.int("body_len", 14, 6, 32)
    stance = K.str("stance", "normal")
    body_y = 24 - L - bh / 2
    body = root.child("body", (0, body_y, 0))
    body.box(-bw / 2, -bh / 2, -bl / 2, bw, bh, bl, "body", tag="body")
    if K.flag("hump"):
        body.cbox(0, -bh / 2 - 1.5, 1, bw - 4, 3, bl * 0.4, "body")
    if K.flag("mane"):
        body.box(-bw / 2 + 1, -bh / 2 - 2, -bl / 2 - 0.5, bw - 2, 3, 6, "second", pattern=False, inflate=0.3)
    if K.flag("shell"):
        body.box(-bw / 2 - 1, -bh / 2 - 3, -bl / 2 + 1, bw + 2, 4, bl - 2, "shell", pattern=False)
        body.box(-bw / 2 + 1, -bh / 2 - 5, -bl / 2 + 3, bw - 2, 2, bl - 6, "shell", pattern=False)
    if K.flag("fur"):
        body.box(-bw / 2, bh / 2 - 1, -bl / 2 + 2, bw, 2, bl - 4, "second", inflate=0.4, pattern=False)
    spikes = K.int("spikes", 0, 0, 12)
    add_spikes(body, 0, 0, -bh / 2 - (5 if K.flag("shell") else 0), -bl / 2 + 2, bl / 2 - 2, spikes, K)
    crystals = K.int("crystals", 0, 0, 8)
    for i in range(crystals):
        t = (i + 0.5) / crystals
        s = -1 if i % 2 else 1
        cp = body.child(f"crystal{i}", (s * (bw / 4), -bh / 2, -bl / 2 + bl * t), rot=(0.3 * s, 0, 0.35 * s), nohit=True)
        cp.box(-1, -4 - (i % 3), -1, 2, 4 + (i % 3), 2, "glow", pattern=False)
    # legs
    pairs = legs // 2
    for i in range(pairs):
        t = 0.5 if pairs == 1 else i / (pairs - 1)
        z = -bl / 2 + lw / 2 + 1 + t * (bl - lw - 2)
        for s in (-1, 1):
            ph = (0 if (i % 2 == 0) == (s < 0) else PI)
            x = s * (bw / 2 - lw / 2)
            if stance == "low":
                x = s * (bw / 2 + lw / 2 - 1)
            leg(root, f"leg{i}{'l' if s < 0 else 'r'}", (x, 24 - L, z), L, lw, K, ph, amp=1.2 if L < 12 else 0.9)
    # neck + head
    neck = K.num("neck", 0, 0, 40)
    hs = K.num("head_size", 1.0, 0.4, 2.5)
    hw, hh, hd = bw * 0.75 * hs, bh * 0.85 * hs, bh * 0.85 * hs
    hw = max(4, min(hw, 16))
    head_parent = root
    head_pivot = (0, body_y - bh / 2 + hh * 0.35, -bl / 2 + 1)
    if neck >= 2:
        ang = math.radians(K.num("neck_angle", 70 if neck > 10 else 45, 0, 90))
        nw = ev(max(2, bw * 0.4))
        np_ = root.child("neck", (0, body_y - bh / 2 + 2, -bl / 2 + nw / 2 + 1), rot=(-ang, 0, 0))
        np_.box(-nw / 2, -nw / 2, -neck, nw, nw, neck + nw / 2, "body")
        np_.anim("sway", axis="x", amp=0.05, speed=0.08)
        if K.flag("mane"):
            np_.box(-0.5, -nw / 2 - 2, -neck, 1, 2, neck, "second", pattern=False)
        head_parent = np_
        head_pivot = (0, 0, -neck)
        head, hb = build_head(head_parent, "head", head_pivot, hw * 0.85, hh * 0.8, hd * 1.1, K,
                              {"snout": 2, "ears": "pointy", "look": 0.6})
        head.rot = (ang, 0, 0)
    else:
        head, hb = build_head(head_parent, "head", head_pivot, hw, hh, hd, K,
                              {"snout": 3 if bh >= 6 else 0, "ears": "pointy"})
    add_tail(body, "tail", (0, -bh / 2 + 1.5, bl / 2), K, default_segs=1, default_len=6, width=2, droop=-0.6)
    return root, {"head": head}


def build_biped(c, K):
    root = Part("root")
    thin = K.flag("thin")
    bulky = K.flag("bulky")
    stance = K.str("stance", "upright")
    leg_len = K.num("leg_len", 14 if thin else (11 if not bulky else 9), 3, 32)
    lw = 2 if thin else (5 if bulky else 4)
    tw = ev(K.num("torso_w", 6 if thin else (12 if bulky else 8), 4, 20))
    th = K.int("torso_h", 14 if thin else (12 if bulky else 11), 4, 24)
    td = K.int("torso_d", 3 if thin else (7 if bulky else 4), 2, 14)
    arms = K.int("arms", 2, 0, 6)
    head_kind = K.str("head", "box")
    if stance == "raptor":
        return build_raptor(c, K)
    hip_y = 24 - leg_len
    body = root.child("body", (0, hip_y, 0))
    hunch = 0.25 if stance == "hunched" else 0.0
    body.rot = (hunch, 0, 0)
    body.box(-tw / 2, -th, -td / 2, tw, th, td, "body", tag="body")
    if bulky:
        body.box(-tw / 2 + 1, -th + 2, -td / 2 - 1, tw - 2, th - 5, 1, "belly", pattern=False)
    if K.flag("fur"):
        body.box(-tw / 2, -th, -td / 2, tw, 4, td, "second", inflate=0.6, pattern=False)
    if K.flag("core"):
        body.cbox(0, -th * 0.6, -td / 2 - 0.5, 3, 3, 1, "glow", pattern=False)
    spikes = K.int("spikes", 0, 0, 8)
    if spikes:
        for i in range(spikes):
            body.box(-0.5, -th + 1 + i * (th - 2) / spikes, td / 2, 1, 1, 2, "accent", pattern=False, nohit=True)
    for s in (-1, 1):
        leg(root, f"leg{'l' if s < 0 else 'r'}", (s * (tw / 2 - lw / 2 - (0 if thin else 0.5)), hip_y, 0), leg_len, lw, K,
            0 if s < 0 else PI, amp=1.1)
    # arms
    arm_len = K.num("arm_len", leg_len + (2 if thin else 0) if not bulky else leg_len + 3, 3, 30)
    aw = 2 if thin else (5 if bulky else 3)
    rows = max(1, (arms + 1) // 2)
    for r_ in range(rows):
        for s in (-1, 1):
            if r_ * 2 + (0 if s < 0 else 1) >= arms:
                continue
            ay = -th + 1 + r_ * 4
            ap = body.child(f"arm{r_}{'l' if s < 0 else 'r'}", (s * (tw / 2 + aw / 2), ay, 0), rot=(0, 0, s * (0.08 + 0.12 * r_)))
            ap.box(-aw / 2, -1, -aw / 2, aw, arm_len, aw, "body" if not bulky else "body")
            if K.flag("claws") or thin:
                ap.box(-aw / 2, arm_len - 1, -aw / 2 - 1, aw, 2, 1, "dark", pattern=False)
            ap.anim("arm", axis="x", amp=0.9, speed=1.0, phase=(PI if s < 0 else 0) + r_ * 0.6)
    # head
    neck = K.num("neck", 0, 0, 16)
    hs = K.num("head_size", 1.0, 0.4, 3)
    hp = (0, -th - neck, 0)
    if neck:
        body.box(-1, -th - neck, -1, 2, neck, 2, "body")
    head = None
    if head_kind != "none":
        if head_kind in ("cap", "mushroom_cap", "mushroom"):
            hw, hh, hd = 6 * hs, 6 * hs, 6 * hs
        elif head_kind == "long":
            hw, hh, hd = 6 * hs, 10 * hs, 6 * hs
        elif head_kind == "tiny":
            hw, hh, hd = 4 * hs, 4 * hs, 4 * hs
        elif head_kind == "pumpkin":
            hw, hh, hd = 10 * hs, 9 * hs, 10 * hs
        else:
            hw, hh, hd = (7 if thin else 8) * hs, (7 if thin else 8) * hs, (7 if thin else 8) * hs
        head, hb = build_head(body, "head", (0, hp[1] - hh / 2, td * 0.1), hw, hh, hd, K,
                              {"back": int(hd / 2), "eye_style": "glow" if c.behavior == "hostile" else "round",
                               "mouth": "frown" if c.behavior == "hostile" else "smile", "look": 1.0})
        if head_kind == "pumpkin":
            hb.mat = "second"
            head.box(-1, -hh / 2 - 2, -1, 2, 2, 2, "dark", pattern=False)
    add_tail(body, "tail", (0, -2, td / 2), K, default_segs=0, default_len=6, width=2, droop=-0.8)
    if K.flag("wings"):
        K.d["_wing_x"] = 1
        add_wings(body, "wing", -th + 2, td / 2 + 1, 12, 8, K, kind=K.str("wing_kind", "membrane"), flap_amp=0.35, flap_speed=0.25)
    return root, {"head": head}


def build_raptor(c, K):
    """Horizontal-bodied biped (raptor, stiltbird, bird-like walkers)."""
    root = Part("root")
    leg_len = K.num("leg_len", 10, 3, 40)
    bw = ev(K.num("body_w", 6, 4, 16))
    bh = K.int("body_h", 7, 3, 16)
    bl = K.int("body_len", 12, 4, 30)
    lw = K.int("leg_w", 2 if leg_len > 14 else 3, 1, 5)
    hip_y = 24 - leg_len
    body = root.child("body", (0, hip_y - bh / 2 + 1, 0))
    body.box(-bw / 2, -bh / 2, -bl / 2, bw, bh, bl, "body", tag="body")
    body.anim("bob", axis="y", amp=0.4, speed=0.15)
    for s in (-1, 1):
        lp = root.child(f"leg{'l' if s < 0 else 'r'}", (s * (bw / 2 - lw / 2), hip_y, 1))
        lp.box(-lw / 2, 0, -lw / 2, lw, leg_len, lw, "body" if leg_len < 14 else "dark")
        lp.box(-lw / 2 - 0.5, leg_len - 1, -lw / 2 - 2, lw + 1, 1, 3, "dark", pattern=False)
        lp.anim("leg", axis="x", amp=1.0, phase=0 if s < 0 else PI)
    arms = K.int("arms", 2, 0, 4)
    for i in range(min(arms, 2)):
        s = -1 if i == 0 else 1
        ap = body.child(f"arm{'l' if s < 0 else 'r'}", (s * (bw / 2), bh / 2 - 2, -bl / 2 + 2), rot=(-0.6, 0, 0))
        ap.box(-0.5 if s < 0 else -0.5, 0, -1, 1, 4, 2, "body")
        ap.box(-0.5, 3, -2, 1, 1, 1, "horn", pattern=False)
        ap.anim("arm", axis="x", amp=0.4, phase=0 if s < 0 else PI)
    neck = K.num("neck", 4, 0, 30)
    nw = ev(max(2, bw * 0.5))
    ang = math.radians(K.num("neck_angle", 55, 0, 90))
    np_ = body.child("neck", (0, -bh / 2 + 1.5, -bl / 2 + 1.5), rot=(-ang, 0, 0))
    np_.box(-nw / 2, -nw / 2, -neck - 1, nw, nw, neck + 2, "body")
    hs = K.num("head_size", 1.0, 0.4, 3)
    head, hb = build_head(np_, "head", (0, 0, -neck), 6 * hs, 5 * hs, 7 * hs, K,
                          {"snout": 0, "eye_style": "slit" if c.behavior == "hostile" else "round",
                           "mouth": "fangs" if c.behavior == "hostile" else "none", "look": 0.7})
    head.rot = (ang, 0, 0)
    add_tail(body, "tail", (0, -bh / 2 + 2, bl / 2), K, default_segs=2, default_len=6, width=3, droop=0.15)
    return root, {"head": head}


def build_flyer(c, K):
    root = Part("root")
    kind = K.str("kind", "bird")
    bl = K.int("body_len", {"bird": 8, "bat": 5, "insect": 8, "moth": 7, "dragon": 14, "crane": 8}.get(kind, 8), 2, 40)
    bw = ev(K.num("body_w", {"bird": 5, "bat": 5, "insect": 4, "moth": 4, "dragon": 8, "crane": 4}.get(kind, 5), 2, 20))
    bh = K.int("body_h", {"bird": 5, "bat": 5, "insect": 4, "moth": 4, "dragon": 7, "crane": 4}.get(kind, 5), 2, 20)
    span = K.num("wing_span", {"bird": 10, "bat": 9, "insect": 8, "moth": 9, "dragon": 18, "crane": 11}.get(kind, 10), 3, 48)
    chord = K.num("wing_w", {"bird": 6, "bat": 6, "insect": 4, "moth": 8, "dragon": 10, "crane": 7}.get(kind, 6), 2, 30)
    pairs = K.int("wings", 2 if kind == "insect" else 1, 1, 3)
    legs = K.int("legs", {"insect": 6, "moth": 0, "bat": 2, "bird": 2, "dragon": 4, "crane": 0}.get(kind, 2), 0, 8)
    body = root.child("body", (0, 14, 0))
    body.anim("bob", axis="y", amp=0.8, speed=0.18)
    if kind in ("insect", "moth"):
        # thorax + abdomen + head
        body.box(-bw / 2, -bh / 2, -bl / 3, bw, bh, int(bl / 2), "body", tag="body")
        ab = body.child("abdomen", (0, 0, bl / 6 + 1), rot=(-0.15, 0, 0))
        ab.box(-bw / 2 - (1 if kind == "moth" else 0), -bh / 2, 0, bw + (2 if kind == "moth" else 0), bh + 1, int(bl * 0.7), "body")
        ab.anim("sway", axis="x", amp=0.08, speed=0.2)
        if K.flag("stinger"):
            ab.box(-0.5, 0, int(bl * 0.7), 1, 1, 2, "horn_tip", pattern=False)
        if K.flag("fluffy") or kind == "moth":
            body.box(-bw / 2, -bh / 2, -bl / 3, bw, bh, 2, "second", inflate=0.5, pattern=False)
        head, _ = build_head(body, "head", (0, 0, -bl / 3), bw + 1 if kind == "insect" else bw, bh, 4, K,
                             {"back": 0, "eye_style": "compound", "eye_size": 2, "antennae": 4 if kind == "moth" else 3,
                              "mouth": "none", "look": 0.5})
        K.d["_wing_x"] = bw / 2 - 0.5
        add_wings(body, "wing", -bh / 2, -bl / 6, span, chord, K, kind="moth" if kind == "moth" else "insect",
                  pairs=1 if kind == "moth" else pairs, flap_amp=0.9 if kind == "insect" else 0.6,
                  flap_speed=2.2 if kind == "insect" else 0.7, dz_pair=chord * 0.7)
        for i in range(min(legs, 6) // 2):
            for s in (-1, 1):
                lp = body.child(f"leg{i}{'l' if s < 0 else 'r'}", (s * (bw / 2 - 0.5), bh / 2 - 0.5, -bl / 3 + 1 + i * 1.5), rot=(0.3, 0, s * 0.7), nohit=True)
                lp.box(-0.5, 0, -0.5, 1, 4, 1, "dark")
                lp.anim("sway", axis="x", amp=0.15, speed=0.4, phase=i)
    else:
        body.box(-bw / 2, -bh / 2, -bl / 2, bw, bh, bl, "body", tag="body")
        if kind in ("bird", "crane"):
            body.box(-bw / 2 + 1, bh / 2 - 1, -bl / 2 + 1, bw - 2, 1, bl - 3, "belly", pattern=False, inflate=0.05)
        neck = K.num("neck", 2 if kind == "dragon" else (3 if kind == "crane" else 0), 0, 20)
        hs = K.num("head_size", 1.0, 0.4, 3)
        hw = (bw - 1 if kind != "bat" else bw) * hs
        opts = {"back": 1, "look": 0.6}
        if kind in ("bird", "crane"):
            opts.update(beak=K.num("beak", 3 if kind == "bird" else 4), eye_style="cute", eye_size=1)
        if kind == "bat":
            opts.update(ears="pointy", snout=1, mouth="fangs", eye_style="cute")
        if kind == "dragon":
            opts.update(snout=4, horns="curved", eye_style="slit", jaw=True)
        if neck:
            np_ = body.child("neck", (0, -bh / 2 + 2, -bl / 2), rot=(-0.5, 0, 0))
            np_.box(-1.5, -1.5, -neck, 3, 3, neck + 1, "body")
            head, _ = build_head(np_, "head", (0, 0, -neck), hw, bh * hs, bh * hs, K, opts)
            head.rot = (0.5, 0, 0)
        else:
            head, _ = build_head(body, "head", (0, -bh / 2 + bh * 0.4 * hs, -bl / 2 + 1), hw, bh * hs, bh * hs * 0.9 + 1, K, opts)
        K.d["_wing_x"] = bw / 2 - 0.5
        wk = {"bird": "feather", "crane": "paper", "bat": "membrane", "dragon": "membrane"}.get(kind, "feather")
        wk = K.str("wing_kind", wk)
        add_wings(body, "wing", -bh / 2 + 1, -bl / 2 + chord / 2 + 1, span, chord, K, kind=wk, pairs=pairs,
                  flap_amp=0.8 if kind != "dragon" else 0.5, flap_speed=0.6 if kind != "bat" else 0.9)
        tk = "fan" if kind in ("bird", "crane") else ("spade" if kind == "dragon" else "thin")
        add_tail(body, "tail", (0, -bh / 2 + 1.5, bl / 2), K, default_segs=1 if kind in ("bird", "crane") else (3 if kind == "dragon" else 0),
                 default_len=4 if kind != "dragon" else 6, width=2, droop=-0.15, kind=K.str("tail_kind", tk))
        for i in range(legs // 2):
            for s in (-1, 1):
                lp = body.child(f"leg{i}{'l' if s < 0 else 'r'}", (s * (bw / 2 - 1.5), bh / 2, -1 + i * 4), nohit=True)
                lp.box(-0.5, 0, -0.5, 1, 3, 1, "dark")
                lp.box(-1, 3, -1.5, 2, 0, 2, "dark", pattern=False)
                lp.anim("sway", axis="x", amp=0.2, speed=0.3, phase=0 if s < 0 else PI)
    return root, {"head": head}


def build_floater(c, K):
    root = Part("root")
    kind = K.str("kind", "jelly")
    tent = K.int("tentacles", {"jelly": 6, "ghost": 0, "whale": 0, "lantern": 1, "wisp": 0, "balloon": 1, "cloud": 0,
                               "orb": 0}.get(kind, 4), 0, 12)
    tl = K.num("tentacle_len", 8, 2, 30)
    body = root.child("body", (0, 8, 0))
    body.anim("bob", axis="y", amp=1.0, speed=0.08)
    head = None
    if kind == "jelly":
        w = ev(K.num("bell_w", 12, 4, 30))
        h = K.int("bell_h", 9, 3, 24)
        body.box(-w / 2, -h, -w / 2, w, h, w, "body", tag="body", face={"eyes": K.int("eyes", 2), "eye_size": K.int("eye_size", 2), "eye_style": K.str("eye_style", "cute"), "mouth": K.str("mouth", "smile")})
        body.box(-w / 2 - 1, -2, -w / 2 - 1, w + 2, 2, w + 2, "second", pattern=False)
        body.box(-w / 2 + 2, -h - 2, -w / 2 + 2, w - 4, 2, w - 4, "body")
        body.cbox(0, -h / 2 + 1, 0, w - 4, h - 3, w - 4, "glow", inflate=-0.01, pattern=False)
        rad = w / 2 - 1.5
        for i in range(tent):
            a = 2 * PI * i / max(1, tent)
            x, z = math.sin(a) * rad, math.cos(a) * rad
            p = body.child(f"tentacle{i}", (x, 0, z), nohit=False)
            segs = 2 if tl >= 6 else 1
            sl = tl / segs
            q = p
            for j in range(segs):
                if j:
                    q = q.child(f"tentacle{i}_{j}", (0, sl, 0))
                q.box(-0.5 if j else -1, 0, -0.5 if j else -1, 1 if j else 2, sl, 1 if j else 2, "second" if j else "body", pattern=False)
                q.anim("tentacle", axis="x", amp=0.18, speed=0.1, phase=a * 2 + j * 0.8)
                q.anim("tentacle", axis="z", amp=0.12, speed=0.08, phase=a + j * 0.8)
    elif kind == "ghost":
        w = ev(K.num("body_w", 8, 4, 20))
        h = K.int("body_h", 14, 6, 30)
        d = K.int("body_d", 6, 3, 16)
        body.box(-w / 2, -h, -d / 2, w, h, d, "body", tag="body")
        tail = body.child("wisp", (0, 0, 0))
        tail.box(-w / 2 + 1, 0, -d / 2 + 1, w - 2, 4, d - 2, "body")
        t2 = tail.child("wisp2", (0, 4, 1))
        t2.box(-w / 2 + 2, 0, -d / 2 + 1, w - 4, 4, d - 2, "second")
        tail.anim("sway", axis="x", amp=0.25, speed=0.1)
        t2.anim("sway", axis="x", amp=0.3, speed=0.1, phase=1)
        head, _ = build_head(body, "head", (0, -h - 3.5, 0), w - 1, 7, 7, K,
                             {"back": 3.5, "eye_style": "glow", "mouth": "open" if c.behavior == "hostile" else "none", "look": 1.0})
        arms = K.int("arms", 2, 0, 4)
        for i in range(arms):
            s = -1 if i % 2 == 0 else 1
            ap = body.child(f"arm{i}", (s * (w / 2 + 1), -h + 2 + (i // 2) * 4, 0), rot=(-0.4, 0, s * 0.2))
            ap.box(-1, 0, -1, 2, 10, 2, "body")
            ap.box(-1, 10, -2, 2, 2, 1, "dark", pattern=False)
            ap.anim("arm", axis="x", amp=0.4, speed=0.2, phase=i)
    elif kind == "whale":
        bl = K.int("body_len", 26, 10, 60)
        bw = ev(K.num("body_w", 14, 6, 40))
        bh = K.int("body_h", 12, 6, 40)
        body.box(-bw / 2, -bh, -bl / 2, bw, bh, bl, "body", tag="body")
        body.box(-bw / 2 + 1, -1, -bl / 2 + 1, bw - 2, 2, bl - 4, "belly", pattern=False)
        face = {"eyes": K.int("eyes", 2), "eye_size": K.int("eye_size", 2), "eye_style": K.str("eye_style", "cute"), "mouth": "smile"}
        head = body.child("head", (0, -bh / 2, -bl / 2))
        head.box(-bw / 2 + 1, -bh / 2 + 1, -6, bw - 2, bh - 1, 6, "body", face=face, tag="head")
        head.anim("look", amp=0.2)
        for s in (-1, 1):
            f = body.child(f"fin{'l' if s < 0 else 'r'}", (s * bw / 2, -2, -bl / 2 + 8), rot=(0, 0, s * 0.4), nohit=True)
            f.box(0 if s > 0 else -8, 0, -2, 8, 1, 5, "second")
            f.anim("wing", axis="z", amp=0.3 * s, speed=0.1)
        tail = body.child("tail", (0, -bh / 2, bl / 2), nohit=True)
        tail.box(-2.5, -2.5, 0, 5, 5, 8, "body")
        fl = tail.child("fluke", (0, 0, 8))
        fl.box(-8, -0.5, -1, 16, 1, 5, "second")
        tail.anim("tail", axis="x", amp=0.2, speed=0.08)
        fl.anim("tail", axis="x", amp=0.25, speed=0.08, phase=-0.8)
        if K.flag("fin_top", True):
            body.box(-0.5, -bh - 3, 2, 1, 3, 5, "second", pattern=False, nohit=True)
        spikes = K.int("spikes", 0, 0, 10)
        add_spikes(body, 0, 0, -bh, -bl / 2 + 3, bl / 2 - 3, spikes, K)
        if K.flag("garden"):
            for i in range(5):
                body.box(-bw / 2 + 1 + (i * 3) % (bw - 2), -bh - 2, -bl / 2 + 3 + i * 4, 2, 2, 2, "accent", pattern=False, nohit=True)
    elif kind in ("lantern", "balloon", "orb", "wisp", "cloud"):
        if kind == "lantern":
            w, h = ev(K.num("body_w", 8, 4, 20)), K.int("body_h", 10, 4, 24)
            body.box(-w / 2, -h, -w / 2, w, h, w, "body", tag="body", face={"eyes": K.int("eyes", 2), "eye_size": 2, "eye_style": "cute", "mouth": "smile"})
            body.box(-w / 2 + 1, -h - 1, -w / 2 + 1, w - 2, 1, w - 2, "dark", pattern=False)
            body.box(-w / 2 + 1, 0, -w / 2 + 1, w - 2, 1, w - 2, "dark", pattern=False)
            body.box(-0.5, -h - 3, -0.5, 1, 2, 1, "dark", pattern=False)
            body.cbox(0, -h / 2, 0, w - 2, h - 2, w - 2, "glow", inflate=-0.02, pattern=False)
            for i in range(tent):
                tp = body.child(f"tassel{i}", (0, 1, 0))
                tp.box(-0.5, 0, -0.5, 1, 5, 1, "accent", pattern=False)
                tp.box(-1, 5, -1, 2, 2, 2, "accent", pattern=False)
                tp.anim("tentacle", axis="x", amp=0.2, speed=0.1)
        elif kind == "balloon":
            w = ev(K.num("body_w", 10, 4, 24))
            body.box(-w / 2, -w, -w / 2, w, w, w, "body", tag="body", face={"eyes": K.int("eyes", 2), "eye_size": 2, "eye_style": "cute", "mouth": K.str("mouth", "smile")})
            body.box(-w / 2 + 1, -w - 1, -w / 2 + 1, w - 2, 1, w - 2, "body")
            body.box(-1, 0, -1, 2, 1, 2, "dark", pattern=False)
            for i in range(tent):
                tp = body.child(f"string{i}", (0, 1, 0), nohit=True)
                tp.box(-0.5, 0, -0.5, 1, tl, 1, "dark", pattern=False)
                tp.anim("tentacle", axis="x", amp=0.15, speed=0.07)
        elif kind == "cloud":
            w = ev(K.num("body_w", 14, 6, 30))
            body.box(-w / 2, -6, -w / 2 + 2, w, 6, w - 4, "body", tag="body", face={"eyes": K.int("eyes", 2), "eye_size": 2, "eye_style": K.str("eye_style", "cute"), "mouth": K.str("mouth", "smile")})
            body.box(-w / 2 + 3, -9, -w / 2 + 4, w - 6, 3, w - 8, "body")
            for s in (-1, 1):
                body.box(s * (w / 2) - (2 if s > 0 else 0) - (0 if s > 0 else 2) + (2 if s > 0 else 0), -5, -w / 4, 2, 4, w / 2, "belly")
        else:  # orb / wisp
            w = ev(K.num("body_w", 6, 2, 20))
            body.cbox(0, -w / 2 - 2, 0, w, w, w, "glow", tag="body", pattern=False,
                      face={"eyes": K.int("eyes", 2), "eye_size": 1, "eye_style": "cute", "mouth": K.str("mouth", "none")})
            body.cbox(0, -w / 2 - 2, 0, w + 2, w + 2, w + 2, "second", inflate=0.0, pattern=False)
            ring = body.child("ring", (0, -w / 2 - 2, 0), nohit=True)
            ring.anim("spin", axis="y", amp=1, speed=0.08)
            for i in range(K.int("motes", 4, 0, 8)):
                a = 2 * PI * i / 4
                ring.cbox(math.sin(a) * (w / 2 + 4), (i % 2) * 2 - 1, math.cos(a) * (w / 2 + 4), 1, 1, 1, "glow", pattern=False)
    else:
        raise ValueError(f"unknown floater kind {kind!r}")
    if kind not in ("ghost", "whale"):
        head = None
    return root, {"head": head}


def build_blob(c, K):
    root = Part("root")
    shape = K.str("shape", "cube")
    s = ev(K.num("blob_size", 12, 4, 32))
    body = root.child("body", (0, 24, 0))
    body.anim("squish", axis="y", amp=0.08, speed=0.2)
    face = face_spec(K, 2, 2 if s >= 8 else 1, "cute", "smile")
    head = body
    if shape == "box":
        # treasure-chest mimic: base + hinged lid with teeth + tongue
        h = s * 5 // 8
        body.box(-s / 2, -h, -s / 2, s, h, s, "body", tag="body", face={"lock": False, "eyes": 0})
        body.box(-s / 2 + 1, -h + 0.1, -s / 2 + 1, s - 2, 0, s - 2, "inner", pattern=False)
        for i in range(s // 2):
            body.box(-s / 2 + 0.5 + i * 2, -h - 1, -s / 2, 1, 1, 1, "teeth", pattern=False)
        lid = body.child("lid", (0, -h, s / 2))
        lid.box(-s / 2, -s * 3 // 8, -s, s, s * 3 // 8, s, "body", face=dict(face, mouth="none"))
        lid.box(-1, -2, -s - 1, 2, 3, 1, "accent", pattern=False)
        for i in range(s // 2):
            lid.box(-s / 2 + 1.5 + i * 2, 0, -s, 1, 1, 1, "teeth", pattern=False)
        lid.anim("jaw", axis="x", amp=-0.45, speed=0.3, rest=-0.15)
        tongue = body.child("tongue", (0, -h, 0))
        tongue.box(-1.5, -1, -s / 2 - 2, 3, 1, s / 2 + 2, "inner", pattern=False)
        tongue.anim("sway", axis="x", amp=0.15, speed=0.4)
    elif shape == "stack":
        body.box(-s / 2, -s * 0.6, -s / 2, s, int(s * 0.6), s, "body", tag="body")
        top = body.child("top", (0, -s * 0.6, 0))
        top.box(-s / 2 + 2, -s * 0.5, -s / 2 + 2, s - 4, int(s * 0.5), s - 4, "body", face=face)
        top.anim("squish", axis="y", amp=0.1, speed=0.2, phase=1)
        head = top
    elif shape == "round":
        body.box(-s / 2 + 1, -s, -s / 2 + 1, s - 2, s, s - 2, "body", tag="body", face=face)
        body.box(-s / 2, -s + 2, -s / 2 + 2, s, s - 4, s - 4, "body")
        body.box(-s / 2 + 2, -s + 2, -s / 2, s - 4, s - 4, s, "body")
    elif shape == "drop":
        body.box(-s / 2, -s * 0.7, -s / 2, s, int(s * 0.7), s, "body", tag="body", face=face)
        body.box(-s / 2 + 2, -s * 0.7 - 3, -s / 2 + 2, s - 4, 3, s - 4, "body")
        body.box(-1, -s * 0.7 - 5, -1, 2, 2, 2, "body")
    else:  # cube
        body.box(-s / 2, -s, -s / 2, s, s, s, "body", tag="body", face=face)
    if K.flag("core", shape in ("cube",) and K.flag("translucent")):
        cs = max(2, s // 2 - (s // 2) % 2)
        body.cbox(0, -s / 2, 0, cs, cs, cs, "second", pattern=False)
    if K.flag("feet"):
        for sx in (-1, 1):
            f = root.child(f"foot{'l' if sx < 0 else 'r'}", (sx * s / 4, 24 - 2, -s / 4))
            f.box(-1.5, 0, -2, 3, 2, 4, "dark")
            f.anim("leg", axis="x", amp=0.6, phase=0 if sx < 0 else PI)
        body.pivot = (0, 22, 0)
    spikes = K.int("spikes", 0, 0, 12)
    if spikes:
        top_y = -s if shape != "box" else -s
        for i in range(spikes):
            a = 2 * PI * i / spikes
            body.box(math.sin(a) * s / 3 - 0.5, top_y - 2, math.cos(a) * s / 3 - 0.5, 1, 2, 1, "horn_tip", pattern=False, nohit=True)
    if K.str("horns", "none") != "none" or K.flag("cap") or K.int("antennae", 0) or K.int("eyestalks", 0):
        hp = (head if head is not body else body)
        sub = Knobs(dict(K.d, eyes=0, ears="none", snout=0), 0)
        h2 = hp.child("crown", (0, -s if hp is body else -s * 0.5, 0))
        build_head(h2, "crown_head", (0, 0, 0), max(4, s - 4), 1, max(2, s - 4), sub, {"back": (s - 4) // 2, "look": 0.0})
        for p in h2.walk():
            for cb in p.cubes:
                if cb.tag == "head":
                    cb.size = (cb.size[0], 0, cb.size[2])
    return root, {"head": None}


def build_crawler(c, K):
    root = Part("root")
    kind = K.str("kind", "spider")
    per_side = K.int("legs", {"spider": 4, "ant": 3, "crab": 3, "scorpion": 4, "beetle": 3, "mite": 3, "centipede": 7,
                              "rat": 2}.get(kind, 4), 1, 10)
    if kind == "rat":
        return build_quadruped(c, Knobs(dict({"legs": 4, "leg_len": 3, "body_len": 10, "body_w": 6, "body_h": 5,
                                              "ears": "round", "tail": 3, "tail_len": 4, "whiskers": True, "snout": 2},
                                             **K.d), 0))
    ll = K.num("leg_len", {"spider": 10, "ant": 7, "crab": 6, "scorpion": 6, "beetle": 6, "mite": 4, "centipede": 4}.get(kind, 7), 2, 30)
    bw = ev(K.num("body_w", {"spider": 8, "ant": 5, "crab": 12, "scorpion": 7, "beetle": 9, "mite": 6, "centipede": 4}.get(kind, 8), 2, 30))
    bh = K.int("body_h", {"spider": 6, "ant": 4, "crab": 5, "scorpion": 4, "beetle": 6, "mite": 4, "centipede": 3}.get(kind, 5), 2, 20)
    bl = K.int("body_len", {"spider": 8, "ant": 5, "crab": 8, "scorpion": 8, "beetle": 9, "mite": 6, "centipede": 4}.get(kind, 8), 2, 30)
    lift = max(2, int(ll * 0.45))
    by = 24 - lift - bh / 2
    body = root.child("body", (0, by, 0))
    body.box(-bw / 2, -bh / 2, -bl / 2, bw, bh, bl, "body", tag="body")
    if kind in ("spider", "ant"):
        aw, ah, al = (bw + 4, bh + 3, bl + 3) if kind == "spider" else (bw + 1, bh + 1, bl + 2)
        ab = body.child("abdomen", (0, -1 if kind == "spider" else 0, bl / 2), rot=(0.12, 0, 0))
        ab.box(-aw / 2, -ah / 2, 0, aw, ah, al, "body")
        ab.anim("sway", axis="x", amp=0.04, speed=0.15)
        if K.flag("stinger"):
            ab.box(-0.5, 0, al, 1, 1, 2, "horn_tip", pattern=False)
    if kind == "beetle" or K.flag("shell"):
        body.box(-bw / 2 - 0.5, -bh / 2 - 2, -bl / 2 + 1, bw + 1, 3, bl, "shell", pattern=False)
        body.box(-0.5, -bh / 2 - 2.1, -bl / 2 + 1, 1, 0, bl, "dark", pattern=False)
    if kind == "centipede":
        segs = K.int("segments", 6, 2, 16)
        prev = body
        for i in range(segs):
            sp = prev.child(f"seg{i}", (0, 0, bl if i else bl / 2))
            sp.box(-bw / 2, -bh / 2, 0, bw, bh, bl, "body")
            sp.anim("segment", axis="y", amp=0.12, speed=0.3, phase=-0.6 * (i + 1))
            for s in (-1, 1):
                lp = sp.child(f"segleg{i}{'l' if s < 0 else 'r'}", (s * bw / 2, 0, bl / 2), rot=(0, 0, s * 0.6))
                lp.box(-0.5 if s < 0 else -0.5, 0, -0.5, 1, ll, 1, "dark")
                lp.anim("leg", axis="x", amp=0.5, phase=i * 0.9 + (0 if s < 0 else PI))
            prev = sp
    # legs radiating sideways
    for i in range(per_side):
        t = 0.5 if per_side == 1 else i / (per_side - 1)
        z = -bl / 2 + 1 + t * (bl - 2)
        spread = (t - 0.5) * 0.9
        for s in (-1, 1):
            name = f"leg{i}{'l' if s < 0 else 'r'}"
            up_a = 1.9 if kind == "spider" else 1.35
            lp = root.child(name, (s * (bw / 2 - 0.5), by + 1, z), rot=(0, -s * spread, -s * up_a))
            lp.box(-1 if s < 0 else -1, 0, -1, 2, int(ll * 0.55), 2, "body" if kind != "spider" else "dark")
            low = lp.child(name + "_low", (0, int(ll * 0.55), 0), rot=(0, 0, s * (up_a - 0.3)))
            low.box(-0.5, -0.5, -0.5, 1, int(ll * 0.6) + 1, 1, "dark")
            ph = (i % 2) * PI + (0 if s < 0 else PI)
            lp.anim("leg", axis="y", amp=0.35, phase=ph)
            lp.anim("leg", axis="z", amp=0.2, phase=ph + PI / 2)
    # claws
    claws = K.flag("claws", kind in ("crab", "scorpion"))
    if claws:
        for s in (-1, 1):
            cp = root.child(f"claw{'l' if s < 0 else 'r'}", (s * (bw / 2 - 1), by, -bl / 2), rot=(0, -s * 0.5, 0))
            cp.box(-1, -1, -5, 2, 2, 5, "body")
            pin = cp.child(f"pincer{'l' if s < 0 else 'r'}", (0, 0, -5), rot=(0, s * 0.5, 0))
            big = 4 if kind == "crab" else 3
            pin.box(-big / 2, -big / 2, -big - 1, big, big, big + 1, "second")
            pin.box(-0.5, -big / 2, -big - 3, 1, 1, 2, "horn")
            pin.box(-0.5, big / 2 - 1, -big - 3, 1, 1, 2, "horn")
            cp.anim("arm", axis="x", amp=0.3, phase=0 if s < 0 else PI)
            pin.anim("jaw", axis="y", amp=0.25 * s, speed=0.4)
    # stinger tail (scorpion)
    if kind == "scorpion" or K.flag("stinger_tail"):
        K2 = Knobs(dict(K.d, tail=K.int("tail", 4), tail_len=K.num("tail_len", 4), tail_kind="stinger"), 0)
        t = add_tail(body, "tail", (0, -bh / 2 + 1, bl / 2), K2, default_segs=4, default_len=4, width=3, droop=1.0, kind="stinger")
        if t is not None:
            q = t
            while q.children:
                q.rot = (0.45, 0, 0)
                q = q.children[0]
    eyes_default = {"spider": 6, "ant": 2, "crab": 2, "scorpion": 4, "beetle": 2, "mite": 2, "centipede": 2}.get(kind, 2)
    hs = K.num("head_size", 1.0, 0.3, 3)
    if kind == "crab":
        head = body.child("head", (0, -bh / 2, -bl / 2))
        head.anim("look", amp=0.2)
        stalks = K.int("eyestalks", 2)
        for i in range(stalks):
            sx = (i + 0.5) / stalks - 0.5
            sp = head.child(f"stalk{i}", (sx * (bw - 4), 0, 1), nohit=True)
            sp.box(-0.5, -3, -0.5, 1, 3, 1, "body")
            sp.box(-1, -5, -1, 2, 2, 2, "eye", pattern=False)
            sp.anim("sway", axis="z", amp=0.15, speed=0.2, phase=i * 2)
        body.box(-bw / 2 + 2, 0, -bl / 2 - 0.01, bw - 4, 1, 0, "dark", face={"mouth": "none"}, pattern=False)
    else:
        head, _ = build_head(body, "head", (0, 0, -bl / 2 + 0.5), max(4, (bw - 2) * hs), max(3, bh * hs), max(3, 5 * hs), K,
                             {"back": 0, "eyes": eyes_default, "eye_size": 1 if eyes_default > 2 else 2,
                              "eye_style": "glow" if c.behavior == "hostile" else ("compound" if kind in ("ant", "beetle", "mite") else "round"),
                              "mandibles": kind in ("ant", "spider", "beetle"), "antennae": 4 if kind in ("ant", "beetle") else 0,
                              "mouth": "none", "look": 0.5})
    return root, {"head": head}


def build_serpent(c, K):
    root = Part("root")
    segs = K.int("segments", 6, 2, 20)
    w = ev(K.num("seg_w", 6, 2, 30))
    sl = K.int("seg_len", 6, 2, 24)
    taper = K.num("taper", 0.6, 0.1, 1.0)
    head_kind = K.str("head", "snake")
    ground_y = 24 - w / 2
    body = root.child("body", (0, ground_y, -sl * segs / 2 + sl))
    body.box(-w / 2, -w / 2, 0, w, w, sl, "body", tag="body")
    body.anim("segment", axis="y", amp=0.18, speed=0.25, phase=0)
    prev = body
    spikes = K.int("spikes", 0, 0, 1)
    fins = K.flag("fins")
    for i in range(1, segs):
        t = i / max(1, segs - 1)
        ww = ev(max(2, w * (1 - (1 - taper) * t)))
        sp = prev.child(f"seg{i}", (0, 0, sl), nohit=False)
        sp.box(-ww / 2, -ww / 2, 0, ww, ww, sl, "body" if i % 2 or not K.flag("ringed") else "second")
        sp.anim("segment", axis="y", amp=0.25, speed=0.25, phase=-0.9 * i)
        if spikes or K.flag("ridge"):
            sp.box(-0.5, -ww / 2 - 2, 1, 1, 2, max(1, sl - 2), "accent", pattern=False, nohit=True)
        if fins and i % 2 == 1:
            for s in (-1, 1):
                sp.box(s * ww / 2 - (2 if s < 0 else 0), 0, 1, 2, 0, max(1, sl - 2), "second", pattern=False, nohit=True)
        prev = sp
    tk = K.str("tail_kind", "rattle" if K.flag("rattle") else "thin")
    if tk == "rattle":
        prev.box(-1, -1, sl, 2, 2, 1, "accent", pattern=False)
        prev.box(-1, -1, sl + 1.5, 2, 2, 1, "accent", pattern=False)
        prev.box(-1, -1, sl + 3, 2, 2, 1, "accent", pattern=False)
    elif tk == "fluke":
        prev.box(-4, -0.5, sl - 1, 8, 1, 4, "second", pattern=False)
    # head
    hw = ev(K.num("head_w", w + 2, 2, 40))
    hl = K.int("head_len", max(5, hw), 2, 40)
    opts = {"back": 0, "look": 0.5, "eye_style": "slit" if c.behavior == "hostile" else "round",
            "mouth": "fangs" if c.behavior == "hostile" else "none"}
    if head_kind == "worm":
        head = body.child("head", (0, 0, 0))
        head.anim("look", amp=0.4)
        head.box(-hw / 2, -hw / 2, -hl, hw, hw, hl, "body", tag="head",
                 face={"eyes": K.int("eyes", 0), "eye_size": 1, "eye_style": "glow", "mouth": "maw_ring"})
        for i in range(4):
            a = PI / 2 * i
            mp = head.child(f"mandible{i}", (math.sin(a) * hw / 3, -math.cos(a) * hw / 3, -hl),
                            rot=(math.cos(a) * 0.5, -math.sin(a) * 0.5, 0), nohit=True)
            mp.box(-1, -1, -3, 2, 2, 3, "horn")
            mp.anim("jaw", axis="x" if i % 2 == 0 else "y", amp=0.3 * (1 if i < 2 else -1), speed=0.3)
    elif head_kind == "eel":
        head, _ = build_head(body, "head", (0, 0, 0), hw, w, hl, K, dict(opts, back=0, ears="fin"))
    elif head_kind == "dragon":
        head, _ = build_head(body, "head", (0, -1, 0), hw, w + 1, hl, K, dict(opts, back=0, snout=4, horns="curved", jaw=True))
    else:
        head, _ = build_head(body, "head", (0, 0, 0), hw, max(3, w - 1), hl, K, dict(opts, back=0, snout=2))
    if K.flag("hood"):
        hp = head.child("hood", (0, 0, -1), nohit=True)
        hp.box(-hw / 2 - 3, -w / 2 - 1, 0, hw + 6, w + 2, 1, "second", pattern=False)
    return root, {"head": head}


def build_swimmer(c, K):
    root = Part("root")
    kind = K.str("kind", "fish")
    if kind == "eel":
        return build_serpent(c, Knobs(dict({"head": "eel", "fins": True, "tail_kind": "fluke"}, **K.d), 0))
    bl = K.int("body_len", {"fish": 10, "ray": 12, "shark": 18, "whale": 24, "shrimp": 8, "koi": 12, "angler": 10}.get(kind, 10), 3, 60)
    bw = ev(K.num("body_w", {"fish": 4, "ray": 4, "shark": 6, "whale": 12, "shrimp": 4, "koi": 5, "angler": 9}.get(kind, 4), 2, 40))
    bh = K.int("body_h", {"fish": 6, "ray": 3, "shark": 7, "whale": 10, "shrimp": 4, "koi": 5, "angler": 8}.get(kind, 6), 2, 40)
    body = root.child("body", (0, 24 - bh / 2 - 1, 0))
    body.anim("swim", axis="y", amp=0.12, speed=0.3)
    face = face_spec(K, 2, 1 if bh < 6 else 2, "round" if c.behavior != "hostile" else "slit",
                     "maw" if kind == "angler" or K.str("mouth", "") == "maw" else ("smile" if kind in ("whale",) else "none"))
    head = None
    if kind == "ray":
        span = K.num("wing_span", 10, 4, 40)
        body.box(-bw / 2, -bh / 2, -bl / 2, bw, bh, bl, "body", tag="body", face=face)
        for s in (-1, 1):
            wp = body.child(f"wing{'l' if s < 0 else 'r'}", (s * bw / 2, 0, -1), nohit=True)
            wp.box(0 if s > 0 else -span, -0.5, -bl / 2 + 2, span, 1, bl - 3, "body")
            wp.anim("wing", axis="z", amp=0.35 * s, speed=0.15)
        t = body.child("tail", (0, 0, bl / 2), nohit=True)
        t.box(-0.5, -0.5, 0, 1, 1, bl, "dark")
        t.anim("tail", axis="y", amp=0.3, speed=0.2)
        head = body
    else:
        body.box(-bw / 2, -bh / 2, -bl / 2, bw, bh, bl, "body", tag="body", face=face)
        if kind in ("fish", "koi", "angler", "shark", "whale"):
            body.box(-bw / 2 + 0.5, bh / 2 - 1, -bl / 2 + 1, bw - 1, 1, bl - 2, "belly", pattern=False, inflate=0.02)
        tail = body.child("tail", (0, 0, bl / 2), nohit=True)
        tl = max(3, bl // 3)
        tail.box(-bw / 4, -bh / 4, 0, max(1, bw // 2), max(2, bh // 2), tl, "body")
        tail.anim("tail", axis="y", amp=0.45, speed=0.35)
        fin = tail.child("tailfin", (0, 0, tl), nohit=True)
        fh = bh + 3 if kind != "whale" else 1
        if kind in ("whale",):
            fin.box(-bw / 2 - 3, -0.5, -1, bw + 6, 1, 5, "second")
        elif kind == "shrimp":
            fin.box(-3, -0.5, 0, 6, 1, 3, "second")
        else:
            fin.box(-0.5, -fh / 2, -1, 1, fh, 4 + (2 if kind == "koi" else 0), "second", pattern=False)
        fin.anim("tail", axis="y", amp=0.35, speed=0.35, phase=-0.9)
        # fins
        if K.flag("fins", True) and kind != "shrimp":
            dh = 3 if kind != "shark" else 5
            body.box(-0.5, -bh / 2 - dh, -bl / 6, 1, dh, bl // 3 + 1, "second", pattern=False, nohit=True)
            for s in (-1, 1):
                fp = body.child(f"fin{'l' if s < 0 else 'r'}", (s * bw / 2, bh / 4, -bl / 4), rot=(0, 0, s * 0.6), nohit=True)
                fp.box(0 if s > 0 else -4, 0, -1, 4, 0, 3, "second", pattern=False)
                fp.anim("wing", axis="z", amp=0.3 * s, speed=0.4)
        if kind == "shrimp":
            for i in range(4):
                for s in (-1, 1):
                    lp = body.child(f"leg{i}{'l' if s < 0 else 'r'}", (s * (bw / 2 - 0.5), bh / 2, -bl / 2 + 2 + i * 1.5), nohit=True)
                    lp.box(-0.5, 0, -0.5, 1, 2, 1, "accent")
                    lp.anim("leg", axis="x", amp=0.5, phase=i)
            K.d.setdefault("antennae", 6)
        head = body
        if kind == "angler" or K.flag("lure"):
            lp = body.child("lure", (0, -bh / 2, -bl / 2 + 1), rot=(-0.8, 0, 0), nohit=True)
            lp.box(-0.5, -6, -0.5, 1, 6, 1, "dark")
            lp2 = lp.child("lure2", (0, -6, 0), rot=(1.3, 0, 0))
            lp2.box(-0.5, -3, -0.5, 1, 3, 1, "dark")
            lp2.box(-1, -5, -1, 2, 2, 2, "glow")
            lp.anim("sway", axis="x", amp=0.15, speed=0.15)
        if face["mouth"] == "maw":
            jaw = body.child("jaw", (0, bh / 2 - 1, -bl / 2 + 3))
            jaw.box(-bw / 2, 0, -3, bw, 2, 3, "belly", pattern=False, face={"teeth_top": True})
            jaw.anim("jaw", amp=0.4, speed=0.3)
        if K.int("antennae", 0) or K.flag("whiskers"):
            for s in (-1, 1):
                ap = body.child(f"feeler{'l' if s < 0 else 'r'}", (s * (bw / 2 - 1), -1, -bl / 2), rot=(-0.4, s * 0.4, 0), nohit=True)
                ap.box(-0.5, -0.5, -K.int("antennae", 5), 1, 0, K.int("antennae", 5), "dark", pattern=False)
                ap.anim("sway", axis="y", amp=0.2, speed=0.3, phase=0 if s < 0 else 1)
    return root, {"head": head}


def build_golem(c, K):
    root = Part("root")
    leg_len = K.num("leg_len", 10, 3, 30)
    tw = ev(K.num("torso_w", 16, 6, 32))
    th = K.int("torso_h", 12, 6, 30)
    td = K.int("torso_d", 8, 4, 20)
    lw = K.int("leg_w", 5, 2, 10)
    hip_y = 24 - leg_len
    body = root.child("body", (0, hip_y, 0))
    body.box(-tw / 2 + 2, -4, -td / 2 + 1, tw - 4, 4, td - 2, "body")  # waist
    chest = body.child("chest", (0, -4, 0))
    chest.box(-tw / 2, -th, -td / 2, tw, th, td, "body", tag="body")
    chest.anim("sway", axis="y", amp=0.05, speed=0.05)
    if K.flag("core", True):
        chest.cbox(0, -th / 2, -td / 2 - 0.5, 4, 4, 1, "glow", pattern=False)
    if K.flag("shoulders"):
        for s in (-1, 1):
            chest.box(s * tw / 2 - (4 if s < 0 else 0) - (0 if s < 0 else 0), -th - 2, -td / 2 - 1, 4, 4, td + 2, "second", pattern=False)
    crystals = K.int("crystals", 0, 0, 8)
    for i in range(crystals):
        s = -1 if i % 2 else 1
        cp = chest.child(f"crystal{i}", (s * (2 + (i // 2) * 3), -th, td / 4), rot=(0.4, 0, s * 0.3), nohit=True)
        cp.box(-1, -5 - (i % 3), -1, 2, 5 + (i % 3), 2, "glow", pattern=False)
    if K.flag("chimney"):
        chest.box(tw / 2 - 5, -th - 6, td / 2 - 4, 3, 6, 3, "dark", pattern=False)
    if K.flag("gears"):
        g = chest.child("gear", (0, -th / 2, td / 2), nohit=True)
        g.box(-3, -3, 0, 6, 6, 1, "accent", pattern=False)
        g.box(-4, -1, 0.2, 8, 2, 1, "accent", pattern=False)
        g.box(-1, -4, 0.2, 2, 8, 1, "accent", pattern=False)
        g.anim("spin", axis="z", amp=1, speed=0.05)
    spikes = K.int("spikes", 0, 0, 10)
    add_spikes(chest, 0, 0, -th, -td / 2 + 1, td / 2 - 1, spikes, K)
    for s in (-1, 1):
        leg(root, f"leg{'l' if s < 0 else 'r'}", (s * (tw / 4), hip_y, 0), leg_len, lw, K, 0 if s < 0 else PI, amp=0.8)
    arm_len = K.num("arm_len", th + leg_len - 2, 4, 40)
    aw = K.int("arm_w", 4, 2, 10)
    for s in (-1, 1):
        ap = chest.child(f"arm{'l' if s < 0 else 'r'}", (s * (tw / 2 + aw / 2), -th + 2, 0))
        ap.box(-aw / 2, -2, -aw / 2, aw, arm_len, aw, "body")
        ap.box(-aw / 2 - 0.5, arm_len - 4, -aw / 2 - 0.5, aw + 1, 4, aw + 1, "second", pattern=False)
        ap.anim("arm", axis="x", amp=0.7, phase=PI if s < 0 else 0, attack=1.6)
    hs = K.num("head_size", 1.0, 0.3, 3)
    hw = 8 * hs
    head, hb = build_head(chest, "head", (0, -th - 5 * hs, -2), hw, 9 * hs, 8 * hs, K,
                          {"back": 2 + 2 * hs, "eye_style": "glow", "eye_size": 2, "mouth": "none", "look": 1.0})
    if K.flag("nose", True):
        head.box(-1, -1, -8 * hs + 2 - 2, 2, 4, 2, "body", pattern=False)
    return root, {"head": head}


def build_eye(c, K):
    root = Part("root")
    s = ev(K.num("eye_px", 12, 4, 32))
    body = root.child("body", (0, 24 - s / 2 - 2, 0))
    body.anim("bob", axis="y", amp=1.0, speed=0.1)
    body.anim("look", amp=1.0)
    body.box(-s / 2, -s / 2, -s / 2, s, s, s, "body", tag="body", face={"big_eye": True}, pattern=True)
    if K.flag("lids", True):
        body.box(-s / 2 - 0.5, -s / 2 - 0.5, -s / 2 - 0.5, s + 1, 2, s + 1, "second", pattern=False)
    stalks = K.int("stalks", 0, 0, 10)
    for i in range(stalks):
        a = PI * (i + 0.5) / stalks - PI / 2
        sp = body.child(f"stalk{i}", (math.sin(a) * s / 3, -s / 2, math.cos(a) * 1), rot=(-0.3, 0, math.sin(a) * 0.9), nohit=True)
        sp.box(-0.5, -5, -0.5, 1, 5, 1, "body")
        sp.box(-1, -7, -1, 2, 2, 2, "eye", pattern=False)
        sp.anim("tentacle", axis="z", amp=0.2, speed=0.15, phase=i * 1.3)
    tent = K.int("tentacles", 0, 0, 10)
    tl = K.num("tentacle_len", 6, 2, 20)
    for i in range(tent):
        a = 2 * PI * i / tent
        tp = body.child(f"tentacle{i}", (math.sin(a) * s / 3, s / 2, math.cos(a) * s / 3), nohit=True)
        tp.box(-1, 0, -1, 2, tl / 2, 2, "body")
        t2 = tp.child(f"tentacle{i}b", (0, tl / 2, 0))
        t2.box(-0.5, 0, -0.5, 1, tl / 2, 1, "second")
        tp.anim("tentacle", axis="x", amp=0.25, speed=0.12, phase=a)
        t2.anim("tentacle", axis="x", amp=0.3, speed=0.12, phase=a + 0.8)
    if K.flag("wings"):
        K.d["_wing_x"] = s / 2
        add_wings(body, "wing", -s / 4, 0, max(6, s * 0.8), max(4, s * 0.5), K, kind=K.str("wing_kind", "membrane"), flap_speed=0.9)
    spikes = K.int("spikes", 0, 0, 12)
    for i in range(spikes):
        a = 2 * PI * i / spikes
        body.box(math.sin(a) * (s / 2) - 0.5, -s / 2 - 2, math.cos(a) * (s / 2 - 1) - 0.5, 1, 2, 1, "horn_tip", pattern=False, nohit=True)
    return root, {"head": body}


def build_hopper(c, K):
    root = Part("root")
    kind = K.str("kind", "frog")
    bw = ev(K.num("body_w", {"frog": 8, "rabbit": 6, "kangaroo": 6, "flea": 6}.get(kind, 8), 2, 24))
    bh = K.int("body_h", {"frog": 5, "rabbit": 6, "kangaroo": 9, "flea": 6}.get(kind, 5), 2, 24)
    bl = K.int("body_len", {"frog": 8, "rabbit": 8, "kangaroo": 6, "flea": 7}.get(kind, 8), 2, 24)
    leg_len = K.num("leg_len", 4 if kind in ("frog", "rabbit") else 7, 2, 20)
    by = 24 - leg_len + 1 - bh / 2
    body = root.child("body", (0, by, 0))
    upright = kind == "kangaroo"
    if upright:
        body.rot = (0.5, 0, 0)
    body.box(-bw / 2, -bh / 2, -bl / 2, bw, bh, bl, "body", tag="body")
    body.box(-bw / 2 + 1, bh / 2 - 1, -bl / 2 + 1, bw - 2, 1, bl - 2, "belly", pattern=False, inflate=0.02)
    body.anim("hop_body", axis="x", amp=0.3)
    # back legs (big)
    for s in (-1, 1):
        th = root.child(f"thigh{'l' if s < 0 else 'r'}", (s * (bw / 2), 24 - leg_len, bl / 2 - 2))
        th.box(-1.5 if s < 0 else -1.5, -2, -2, 3, leg_len + 1, 4, "body")
        th.box(-1.5, leg_len - 1, -4, 3, 1, 4, "dark" if kind != "frog" else "body", pattern=False)
        th.anim("hop_leg", axis="x", amp=0.9)
    # front legs
    for s in (-1, 1):
        fl = root.child(f"arm{'l' if s < 0 else 'r'}", (s * (bw / 2 - 1), by + bh / 2 - 1, -bl / 2 + 2))
        fl.box(-1, 0, -1, 2, 24 - (by + bh / 2 - 1), 2, "body")
        fl.anim("hop_arm", axis="x", amp=0.7)
    hs = K.num("head_size", 1.0, 0.4, 3)
    if kind == "frog":
        head, hb = build_head(body, "head", (0, -bh / 2 + 2, -bl / 2 + 1), bw * hs, 4 * hs, 6 * hs, K,
                              {"back": 1, "eyes": 0, "mouth": "smile", "look": 0.3})
        for s in (-1, 1):
            head.box(s * (bw * hs / 2 - 1.5) - 1.5, -2 * hs - 2, -4 * hs, 3, 3, 3, "eye", pattern=False)
        if K.flag("throat_sac", False):
            head.box(-2, 2 * hs, -4 * hs, 4, 2, 3, "glow", pattern=False)
    else:
        head, hb = build_head(body, "head", (0, -bh / 2, -bl / 2 + 1), bw * 0.9 * hs, 5 * hs, 5 * hs, K,
                              {"back": 1, "ears": "long" if kind == "rabbit" else "pointy", "eye_style": "cute", "snout": 1, "look": 0.6})
    add_tail(body, "tail", (0, -bh / 4, bl / 2), K, default_segs=1 if kind != "frog" else 0,
             default_len=2 if kind == "rabbit" else 8, width=2 if kind == "rabbit" else 3,
             droop=-0.4, kind=K.str("tail_kind", "puff" if kind == "rabbit" else "thin"))
    return root, {"head": head}


def build_tripod(c, K):
    root = Part("root")
    legs = K.int("legs", 3, 3, 6)
    ll = K.num("leg_len", 22, 6, 60)
    dw = ev(K.num("dome_w", 14, 6, 40))
    dh = K.int("dome_h", 8, 3, 30)
    shape = K.str("dome", "dome")
    top_y = 24 - ll
    body = root.child("body", (0, top_y, 0))
    body.anim("bob", axis="y", amp=0.6, speed=0.1)
    body.anim("sway", axis="z", amp=0.04, speed=0.12)
    if shape == "pod":
        body.box(-dw / 2, -dh, -dw / 2 - 2, dw, dh, dw + 4, "body", tag="body")
    else:
        body.box(-dw / 2, -dh * 0.6, -dw / 2, dw, int(dh * 0.6), dw, "body", tag="body")
        body.box(-dw / 2 + 2, -dh, -dw / 2 + 2, dw - 4, int(dh * 0.4) + 1, dw - 4, "second", pattern=False)
    body.box(-dw / 2 + 1, 0, -dw / 2 + 1, dw - 2, 2, dw - 2, "dark", pattern=False)
    eye_n = K.int("eyes", 1, 0, 6)
    head = body.child("head", (0, -dh * 0.3, -dw / 2))
    head.anim("look", amp=0.6)
    if eye_n:
        es = K.int("eye_size", 2, 1, 4)
        head.box(-(es + 1), -es, -2, 2 * es + 2, 2 * es, 2, "eye", pattern=False, face={"eye_ball": True})
    for i in range(legs):
        a = 2 * PI * i / legs + PI
        x, z = math.sin(a) * dw / 3, math.cos(a) * dw / 3
        rot_y = a
        lp = root.child(f"leg{i}", (x, top_y + 1, z), rot=(0, rot_y, 0))
        th = lp.child(f"thigh{i}", (0, 0, 0), rot=(0.45, 0, 0))
        tl = ll * 0.55
        th.box(-1.5, 0, -1.5, 3, tl, 3, "body")
        sh = th.child(f"shin{i}", (0, tl, 0), rot=(-0.75, 0, 0))
        sh.box(-1, 0, -1, 2, ll * 0.6, 2, "dark")
        sh.box(-1.5, ll * 0.6 - 1, -1.5, 3, 1, 3, "accent", pattern=False)
        th.anim("leg", axis="x", amp=0.35, phase=2 * PI * i / legs)
        sh.anim("leg", axis="x", amp=0.25, phase=2 * PI * i / legs + 0.8)
    tent = K.int("tentacles", 0, 0, 8)
    for i in range(tent):
        a = 2 * PI * i / tent
        tp = body.child(f"tentacle{i}", (math.sin(a) * 2, 2, math.cos(a) * 2), nohit=True)
        tp.box(-0.5, 0, -0.5, 1, 6, 1, "second")
        t2 = tp.child(f"tentacle{i}b", (0, 6, 0))
        t2.box(-0.5, 0, -0.5, 1, 5, 1, "accent")
        tp.anim("tentacle", axis="x", amp=0.3, speed=0.15, phase=a)
        t2.anim("tentacle", axis="z", amp=0.3, speed=0.15, phase=a + 1)
    for i in range(K.int("lights", 4, 0, 8)):
        a = 2 * PI * i / max(1, K.int("lights", 4))
        body.box(math.sin(a) * (dw / 2 - 1) - 0.5, -1, math.cos(a) * (dw / 2 - 1) - 0.5, 1, 1, 1, "glow", pattern=False)
    return root, {"head": head}


def build_plantoid(c, K):
    root = Part("root")
    head_kind = K.str("head", "mushroom_cap")
    legs = K.int("legs", 2, 0, 6)
    ll = K.num("leg_len", 4, 0, 16)
    sw = ev(K.num("stem_w", 6, 2, 16))
    sh = K.int("stem_h", 6, 2, 30)
    hip = 24 - ll
    body = root.child("body", (0, hip, 0))
    body.anim("sway", axis="z", amp=0.05, speed=0.12)
    stem_face = face_spec(K, 2, 1 if sw < 6 else 2, "cute", "smile")
    is_cap = head_kind in ("mushroom_cap", "cap", "mushroom")
    body.box(-sw / 2, -sh, -sw / 2, sw, sh, sw, "body" if not is_cap else "stem", tag="body",
             face=stem_face if is_cap or head_kind in ("cactus", "pod") else None, pattern=not is_cap)
    head = body
    if legs:
        if legs == 2:
            for s in (-1, 1):
                leg(root, f"leg{'l' if s < 0 else 'r'}", (s * (sw / 4), hip, 0), ll, 2, K, 0 if s < 0 else PI, amp=1.2,
                    mat="dark" if is_cap else "second")
        else:
            for i in range(legs):
                a = 2 * PI * i / legs
                lp = root.child(f"root{i}", (math.sin(a) * sw / 3, hip, math.cos(a) * sw / 3), rot=(math.cos(a) * 0.4, 0, -math.sin(a) * 0.4))
                lp.box(-0.5, 0, -0.5, 1, ll + 1, 1, "dark")
                lp.anim("leg", axis="x", amp=0.5, phase=a)
    arms = K.int("arms", 2 if not is_cap else 0, 0, 4)
    for i in range(arms):
        s = -1 if i % 2 == 0 else 1
        ap = body.child(f"arm{i}", (s * sw / 2, -sh + 2 + (i // 2) * 3, 0), rot=(0, 0, s * 0.9))
        ap.box(-0.5, 0, -0.5, 1, 4, 1, "dark")
        ap.box(-1.5, 3, -1.5, 3, 0, 4, "leaf", pattern=False)
        ap.anim("arm", axis="x", amp=0.6, phase=PI if s < 0 else 0)
    if is_cap:
        cw = ev(K.num("cap_w", sw + 8, 4, 40))
        ch = K.int("cap_h", 4, 2, 16)
        cap = body.child("cap", (0, -sh, 0))
        cap.box(-cw / 2, -ch, -cw / 2, cw, ch, cw, "cap", pattern=False)
        cap.box(-(cw - 4) / 2, -ch - 2, -(cw - 4) / 2, cw - 4, 2, cw - 4, "cap", pattern=False)
        cap.box(-(cw - 2) / 2, 0, -(cw - 2) / 2, cw - 2, 1, cw - 2, "gills", pattern=False)
        cap.anim("sway", axis="x", amp=0.06, speed=0.1)
        cap.anim("sway", axis="z", amp=0.06, speed=0.08, phase=1.5)
    elif head_kind == "flower":
        hp = body.child("flower", (0, -sh, 0))
        petals = K.int("petals", 6, 3, 12)
        fc = 6
        hp.box(-fc / 2, -fc - 1, -2, fc, fc, 3, "accent", face=face_spec(K, 2, 1, "cute", "smile"), pattern=False, tag="head")
        for i in range(petals):
            a = 2 * PI * i / petals
            pp = hp.child(f"petal{i}", (math.sin(a) * (fc / 2), -fc / 2 - 1 - math.cos(a) * (fc / 2), 0.5), rot=(0, 0, a), nohit=True)
            pp.box(-2, -5, 0, 4, 5, 1, "second", pattern=False)
        hp.anim("sway", axis="z", amp=0.1, speed=0.1)
        hp.anim("look", amp=0.4)
        head = hp
    elif head_kind == "bulb":
        hp = body.child("bulb", (0, -sh, 0))
        bw = sw + 4
        hp.box(-bw / 2, -bw, -bw / 2, bw, bw, bw, "second", face=face_spec(K, 2, 2, "cute", "maw"), tag="head")
        hp.box(-1, -bw - 2, -1, 2, 2, 2, "glow", pattern=False)
        hp.anim("look", amp=0.6)
        head = hp
    elif head_kind == "leafy":
        hp = body.child("leaves", (0, -sh, 0))
        hp.box(-sw / 2 - 3, -6, -sw / 2 - 3, sw + 6, 6, sw + 6, "leaf", pattern=False)
        hp.box(-sw / 2 - 1, -8, -sw / 2 - 1, sw + 2, 2, sw + 2, "leaf", pattern=False)
        hp.anim("sway", axis="z", amp=0.07, speed=0.1)
    elif head_kind == "cactus":
        for s in (-1, 1):
            ap = body.child(f"cactus_arm{'l' if s < 0 else 'r'}", (s * sw / 2, -sh / 2, 0))
            ap.box(0 if s > 0 else -3, -1, -1.5, 3, 3, 3, "body")
            ap.box((1 if s > 0 else -3), -5, -1.5, 2 if s > 0 else 2, 4, 3, "body")
        for i in range(6):
            body.box(-sw / 2 - 0.5 + (i % 2) * (sw + 0.0), -sh + 1 + i * (sh - 2) / 6, -0.5, 1, 1, 1, "horn_tip", pattern=False, nohit=True)
        body.box(-1.5, -sh - 2, -1.5, 3, 2, 3, "accent", pattern=False)
    return root, {"head": head}


def build_snail(c, K):
    root = Part("root")
    fl = K.int("foot_len", 14, 6, 40)
    fw = ev(K.num("foot_w", 6, 2, 20))
    fh = K.int("foot_h", 3, 1, 10)
    ss = ev(K.num("shell_size", 10, 4, 40))
    kind = K.str("shell_kind", "spiral")
    body = root.child("body", (0, 24 - fh, 0))
    body.box(-fw / 2, 0, -fl / 2, fw, fh, fl, "body", tag="body")
    body.box(-fw / 2 - 0.5, fh - 1, -fl / 2 - 0.5, fw + 1, 1, fl + 1, "belly", pattern=False)
    body.anim("squish", axis="z", amp=0.06, speed=0.15)
    neck = body.child("neck", (0, 0, -fl / 2 + 3))
    nh = K.int("neck_h", 5, 2, 16)
    neck.box(-fw / 2 + 0.5, -nh, -3, fw - 1, nh + 1, 4, "body",
             face=face_spec(K, 0, 1, "cute", "smile"))
    neck.anim("look", amp=0.4)
    for s in (-1, 1):
        st = neck.child(f"stalk{'l' if s < 0 else 'r'}", (s * (fw / 2 - 1.5), -nh, -2), rot=(-0.3, 0, s * 0.3), nohit=True)
        st.box(-0.5, -5, -0.5, 1, 5, 1, "body")
        st.box(-1, -7, -1, 2, 2, 2, "eye", pattern=False)
        st.anim("sway", axis="z", amp=0.12, speed=0.12, phase=0 if s < 0 else 2.1)
        tt = neck.child(f"feeler{'l' if s < 0 else 'r'}", (s * (fw / 2 - 1), 0, -3), rot=(-1.0, 0, s * 0.4), nohit=True)
        tt.box(-0.5, -2, -0.5, 1, 2, 1, "body")
    shell = body.child("shell", (0, 0, 1))
    shell.anim("sway", axis="x", amp=0.03, speed=0.1)
    if kind == "cone":
        for i in range(4):
            w = ss - i * (ss // 4)
            shell.cbox(0, -2 - i * (ss // 4) - ss / 8, 0, max(2, w), ss // 4 + 1, max(2, w), "shell", pattern=False)
    elif kind == "dome":
        shell.box(-ss / 2, -ss * 0.6, -ss / 2, ss, int(ss * 0.6), ss, "shell", pattern=False)
        shell.box(-ss / 2 + 2, -ss * 0.6 - 2, -ss / 2 + 2, ss - 4, 2, ss - 4, "shell", pattern=False)
    else:  # spiral: big disc + smaller offset discs
        shell.box(-ss / 2 + 1, -ss, -ss / 2, ss - 2, ss, ss, "shell", pattern=False, face={"spiral": True})
        shell.box(-ss / 2, -ss + 2, -ss / 2 + 2, ss, ss - 4, ss - 4, "shell", pattern=False, face={"spiral": True})
        shell.box(-ss / 2 + 2, -ss - 1, -ss / 2 + 2, ss - 4, 1, ss - 4, "shell", pattern=False)
    if K.flag("crystals"):
        for i in range(3):
            shell.box(-1 + (i - 1) * 3, -ss - 3 - (i % 2) * 2, -1 + i, 2, 3 + (i % 2) * 2, 2, "glow", pattern=False, nohit=True)
    return root, {"head": neck}


BUILDERS = {
    "quadruped": build_quadruped, "biped": build_biped, "flyer": build_flyer, "floater": build_floater,
    "blob": build_blob, "crawler": build_crawler, "serpent": build_serpent, "swimmer": build_swimmer,
    "golem": build_golem, "eye": build_eye, "hopper": build_hopper, "tripod": build_tripod,
    "plantoid": build_plantoid, "snail": build_snail,
}
