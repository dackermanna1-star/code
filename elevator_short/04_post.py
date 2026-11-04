"""Post pass: bloom, vignette, flashes, punch-zooms, captions, hook title, DAY cards -> final MP4.
Usage: python3 04_post.py <frames_dir> <out.mp4> [first last]"""
import os, sys, re, json, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shots import TL, EV, SHOT, CARDS, FRAME_END, FPS, B0

HERE = os.path.dirname(os.path.abspath(__file__))
FR = sys.argv[1]
OUT = sys.argv[2]
F0 = int(sys.argv[3]) if len(sys.argv) > 3 else 1
F1 = int(sys.argv[4]) if len(sys.argv) > 4 else FRAME_END
Wd, Hd = 1080, 1920
FONT = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
YELLOW = (255, 214, 10)
fonts = {}


def font(sz):
    if sz not in fonts:
        fonts[sz] = ImageFont.truetype(FONT, sz)
    return fonts[sz]


# ------------------------------------------------------------------ caption chunks (<=3 words, break on punctuation)
chunks = []
for b in TL["beats"]:
    cur = []
    for w, t0, t1 in b["words"]:
        cur.append((w, t0, t1))
        if len(cur) == 3 or re.search(r"[.,?:!]|\.\.\.$", w):
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
merged = []
for c in chunks:     # merge chunks too short to read (e.g. "SO...") into the next one
    if merged and (merged[-1][-1][2] - merged[-1][0][1]) < 0.3 and len(merged[-1]) + len(c) <= 4 \
            and c[0][1] - merged[-1][-1][2] < 0.6:
        merged[-1] = merged[-1] + c
    else:
        merged.append(c)
chunks = merged
cap = []   # (f_start, f_end, words[(text, fstart)])
for i, c in enumerate(chunks):
    fs = int(round(c[0][1] * FPS)) + 1
    fe = int(round(c[-1][2] * FPS)) + 1 + 4
    if i + 1 < len(chunks):
        fe = min(fe + 8, int(round(chunks[i + 1][0][1] * FPS)))
    cap.append((fs, fe, [(re.sub(r"\.\.\.$", "...", w).upper(), int(round(t0 * FPS)) + 1) for w, t0, t1 in c]))


def draw_text_center(img, text_parts, y, size, scale=1.0, stroke=10, shadow=True):
    """text_parts: list of (string, color). Drawn centred on one line at height y (centre)."""
    sz = max(8, int(size * scale))
    fnt = font(sz)
    d = ImageDraw.Draw(img)
    space = d.textlength(" ", font=fnt)
    widths = [d.textlength(t, font=fnt) for t, _ in text_parts]
    total = sum(widths) + space * (len(text_parts) - 1)
    if total > Wd - 90:      # shrink to fit
        return draw_text_center(img, text_parts, y, size * (Wd - 90) / total, scale, stroke, shadow)
    x = (Wd - total) / 2
    asc, desc = fnt.getmetrics()
    yy = y - (asc + desc) / 2
    st = max(4, int(stroke * scale * size / 90))
    for (t, col), w in zip(text_parts, widths):
        if shadow:
            d.text((x + 6, yy + 8), t, font=fnt, fill=(0, 0, 0, 150), stroke_width=st, stroke_fill=(0, 0, 0, 150))
        d.text((x, yy), t, font=fnt, fill=col, stroke_width=st, stroke_fill=(0, 0, 0))
        x += w + space


# ------------------------------------------------------------------ image effects
yy, xx = np.mgrid[0:Hd, 0:Wd]
rr = np.sqrt(((xx - Wd / 2) / (Wd * 0.62)) ** 2 + ((yy - Hd / 2) / (Hd * 0.62)) ** 2)
VIG = np.clip(1.08 - 0.42 * rr ** 2.2, 0.45, 1.0)[..., None].astype(np.float32)


def bloom(arr):
    small = Image.fromarray(arr).resize((Wd // 4, Hd // 4), Image.BILINEAR)
    s = np.asarray(small).astype(np.float32) / 255
    lum = s.max(axis=2, keepdims=True)
    hi = s * np.clip((lum - 0.7) / 0.3, 0, 1)
    him = Image.fromarray((hi * 255).astype(np.uint8))
    b1 = np.asarray(him.filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
    b2 = np.asarray(him.filter(ImageFilter.GaussianBlur(22))).astype(np.float32) / 255
    b = Image.fromarray(np.clip((b1 * 0.6 + b2 * 0.8) * 255, 0, 255).astype(np.uint8)).resize((Wd, Hd), Image.BILINEAR)
    return np.asarray(b).astype(np.float32) / 255


def punch(img, amt):
    if amt <= 0.001:
        return img
    w, h = img.size
    cw, ch = w / (1 + amt), h / (1 + amt)
    return img.crop(((w - cw) / 2, (h - ch) / 2, (w + cw) / 2, (h + ch) / 2)).resize((w, h), Image.BICUBIC)


PUNCH = [EV["slam"], B0("day1"), B0("day2"), B0("day3"), EV["corner_zoom"], EV["thumbs"]] + EV["pounds"]
FLASH = {EV["slam"]: 0.9, B0("day1"): 0.5, B0("day2"): 0.5, B0("day3"): 0.5, EV["doors_open"] - 4: 0.6,
         SHOT["H2_shaft_drop"][0]: 0.35, SHOT["K1_car_hanging"][0]: 0.3, EV["thumbs"]: 0.35}


def flash_amt(f):
    a = 0.0
    for k, v in FLASH.items():
        if 0 <= f - k < 6:
            a = max(a, v * (1 - (f - k) / 6) ** 1.5)
    return a


def punch_amt(f):
    a = 0.0
    for k in PUNCH:
        if 0 <= f - k < 7:
            a = max(a, 0.07 * (1 - (f - k) / 7) ** 2)
    return a


def process(f):
    p = os.path.join(FR, "f_%04d.png" % f)
    img = Image.open(p).convert("RGB")
    img = punch(img, punch_amt(f))
    a = np.asarray(img).astype(np.float32) / 255
    a = a + bloom(np.asarray(img)) * 0.45
    a = a * VIG
    # gentle teal/orange split-tone
    lum = a.mean(axis=2, keepdims=True)
    a = a + (np.array([0.02, 0.0, -0.025]) * lum + np.array([-0.012, 0.0, 0.015]) * (1 - lum)) * 0.8
    fa = flash_amt(f)
    if fa:
        a = a * (1 - fa) + fa
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).convert("RGBA")
    over = Image.new("RGBA", img.size, (0, 0, 0, 0))
    # ---- hook title (first ~3 s)
    if f <= 92:
        s = 1.0 + 0.25 * max(0, 1 - (f - 1) / 5)
        alpha = 1.0 if f < 84 else (92 - f) / 8
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        draw_text_center(layer, [("TRAPPED", (255, 255, 255)), ("FOR", (255, 255, 255))], 165, 86, s)
        draw_text_center(layer, [("3 DAYS", (255, 60, 50)), ("IN AN", (255, 255, 255))], 268, 86, s)
        draw_text_center(layer, [("ELEVATOR?", YELLOW)], 375, 98, s)
        if alpha < 1:
            layer.putalpha(Image.fromarray((np.asarray(layer)[..., 3] * alpha).astype(np.uint8)))
        over = Image.alpha_composite(over, layer)
    # ---- DAY cards
    for txt, a0, a1 in CARDS:
        if a0 <= f <= a1:
            k = f - a0
            s = 1.0 + 0.7 * max(0, 1 - k / 4) ** 2
            alpha = 1.0 if f < a1 - 6 else (a1 - f) / 6
            layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
            dd = ImageDraw.Draw(layer)
            dd.rectangle((0, 300, Wd, 520), fill=(0, 0, 0, int(110 * alpha)))
            jx = int(np.sin(k * 2.7) * 8 * max(0, 1 - k / 8))
            tmp = Image.new("RGBA", img.size, (0, 0, 0, 0))
            draw_text_center(tmp, [(txt, YELLOW)], 410, 170, s, stroke=12)
            layer = Image.alpha_composite(layer, Image.fromarray(np.roll(np.asarray(tmp), jx, axis=1)))
            if alpha < 1:
                layer.putalpha(Image.fromarray((np.asarray(layer)[..., 3] * alpha).astype(np.uint8)))
            over = Image.alpha_composite(over, layer)
    # ---- captions
    for fs, fe, words in cap:
        if fs <= f <= fe:
            k = f - fs
            s = 1.0 + 0.18 * max(0, 1 - k / 3)
            parts = []
            for i, (w, wf) in enumerate(words):
                nxt = words[i + 1][1] if i + 1 < len(words) else fe + 1
                active = wf <= f < nxt
                parts.append((w, YELLOW if active else (255, 255, 255)))
            draw_text_center(over, parts, 1250, 92, s)
    img = Image.alpha_composite(img, over).convert("RGB")
    return img


if __name__ == "__main__":
    if OUT.endswith(".png"):            # single-frame preview
        process(F0).save(OUT)
        sys.exit()
    audio = os.path.join(HERE, "build", "mix.wav")
    ss = (F0 - 1) / FPS
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{Wd}x{Hd}",
           "-r", str(FPS), "-i", "-", "-ss", f"{ss:.3f}", "-i", audio, "-map", "0:v", "-map", "1:a",
           "-vf", "hqdn3d=1.5:1.5:5:5", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(F0, F1 + 1):
        pr.stdin.write(process(f).tobytes())
        if f % 100 == 0:
            print("post", f, flush=True)
    pr.stdin.close()
    pr.wait()
    print("wrote", OUT)
