"""2D overlays on top of the composited frames: captions, HUD, infographics, transitions.

python3 overlays.py <comp_dir_root> <final_dir> <frame0> <frame1>
Frame f (1-based) <-> time t = (f-1)/30 s; narration word timings from audio/words.json.
"""
import os, sys, json, math
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
def build_chunks():
    chunks, cur = [], []
    for w in WORDS:
        cur.append(w)
        end_punct = w["w"][-1] in ".,?!:;"
        if len(cur) >= 3 or end_punct:
            chunks.append(cur); cur = []
    if cur: chunks.append(cur)
    out = []
    for i, c in enumerate(chunks):
        s, e = c[0]["s"], c[-1]["e"]
        nxt = chunks[i + 1][0]["s"] if i + 1 < len(chunks) else e + 0.6
        e = min(max(e + 0.15, s + 0.45), nxt - 0.02) if nxt - e < 0.5 else e + 0.15
        out.append({"s": s, "e": e, "words": c})
    return out


CHUNKS = build_chunks()
KEY = {"cold", "core", "37", "35", "32", "28", "20", "hypothermia", "shivering", "heat", "numb", "ice", "survive", "alarm", "quiet",
       "dead", "warm", "consciousness", "unstable", "cardboard", "armpits", "hours", "minutes", "release", "signal"}


def stroke_text(d, xy, txt, fnt, fill, stroke=8, sfill=(0, 0, 0)):
    d.text(xy, txt, font=fnt, fill=fill, stroke_width=stroke, stroke_fill=sfill)


def draw_captions(img, t):
    ch = next((c for c in CHUNKS if c["s"] - 0.03 <= t <= c["e"]), None)
    if not ch: return img
    pop = ease((t - ch["s"]) / 0.12)
    size = int(78 * (0.88 + 0.12 * pop))
    fnt = font(size)
    words = [w["w"].upper().strip(",.:;") if w["w"][-1] in ",.:;" else w["w"].upper() for w in ch["words"]]
    # wrap into lines <= 900px
    lines, cur = [], []
    for i, w in enumerate(words):
        test = " ".join([x for _, x in cur] + [w])
        if cur and fnt.getlength(test) > 920:
            lines.append(cur); cur = []
        cur.append((i, w))
    lines.append(cur)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    y = 1290 - (len(lines) - 1) * size * 0.6
    for ln in lines:
        txt = " ".join(w for _, w in ln)
        x = W / 2 - fnt.getlength(txt) / 2
        for i, w in ln:
            wd = ch["words"][i]
            active = wd["s"] - 0.02 <= t <= wd["e"] + 0.05
            base = wd["w"].strip(",.:;?!").lower()
            col = (255, 214, 10) if active else ((120, 220, 255) if base in KEY else (255, 255, 255))
            stroke_text(d, (x, y), w, fnt, col + (255,), stroke=9)
            x += fnt.getlength(w + " ")
        y += size * 1.2
    sh = lay.split()[3].filter(ImageFilter.GaussianBlur(10)).point(lambda v: v * 0.5)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0)); shadow.putalpha(sh)
    img = Image.alpha_composite(img, shadow.transform((W, H), Image.AFFINE, (1, 0, -4, 0, 1, -6)))
    return Image.alpha_composite(img, lay)


# ------------------------------------------------------------------ core temperature HUD
CORE_KEYS = [  # (frame, temp, label)
    (F(19.4), 37.0, "NORMAL"), (F(25.8), 37.0, "NORMAL"),
    (F(55.5), 37.0, "NORMAL"), (F(58.6), 36.0, ""), (F(59.6), 35.0, "HYPOTHERMIA"), (F(62.2), 34.8, "MILD HYPOTHERMIA"),
    (F(69.3), 33.8, "MILD HYPOTHERMIA"), (F(77.4), 32.9, "MILD HYPOTHERMIA"), (F(79.3), 32.0, "MODERATE"),
    (F(81.95), 31.1, "MODERATE"), (F(86.9), 30.5, "MODERATE"), (F(91.8), 29.4, "MODERATE"), (F(92.5), 28.0, "SEVERE"), (F(99.2), 27.6, "SEVERE")]
HUD_ON = [(F(19.4) + 1, F(28.7)), (F(55.4) + 1, F(86.9)), (F(91.7) + 1, F(99.2))]


def core_at(f):
    ks = CORE_KEYS
    if f <= ks[0][0]: return ks[0][1], ks[0][2]
    for a, b in zip(ks, ks[1:]):
        if a[0] <= f <= b[0]:
            u = (f - a[0]) / max(1, b[0] - a[0])
            return a[1] + (b[1] - a[1]) * ease(u), (b[2] if u > 0.5 and b[2] else a[2])
    return ks[-1][1], ks[-1][2]


def temp_col(tc):
    u = clamp((tc - 27.5) / (37.0 - 27.5))
    c0, c1, c2 = np.array([80, 140, 255]), np.array([255, 200, 60]), np.array([255, 110, 40])
    return tuple(int(v) for v in (c0 + (c1 - c0) * (u / 0.6) if u < 0.6 else c1 + (c2 - c1) * ((u - 0.6) / 0.4)))


def draw_hud(img, f):
    on = next(((a, b) for a, b in HUD_ON if a <= f <= b), None)
    if not on: return img
    a = ease((f - on[0]) / 10) * ease((on[1] - f) / 8)
    tc, lab = core_at(f)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    x0, y0 = 62, 262
    d.rounded_rectangle((x0 - 20, y0 - 30, x0 + 345, y0 + 330), radius=26, fill=(8, 14, 24, int(150 * a)))
    # thermometer tube
    tx, top, bot = x0 + 30, y0 + 20, y0 + 250
    d.rounded_rectangle((tx - 14, top, tx + 14, bot), radius=14, outline=(230, 240, 255, int(255 * a)), width=4)
    d.ellipse((tx - 30, bot - 18, tx + 30, bot + 42), outline=(230, 240, 255, int(255 * a)), width=4)
    col = temp_col(tc)
    lvl = bot - (bot - top - 10) * clamp((tc - 26.0) / (38.0 - 26.0))
    d.rounded_rectangle((tx - 7, lvl, tx + 7, bot + 6), radius=7, fill=col + (int(255 * a),))
    d.ellipse((tx - 22, bot - 10, tx + 22, bot + 34), fill=col + (int(255 * a),))
    for k, tk in enumerate([37, 35, 32, 28]):
        yy = bot - (bot - top - 10) * clamp((tk - 26.0) / 12.0)
        d.line((tx + 18, yy, tx + 32, yy), fill=(230, 240, 255, int(200 * a)), width=3)
        d.text((tx + 38, yy - 12), f"{tk}°", font=font(22, "Bold"), fill=(200, 215, 235, int(220 * a)))
    d.text((x0 + 122, y0 + 0), "CORE", font=font(30, "ExtraBold"), fill=(200, 220, 255, int(255 * a)))
    d.text((x0 + 117, y0 + 36), f"{tc:.1f}°C", font=font(64, "Black"), fill=col + (int(255 * a),), stroke_width=3, stroke_fill=(0, 0, 0, int(200 * a)))
    if lab:
        flash = 1.0
        if lab == "HYPOTHERMIA": flash = 0.55 + 0.45 * math.sin(f * 0.9)
        lc = (255, 90, 70) if lab in ("HYPOTHERMIA", "SEVERE") else ((255, 170, 60) if lab == "MODERATE" else ((255, 210, 90) if "MILD" in lab else (150, 255, 170)))
        lines = lab.split(" ") if len(lab) > 12 else [lab]
        for i, ln in enumerate(lines):
            d.text((x0 + 119, y0 + 120 + i * 36), ln, font=font(30, "Black"), fill=lc + (int(255 * a * flash),))
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
    if (f // 15) % 2 == 0: d.ellipse((m + 8, 182, m + 30, 204), fill=(255, 60, 50, 230))
    d.text((m + 42, 176), "THERMAL", font=font(30, "Bold", mono=True), fill=c)
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
    d.text((bx - 70, by0 - 44), "WARM", font=font(24, "Bold", mono=True), fill=c)
    d.text((bx - 64, by1 + 10), "COLD", font=font(24, "Bold", mono=True), fill=c)
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


def nerve_pulses(img, f, sid):
    c = cam(sid, f); an = ANCH.get(sid, {}).get(str(f))
    if not c or not an: return img
    t = T(f); t0 = 16.6
    a = ease((t - t0) / 0.4) * ease((19.35 - t) / 0.3)
    if a <= 0: return img
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for side in "lr":
        chain = [an[f"hand_{side}"], an[f"lowerarm_{side}"], an[f"upperarm_{side}"], an[f"clavicle_{side}"]]
        pts = [project(c, p) for p in chain]
        if any(p is None for p in pts): continue
        d.line(pts, fill=(90, 200, 255, int(70 * a)), width=3, joint="curve")
        seg = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]; tot = sum(seg)
        for k in range(3):
            u = ((t - t0) * 0.8 + k / 3 + (0.15 if side == "r" else 0)) % 1.0
            s_ = u * tot
            for i, L in enumerate(seg):
                if s_ <= L:
                    q = (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * s_ / max(L, 1e-3), pts[i][1] + (pts[i + 1][1] - pts[i][1]) * s_ / max(L, 1e-3)); break
                s_ -= L
            r = 9 * (1 - 0.4 * u)
            d.ellipse((q[0] - r, q[1] - r, q[0] + r, q[1] + r), fill=(210, 245, 255, int(255 * a * (1 - 0.5 * u))))
    hp = project(c, an["head_tail"])
    if hp and t > 17.8:
        ring = ((t - 17.9) * 1.6) % 1.0
        rr = 40 + ring * 120
        d.ellipse((hp[0] - rr, hp[1] - rr, hp[0] + rr, hp[1] + rr), outline=(120, 220, 255, int(220 * a * (1 - ring))), width=6)
    g = glow_layer(lay, 9)
    return Image.alpha_composite(Image.alpha_composite(img, g), lay)


def vessel_inset(img, f):
    t = T(f)
    a = ease((t - 23.6) / 0.35) * ease((25.75 - t) / 0.25)
    if a <= 0: return img
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    cx, cy, R = 800, 520, 190
    d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=(10, 14, 24, int(215 * a)), outline=(230, 240, 255, int(255 * a)), width=5)
    sq = ease((t - 24.25) / 0.9)
    outer = 150 - 18 * sq; lumen = 115 - 62 * sq
    d.ellipse((cx - outer, cy - outer, cx + outer, cy + outer), fill=(190, 80, 90, int(255 * a)))
    d.ellipse((cx - lumen, cy - lumen, cx + lumen, cy + lumen), fill=(120, 0, 18, int(255 * a)))
    rng = np.random.default_rng(3)
    for k in range(int(26 - 16 * sq)):
        ang = rng.uniform(0, 6.28) + t * rng.uniform(0.3, 0.9); rr = rng.uniform(0, lumen - 14)
        x, y = cx + rr * math.cos(ang), cy + rr * math.sin(ang)
        d.ellipse((x - 10, y - 7, x + 10, y + 7), fill=(235, 40, 50, int(255 * a)))
    for k in range(10):
        ang = k / 10 * 6.28
        x0, y0 = cx + (outer + 26) * math.cos(ang), cy + (outer + 26) * math.sin(ang)
        x1, y1 = cx + (outer + 4) * math.cos(ang), cy + (outer + 4) * math.sin(ang)
        d.line((x0, y0, x1, y1), fill=(255, 255, 255, int(200 * a * sq)), width=5)
    txt = "VESSELS NARROW" if sq > 0.3 else "BLOOD VESSEL"
    fnt = font(34, "Black")
    d.text((cx - fnt.getlength(txt) / 2, cy + R + 18), txt, font=fnt, fill=(255, 255, 255, int(255 * a)), stroke_width=5, stroke_fill=(0, 0, 0, int(255 * a)))
    return Image.alpha_composite(img, lay)


def heat_arrows(img, f, sid):
    c = cam(sid, f); an = ANCH.get(sid, {}).get(str(f))
    if not c or not an: return img
    t = T(f)
    a = ease((t - 34.4) / 0.4) * ease((36.9 - t) / 0.2)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for b, dx in [("head_tail", 0), ("clavicle_l", 0), ("clavicle_r", 0), ("spine_03", 0)]:
        p = project(c, an[b])
        if not p: continue
        for k in range(3):
            u = ((t * 0.6 + k / 3 + hash(b) % 7 / 7) % 1.0)
            y0 = p[1] - 30 - u * 340
            pts = [(p[0] + 18 * math.sin(y0 / 40 + j * 0.8 + t * 3), y0 - j * 14) for j in range(9)]
            d.line(pts, fill=(255, 215, 140, int(170 * a * (1 - u) * min(1, u * 4))), width=6)
    return Image.alpha_composite(Image.alpha_composite(img, glow_layer(lay, 7)), lay)


def label_chip(img, txt, xy, a, col=(255, 255, 255)):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    fnt = font(38, "Black"); w = fnt.getlength(txt)
    x, y = xy
    d.rounded_rectangle((x - w / 2 - 24, y - 30, x + w / 2 + 24, y + 30), radius=30, fill=(8, 14, 24, int(190 * a)))
    d.text((x - w / 2, y - 24), txt, font=fnt, fill=col + (int(255 * a),))
    return Image.alpha_composite(img, lay)


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


FACTORS = [(108.55, "TEMPERATURE", "therm"), (109.05, "MOVING AIR", "wind"), (110.25, "CLOTHING", "shirt"),
           (110.75, "STAYING DRY", "drop"), (111.75, "BODY & HEALTH", "person"), (113.2, "HOW FAST YOU'RE FOUND", "door")]


def icon(d, kind, cx, cy, s, a):
    c = (255, 255, 255, int(255 * a)); w = 6
    if kind == "therm":
        d.rounded_rectangle((cx - 9, cy - s, cx + 9, cy + s * 0.45), radius=9, outline=c, width=w)
        d.ellipse((cx - 20, cy + s * 0.35, cx + 20, cy + s * 0.35 + 40), outline=c, width=w)
    elif kind == "wind":
        for k, L in enumerate([1.0, 0.75, 0.9]):
            y = cy - s * 0.5 + k * s * 0.5
            d.line((cx - s, y, cx - s + 2 * s * L, y), fill=c, width=w)
            d.arc((cx - s + 2 * s * L - 16, y - 32, cx - s + 2 * s * L + 16, y), 90, 360, fill=c, width=w)
    elif kind == "shirt":
        d.polygon([(cx - s, cy - s * 0.6), (cx - s * 0.4, cy - s), (cx + s * 0.4, cy - s), (cx + s, cy - s * 0.6), (cx + s * 0.7, cy - s * 0.2),
                   (cx + s * 0.5, cy - s * 0.35), (cx + s * 0.5, cy + s), (cx - s * 0.5, cy + s), (cx - s * 0.5, cy - s * 0.35), (cx - s * 0.7, cy - s * 0.2)], outline=c, width=w)
    elif kind == "drop":
        d.polygon([(cx, cy - s), (cx + s * 0.6, cy + s * 0.2), (cx, cy + s * 0.8), (cx - s * 0.6, cy + s * 0.2)], outline=c, width=w)
        d.ellipse((cx - s * 0.62, cy - s * 0.15, cx + s * 0.62, cy + s * 0.85), outline=c, width=w)
    elif kind == "person":
        d.ellipse((cx - s * 0.32, cy - s, cx + s * 0.32, cy - s * 0.36), outline=c, width=w)
        d.rounded_rectangle((cx - s * 0.6, cy - s * 0.25, cx + s * 0.6, cy + s), radius=int(s * 0.4), outline=c, width=w)
    elif kind == "door":
        d.rectangle((cx - s * 0.55, cy - s, cx + s * 0.55, cy + s), outline=c, width=w)
        d.polygon([(cx - s * 0.55, cy - s), (cx + s * 0.25, cy - s * 0.75), (cx + s * 0.25, cy + s * 1.15), (cx - s * 0.55, cy + s)], fill=(255, 200, 120, int(120 * a)))
        d.ellipse((cx + s * 0.05, cy - 6, cx + s * 0.05 + 12, cy + 6), fill=c)


def factors(img, f):
    t = T(f)
    if not (107.7 <= t <= 114.95): return img
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    out = ease((114.9 - t) / 0.3)
    for i, (ts, lab, ic) in enumerate(FACTORS):
        a = ease((t - ts) / 0.22) * out
        if a <= 0: continue
        col, row = i % 2, i // 2
        cx = 280 + col * 520; cy = 330 + row * 230
        pop = 0.8 + 0.2 * ease((t - ts) / 0.15)
        bw, bh = 470 * pop, 190 * pop
        d.rounded_rectangle((cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2), radius=34, fill=(10, 18, 30, int(200 * a)),
                            outline=(120, 220, 255, int(230 * a)), width=4)
        icon(d, ic, cx - bw / 2 + 80 * pop, cy, 42 * pop, a)
        fnt = font(int(34 * pop), "Black")
        words = lab.split(" "); lines = [lab] if fnt.getlength(lab) < bw - 170 else [" ".join(words[:2]), " ".join(words[2:])]
        for k, ln in enumerate(lines):
            d.text((cx - bw / 2 + 150 * pop, cy - 22 * len(lines) + k * 44), ln, font=fnt, fill=(255, 255, 255, int(255 * a)))
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


def end_card(img, f):
    t = T(f)
    a = ease((t - 129.85) / 0.5)
    if a <= 0: return img
    dark = Image.new("RGBA", (W, H), (0, 4, 10, int(170 * a)))
    img = Image.alpha_composite(img, dark)
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    lines = [("KNOW WHERE THE", 74, (255, 255, 255)), ("EMERGENCY RELEASE", 82, (255, 214, 10)), ("IS.", 74, (255, 255, 255))]
    for k, (txt, sz, col) in enumerate(lines):
        fnt = font(sz); w = fnt.getlength(txt)
        d.text((W / 2 - w / 2, 640 + k * 100), txt, font=fnt, fill=col + (int(255 * a),), stroke_width=8, stroke_fill=(0, 0, 0, int(255 * a)))
    sm = "Most walk-in freezers have one inside the door."
    fnt = font(36, "SemiBold"); w = fnt.getlength(sm)
    d.text((W / 2 - w / 2, 980), sm, font=fnt, fill=(220, 230, 245, int(255 * a)), stroke_width=4, stroke_fill=(0, 0, 0, int(220 * a)))
    return Image.alpha_composite(img, lay)


# ------------------------------------------------------------------ image-space effects
def pov_confusion(arr, f):
    t = T(f); s0, s1 = F(86.9) + 1, F(91.7)
    u = (f - s0) / (s1 - s0)
    off = int(10 + 16 * (0.5 + 0.5 * math.sin(t * 2.1)))
    img = Image.fromarray(arr)
    b = img.filter(ImageFilter.GaussianBlur(2 + 3 * u))
    sh = Image.fromarray(np.roll(np.asarray(b), off, axis=1))
    out = Image.blend(b, sh, 0.42)
    a = np.asarray(out).astype(np.float32)
    lum = a.mean(axis=2, keepdims=True); a = lum + (a - lum) * 0.75
    for c0, c1 in [(s0 + 40, s0 + 50), (s0 + 92, s0 + 108), (s0 + 128, s1)]:
        if c0 <= f <= c1:
            k = math.sin(math.pi * (f - c0) / (c1 - c0)) if f < c1 or c1 != s1 else 1.0
            a *= (1 - 0.95 * clamp(k))
    return np.clip(a, 0, 255).astype(np.uint8)


def fades(arr, f):
    a = arr.astype(np.float32); k = 1.0
    s20e = F(99.2); s21 = F(99.2) + 1
    if F(97.6) <= f <= s20e: k = 1 - ease((f - F(97.6)) / (s20e - F(97.6))) * 0.96      # slip into darkness
    if s21 <= f <= s21 + 10: k = 0.04 + 0.96 * ease((f - s21) / 10)
    if F(55.4) - 3 <= f <= F(55.4) + 4: k = min(k, 0.15 + 0.85 * abs(f - F(55.4)) / 4)  # time-lapse dip
    for jc in (F(55.4) + 59, F(55.4) + 123):  # time-lapse jump flashes
        if jc - 1 <= f <= jc + 1: a = a * 0.7 + 255 * 0.3
    if f >= F(132.6): k *= 1 - ease((f - F(132.6)) / 11)
    return np.clip(a * k, 0, 255).astype(np.uint8)


LAST = max(v["f1"] for v in SHOTS.values())
TOTAL_FRAMES = F(133.0)


def process(f, comp_root, final_dir):
    sid, s = shot_of(min(f, LAST))
    src = f"{comp_root}/{sid}/{min(f, LAST):05d}.png" if sid else None
    if not src or not os.path.exists(src):
        return False
    arr = np.asarray(Image.open(src).convert("RGB"))
    if sid == "SH19": arr = pov_confusion(arr, f)
    if f > LAST: sid = "END"
    arr = fades(arr, f)
    img = Image.fromarray(arr).convert("RGBA")
    if s["mode"] == "thermal": img = draw_thermal_ui(img, f, sid)
    if sid == "SH06b": img = nerve_pulses(img, f, sid)
    if sid == "SH08a": img = vessel_inset(img, f)
    if sid == "SH10a": img = heat_arrows(img, f, sid)
    if sid == "SH10c": img = label_chip(img, "HEAT  →  METAL", (W / 2 + 120, 690), ease((T(f) - 38.6) / 0.3))
    if sid == "SH10b": img = label_chip(img, "WARM, MOIST BREATH", (W / 2, 520), ease((T(f) - 37.1) / 0.3))
    if sid == "SH17a": img = label_chip(img, "HEAT  →  FLOOR", (W / 2 + 120, 690), ease((T(f) - 70.9) / 0.3) * ease((72.85 - T(f)) / 0.2))
    if sid == "SH15": img = label_chip(img, "HOURS PASS...", (W / 2, 210), ease((T(f) - 55.6) / 0.3) * ease((57.3 - T(f)) / 0.3))
    img = draw_hud(img, f)
    if sid == "SH20": img = ecg(img, f)
    if sid == "SH23": img = factors(img, f)
    img = title(img, f)
    img = draw_captions(img, T(f))
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
