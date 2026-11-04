"""Post pipeline: grade + bloom + vignette + grain + upscale to 1080x1920, titles and word-timed subtitles,
then encode with the soundtrack.  Usage: python post.py [out.mp4] [--preview]"""
import json, os, sys, subprocess, re, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = "/home/user/code/production"
TL = json.load(open(f"{ROOT}/timeline.json"))
TIM = {t["id"]: t for t in json.load(open(f"{ROOT}/audio/narration/timings.json"))}
W, H = 1080, 1920
FPS = 30
FONT_B = "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"
FONT_M = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
f_sub = ImageFont.truetype(FONT_B, 64)
f_title = ImageFont.truetype(FONT_B, 92)
f_card = ImageFont.truetype(FONT_B, 46)
f_small = ImageFont.truetype(FONT_M, 30)

# per-shot grade: (saturation, contrast, warmth, bloom, vignette)
G = {"S01a": (1.3, 1.12, 0.06, 0.35, 0.35), "S01b": (1.1, 1.1, 0.03, 0.4, 0.4), "S02": (1.15, 1.08, 0.05, 0.3, 0.4),
     "S03": (1.2, 1.08, 0.05, 0.4, 0.4), "S04": (1.35, 1.12, 0.06, 0.3, 0.35), "S05a": (1.35, 1.12, 0.06, 0.3, 0.38),
     "S05b": (1.25, 1.1, 0.0, 0.3, 0.4), "S06a": (1.2, 1.1, 0.04, 0.7, 0.35), "S06b": (1.05, 1.15, 0.08, 0.5, 0.45),
     "S07": (0.95, 1.15, 0.1, 0.4, 0.55), "S08": (1.0, 1.12, 0.03, 0.3, 0.45), "S09": (1.1, 1.15, 0.06, 0.6, 0.55),
     "S10": (1.05, 1.1, 0.06, 0.3, 0.45), "S11": (1.2, 1.1, 0.03, 0.3, 0.4), "S12a": (1.1, 1.1, 0.03, 0.3, 0.42),
     "S12b": (1.1, 1.1, 0.03, 0.3, 0.42), "S13a": (1.1, 1.12, 0.03, 0.4, 0.5), "S13b": (1.05, 1.12, 0.04, 0.7, 0.4),
     "S14": (0.95, 1.15, 0.1, 0.5, 0.55), "S15a": (1.1, 1.1, 0.02, 0.3, 0.45), "S15b": (1.0, 1.12, 0.08, 0.4, 0.5),
     "S15c": (0.95, 1.12, 0.06, 0.3, 0.5), "S16": (1.0, 1.08, 0.08, 0.4, 0.42), "S17": (1.1, 1.12, -0.02, 0.5, 0.55),
     "S18a": (1.05, 1.08, 0.07, 0.4, 0.45), "S18b": (1.05, 1.08, 0.07, 0.4, 0.45), "S19": (1.25, 1.1, 0.08, 0.5, 0.45),
     "S20": (1.2, 1.1, 0.05, 0.9, 0.55)}

SKY = {"S01a": 0.6, "S04": 0.7, "S05a": 0.7, "S05b": 0.5, "S06a": 0.4, "S11": 0.4, "S19": 0.2, "S08": 0.35, "S15a": 0.3}

# on-screen cards: (shot, start_offset_s, duration_s, lines)
CARDS = [("S01a", 0.4, 4.4, ["TSUTOMU YAMAGUCHI", "1916 – 2010"]),
         ("S02", 0.5, 4.5, ["NAGASAKI · MITSUBISHI SHIPYARD"]),
         ("S03", 0.3, 4.0, ["MAY 1945"]),
         ("S04", 0.2, 2.9, ["6 AUGUST 1945", "HIROSHIMA"]),
         ("S05a", 0.1, 2.2, ["8:15 AM"]),
         ("S10", 0.2, 3.2, ["7 AUGUST 1945"]),
         ("S11", 0.2, 3.6, ["9 AUGUST 1945", "NAGASAKI"]),
         ("S13a", 0.0, 2.0, ["11:02 AM"]),
         ("S17", 0.4, 4.0, ["2006 · UNITED NATIONS, NEW YORK"]),
         ("S18a", 0.3, 4.0, ["24 MARCH 2009"])]


def captions():
    """Chunk each narration line into 2–4 word captions with per-word timing (global seconds)."""
    out = []
    for ln in TL["lines"]:
        tim = TIM[ln["id"]]
        words = [w for w in tim["words"]]
        text_words = re.findall(r"[\w'’\-\.,:;!?\"“”]+", ln["text"])
        # map TTS tokens to display words (fall back to TTS tokens)
        disp = []
        tw = [w for w in text_words]
        toks = [w for w in words if re.search(r"\w", w["w"])]
        if len(tw) == len(toks):
            for a, b in zip(tw, toks):
                disp.append({"w": a, "s": b["s"], "e": b["e"]})
        else:
            n = len(tw)
            span = (toks[-1]["e"] - toks[0]["s"]) if toks else ln["speech"]
            s0 = toks[0]["s"] if toks else 0
            for i, a in enumerate(tw):
                disp.append({"w": a, "s": s0 + span * i / n, "e": s0 + span * (i + 1) / n})
        base = ln["t"] - ln["audio_trim"]
        for d in disp:
            d["s"] += base; d["e"] += base
        chunk = []
        for i, d in enumerate(disp):
            chunk.append(d)
            brk = re.search(r"[,.;:!?\"”]$", d["w"]) or len(chunk) >= 4 or (len(chunk) >= 3 and len(d["w"]) > 6)
            if brk or i == len(disp) - 1:
                out.append(chunk); chunk = []
    res = []
    for i, ch in enumerate(out):
        s = ch[0]["s"] - 0.05
        e = ch[-1]["e"] + 0.25
        if i + 1 < len(out):
            e = min(e, out[i + 1][0]["s"] - 0.05)
        res.append({"s": s, "e": e, "words": ch})
    return res


CAPS = captions()


def draw_text_centered(d, y, text, font, fill=(255, 255, 255), stroke=6, sfill=(0, 0, 0)):
    w = d.textlength(text, font=font)
    while w > W - 80 and font.size > 30:
        font = ImageFont.truetype(font.path, font.size - 4)
        w = d.textlength(text, font=font)
    d.text(((W - w) / 2, y), text, font=font, fill=fill, stroke_width=stroke, stroke_fill=sfill)


def overlay(img, t, sid, t_shot):
    d = ImageDraw.Draw(img, "RGBA")
    # cards
    for (cs, off, dur, lines) in CARDS:
        if cs != sid:
            continue
        lt = t_shot - off
        if 0 <= lt <= dur:
            a = min(1, lt / 0.3, (dur - lt) / 0.3)
            y = 300
            for k, line in enumerate(lines):
                font = f_title if (cs == "S01a" and k == 0) else f_card
                col = (255, 255, 255, int(255 * a))
                if cs == "S01a" and k == 1:
                    font = f_card; col = (255, 214, 120, int(255 * a))
                draw_text_centered(d, y, line, font, fill=col, stroke=5, sfill=(0, 0, 0, int(200 * a)))
                y += (font.size + 18)
    # end card
    if sid == "S20" and t_shot > 4.0:
        lt = t_shot - 4.0
        a = min(1, lt / 0.8)
        col = (255, 255, 255, int(255 * a))
        draw_text_centered(d, 760, "TSUTOMU YAMAGUCHI", f_title, fill=col, stroke=5, sfill=(0, 0, 0, int(200 * a)))
        draw_text_centered(d, 870, "1916 – 2010", f_card, fill=(255, 214, 120, int(255 * a)), stroke=4, sfill=(0, 0, 0, int(200 * a)))
        draw_text_centered(d, 960, "The only person officially recognised", f_small, fill=(235, 235, 235, int(230 * a)), stroke=3, sfill=(0, 0, 0, int(180 * a)))
        draw_text_centered(d, 1000, "as a survivor of both atomic bombings.", f_small, fill=(235, 235, 235, int(230 * a)), stroke=3, sfill=(0, 0, 0, int(180 * a)))
    # subtitles
    for cap in CAPS:
        if cap["s"] <= t <= cap["e"]:
            words = cap["words"]
            parts = [w["w"].upper() for w in words]
            space = d.textlength(" ", font=f_sub)
            widths = [d.textlength(p, font=f_sub) for p in parts]
            total = sum(widths) + space * (len(parts) - 1)
            lines = [(parts, widths)]
            if total > W - 120:
                k = len(parts) // 2
                lines = [(parts[:k], widths[:k]), (parts[k:], widths[k:])]
            y = 1240
            idx = 0
            pop = min(1.0, (t - cap["s"]) / 0.08)
            started = [k for k, w_ in enumerate(words) if w_["s"] <= t]
            cur_i = started[-1] if started else 0
            for lp, lw in lines:
                tw_ = sum(lw) + space * (len(lp) - 1)
                x = (W - tw_) / 2
                for p, wd in zip(lp, lw):
                    wobj = words[idx]
                    cur = (idx == cur_i)
                    col = (255, 220, 60, 255) if cur else (255, 255, 255, 255)
                    d.text((x, y + (1 - pop) * 12), p, font=f_sub, fill=col, stroke_width=7, stroke_fill=(0, 0, 0, 255))
                    x += wd + space
                    idx += 1
                y += 82
            break
    return img


def grade(arr, sid, fidx):
    sat, con, warm, bloom, vig = G.get(sid, (1.1, 1.08, 0.04, 0.3, 0.4))
    x = arr.astype(np.float32) / 255.0
    # bloom from highlights (computed small, then upsampled)
    lum = x @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    hi = np.clip((lum - 0.72) / 0.28, 0, 1)[..., None] * x
    small = Image.fromarray((hi * 255).astype(np.uint8)).resize((W // 8, H // 8), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6))
    bl = np.asarray(small.resize((W, H), Image.BILINEAR)).astype(np.float32) / 255.0
    x = x + bl * bloom * 1.4
    # sky tint: bright, low-saturation pixels in the upper frame -> clear summer blue
    sk = SKY.get(sid, 0.0)
    if sk:
        mx = x.max(-1); mn = x.min(-1)
        satp = (mx - mn) / (mx + 1e-4)
        l2 = x @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        if not hasattr(grade, "_g"):
            grade._g = np.clip(1.15 - np.linspace(0, 1, H) * 1.6, 0, 1)[:, None].astype(np.float32)
        m = np.clip((l2 - 0.35) / 0.3, 0, 1) * np.clip(1 - satp * 4, 0, 1) * grade._g * sk
        blue = np.array([0.42, 0.6, 0.88], np.float32) * (0.75 + 0.45 * l2[..., None])
        x = x * (1 - m[..., None]) + blue * m[..., None]
    # saturation
    lum = (x @ np.array([0.2126, 0.7152, 0.0722], np.float32))[..., None]
    x = lum + (x - lum) * sat
    # warm highlights / cool shadows split-tone
    x[..., 0] += warm * lum[..., 0] * 0.5
    x[..., 2] -= warm * lum[..., 0] * 0.4
    x[..., 2] += 0.02 * (1 - lum[..., 0])
    # contrast S-curve around 0.45
    x = np.clip(x, 0, 1.5)
    x = 0.45 + (x - 0.45) * con
    x = np.clip(x, 0, 1)
    x = x * x * (3 - 2 * x) * 0.25 + x * 0.75
    # vignette
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    if not hasattr(grade, "_v"):
        r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.6)) ** 2)
        grade._v = np.clip(1 - (r - 0.55) / 0.6, 0, 1)
    v = 1 - vig * (1 - grade._v)
    x = x * v[..., None]
    # film grain
    rng = np.random.default_rng(fidx)
    g = rng.normal(0, 0.012, (H // 2, W // 2)).astype(np.float32)
    g = np.repeat(np.repeat(g, 2, 0), 2, 1)
    x = np.clip(x + g[..., None], 0, 1)
    return (x * 255).astype(np.uint8)


def frame_image(sid, f):
    p = f"{ROOT}/renders/{sid}/{f:04d}.png"
    if os.path.exists(p) and os.path.getsize(p) > 1000:
        im = Image.open(p).convert("RGB")
        return im.resize((W, H), Image.LANCZOS), True
    im = Image.new("RGB", (W, H), (18, 18, 20))
    d = ImageDraw.Draw(im)
    draw_text_centered(d, 880, f"{sid}  (rendering)", f_card)
    return im, False


def main():
    out = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else f"{ROOT}/output/yamaguchi_short.mp4"
    preview = "--preview" in sys.argv
    step = 1
    audio = f"{ROOT}/audio/mix.wav"
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast" if preview else "slow",
           "-crf", "26" if preview else "17", "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
           "-c:a", "aac", "-b:a", "256k", "-shortest", out]
    rng_ = [a for a in sys.argv if a.startswith("--range=")]
    fa, fb = (1, TL["total_frames"]) if not rng_ else tuple(int(v) for v in rng_[0][8:].split("-"))
    if rng_:
        i = cmd.index("-i", cmd.index("-")) if False else None
        # trim audio to the range
        k = cmd.index(audio)
        cmd[k - 1:k + 1] = ["-ss", str((fa - 1) / FPS), "-i", audio]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    missing = 0
    for s in TL["shots"]:
        sid = s["id"]
        for f in range(max(s["f0"], fa), min(s["f1"], fb) + 1):
            t = (f - 1) / FPS
            im, ok = frame_image(sid, f)
            missing += (not ok)
            if ok:
                arr = grade(np.asarray(im), sid, f)
                im = Image.fromarray(arr)
            # global fade in/out
            if f <= 12:
                im = Image.blend(Image.new("RGB", (W, H)), im, f / 12)
            im = overlay(im, t, sid, (f - s["f0"]) / FPS)
            p.stdin.write(im.tobytes())
    p.stdin.close(); p.wait()
    print("wrote", out, "missing frames:", missing)


if __name__ == "__main__":
    main()
