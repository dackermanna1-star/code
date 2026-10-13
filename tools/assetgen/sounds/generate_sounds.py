#!/usr/bin/env python3
"""Generate every CaliberCraft Arsenal sound procedurally (numpy + scipy, no external audio).

Run from the repository root:

    python3 tools/assetgen/sounds/generate_sounds.py            # everything
    python3 tools/assetgen/sounds/generate_sounds.py --only 'weapon/ar15/*'   # subset (glob on file path)
    python3 tools/assetgen/sounds/generate_sounds.py --wav-dir /tmp/wavs     # also dump float WAVs

Outputs
  src/main/resources/assets/calibercraft/sounds/**.ogg   mono 44.1 kHz Ogg Vorbis (libvorbis -q:a 5)
  src/main/resources/assets/calibercraft/sounds.json
  tools/assetgen/sounds/subtitles_en_us.json             subtitle key -> English text

Every file gets its own RNG seeded from a CRC of its path, so output is bit-for-bit reproducible
(ffmpeg runs with +bitexact so the Ogg stream serial and encoder tag are deterministic too).
See README.md in this folder for the binding spec.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import subprocess
import sys
import zlib
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import sfx_guns as guns  # noqa: E402
import sfx_shared as shared  # noqa: E402
from sfx_dsp import SR, lin2db, peak, rms  # noqa: E402

REPO = HERE.parents[2]
ASSETS = REPO / "src" / "main" / "resources" / "assets" / "calibercraft"
SOUND_DIR = ASSETS / "sounds"
SOUNDS_JSON = ASSETS / "sounds.json"
SUBTITLES_JSON = HERE / "subtitles_en_us.json"
NAMESPACE = "calibercraft"
SEED_SALT = 0xCA11BE5

# ---------------------------------------------------------------------------------------------
# spec tables (tools/assetgen/sounds/README.md)
# ---------------------------------------------------------------------------------------------
WEAPONS = ["m9", "revolver", "vector9", "mp5", "ar15", "ak", "bullpup", "pump_shotgun", "auto_shotgun",
           "sniper", "dmr", "lmg"]

WEAPON_MECH = {
    "m9": ["mag_out", "mag_in", "slide_back", "slide_release"],
    "revolver": ["cylinder_open", "eject", "speedloader", "cylinder_close", "hammer"],
    "vector9": ["mag_out", "mag_in", "charge"],
    "mp5": ["mag_out", "mag_in", "charge_back", "charge_slap"],
    "ar15": ["mag_out", "mag_in", "charge", "bolt_release"],
    "ak": ["mag_out", "mag_in", "charge"],
    "bullpup": ["mag_out", "mag_in", "charge"],
    "pump_shotgun": ["pump_back", "pump_forward", "shell_insert"],
    "auto_shotgun": ["mag_out", "mag_in", "charge"],
    "sniper": ["bolt_up", "bolt_back", "bolt_forward", "bolt_down", "mag_out", "mag_in"],
    "dmr": ["mag_out", "mag_in", "charge"],
    "lmg": ["cover_open", "box_out", "box_in", "belt", "cover_close", "charge"],
}
MECH_VARIANTS = {("pump_shotgun", "shell_insert"): 2}

SUB = "subtitles." + NAMESPACE + "."
SUBTITLES = {
    SUB + "weapon.fire": "Gunshot",
    SUB + "weapon.fire_suppressed": "Suppressed gunshot",
    SUB + "weapon.reload": "Weapon reloads",
    SUB + "weapon.equip": "Weapon handled",
    SUB + "mech.dry_fire": "Trigger clicks",
    SUB + "mech.fire_mode": "Fire mode switched",
    SUB + "mech.overheat": "Weapon overheats",
    SUB + "mech.inspect": "Weapon inspected",
    SUB + "casing.brass": "Casing clinks",
    SUB + "casing.shell": "Shell casing bounces",
    SUB + "impact.stone": "Bullet hits stone",
    SUB + "impact.dirt": "Bullet hits dirt",
    SUB + "impact.wood": "Bullet hits wood",
    SUB + "impact.metal": "Bullet hits metal",
    SUB + "impact.glass": "Bullet hits glass",
    SUB + "impact.water": "Bullet hits water",
    SUB + "impact.flesh": "Bullet hits flesh",
    SUB + "impact.soft": "Bullet hits something soft",
    SUB + "bullet.ricochet": "Bullet ricochets",
    SUB + "bullet.whiz": "Bullet whizzes past",
}

# shared events: (event, file stem, variants, attenuation, builder, has_subtitle)
SHARED = [
    ("mech.dry_fire", "mech/dry_fire", 2, 8, shared.dry_fire, True),
    ("mech.fire_mode", "mech/fire_mode", 1, 6, shared.fire_mode, True),
    ("mech.overheat", "mech/overheat", 1, 16, shared.overheat, True),
    ("mech.inspect", "mech/inspect", 2, 6, shared.inspect, True),
    ("casing.brass", "casing/brass", 4, 10, shared.casing_brass, True),
    ("casing.shell", "casing/shell", 2, 10, shared.casing_shell, True),
    ("impact.stone", "impact/stone", 3, 24, shared.impact_stone, True),
    ("impact.dirt", "impact/dirt", 3, 20, shared.impact_dirt, True),
    ("impact.wood", "impact/wood", 3, 24, shared.impact_wood, True),
    ("impact.metal", "impact/metal", 3, 32, shared.impact_metal, True),
    ("impact.glass", "impact/glass", 3, 24, shared.impact_glass, True),
    ("impact.water", "impact/water", 3, 20, shared.impact_water, True),
    ("impact.flesh", "impact/flesh", 3, 16, shared.impact_flesh, True),
    ("impact.soft", "impact/soft", 3, 16, shared.impact_soft, True),
    ("bullet.ricochet", "bullet/ricochet", 4, 40, shared.ricochet, True),
    ("bullet.whiz", "bullet/whiz", 3, 12, shared.whiz, True),
    ("hit.marker", "hit/marker", 1, 4, shared.hit_marker, False),
    ("hit.headshot", "hit/headshot", 1, 4, shared.hit_headshot, False),
    ("hit.kill", "hit/kill", 1, 4, shared.hit_kill, False),
    ("ui.attachment_install", "ui/attachment_install", 1, 4, shared.ui_attachment_install, False),
    ("ui.attachment_remove", "ui/attachment_remove", 1, 4, shared.ui_attachment_remove, False),
    ("ui.click", "ui/click", 1, 4, shared.ui_click, False),
    ("ui.skin_apply", "ui/skin_apply", 1, 4, shared.ui_skin_apply, False),
    ("ui.gunsmith_open", "ui/gunsmith_open", 1, 4, shared.ui_gunsmith_open, False),
]


@dataclass
class Event:
    name: str
    attenuation: int
    subtitle: str | None
    files: list = field(default_factory=list)  # list of (file_rel_without_ext, job)
    stream: bool | None = None


def build_registry() -> list[Event]:
    events: list[Event] = []
    for w in WEAPONS:
        per_weapon = [
            ("fire", 4, 48, "weapon.fire"),
            ("fire_far", 2, 192, "weapon.fire"),
            ("fire_suppressed", 3, 16, "weapon.fire_suppressed"),
            ("equip", 1, 8, "weapon.equip"),
        ] + [(m, MECH_VARIANTS.get((w, m), 1), 12, "weapon.reload") for m in WEAPON_MECH[w]]
        for ev, count, att, sub in per_weapon:
            e = Event(f"weapon.{w}.{ev}", att, SUB + sub)
            for i in range(1, count + 1):
                e.files.append((f"weapon/{w}/{ev}_{i}", ("weapon", w, ev)))
            events.append(e)
    for name, stem, count, att, _fn, has_sub in SHARED:
        e = Event(name, att, (SUB + name) if has_sub else None)
        if count == 1:
            e.files.append((stem, ("shared", name, "")))
        else:
            for i in range(1, count + 1):
                e.files.append((f"{stem}_{i}", ("shared", name, "")))
        events.append(e)
    return events


_SHARED_FN = {name: fn for name, _s, _c, _a, fn, _h in SHARED}


def seed_for(rel: str) -> int:
    return (zlib.crc32(rel.encode("utf-8")) ^ SEED_SALT) & 0xFFFFFFFF


def synthesize(rel: str, job) -> np.ndarray:
    rng = np.random.default_rng(seed_for(rel))
    kind, a, b = job
    if kind == "weapon":
        g = guns.GUNS[a]
        if b == "fire":
            return guns.render_fire(g, rng)
        if b == "fire_far":
            return guns.render_far(g, rng)
        if b == "fire_suppressed":
            return guns.render_suppressed(g, rng)
        if b == "equip":
            return guns.render_equip(g, rng)
        return guns.render_mech(a, b, rng)
    return _SHARED_FN[a](rng)


def encode_ogg(x: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.clip(x, -1.0, 1.0).astype("<f4").tobytes()
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
           "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
           "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact",
           "-c:a", "libvorbis", "-q:a", "5", "-ac", "1", "-ar", str(SR), str(path)]
    subprocess.run(cmd, input=data, check=True)


def decode_peak(path: Path) -> float:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "pipe:1"],
                         capture_output=True, check=True).stdout
    y = np.frombuffer(raw, dtype="<f4")
    return float(np.max(np.abs(y))) if len(y) else 0.0


def encode_true_peak(x: np.ndarray, path: Path) -> np.ndarray:
    """Encode, then correct the level so the *decoded* peak lands on the synthesized target
    (Vorbis overshoots on sharp transients and sometimes undershoots on very peaky clicks).
    Accepts -0.6..+0.2 dB; otherwise keeps the best attempt, preferring undershoot."""
    tdb = lin2db(peak(x))
    best = None
    scale = 1.0
    for _ in range(6):
        encode_ogg(x * scale, path)
        err = lin2db(decode_peak(path)) - tdb
        score = abs(err) if err <= 0.2 else 10.0 + err
        if best is None or score < best[0]:
            best = (score, scale)
        if -0.6 <= err <= 0.2:
            return x * scale
        scale *= 10.0 ** (-(err + (0.15 if err > 0 else -0.1)) / 20.0)
    encode_ogg(x * best[1], path)
    return x * best[1]


def write_wav(x: np.ndarray, path: Path) -> None:
    from scipy.io import wavfile
    path.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(str(path), SR, x.astype(np.float32))


def render_job(args):
    rel, job, wav_dir = args
    x = synthesize(rel, job)
    if not np.all(np.isfinite(x)):
        raise RuntimeError(f"non-finite samples in {rel}")
    x = encode_true_peak(x, SOUND_DIR / f"{rel}.ogg")
    if wav_dir:
        write_wav(x, Path(wav_dir) / f"{rel}.wav")
    return rel, len(x) / SR, lin2db(peak(x)), lin2db(rms(x))


def sounds_json(events: list[Event]) -> dict:
    out = {}
    for e in events:
        entry = {}
        if e.subtitle:
            entry["subtitle"] = e.subtitle
        sounds = []
        for rel, _job in e.files:
            s = {"name": f"{NAMESPACE}:{rel}", "attenuation_distance": e.attenuation}
            sounds.append(s)
        entry["sounds"] = sounds
        out[e.name] = entry
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", action="append", default=[], help="glob(s) on file path, e.g. 'weapon/ak/*'")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--wav-dir", default=None, help="also write float WAVs here (for inspection)")
    args = ap.parse_args(argv)

    events = build_registry()
    jobs = [(rel, job, args.wav_dir) for e in events for rel, job in e.files]
    if args.only:
        jobs = [j for j in jobs if any(fnmatch.fnmatch(j[0], pat) for pat in args.only)]
    print(f"rendering {len(jobs)} files with {args.jobs} workers ...", flush=True)

    results = []
    if args.jobs > 1 and len(jobs) > 1:
        with ProcessPoolExecutor(max_workers=args.jobs) as ex:
            for r in ex.map(render_job, jobs, chunksize=1):
                results.append(r)
    else:
        results = [render_job(j) for j in jobs]
    for rel, dur, pk, rm in results:
        print(f"  {rel:42s} {dur:5.2f}s  peak {pk:6.1f} dBFS  rms {rm:6.1f} dBFS")

    # metadata is always written in full (it only depends on the registry)
    SOUNDS_JSON.write_text(json.dumps(sounds_json(events), indent=2) + "\n", encoding="utf-8")
    used = []
    for e in events:
        if e.subtitle and e.subtitle not in used:
            used.append(e.subtitle)
    SUBTITLES_JSON.write_text(json.dumps({k: SUBTITLES[k] for k in used}, indent=2) + "\n", encoding="utf-8")

    if not args.only:  # prune stale generated files
        expected = {SOUND_DIR / f"{rel}.ogg" for e in events for rel, _ in e.files}
        for f in SOUND_DIR.rglob("*.ogg"):
            if f not in expected:
                print(f"  removing stale {f.relative_to(SOUND_DIR)}")
                f.unlink()
        for d in sorted((p for p in SOUND_DIR.rglob("*") if p.is_dir()), reverse=True):
            if not any(d.iterdir()):
                d.rmdir()

    total = sum(f.stat().st_size for f in SOUND_DIR.rglob("*.ogg"))
    count = sum(1 for _ in SOUND_DIR.rglob("*.ogg"))
    print(f"wrote {SOUNDS_JSON.relative_to(REPO)} ({len(events)} events), "
          f"{SUBTITLES_JSON.relative_to(REPO)}; {count} .ogg files, {total / 1e6:.2f} MB total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
