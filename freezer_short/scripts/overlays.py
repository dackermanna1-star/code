"""2D overlays on top of the composited frames: captions, HUD, infographics, transitions.

python3 overlays.py <comp_dir_root> <final_dir> <frame0> <frame1>
Frame f (1-based) <-> time t = (f-1)/30 s; narration word timings from audio/words.json.
"""
import os, sys, json, math, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
ROOT = os.path.dirname(os.path.abspath(__file__))
FONT = "/opt/assets/fonts/Montserrat[wght].ttf"
MONO = "/opt/assets/fonts/RobotoMono[wght].ttf"
SHOTS = json.load(open("/opt/work/renders/shots.json"))
ANCH = json.load(open("/opt/work/renders/anchors.json"))
WORDS = json.load(open(os.path.join(ROOT, "..", "audio", "words.json")))
WORDS[0]["s"] = max(WORDS[0]["s"], 0.62)
NARRATION = os.path.join(ROOT, "..", "docs", "narration.txt")
_fc = {}


def font(size, weight="Black", mono=False):
    k = (size, weight, mono)
    if k not in _fc:
        f = ImageFont.truetype(MONO if mono else FONT, size)
        try: f.set_variation_by_name(weight)
        except Exception: pass
        _fc[k] = f
    return _fc[k]


def T(f): return (f - 1) / FPS
def F(t): return int(round(t * FPS)) + 1
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease(x): x = clamp(x); return x * x * (3 - 2 * x)


def shot_of(f):
    for sid, s in SHOTS.items():
        if s["f0"] <= f <= s["f1"]:
            return sid, s
    return None, None


_cam = {}


def cam(sid, f):
    if sid not in _cam:
        p = f"/opt/work/renders/{sid}/{sid}_cam.json"
        _cam[sid] = {int(k): v for k, v in json.load(open(p)).items()} if os.path.exists(p) else {}
    return _cam[sid].get(f)


def quat_R(q):
    w, x, y, z = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def project(c, p):
    R = quat_R(c["q"]); d = R.T @ (np.array(p) - np.array(c["loc"]))
    if d[2] >= -1e-3: return None
    fpx = c["lens"] / 24.0 * H
    return (W / 2 + fpx * d[0] / -d[2], H / 2 - fpx * d[1] / -d[2])


# ------------------------------------------------------------------ captions
# Caption height (top of a one-line chunk) per shot, and the heights that keep each shot's subject clear.
# A chunk takes ONE height for its whole life (no jump at a cut): the preferred height of the shot it is mostly
# on screen in, if that is also clear in the other shot(s) it spans, else a height clear in all of them.
CAP_DEFAULT, CAP_OK_DEFAULT = 1290, [(1150, 1540)]
CAP_Y = {"SH03": 1470,    # below the 'FREEZER 2' label of the display plate (plate bottom ~y1420 at the end of the push-in)
         "SH04": 1045,    # between the evaporator icicles (~y1000) and the back of his head (~y1150)
         "SH06b": 1500,   # below the hands rubbing at chest height (they drop to ~y1400 from ~f555)
         "SH08b": 1440,   # below the hands (fingertips reach ~y1300), on the overall bib
         "SH10b": 420,    # above his hair (crown ~y720): mouth, breath and hands fill the lower 2/3
         "SH12b": 330,    # above the 'EMERGENCY' label: the push-in grows the iced button over y 600-1650
         "SH16c": 1560}   # on the chin/neck: the slurring lips sit at ~y1180-1340 in this close-up
CAP_OK = {"SH03": [(1440, 1540)], "SH04": [(1030, 1060)], "SH06b": [(1460, 1540)], "SH08b": [(1420, 1540)],
          "SH10a": [(380, 450), (1150, 1540)], "SH10b": [(360, 600)], "SH12a": [(1150, 1540)],
          "SH12b": [(280, 420)], "SH16c": [(1540, 1600)]}
FUNC_WORDS = {"the", "a", "an", "your", "my", "his", "her", "their", "of", "to", "in", "on", "at", "and", "but", "or", "is",
              "are", "from", "with", "into", "for", "that", "can", "may", "will", "you're", "they're", "you'll", "it's",
              "there's", "by", "as", "until", "when", "which", "this", "not", "no", "so", "then", "how", "you", "it", "be",
              "could", "would", "might", "have", "has", "below", "about", "around", "across", "if", "than"}
HARD_BREAK = (".", "?", "!", ":")
KEEP_TOGETHER = [("warm", "and", "dead"),      # the closing maxim's punchline stays one caption (no lone 'DEAD')
                 ("minus", "20"),                # never show '20 DEGREES CELSIUS' (+20 C) on its own
                 ("not", "because", "you're", "warm"),   # a lone 'YOU'RE WARM' would say the opposite of the line
                 ("emergency", "release"), ("muscle", "contractions")]   # key terms


def _base(w): return re.sub(r"[^\w']", "", w).lower()
def _cap_word(w): return w.upper().strip(",.:;")


def _cap_words(ws):
    """Display words of a chunk: a comma INSIDE the chunk stays ('SO, COULD YOU SURVIVE?'), end punctuation goes."""
    return [w.upper().rstrip(".:;") if i < len(ws) - 1 else _cap_word(w) for i, w in enumerate(ws)]


CAP_MAXW, CAP_SHRINK = 920, 1.13   # line width at 78 px; a chunk up to 13% wider is set slightly smaller on ONE line


def _wrap(words, fnt, maxw=CAP_MAXW):
    """One line if it fits, else two lines balanced by width (never a lone word left hanging when avoidable)."""
    full = " ".join(words)
    if fnt.getlength(full) <= maxw * CAP_SHRINK or len(words) < 2:
        return [list(enumerate(words))]
    width = lambda k: max(fnt.getlength(" ".join(words[:k])), fnt.getlength(" ".join(words[k:])))
    best = min(range(1, len(words)), key=width)
    at_comma = [k for k in range(1, len(words)) if words[k - 1].endswith(",") and width(k) <= maxw * CAP_SHRINK]
    if at_comma: best = at_comma[0]          # break the line at the comma when that still fits
    return [list(enumerate(words))[:best], list(enumerate(words))[best:]]


def _narration_punct():
    """Trailing punctuation of each narration token (the script keeps '...' and ':' that words.json drops)."""
    try:
        toks = []
        for ln in open(NARRATION, encoding="utf-8"):
            if ln.strip() and not ln.startswith("#"):
                toks += ln.rstrip("\n").split("|", 2)[2].split()
    except Exception:
        toks = []
    if len(toks) != len(WORDS):
        return [w["w"][-1] if w["w"][-1] in ".,?!:;" else "" for w in WORDS]
    out = []
    for tk in toks:
        m = re.search(r"[^\w']+$", tk)
        out.append(m.group(0) if m else "")
    return out


def display_words():
    """Word timings used for the karaoke display. words.json itself is not changed; two aligner glitches are hidden:
    - a zero-length word ('serious' at 102.56 s) is shown from just before its onset, so no caption gap while it is heard;
    - a low-confidence short word that swallowed the pause before it (e.g. 'and' 52.84-53.46 s, spoken from ~53.37 s)
      is highlighted only for its expected spoken length before its end, so the chunk does not pop up during the pause."""
    out = []
    for i, w in enumerate(WORDS):
        s, e = w["s"], w["e"]
        b = _base(w["w"]); exp = 0.10 + 0.065 * len(b)
        pe = WORDS[i - 1]["e"] if i else 0.0
        if e - s < 0.03 and s - pe > 0.15:
            s = max(pe + 0.04, s - 0.65 * exp)
        elif i and s - pe < 0.05 and w.get("p", 1.0) < 0.9 and not b.isdigit() and e - s - exp > 0.08:
            s = e - max(0.6 * exp, 0.14)
        out.append({"w": w["w"], "s": s, "e": e})
    return out


def _cut_times():
    return sorted((s["f0"], sid) for sid, s in SHOTS.items() if s["f0"] > 1)


def _cap_ok(sid, y):
    return any(lo <= y <= hi for lo, hi in CAP_OK.get(sid, CAP_OK_DEFAULT))


_keep = []


def _keep_groups(D):
    if not _keep:
        for kt in KEEP_TOGETHER:
            for j in range(len(D) - len(kt) + 1):
                if tuple(_base(D[j + q]["w"]) for q in range(len(kt))) == tuple(kt):
                    _keep.append(set(range(j, j + len(kt))))
        _keep.append(set())
    return _keep


def _chunk_cost(ids, D, P, last, cuts, fnt):
    n = len(ids)
    if n > 4: return 1e9
    words = _cap_words([D[i]["w"] for i in ids])
    wpx = fnt.getlength(" ".join(words))
    c = {1: 8.0, 2: 1.0, 3: 0.0, 4: 1.5}[n]
    if wpx > CAP_MAXW: c += 0.3                                      # set a little smaller
    if wpx > CAP_MAXW * CAP_SHRINK:                                  # wraps onto two lines
        c += {1: 0.0, 2: 0.5, 3: 1.5, 4: 1.0}[n]
        if max(fnt.getlength(" ".join(w for _, w in ln)) for ln in _wrap(words, fnt)) > 940: c += 4.0
    if wpx > 1800: return 1e9
    if not last and _base(D[ids[-1]]["w"]) in FUNC_WORDS: c += 3.0   # don't end a chunk on 'the', 'your', ...
    for a, b in zip(ids, ids[1:]):                                   # run through a comma (worse at a clause break)
        if "," in P[a]: c += 3.0 + (2.0 if _base(D[b]["w"]) in FUNC_WORDS | {"out"} else 0.0)
    for inside in _keep_groups(D):                                   # never split these
        if any(i in ids for i in inside) and not all(i in ids for i in inside): c += 20.0
    s, e = D[ids[0]]["s"], D[ids[-1]]["e"]
    if e - s > 2.0: c += 3.0 * (e - s - 2.0)
    c += 2.0 * sum(1 for a, b in zip(ids, ids[1:]) if D[b]["s"] - D[a]["e"] > 0.3)
    for f0, sid in cuts:                                              # prefer to change chunk at a cut
        tc = T(f0)
        if s + 0.05 < tc < e - 0.05:
            prev = shot_of(f0 - 1)[0]
            c += 1.0 + (2.0 if CAP_Y.get(prev, CAP_DEFAULT) != CAP_Y.get(sid, CAP_DEFAULT) else 0.0)
    return c


def build_chunks():
    D = display_words(); P = _narration_punct(); n = len(D)
    cuts = _cut_times(); fnt = font(78)
    segs, cur = [], []
    for i in range(n):
        cur.append(i)
        gap = D[i + 1]["s"] - D[i]["e"] if i + 1 < n else 9.0
        soft_dots = P[i].startswith("...") and gap < 0.3      # 'So... could you survive?' is spoken as one phrase
        if (any(h in P[i] for h in HARD_BREAK) and not soft_dots) or gap > 0.45:
            segs.append(cur); cur = []
    if cur: segs.append(cur)
    groups = []
    for seg in segs:                       # best split of each sentence/phrase into 1-4 word chunks
        m = len(seg); best = [0.0] + [1e18] * m; prv = [0] * (m + 1)
        for j in range(1, m + 1):
            for k in range(max(0, j - 4), j):
                cst = best[k] + _chunk_cost(seg[k:j], D, P, j == m, cuts, fnt)
                if cst < best[j]: best[j], prv[j] = cst, k
        parts, j = [], m
        while j > 0: parts.append(seg[prv[j]:j]); j = prv[j]
        groups += parts[::-1]
    out = []
    for i, g in enumerate(groups):
        s, e = D[g[0]]["s"], D[g[-1]]["e"]
        nxt = D[groups[i + 1][0]]["s"] if i + 1 < len(groups) else e + 0.6
        e = min(max(e + 0.15, s + 0.45), nxt - 0.02) if nxt - e < 0.5 else e + 0.15
        out.append({"s": s, "t0": s - 0.03, "e": e, "words": [D[k] for k in g]})
    for ch in out: _place_chunk(ch)
    for a, b in zip(out, out[1:]):         # a chunk start delayed to a cut: the previous one holds up to it
        if b.get("snapped") and a["e"] >= b["s"] - 0.1: a["e"] = max(a["e"], b["t0"] - 1e-4)
    for a, b in zip(out, out[1:]):         # no 2-3 frame blink between back-to-back chunks: hold the previous one
        if 0 < b["t0"] - a["e"] < 0.12: a["e"] = b["t0"] - 1e-4
    return out


def _place_chunk(ch):
    f0, f1 = int(math.ceil(ch["t0"] * FPS - 1e-6)) + 1, int(math.floor(ch["e"] * FPS + 1e-6)) + 1
    spans = []
    for f in range(f0, f1 + 1):
        sid = shot_of(min(f, LAST))[0]
        if spans and spans[-1][0] == sid: spans[-1][2] = f
        else: spans.append([sid, f, f])
    core = [sp for k, sp in enumerate(spans) if not (len(spans) > 1 and k in (0, len(spans) - 1) and sp[2] - sp[1] < 8)] or spans
    order = sorted(core, key=lambda sp: -(sp[2] - sp[1]))
    y = None
    for sp in order:
        cand = CAP_Y.get(sp[0], CAP_DEFAULT)
        if all(_cap_ok(o[0], cand) for o in core): y = cand; break
    if y is None:
        ys = [v for v in range(200, 1700, 10) if all(_cap_ok(o[0], v) for o in core)]
        ref = CAP_Y.get(order[0][0], CAP_DEFAULT)
        y = min(ys, key=lambda v: abs(v - ref)) if ys else ref
    ch["y"] = y
    if len(spans) > 1:                     # a sliver (<3 frames) on the far side of a cut, where y is not clear
        a, b = spans[0], spans[-1]
        if a not in core and not _cap_ok(a[0], y):
            ch["t0"] = T(spans[1][1]) - 1e-4; ch["snapped"] = True
        if b not in core and not _cap_ok(b[0], y) and ch["words"][-1]["e"] <= T(b[1]) + 0.1:
            ch["e"] = T(b[1]) - 1e-4


LAST = max(v["f1"] for v in SHOTS.values())
CHUNKS = build_chunks()
KEY = {"cold", "core", "37", "35", "32", "28", "20", "hypothermia", "shivering", "heat", "numb", "ice", "survive", "alarm", "quiet",
       "dead", "warm", "consciousness", "unstable", "cardboard", "armpits", "hours", "minutes", "release", "signal"}


def stroke_text(d, xy, txt, fnt, fill, stroke=8, sfill=(0, 0, 0)):
    d.text(xy, txt, font=fnt, fill=fill, stroke_width=stroke, stroke_fill=sfill)


def draw_captions(img, t, y0=None):
    ch = next((c for c in CHUNKS if c["t0"] <= t <= c["e"]), None)
    if not ch: return img
    if y0 is None: y0 = ch.get("y", CAP_DEFAULT)
    pop = ease((t - ch["s"]) / 0.12)
    words = _cap_words([w["w"] for w in ch["words"]])
    lines = _wrap(words, font(78))       # wrapped at the FINAL size, so the pop-in never re-flows the lines
    full = max(font(78).getlength(" ".join(w for _, w in ln)) for ln in lines)
    base = 78 * min(1.0, CAP_MAXW / full)   # a line slightly wider than CAP_MAXW is set a little smaller
    size = int(base * (0.88 + 0.12 * pop))
    fnt = font(size)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    y = y0 - (len(lines) - 1) * size * 0.6
    for ln in lines:
        txt = " ".join(w for _, w in ln)
        x = W / 2 - fnt.getlength(txt) / 2
        for i, w in ln:
            wd = ch["words"][i]
            active = wd["s"] - 0.02 <= t <= wd["e"] + 0.05
            kw = wd["w"].strip(",.:;?!").lower()
            col = (255, 214, 10) if active else ((120, 220, 255) if kw in KEY else (255, 255, 255))
            stroke_text(d, (x, y), w, fnt, col + (255,), stroke=9)
            x += fnt.getlength(w + " ")
        y += size * 1.2
    sh = lay.split()[3].filter(ImageFilter.GaussianBlur(10)).point(lambda v: v * 0.5)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0)); shadow.putalpha(sh)
    img = Image.alpha_composite(img, shadow.transform((W, H), Image.AFFINE, (1, 0, -4, 0, 1, -6)))
    return Image.alpha_composite(img, lay)


# ------------------------------------------------------------------ core temperature HUD
# Key points of the core temperature (s, degC), joined by a monotone cubic: the readout never rises and moves at a
# steady pace. The stage label is chosen from the DISPLAYED (one-decimal) value, so '35.0' never sits next to a
# hypothermia label. Crossings: 34.9 during 'thirty-five' (~59.5 s), 31.9 on 'thirty-two' (~78.0 s), 27.9 on
# 'twenty-eight' (~92.5 s). SH19 has no HUD; the core keeps falling there, so SH20 starts at 28.3 and eases below 28.
_CORE_PTS = [(19.4, 37.0), (55.5, 37.0), (58.6, 35.8), (59.6, 34.9), (62.2, 34.6), (69.3, 33.8), (78.4, 31.87),
             (81.95, 31.1), (86.9, 30.5), (91.73, 28.3), (92.7, 27.9), (97.0, 27.65), (99.2, 27.55)]
STAGES = [(28.0, "SEVERE HYPOTHERMIA", (255, 80, 60)), (32.0, "MODERATE HYPOTHERMIA", (255, 150, 50)),
          (35.0, "MILD HYPOTHERMIA", (255, 210, 90)), (36.5, "COOLING", (170, 220, 255)), (99.0, "NORMAL", (150, 255, 170))]


def _stage(shown):
    for thr, lab, col in STAGES:
        if shown < thr - 1e-6: return lab, col
    return STAGES[-1][1], STAGES[-1][2]


CORE_KEYS = [(F(t), v, _stage(round(v, 1))[0]) for t, v in _CORE_PTS]  # (frame, temp, label) - label for reference
HUD_ON = [(F(19.4) + 1, F(22.7)), (F(55.4) + 1, F(86.9)), (F(91.7) + 1, F(99.2))]  # 1st window = SH07 only (SH08a/b frame his head top-left)


def _pchip_slopes(xs, ys):
    n = len(xs); h = [xs[i + 1] - xs[i] for i in range(n - 1)]; dl = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if dl[i - 1] * dl[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i])
    return m


_CX = [F(t) for t, _ in _CORE_PTS]; _CY = [v for _, v in _CORE_PTS]; _CM = _pchip_slopes(_CX, _CY)


def core_temp(f):
    if f <= _CX[0]: return _CY[0]
    if f >= _CX[-1]: return _CY[-1]
    i = max(k for k in range(len(_CX) - 1) if _CX[k] <= f)
    h = _CX[i + 1] - _CX[i]; u = (f - _CX[i]) / h
    h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
    return h00 * _CY[i] + h10 * h * _CM[i] + h01 * _CY[i + 1] + h11 * h * _CM[i + 1]


def core_at(f):
    tc = core_temp(f)
    return tc, _stage(float(f"{tc:.1f}"))[0]


_stage_entry = {}


def stage_entry(lab):
    """First frame the HUD shows this stage label (for the one-off flash at each crossing)."""
    if not _stage_entry:
        prev = None
        for f in range(1, F(133.0) + 1):
            l = core_at(f)[1]
            if l != prev and l not in _stage_entry: _stage_entry[l] = f
            prev = l
    return _stage_entry.get(lab, -999)


def temp_col(tc):
    u = clamp((tc - 27.5) / (37.0 - 27.5))
    c0, c1, c2 = np.array([80, 140, 255]), np.array([255, 200, 60]), np.array([255, 110, 40])
    return tuple(int(v) for v in (c0 + (c1 - c0) * (u / 0.6) if u < 0.6 else c1 + (c2 - c1) * ((u - 0.6) / 0.4)))


HUD_X, HUD_Y, HUD_W, HUD_H = 80, 175, 318, 182   # compact, high in the top-left corner: clear of his head in every HUD shot


def draw_hud(img, f):
    on = next(((a, b) for a, b in HUD_ON if a <= f <= b), None)
    if not on: return img
    a = ease((f - on[0]) / 10) * ease((on[1] - f) / 8)
    tc, lab = core_at(f)
    lc = _stage(float(f"{tc:.1f}"))[1]
    k = f - stage_entry(lab)
    flash = 1.0 if (k > 45 or lab in ("NORMAL", "COOLING")) else 0.5 + 0.5 * (0.5 + 0.5 * math.cos(2 * math.pi * k / 10))
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    x0, y0 = HUD_X, HUD_Y
    d.rounded_rectangle((x0, y0, x0 + HUD_W, y0 + HUD_H), radius=22, fill=(8, 14, 24, int(150 * a)))
    if k <= 45 and lab not in ("NORMAL", "COOLING"):   # stage just crossed: the panel edge flashes in the stage colour
        d.rounded_rectangle((x0, y0, x0 + HUD_W, y0 + HUD_H), radius=22, outline=lc + (int(230 * a * flash),), width=3)
    tx, top, bot = x0 + 38, y0 + 12, y0 + 134
    wc = (230, 240, 255, int(255 * a))
    d.rounded_rectangle((tx - 11, top, tx + 11, bot), radius=11, outline=wc, width=3)
    d.ellipse((tx - 22, bot - 10, tx + 22, bot + 34), outline=wc, width=3)
    col = temp_col(tc); span = bot - top - 8
    lvl = bot - span * clamp((tc - 26.0) / (38.0 - 26.0))
    d.rounded_rectangle((tx - 5, lvl, tx + 5, bot + 6), radius=5, fill=col + (int(255 * a),))
    d.ellipse((tx - 15, bot - 3, tx + 15, bot + 27), fill=col + (int(255 * a),))
    for tk in (37, 35, 32, 28):
        yy = bot - span * clamp((tk - 26.0) / 12.0)
        d.line((tx + 5, yy, tx + 11, yy), fill=(230, 240, 255, int(200 * a)), width=2)   # notch on the tube wall
        d.text((tx + 19, yy - 11), f"{tk}°", font=font(19, "Bold"), fill=(200, 215, 235, int(220 * a)))
    cx0 = x0 + 104
    d.text((cx0, y0 + 12), "CORE", font=font(22, "ExtraBold"), fill=(200, 220, 255, int(255 * a)))
    d.text((cx0 - 1, y0 + 26), f"{tc:.1f}°C", font=font(54, "Black"), fill=col + (int(255 * a),), stroke_width=3, stroke_fill=(0, 0, 0, int(200 * a)))
    for i, ln in enumerate(lab.split(" ")):
        d.text((cx0, y0 + 98 + i * 28), ln, font=font(24, "Black"), fill=lc + (int(255 * a * flash),))
    return Image.alpha_composite(img, lay)


# ------------------------------------------------------------------ thermal UI
def draw_thermal_ui(img, f, sid):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    c = (235, 240, 255, 220); L = 70; m = 60
    for (x, y, sx, sy) in [(m, 150, 1, 1), (W - m, 150, -1, 1), (m, H - 300, 1, -1), (W - m, H - 300, -1, -1)]:
        d.line((x, y, x + sx * L, y), fill=c, width=5); d.line((x, y, x, y + sy * L), fill=c, width=5)
    cx, cy = W // 2, H // 2 - 80
    d.line((cx - 40, cy, cx - 12, cy), fill=c, width=3); d.line((cx + 12, cy, cx + 40, cy), fill=c, width=3)
    d.line((cx, cy - 40, cx, cy - 12), fill=c, width=3); d.line((cx, cy + 12, cx, cy + 40), fill=c, width=3)
    # REC dot + label sit in the top-RIGHT corner: the top-left corner holds the CORE HUD
    lf = font(30, "Bold", mono=True); lw = lf.getlength("THERMAL"); lx = W - m - 42 - lw
    if (f // 15) % 2 == 0: d.ellipse((lx - 34, 182, lx - 12, 204), fill=(255, 60, 50, 230))
    d.text((lx, 176), "THERMAL", font=lf, fill=c)
    # colour scale
    bx, by0, by1 = W - m - 34, 300, 900
    stops = [(0.0, (0, 0, 5)), (0.18, (13, 0, 64)), (0.34, (64, 0, 140)), (0.5, (191, 5, 115)), (0.64, (255, 46, 5)), (0.78, (255, 140, 0)), (0.9, (255, 230, 51)), (1.0, (255, 255, 230))]
    for y in range(by0, by1):
        u = 1 - (y - by0) / (by1 - by0)
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= u <= p1:
                k = (u - p0) / (p1 - p0); col = tuple(int(c0[i] + (c1[i] - c0[i]) * k) for i in range(3)); break
        d.line((bx, y, bx + 26, y), fill=col + (255,))
    d.rectangle((bx, by0, bx + 26, by1), outline=c, width=2)
    lf = font(24, "Bold", mono=True)       # labels centred on the bar (they used to stick out to its left)
    d.text((bx + 13 - lf.getlength("WARM") / 2, by0 - 36), "WARM", font=lf, fill=c)
    d.text((bx + 13 - lf.getlength("COLD") / 2, by1 + 10), "COLD", font=lf, fill=c)
    return Image.alpha_composite(img, lay)


# ------------------------------------------------------------------ infographics
def glow_layer(lay, r=8, k=1.6):
    a = np.asarray(lay, dtype=np.float32)
    al = a[..., 3:4] / 255.0
    pm = a[..., :3] * al
    pmb = np.asarray(Image.fromarray(np.clip(pm, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32)
    ab = np.asarray(Image.fromarray((al[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), dtype=np.float32)[..., None] / 255.0
    col = np.where(ab > 1e-3, pmb / np.maximum(ab, 1e-3), 0)
    out = np.dstack([np.clip(col, 0, 255), np.clip(ab * 255 * k, 0, 255)]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def _inside(p, mg=0): return p is not None and -mg <= p[0] <= W + mg and -mg <= p[1] <= H + mg


def _clip_chain(pts):
    """The chain up to the first point outside the frame, ending where it leaves the frame (no line coming back in)."""
    if not _inside(pts[0]): return []
    out = [pts[0]]
    for p in pts[1:]:
        q = out[-1]
        if p is not None and _inside(p): out.append(p); continue
        if p is None: break
        u = 1.0
        for a, b, lo, hi in ((q[0], p[0], 0, W), (q[1], p[1], 0, H)):
            if b < lo: u = min(u, (lo - a) / (b - a))
            elif b > hi: u = min(u, (hi - a) / (b - a))
        out.append((q[0] + (p[0] - q[0]) * u, q[1] + (p[1] - q[1]) * u)); break
    return out


def nerve_pulses(img, f, sid):
    c = cam(sid, f); an = ANCH.get(sid, {}).get(str(f))
    if not c or not an: return img
    t = T(f); t0 = 16.6
    a = ease((t - t0) / 0.4) * ease((19.35 - t) / 0.3)
    if a <= 0: return img
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for side in "lr":
        # skin -> arm -> shoulder -> neck (then the alarm ring at the head); not drawn across his face
        chain = [an[f"hand_{side}"], an[f"lowerarm_{side}"], an[f"upperarm_{side}"], an[f"clavicle_{side}"], an["neck_01"]]
        pts = _clip_chain([project(c, p) for p in chain])
        if len(pts) < 2: continue
        d.line(pts, fill=(20, 60, 120, int(150 * a)), width=9, joint="curve")    # dark under-stroke for contrast on white
        d.line(pts, fill=(110, 215, 255, int(200 * a)), width=5, joint="curve")
        seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]; tot = sum(seg)
        if tot < 1: continue
        for k in range(3):
            u = ((t - t0) * 0.8 + k / 3 + (0.15 if side == "r" else 0)) % 1.0
            s_ = u * tot; q = pts[-1]
            for i, L in enumerate(seg):
                if s_ <= L:
                    q = (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * s_ / max(L, 1e-3), pts[i][1] + (pts[i + 1][1] - pts[i][1]) * s_ / max(L, 1e-3)); break
                s_ -= L
            r = 14 * (1 - 0.35 * u)
            d.ellipse((q[0] - r - 4, q[1] - r - 4, q[0] + r + 4, q[1] + r + 4), fill=(20, 60, 120, int(160 * a * (1 - 0.5 * u))))
            d.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), fill=(225, 250, 255, int(255 * a * (1 - 0.4 * u))))
    hp = project(c, an["head"])            # head bone (in frame); head_tail projects above the top edge in SH06b
    ht = project(c, an["head_tail"])
    if hp and ht: hp = (hp[0] + 0.35 * (ht[0] - hp[0]), hp[1] + 0.35 * (ht[1] - hp[1]))   # up towards the brain
    if hp and t > 17.8:
        hp = (min(max(hp[0], 140), W - 140), min(max(hp[1], 110), H - 150))   # clamped into the frame
        ring = ((t - 17.9) * 1.6) % 1.0
        rr = 40 + ring * 120
        d.ellipse((hp[0] - rr - 2, hp[1] - rr - 2, hp[0] + rr + 2, hp[1] + rr + 2), outline=(20, 60, 120, int(150 * a * (1 - ring))), width=10)
        d.ellipse((hp[0] - rr, hp[1] - rr, hp[0] + rr, hp[1] + rr), outline=(120, 220, 255, int(230 * a * (1 - ring))), width=6)
    g = glow_layer(lay, 9)
    return Image.alpha_composite(Image.alpha_composite(img, g), lay)


def vessel_inset(img, f):
    t = T(f)
    a = ease((t - 23.6) / 0.35) * ease((25.75 - t) / 0.25)
    if a <= 0: return img
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    cx, cy, R = 830, 345, 122              # top-right, clear of the colour scale; his head sweeps in from the left
    k_ = R / 190.0
    d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=(10, 14, 24, int(215 * a)), outline=(230, 240, 255, int(255 * a)), width=5)
    sq = ease((t - 24.25) / 0.9)
    outer = (150 - 18 * sq) * k_; lumen = (115 - 62 * sq) * k_
    d.ellipse((cx - outer, cy - outer, cx + outer, cy + outer), fill=(190, 80, 90, int(255 * a)))
    d.ellipse((cx - lumen, cy - lumen, cx + lumen, cy + lumen), fill=(120, 0, 18, int(255 * a)))
    rng = np.random.default_rng(3)
    for k in range(int(26 - 16 * sq)):
        ang = rng.uniform(0, 6.28) + t * rng.uniform(0.3, 0.9); rr = rng.uniform(0, max(1.0, lumen - 12))
        x, y = cx + rr * math.cos(ang), cy + rr * math.sin(ang)
        d.ellipse((x - 8, y - 5, x + 8, y + 5), fill=(235, 40, 50, int(255 * a)))
    for k in range(10):
        ang = k / 10 * 6.28
        x0, y0 = cx + (outer + 24) * math.cos(ang), cy + (outer + 24) * math.sin(ang)
        x1, y1 = cx + (outer + 4) * math.cos(ang), cy + (outer + 4) * math.sin(ang)
        d.line((x0, y0, x1, y1), fill=(255, 255, 255, int(200 * a * sq)), width=5)
    txt = "VESSEL NARROWS" if sq > 0.3 else "BLOOD VESSEL"
    fnt = font(28, "Black")
    d.text((cx - fnt.getlength(txt) / 2, cy + R + 12), txt, font=fnt, fill=(255, 255, 255, int(255 * a)), stroke_width=5, stroke_fill=(0, 0, 0, int(255 * a)))
    return Image.alpha_composite(img, lay)


def heat_arrows(img, f, sid):
    c = cam(sid, f); an = ANCH.get(sid, {}).get(str(f))
    if not c or not an: return img
    t = T(f)
    a = ease((t - 34.4) / 0.4) * ease((36.9 - t) / 0.2)
    if a <= 0: return img
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    nk = project(c, an["neck_01"])
    # wisps leave the OUTLINE (top of the head, tops of the shoulders) and drift up/outwards - not across his chest/face
    for j, (b, oy) in enumerate([("head_tail", -20), ("upperarm_l", -45), ("upperarm_r", -45)]):
        p = project(c, an[b])
        if not p: continue
        sgn = 0 if (b == "head_tail" or not nk) else (1 if p[0] > nk[0] else -1)
        for k in range(3):
            u = ((t * 0.6 + k / 3 + j * 0.29) % 1.0)
            y0 = p[1] + oy - u * 340
            pts = [(p[0] + sgn * (20 + 70 * u) + 18 * math.sin(y0 / 40 + i * 0.8 + t * 3), y0 - i * 14) for i in range(9)]
            d.line(pts, fill=(255, 215, 140, int(170 * a * (1 - u) * min(1, u * 4))), width=6)
    return Image.alpha_composite(Image.alpha_composite(img, glow_layer(lay, 7)), lay)


def floor_label_xy(f, sid):
    """Beside the floor heat glow (left of it, past his frame-left shin), at seat height: not on top of the glow."""
    c = cam(sid, f); an = ANCH.get(sid, {}).get(str(f))
    p = project(c, an["pelvis"]) if c and an else None
    if not p: return (240, 1100)
    return (min(max(p[0] - 470, 230), W - 300), min(max(p[1] + 150, 700), 1170))


def label_chip(img, txt, xy, a, col=(255, 255, 255), size=38, pointer=None):
    if a <= 0: return img
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    fnt = font(size, "Black"); w = fnt.getlength(txt); hh = size * 0.79
    x, y = xy
    if pointer:                            # short leader line from the chip edge towards the thing it labels
        px, py = pointer
        d.line((x, y, px, py), fill=(8, 14, 24, int(170 * a)), width=7)
        d.line((x, y, px, py), fill=(230, 240, 255, int(220 * a)), width=3)
    d.rounded_rectangle((x - w / 2 - 24, y - hh, x + w / 2 + 24, y + hh), radius=int(hh), fill=(8, 14, 24, int(190 * a)))
    d.text((x - w / 2, y - size * 0.63), txt, font=fnt, fill=col + (int(255 * a),))
    return Image.alpha_composite(img, lay)


_contact = {}


def hand_contact(sid, t_touch=38.8):
    """(world point, first frame, last frame) of the hand-on-metal contact: the run of frames (>=5) in which the
    hand_r anchor holds still (IK contact) that starts closest to 'into anything you touch'. None if there is none."""
    if sid in _contact: return _contact[sid]
    A = ANCH.get(sid, {}); fr = sorted(int(k) for k in A); res = None
    try:
        runs = []
        for f in fr:
            if f - 1 in fr and np.linalg.norm(np.array(A[str(f)]["hand_r"]) - np.array(A[str(f - 1)]["hand_r"])) * FPS < 0.15:
                if runs and runs[-1][1] == f - 1: runs[-1][1] = f
                else: runs.append([f, f])
        runs = [r for r in runs if r[1] - r[0] >= 4]
        if runs:
            a, b = min(runs, key=lambda r: abs(T(r[0]) - t_touch))
            if True:
                pts = [(np.array(A[str(f)]["hand_r"]) + np.array(A[str(f)]["middle_01_r"])) / 2 for f in range(a, b + 1)]
                res = (np.mean(pts, axis=0), a, b)
    except (KeyError, ValueError):
        res = None
    _contact[sid] = res
    return res


def metal_chip(img, f, sid):
    """'HEAT -> METAL' beside (below-right of) the contact point, with a short leader; never on the hand."""
    txt, size = "HEAT  →  METAL", 38
    w = font(size, "Black").getlength(txt) + 48
    hc = hand_contact(sid); c = cam(sid, f)
    p = project(c, hc[0]) if (hc and c) else None
    if p is None:
        return label_chip(img, txt, (W - 110 - w / 2, 960), ease((T(f) - 38.9) / 0.3))
    a = ease((f - hc[1]) / 8)
    x = min(max(p[0] + 190, w / 2 + 40), W - 175 - w / 2)    # clear of the thermal colour scale and its WARM/COLD labels
    y = min(max(p[1] + 210, 300), 1150)
    dx, dy = p[0] - x, p[1] - y; L = math.hypot(dx, dy) or 1
    tip = (p[0] - dx / L * 125, p[1] - dy / L * 125) if L > 180 else None   # stops short of the hand
    return label_chip(img, txt, (x, y), a, size=size, pointer=tip)


def ecg(img, f):
    t = T(f); t0 = 91.75
    a = ease((t - t0) / 0.5) * ease((99.1 - t) / 0.4)
    if a <= 0: return img
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    y0 = 1620; x0, x1 = 60, W - 60
    d.rounded_rectangle((x0 - 20, y0 - 120, x1 + 20, y0 + 80), radius=24, fill=(4, 10, 8, int(160 * a)))

    def sig(tt):
        if tt < 95.5:  # slow but regular
            per = 1.55 + (tt - t0) * 0.12
            ph = ((tt - t0) % per) / per
            return 70 * math.exp(-((ph - 0.3) / 0.018) ** 2) - 18 * math.exp(-((ph - 0.36) / 0.03) ** 2) + 10 * math.exp(-((ph - 0.6) / 0.06) ** 2)
        if tt < 97.4:  # irregular beats
            rnd = np.random.default_rng(int(tt * 1.3))
            ph = (tt * 1.3) % 1.0
            return rnd.uniform(30, 75) * math.exp(-((ph - rnd.uniform(0.2, 0.7)) / 0.02) ** 2) + 8 * math.sin(tt * 23)
        return 22 * math.sin(tt * 37) + 14 * math.sin(tt * 53 + 1) + 9 * math.sin(tt * 71)  # chaotic

    span = 3.0; pts = []
    for i in range(320):
        u = i / 319; tt = t - span + u * span
        pts.append((x0 + u * (x1 - x0), y0 - (sig(tt) if tt > t0 else 0)))
    d.line(pts, fill=(90, 255, 140, int(255 * a)), width=5)
    d.ellipse((pts[-1][0] - 9, pts[-1][1] - 9, pts[-1][0] + 9, pts[-1][1] + 9), fill=(200, 255, 220, int(255 * a)))
    lab = "HEART RHYTHM" if t < 95.5 else "UNSTABLE RHYTHM"
    d.text((x0, y0 - 112), lab, font=font(30, "Black", mono=False), fill=((90, 255, 140) if t < 95.5 else (255, 90, 70)) + (int(255 * a),))
    return Image.alpha_composite(Image.alpha_composite(img, glow_layer(lay, 7)), lay)


def _factor_times():
    """Each chip lands on its spoken word (words.json), 0.05 s ahead of the word onset."""
    keys = [("temperature", 108.55), ("moving", 109.5), ("clothing", 110.25), ("staying", 110.75), ("body", 111.75), ("how", 113.25)]
    i0 = next((i for i, w in enumerate(WORDS) if _base(w["w"]) == "depends"), 0)
    out = []
    for k, fb in keys:
        j = next((i for i in range(i0, len(WORDS)) if _base(WORDS[i]["w"]) == k), None)
        out.append(WORDS[j]["s"] - 0.05 if j is not None else fb)
        if j is not None: i0 = j
    return out


FACTORS = [(ts, lab, ic) for ts, (lab, ic) in zip(_factor_times(), [("TEMPERATURE", "therm"), ("MOVING AIR", "wind"), ("CLOTHING", "shirt"),
                                                                      ("STAYING DRY", "drop"), ("BODY & HEALTH", "person"), ("HOW FAST YOU'RE FOUND", "door")])]


def icon(d, kind, cx, cy, s, a):
    c = (255, 255, 255, int(255 * a)); w = max(3, int(round(s / 7)))
    if kind == "therm":
        d.rounded_rectangle((cx - s * 0.21, cy - s, cx + s * 0.21, cy + s * 0.45), radius=int(s * 0.21), outline=c, width=w)
        d.ellipse((cx - s * 0.48, cy + s * 0.35, cx + s * 0.48, cy + s * 1.3), outline=c, width=w)
    elif kind == "wind":
        for k, L in enumerate([1.0, 0.75, 0.9]):
            y = cy - s * 0.5 + k * s * 0.5
            d.line((cx - s, y, cx - s + 2 * s * L, y), fill=c, width=w)
            d.arc((cx - s + 2 * s * L - s * 0.38, y - s * 0.76, cx - s + 2 * s * L + s * 0.38, y), 90, 360, fill=c, width=w)
    elif kind == "shirt":
        d.polygon([(cx - s, cy - s * 0.6), (cx - s * 0.4, cy - s), (cx + s * 0.4, cy - s), (cx + s, cy - s * 0.6), (cx + s * 0.7, cy - s * 0.2),
                   (cx + s * 0.5, cy - s * 0.35), (cx + s * 0.5, cy + s), (cx - s * 0.5, cy + s), (cx - s * 0.5, cy - s * 0.35), (cx - s * 0.7, cy - s * 0.2)], outline=c, width=w)
    elif kind == "drop":
        d.polygon([(cx, cy - s), (cx + s * 0.6, cy + s * 0.2), (cx, cy + s * 0.8), (cx - s * 0.6, cy + s * 0.2)], outline=c, width=w)
        d.ellipse((cx - s * 0.62, cy - s * 0.15, cx + s * 0.62, cy + s * 0.85), outline=c, width=w)
    elif kind == "person":
        d.ellipse((cx - s * 0.32, cy - s, cx + s * 0.32, cy - s * 0.36), outline=c, width=w)
        d.rounded_rectangle((cx - s * 0.6, cy - s * 0.25, cx + s * 0.6, cy + s), radius=int(s * 0.4), outline=c, width=w)
    elif kind == "door":                   # outline style like the other icons: frame + door swung open + handle
        d.rectangle((cx - s * 0.55, cy - s, cx + s * 0.55, cy + s), outline=c, width=w)
        d.polygon([(cx - s * 0.55, cy - s), (cx + s * 0.25, cy - s * 0.75), (cx + s * 0.25, cy + s * 1.15), (cx - s * 0.55, cy + s)], outline=c, width=w)
        d.ellipse((cx + s * 0.02, cy - s * 0.12, cx + s * 0.02 + s * 0.24, cy + s * 0.12), fill=c)


FACT_CW, FACT_CH, FACT_X, FACT_Y0, FACT_DY = 480, 112, (280, 800), 205, 124   # compact 2x3 grid in the upper band (y 149-509)


def factors(img, f):
    t = T(f)
    if not (107.7 <= t <= 114.95): return img
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    out = ease((114.9 - t) / 0.3)
    fnt_full = font(34, "Black")
    for i, (ts, lab, ic) in enumerate(FACTORS):
        a = ease((t - ts) / 0.22) * out
        if a <= 0: continue
        col, row = i % 2, i // 2
        cx = FACT_X[col]; cy = FACT_Y0 + row * FACT_DY
        pop = 0.8 + 0.2 * ease((t - ts) / 0.15)
        bw, bh = FACT_CW * pop, FACT_CH * pop
        d.rounded_rectangle((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), radius=int(30 * pop), fill=(10, 18, 30, int(200 * a)),
                            outline=(120, 220, 255, int(230 * a)), width=4)
        icon(d, ic, cx - bw / 2 + 60 * pop, cy - 4 * pop, 31 * pop, a)
        # line split decided once at full size, so the text never re-flows during the pop-in
        words = lab.split(" ")
        lines = [lab] if fnt_full.getlength(lab) <= FACT_CW - 132 else [" ".join(words[:2]), " ".join(words[2:])]
        fnt = font(max(8, int(round(34 * pop))), "Black")
        for k, ln in enumerate(lines):
            d.text((cx - bw / 2 + 114 * pop, cy + (-21 * len(lines) + k * 40 - 4) * pop), ln, font=fnt, fill=(255, 255, 255, int(255 * a)))
    return Image.alpha_composite(img, lay)


def title(img, f):
    t = T(f)
    a = ease((t - 0.25) / 0.25) * ease((3.7 - t) / 0.3)
    if a <= 0: return img
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    pop = 0.85 + 0.15 * ease((t - 0.25) / 0.2)
    for k, (txt, sz, col) in enumerate([("COULD YOU SURVIVE", 64, (255, 255, 255)), ("A -20°C FREEZER?", 92, (130, 215, 255))]):
        fnt = font(int(sz * pop)); w = fnt.getlength(txt)
        d.text((W / 2 - w / 2, 230 + k * 86), txt, font=fnt, fill=col + (int(255 * a),), stroke_width=9, stroke_fill=(0, 0, 0, int(255 * a)))
    return Image.alpha_composite(img, lay)


END_T0 = 130.40          # after the last word 'dead.' (ends 130.22 s) and its caption (clears ~130.37 s)
END_FADE_F = F(132.6)    # picture fades to black over the last frames; the card fades with it


def end_fade(f):
    return 1.0 - ease((f - END_FADE_F) / 11) if f >= END_FADE_F else 1.0


def end_card(img, f):
    t = T(f)
    a = ease((t - END_T0) / 0.5)
    if a <= 0: return img
    k = end_fade(f)
    # soften the release/sign behind the card, so the red 'EMERGENCY' print doesn't read as part of the card text
    img = Image.blend(img, img.filter(ImageFilter.GaussianBlur(14)), a)
    img = Image.alpha_composite(img, Image.new("RGBA", (W, H), (0, 4, 10, int(195 * a))))
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    A = a * k
    lines = [("KNOW WHERE THE", 74, (255, 255, 255)), ("EMERGENCY RELEASE", 82, (255, 214, 10)), ("IS.", 74, (255, 255, 255))]
    for j, (txt, sz, col) in enumerate(lines):
        fnt = font(sz); w = fnt.getlength(txt)
        d.text((W / 2 - w / 2, 640 + j * 100), txt, font=fnt, fill=col + (int(255 * A),), stroke_width=8, stroke_fill=(0, 0, 0, int(255 * A)))
    for j, sm in enumerate(["Most walk-in freezers have one inside the door.", "Check that it works."]):
        fnt = font(36, "SemiBold"); w = fnt.getlength(sm)
        d.text((W / 2 - w / 2, 980 + j * 52), sm, font=fnt, fill=(220, 230, 245, int(255 * A)), stroke_width=4, stroke_fill=(0, 0, 0, int(220 * A)))
    return Image.alpha_composite(img, lay)


# ------------------------------------------------------------------ image-space effects
def pov_confusion(arr, f):
    t = T(f); s0, s1 = F(86.9) + 1, F(91.7)
    u = (f - s0) / (s1 - s0)
    off = int(10 + 16 * (0.5 + 0.5 * math.sin(t * 2.1)))
    img = Image.fromarray(arr)
    b = img.filter(ImageFilter.GaussianBlur(2 + 3 * u))
    # ghost image shifted right by `off` px; mirror the left border instead of np.roll, which wrapped the right
    # edge round into a flat 10-25 px bar with a hard seam down the left side of the frame
    ba = np.asarray(b)
    sh = Image.fromarray(np.ascontiguousarray(np.pad(ba, ((0, 0), (off, 0), (0, 0)), mode="reflect")[:, :ba.shape[1]]))
    out = Image.blend(b, sh, 0.42)
    a = np.asarray(out).astype(np.float32)
    lum = a.mean(axis=2, keepdims=True); a = lum + (a - lum) * 0.75
    for c0, c1 in [(s0 + 40, s0 + 50), (s0 + 92, s0 + 108), (s0 + 128, s1)]:
        if c0 <= f <= c1:
            k = math.sin(math.pi * (f - c0) / (c1 - c0))  # every blink reopens by c1 (no black last frame before the cut)
            a *= (1 - 0.95 * clamp(k))
    return np.clip(a, 0, 255).astype(np.uint8)


SH14_IMPACT = 1611                 # his back hits the floor; the picture cuts to black right after
SH15_F0 = SHOTS.get("SH15", {}).get("f0", F(55.4) + 1)


def fades(arr, f):
    a = arr.astype(np.float32); k = 1.0
    s20e = F(99.2); s21 = F(99.2) + 1
    if F(97.6) <= f <= s20e: k = 1 - ease((f - F(97.6)) / (s20e - F(97.6))) * 0.96      # slip into darkness
    if s21 <= f <= s21 + 10: k = 0.04 + 0.96 * ease((f - s21) / 10)
    if SH14_IMPACT < f < SH15_F0: k = 1 - ease((f - SH14_IMPACT) / 11)                  # impact -> black (f1612-1622), black to SH15
    if F(55.4) - 3 <= f <= F(55.4) + 4: k = min(k, 0.15 + 0.85 * abs(f - F(55.4)) / 4)  # time-lapse dip (SH15 fade-in)
    for jc in (F(55.4) + 59, F(55.4) + 123):  # time-lapse jump flashes
        if jc - 1 <= f <= jc + 1: a = a * 0.7 + 255 * 0.3
    k *= end_fade(f)
    return np.clip(a * k, 0, 255).astype(np.uint8)


TOTAL_FRAMES = F(133.0)


def process(f, comp_root, final_dir):
    sid, s = shot_of(min(f, LAST))
    src = f"{comp_root}/{sid}/{min(f, LAST):05d}.jpg" if sid else None
    if not src or not os.path.exists(src):
        return False
    arr = np.asarray(Image.open(src).convert("RGB"))
    if sid == "SH19": arr = pov_confusion(arr, f)
    if f > LAST: sid = "END"
    arr = fades(arr, f)
    img = Image.fromarray(arr).convert("RGBA")
    t = T(f)
    if s["mode"] == "thermal": img = draw_thermal_ui(img, f, sid)
    if sid == "SH06b": img = nerve_pulses(img, f, sid)
    if sid == "SH08a": img = vessel_inset(img, f)
    if sid == "SH10a": img = heat_arrows(img, f, sid)
    if sid == "SH10c": img = metal_chip(img, f, sid)
    if sid == "SH10b": img = label_chip(img, "WARM, MOIST BREATH", (290, 1320), ease((t - 37.1) / 0.3))  # left of the mouth (~x620,y1390), in the vapour, above the hands
    if sid == "SH17a": img = label_chip(img, "HEAT  →  FLOOR", floor_label_xy(f, sid), ease((t - 70.9) / 0.3))  # held to the cut
    if sid == "SH15": img = label_chip(img, "HOURS PASS...", (745, 226), ease((t - 55.6) / 0.3) * ease((57.3 - t) / 0.3))  # right of the HUD
    img = draw_hud(img, f)
    if sid == "SH20": img = ecg(img, f)
    if sid == "SH23": img = factors(img, f)
    img = title(img, f)
    if t < END_T0: img = draw_captions(img, t)
    img = end_card(img, f)
    img.convert("RGB").save(f"{final_dir}/{f:05d}.png", compress_level=1)
    return True


if __name__ == "__main__":
    comp_root, final_dir, a, b = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    os.makedirs(final_dir, exist_ok=True)
    n = 0
    for f in range(a, b + 1):
        n += process(f, comp_root, final_dir)
    print("OVERLAY frames", n)
