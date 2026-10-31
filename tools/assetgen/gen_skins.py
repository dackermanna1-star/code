"""Character skins (64x64 classic-arm player layout) + emissive overlays + blindfold armor.

Each body part is authored as ASCII art: a top face, a bottom face and a horizontal
"wrap strip" (right | front | left | back side faces, exactly as they sit next to
each other in the skin net).  Characters map to (ramp, index) entries; whole faces
get a lighting offset (faces on the character's left side / back are one ramp
step darker => consistent top-left key light).  Left limbs are mirrored from the
right ones *before* lighting so both sides stay consistent.

Run:  python3 gen_skins.py           (writes textures + previews in scratch)
"""
from __future__ import annotations

import numpy as np

import skinpreview
import texlib as T

# ------------------------------------------------------------------ skin layout
# name: (u, v, w, h, d)
PARTS = {
    "head": (0, 0, 8, 8, 8), "hat": (32, 0, 8, 8, 8),
    "body": (16, 16, 8, 12, 4), "jacket": (16, 32, 8, 12, 4),
    "rarm": (40, 16, 4, 12, 4), "rsleeve": (40, 32, 4, 12, 4),
    "larm": (32, 48, 4, 12, 4), "lsleeve": (48, 48, 4, 12, 4),
    "rleg": (0, 16, 4, 12, 4), "rpants": (0, 32, 4, 12, 4),
    "lleg": (16, 48, 4, 12, 4), "lpants": (0, 48, 4, 12, 4),
}
LIGHT = {"top": 0, "bottom": 1, "right": 0, "front": 0, "left": 1, "back": 1}


def rects(u, v, w, h, d):
    return {"top": (u + d, v, w, d), "bottom": (u + d + w, v, w, d),
            "right": (u, v + d, d, h), "front": (u + d, v + d, w, h),
            "left": (u + d + w, v + d, d, h), "back": (u + 2 * d + w, v + d, w, h)}


def mirror_strip(strip, w):
    out = []
    for r in strip:
        m = r[::-1]
        out.append(m[w:] + m[:w])
    return out


def mirror_face(rows):
    return [r[::-1] for r in rows]


class Skin:
    def __init__(self, ramps: dict, legend: dict):
        self.ramps = {k: [T.rgb(c) for c in v] for k, v in ramps.items()}
        self.legend = legend
        self.ch = np.full((64, 64), ".", dtype="<U1")
        self.off = np.zeros((64, 64), int)

    def face(self, rect, rows, off=0):
        x, y, w, h = rect
        assert len(rows) == h, (rect, len(rows))
        for j, row in enumerate(rows):
            assert len(row) == w, (rect, j, row)
            for i, c in enumerate(row):
                self.ch[y + j, x + i] = c
                self.off[y + j, x + i] = off

    def part(self, name, top, bottom, strip, light=LIGHT):
        u, v, w, h, d = PARTS[name]
        R = rects(u, v, w, h, d)
        self.face(R["top"], top, light["top"])
        self.face(R["bottom"], bottom, light["bottom"])
        assert len(strip) == h, (name, len(strip))
        segs = [("right", 0, d), ("front", d, w), ("left", d + w, d), ("back", 2 * d + w, w)]
        for fname, x0, fw in segs:
            assert all(len(r) == 2 * d + 2 * w for r in strip), (name, [len(r) for r in strip])
            self.face(R[fname], [r[x0:x0 + fw] for r in strip], light[fname])

    def limb_pair(self, right, left, top, bottom, strip):
        """Author the right limb; the left limb is its mirror image."""
        self.part(right, top, bottom, strip)
        self.part(left, mirror_face(top), mirror_face(bottom), mirror_strip(strip, 4))

    def color_of(self, c, off):
        spec = self.legend[c]
        if spec is None:
            return None
        ramp, idx = spec
        r = self.ramps[ramp]
        return r[int(np.clip(idx + off, 0, len(r) - 1))]

    def render(self):
        img = T.new(64, 64)
        for y in range(64):
            for x in range(64):
                c = self.ch[y, x]
                if c == ".":
                    continue
                col = self.color_of(c, self.off[y, x])
                if col is not None:
                    img[y, x, :3] = col
                    img[y, x, 3] = 255
        return img

    def emissive(self, glow: dict, region=None):
        """glow: char -> (r, g, b, a) premultiplied-friendly colour."""
        img = T.new(64, 64)
        for y in range(64):
            for x in range(64):
                if region is not None and not region(x, y):
                    continue
                c = self.ch[y, x]
                if c in glow:
                    r, g, b, a = glow[c]
                    f = a / 255.0
                    img[y, x] = (round(r * f), round(g * f), round(b * f), a)
        return img


def head_region(x, y):
    return y < 16


# =========================================================================== GOJO
GOJO_RAMPS = {
    "hair": ["#ffffff", "#eef3fb", "#d8e1f0", "#b9c6dc", "#95a4c2", "#75839f"],
    "skin": ["#fff1e6", "#f9e1d1", "#eecdb9", "#dcb3a0", "#c4978a", "#a3766c"],
    "eyeh": ["#eafeff"], "eye": ["#6fe0ff", "#4fc4fa"], "eyed": ["#2b93ea", "#2078cf"],
    "lash": ["#ffffff", "#e9f0fb"],
    "uni": ["#555f88", "#3c4366", "#2b3050", "#21253e", "#181b2e", "#10121f"],
    "pant": ["#3d4366", "#2f3453", "#252943", "#1c1f35", "#141628"],
    "shoe": ["#45454f", "#2a2a31", "#1b1b20", "#101013"],
}
GOJO_LEGEND = {
    "0": ("hair", 0), "1": ("hair", 1), "2": ("hair", 2), "3": ("hair", 3), "4": ("hair", 4), "5": ("hair", 5),
    "a": ("skin", 0), "s": ("skin", 1), "d": ("skin", 2), "f": ("skin", 3), "g": ("skin", 4), "h": ("skin", 5),
    "i": ("eyeh", 0), "e": ("eye", 0), "y": ("eyed", 0), "l": ("lash", 0),
    "A": ("uni", 0), "B": ("uni", 1), "C": ("uni", 2), "D": ("uni", 3), "E": ("uni", 4), "F": ("uni", 5),
    "P": ("pant", 0), "Q": ("pant", 1), "R": ("pant", 2), "S": ("pant", 3), "U": ("pant", 4),
    "W": ("shoe", 0), "X": ("shoe", 1), "Y": ("shoe", 2), "Z": ("shoe", 3),
    ".": None,
}


def build_gojo():
    s = Skin(GOJO_RAMPS, GOJO_LEGEND)
    # ---------------- head (base)
    head_top = [
        "11011011",
        "10010010",
        "00100100",
        "01000010",
        "00010000",
        "01000100",
        "00100001",
        "00000100",
    ]
    head_right = [  # back -> front
        "10000000",
        "11001000",
        "21100101",
        "22111211",
        "3221fs22",
        "3322fsss",
        "3332dsss",
        "CCCCCBBB",
    ]
    head_front = [
        "00000001",
        "00100011",
        "10110112",
        "1ll21ll2",
        "2ies2ie3",
        "seyssey3",
        "sssfdsdd",
        "BBBCDBBC",
    ]
    head_back = [
        "00000000",
        "10010010",
        "11011011",
        "21121121",
        "22122122",
        "32232232",
        "33233233",
        "CCCCCCCC",
    ]
    head_strip = [r + f + l + b for r, f, l, b in
                  zip(head_right, head_front, mirror_face(head_right), head_back)]
    s.part("head", head_top, ["dddddddd"] * 8, head_strip)

    # ---------------- hat layer: spiky volume, fringe, high collar ring
    hat_top = [
        "01011010",
        "10000001",
        "00010000",
        "10000100",
        "00100001",
        "10000000",
        "00001001",
        "01000010",
    ]
    hat_right = [
        "0.00.000",
        "10010000",
        "21100101",
        "2211.1..",
        "32.1....",
        "3.2.....",
        "........",
        "CCCCCCBB",
    ]
    hat_front = [
        "00000001",
        "0.10.0.1",
        "1..1...2",
        "........",
        "........",
        "........",
        "........",
        "BBBCDBBC",
    ]
    hat_back = [
        "0.000.00",
        "10010010",
        "11011011",
        "21121121",
        "22122122",
        "3.2.3.23",
        "3..3...3",
        "CCCCCCCC",
    ]
    hat_strip = [r + f + l + b for r, f, l, b in
                 zip(hat_right, hat_front, mirror_face(hat_right), hat_back)]
    s.part("hat", hat_top, ["........"] * 8, hat_strip)

    # ---------------- body
    body_strip = [  # right(4) | front(8) | left(4) | back(8)
        "BBBB" "BABDBBBB" "BBBB" "BBBBBBBB",
        "BBBB" "BBBDBBBC" "BBBB" "BBBBBBBB",
        "BBBB" "BBCDBCCC" "BBBC" "CBBBBBBC",
        "CBBB" "BCCDBCCC" "BBCC" "CCBBBBCC",
        "CCBC" "CCCDBCCC" "BCCC" "CCCCCCCC",
        "CCCC" "CCCDBCCD" "CCCC" "CCCCCCCC",
        "CCCC" "CCCDBCCD" "CCCC" "CCCCCCCC",
        "CCCC" "CCCDBCDD" "CCCC" "CCCCCCCC",
        "CCCC" "CCCDBCCD" "CCCC" "DCCCCCCD",
        "CCCD" "CCCDBCCD" "CCCD" "DCCCCCCD",
        "DCCD" "CCCDBCDD" "DCCD" "DDCCCCDD",
        "DDDD" "DDDEBDDE" "DDDD" "DDDDDDDD",
    ]
    s.part("body", ["BBBBBBBB", "BBBBBBBB", "BBBBBBBB", "BBBBBBBB"], ["DDDDDDDD"] * 4, body_strip)
    jacket_strip = [
        "BBBB" "ABBDBBBB" "BBBB" "BBBBBBBB",  # collar ring
    ] + ["...." "........" "...." "........"] * 9 + [
        "DDDD" "D......D" "DDDD" "DDDDDDDD",  # jacket hem flare
        "DDDD" "DDDEBDDE" "DDDD" "DDDDDDDD",
    ]
    s.part("jacket", ["BBBBBBBB"] * 4, ["........"] * 4, jacket_strip)

    # ---------------- arms (right authored, left mirrored)
    arm_strip = [  # outer | front | inner | back
        "BBBB" "BBBB" "BBBB" "BBBB",
        "BBBB" "BBBB" "BBBC" "BBBB",
        "BBBC" "BBBC" "BCCC" "CBBB",
        "BBCC" "BBCC" "CCCC" "CCBB",
        "BCCC" "BCCC" "CCCC" "CCCB",
        "CCCC" "CCCC" "CCCC" "CCCC",
        "CCCC" "CCCC" "CCCC" "CCCC",
        "CCCD" "CCCD" "CCCD" "DCCC",
        "DDDD" "DDDD" "DDDD" "DDDD",
        "AAAA" "AAAA" "BBBB" "BBBB",
        "ssss" "asss" "dddd" "ssss",
        "dsdd" "sdds" "ffff" "dddd",
    ]
    s.limb_pair("rarm", "larm", ["BBBB"] * 4, ["dddd", "dfdd", "ddfd", "dddd"], arm_strip)
    sleeve_strip = ["...." * 4] * 8 + [
        "BBBB" "BBBB" "BBBB" "BBBB",
        "AAAA" "AAAA" "AAAA" "AAAA",
        "...." * 4, "...." * 4]
    s.limb_pair("rsleeve", "lsleeve", ["...."] * 4, ["...."] * 4, sleeve_strip)

    # ---------------- legs
    leg_strip = [
        "QQQQ" "PQQQ" "QQQQ" "QQQQ",
        "QQQQ" "PQQQ" "QQQR" "QQQQ",
        "QQQQ" "PQQR" "QQQR" "QQQQ",
        "QQQR" "QQQR" "QQRR" "RQQQ",
        "QQQR" "QQQR" "QQRR" "RQQQ",
        "QQRR" "QQQR" "QRRR" "RQQR",
        "QQRR" "QQQR" "QRRR" "RRQR",
        "QRRR" "QQRR" "RRRR" "RRRR",
        "RRRR" "QRRR" "RRRS" "RRRR",
        "RRSS" "RRRS" "SSSS" "SSSS",
        "XWXX" "WWWX" "XXXY" "XXXX",
        "YXYY" "XXXY" "YYYY" "YYYY",
    ]
    s.limb_pair("rleg", "lleg", ["QQQQ"] * 4, ["ZZZZ"] * 4, leg_strip)
    pants_strip = ["...." * 4] * 8 + [
        "Q..R" "QQQR" "R..R" "RRRR",
        "RRSS" "RRRS" "SSSS" "SSSS",
        "...." * 4, "...." * 4]
    s.limb_pair("rpants", "lpants", ["...."] * 4, ["...."] * 4, pants_strip)
    return s


GOJO_GLOW = {"i": (235, 255, 255, 255), "e": (110, 232, 255, 255), "y": (50, 160, 255, 255)}


# ========================================================================= SUKUNA
SUKUNA_RAMPS = {
    "hair": ["#ffd0cb", "#faafae", "#ec9198", "#d67382", "#b5586c", "#8f4057"],
    "under": ["#74505a", "#5b3d47", "#472f38", "#35222a", "#26181e"],
    "skin": ["#fbdcc4", "#f2c9ab", "#e3b494", "#cf9b7d", "#b07e66", "#8c604f"],
    "mark": ["#1d1418", "#2b1c22"], "markd": ["#3a242b", "#4a2e36"],
    "eyeR": ["#ff2a36", "#e01e2c"], "eyer": ["#a40f1e", "#850b18"],
    "kim": ["#fffaf0", "#f3ecdb", "#e5dac3", "#d2c4a8", "#b6a68a", "#93856c"],
    "lapel": ["#3a3440", "#2a2530", "#1d1a22"],
    "obi": ["#4b4552", "#332e39", "#221f27", "#151318"],
    "cord": ["#8c1b2a", "#6a1220"],
    "hak": ["#605d6b", "#4c4957", "#3c3a46", "#2f2d38", "#23212a", "#1a1820"],
    "tabi": ["#403b46", "#2c2831", "#1d1a20", "#121014"],
}
SUKUNA_LEGEND = {
    "0": ("hair", 0), "1": ("hair", 1), "2": ("hair", 2), "3": ("hair", 3), "4": ("hair", 4), "5": ("hair", 5),
    "u": ("under", 0), "v": ("under", 1), "w": ("under", 2), "x": ("under", 3),
    "a": ("skin", 0), "s": ("skin", 1), "d": ("skin", 2), "f": ("skin", 3), "g": ("skin", 4), "h": ("skin", 5),
    "k": ("mark", 0), "K": ("markd", 0),
    "R": ("eyeR", 0), "r": ("eyer", 0),
    "A": ("kim", 0), "B": ("kim", 1), "C": ("kim", 2), "D": ("kim", 3), "E": ("kim", 4), "F": ("kim", 5),
    "L": ("lapel", 0), "M": ("lapel", 1),
    "O": ("obi", 0), "P": ("obi", 1), "Q": ("obi", 2), "c": ("cord", 0),
    "G": ("hak", 0), "H": ("hak", 1), "I": ("hak", 2), "J": ("hak", 3), "N": ("hak", 4),
    "V": ("tabi", 0), "W": ("tabi", 1), "Y": ("tabi", 2), "Z": ("tabi", 3),
    "m": ("skin", 4),
    ".": None,
}


def build_sukuna():
    s = Skin(SUKUNA_RAMPS, SUKUNA_LEGEND)
    head_top = [
        "21122112",
        "10100101",
        "01011010",
        "10100101",
        "01011010",
        "10100101",
        "01011010",
        "10100101",
    ]
    head_right = [
        "10010011",
        "21121121",
        "32232uuu",
        "u3uuu3ss",
        "uuuvfsss",
        "vuuvfdss",
        "vvuvdskk",
        "wvvwdsss",
    ]
    head_front = [
        "10010011",
        "u211112u",
        "usskkssu",
        "sggssggs",
        "srRssRrs",
        "skksskkd",
        "kssgfssk",
        "dssssssd",
    ]
    head_back = [
        "10010010",
        "11211211",
        "21221221",
        "32332332",
        "u3uu3uu3",
        "uuuuuuuu",
        "vuuvvuuv",
        "vvvvvvvv",
    ]
    head_strip = [r + f + l + b for r, f, l, b in
                  zip(head_right, head_front, mirror_face(head_right), head_back)]
    s.part("head", head_top, ["dddddddd"] * 8, head_strip)

    hat_top = [
        ".1.01.1.",
        "10100101",
        ".101101.",
        "10100101",
        ".101101.",
        "10100101",
        ".0.10.0.",
        "........",
    ]
    hat_right = [
        "1.01.0.1",
        "2..2.1..",
        "3.......",
        "........",
        "........",
        "........",
        "........",
        "........",
    ]
    hat_front = [
        "1.0.10.1",
        "........",
        "........",
        "........",
        "........",
        "........",
        "........",
        "........",
    ]
    hat_back = [
        "10.10.01",
        "2.12.1.2",
        "3..3..3.",
        "........",
        "........",
        "........",
        "........",
        "........",
    ]
    hat_strip = [r + f + l + b for r, f, l, b in
                 zip(hat_right, hat_front, mirror_face(hat_right), hat_back)]
    s.part("hat", hat_top, ["........"] * 8, hat_strip)

    body_strip = [  # right(4) | front(8) | left(4) | back(8)
        "BBBB" "BLasssLC" "BBBB" "BBBBBBBB",
        "BBBB" "BLKssKLC" "BBBC" "BBBBBBBB",
        "BBBC" "BBLssLCC" "BBCC" "CBBBBBBC",
        "BBCC" "BBLkkLCD" "BCCC" "CCBBBBCC",
        "BCCC" "BCCLLCCD" "CCCC" "CCCCCCCC",
        "CCCC" "BCDCCCCD" "CCCD" "CCCCCCCD",
        "CCCD" "CDCCCCDD" "CCDD" "DCCCCCDD",
        "OOOP" "OOOOOOOP" "OOPP" "POOOOOOP",
        "PPPQ" "OPPccPOP" "PPQQ" "QPPPPPPQ",
        "HHIH" "GIGIGIGI" "HHIH" "HIHIHIHI",
        "HHIH" "HIHIHIHI" "HHII" "HIHIHIHI",
        "IIJI" "IJIJIJIJ" "IIJJ" "JIJIJIJJ",
    ]
    s.part("body", ["BBBssBBB", "BBBBBBBB", "BBBBBBBB", "BBBBBBBB"], ["IIIIIIII"] * 4, body_strip)
    jacket_strip = [
        "LLLL" "BL....LC" "LLLL" "LLLLLLLL",  # collar (eri) band
    ] + ["...." "........" "...." "........"] * 6 + [
        "OOOP" "OOOOOOOP" "OOPP" "POOQQOOP",  # obi sash overhang
        "PPPQ" "OPPccPOP" "PPQQ" "QPOPPOPQ",
        "...." "........" "...." "..OPPO..",  # obi knot at the back
        "...." "........" "...." "........",
        "...." "........" "...." "........",
    ]
    s.part("jacket", ["LLLLLLLL", "L......L", "L......L", "LLLLLLLL"], ["........"] * 4, jacket_strip)

    arm_strip = [  # outer | front | inner | back
        "BBBB" "BBBB" "BBBB" "BBBB",
        "BBBB" "BBBC" "BBCC" "BBBB",
        "BBBC" "BBCC" "BCCC" "CBBC",
        "BCCC" "BCCC" "CCCD" "CCCC",
        "CCCD" "CCCD" "CCDD" "DCCD",
        "DDDD" "DDDD" "DDDD" "DDDD",
        "ssss" "asss" "dddd" "dsss",
        "kkkk" "kkkk" "kkkk" "kkkk",
        "ssss" "sssd" "dddd" "dsss",
        "kkkk" "kkkk" "kkkk" "kkkk",
        "ssss" "asss" "dddd" "dsss",
        "dsdd" "sdds" "ffff" "dddd",
    ]
    s.limb_pair("rarm", "larm", ["BBBB"] * 4, ["dddd", "dfdd", "ddfd", "dddd"], arm_strip)
    sleeve_strip = ["...." * 4] * 2 + [
        "BBBB" "BBBC" "BBCC" "CBBB",
        "BBBC" "BBCC" "BCCC" "CBBC",
        "BCCC" "BCCC" "CCCD" "CCCC",
        "CCDD" "CCCD" "CDDD" "DCCD",
        "DDEE" "DDDE" "EEEE" "EDDE",
    ] + ["...." * 4] * 5
    s.limb_pair("rsleeve", "lsleeve", ["...."] * 4, ["...."] * 4, sleeve_strip)

    leg_strip = [
        "HHIH" "GIGI" "HHIH" "HIHI",
        "HHIH" "GIGI" "HHIH" "HIHI",
        "HHIH" "HIHI" "HHIH" "HIHI",
        "HHIH" "HIHI" "HHII" "HIHI",
        "HHII" "HIHJ" "HIIJ" "IIHI",
        "HHII" "HIHJ" "HIIJ" "IIHI",
        "HIIJ" "HIHJ" "IIIJ" "IJHI",
        "IIIJ" "HIIJ" "IIJJ" "IJII",
        "IIJJ" "IJIJ" "IJJJ" "JJIJ",
        "IJJJ" "IJIJ" "JJJN" "JJJJ",
        "JJJN" "JJJN" "JNNN" "NJJN",
        "WVWW" "VVWW" "WWWY" "WWWW",
    ]
    s.limb_pair("rleg", "lleg", ["HHHH"] * 4, ["ZZZZ"] * 4, leg_strip)
    pants_strip = ["...." * 4] * 5 + [
        "HHII" "HIHJ" "HIIJ" "IIHI",
        "HIIJ" "HIHJ" "IIIJ" "IJHI",
        "IIIJ" "HIIJ" "IIJJ" "IJII",
        "IIJJ" "IJIJ" "IJJJ" "JJIJ",
        "IJJJ" "IJIJ" "JJJN" "JJJJ",
        "JJJN" "JJJN" "JNNN" "NJJN",
        "...." * 4,
    ]
    s.limb_pair("rpants", "lpants", ["...."] * 4, ["...."] * 4, pants_strip)
    return s


SUKUNA_GLOW = {"R": (255, 40, 52, 255), "r": (210, 18, 34, 255),
               "k": (150, 12, 24, 96), "K": (150, 12, 24, 80)}


# =================================================================== HEIAN SUKUNA
HEIAN_RAMPS = {
    "hair": ["#f2899e", "#dd5b7c", "#c03e66", "#9c2a50", "#771c3d", "#53122b"],
    "under": ["#5a2a38", "#47202d", "#371823", "#28111a", "#1c0b12"],
    "skin": ["#efd2bd", "#e2bfa6", "#cfa78d", "#b88d75", "#97705d", "#73523f"],
    "mark": ["#120a0e", "#1e1116"], "markd": ["#2a161c", "#3a1f27"],
    "eyeR": ["#ff2433", "#e0162a"], "eyer": ["#a00c1d", "#7c0816"], "eye2": ["#ff4a4a", "#d22a32"],
    "kim": ["#ffffff", "#f1f1f4", "#dfdfe6", "#c6c6d2", "#a6a6b8", "#82829a"],
    "lapel": ["#2a2530", "#1c1820", "#110e14"],
    "obi": ["#3a343f", "#25212a", "#17141a", "#0d0b0f"],
    "cord": ["#9a1426", "#6e0d1b"],
    "hak": ["#3b3540", "#2e2933", "#241f29", "#1b171f", "#141117", "#0d0b0f"],
    "tooth": ["#f6efdc", "#d6cbb0", "#ab9f86"],
    "maw": ["#ff3a3a", "#d0162a", "#8e0a1a", "#55050f"],
    "wrap": ["#2e2a31", "#1f1c22", "#141216", "#0b0a0c"],
}
HEIAN_LEGEND = dict(SUKUNA_LEGEND)
HEIAN_LEGEND.update({
    "q": ("eye2", 0),
    "t": ("tooth", 0), "T": ("tooth", 1),
    "n": ("maw", 1), "b": ("maw", 2), "z": ("maw", 3), "o": ("maw", 0),
    "V": ("wrap", 0), "W": ("wrap", 1), "Y": ("wrap", 2), "Z": ("wrap", 3),
})


def build_heian():
    s = Skin(HEIAN_RAMPS, HEIAN_LEGEND)
    head_top = [
        "21122112",
        "21011012",
        "10100101",
        "01011010",
        "10100101",
        "01011010",
        "10100101",
        "01011010",
    ]
    head_right = [
        "10100100",
        "21211011",
        "32221122",
        "433221ss",
        "4332fsss",
        "4433fsss",
        "5443dskk",
        "5544dsss",
    ]
    head_front = [
        "10010012",
        "2sassss2",
        "2sskksd2",
        "srRssRrs",
        "sKKssKKs",
        "sqksskqs",
        "kssgfssk",
        "dssssssd",
    ]
    head_back = [
        "10010010",
        "21121121",
        "21121121",
        "32232232",
        "32232232",
        "43343343",
        "44344344",
        "55455455",
    ]
    head_strip = [r + f + l + b for r, f, l, b in
                  zip(head_right, head_front, mirror_face(head_right), head_back)]
    s.part("head", head_top, ["dddddddd"] * 8, head_strip)

    hat_top = [
        "1.1..1.1",
        ".101101.",
        "10100101",
        ".101101.",
        "10100101",
        ".010010.",
        "1.1..1.1",
        "........",
    ]
    hat_right = [
        "1010.10.",
        "21.1.0..",
        "3.2.....",
        "........",
        "........",
        "........",
        "........",
        "........",
    ]
    hat_front = [
        "1.0..0.1",
        "........",
        "........",
        "........",
        "........",
        "........",
        "........",
        "........",
    ]
    hat_back = [
        "10110101",
        "2.121.12",
        "3..2..23",
        "4.....3.",
        "........",
        "........",
        "........",
        "........",
    ]
    hat_strip = [r + f + l + b for r, f, l, b in
                 zip(hat_right, hat_front, mirror_face(hat_right), hat_back)]
    s.part("hat", hat_top, ["........"] * 8, hat_strip)

    body_strip = [  # right(4) | front(8) | left(4) | back(8)
        "BBBB" "LassssdL" "BBBB" "BBBBBBBB",
        "BBBB" "LkkssKKL" "BBBC" "BBBBBBBB",
        "BBBC" "LszzzzsL" "BBCC" "CBBBBBBC",
        "BBCC" "LztTtTzL" "BCCC" "CCBBBBCC",
        "BCCC" "LbonnobL" "CCCC" "CCCCCCCC",
        "CCCC" "LzTtTtzL" "CCCD" "CCCCCCCD",
        "CCCD" "LdzzzzdL" "CCDD" "DCCCCCDD",
        "OOOP" "OOOOOOOP" "OOPP" "POOOOOOP",
        "PPPQ" "OPPccPOP" "PPQQ" "QPPPPPPQ",
        "BBBC" "ABBCBBBC" "BBCC" "CBBCCBBC",
        "BBCC" "BBCCBBCD" "BCCD" "CBCCBCCD",
        "CCCD" "CCDCCDCD" "CDDD" "DCCDCCDD",
    ]
    s.part("body", ["BBBBBBBB", "BBBBBBBB", "BBBBBBBB", "BBBBBBBB"], ["CCCCCCCC"] * 4, body_strip)
    jacket_strip = [
        "LLLL" "L......L" "LLLL" "LLLLLLLL",
    ] + ["...." "........" "...." "........"] * 6 + [
        "OOOP" "OOOOOOOP" "OOPP" "POOQQOOP",
        "PPPQ" "OPPccPOP" "PPQQ" "QPOPPOPQ",
        "BBBC" "A......C" "BBCC" "CBOPPOBC",
        "BBCC" "B......D" "BCCD" "CBCCBCCD",
        "CCCD" "CCDCCDCD" "CDDD" "DCCDCCDD",
    ]
    s.part("jacket", ["LLLLLLLL", "L......L", "L......L", "LLLLLLLL"], ["........"] * 4, jacket_strip)

    arm_strip = [  # outer | front | inner | back  (bare, tattooed forearms)
        "BBBB" "BBBB" "BBBB" "BBBB",
        "BBBC" "BBBC" "BCCC" "BCCC",
        "CCCD" "CCCD" "CDDD" "CCCD",
        "ssss" "asss" "dddd" "dsss",
        "kkkk" "kkkk" "kkkk" "kkkk",
        "skss" "aksd" "dkdd" "dsks",
        "skss" "sksd" "dkdd" "dsks",
        "kkkk" "kkkk" "kkkk" "kkkk",
        "ssss" "sssd" "dddd" "dsss",
        "kkkk" "kkkk" "kkkk" "kkkk",
        "ssss" "asss" "dddd" "dsss",
        "dsdd" "sdds" "ffff" "dddd",
    ]
    s.limb_pair("rarm", "larm", ["BBBB"] * 4, ["dddd", "dfdd", "ddfd", "dddd"], arm_strip)
    sleeve_strip = [
        "BBBB" "BBBB" "BBBB" "BBBB",
        "BBCC" "BBBC" "CCCC" "CCCC",
        "CDDD" "CCDD" "DDDD" "DDDD",
        "EEEE" "DEEE" "FFFF" "EEEE",
    ] + ["...." * 4] * 8
    s.limb_pair("rsleeve", "lsleeve", ["BBBB"] * 4, ["...."] * 4, sleeve_strip)

    leg_strip = [
        "HHIH" "GIGI" "HHIH" "HIHI",
        "HHIH" "GIGI" "HHIH" "HIHI",
        "HHIH" "HIHI" "HHIH" "HIHI",
        "HHII" "HIHI" "HHII" "HIHI",
        "HHII" "HIHJ" "HIIJ" "IIHI",
        "HIIJ" "HIHJ" "IIIJ" "IJHI",
        "IIIJ" "HIIJ" "IIJJ" "IJII",
        "IJJJ" "IJIJ" "JJJN" "JJJJ",
        "kkkk" "kkkk" "kkkk" "kkkk",
        "ssss" "asss" "dddd" "dsss",
        "kkkk" "kkkk" "kkkk" "kkkk",
        "WVWW" "VVWW" "WWWY" "WWWW",
    ]
    s.limb_pair("rleg", "lleg", ["HHHH"] * 4, ["ZZZZ"] * 4, leg_strip)
    pants_strip = ["...." * 4] * 3 + [
        "HHII" "HIHI" "HHII" "HIHI",
        "HHII" "HIHJ" "HIIJ" "IIHI",
        "HIIJ" "HIHJ" "IIIJ" "IJHI",
        "IIIJ" "HIIJ" "IIJJ" "IJII",
        "IJJJ" "IJIJ" "JJJN" "JJJJ",
    ] + ["...." * 4] * 4
    s.limb_pair("rpants", "lpants", ["...."] * 4, ["...."] * 4, pants_strip)
    return s


HEIAN_GLOW = {"R": (255, 36, 48, 255), "r": (210, 16, 30, 255), "q": (255, 70, 70, 255),
              "n": (230, 30, 40, 220), "b": (170, 14, 26, 200), "z": (110, 6, 14, 170),
              "o": (255, 90, 80, 255)}


# ======================================================================= BLINDFOLD
def build_blindfold():
    """64x32 humanoid armour texture: black band in the hat (overlay) region at eye level."""
    img = T.new(64, 32)
    band = [T.rgb(c) for c in ("#3b3a42", "#25242a", "#18171b", "#0e0d10")]
    # hat side strip: right (32..39), front (40..47), left (48..55), back (56..63), rows 8..15
    rows = {
        11: "1212111211121211" "1112121112111212",
        12: "2232222322232232" "2232223333223222",
        13: "3333332333333323" "3333333223333333",
    }
    for y, pattern in rows.items():
        for i, ch in enumerate(pattern):
            img[y, 32 + i, :3] = band[int(ch)]
            img[y, 32 + i, 3] = 255
    # fold highlights on the front (soft creases) and a knot at the back centre
    for x, y in [(42, 11), (45, 11), (43, 12)]:
        img[y, x, :3] = band[0]
    for x, y, c in [(59, 10, 1), (60, 10, 1), (59, 14, 2), (60, 14, 2), (58, 11, 0), (61, 11, 0),
                    (59, 11, 0), (60, 12, 1), (59, 15, 3), (60, 15, 3)]:
        img[y, x, :3] = band[c]
        img[y, x, 3] = 255
    return img


# ===================================================================== previews
def flat_preview(img):
    """Front/back/side flat layouts assembled from the net (base + overlay)."""
    def fc(part, face):
        u, v, w, h, d = PARTS[part]
        x, y, fw, fh = rects(u, v, w, h, d)[face]
        return img[y:y + fh, x:x + fw]

    def assemble(face, flip=False):
        canvas = T.new(16, 32)
        order = [("head", "hat", 4, 0), ("body", "jacket", 4, 8),
                 ("rarm", "rsleeve", 0, 8), ("larm", "lsleeve", 12, 8),
                 ("rleg", "rpants", 4, 20), ("lleg", "lpants", 8, 20)]
        if face == "back":
            order = [("head", "hat", 4, 0), ("body", "jacket", 4, 8),
                     ("larm", "lsleeve", 0, 8), ("rarm", "rsleeve", 12, 8),
                     ("lleg", "lpants", 4, 20), ("rleg", "rpants", 8, 20)]
        for base, over, x, y in order:
            for layer in (base, over):
                f = fc(layer, face)
                canvas[y:y + f.shape[0], x:x + f.shape[1]] = T.composite(
                    canvas[y:y + f.shape[0], x:x + f.shape[1]], f)
        return canvas

    def side(face):
        canvas = T.new(8, 32)
        if face == "right":
            order = [("head", "hat", 0, 0, 8), ("rarm", "rsleeve", 2, 8, 4), ("rleg", "rpants", 2, 20, 4)]
        else:
            order = [("head", "hat", 0, 0, 8), ("larm", "lsleeve", 2, 8, 4), ("lleg", "lpants", 2, 20, 4)]
        for base, over, x, y, _ in order:
            for layer in (base, over):
                f = fc(layer, face)
                canvas[y:y + f.shape[0], x:x + f.shape[1]] = T.composite(
                    canvas[y:y + f.shape[0], x:x + f.shape[1]], f)
        return canvas

    return [("front", assemble("front")), ("back", assemble("back")),
            ("right side", side("right")), ("left side", side("left"))]


def main():
    out = T.SCRATCH / "preview"
    out.mkdir(parents=True, exist_ok=True)
    gojo = build_gojo()
    suk = build_sukuna()
    heian = build_heian()
    results = {
        "entity/gojo.png": gojo.render(),
        "entity/gojo_eyes.png": gojo.emissive(GOJO_GLOW, head_region),
        "entity/sukuna.png": suk.render(),
        "entity/sukuna_markings.png": suk.emissive(SUKUNA_GLOW, head_region),
        "entity/sukuna_heian.png": heian.render(),
        "entity/sukuna_heian_markings.png": heian.emissive(
            HEIAN_GLOW, lambda x, y: y < 16 or (y >= 20 and y < 32 and 20 <= x < 28)),
        "entity/equipment/humanoid/gojo_blindfold.png": build_blindfold(),
    }
    # Sukuna markings: only facial marks glow (not wrist bands) => head region only.
    for rel, img in results.items():
        T.save(img, rel)
    # previews
    for key, extra in [("gojo", False), ("sukuna", False), ("sukuna_heian", True)]:
        base = results[f"entity/{key}.png"]
        skinpreview.turnaround(base, out / f"skin3d_{key}.png", extra_arms=extra)
        skinpreview.face_closeup(base, out / f"face_{key}.png")
        items = [("net", base)] + flat_preview(base)
        T.contact_sheet(items, out / f"skinflat_{key}.png", k=8, cols=5)
    em = [("gojo_eyes", results["entity/gojo_eyes.png"]),
          ("sukuna_markings", results["entity/sukuna_markings.png"]),
          ("heian_markings", results["entity/sukuna_heian_markings.png"]),
          ("blindfold", results["entity/equipment/humanoid/gojo_blindfold.png"])]
    T.contact_sheet(em, out / "skin_emissive.png", k=6, cols=4)
    # blindfold on gojo head preview: composite blindfold hat region over gojo hat region
    g = results["entity/gojo.png"].copy()
    bf = results["entity/equipment/humanoid/gojo_blindfold.png"]
    g[0:16, 32:64] = T.composite(g[0:16, 32:64], bf[0:16, 32:64])
    skinpreview.face_closeup(g, out / "face_gojo_blindfold.png")
    print("skins done")


if __name__ == "__main__":
    main()
