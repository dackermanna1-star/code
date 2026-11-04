"""Assemble rendered frames + soundtrack into the final film.

Adds 2.39:1 letterboxing in a 1280x720 frame, vignette, light film grain, dip/flash transitions,
the opening title and the end card (drawn with an original blocky pixel font), then muxes the audio.
usage: python3 tools/assemble.py [--out FILE] [--preview]  (missing frames hold the previous one)
"""
import argparse
import os
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from mcfilm import timeline as tl  # noqa: E402

W, H = 1280, 720
FW, FH = 1280, 536
Y0 = (H - FH) // 2
FPS = tl.FPS

FONT = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00001", "00001", "00001", "00001", "10001", "01110"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    ".": ["0", "0", "0", "0", "0", "0", "1"],
    "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
    ":": ["0", "1", "0", "0", "0", "1", "0"],
    " ": ["000", "000", "000", "000", "000", "000", "000"],
}


def text_mask(txt, scale):
    cols = []
    for ch in txt:
        g = FONT[ch]
        a = np.array([[c == "1" for c in row] for row in g], bool)
        cols.append(a)
        cols.append(np.zeros((7, 1), bool))
    m = np.concatenate(cols[:-1], axis=1)
    return np.kron(m, np.ones((scale, scale), bool))


def draw_text(canvas_rgba, txt, scale, cx, cy, color, shadow=(0.15, 0.15, 0.15), shadow_off=None, texture=False,
              seed=0):
    m = text_mask(txt, scale)
    h, w = m.shape
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    so = shadow_off if shadow_off is not None else max(2, scale // 2)
    rng = np.random.default_rng(seed)
    # shadow
    sl = canvas_rgba[y0 + so:y0 + so + h, x0 + so:x0 + so + w]
    sl[m] = (*shadow, 1.0)
    sl = canvas_rgba[y0:y0 + h, x0:x0 + w]
    col = np.ones((h, w, 3)) * np.array(color)
    if texture:
        blocks = rng.uniform(0.75, 1.1, size=(h // scale + 1, w // scale + 1))
        col *= np.kron(blocks, np.ones((scale, scale)))[:h, :w, None]
        grad = np.linspace(1.15, 0.75, h)[:, None, None]
        col *= grad
    sl[m, :3] = np.clip(col[m], 0, 1)
    sl[m, 3] = 1.0
    return canvas_rgba


def title_card():
    c = np.zeros((H, W, 4))
    draw_text(c, "MINECRAFT", 11, W / 2, H / 2 - 40, (0.72, 0.72, 0.74), shadow=(0.08, 0.08, 0.1), shadow_off=7,
              texture=True, seed=3)
    draw_text(c, "JOURNEY TO THE FAR LANDS", 4, W / 2, H / 2 + 50, (1.0, 0.86, 0.25), shadow=(0.25, 0.2, 0.05))
    return c


def end_card(line):
    c = np.zeros((H, W, 4))
    if line == 1:
        draw_text(c, "THE END...", 6, W / 2, H / 2 - 32, (0.95, 0.95, 0.95), shadow=(0.25, 0.25, 0.25))
    else:
        draw_text(c, "OR THE BEGINNING?", 6, W / 2, H / 2 + 34, (0.95, 0.95, 0.95), shadow=(0.25, 0.25, 0.25))
    return c


def vignette():
    yy, xx = np.mgrid[0:FH, 0:FW]
    r = np.sqrt(((xx - FW / 2) / (FW / 2)) ** 2 + ((yy - FH / 2) / (FH / 1.6)) ** 2)
    return np.clip(1 - 0.32 * np.clip(r - 0.45, 0, None) ** 1.6, 0, 1)[..., None]


def transitions():
    """Return list of (time, kind, half_duration)."""
    S = tl.start_time
    return [
        (S("B1"), "dip", 0.18), (S("C1"), "dip", 0.45), (S("C8"), "dip", 0.3), (S("D1"), "flash", 0.25),
        (S("D4"), "dip", 0.15), (S("D6"), "dip", 0.15), (S("D8"), "dip", 0.2), (S("E1"), "dip", 0.3),
        (S("F1"), "dip", 0.5),
    ]


def gain_at(t, trans):
    g, add = 1.0, 0.0
    if t < 1.2:
        g *= t / 1.2
    for (tc, kind, hd) in trans:
        d = abs(t - tc)
        if d < hd:
            k = 1 - d / hd
            if kind == "dip":
                g *= 1 - k
            else:
                add = max(add, k)
    return g, add


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "build", "Minecraft_Journey_to_the_Far_Lands.mp4"))
    ap.add_argument("--frames", default=os.path.join(ROOT, "build", "frames"))
    ap.add_argument("--audio", default=os.path.join(ROOT, "build", "audio", "film_audio.wav"))
    ap.add_argument("--crf", default="19")
    ap.add_argument("--range", default=None, help="t0:t1 seconds (preview a portion)")
    a = ap.parse_args()

    total = tl.total_frames()
    f_render_end = tl.frames()["G3"][1]
    t_end_card = tl.start_time("G4")
    f_a, f_b = 1, total
    if a.range:
        t0, t1 = (float(x) for x in a.range.split(":"))
        f_a, f_b = int(t0 * FPS) + 1, min(total, int(t1 * FPS))
    vig = vignette()
    title = title_card()
    e1, e2 = end_card(1), end_card(2)
    trans = transitions()
    rng = np.random.default_rng(1)
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-"]
    if os.path.exists(a.audio):
        cmd += ["-ss", f"{(f_a - 1) / FPS:.4f}", "-i", a.audio, "-c:a", "aac", "-b:a", "192k"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", a.crf, "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-shortest", a.out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    last = np.zeros((FH, FW, 3), np.float32)
    missing = 0
    for f in range(f_a, f_b + 1):
        t = (f - 1) / FPS
        canvas = np.zeros((H, W, 3), np.float32)
        if f <= f_render_end:
            path = os.path.join(a.frames, f"{f:05d}.png")
            if os.path.exists(path):
                img = np.asarray(Image.open(path).convert("RGB"), np.float32) / 255.0
                if img.shape[:2] != (FH, FW):
                    img = np.asarray(Image.fromarray((img * 255).astype(np.uint8)).resize((FW, FH), Image.BILINEAR),
                                     np.float32) / 255.0
                last = img
            else:
                missing += 1
                img = last
            g, add = gain_at(t, trans)
            img = img * vig * g + add
            img = img + rng.normal(0, 0.012, size=(FH, FW, 1)).astype(np.float32)
            canvas[Y0:Y0 + FH] = np.clip(img, 0, 1)
        # opening title over the sunrise aerial
        if 1.0 <= t <= 6.6:
            al = min(1, (t - 1.0) / 0.9, (6.6 - t) / 0.9)
            m = title[..., 3:4] * al
            canvas = canvas * (1 - m) + title[..., :3] * m
        if t >= t_end_card:
            tt = t - t_end_card
            for card, ts in ((e1, 0.8), (e2, 2.2)):
                al = np.clip((tt - ts) / 1.0, 0, 1) * np.clip((tl.total_frames() / FPS - t) / 0.8, 0, 1)
                m = card[..., 3:4] * al
                canvas = canvas * (1 - m) + card[..., :3] * m
        p.stdin.write((canvas * 255 + 0.5).astype(np.uint8).tobytes())
    p.stdin.close()
    p.wait()
    print(f"wrote {a.out}  (frames {f_a}-{f_b}, {missing} missing frames held)")


if __name__ == "__main__":
    main()
