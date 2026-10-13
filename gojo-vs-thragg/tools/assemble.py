#!/usr/bin/env python3
"""Conform generated shot clips into the exact 240-second master.

  python3 tools/assemble.py --clips path/to/clips --out master.mp4 \
      [--audio final_mix.wav] [--fallback animatic/gojo_vs_thragg_animatic.mp4] \
      [--res 3840x2160] [--edl-only]

Clips are matched by shot id: <clips>/S3-04.mp4 (any of .mp4 .mov .webm .mkv).
For each shot, in shot-list order:
  * the clip is resampled to 24 fps, scaled to fill the target resolution
    (centre crop, never letterboxed/stretched), and cut to EXACTLY the shot's
    frame count. A clip that is too short is extended by holding its last
    frame - and reported, because that shot should be regenerated.
  * a missing clip is replaced by the same frames of the fallback animatic
    (or a slate if no fallback), so the master timeline never drifts.
The concatenated master is verified with ffprobe: 5760 frames, 240.000 s.
A CMX3600 EDL (master.edl) and a conform report are written next to it.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
FPS = 24
EXTS = (".mp4", ".mov", ".webm", ".mkv")


def tc(f):
    s, fr = divmod(f, FPS)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    return f"{h:02d}:{m:02d}:{s:02d}:{fr:02d}"


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write(r.stderr)
        raise SystemExit(f"command failed: {' '.join(cmd[:6])}...")
    return r.stdout


def probe_frames(path):
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
               "stream=nb_read_frames,r_frame_rate", "-of", "json", path])
    st = json.loads(out)["streams"][0]
    return int(st["nb_read_frames"]), st["r_frame_rate"]


def probe_duration(path):
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.strip())


def write_edl(shots, path, title):
    lines = [f"TITLE: {title}", "FCM: NON-DROP FRAME", ""]
    for i, s in enumerate(shots, 1):
        a, n = s["start_frame"], s["frames"]
        reel = s["id"].replace("-", "")[:8]
        lines.append(f"{i:03d}  {reel:<8} V     C        {tc(0)} {tc(n)} {tc(a)} {tc(a + n)}")
        lines.append(f"* FROM CLIP NAME: {s['id']}.mp4")
        lines.append(f"* COMMENT: {s.get('animatic_caption') or s.get('action', '')[:70]}")
        lines.append("")
    with open(path, "w") as f:
        f.write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", default=os.path.join(ROOT, "clips"))
    ap.add_argument("--out", default=os.path.join(ROOT, "master", "gojo_vs_thragg_master.mp4"))
    ap.add_argument("--audio", default=None)
    ap.add_argument("--fallback", default=os.path.join(ROOT, "animatic", "gojo_vs_thragg_animatic.mp4"))
    ap.add_argument("--res", default="3840x2160")
    ap.add_argument("--shotlist", default=os.path.join(ROOT, "data", "shotlist.json"))
    ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--edl-only", action="store_true")
    a = ap.parse_args()

    with open(a.shotlist) as f:
        sl = json.load(f)
    shots = sl["shots"]
    total = sum(s["frames"] for s in shots)
    assert total == sl["total_frames"] == 5760, f"shot list runs {total} frames, expected 5760"
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    edl = os.path.splitext(a.out)[0] + ".edl"
    write_edl(shots, edl, sl.get("title", "GOJO VS THRAGG"))
    print("wrote", edl)
    if a.edl_only:
        return

    W, H = a.res.split("x")
    vf_fill = f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},setsar=1"
    enc = ["-an", "-c:v", "libx264", "-preset", "medium", "-crf", str(a.crf), "-pix_fmt", "yuv420p",
           "-r", str(FPS), "-video_track_timescale", "24000"]
    tmp = tempfile.mkdtemp(prefix="conform_")
    report = []
    parts = []
    have_fallback = a.fallback and os.path.exists(a.fallback)
    for i, s in enumerate(shots):
        n = s["frames"]
        src = next((os.path.join(a.clips, s["id"] + e) for e in EXTS
                    if os.path.exists(os.path.join(a.clips, s["id"] + e))), None)
        out = os.path.join(tmp, f"{i:03d}_{s['id']}.mp4")
        if src:
            got, rate = probe_frames(src)
            # resample to 24 fps first, then hold the last frame if short, then cut exactly n
            vf = f"fps={FPS},{vf_fill},tpad=stop_mode=clone:stop={n},trim=end_frame={n},setpts=PTS-STARTPTS"
            run(["ffmpeg", "-y", "-v", "error", "-i", src, "-vf", vf, "-frames:v", str(n)] + enc + [out])
            dur_src = probe_duration(src)
            note = "ok"
            if dur_src * FPS < n - 0.5:
                note = f"SHORT: source {dur_src * FPS:.1f}f < {n}f, last frame held - regenerate"
            elif dur_src * FPS > n + 12:
                note = f"trimmed from {dur_src * FPS:.0f}f"
            report.append((s["id"], "clip", note))
        elif have_fallback:
            ss = s["start_frame"] / FPS
            vf = f"{vf_fill},trim=end_frame={n},setpts=PTS-STARTPTS"
            run(["ffmpeg", "-y", "-v", "error", "-ss", f"{ss:.6f}", "-i", a.fallback, "-vf", vf,
                 "-frames:v", str(n)] + enc + [out])
            report.append((s["id"], "animatic", "missing clip - animatic stand-in"))
        else:
            run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=0x101014:s={W}x{H}:r={FPS}",
                 "-vf", f"drawtext=text='{s['id']} MISSING':fontcolor=white:fontsize=96:x=(w-tw)/2:y=(h-th)/2",
                 "-frames:v", str(n)] + enc + [out])
            report.append((s["id"], "slate", "missing clip - slate"))
        got, _ = probe_frames(out)
        if got != n:
            raise SystemExit(f"{s['id']}: conformed to {got} frames, expected {n}")
        parts.append(out)
        print(f"  {s['id']:7s} {n:4d}f  {report[-1][1]:8s} {report[-1][2]}")
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w") as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    video = os.path.join(tmp, "video.mp4")
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])
    if a.audio:
        run(["ffmpeg", "-y", "-v", "error", "-i", video, "-i", a.audio, "-map", "0:v", "-map", "1:a",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-af", "apad,atrim=0:240", "-t", "240",
             "-movflags", "+faststart", a.out])
    else:
        shutil.copy(video, a.out)
    frames, rate = probe_frames(a.out)
    dur = probe_duration(a.out)
    ok = frames == 5760 and abs(dur - 240.0) < 0.05
    with open(os.path.splitext(a.out)[0] + "_conform_report.txt", "w") as f:
        f.write(f"master: {a.out}\nframes: {frames}  rate: {rate}  duration: {dur:.3f}s  {'PASS' if ok else 'FAIL'}\n\n")
        for r in report:
            f.write(f"{r[0]:8s} {r[1]:9s} {r[2]}\n")
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"master: {frames} frames @ {rate}, {dur:.3f}s -> {'PASS' if ok else 'FAIL'}")
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
