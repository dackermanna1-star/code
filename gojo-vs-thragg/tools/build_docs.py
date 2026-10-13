#!/usr/bin/env python3
"""Generate the human-readable production documents and the per-shot
generation prompts from the single source of truth (data/shotlist.json +
data/bible.json).

Outputs
  docs/04-storyboard.md        shot-by-shot storyboard with exact timecodes
  docs/05-continuity-sheet.md  state of both fighters + city at every cut
  docs/06b-cue-sheet.md        frame-accurate SFX / music / dialogue cue sheet
  prompts/shot_prompts.md      one complete generator prompt per shot
  prompts/shots.jsonl          the same, machine-readable (id, frames, seconds, prompt, negative)

Prompts are COMPOSED, never hand-copied: every prompt embeds the same locked
style block, the same character reference blocks (plus that shot's injury
state from the continuity ledger), the same lighting block and negative
prompt. That is what keeps 90+ separately generated clips consistent.
"""
from __future__ import annotations

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
FPS = 24


def tc(f):
    s, fr = divmod(f, FPS)
    m, s = divmod(s, 60)
    return f"{m:02d}:{s:02d}:{fr:02d}"


def secs(n):
    return f"{n / FPS:.3f}s"


def load():
    with open(os.path.join(ROOT, "data", "shotlist.json")) as f:
        sl = json.load(f)
    with open(os.path.join(ROOT, "data", "bible.json")) as f:
        bible = json.load(f)
    return sl, bible


def char_state_text(bible, who, state):
    if not state:
        return ""
    parts = []
    inj = state.get("injuries") or []
    txt = bible.get("injury_text", {})
    if inj:
        parts.append("visible injuries: " + "; ".join(txt.get(i, i.replace("_", " ")) for i in inj))
    if state.get("eyes") and who == "gojo":
        parts.append(bible["characters"]["gojo"].get("eyes_variants", {}).get(state["eyes"], f"eyes: {state['eyes']}"))
    if state.get("cape") and who == "thragg":
        parts.append(bible["characters"]["thragg"].get("cape_variants", {}).get(state["cape"], f"cape: {state['cape']}"))
    if state.get("condition"):
        parts.append("condition: " + state["condition"])
    return "; ".join(parts)


def compose_prompt(sl, bible, i):
    s = sl["shots"][i]
    prev = sl["shots"][i - 1] if i > 0 else None
    co_in = (prev or {}).get("continuity_out") or sl.get("initial_state") or {}
    co_out = s.get("continuity_out") or {}
    lines = []
    lines.append(f"[{s['id']} | {s['frames']} frames = {secs(s['frames'])} @ 24 fps | 16:9, 3840x2160 | "
                 f"timeline {tc(s['start_frame'])}-{tc(s['start_frame'] + s['frames'])}]")
    lines.append("STYLE: " + bible["style_block"])
    lines.append("LIGHTING: " + bible["lighting_block"])
    loc = s.get("location")
    if loc:
        lines.append("LOCATION: " + bible["locations"].get(loc, loc) +
                     (f" Current damage: {co_in.get('env')}." if co_in.get("env") else ""))
    for who in s.get("characters") or []:
        cb = bible["characters"][who]
        st = char_state_text(bible, who, (co_in or {}).get(who) or {})
        lines.append(f"{cb['name'].upper()}: {cb['block']}" + (f" At the start of this shot - {st}." if st else ""))
    lines.append(f"CAMERA: {s['shot_size']}; {s.get('angle', '')}; {s.get('lens_mm', '')}mm lens; {s['camera']}.")
    lines.append("ACTION: " + s["prompt_core"])
    if s.get("vfx"):
        lines.append("EFFECTS: " + "; ".join(s["vfx"]) + ".")
    if s.get("slow_motion"):
        lines.append("TIMING: this is the film's designated slow-motion shot; keep motion continuous, no frame blending.")
    end = []
    for who in s.get("characters") or []:
        st = co_out.get(who) or {}
        if st.get("pos"):
            end.append(f"{bible['characters'][who]['name']} ends {st['pos']}" + (f", facing {st['facing']}" if st.get("facing") else ""))
    if end:
        lines.append("END FRAME: " + "; ".join(end) + ".")
    lines.append("NEGATIVE: " + bible["negative_prompt"])
    return "\n".join(lines)


def main():
    sl, bible = load()
    shots = sl["shots"]
    seqs = {q["id"]: q for q in sl["sequences"]}
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "prompts"), exist_ok=True)

    # ---------------- storyboard
    out = ["# 04 — Storyboard (exact 240-second timeline)", "",
           "_Generated from `data/shotlist.json` by `tools/build_docs.py`. Timecodes are MM:SS:FF at 24 fps; "
           "OUT is exclusive (the next shot's IN). Do not edit by hand._", ""]
    out.append("| Seq | Window | Shots | Objective |")
    out.append("|---|---|---|---|")
    for q in sl["sequences"]:
        n = len([s for s in shots if s["seq"] == q["id"]])
        out.append(f"| {q['id']} — {q['title']} | {tc(q['start_frame'])}–{tc(q['end_frame'])} | {n} | {q.get('objective', '')} |")
    out.append("")
    for q in sl["sequences"]:
        out.append(f"## Sequence {q['id']} — {q['title']}  ·  {tc(q['start_frame'])}–{tc(q['end_frame'])} "
                   f"({(q['end_frame'] - q['start_frame']) / FPS:.0f} s)")
        out.append("")
        if q.get("objective"):
            out.append(f"**Objective:** {q['objective']}  ")
        if q.get("logic"):
            out.append(f"**Tactical logic:** {q['logic']}  ")
        if q.get("music_cue"):
            out.append(f"**Music:** {q['music_cue']}")
        out.append("")
        for s in [s for s in shots if s["seq"] == q["id"]]:
            a = s["start_frame"]
            out.append(f"### {s['id']}  ·  {tc(a)} → {tc(a + s['frames'])}  ·  {s['frames']}f ({secs(s['frames'])})")
            out.append("")
            out.append(f"- **Shot:** {s['shot_size']} · {s.get('angle', '')} · {s.get('lens_mm', '')}mm · {s['camera']}")
            if s.get("screen_direction"):
                out.append(f"- **Screen direction:** {s['screen_direction']}")
            out.append(f"- **Action:** {s['action']}")
            t = s.get("tactical")
            if t:
                out.append(f"- **Tactics:** intent — {t.get('intent', '')} · read — {t.get('read', '')} · "
                           f"outcome — {t.get('outcome', '')} · learned — {t.get('learned', '')}")
            for d in s.get("dialogue") or []:
                out.append(f"- **Dialogue** (f{d.get('at_frame', 0)}): {d['speaker'].upper()} — “{d['line']}”")
            if s.get("animation_notes"):
                out.append(f"- **Animation:** {s['animation_notes']}")
            if s.get("vfx"):
                out.append(f"- **VFX:** {'; '.join(s['vfx'])}")
            if s.get("impact_tier") and s["impact_tier"] != "none":
                out.append(f"- **Impact tier:** {s['impact_tier']}")
            if s.get("sfx"):
                out.append("- **SFX:** " + ", ".join(f"{e['cue']}@f{e.get('at', 0)}" for e in s["sfx"]))
            m = s.get("music") or {}
            out.append(f"- **Music:** intensity {m.get('intensity', '')}" + (f", {m['event']}@f{m.get('at', 0)}" if m.get("event") else "")
                       + (f" — {m['note']}" if m.get("note") else ""))
            if s.get("canon_refs"):
                out.append(f"- **Canon basis:** {', '.join(s['canon_refs'])}")
            if s.get("slow_motion"):
                out.append("- **Slow motion:** yes (designated)")
            out.append("")
    with open(os.path.join(ROOT, "docs", "04-storyboard.md"), "w") as f:
        f.write("\n".join(out))

    # ---------------- continuity sheet
    out = ["# 05 — Continuity Sheet", "",
           "_State at the END of every shot (the next shot starts from it). Generated from `data/shotlist.json`; "
           "`tools/validate.py` fails the build if an injury disappears without an explicit `healed` entry._", ""]
    for q in sl["sequences"]:
        out.append(f"## Sequence {q['id']} — {q['title']}")
        out.append("")
        if q.get("state_out"):
            out.append(f"**Boundary state at {tc(q['end_frame'])}:** {q['state_out']}")
            out.append("")
        out.append("| Shot | Gojo (position · facing · eyes · condition · injuries) | Thragg (position · facing · condition · injuries) | City / environment |")
        out.append("|---|---|---|---|")
        for s in [s for s in shots if s["seq"] == q["id"]]:
            co = s.get("continuity_out") or {}

            def cell(who):
                c = co.get(who) or {}
                bits = [c.get("pos", "—"), c.get("facing", "")]
                if who == "gojo":
                    bits.append(c.get("eyes", ""))
                bits.append(c.get("condition", ""))
                inj = c.get("injuries") or []
                bits.append("inj: " + (", ".join(inj) if inj else "none"))
                if c.get("healed"):
                    bits.append("HEALED: " + ", ".join(c["healed"]))
                if c.get("techniques_used"):
                    bits.append("used: " + ", ".join(c["techniques_used"]))
                return " · ".join(b for b in bits if b)
            out.append(f"| {s['id']} {tc(s['start_frame'] + s['frames'])} | {cell('gojo')} | {cell('thragg')} | {co.get('env', '')} |")
        out.append("")
    with open(os.path.join(ROOT, "docs", "05-continuity-sheet.md"), "w") as f:
        f.write("\n".join(out))

    # ---------------- cue sheet
    out = ["# 06b — Cue Sheet (frame-accurate)", "",
           "_Every sound effect, music event and line of dialogue with its absolute timecode. Generated from "
           "`data/shotlist.json`. Cue names map to the temp-audio synths in `tools/animatic/audio.py`; the final "
           "mix replaces them one-for-one (see 06-sound-design.md)._", ""]
    out.append("| Timecode | Shot | Type | Cue | Notes |")
    out.append("|---|---|---|---|---|")
    for s in shots:
        evs = []
        for e in s.get("sfx") or []:
            evs.append((s["start_frame"] + e.get("at", 0), "SFX", e["cue"], e.get("note", f"gain {e.get('gain', 0.8)}")))
        m = s.get("music") or {}
        if m.get("event"):
            evs.append((s["start_frame"] + m.get("at", 0), "MUSIC", m["event"], m.get("note", "")))
        for d in s.get("dialogue") or []:
            evs.append((s["start_frame"] + d.get("at_frame", 0), "DIALOGUE", d["speaker"], f"“{d['line']}”"))
        for gf, typ, cue, note in sorted(evs):
            out.append(f"| {tc(gf)} | {s['id']} | {typ} | `{cue}` | {note} |")
    with open(os.path.join(ROOT, "docs", "06b-cue-sheet.md"), "w") as f:
        f.write("\n".join(out))

    # ---------------- prompts
    md = ["# Shot Generation Prompts", "",
          "_One complete prompt per shot, composed by `tools/build_docs.py` from the locked bible blocks in "
          "`data/bible.json` and the continuity ledger. Generate each shot at (or trim to) the stated frame count; "
          "`tools/assemble.py` conforms and concatenates them to exactly 240.000 s. Use the character reference "
          "sheets described in docs/03-character-bible.md as image references for every shot._", ""]
    with open(os.path.join(ROOT, "prompts", "shots.jsonl"), "w") as jf:
        for i, s in enumerate(shots):
            p = compose_prompt(sl, bible, i)
            md.append(f"## {s['id']} — {tc(s['start_frame'])} ({s['frames']}f)")
            md.append("")
            md.append("```text")
            md.append(p)
            md.append("```")
            md.append("")
            jf.write(json.dumps({"id": s["id"], "start_frame": s["start_frame"], "frames": s["frames"],
                                 "seconds": round(s["frames"] / FPS, 4), "timecode_in": tc(s["start_frame"]),
                                 "prompt": p, "negative_prompt": bible["negative_prompt"],
                                 "characters": s.get("characters") or []}) + "\n")
    with open(os.path.join(ROOT, "prompts", "shot_prompts.md"), "w") as f:
        f.write("\n".join(md))
    print(f"built docs for {len(shots)} shots")


if __name__ == "__main__":
    main()
