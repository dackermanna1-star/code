#!/usr/bin/env python3
"""Render the animatic from data/shotlist.json.

  python3 render.py                       # full 240 s animatic with captions + temp audio
  python3 render.py --clean               # no caption overlay
  python3 render.py --shots S3-01,S3-02   # only some shots (mp4 of just those)
  python3 render.py --sheet S3 --out s3.png   # contact sheet: 3 stills per shot (QA)
  python3 render.py --still S3-04:12 --out f.png   # one frame (shot:frame)

Every shot in the shot list is rendered for exactly its frame count. A shot
without a scene function gets a placeholder storyboard card, so the animatic's
timing ALWAYS matches the shot list.
"""
from __future__ import annotations

import argparse
import importlib
import json
import math
import multiprocessing as mp
import os
import subprocess
import sys
import textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

from PIL import Image, ImageDraw  # noqa: E402

import engine  # noqa: E402
from engine import FPS, OUT_H, OUT_W, Frame, font  # noqa: E402

SHOTLIST = os.path.join(ROOT, "data", "shotlist.json")


def load_shotlist(path=SHOTLIST):
    with open(path) as f:
        return json.load(f)


_SCENES = None


def scenes():
    global _SCENES
    if _SCENES is None:
        _SCENES = {}
        for i in range(1, 9):
            try:
                m = importlib.import_module(f"scenes.seq{i}")
            except ModuleNotFoundError:
                continue
            _SCENES.update(getattr(m, "SHOTS", {}))
    return _SCENES


def tc(gf: int) -> str:
    s, f = divmod(gf, FPS)
    m, s = divmod(s, 60)
    return f"{m:02d}:{s:02d}:{f:02d}"


def placeholder(fr: Frame):
    """Storyboard card for shots without a scene function."""
    sh = fr.shot
    fr.draw.rectangle([0, 0, fr.W, fr.H], fill=(26, 24, 32))
    d = fr.draw
    ss = fr.ss
    d.text((80 * ss, 80 * ss), f"{sh['id']}  ·  {sh.get('shot_size', '')}  ·  {sh.get('camera', '')[:80]}",
           font=font(int(34 * ss), "SemiBold"), fill=(230, 230, 240))
    body = textwrap.fill(sh.get("action", ""), 70)
    d.multiline_text((80 * ss, 160 * ss), body, font=font(int(30 * ss)), fill=(200, 200, 210), spacing=int(10 * ss))


def caption(img: Image.Image, shot: dict, gf: int, seq_title: str, f_in_shot: int):
    d = ImageDraw.Draw(img, "RGBA")
    f1 = font(22, "SemiBold")
    f2 = font(20)
    # top-left: timecode + sequence
    d.rectangle([0, 0, 640, 36], fill=(0, 0, 0, 150))
    d.text((12, 7), f"{tc(gf)}   SEQ {shot['seq']} · {seq_title.upper()}", font=f1, fill=(240, 240, 240, 255))
    # bottom: shot id, size/camera, action summary
    d.rectangle([0, OUT_H - 64, OUT_W, OUT_H], fill=(0, 0, 0, 160))
    line1 = f"{shot['id']}  [{shot.get('shot_size', '')}]  {shot['frames']}f"
    d.text((12, OUT_H - 58), line1, font=f1, fill=(255, 210, 120, 255))
    summ = shot.get("animatic_caption") or shot.get("action", "")
    summ = summ if len(summ) < 150 else summ[:147] + "..."
    d.text((12, OUT_H - 30), summ, font=f2, fill=(230, 230, 230, 255))
    # dialogue subtitle (animatic only - the final film carries no subtitles)
    for dl in shot.get("dialogue", []) or []:
        a = dl.get("at_frame", 0)
        if a <= f_in_shot < a + dl.get("frames", 60):
            txt = f"{dl['speaker'].upper()}: “{dl['line']}”"
            fb = font(34, "SemiBold")
            w = d.textlength(txt, font=fb)
            d.rectangle([(OUT_W - w) / 2 - 16, OUT_H - 140, (OUT_W + w) / 2 + 16, OUT_H - 90], fill=(0, 0, 0, 170))
            d.text(((OUT_W - w) / 2, OUT_H - 135), txt, font=fb, fill=(255, 255, 255, 255))


_CTX = {}


def _init(shotlist_path, ss, clean):
    _CTX["sl"] = load_shotlist(shotlist_path)
    _CTX["ss"] = ss
    _CTX["clean"] = clean
    _CTX["seq_titles"] = {s["id"]: s["title"] for s in _CTX["sl"]["sequences"]}
    _CTX["by_id"] = {s["id"]: s for s in _CTX["sl"]["shots"]}


def render_frame(job):
    shot_id, f = job
    shot = _CTX["by_id"][shot_id]
    fr = Frame(shot, f, ss=_CTX["ss"])
    fn = scenes().get(shot_id)
    try:
        if fn is None:
            placeholder(fr)
        else:
            fn(fr)
        img = fr.finish()
    except Exception as e:  # never let one bad frame kill a 5760-frame render
        import traceback
        traceback.print_exc()
        fr2 = Frame(shot, f, ss=1.0)
        fr2.draw.rectangle([0, 0, fr2.W, fr2.H], fill=(80, 0, 0))
        fr2.draw.text((40, 40), f"RENDER ERROR {shot_id} f{f}: {e}", font=font(30), fill=(255, 255, 255))
        img = fr2.finish()
    if not _CTX["clean"]:
        caption(img, shot, shot["start_frame"] + f, _CTX["seq_titles"].get(shot["seq"], ""), f)
    return img.tobytes()


def jobs_for(shots):
    for s in shots:
        for f in range(s["frames"]):
            yield (s["id"], f)


def encode(shots, out, ss, clean, workers, audio=None, shotlist_path=SHOTLIST, crf=20):
    total = sum(s["frames"] for s in shots)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OUT_W}x{OUT_H}",
           "-r", str(FPS), "-i", "-"]
    if audio:
        cmd += ["-i", audio, "-c:a", "aac", "-b:a", "192k", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p", "-r", str(FPS),
            "-movflags", "+faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    done = 0
    with mp.Pool(workers, initializer=_init, initargs=(shotlist_path, ss, clean)) as pool:
        for buf in pool.imap(render_frame, jobs_for(shots), chunksize=2):
            proc.stdin.write(buf)
            done += 1
            if done % 240 == 0 or done == total:
                print(f"  {done}/{total} frames ({done / FPS:.1f}s)", flush=True)
    proc.stdin.close()
    proc.wait()
    if proc.returncode:
        raise SystemExit(f"ffmpeg failed ({proc.returncode})")


def sheet(shots, out, ss, per_shot=3, thumb_w=480):
    _init(SHOTLIST, ss, True)
    th = int(thumb_w * OUT_H / OUT_W)
    cols = per_shot
    rows = len(shots)
    W = cols * thumb_w + 260
    H = rows * (th + 8)
    canvas = Image.new("RGB", (W, H), (12, 12, 16))
    d = ImageDraw.Draw(canvas)
    for r, s in enumerate(shots):
        d.text((8, r * (th + 8) + 8), f"{s['id']}\n{s['frames']}f\n{s.get('shot_size', '')}", font=font(20, "SemiBold"),
               fill=(240, 220, 160))
        n = s["frames"]
        picks = [0, n // 2, n - 1] if per_shot == 3 else [int(i * (n - 1) / max(1, per_shot - 1)) for i in range(per_shot)]
        for c, f in enumerate(picks):
            buf = render_frame((s["id"], f))
            img = Image.frombytes("RGB", (OUT_W, OUT_H), buf).resize((thumb_w, th), Image.BILINEAR)
            canvas.paste(img, (260 + c * thumb_w, r * (th + 8)))
            d.text((260 + c * thumb_w + 6, r * (th + 8) + 4), f"f{f}", font=font(16), fill=(255, 255, 0))
    canvas.save(out)
    print("wrote", out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "animatic", "gojo_vs_thragg_animatic.mp4"))
    ap.add_argument("--ss", type=float, default=1.5, help="supersample factor (1 = fast draft)")
    ap.add_argument("--clean", action="store_true")
    ap.add_argument("--shots", default=None, help="comma list of shot ids, or a sequence prefix like S3")
    ap.add_argument("--sheet", default=None, help="contact sheet for shot ids/prefix")
    ap.add_argument("--still", default=None, help="SHOT:FRAME")
    ap.add_argument("--workers", type=int, default=max(1, os.cpu_count() - 0))
    ap.add_argument("--no-audio", action="store_true")
    ap.add_argument("--shotlist", default=SHOTLIST)
    a = ap.parse_args()
    sl = load_shotlist(a.shotlist)
    shots = sl["shots"]

    def pick(spec):
        ids = spec.split(",")
        return [s for s in shots if any(s["id"] == i or s["id"].startswith(i + "-") for i in ids)]

    if a.still:
        sid, f = a.still.split(":")
        _init(a.shotlist, a.ss, a.clean)
        buf = render_frame((sid, int(f)))
        Image.frombytes("RGB", (OUT_W, OUT_H), buf).save(a.out)
        print("wrote", a.out)
        return
    if a.sheet:
        sheet(pick(a.sheet), a.out, a.ss)
        return
    sel = pick(a.shots) if a.shots else shots
    audio = None
    if not a.no_audio and not a.shots:
        import audio as audio_mod
        audio = os.path.join(ROOT, "animatic", "temp_mix.wav")
        audio_mod.build(sl, audio)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    encode(sel, a.out, a.ss, a.clean, a.workers, audio, a.shotlist)
    print("wrote", a.out)


if __name__ == "__main__":
    main()
