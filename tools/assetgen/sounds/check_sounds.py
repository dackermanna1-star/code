#!/usr/bin/env python3
"""Verify the generated CaliberCraft sound set against the spec (README.md in this folder).

    python3 tools/assetgen/sounds/check_sounds.py

Checks (exit code 1 on any failure):
  * sounds.json is valid JSON and contains exactly the spec's events, variant counts, file names,
    attenuation distances and subtitle keys (UI events without subtitle)
  * every referenced .ogg exists, no unreferenced .ogg files are lying around
  * every subtitle key has English text in subtitles_en_us.json
  * every file is Ogg Vorbis, mono, 44.1 kHz (ffprobe)
  * decoded audio: no clipping, no DC offset, starts from silence, ends faded out,
    duration inside the spec range, peak level inside the category's window
  * total size budget
Prints a per-category level summary table.

The expected event table below is written out independently of generate_sounds.py on purpose.
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
ASSETS = REPO / "src" / "main" / "resources" / "assets" / "calibercraft"
SOUND_DIR = ASSETS / "sounds"
SOUNDS_JSON = ASSETS / "sounds.json"
SUBTITLES_JSON = HERE / "subtitles_en_us.json"
NS = "calibercraft"
SR = 44100
SIZE_BUDGET_MB = 12.0

WEAPON_MECH = {
    "m9": "mag_out mag_in slide_back slide_release",
    "revolver": "cylinder_open eject speedloader cylinder_close hammer",
    "vector9": "mag_out mag_in charge",
    "mp5": "mag_out mag_in charge_back charge_slap",
    "ar15": "mag_out mag_in charge bolt_release",
    "ak": "mag_out mag_in charge",
    "bullpup": "mag_out mag_in charge",
    "pump_shotgun": "pump_back pump_forward shell_insert",
    "auto_shotgun": "mag_out mag_in charge",
    "sniper": "bolt_up bolt_back bolt_forward bolt_down mag_out mag_in",
    "dmr": "mag_out mag_in charge",
    "lmg": "cover_open box_out box_in belt cover_close charge",
}
SHARED = """
mech.dry_fire mech/dry_fire 2 8
mech.fire_mode mech/fire_mode 1 6
mech.overheat mech/overheat 1 16
mech.inspect mech/inspect 2 6
casing.brass casing/brass 4 10
casing.shell casing/shell 2 10
impact.stone impact/stone 3 24
impact.dirt impact/dirt 3 20
impact.wood impact/wood 3 24
impact.metal impact/metal 3 32
impact.glass impact/glass 3 24
impact.water impact/water 3 20
impact.flesh impact/flesh 3 16
impact.soft impact/soft 3 16
bullet.ricochet bullet/ricochet 4 40
bullet.whiz bullet/whiz 3 12
hit.marker hit/marker 1 4
hit.headshot hit/headshot 1 4
hit.kill hit/kill 1 4
ui.attachment_install ui/attachment_install 1 4
ui.attachment_remove ui/attachment_remove 1 4
ui.click ui/click 1 4
ui.skin_apply ui/skin_apply 1 4
ui.gunsmith_open ui/gunsmith_open 1 4
"""

# category -> (duration range s, peak window dBFS)
CATEGORY = {
    "fire": ((0.6, 1.6), (-2.0, -0.3)),
    "fire_far": ((1.5, 3.0), (-2.0, -0.3)),
    "fire_suppressed": ((0.3, 0.6), (-4.0, -0.3)),
    "equip": ((0.3, 0.6), (-12.5, -7.5)),
    "reload": ((0.2, 1.2), (-12.5, -7.5)),
    "mech": ((0.15, 1.6), (-12.5, -7.5)),
    "casing": ((0.3, 1.0), (-12.5, -7.5)),
    "impact": ((0.25, 1.0), (-5.0, -3.0)),
    "bullet": ((0.3, 1.0), (-5.0, -2.0)),
    "hit": ((0.03, 0.125), (-12.5, -7.5)),
    "ui": ((0.03, 1.2), (-12.5, -7.5)),
}


def expected_events() -> dict:
    sub = "subtitles.calibercraft."
    exp = {}
    for w, mech in WEAPON_MECH.items():
        evs = [("fire", 4, 48, "weapon.fire", "fire"), ("fire_far", 2, 192, "weapon.fire", "fire_far"),
               ("fire_suppressed", 3, 16, "weapon.fire_suppressed", "fire_suppressed"),
               ("equip", 1, 8, "weapon.equip", "equip")]
        for m in mech.split():
            evs.append((m, 2 if (w, m) == ("pump_shotgun", "shell_insert") else 1, 12, "weapon.reload", "reload"))
        for ev, count, att, s, cat in evs:
            exp[f"weapon.{w}.{ev}"] = dict(files=[f"weapon/{w}/{ev}_{i}" for i in range(1, count + 1)],
                                          att=att, subtitle=sub + s, cat=cat)
    for line in SHARED.strip().splitlines():
        name, stem, count, att = line.split()
        count, att = int(count), int(att)
        files = [stem] if count == 1 else [f"{stem}_{i}" for i in range(1, count + 1)]
        top = name.split(".")[0]
        exp[name] = dict(files=files, att=att, subtitle=None if top == "ui" else sub + name, cat=top)
    return exp


def probe(path: Path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                          "stream=codec_name,channels,sample_rate:format=format_name,duration",
                          "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def granule_samples(path: Path) -> int:
    """Exact PCM length from the last Ogg page's granule position (what stb_vorbis/Minecraft honours;
    ffmpeg's decoder mis-trims very short single-page streams)."""
    d = path.read_bytes()
    i, g = 0, -1
    while True:
        j = d.find(b"OggS", i)
        if j < 0:
            break
        gp = int.from_bytes(d[j + 6:j + 14], "little", signed=True)
        if gp >= 0:
            g = gp
        nseg = d[j + 26]
        i = j + 27 + nseg + sum(d[j + 27:j + 27 + nseg])
    return g


def decode(path: Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(SR), "pipe:1"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype="<f4").astype(np.float64)


def db(x: float) -> float:
    return 20.0 * np.log10(max(x, 1e-12))


def main() -> int:
    errors: list[str] = []
    warns: list[str] = []
    exp = expected_events()

    try:
        sj = json.loads(SOUNDS_JSON.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"FAIL: sounds.json unreadable: {e}")
        return 1
    try:
        subs = json.loads(SUBTITLES_JSON.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"FAIL: subtitles_en_us.json unreadable: {e}")
        return 1

    missing = sorted(set(exp) - set(sj))
    extra = sorted(set(sj) - set(exp))
    if missing:
        errors.append(f"events missing from sounds.json: {missing}")
    if extra:
        errors.append(f"unexpected events in sounds.json: {extra}")

    referenced: dict[Path, str] = {}
    for name, e in exp.items():
        if name not in sj:
            continue
        entry = sj[name]
        sounds = entry.get("sounds", [])
        names = [s.get("name") if isinstance(s, dict) else s for s in sounds]
        want = [f"{NS}:{f}" for f in e["files"]]
        if names != want:
            errors.append(f"{name}: sound names {names} != {want}")
        for s in sounds:
            if not isinstance(s, dict) or s.get("attenuation_distance") != e["att"]:
                errors.append(f"{name}: attenuation_distance should be {e['att']} in {s}")
            if isinstance(s, dict) and s.get("type", "file") != "file":
                errors.append(f"{name}: unexpected type in {s}")
        if e["subtitle"] is None:
            if "subtitle" in entry:
                errors.append(f"{name}: UI event must not have a subtitle")
        else:
            if entry.get("subtitle") != e["subtitle"]:
                errors.append(f"{name}: subtitle {entry.get('subtitle')} != {e['subtitle']}")
            if not str(subs.get(e["subtitle"], "")).strip():
                errors.append(f"{name}: no English text for {e['subtitle']} in subtitles_en_us.json")
        for f in e["files"]:
            referenced[SOUND_DIR / f"{f}.ogg"] = e["cat"]

    used_keys = {e["subtitle"] for e in exp.values() if e["subtitle"]}
    for k in sorted(set(subs) - used_keys):
        warns.append(f"subtitles_en_us.json has unused key {k}")

    on_disk = set(SOUND_DIR.rglob("*.ogg"))
    for p in sorted(set(referenced) - on_disk):
        errors.append(f"missing file {p.relative_to(REPO)}")
    for p in sorted(on_disk - set(referenced)):
        errors.append(f"unreferenced file {p.relative_to(REPO)}")

    stats = defaultdict(list)
    total_bytes = 0
    for path, cat in sorted(referenced.items()):
        if not path.exists():
            continue
        rel = str(path.relative_to(SOUND_DIR))
        total_bytes += path.stat().st_size
        info = probe(path)
        st = info.get("streams", [{}])
        fmt = info.get("format", {}).get("format_name", "")
        if len(st) != 1 or st[0].get("codec_name") != "vorbis" or int(st[0].get("channels", 0)) != 1 \
                or int(st[0].get("sample_rate", 0)) != SR or "ogg" not in fmt:
            errors.append(f"{rel}: not mono 44.1 kHz Ogg Vorbis: {info}")
        x = decode(path)
        n = granule_samples(path)
        if n <= 0:
            errors.append(f"{rel}: no granule position")
            n = len(x)
        x = x[:n]
        dur = n / SR
        pk = float(np.max(np.abs(x))) if len(x) else 0.0
        rms = float(np.sqrt(np.mean(x ** 2))) if len(x) else 0.0
        dc = float(np.mean(x)) if len(x) else 0.0
        head = float(np.max(np.abs(x[:int(0.0005 * SR)]))) if len(x) else 0.0
        tail = float(np.sqrt(np.mean(x[-int(0.005 * SR):] ** 2))) if len(x) else 0.0
        (dmin, dmax), (pmin, pmax) = CATEGORY[cat]
        if not (dmin - 0.005 <= dur <= dmax + 0.005):
            errors.append(f"{rel}: duration {dur:.3f}s outside {dmin}-{dmax}s")
        if pk >= 0.999:
            errors.append(f"{rel}: clipping (peak {pk:.4f})")
        if not (pmin <= db(pk) <= pmax):
            errors.append(f"{rel}: peak {db(pk):.1f} dBFS outside {pmin}..{pmax}")
        if abs(dc) > 0.002:
            errors.append(f"{rel}: DC offset {dc:.4f}")
        if head > 0.01:
            errors.append(f"{rel}: does not start from silence (first 0.5 ms peak {head:.3f})")
        if db(tail) > -55.0:
            errors.append(f"{rel}: tail not faded (last 5 ms RMS {db(tail):.1f} dBFS)")
        stats[cat].append((dur, db(pk), db(rms)))

    print(f"{'category':16s} {'files':>5s} {'duration s':>13s} {'peak dBFS':>15s} {'RMS dBFS':>15s}")
    for cat in CATEGORY:
        rows = stats.get(cat, [])
        if not rows:
            continue
        a = np.array(rows)
        print(f"{cat:16s} {len(rows):5d} {a[:, 0].min():6.2f}-{a[:, 0].max():<6.2f} "
              f"{a[:, 1].min():7.1f}..{a[:, 1].max():<6.1f} {a[:, 2].min():7.1f}..{a[:, 2].max():<6.1f}")
    nfiles = sum(len(v) for v in stats.values())
    print(f"{len(sj)} events, {nfiles} files, {total_bytes / 1e6:.2f} MB total")
    if total_bytes / 1e6 > SIZE_BUDGET_MB:
        errors.append(f"total size {total_bytes / 1e6:.2f} MB exceeds {SIZE_BUDGET_MB} MB")

    for w in warns:
        print(f"WARN: {w}")
    for e in errors:
        print(f"FAIL: {e}")
    print("OK" if not errors else f"{len(errors)} problem(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
