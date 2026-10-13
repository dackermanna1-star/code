#!/usr/bin/env python3
"""Validate data/shotlist.json against the production rules.

Hard errors (exit 1):
  * total runtime must be exactly 5760 frames (240.000 s @ 24 fps)
  * shots contiguous: no gaps, no overlaps, sorted, unique ids
  * each sequence covers exactly its mandated window (storyboard Phase 3)
  * every shot 6..240 frames (0.25 s .. 10 s - generator friendly)
  * sfx cue names exist in the temp-audio vocabulary, and land inside the shot
  * dialogue starts inside its shot
  * injuries never silently disappear between shots (only an explicit
    `healed` list - e.g. Gojo's Reverse Cursed Technique - may remove one)
  * required fields present
Warnings: slow-motion overuse, long dialogue, missing tactical notes on
combat shots, missing canon references on technique shots.
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(HERE, "animatic"))

FPS = 24
TOTAL = 5760
WINDOWS = {  # sequence -> (start_frame, end_frame) from the brief
    1: (0, 600), 2: (600, 1320), 3: (1320, 2160), 4: (2160, 3120),
    5: (3120, 3960), 6: (3960, 4800), 7: (4800, 5520), 8: (5520, 5760),
}
REQUIRED = ["id", "seq", "start_frame", "frames", "shot_size", "camera", "action", "characters",
            "prompt_core", "music", "continuity_out"]


def tc(f):
    s, fr = divmod(f, FPS)
    m, s = divmod(s, 60)
    return f"{m:02d}:{s:02d}:{fr:02d}"


def main(path=os.path.join(ROOT, "data", "shotlist.json")):
    with open(path) as f:
        sl = json.load(f)
    try:
        from audio import SFX
        vocab = set(SFX)
    except Exception:
        vocab = None
    errs, warns = [], []
    shots = sl["shots"]
    if sl.get("fps") != FPS:
        errs.append(f"fps must be {FPS}")
    if sl.get("total_frames") != TOTAL:
        errs.append(f"total_frames must be {TOTAL}")
    ids = [s["id"] for s in shots]
    if len(ids) != len(set(ids)):
        errs.append("duplicate shot ids")
    pos = 0
    for s in shots:
        for k in REQUIRED:
            if k not in s or s[k] in (None, ""):
                errs.append(f"{s.get('id')}: missing field {k}")
        if not re.fullmatch(r"S[1-8]-\d{2}[a-z]?", s["id"]):
            errs.append(f"{s['id']}: bad id format")
        if s["start_frame"] != pos:
            errs.append(f"{s['id']}: starts at {s['start_frame']} but previous shot ended at {pos} "
                        f"({'gap' if s['start_frame'] > pos else 'overlap'})")
        if not (6 <= s["frames"] <= 240):
            errs.append(f"{s['id']}: {s['frames']} frames outside 6..240")
        pos = s["start_frame"] + s["frames"]
        for e in s.get("sfx") or []:
            if vocab is not None and e["cue"] not in vocab:
                errs.append(f"{s['id']}: unknown sfx cue {e['cue']!r}")
            if not (0 <= e.get("at", 0) < s["frames"]):
                errs.append(f"{s['id']}: sfx {e['cue']} at {e.get('at')} outside shot")
        for d in s.get("dialogue") or []:
            if not (0 <= d.get("at_frame", 0) < s["frames"]):
                errs.append(f"{s['id']}: dialogue starts outside shot")
        m = s.get("music") or {}
        if not (0 <= float(m.get("intensity", 0.5)) <= 1):
            errs.append(f"{s['id']}: music intensity out of range")
        if s.get("impact_tier") in ("light", "heavy", "massive", "blocked") and not s.get("tactical"):
            warns.append(f"{s['id']}: combat shot without tactical intent/read/outcome/learned")
        if s.get("technique") and not s.get("canon_refs"):
            warns.append(f"{s['id']}: technique shot without canon_refs")
    if pos != TOTAL:
        errs.append(f"runtime is {pos} frames ({pos / FPS:.3f}s), must be {TOTAL} (240.000s)")
    # sequence windows
    for q, (a, b) in WINDOWS.items():
        qs = [s for s in shots if s["seq"] == q]
        if not qs:
            errs.append(f"sequence {q} has no shots")
            continue
        if qs[0]["start_frame"] != a or qs[-1]["start_frame"] + qs[-1]["frames"] != b:
            errs.append(f"sequence {q} spans {qs[0]['start_frame']}..{qs[-1]['start_frame'] + qs[-1]['frames']}, "
                        f"must be {a}..{b} ({tc(a)}-{tc(b)})")
    # injury continuity
    for who in ("gojo", "thragg"):
        prev = set()
        prev_id = None
        for s in shots:
            co = (s.get("continuity_out") or {}).get(who) or {}
            cur = set(co.get("injuries") or [])
            healed = set(co.get("healed") or [])
            lost = prev - cur - healed
            if lost:
                errs.append(f"{s['id']}: {who} injuries {sorted(lost)} vanished after {prev_id} without a 'healed' entry")
            prev, prev_id = cur, s["id"]
    slow = [s["id"] for s in shots if s.get("slow_motion")]
    if len(slow) > 4:
        warns.append(f"slow motion used in {len(slow)} shots ({slow}) - brief forbids repeated slow motion")
    for s in shots:
        for d in s.get("dialogue") or []:
            if len(d["line"].split()) > 14:
                warns.append(f"{s['id']}: long line ({len(d['line'].split())} words)")
    print(f"shots: {len(shots)}   runtime: {pos} frames = {pos / FPS:.3f}s")
    for q, (a, b) in WINDOWS.items():
        n = len([s for s in shots if s['seq'] == q])
        print(f"  seq {q}: {tc(a)}-{tc(b)}  {n} shots")
    for w in warns:
        print("WARN ", w)
    for e in errs:
        print("ERROR", e)
    print("OK" if not errs else f"{len(errs)} error(s)")
    return 1 if errs else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:]))
