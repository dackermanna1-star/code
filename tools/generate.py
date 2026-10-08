#!/usr/bin/env python3
"""Regenerates every generated resource of the Portal Gun Multiverse mod.

    cd tools && python3 generate.py            # everything (sounds are cached)
    python3 generate.py --sounds               # also re-synthesize sounds
    python3 generate.py --only sporewood,abyssia   # restrict dimensions (for quick iteration)

All files under src/main/resources/assets/portalgun and data/portalgun are generated - edit the
generators/specs in tools/gen instead of the output.
"""
import argparse
import json
import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
RES = os.path.join(ROOT, "src", "main", "resources")
ASSETS = os.path.join(RES, "assets", "portalgun")
DATA = os.path.join(RES, "data", "portalgun")
SOUND_DIR = os.path.join(ASSETS, "sounds")
SOUND_CACHE = os.path.join(HERE, ".cache", "sounds")


def _clean():
    for d in (ASSETS, DATA):
        if os.path.isdir(d):
            for name in os.listdir(d):
                p = os.path.join(d, name)
                if os.path.abspath(p) == os.path.abspath(SOUND_DIR):
                    continue
                if name == "icon.png":
                    continue
                shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    os.makedirs(ASSETS, exist_ok=True)
    os.makedirs(DATA, exist_ok=True)


def _sounds(force):
    """Sound synthesis is slow, so results are cached in tools/.cache/sounds and copied in."""
    try:
        from gen import sounds
    except ImportError:
        print("  (gen.sounds not available yet - skipping sounds)")
        return {}, {}
    cache_json = os.path.join(SOUND_CACHE, "sounds.json")
    if force or not os.path.exists(cache_json):
        if os.path.isdir(SOUND_CACHE):
            shutil.rmtree(SOUND_CACHE)
        os.makedirs(SOUND_CACHE, exist_ok=True)
        table = sounds.write_all(SOUND_CACHE)
        with open(cache_json, "w") as f:
            json.dump(table, f, indent=2)
    with open(cache_json) as f:
        table = json.load(f)
    if os.path.isdir(SOUND_DIR):
        shutil.rmtree(SOUND_DIR)
    shutil.copytree(SOUND_CACHE, SOUND_DIR, ignore=shutil.ignore_patterns("sounds.json"))
    return table, getattr(sounds, "SUBTITLES", {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sounds", action="store_true", help="re-synthesize sounds")
    ap.add_argument("--only", default="", help="comma separated dimension ids to generate (debug)")
    args = ap.parse_args()
    t0 = time.time()
    _clean()
    lang = {}

    try:
        from gen import textures as tex
    except ImportError:
        tex = None
        print("  (gen.textures not available yet - using placeholder gun textures)")

    from gen import core_assets
    core_assets.write(RES, lang, tex)

    sound_table, subtitles = _sounds(args.sounds)
    lang.update(subtitles)

    dims = []
    try:
        from gen import content
    except ImportError:
        content = None
        print("  (gen.content not available yet - no dimensions generated)")
    spec = {"dimensions": [], "blocks": [], "items": [], "creatures": []}
    if content is not None and not hasattr(content, "build"):
        print("  (gen.content.build not implemented yet - no dimensions generated)")
        content = None
    if content is not None:
        only = [s for s in args.only.split(",") if s]
        spec = content.build(RES, lang, sound_table, only=only)
        dims = spec["dimensions"]

    core_assets.advancements(DATA, lang, dims)

    os.makedirs(os.path.join(RES, "portalgun"), exist_ok=True)
    with open(os.path.join(RES, "portalgun", "content.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=1)
    if sound_table:
        with open(os.path.join(ASSETS, "sounds.json"), "w") as f:
            json.dump(sound_table, f, indent=2)
    os.makedirs(os.path.join(ASSETS, "lang"), exist_ok=True)
    with open(os.path.join(ASSETS, "lang", "en_us.json"), "w", encoding="utf-8") as f:
        json.dump(dict(sorted(lang.items())), f, indent=1, ensure_ascii=False)
    print(f"Generated {len(dims)} dimensions, {len(spec['blocks'])} blocks, {len(spec['items'])} items, "
          f"{len(spec['creatures'])} creatures in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
