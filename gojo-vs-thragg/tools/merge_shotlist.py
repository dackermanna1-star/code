#!/usr/bin/env python3
"""Merge data/seq/seq1.json .. seq8.json into data/shotlist.json.

Each data/seq/seqN.json holds {"sequence": {...}, "shots": [...]} for one
sequence, as written by the storyboard authors. This tool assigns absolute
start frames, attaches sequence windows and boundary states from
data/beats.json, and writes the single source of truth. Run
tools/validate.py afterwards.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
FPS = 24


def clean_state(st):
    st = dict(st or {})
    for k in ("eyes", "cape"):
        if st.get(k) in ("n/a", "", None):
            st.pop(k, None)
    st["injuries"] = list(dict.fromkeys(st.get("injuries") or []))
    if "healed" in st:
        st["healed"] = list(dict.fromkeys(st.get("healed") or []))
        if not st["healed"]:
            st.pop("healed")
    return st


def main():
    beats = json.load(open(os.path.join(ROOT, "data", "beats.json")))
    seqs, shots = [], []
    pos = 0
    for q in beats["sequences"]:
        path = os.path.join(ROOT, "data", "seq", f"seq{q['id']}.json")
        data = json.load(open(path))
        meta = data.get("sequence") or {}
        start = q["start_s"] * FPS
        end = q["end_s"] * FPS
        if pos != start:
            print(f"WARNING: sequence {q['id']} should start at {start} but previous material ends at {pos}")
        for i, s in enumerate(data["shots"]):
            s = dict(s)
            s["id"] = f"S{q['id']}-{i + 1:02d}"
            s["seq"] = q["id"]
            s["start_frame"] = pos
            co = s.get("continuity_out") or {}
            for who in ("gojo", "thragg"):
                if who in co:
                    co[who] = clean_state(co[who])
            s["continuity_out"] = co
            # keep a stable key order for readability
            order = ["id", "seq", "start_frame", "frames"]
            s = {k: s[k] for k in order if k in s} | {k: v for k, v in s.items() if k not in order}
            shots.append(s)
            pos += s["frames"]
        if pos != end:
            print(f"WARNING: sequence {q['id']} ends at frame {pos}, expected {end} "
                  f"({(pos - start)} frames vs {q['frames']})")
            pos = end if "--force-windows" in sys.argv else pos
        seqs.append({
            "id": q["id"], "title": q["title"], "start_frame": start, "end_frame": end,
            "objective": meta.get("objective") or q["objective"],
            "logic": meta.get("logic", ""),
            "music_cue": meta.get("music_cue") or q["music_cue"],
            "state_in": q["state_in"], "state_out": meta.get("state_out") or json.dumps(q["state_out"]),
        })
    first = beats["sequences"][0]["state_in"]
    out = {
        "title": "THE STRONGEST SORCERER VS. THE KING OF VILTRUMITES — Satoru Gojo vs. Grand Regent Thragg",
        "fps": FPS, "total_frames": 5760, "resolution": [3840, 2160], "aspect": "16:9",
        "rules": "docs/02-crossover-rules.md",
        "initial_state": {"gojo": clean_state(first["gojo"]), "thragg": clean_state(first["thragg"]), "env": first["env"]},
        "sequences": seqs,
        "shots": shots,
    }
    with open(os.path.join(ROOT, "data", "shotlist.json"), "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"merged {len(shots)} shots, {pos} frames ({pos / FPS:.3f}s)")


if __name__ == "__main__":
    main()
