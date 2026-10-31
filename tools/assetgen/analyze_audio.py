"""Objective checks + spectrogram previews for the generated OGG files.

usage: python3 analyze_audio.py [subdir-filter ...]
Writes spectrogram contact sheets to the scratch preview folder.
"""
from __future__ import annotations

import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import dsp as D
import texlib as T

SND = D.Path(__file__).resolve().parents[2] / "src/main/resources/assets/jjkshowdown/sounds"
LOOPS = {"gojo/blue_loop", "gojo/void_ambient", "sukuna/shrine_ambient", "domain/clash",
         "music/battle_gojo", "music/battle_sukuna", "music/unlimited_void", "music/malevolent_shrine"}


def centroid(x):
    m = x if x.ndim == 1 else x.mean(axis=1)
    X = np.abs(np.fft.rfft(m * np.hanning(len(m))))
    f = np.fft.rfftfreq(len(m), 1 / D.SR)
    return float((X * f).sum() / max(X.sum(), 1e-12))


def loop_seam(x):
    """Seam check on the wrapped signal: boundary step vs local steps, and HF-energy spike of the
    frame straddling the boundary vs its neighbours.  ~<=1 and ~<=+1.5 dB mean seamless."""
    m = x if x.ndim == 1 else x.mean(axis=1)
    w = D.ns(0.01)
    wrap = np.concatenate([m[-w:], m[:w]])
    steps = np.abs(np.diff(wrap))
    step = steps[w - 1]
    local = np.percentile(np.delete(steps, w - 1), 99) + 1e-12
    hp = D.highpass(np.concatenate([m[-D.ns(0.2):], m[:D.ns(0.2)]]), 5000, 4, minphase=False)
    c = D.ns(0.2)
    fr = 256

    def e(center):
        seg = hp[center - fr // 2:center + fr // 2]
        return np.mean(seg ** 2) + 1e-15
    neigh = max(e(c + k * fr) for k in (-6, -4, -3, 3, 4, 6))
    spike = 10 * np.log10(e(c) / neigh)
    return step / local, spike


def spectrogram_img(x, w=520, h=150, label=""):
    m = x if x.ndim == 1 else x.mean(axis=1)
    win = 1024
    hop = max(64, len(m) // w)
    frames = []
    for s in range(0, max(1, len(m) - win), hop):
        seg = m[s:s + win]
        if len(seg) < win:
            seg = np.pad(seg, (0, win - len(seg)))
        frames.append(np.abs(np.fft.rfft(seg * np.hanning(win))))
    S = np.array(frames).T  # (freq, time)
    f = np.fft.rfftfreq(win, 1 / D.SR)
    # log-frequency axis 30 Hz .. 20 kHz
    fl = np.geomspace(30, 20000, h)
    rows = np.array([S[np.argmin(np.abs(f - ff))] for ff in fl])[::-1]
    db = 20 * np.log10(rows + 1e-9)
    db = np.clip((db - (db.max() - 80)) / 80, 0, 1)
    img = (np.stack([db ** 0.8, db ** 1.6, 0.25 + 0.6 * db ** 3], -1) * 255).astype(np.uint8)
    im = Image.fromarray(img).resize((w, h), Image.NEAREST)
    # waveform envelope strip
    env_h = 40
    env = Image.new("RGB", (w, env_h), (20, 20, 26))
    d = ImageDraw.Draw(env)
    blk = max(1, len(m) // w)
    for i in range(w):
        seg = m[i * blk:(i + 1) * blk]
        if len(seg) == 0:
            continue
        a = float(np.max(np.abs(seg)))
        d.line([(i, env_h / 2 - a * env_h / 2), (i, env_h / 2 + a * env_h / 2)], fill=(120, 220, 160))
    out = Image.new("RGB", (w, h + env_h + 14), (12, 12, 16))
    out.paste(env, (0, 14))
    out.paste(im, (0, 14 + env_h))
    ImageDraw.Draw(out).text((2, 1), label, fill=(240, 240, 240), font=ImageFont.load_default())
    return out


def analyze(filters=None, sheet_name="audio"):
    rows = []
    tiles = []
    for p in sorted(SND.rglob("*.ogg")):
        rel = str(p.relative_to(SND))[:-4]
        if filters and not any(f in rel for f in filters):
            continue
        x, sr, ch = D.decode(p)
        dur = len(x) / sr
        peak = D.to_db(np.max(np.abs(x)))
        dc = float(np.mean(x))
        clip = int(np.sum(np.abs(x) >= 0.999))
        cen = centroid(x)
        rms = D.to_db(np.sqrt(np.mean(x ** 2)))
        loud = D.lufs(x)
        mmax = D.momentary_max(x)
        seam = ""
        if rel in LOOPS:
            a_, sp = loop_seam(x)
            seam = f" seam step/local99={a_:4.2f} hf_spike={sp:+5.2f}dB"
        rows.append(f"{rel:30s} ch={ch} sr={sr} dur={dur:6.2f}s peak={peak:6.2f} dc={dc:+.5f} clip={clip} "
                    f"centroid={cen:7.0f}Hz lufs={loud:6.1f} Mmax={mmax:6.1f}{seam}")
        tiles.append(spectrogram_img(x, label=f"{rel}  {dur:.2f}s  {cen:.0f}Hz  {loud:.1f}LUFS"))
    print("\n".join(rows))
    if tiles:
        cols = 3
        W = tiles[0].width
        H = tiles[0].height
        nrows = (len(tiles) + cols - 1) // cols
        for page in range(0, nrows, 6):
            sheet = Image.new("RGB", (cols * (W + 6), min(6, nrows - page) * (H + 6)), (0, 0, 0))
            for i, tile in enumerate(tiles[page * cols:(page + 6) * cols]):
                sheet.paste(tile, ((i % cols) * (W + 6), (i // cols) * (H + 6)))
            out = T.SCRATCH / f"preview/{sheet_name}_{page // 6}.png"
            sheet.save(out)
    return rows


if __name__ == "__main__":
    analyze(sys.argv[1:] or None)
